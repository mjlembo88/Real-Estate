(() => {
  "use strict";

  const COUNTIES = ["Pasco", "Pinellas", "Hernando"];
  const SOURCES = ["HomePath", "First Look", "other"];

  const els = {
    updated: document.getElementById("updated"),
    count: document.getElementById("count"),
    list: document.getElementById("list"),
    detail: document.getElementById("detail"),
    county: document.getElementById("f-county"),
    source: document.getElementById("f-source"),
    status: document.getElementById("f-status"),
    priceMin: document.getElementById("f-price-min"),
    priceMax: document.getElementById("f-price-max"),
    reset: document.getElementById("f-reset"),
  };

  let all = [];
  let selectedId = null;
  let map = null;
  let marker = null;
  let leafletReady = false;

  function resolveDataUrl() {
    // Works for /Real-Estate/foreclosures/ and file:// or local serve of this folder.
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
        year: "numeric",
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

  function uniqueStatuses(items) {
    const set = new Set();
    items.forEach((x) => {
      if (x.status) set.add(String(x.status));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function fillStatusOptions(items) {
    const cur = els.status.value;
    const statuses = uniqueStatuses(items);
    els.status.innerHTML = '<option value="">All</option>';
    statuses.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      els.status.appendChild(opt);
    });
    if (cur && statuses.includes(cur)) els.status.value = cur;
  }

  function getFilters() {
    const minRaw = els.priceMin.value.trim();
    const maxRaw = els.priceMax.value.trim();
    return {
      county: els.county.value,
      source: els.source.value,
      status: els.status.value,
      priceMin: minRaw === "" ? null : Number(minRaw),
      priceMax: maxRaw === "" ? null : Number(maxRaw),
    };
  }

  function applyFilters(items) {
    const f = getFilters();
    return items.filter((x) => {
      if (f.county && x.county !== f.county) return false;
      if (f.source && x.source !== f.source) return false;
      if (f.status && String(x.status) !== f.status) return false;
      const p = x.price == null ? null : Number(x.price);
      if (f.priceMin != null && !Number.isNaN(f.priceMin)) {
        if (p == null || p < f.priceMin) return false;
      }
      if (f.priceMax != null && !Number.isNaN(f.priceMax)) {
        if (p == null || p > f.priceMax) return false;
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

  function renderList(items) {
    els.count.textContent = items.length + " listing" + (items.length === 1 ? "" : "s");
    els.list.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = all.length
        ? "No listings match the current filters."
        : "No listings yet. Scout will drop a listings.json here — leave this empty until then.";
      els.list.appendChild(empty);
      if (!items.find((x) => x.id === selectedId)) {
        selectedId = null;
        renderDetail(null);
      }
      return;
    }

    if (selectedId && !items.some((x) => x.id === selectedId)) {
      selectedId = items[0].id;
    }
    if (!selectedId) selectedId = items[0].id;

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card" + (item.id === selectedId ? " active" : "");
      btn.dataset.id = item.id;

      const city = [item.city, item.state || "FL", item.zip].filter(Boolean).join(", ");
      const bedsBaths = [
        item.beds != null ? item.beds + " bd" : null,
        item.baths != null ? item.baths + " ba" : null,
        item.sqft != null ? Number(item.sqft).toLocaleString() + " sf" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      btn.innerHTML =
        '<div class="row1"><span class="addr"></span><span class="price"></span></div>' +
        '<div class="meta"></div>' +
        '<div class="pills"></div>';

      btn.querySelector(".addr").textContent = item.address || "(no address)";
      btn.querySelector(".price").textContent = fmtPrice(item.price);
      btn.querySelector(".meta").textContent = [item.county, city, bedsBaths]
        .filter(Boolean)
        .join(" · ");

      const pills = btn.querySelector(".pills");
      if (item.source) {
        const p = document.createElement("span");
        p.className = "pill " + sourceClass(item.source);
        p.textContent = item.source;
        pills.appendChild(p);
      }
      if (item.status) {
        const p = document.createElement("span");
        p.className = "pill status";
        p.textContent = item.status;
        pills.appendChild(p);
      }

      btn.addEventListener("click", () => {
        selectedId = item.id;
        refresh();
      });
      frag.appendChild(btn);
    });
    els.list.appendChild(frag);

    const sel = items.find((x) => x.id === selectedId) || null;
    renderDetail(sel);
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
      if (!map) {
        map = L.map(el, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OSM &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(map);
      }
      if (marker) {
        map.removeLayer(marker);
        marker = null;
      }
      marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(item.address || "Listing");
      map.setView([lat, lng], 14);
      setTimeout(() => map.invalidateSize(), 50);
    });
  }

  function renderDetail(item) {
    if (!item) {
      els.detail.innerHTML =
        '<div class="detail-empty">Select a listing, or wait for Scout to publish HomePath / First Look data into listings.json.</div>';
      return;
    }

    const city = [item.city, item.state || "FL", item.zip].filter(Boolean).join(", ");
    const rows = [
      ["County", item.county],
      ["Source", item.source],
      ["Status", item.status],
      ["Type", item.propertyType],
      ["Beds", item.beds],
      ["Baths", item.baths],
      ["Sq ft", item.sqft != null ? Number(item.sqft).toLocaleString() : null],
      ["MLS", item.mls],
      ["First Look ends", item.firstLookEnds],
    ].filter(([, v]) => v != null && v !== "");

    let html = '<div class="detail">';
    html += "<h2></h2>";
    html += '<div class="cityline"></div>';
    html += '<div class="price-lg"></div>';
    html += '<div class="pills detail-pills"></div>';
    html += '<div class="actions"></div>';
    html += "<dl class=\"kv\"></dl>";
    if (item.notes) {
      html += '<div class="notes"><div class="label">Notes</div><div class="note-body"></div></div>';
    }
    html += '<div id="mini-map"></div>';
    html += "</div>";
    els.detail.innerHTML = html;

    els.detail.querySelector("h2").textContent = item.address || "(no address)";
    els.detail.querySelector(".cityline").textContent = city;
    els.detail.querySelector(".price-lg").textContent = fmtPrice(item.price);

    const pills = els.detail.querySelector(".detail-pills");
    if (item.source) {
      const p = document.createElement("span");
      p.className = "pill " + sourceClass(item.source);
      p.textContent = item.source;
      pills.appendChild(p);
    }
    if (item.status) {
      const p = document.createElement("span");
      p.className = "pill status";
      p.textContent = item.status;
      pills.appendChild(p);
    }

    const actions = els.detail.querySelector(".actions");
    if (item.url) {
      const a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open listing";
      actions.appendChild(a);
    }
    if (hasCoords(item)) {
      const a = document.createElement("a");
      a.href =
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(Number(item.lat) + "," + lngOf(item));
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Google Maps";
      actions.appendChild(a);
    }

    const dl = els.detail.querySelector(".kv");
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = String(v);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });

    if (item.notes) {
      els.detail.querySelector(".note-body").textContent = item.notes;
    }

    renderMap(item);
  }

  function refresh() {
    const filtered = sortListings(applyFilters(all));
    renderList(filtered);
  }

  function wireFilters() {
    ["change", "input"].forEach((evt) => {
      els.county.addEventListener(evt, refresh);
      els.source.addEventListener(evt, refresh);
      els.status.addEventListener(evt, refresh);
      els.priceMin.addEventListener(evt, refresh);
      els.priceMax.addEventListener(evt, refresh);
    });
    els.reset.addEventListener("click", () => {
      els.county.value = "";
      els.source.value = "";
      els.status.value = "";
      els.priceMin.value = "";
      els.priceMax.value = "";
      refresh();
    });
  }

  function fillFixedFilters() {
    els.county.innerHTML = '<option value="">All</option>';
    COUNTIES.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      els.county.appendChild(o);
    });
    els.source.innerHTML = '<option value="">All</option>';
    SOURCES.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      els.source.appendChild(o);
    });
  }

  async function boot() {
    fillFixedFilters();
    wireFilters();
    els.updated.textContent = "Updated: …";
    els.detail.innerHTML = '<div class="detail-empty">Loading listings…</div>';

    try {
      const res = await fetch(resolveDataUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      all = Array.isArray(data.listings) ? data.listings : [];
      els.updated.textContent = fmtUpdated(data.meta && data.meta.updatedAt);
      fillStatusOptions(all);
      refresh();
    } catch (err) {
      els.updated.textContent = "Updated: (failed to load)";
      els.list.innerHTML =
        '<div class="empty">Could not load listings.json. Serve this folder over HTTP (GitHub Pages or a local static server).</div>';
      els.detail.innerHTML =
        '<div class="detail-empty">Load error: ' +
        String(err && err.message ? err.message : err) +
        "</div>";
      console.error(err);
    }
  }

  boot();
})();
