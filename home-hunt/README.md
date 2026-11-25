# Home Hunt · Hudson–Trinity (v2)

Shared, mobile-first board for Mark & Nicole: new-criteria matches, Leaflet map (Esri World Dark Gray, no API key), and **synced** favorites / Not-interested / notes.

**Live:** https://mjlembo88.github.io/Real-Estate/home-hunt/

## Files

| File | Role |
|------|------|
| `index.html` | Shell + household sign-in screen |
| `app.js` | Filters, cards, map, sync client |
| `styles.css` | Dark mobile-first UI |
| `listings.json` | **Home Hunt owns this** — current new-criteria data (Listing Scout pass 5+) |
| `listings-archive-2026-09-20.json` | 9/20 data (old criteria). Only shown under the “9/20 archive” chip |
| `SCHEMA.md` | Field contract |
| `sql/001_household_sync.sql` | Supabase schema (tables, RLS, RPCs) — no secrets |

## Criteria (strip)
Buy <$600k · Hudson–Trinity band (Hudson, Bayonet Pt, NPR east of US-19, Seven Springs, Trinity, SR-52/Little/Starkey) · CBS · 3+bd/2+ba · ≥1 ac · workshop/detached garage/barn · Flood zone X

## Views
- **Matches** (default) — `match` starts with `hard` or `weak`, not dead/sold, not dismissed
- **Hard / Weak** — by match level
- **Shop / barn** — `outbuilding` set, `workshop` evidence, or garage text mentions shop/barn/detached
- **★ Favorites / Notes / Not interested** — synced household state (Not interested has Restore)
- **Open houses**
- **9/20 archive** — loads `listings-archive-2026-09-20.json` with a banner; never shown by default

## Sync & privacy
- Supabase project `home-hunt` (ref `klvgcwzofvxsqtjvmgof`, free plan). Tables `household_members`, `household_tokens`, `listing_state` all have RLS on; anon has **no** table grants.
- Each person has a personal revocable household link (`…/home-hunt/#k=<code>`). The code is only sent to token-checked `SECURITY DEFINER` RPCs (`hh_whoami`, `hh_get_state`, `hh_set_state`, `hh_merge_local`); only its SHA-256 is stored. The `#k=` part never reaches GitHub and is stripped from the address bar after first load; the code is kept in that phone’s localStorage.
- Codes live only on the box in `/home/box/home-hunt/household-tokens.json` (chmod 600). Never in this repo.
- Sync = refresh on focus/visibility + every 60 s while open.
- First sign-in on a browser merges old v1 localStorage (`home-hunt-favorites-v1`, `home-hunt-dismissed-v1`) into the shared store — only turns flags on, never clears anything or touches notes. v1 keys are left in place.
- The publishable key in `app.js` is public by design.
- If Supabase Auth email sign-in is ever configured (Site URL + custom SMTP), `listing_state` already has `authenticated` RLS policies keyed on `auth.jwt()->>'email'` in `household_members`.

## Data drop
Home Hunt overwrites `listings.json` (`{updatedAt, schemaVersion: 2, listings: []}`). Empty list shows “Waiting for new-criteria listings”.
