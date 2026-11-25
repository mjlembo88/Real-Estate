(() => {
  "use strict";

  // —— Sync backend (Supabase project "home-hunt", ref klvgcwzofvxsqtjvmgof) ——
  // The publishable key is public by design. All table access is blocked for anon;
  // the only door is token-checked SECURITY DEFINER RPCs (hh_*).
  const SB_URL = "https://klvgcwzofvxsqtjvmgof.supabase.co/rest/v1/rpc/";
  const SB_KEY = "sb_publishable_ansoP2WK76NZa0V4oJQqrw__QbtzmeV";

  const KEY_STORE = "home-hunt-household-key-v2";
  const BROWSE_ONLY = "home-hunt-browse-only-v2";
  const MIGRATED_PREFIX = "home-hunt-migrated-v2:";
  // v1 browser-only keys (read for one-time merge; never deleted)
  const V1_FAVORITES = "home-hunt-favorites-v1";
  const V1_DISMISSED = "home-hunt-dismissed-v1";

  const DATA_FILE = "listings.json";
  const ARCHIVE_FILE = "listings-archive-2026-09-20.json";
  const POLL_MS = 60000;

  const $ = (id) => document.getElementById(id);
  const els = {
    updated: $("updated"), count: $("count"), list: $("list"), filters: $("filters"),
    reset: $("f-reset"), map: $("map"), toast: $("toast"), who: $("who"), sync: $("sync"),
    gate: $("gate"), gateForm: $("gate-form"), gateCode: $("gate-code"), gateErr: $("gate-err"),
    gateSkip: $("gate-skip"), archiveBanner: $("archive-banner"),
  };

  const state = { mode: "matches" };
  let current = { updatedAt: null, listings: [] };
  let archive = null; // lazy-loaded
  let token = null;
  let me = null; // {email, name}
  /** @type {Map<string, {favorite:boolean, dismissed:boolean, note:string|null, updated_by:string|null, updated_at:string}>} */
  const ls = new Map();
  let editingId = null;
  let map = null, markersLayer = null;
  const markerById = new Map();
  let toastTimer = null;
  let pollTimer = null;

  // ——— helpers ———
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

  async function rpc(fn, args) {
    const res = await fetch(SB_URL + fn, {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j && j.message) msg = j.message; } catch {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.json();
  }

  function setSync(text, isErr) {
    if (!els.sync) return;
    els.sync.textContent = text || "";
    els.sync.classList.toggle("err", !!isErr);
  }

  function toast(text, undoFn) {
    if (!els.toast) return;
    els.toast.hidden = false;
    els.toast.innerHTML = "";
    const label = document.createElement("span");
    label.textContent = text;
    els.toast.appendChild(label);
    if (undoFn) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast-undo"; b.textContent = "Undo";
      b.addEventListener("click", (e) => { e.stopPropagation(); hideToast(); undoFn(); });
      els.toast.appendChild(document.createTextNode(" · "));
      els.toast.appendChild(b);
    }
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (els.toast) { els.toast.hidden = true; els.toast.innerHTML = ""; }
  }

  // ——— sign-in ———
  function takeTokenFromHash() {
    const h = location.hash || "";
    const m = h.match(/[#&]k=([A-Za-z0-9_\-]{32,200})/);
    if (!m) return null;
    // Strip the key from the address bar/history right away.
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
    return m[1];
  }

  async function signIn(candidate, { fromGate = false } = {}) {
    try {
      const who = await rpc("hh_whoami", { p_token: candidate });
      token = candidate; me = who;
      lsSet(KEY_STORE, candidate); lsDel(BROWSE_ONLY);
      els.gate.hidden = true;
      renderWho();
      await migrateLocal();
      await pullState();
      startPolling();
      return true;
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        lsDel(KEY_STORE); token = null; me = null;
        showGate(fromGate ? "That code didn’t work (it may have been revoked)." : "Your saved sign-in no longer works. Ask Mark for a new link.");
      } else {
        // Network trouble: keep the key, try again on focus.
        token = candidate;
        setSync("offline — will retry", true);
        renderWho();
      }
      return false;
    }
  }

  function showGate(msg) {
    els.gate.hidden = false;
    els.gateErr.textContent = msg || "";
  }

  function signOut() {
    lsDel(KEY_STORE); token = null; me = null; ls.clear();
    stopPolling(); renderWho(); refresh(); showGate("");
  }

  function renderWho() {
    els.who.innerHTML = "";
    if (me) {
      const s = document.createElement("span");
      s.textContent = "Synced · " + (me.name || me.email);
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Sign out";
      b.addEventListener("click", signOut);
      els.who.append(s, b);
    } else {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Sign in to sync";
      b.addEventListener("click", () => showGate(""));
      els.who.appendChild(b);
    }
  }

  // One-time merge of this browser's v1 localStorage favorites/dismissed into the shared store.
  async function migrateLocal() {
    if (!me) return;
    const flag = MIGRATED_PREFIX + me.email;
    if (lsGet(flag)) return;
    const read = (k) => { try { const a = JSON.parse(lsGet(k) || "[]"); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; } };
    const favs = read(V1_FAVORITES), dis = read(V1_DISMISSED);
    if (!favs.length && !dis.length) { lsSet(flag, new Date().toISOString()); return; }
    try {
      const n = await rpc("hh_merge_local", { p_token: token, p_favorites: favs, p_dismissed: dis });
      lsSet(flag, new Date().toISOString());
      if (n > 0) toast("Merged " + n + " saved pick" + (n === 1 ? "" : "s") + " from this phone");
    } catch (err) { console.warn("merge failed; will retry next load", err.message); }
  }

  async function pullState() {
    if (!token || !me) return;
    try {
      const rows = await rpc("hh_get_state", { p_token: token });
      ls.clear();
      (rows || []).forEach((r) => ls.set(String(r.listing_id), r));
      setSync("synced " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      if (!editingId) refresh();
    } catch (err) {
      if (err.status === 403) { signOut(); showGate("Your access was revoked or expired."); return; }
      setSync("sync failed — retrying", true);
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => { if (document.visibilityState === "visible") pullState(); }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function stateOf(id) { return ls.get(String(id)) || { favorite: false, dismissed: false, note: null }; }
  const isFav = (id) => !!stateOf(id).favorite;
  const isDismissed = (id) => !!stateOf(id).dismissed;

  async function writeState(id, patch) {
    if (!token || !me) { showGate("Sign in to save favorites, Not-interested picks and notes."); return false; }
    const key = String(id);
    const before = ls.has(key) ? { ...ls.get(key) } : null;
    const optimistic = { ...stateOf(key), ...("favorite" in patch ? { favorite: patch.favorite } : {}),
      ...("dismissed" in patch ? { dismissed: patch.dismissed } : {}),
      ...("note" in patch ? { note: patch.note || null } : {}), updated_by: me.email };
    ls.set(key, optimistic);
    refresh();
    try {
      const row = await rpc("hh_set_state", {
        p_token: token, p_listing_id: key,
        p_favorite: "favorite" in patch ? patch.favorite : null,
        p_dismissed: "dismissed" in patch ? patch.dismissed : null,
        p_note: "note" in patch ? (patch.note || "") : null,
      });
      if (row && row.listing_id) ls.set(key, row);
      setSync("saved");
      refresh();
      return true;
    } catch (err) {
      if (before) ls.set(key, before); else ls.delete(key);
      refresh();
      toast("Couldn’t save: " + err.message);
      return false;
    }
  }

  // ——— listing helpers ———
  function matchLevel(item) {
    const m = String(item.match || "").trim().toLowerCase();
    if (m.startsWith("hard")) return "hard";
    if (m.startsWith("weak")) return "weak";
    return null;
  }
  const isGraveyard = (s) => ["dead", "sold"].includes(String(s || "").toLowerCase());
  function hasCoords(x) {
    const a = Number(x.lat), b = Number(x.lng);
    return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) && x.lat != null && x.lng != null;
  }
  function hasOpenHouse(x) {
    if (x.openHouseToday || x.open_house_today) return true;
    const oh = x.openHouse;
    if (oh == null) return false;
    if (typeof oh === "string") return oh.trim() !== "";
    if (typeof oh === "object") return Object.keys(oh).length > 0;
    return !!oh;
  }
  function hasShop(x) {
    const ob = x.outbuilding;
    if (ob === true) return true;
    if (typeof ob === "string" && ob.trim() && !/^(no|none|false|unknown)$/i.test(ob.trim())) return true;
    if (x.workshop != null && String(x.workshop).trim() !== "") return true;
    return /\b(workshop|shop|barn|detached)\b/i.test(String(x.garage || ""));
  }
  const fmtPrice = (n) => (n == null || n === "" || Number.isNaN(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const priceText = (x) => (x.priceLabel && String(x.priceLabel).trim() ? String(x.priceLabel).trim() : fmtPrice(x.price));
  function fmtUpdated(iso, label) {
    if (!iso) return (label || "Updated") + ": —";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Updated: " + iso;
    return (label || "Updated") + ": " + d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
  }
  const FLAG_LABELS = {
    construction_unverified: "CBS unverified",
    outbuilding_unverified: "Outbuilding unverified",
    x_shaded: "Zone X (shaded)",
    flood_unverified: "Flood zone unverified",
  };
  const flagLabel = (f) => FLAG_LABELS[f] || String(f).replace(/_/g, " ");
  function memberName(email) {
    if (!email) return "";
    if (me && email === me.email) return "you";
    if (/^mlembo88@/i.test(email)) return "Mark";
    if (/^nlembo91@/i.test(email)) return "Nicole";
    return email.split("@")[0];
  }

  function activeListings() {
    if (state.mode === "archive") return archive ? archive.listings || [] : [];
    return current.listings || [];
  }

  function applyFilters(items) {
    const mode = state.mode;
    return items.filter((x) => {
      const st = stateOf(x.id);
      if (mode === "dismissed") return !!st.dismissed;
      if (st.dismissed) return false;
      if (mode === "favorites") return !!st.favorite;
      if (mode === "notes") return !!(st.note && st.note.trim());
      if (isGraveyard(x.status)) return false;
      if (mode === "archive") return true;
      const lvl = matchLevel(x);
      if (!lvl) return false; // only new-criteria matches on the board
      if (mode === "hard") return lvl === "hard";
      if (mode === "weak") return lvl === "weak";
      if (mode === "shop") return hasShop(x);
      if (mode === "openhouses") return hasOpenHouse(x);
      return true; // matches
    });
  }

  function sortListings(items) {
    const rank = (x) => (matchLevel(x) === "hard" ? 0 : matchLevel(x) === "weak" ? 1 : 2);
    return items.slice().sort((a, b) => {
      const fa = isFav(a.id) ? 0 : 1, fb = isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const pa = a.price == null ? Infinity : Number(a.price), pb = b.price == null ? Infinity : Number(b.price);
      if (pa !== pb) return pa - pb;
      return String(a.address || "").localeCompare(String(b.address || ""));
    });
  }

  // ——— rendering ———
  function pill(text, cls) {
    const p = document.createElement("span");
    p.className = "pill " + (cls || "");
    p.textContent = text;
    return p;
  }

  function factsLine(x) {
    const f = [];
    if (x.beds != null && x.beds !== "") f.push(x.beds + " bd");
    if (x.baths != null && x.baths !== "") f.push(x.baths + " ba");
    if (x.sqft != null && x.sqft !== "") f.push(Number(x.sqft).toLocaleString() + " sf");
    if (x.acres != null && x.acres !== "" && Number.isFinite(Number(x.acres))) f.push(Number(x.acres) + " ac");
    return f;
  }

  function floodPill(x) {
    if (!x.floodZone) return null;
    const z = String(x.floodZone).trim();
    const isX = /^x\b/i.test(z) || /^x[\s(-]/i.test(z) || z.toUpperCase() === "X";
    return pill("Flood " + z, isX ? "flood-x" : "flood-other");
  }

  function makeCard(x) {
    const id = String(x.id);
    const st = stateOf(id);
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "listitem");
    card.tabIndex = 0;
    card.dataset.id = id;

    const top = document.createElement("div");
    top.className = "card-top";
    const price = document.createElement("div");
    price.className = "price";
    price.textContent = priceText(x);
    const fav = document.createElement("button");
    fav.type = "button";
    fav.className = "fav-btn" + (st.favorite ? " is-fav" : "");
    fav.textContent = st.favorite ? "★" : "☆";
    fav.setAttribute("aria-label", st.favorite ? "Remove from favorites" : "Add to favorites");
    fav.addEventListener("click", (e) => { e.stopPropagation(); writeState(id, { favorite: !st.favorite }); });
    top.append(price, fav);
    card.appendChild(top);

    const addr = document.createElement("div");
    addr.className = "addr";
    addr.textContent = x.address || "—";
    card.appendChild(addr);
    const city = document.createElement("div");
    city.className = "cityline";
    city.textContent = [x.city, x.zip, x.county].filter(Boolean).join(" · ");
    card.appendChild(city);

    const facts = factsLine(x);
    if (facts.length) {
      const d = document.createElement("div");
      d.className = "facts";
      facts.forEach((t) => { const s = document.createElement("span"); s.textContent = t; d.appendChild(s); });
      card.appendChild(d);
    }

    if (x.driveNote) {
      const d = document.createElement("div");
      d.className = "drive";
      d.textContent = "🚗 " + x.driveNote;
      card.appendChild(d);
    }

    const pills = document.createElement("div");
    pills.className = "pills";
    const lvl = matchLevel(x);
    if (lvl) pills.appendChild(pill(lvl === "hard" ? "Hard match" : "Weak match", "match-" + lvl));
    if (x.construction) pills.appendChild(pill(String(x.construction), /cbs|block|concrete/i.test(x.construction) ? "cbs" : "flag"));
    const fp = floodPill(x);
    if (fp) pills.appendChild(fp);
    if (x.outbuilding != null && x.outbuilding !== "" && x.outbuilding !== false) {
      pills.appendChild(pill(x.outbuilding === true ? "Outbuilding" : String(x.outbuilding), "flag"));
    }
    if (hasOpenHouse(x)) pills.appendChild(pill("Open house", "badge-open-house"));
    if (state.mode === "archive" && x.status) pills.appendChild(pill(x.status, "status-" + String(x.status).toLowerCase()));
    (Array.isArray(x.flags) ? x.flags : []).forEach((f) => {
      if (!f) return;
      pills.appendChild(pill(flagLabel(f), /unverified|shaded/i.test(f) ? "unverified" : "flag"));
    });
    if (pills.childNodes.length) card.appendChild(pills);

    const ev = [];
    if (x.workshop) ev.push(["Shop/outbuilding", x.workshop]);
    if (x.floodSource) ev.push(["Flood source", x.floodSource]);
    if (lvl == null && x.match) ev.push(["Match", x.match]);
    else if (x.match && String(x.match).trim().length > 5) ev.push(["Match", x.match]);
    ev.forEach(([k, v]) => {
      const d = document.createElement("div");
      d.className = "evidence";
      const b = document.createElement("b"); b.textContent = k + ": ";
      d.append(b, document.createTextNode(String(v)));
      card.appendChild(d);
    });

    // Note view / editor
    if (editingId === id) {
      card.appendChild(makeNoteEditor(id, st.note || ""));
    } else if (st.note) {
      const nv = document.createElement("div");
      nv.className = "note-view";
      nv.textContent = st.note;
      const sm = document.createElement("small");
      sm.textContent = "— " + memberName(st.updated_by) + (st.updated_at ? ", " + new Date(st.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
      nv.appendChild(sm);
      card.appendChild(nv);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (x.url) {
      const a = document.createElement("a");
      a.className = "card-link"; a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "Open listing →";
      a.addEventListener("click", (e) => e.stopPropagation());
      actions.appendChild(a);
    }
    if (editingId !== id) {
      const nb = document.createElement("button");
      nb.type = "button"; nb.className = "note-btn";
      nb.textContent = st.note ? "Edit note" : "Add note";
      nb.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!me) { showGate("Sign in to add notes."); return; }
        editingId = id; refresh();
        const ta = els.list.querySelector('.card[data-id="' + CSS.escape(id) + '"] textarea');
        if (ta) ta.focus();
      });
      actions.appendChild(nb);
    }
    if (st.dismissed) {
      const ub = document.createElement("button");
      ub.type = "button"; ub.className = "undismiss-btn"; ub.textContent = "Restore";
      ub.addEventListener("click", (e) => { e.stopPropagation(); writeState(id, { dismissed: false }); });
      actions.appendChild(ub);
    } else {
      const db = document.createElement("button");
      db.type = "button"; db.className = "dismiss-btn"; db.textContent = "Not interested";
      db.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await writeState(id, { dismissed: true });
        if (ok) toast("Hidden for both of you", () => writeState(id, { dismissed: false }));
      });
      actions.appendChild(db);
    }
    card.appendChild(actions);

    card.addEventListener("click", (e) => { if (!e.target.closest("textarea,button,a")) focusOn(x); });
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); focusOn(x); }
    });
    return card;
  }

  function makeNoteEditor(id, note) {
    const wrap = document.createElement("div");
    wrap.className = "note-edit";
    wrap.addEventListener("click", (e) => e.stopPropagation());
    const ta = document.createElement("textarea");
    ta.maxLength = 500; ta.value = note; ta.placeholder = "Short note for both of you (max 500 characters)";
    const row = document.createElement("div");
    row.className = "row";
    const cnt = document.createElement("span");
    const upd = () => { cnt.textContent = ta.value.length + "/500"; };
    ta.addEventListener("input", upd); upd();
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => { editingId = null; refresh(); });
    const save = document.createElement("button");
    save.type = "button"; save.className = "save"; save.textContent = "Save";
    save.addEventListener("click", async () => {
      save.disabled = true;
      const val = ta.value.trim().slice(0, 500);
      editingId = null;
      await writeState(id, { note: val });
    });
    row.append(cnt, cancel, save);
    wrap.append(ta, row);
    return wrap;
  }

  function emptyState() {
    const d = document.createElement("div");
    d.className = "empty";
    const total = (current.listings || []).length;
    if (state.mode === "archive" && !archive) {
      d.innerHTML = "<strong>Loading 9/20 archive…</strong>";
    } else if (state.mode === "favorites") {
      d.innerHTML = "<strong>No favorites yet</strong>Tap ☆ on a listing — it shows up here for both of you.";
    } else if (state.mode === "notes") {
      d.innerHTML = "<strong>No notes yet</strong>Use “Add note” on any listing.";
    } else if (state.mode === "dismissed") {
      d.innerHTML = "<strong>Nothing marked Not interested</strong>";
    } else if (state.mode !== "archive" && !total) {
      d.innerHTML = "<strong>Waiting for new-criteria listings</strong>Listing Scout’s pass 5 (Hudson–Trinity, CBS, ≥1 ac, shop/barn, Flood X) hasn’t landed yet. Older 9/20 results are under “9/20 archive”.";
    } else {
      d.innerHTML = "<strong>No listings in this view</strong>Try “Matches” or Reset.";
    }
    return d;
  }

  function refresh() {
    const items = sortListings(applyFilters(activeListings()));
    els.list.innerHTML = "";
    if (!items.length) els.list.appendChild(emptyState());
    else {
      const frag = document.createDocumentFragment();
      items.forEach((x) => frag.appendChild(makeCard(x)));
      els.list.appendChild(frag);
    }
    els.count.textContent = items.length + (items.length === 1 ? " listing" : " listings");
    els.archiveBanner.hidden = state.mode !== "archive";
    const src = state.mode === "archive" ? archive : current;
    els.updated.textContent = fmtUpdated(src && src.updatedAt, state.mode === "archive" ? "Archive" : "Updated");
    syncMarkers(items);
  }

  // ——— map (Esri World Dark Gray, no API key; never Carto/Mapbox/Google) ———
  function initMap() {
    if (map || !window.L || !els.map) return;
    map = L.map(els.map, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles &copy; Esri", maxZoom: 16 }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { attribution: "", maxZoom: 16, opacity: 0.9 }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    map.setView([28.3, -82.62], 10); // Hudson–Trinity band
    setTimeout(() => map && map.invalidateSize(), 80);
  }

  function popupHtml(x) {
    const lvl = matchLevel(x);
    return "<strong>" + esc(x.address || "Listing") + (isFav(x.id) ? " ★" : "") + "</strong>" +
      '<div class="pop-price">' + esc(priceText(x)) + "</div>" +
      "<div>" + esc(factsLine(x).join(" · ")) + "</div>" +
      (lvl ? "<div>" + (lvl === "hard" ? "Hard match" : "Weak match") + "</div>" : "") +
      (x.floodZone ? "<div>Flood " + esc(x.floodZone) + "</div>" : "") +
      (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Open listing →</a>' : "");
  }

  function syncMarkers(items) {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers(); markerById.clear();
    const pts = [];
    items.forEach((x) => {
      if (!hasCoords(x)) return;
      const ll = [Number(x.lat), Number(x.lng)];
      const m = L.marker(ll).bindPopup(popupHtml(x));
      m.on("click", () => highlight(x.id));
      m.addTo(markersLayer);
      markerById.set(String(x.id), m);
      pts.push(ll);
    });
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28], maxZoom: 13 });
  }

  function highlight(id) {
    els.list.querySelectorAll(".card.active").forEach((c) => c.classList.remove("active"));
    const c = els.list.querySelector('.card[data-id="' + CSS.escape(String(id)) + '"]');
    if (c) { c.classList.add("active"); c.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  function focusOn(x) {
    highlight(x.id);
    if (!map || !hasCoords(x)) return;
    map.setView([Number(x.lat), Number(x.lng)], Math.max(map.getZoom(), 14), { animate: true });
    const m = markerById.get(String(x.id));
    if (m) m.openPopup();
  }

  // ——— data ———
  function dataUrl(file) {
    const u = new URL(file, new URL(document.querySelector("base")?.getAttribute("href") || "./", location.href)).href;
    return u + "?t=" + Date.now();
  }
  async function fetchJson(file) {
    const res = await fetch(dataUrl(file), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  async function loadData() {
    try {
      const d = await fetchJson(DATA_FILE);
      current = { updatedAt: d.updatedAt || null, listings: Array.isArray(d.listings) ? d.listings : [] };
      if (!editingId) refresh();
    } catch (err) {
      els.updated.textContent = "Updated: (failed to load)";
      console.warn("listings.json load failed", err.message);
    }
  }
  async function loadArchive() {
    if (archive) return;
    try {
      const d = await fetchJson(ARCHIVE_FILE);
      archive = { updatedAt: d.updatedAt || null, listings: Array.isArray(d.listings) ? d.listings : [] };
    } catch (err) {
      archive = { updatedAt: null, listings: [] };
      toast("Couldn’t load the 9/20 archive");
    }
    if (state.mode === "archive") refresh();
  }

  function wireFilters() {
    els.filters.querySelectorAll(".chip-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        state.mode = chip.dataset.value || "matches";
        row.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
        editingId = null;
        if (state.mode === "archive") loadArchive();
        refresh();
      });
    });
    els.reset.addEventListener("click", () => {
      state.mode = "matches"; editingId = null;
      els.filters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.value === "matches"));
      refresh();
    });
  }

  function wireGate() {
    els.gateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (els.gateCode.value || "").trim().replace(/^.*[#&]k=/, "");
      if (!v) return;
      els.gateErr.textContent = "Checking…";
      const ok = await signIn(v, { fromGate: true });
      if (ok) els.gateCode.value = "";
    });
    els.gateSkip.addEventListener("click", () => {
      lsSet(BROWSE_ONLY, "1");
      els.gate.hidden = true;
    });
  }

  function onFocus() {
    loadData();
    if (token && me) pullState();
    else if (token && !me) signIn(token);
  }

  async function boot() {
    wireFilters();
    wireGate();
    initMap();
    renderWho();
    refresh();
    loadData();
    const fromHash = takeTokenFromHash();
    const saved = lsGet(KEY_STORE);
    if (fromHash) await signIn(fromHash, { fromGate: true });
    else if (saved) await signIn(saved);
    else if (!lsGet(BROWSE_ONLY)) showGate("");
    window.addEventListener("hashchange", () => {
      const k = takeTokenFromHash();
      if (k) signIn(k, { fromGate: true });
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onFocus(); });
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", () => { if (map) setTimeout(() => map.invalidateSize(), 50); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
