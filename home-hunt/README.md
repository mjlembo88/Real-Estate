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

- **All** — every listing
- **Buy** — `type: sale`, excluding `dead` / `sold` (still shows `over-budget`)
- **Rent** — `type: rent` OR `status: rent`
- **Watch** — `status: watch`
- **Has shop** — non-empty `workshop`, or flags/garage mentioning shop/workshop

Hard-filter strip (context only, not a client filter): ≥0.75 acres (0.70–0.74 borderline), large garage/workshop or shop-capable land, no HOA (flag CDD/deed), ≤30 min of Pinellas, buy ≤$500k / rent <$3500.

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
