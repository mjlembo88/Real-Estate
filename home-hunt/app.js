(() => {
  "use strict";

  // Persistence keys — v1 is local-only. Future X (Twitter) sync would replace
  // these helpers to merge remote favorites+dismissed with local (no Google/Firebase).
  const FAVORITES_KEY = "home-hunt-favorites-v1";
  const DISMISSED_KEY = "home-hunt-dismissed-v1";

  const els = {
    updated: document.getElementById("updated"),
    count: document.getElementById("count"),
    list: document.getElementById("list"),
    filters: document.getElementById("filters"),
    reset: document.getElementById("f-reset"),
    map: document.getElementById("map"),
    toast: document.getElementById("toast"),
  };

  const state = { mode: "all" };

  let all = [];
  let selectedId = null;
  let fingerprint = "";
  let loadGen = 0;
  let map = null;
  let markersLayer = null;
  const markerById = new Map();

  /** @type {Set<string>} Favorite listing ids — localStorage only, never listings.json */
  let favoriteIds = loadFavorites();
  /** @type {Set<string>} Dismissed ("not interested") ids — localStorage only, never listings.json */
  let dismissedIds = loadDismissed();

  let toastTimer = null;
  let undoDismissId = null;

  // —— Persistence helpers (swap later for X sync layer) ——

  function loadIdSet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map((id) => String(id)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveIdSet(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch (err) {
      console.warn("Could not save", key, err);
    }
  }

  function loadFavorites() {
    return loadIdSet(FAVORITES_KEY);
  }

  function saveFavorites() {
    saveIdSet(FAVORITES_KEY, favoriteIds);
  }

  function loadDismissed() {
    return loadIdSet(DISMISSED_KEY);
  }

  function saveDismissed() {
    saveIdSet(DISMISSED_KEY, dismissedIds);
  }

  function isFavorite(id) {
    return favoriteIds.has(String(id));
  }

  function isDismissed(id) {
    return dismissedIds.has(String(id));
  }

  function toggleFavorite(id) {
    const key = String(id);
    if (favoriteIds.has(key)) favoriteIds.delete(key);
    else favoriteIds.add(key);
    saveFavorites();
  }

  function dismissListing(id) {
    const key = String(id);
    dismissedIds.add(key);
    saveDismissed();
    // Also drop from favorites so it doesn't linger in that set for sync later
    if (favoriteIds.has(key)) {
      favoriteIds.delete(key);
      saveFavorites();
    }
  }

  function undismissListing(id) {
    const key = String(id);
    dismissedIds.delete(key);
    saveDismissed();
  }

  function showUndoToast(id) {
    undoDismissId = String(id);
    if (!els.toast) return;
    els.toast.hidden = false;
    els.toast.innerHTML = "";
    const label = document.createElement("span");
    label.textContent = "Removed · ";
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "toast-undo";
    undo.textContent = "Undo";
    undo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (undoDismissId) {
        undismissListing(undoDismissId);
        undoDismissId = null;
        hideToast();
        refresh();
      }
    });
    els.toast.appendChild(label);
    els.toast.appendChild(undo);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      hideToast();
      undoDismissId = null;
    }, 5000);
  }

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (els.toast) {
      els.toast.hidden = true;
      els.toast.innerHTML = "";
    }
  }

  /** Truthy openHouseToday / open_house_today, or non-empty openHouse (string/object). */
  function hasOpenHouse(item) {
    if (!item) return false;
    if (item.openHouseToday) return true;
    if (item.open_house_today) return true;
    const oh = item.openHouse;
    if (oh == null) return false;
    if (typeof oh === "string") return oh.trim() !== "";
    if (typeof oh === "object") return Object.keys(oh).length > 0;
    return Boolean(oh);
  }

  function hasAcresAtLeast(item, min) {
    if (item == null || item.acres == null || item.acres === "") return false;
    const n = Number(item.acres);
    if (!Number.isFinite(n)) return false;
    return n >= min;
  }

  function resolveDataUrl() {
    const base = document.querySelector("base")?.getAttribute("href");
    const root = base
      ? new URL("listings.json", new URL(base, location.href)).href
      : new URL("listings.json", location.href).href;
    return root + (root.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  function fmtPrice(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function priceText(item) {
    if (item.priceLabel && String(item.priceLabel).trim()) return String(item.priceLabel).trim();
    return fmtPrice(item.price);
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

  function hasCoords(item) {
    const lat = item.lat != null ? Number(item.lat) : NaN;
    const lng = item.lng != null ? Number(item.lng) : NaN;
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  }

  function hasShop(item) {
    if (!item) return false;
    if (item.workshop != null && String(item.workshop).trim() !== "") return true;
    const garage = String(item.garage || "").toLowerCase();
    if (/\b(workshop|work\s*shop|\bshop\b)/i.test(garage)) return true;
    const flags = Array.isArray(item.flags) ? item.flags : [];
    return flags.some((f) => {
      const s = String(f || "").toLowerCase();
      return s.includes("shop") || s.includes("workshop") || s.includes("work shop");
    });
  }

  function bedsBaths(item) {
    return [
      item.beds != null && item.beds !== "" ? item.beds + " bd" : null,
      item.baths != null && item.baths !== "" ? item.baths + " ba" : null,
      item.sqft != null && item.sqft !== ""
        ? Number(item.sqft).toLocaleString() + " sf"
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function acresText(item) {
    if (item.acres == null || item.acres === "") return null;
    const n = Number(item.acres);
    if (!Number.isFinite(n)) return null;
    return n + (n === 1 ? " acre" : " acres");
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase().replace(/\s+/g, "-");
    if (["watch", "over-budget", "sold", "dead", "rent"].includes(s)) {
      return "status-" + s;
    }
    return "";
  }

  function hoaClass(hoa) {
    const h = String(hoa || "unknown").toLowerCase();
    if (["none", "cdd", "deed", "unknown", "hoa"].includes(h)) return "hoa-" + h;
    return "hoa-unknown";
  }

  function hoaLabel(hoa) {
    const h = String(hoa || "unknown").toLowerCase();
    if (h === "none") return "No HOA";
    if (h === "cdd") return "CDD";
    if (h === "deed") return "Deed restrict";
    if (h === "hoa") return "HOA";
    return "HOA ?";
  }

  function isGraveyard(status) {
    return status === "dead" || status === "sold";
  }

  function applyFilters(items) {
    const mode = state.mode || "all";
    return items.filter((x) => {
      // Dismissed never appear in any filter mode (including Favorites / Open houses).
      if (isDismissed(x.id)) return false;

      const type = String(x.type || "").toLowerCase();
      const status = String(x.status || "").toLowerCase();
      // Favorites: show starred ids regardless of dead/sold so history isn’t lost.
      if (mode === "favorites") {
        return isFavorite(x.id);
      }
      // Open houses: only listings with open-house signal; hide graveyard.
      if (mode === "openhouses") {
        if (isGraveyard(status)) return false;
        return hasOpenHouse(x);
      }
      // ≥0.6 acres — missing/null acres excluded (don't invent).
      if (mode === "acres") {
        if (isGraveyard(status)) return false;
        return hasAcresAtLeast(x, 0.6);
      }
      // Default hunt views hide dead/sold history (graveyard).
      if (mode === "all") {
        return !isGraveyard(status);
      }
      if (mode === "buy") {
        if (type !== "sale") return false;
        if (isGraveyard(status)) return false;
        return true;
      }
      if (mode === "rent") {
        if (isGraveyard(status)) return false;
        return type === "rent" || status === "rent";
      }
      if (mode === "watch") {
        return status === "watch";
      }
      if (mode === "shop") {
        if (isGraveyard(status)) return false;
        return hasShop(x);
      }
      return !isGraveyard(status);
    });
  }

  function sortListings(items) {
    return items.slice().sort((a, b) => {
      const pa = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
      const pb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
      if (pa !== pb) return pa - pb;
      return String(a.address || "").localeCompare(String(b.address || ""));
    });
  }

  function makePopupHtml(item) {
    const fav = isFavorite(item.id);
    const parts = [
      '<div class="pop-top">' +
        "<strong>" +
        escapeHtml(item.address || "Listing") +
        "</strong>" +
        '<button type="button" class="fav-btn pop-fav' +
        (fav ? " is-fav" : "") +
        '" data-fav-id="' +
        escapeAttr(item.id) +
        '" aria-label="' +
        (fav ? "Remove from favorites" : "Add to favorites") +
        '" title="' +
        (fav ? "Unfavorite" : "Favorite") +
        '">' +
        (fav ? "★" : "☆") +
        "</button></div>",
      '<div class="pop-price">' + escapeHtml(priceText(item)) + "</div>",
    ];
    if (hasOpenHouse(item)) {
      parts.push('<span class="badge-open-house">Open house</span>');
    }
    const city = [item.city, item.zip].filter(Boolean).join(" · ");
    if (city) parts.push("<div>" + escapeHtml(city) + "</div>");
    if (item.url) {
      parts.push(
        '<a href="' +
          escapeAttr(item.url) +
          '" target="_blank" rel="noopener noreferrer">Open listing</a>'
      );
    }
    return parts.join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function initMap() {
    if (map || !window.L || !els.map) return;
    map = L.map(els.map, {
      zoomControl: true,
      attributionControl: true,
    });
    // Esri free dark basemap — no API key (do not use Carto/Mapbox/Google)
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 16,
      }
    ).addTo(map);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "",
        maxZoom: 16,
        opacity: 0.9,
      }
    ).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    // Tampa Bay default view
    map.setView([28.0, -82.55], 9);
    setTimeout(() => map && map.invalidateSize(), 80);

    // Star clicks inside Leaflet popups (content is HTML string)
    map.getContainer().addEventListener("click", (e) => {
      const btn = e.target.closest(".fav-btn[data-fav-id]");
      if (!btn || !map.getContainer().contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-fav-id");
      if (!id) return;
      toggleFavorite(id);
      // Re-render list + refresh open popup content
      refresh();
      const m = markerById.get(id);
      if (m && m.isPopupOpen()) {
        const item = all.find((x) => String(x.id) === String(id));
        if (item) m.setPopupContent(makePopupHtml(item));
      }
    });
  }

  function syncMarkers(items) {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();
    markerById.clear();
    const bounds = [];
    items.forEach((item) => {
      if (!hasCoords(item)) return;
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      const m = L.marker([lat, lng]);
      m.bindPopup(makePopupHtml(item));
      m.on("click", () => {
        selectedId = item.id;
        highlightCard(item.id);
      });
      m.addTo(markersLayer);
      markerById.set(item.id, m);
      bounds.push([lat, lng]);
    });
    if (selectedId && markerById.has(selectedId)) {
      // keep selection if still visible
    } else {
      selectedId = null;
    }
    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      try {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
      } catch (_) {}
    } else {
      map.setView([28.0, -82.55], 9);
    }
    setTimeout(() => map && map.invalidateSize(), 60);
  }

  function focusOnListing(item) {
    if (!item || !map) return;
    selectedId = item.id;
    highlightCard(item.id);
    if (!hasCoords(item)) return;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
    const m = markerById.get(item.id);
    if (m) {
      m.openPopup();
    }
  }

  function highlightCard(id) {
    els.list.querySelectorAll(".card").forEach((c) => {
      c.classList.toggle("active", c.dataset.id === String(id));
    });
  }

  function makeFavButton(item) {
    const fav = isFavorite(item.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fav-btn" + (fav ? " is-fav" : "");
    btn.setAttribute("aria-label", fav ? "Remove from favorites" : "Add to favorites");
    btn.title = fav ? "Unfavorite" : "Favorite";
    btn.textContent = fav ? "★" : "☆";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(item.id);
      // If filtering Favorites, re-apply so unfavorited drops off; else just update star UI.
      if (state.mode === "favorites") {
        refresh();
      } else {
        const now = isFavorite(item.id);
        btn.classList.toggle("is-fav", now);
        btn.textContent = now ? "★" : "☆";
        btn.setAttribute("aria-label", now ? "Remove from favorites" : "Add to favorites");
        btn.title = now ? "Unfavorite" : "Favorite";
        // Keep map popup star in sync if open
        const m = markerById.get(item.id);
        if (m && m.isPopupOpen()) m.setPopupContent(makePopupHtml(item));
      }
    });
    return btn;
  }

  function makeDismissButton(item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dismiss-btn";
    btn.setAttribute("aria-label", "Not interested");
    btn.title = "Not interested";
    btn.textContent = "Not interested";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = item.id;
      dismissListing(id);
      if (selectedId != null && String(selectedId) === String(id)) selectedId = null;
      showUndoToast(id);
      refresh();
    });
    return btn;
  }

  function renderList(items) {
    els.list.innerHTML = "";
    const total = all.length;
    const visibleTotal = all.filter((x) => !isDismissed(x.id)).length;
    els.count.textContent =
      items.length +
      (items.length === 1 ? " listing" : " listings") +
      (state.mode !== "all" && visibleTotal ? " · " + visibleTotal + " total" : "");

    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML =
        "<strong>Waiting for Home Hunt data</strong>" +
        "listings.json is empty. Home Hunt owns this file — drop real listings here and refresh.";
      els.list.appendChild(empty);
      syncMarkers([]);
      return;
    }

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      if (state.mode === "favorites") {
        empty.innerHTML =
          "<strong>No favorites yet</strong>Tap the star on a listing to save it here (stored in this browser only).";
      } else if (state.mode === "openhouses") {
        empty.innerHTML =
          "<strong>No open houses</strong>None of the current listings flag an open house.";
      } else if (state.mode === "acres") {
        empty.innerHTML =
          "<strong>No ≥0.6 acre matches</strong>Listings without acres data are excluded from this filter.";
      } else {
        empty.innerHTML =
          "<strong>No matches</strong>Try another filter chip, or tap Reset.";
      }
      els.list.appendChild(empty);
      syncMarkers([]);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const btn = document.createElement("article");
      btn.className = "card" + (selectedId === item.id ? " active" : "");
      btn.dataset.id = item.id;
      btn.setAttribute("role", "listitem");
      btn.tabIndex = 0;

      const top = document.createElement("div");
      top.className = "card-top";
      const price = document.createElement("div");
      price.className = "price";
      price.textContent = priceText(item);
      top.appendChild(price);
      top.appendChild(makeFavButton(item));
      btn.appendChild(top);

      const addr = document.createElement("div");
      addr.className = "addr";
      addr.textContent = item.address || "(no address)";
      btn.appendChild(addr);

      const cityline = document.createElement("div");
      cityline.className = "cityline";
      cityline.textContent = [item.city, item.zip, item.county]
        .filter(Boolean)
        .join(" · ");
      btn.appendChild(cityline);

      const metaBits = [
        acresText(item),
        bedsBaths(item),
        item.garage ? "Garage: " + item.garage : null,
        item.workshop ? "Shop: " + item.workshop : null,
      ].filter(Boolean);
      if (metaBits.length) {
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = metaBits.join(" · ");
        btn.appendChild(meta);
      }

      if (item.match) {
        const match = document.createElement("div");
        match.className = "match";
        match.textContent = item.match;
        btn.appendChild(match);
      }

      if (item.driveNote) {
        const drive = document.createElement("div");
        drive.className = "drive";
        drive.textContent = item.driveNote;
        btn.appendChild(drive);
      }

      const pills = document.createElement("div");
      pills.className = "pills";
      if (hasOpenHouse(item)) {
        const p = document.createElement("span");
        p.className = "pill badge-open-house";
        p.textContent = "Open house";
        pills.appendChild(p);
      }
      if (item.status) {
        const p = document.createElement("span");
        p.className = "pill " + statusClass(item.status);
        p.textContent = item.status;
        pills.appendChild(p);
      }
      if (item.type) {
        const p = document.createElement("span");
        p.className = "pill type-" + String(item.type).toLowerCase();
        p.textContent = item.type;
        pills.appendChild(p);
      }
      if (item.hoa) {
        const p = document.createElement("span");
        p.className = "pill " + hoaClass(item.hoa);
        p.textContent = hoaLabel(item.hoa);
        pills.appendChild(p);
      }
      if (Array.isArray(item.flags)) {
        item.flags.forEach((f) => {
          if (!f) return;
          const p = document.createElement("span");
          p.className = "pill flag";
          p.textContent = f;
          pills.appendChild(p);
        });
      }
      if (pills.childNodes.length) btn.appendChild(pills);

      const actions = document.createElement("div");
      actions.className = "card-actions";
      if (item.url) {
        const a = document.createElement("a");
        a.className = "card-link";
        a.href = item.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Open listing →";
        a.addEventListener("click", (e) => e.stopPropagation());
        actions.appendChild(a);
      }
      actions.appendChild(makeDismissButton(item));
      btn.appendChild(actions);

      btn.addEventListener("click", () => focusOnListing(item));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusOnListing(item);
        }
      });
      frag.appendChild(btn);
    });
    els.list.appendChild(frag);
    syncMarkers(items);
  }

  function refresh() {
    renderList(sortListings(applyFilters(all)));
  }

  function setChipActive(row, value) {
    row.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", (c.dataset.value || "") === value);
    });
  }

  function wireFilters() {
    els.filters.querySelectorAll(".chip-row").forEach((row) => {
      const key = row.dataset.filter;
      row.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip || !row.contains(chip)) return;
        state[key] = chip.dataset.value || "all";
        setChipActive(row, state[key]);
        refresh();
      });
    });
    els.reset.addEventListener("click", () => {
      state.mode = "all";
      els.filters.querySelectorAll(".chip-row").forEach((row) => setChipActive(row, "all"));
      refresh();
    });
  }

  function dataFingerprint(data) {
    const listings = Array.isArray(data.listings) ? data.listings : [];
    const ids = listings.map((x) => x && x.id).filter(Boolean).join(",");
    return String(data.updatedAt || "") + "|" + listings.length + "|" + ids;
  }

  async function loadData({ silent = false } = {}) {
    const gen = ++loadGen;
    try {
      const res = await fetch(resolveDataUrl(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (gen !== loadGen) return;
      const fp = dataFingerprint(data);
      if (fp === fingerprint) {
        els.updated.textContent = fmtUpdated(data.updatedAt);
        return;
      }
      fingerprint = fp;
      all = Array.isArray(data.listings) ? data.listings : [];
      els.updated.textContent = fmtUpdated(data.updatedAt);
      // Preserve filter state; re-render with new data
      refresh();
    } catch (err) {
      if (!silent) {
        els.updated.textContent = "Updated: (failed to load)";
        els.list.innerHTML =
          '<div class="empty"><strong>Could not load listings.json</strong>Serve this folder over HTTP (GitHub Pages or a local static server).</div>';
        console.error(err);
      }
    }
  }

  function boot() {
    wireFilters();
    initMap();
    els.updated.textContent = "Updated: …";
    loadData();
    window.addEventListener("pageshow", () => loadData({ silent: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") loadData({ silent: true });
    });
    window.addEventListener("focus", () => loadData({ silent: true }));
    window.addEventListener("resize", () => {
      if (map) setTimeout(() => map.invalidateSize(), 50);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
