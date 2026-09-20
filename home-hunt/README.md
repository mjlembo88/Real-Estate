# Home Hunt · Tampa Bay

Mobile-first living dashboard for Maker Mark’s Tampa Bay home search — filterable cards + Leaflet map (Esri World Dark Gray).

**Live (after publish):** https://mjlembo88.github.io/Real-Estate/home-hunt/

## Files

| File | Role |
|------|------|
| `index.html` | Shell |
| `app.js` | Filters, cards, Leaflet map, cache-bust reload |
| `styles.css` | Dark mobile-first UI (foreclosures palette) |
| `listings.json` | **Home Hunt owns this file** — overwrite in place |
| `SCHEMA.md` | Field contract |
| `.nojekyll` | GitHub Pages passthrough |

## Filters

- **All** — every listing except `dead` / `sold` (and dismissed)
- **Buy** — `type: sale`, excluding `dead` / `sold` (still shows `over-budget`)
- **Rent** — `type: rent` OR `status: rent`
- **Watch** — `status: watch`
- **Has shop** — non-empty `workshop`, or flags/garage mentioning shop/workshop
- **≥0.6 ac** — `Number(acres) >= 0.6`; missing/null acres are excluded (not invented); graveyard hidden
- **Favorites** — starred listings only (includes dead/sold so history isn’t lost; status pill still shows; dismissed never shown)
- **Open houses** — listings with truthy `openHouseToday` / `open_house_today`, or non-empty `openHouse` (string/object); graveyard + dismissed hidden

Hard-filter strip (context only, not a client filter): ≥0.6 acres, large garage/workshop or shop-capable land, no HOA (flag CDD/deed), ≤30 min of Pinellas, buy ≤$500k / rent <$3500.

## Favorites & dismissed (browser only · v1)

Star on each card (and map popup) toggles a favorite. **Not interested** on each card dismisses a listing permanently for this browser.

| Key | Shape |
|-----|--------|
| `home-hunt-favorites-v1` | JSON `string[]` of listing `id`s |
| `home-hunt-dismissed-v1` | JSON `string[]` of listing `id`s |

Both are **never** written into `listings.json` — that file stays Home Hunt–owned. Dismissed ids are hidden in **every** filter mode (including Favorites and Open houses) so republished listings stay gone. After dismiss, a ~5s **Removed · Undo** toast restores the id.

Helpers (`loadFavorites` / `saveFavorites` / `loadDismissed` / `saveDismissed`) keep storage behind a small API so a future sync layer can replace localStorage without rewriting UI.

**Sign-in / sync (future):** v1 is local-only. A later **X (Twitter)** sync would merge remote favorites + dismissed with local. No Google Auth / Firebase in this build.

## Data drop

Home Hunt writes `/workspace/home-hunt/listings.json` (and the published copy under Real-Estate). Empty `listings: []` shows “Waiting for Home Hunt data”. See `SCHEMA.md`.

## Local preview

```bash
cd /workspace/home-hunt && python3 -m http.server 8766
# open http://127.0.0.1:8766/
```

Assets are relative (`./`). Works under `/Real-Estate/home-hunt/` on GitHub Pages.

## Publish

```bash
/workspace/scripts/publish-home-hunt.sh
```

Copies into the Real-Estate checkout at `home-hunt/`. Does **not** commit or push — parent / CoS publishes.
