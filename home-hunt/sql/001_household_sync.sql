-- Home Hunt v2: household sync (favorites / not-interested / notes)
-- Access model: RLS on every table, no anon table access.
-- Today: per-person revocable household tokens checked by SECURITY DEFINER RPCs.
-- Future: if Supabase Auth email sign-in is configured, the authenticated-role
-- policies below already allow household members (by JWT email) to use listing_state.

create table public.household_members (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  display_name text,
  added_at timestamptz not null default now()
);

create table public.household_tokens (
  id bigint generated always as identity primary key,
  member_email text not null references public.household_members(email) on update cascade on delete cascade,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.listing_state (
  listing_id text primary key check (char_length(listing_id) between 1 and 200),
  favorite boolean not null default false,
  dismissed boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.household_members enable row level security;
alter table public.household_tokens  enable row level security;
alter table public.listing_state     enable row level security;

revoke all on public.household_members from anon, authenticated;
revoke all on public.household_tokens  from anon, authenticated;
revoke all on public.listing_state     from anon;
revoke all on public.listing_state     from authenticated;
grant select, insert, update on public.listing_state to authenticated;

-- Membership check for the (future) Supabase Auth path
create or replace function public.hh_is_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.hh_is_member() from public, anon;
grant execute on function public.hh_is_member() to authenticated;

create policy "household select" on public.listing_state for select to authenticated using ((select public.hh_is_member()));
create policy "household insert" on public.listing_state for insert to authenticated with check ((select public.hh_is_member()));
create policy "household update" on public.listing_state for update to authenticated using ((select public.hh_is_member())) with check ((select public.hh_is_member()));

-- Token -> member email (internal only)
create or replace function public.hh_member_for_token(p_token text)
returns text language sql stable security definer set search_path = ''
as $$
  select t.member_email
  from public.household_tokens t
  where p_token is not null
    and char_length(p_token) between 32 and 200
    and t.revoked_at is null
    and t.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  limit 1;
$$;
revoke all on function public.hh_member_for_token(text) from public, anon, authenticated;

create or replace function public.hh_require_member(p_token text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_email text;
begin
  v_email := public.hh_member_for_token(p_token);
  if v_email is null then
    raise exception 'not authorized' using errcode = '28000';
  end if;
  return v_email;
end;
$$;
revoke all on function public.hh_require_member(text) from public, anon, authenticated;

create or replace function public.hh_whoami(p_token text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare v_email text; v_name text;
begin
  v_email := public.hh_require_member(p_token);
  select m.display_name into v_name from public.household_members m where m.email = v_email;
  return json_build_object('email', v_email, 'name', coalesce(v_name, split_part(v_email, '@', 1)));
end;
$$;

create or replace function public.hh_get_state(p_token text)
returns setof public.listing_state language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.hh_require_member(p_token);
  return query select * from public.listing_state;
end;
$$;

-- Null args = leave unchanged. Empty-string note clears it.
create or replace function public.hh_set_state(
  p_token text, p_listing_id text,
  p_favorite boolean default null, p_dismissed boolean default null, p_note text default null)
returns public.listing_state language plpgsql volatile security definer set search_path = ''
as $$
declare v_email text; v_row public.listing_state; v_note text;
begin
  v_email := public.hh_require_member(p_token);
  if p_listing_id is null or char_length(p_listing_id) not between 1 and 200 then
    raise exception 'bad listing id' using errcode = '22023';
  end if;
  v_note := nullif(btrim(p_note), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note too long (max 500)' using errcode = '22001';
  end if;
  insert into public.listing_state as s (listing_id, favorite, dismissed, note, updated_by, updated_at)
  values (p_listing_id, coalesce(p_favorite, false), coalesce(p_dismissed, false), v_note, v_email, now())
  on conflict (listing_id) do update set
    favorite   = coalesce(p_favorite, s.favorite),
    dismissed  = coalesce(p_dismissed, s.dismissed),
    note       = case when p_note is null then s.note else v_note end,
    updated_by = v_email,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- One-time merge of a browser's old localStorage sets. Only ever turns flags ON;
-- never clears a flag or touches a note.
create or replace function public.hh_merge_local(p_token text, p_favorites text[], p_dismissed text[])
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare v_email text; v_n integer := 0; v_c integer;
begin
  v_email := public.hh_require_member(p_token);
  if coalesce(array_length(p_favorites, 1), 0) > 2000 or coalesce(array_length(p_dismissed, 1), 0) > 2000 then
    raise exception 'too many ids' using errcode = '22023';
  end if;
  insert into public.listing_state as s (listing_id, favorite, updated_by)
  select distinct x, true, v_email from unnest(coalesce(p_favorites, '{}')) x
  where char_length(x) between 1 and 200
  on conflict (listing_id) do update set favorite = true, updated_by = v_email, updated_at = now()
  where s.favorite = false;
  get diagnostics v_c = row_count; v_n := v_n + v_c;
  insert into public.listing_state as s (listing_id, dismissed, updated_by)
  select distinct x, true, v_email from unnest(coalesce(p_dismissed, '{}')) x
  where char_length(x) between 1 and 200
  on conflict (listing_id) do update set dismissed = true, updated_by = v_email, updated_at = now()
  where s.dismissed = false;
  get diagnostics v_c = row_count; v_n := v_n + v_c;
  return v_n;
end;
$$;

revoke all on function public.hh_whoami(text) from public;
revoke all on function public.hh_get_state(text) from public;
revoke all on function public.hh_set_state(text, text, boolean, boolean, text) from public;
revoke all on function public.hh_merge_local(text, text[], text[]) from public;
grant execute on function public.hh_whoami(text) to anon, authenticated;
grant execute on function public.hh_get_state(text) to anon, authenticated;
grant execute on function public.hh_set_state(text, text, boolean, boolean, text) to anon, authenticated;
grant execute on function public.hh_merge_local(text, text[], text[]) to anon, authenticated;

insert into public.household_members (email, display_name) values
  ('mlembo88@gmail.com', 'Mark'),
  ('nlembo91@gmail.com', 'Nicole');
