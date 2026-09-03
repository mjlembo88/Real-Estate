(() => {
  "use strict";

  const NOTES_COLLAPSE_LEN = 120;

  const els = {
    updated: document.getElementById("updated"),
    count: document.getElementById("count"),
    list: document.getElementById("list"),
    detail: document.getElementById("detail"),
    filters: document.getElementById("filters"),
    reset: document.getElementById("f-reset"),
    sheet: document.getElementById("sheet"),
    backdrop: document.getElementById("sheet-backdrop"),
    close: document.getElementById("sheet-close"),
  };

  const state = {
    county: "",
    source: "",
    firstLook: "",
    price: "",
  };

  let all = [];
  let selectedId = null;
  let map = null;
  let marker = null;
  let leafletReady = false;

  const PLACEHOLDER_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>' +
    '<path d="M9 21V12h6v9"/>' +
    "</svg>";

  function resolveDataUrl() {
    const base = document.querySelector("base")?.getAttribute("href");
    if (base) return new URL("listings.json", new URL(base, location.href)).href;
    return new URL("listings.json", location.href).href;
  }

  function fmtPrice(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function fmtUpdated(iso) {
    if (!iso) return "Updated: —";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Updated: " + iso;
    try {
      const s = d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return "Updated: " + s + " ET";
    } catch {
      return "Updated: " + iso;
    }
  }

  function lngOf(item) {
    if (item.lng != null) return Number(item.lng);
    if (item.lon != null) return Number(item.lon);
    return null;
  }

  function hasCoords(item) {
    const lat = item.lat != null ? Number(item.lat) : NaN;
    const lng = lngOf(item);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }

  function sourceClass(src) {
    const s = String(src || "").toLowerCase();
    if (s === "homepath") return "source-homepath";
    if (s === "first look") return "source-first-look";
    return "source-other";
  }

  /** Collect photo URLs from photo (string) and photos (string[]). No invented URLs. */
  function photoList(item) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
      if (u == null || u === "") return;
      const s = String(u).trim();
      if (!s || seen.has(s)) return;
      seen.add(s);
      out.push(s);
    };
    if (!item) return out;
    // Prefer local path (Pages-relative), then remote URL fields, then photo/photos.
    push(item.photoPath);
    push(item.photoUrl);
    push(item.photo);
    if (Array.isArray(item.photos)) item.photos.forEach(push);
    return out;
  }

  function thumbUrl(item) {
    const list = photoList(item);
    return list.length ? list[0] : null;
  }

  function addressQuery(item) {
    if (!item) return "";
    return [item.address, item.city, item.state || "FL", item.zip]
      .filter((x) => x != null && String(x).trim() !== "")
      .join(" ")
      .trim();
  }

  /** Google Search + Maps dig links when Scout has no listing photos. */
  function digLinksEl(item, compact) {
    const q = addressQuery(item);
    if (!q) return null;
    const wrap = document.createElement("div");
    wrap.className = compact ? "dig-links dig-links-compact" : "dig-links";
    const label = document.createElement("div");
    label.className = "dig-label";
    label.textContent = compact ? "Find visuals" : "No photo — dig visuals";
    wrap.appendChild(label);
    const row = document.createElement("div");
    row.className = "dig-row";
    const search = document.createElement("a");
    search.href =
      "https://www.google.com/search?q=" +
      encodeURIComponent(q + " real estate");
    search.target = "_blank";
    search.rel = "noopener noreferrer";
    search.textContent = "Google Search";
    search.addEventListener("click", (e) => e.stopPropagation());
    const maps = document.createElement("a");
    maps.href =
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
    maps.target = "_blank";
    maps.rel = "noopener noreferrer";
    maps.textContent = "Maps / Street View";
    maps.addEventListener("click", (e) => e.stopPropagation());
    row.appendChild(search);
    row.appendChild(maps);
    wrap.appendChild(row);
    return wrap;
  }

  function daysLeft(iso) {
    if (!iso) return null;
    const end = new Date(iso);
    if (Number.isNaN(end.getTime())) return null;
    // Treat date-only as end of that calendar day ET-ish: compare to local midnight of end+1
    let endMs = end.getTime();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) {
      endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59);
    }
    const now = Date.now();
    const diff = endMs - now;
    if (diff < 0) return { n: 0, label: "ended", ended: true };
    const days = Math.ceil(diff / 86400000);
    return { n: days, label: days === 1 ? "1 day left" : days + " days left", ended: false };
  }

  function isFirstLookActive(item) {
    if (!item || !item.firstLookEnds) return false;
    const d = daysLeft(item.firstLookEnds);
    return d && !d.ended;
  }

  function bedsBathsSqft(item) {
    return [
      item.beds != null ? item.beds + " bd" : null,
      item.baths != null ? item.baths + " ba" : null,
      item.sqft != null ? Number(item.sqft).toLocaleString() + " sf" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function applyFilters(items) {
    return items.filter((x) => {
      if (state.county && x.county !== state.county) return false;
      if (state.source && x.source !== state.source) return false;
      if (state.firstLook === "active" && !isFirstLookActive(x)) return false;
      const p = x.price == null ? null : Number(x.price);
      if (state.price === "150") {
        if (p == null || p > 150000) return false;
      } else if (state.price === "250") {
        if (p == null || p > 250000) return false;
      } else if (state.price === "350") {
        if (p == null || p > 350000) return false;
      } else if (state.price === "350+") {
        if (p == null || p < 350000) return false;
      }
      return true;
    });
  }

  function sortListings(items) {
    return items.slice().sort((a, b) => {
      const pa = a.price == null ? Infinity : Number(a.price);
      const pb = b.price == null ? Infinity : Number(b.price);
      if (pa !== pb) return pa - pb;
      return String(a.address || "").localeCompare(String(b.address || ""));
    });
  }

  function placeholderEl(className) {
    const d = document.createElement("div");
    d.className = "ph" + (className ? " " + className : "");
    d.innerHTML = PLACEHOLDER_SVG;
    return d;
  }

  function safeImg(url, alt) {
    const img = document.createElement("img");
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = url;
    img.addEventListener("error", () => {
      const ph = placeholderEl();
      if (img.parentNode) img.parentNode.replaceChild(ph, img);
    });
    return img;
  }

  function renderList(items) {
    els.count.textContent = items.length + " listing" + (items.length === 1 ? "" : "s");
    els.list.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = all.length
        ? "No listings match the current filters."
        : "No listings yet. Scout will drop a listings.json here.";
      els.list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const btn = document.createElement("div");
      btn.className = "card";
      btn.dataset.id = item.id;
      btn.setAttribute("role", "button");
      btn.tabIndex = 0;
      btn.setAttribute("aria-label", item.address || "Listing");

      const thumb = document.createElement("div");
      thumb.className = "card-thumb";
      const u = thumbUrl(item);
      if (u) thumb.appendChild(safeImg(u, item.address || "Listing"));
      else {
        thumb.appendChild(placeholderEl());
        const dig = digLinksEl(item, true);
        if (dig) thumb.appendChild(dig);
      }

      const body = document.createElement("div");
      body.className = "card-body";

      const price = document.createElement("div");
      price.className = "price";
      price.textContent = fmtPrice(item.price);

      const addr = document.createElement("div");
      addr.className = "addr";
      addr.textContent = item.address || "(no address)";

      const meta = document.createElement("div");
      meta.className = "meta";
      const city = [item.city, item.county].filter(Boolean).join(" · ");
      meta.textContent = [bedsBathsSqft(item), city].filter(Boolean).join(" · ");

      const pills = document.createElement("div");
      pills.className = "pills";
      if (item.source) {
        const p = document.createElement("span");
        p.className = "pill " + sourceClass(item.source);
        p.textContent = item.source;
        pills.appendChild(p);
      }
      const fl = daysLeft(item.firstLookEnds);
      if (item.firstLookEnds && fl && !fl.ended) {
        const p = document.createElement("span");
        p.className = "pill fl-badge";
        p.textContent = "FL · " + fl.label;
        pills.appendChild(p);
      }

      body.appendChild(price);
      body.appendChild(addr);
      body.appendChild(meta);
      body.appendChild(pills);

      btn.appendChild(thumb);
      btn.appendChild(body);
      btn.addEventListener("click", () => openSheet(item));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          btn.click();
        }
      });
      frag.appendChild(btn);
    });
    els.list.appendChild(frag);
  }

  function ensureLeaflet(cb) {
    if (leafletReady && window.L) {
      cb();
      return;
    }
    if (window.L) {
      leafletReady = true;
      cb();
      return;
    }
    const existing = document.querySelector('script[data-leaflet="1"]');
    if (existing) {
      existing.addEventListener("load", () => {
        leafletReady = true;
        cb();
      });
      return;
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.dataset.leaflet = "1";
    s.onload = () => {
      leafletReady = true;
      cb();
    };
    document.head.appendChild(s);
  }

  function renderMap(item) {
    const el = document.getElementById("mini-map");
    if (!el) return;
    if (!item || !hasCoords(item)) {
      el.classList.remove("on");
      return;
    }
    el.classList.add("on");
    const lat = Number(item.lat);
    const lng = lngOf(item);
    ensureLeaflet(() => {
      if (map) {
        try {
          map.remove();
        } catch (_) {}
        map = null;
        marker = null;
      }
      map = L.map(el, { zoomControl: true, attributionControl: true });
      // Esri free dark basemap — no API key (Carto dark tiles watermark without a key)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          maxZoom: 16,
        }
      ).addTo(map);
      marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(item.address || "Listing");
      map.setView([lat, lng], 14);
      setTimeout(() => map && map.invalidateSize(), 80);
    });
  }

  function renderDetail(item) {
    if (!item) {
      els.detail.innerHTML = "";
      return;
    }

    const photos = photoList(item);
    const city = [item.city, item.state || "FL", item.zip].filter(Boolean).join(", ");
    const fl = daysLeft(item.firstLookEnds);

    const rows = [
      ["County", item.county],
      ["Source", item.source],
      ["Status", item.status],
      ["Type", item.propertyType],
      ["Beds", item.beds],
      ["Baths", item.baths],
      ["Sq ft", item.sqft != null ? Number(item.sqft).toLocaleString() : null],
      ["MLS", item.mls],
      [
        "First Look",
        item.firstLookEnds
          ? item.firstLookEnds + (fl ? " · " + fl.label : "")
          : null,
      ],
    ].filter(([, v]) => v != null && v !== "");

    els.detail.innerHTML = "";
    const root = document.createElement("div");
    root.className = "detail";

    const hero = document.createElement("div");
    hero.className = "detail-hero";
    if (photos.length) hero.appendChild(safeImg(photos[0], item.address || "Listing"));
    else {
      hero.appendChild(placeholderEl());
      const digHero = digLinksEl(item, false);
      if (digHero) hero.appendChild(digHero);
    }
    root.appendChild(hero);

    if (photos.length > 1) {
      const thumbs = document.createElement("div");
      thumbs.className = "thumbs";
      photos.forEach((url, i) => {
        const b = document.createElement("button");
        b.type = "button";
        if (i === 0) b.classList.add("active");
        b.appendChild(safeImg(url, "Photo " + (i + 1)));
        b.addEventListener("click", () => {
          thumbs.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          hero.innerHTML = "";
          hero.appendChild(safeImg(url, item.address || "Listing"));
        });
        thumbs.appendChild(b);
      });
      root.appendChild(thumbs);
    }

    const h2 = document.createElement("h2");
    h2.id = "sheet-title";
    h2.textContent = item.address || "(no address)";
    root.appendChild(h2);

    const cityline = document.createElement("div");
    cityline.className = "cityline";
    cityline.textContent = city;
    root.appendChild(cityline);

    const price = document.createElement("div");
    price.className = "price-lg";
    price.textContent = fmtPrice(item.price);
    root.appendChild(price);

    const pills = document.createElement("div");
    pills.className = "pills";
    if (item.source) {
      const p = document.createElement("span");
      p.className = "pill " + sourceClass(item.source);
      p.textContent = item.source;
      pills.appendChild(p);
    }
    if (item.status) {
      const p = document.createElement("span");
      p.className = "pill";
      p.textContent = item.status;
      pills.appendChild(p);
    }
    if (item.firstLookEnds && fl && !fl.ended) {
      const p = document.createElement("span");
      p.className = "pill fl-badge";
      p.textContent = "First Look · " + fl.label;
      pills.appendChild(p);
    }
    root.appendChild(pills);

    const actions = document.createElement("div");
    actions.className = "actions";
    if (!photos.length) {
      const q = addressQuery(item);
      if (q) {
        const gs = document.createElement("a");
        gs.className = "btn-ghost";
        gs.href =
          "https://www.google.com/search?q=" +
          encodeURIComponent(q + " real estate");
        gs.target = "_blank";
        gs.rel = "noopener noreferrer";
        gs.textContent = "Google Search";
        actions.appendChild(gs);
        const gm = document.createElement("a");
        gm.className = "btn-ghost";
        gm.href =
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(q);
        gm.target = "_blank";
        gm.rel = "noopener noreferrer";
        gm.textContent = "Maps / Street View";
        actions.appendChild(gm);
      }
    }
    if (item.url) {
      const a = document.createElement("a");
      a.className = "btn-primary";
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open listing";
      actions.appendChild(a);
    }
    if (hasCoords(item)) {
      const a = document.createElement("a");
      a.className = "btn-ghost";
      a.href =
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(Number(item.lat) + "," + lngOf(item));
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Maps";
      actions.appendChild(a);
    }
    root.appendChild(actions);

    if (item.mls) {
      const mlsLine = document.createElement("div");
      mlsLine.style.cssText = "font-size:13px;color:var(--muted);margin:-6px 0 12px";
      mlsLine.textContent = "MLS " + item.mls;
      root.appendChild(mlsLine);
    }

    const dl = document.createElement("dl");
    dl.className = "kv";
    rows.forEach(([k, v]) => {
      if (k === "MLS" && item.mls) return; // already shown above
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = String(v);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    root.appendChild(dl);

    if (item.notes) {
      const notes = document.createElement("div");
      notes.className = "notes";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = "Notes";
      const body = document.createElement("div");
      body.className = "note-body";
      body.textContent = item.notes;
      notes.appendChild(label);
      notes.appendChild(body);
      if (String(item.notes).length > NOTES_COLLAPSE_LEN) {
        body.classList.add("collapsed");
        const tog = document.createElement("button");
        tog.type = "button";
        tog.className = "note-toggle";
        tog.textContent = "Show more";
        tog.addEventListener("click", () => {
          const open = body.classList.toggle("collapsed");
          tog.textContent = open ? "Show more" : "Show less";
        });
        notes.appendChild(tog);
      }
      root.appendChild(notes);
    }

    const mapEl = document.createElement("div");
    mapEl.id = "mini-map";
    root.appendChild(mapEl);

    els.detail.appendChild(root);
    renderMap(item);
  }

  function openSheet(item) {
    selectedId = item.id;
    renderDetail(item);
    els.sheet.hidden = false;
    els.backdrop.hidden = false;
    // force reflow for transition
    void els.sheet.offsetWidth;
    els.sheet.classList.add("open");
    els.backdrop.classList.add("open");
    document.body.classList.add("sheet-open");
    els.close.focus();
  }

  function closeSheet() {
    els.sheet.classList.remove("open");
    els.backdrop.classList.remove("open");
    document.body.classList.remove("sheet-open");
    selectedId = null;
    const done = () => {
      els.sheet.hidden = true;
      els.backdrop.hidden = true;
      els.detail.innerHTML = "";
      if (map) {
        try {
          map.remove();
        } catch (_) {}
        map = null;
        marker = null;
      }
    };
    setTimeout(done, 280);
  }

  function refresh() {
    renderList(sortListings(applyFilters(all)));
  }

  function setChipActive(row, value) {
    row.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.value === value);
    });
  }

  function wireFilters() {
    els.filters.querySelectorAll(".chip-row").forEach((row) => {
      const key = row.dataset.filter;
      row.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip || !row.contains(chip)) return;
        state[key] = chip.dataset.value || "";
        setChipActive(row, state[key]);
        refresh();
      });
    });
    els.reset.addEventListener("click", () => {
      state.county = "";
      state.source = "";
      state.firstLook = "";
      state.price = "";
      els.filters.querySelectorAll(".chip-row").forEach((row) => setChipActive(row, ""));
      refresh();
    });
  }

  function wireSheet() {
    els.close.addEventListener("click", closeSheet);
    els.backdrop.addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.sheet.hidden) closeSheet();
    });
  }

  async function boot() {
    wireFilters();
    wireSheet();
    els.updated.textContent = "Updated: …";

    try {
      const res = await fetch(resolveDataUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      all = Array.isArray(data.listings) ? data.listings : [];
      els.updated.textContent = fmtUpdated(data.meta && data.meta.updatedAt);
      refresh();
    } catch (err) {
      els.updated.textContent = "Updated: (failed to load)";
      els.list.innerHTML =
        '<div class="empty">Could not load listings.json. Serve this folder over HTTP (GitHub Pages or a local static server).</div>';
      console.error(err);
    }
  }

  boot();
})();
