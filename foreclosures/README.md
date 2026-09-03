# Foreclosures · HomePath / First Look

Static SPA for Maker Mark’s Pasco / Pinellas / Hernando foreclosure desk.

**Live (after publish):** https://mjlembo88.github.io/Real-Estate/foreclosures/

## Files

| File | Role |
|------|------|
| `index.html` | Shell |
| `app.js` | Filters, list + detail, optional Leaflet map |
| `styles.css` | Dark compact layout |
| `listings.json` | Scout data drop (starts empty) |
| `SCHEMA.md` | Field contract for Scout |
| `.nojekyll` | GitHub Pages passthrough |

## Filters

- County: Pasco / Pinellas / Hernando
- Source: HomePath / First Look / other
- Status: derived from loaded listings
- Price: min / max

Header shows **Updated: …** from `meta.updatedAt` (America/New_York).

Map appears in the detail panel only when a listing has `lat` + `lng` (or `lon`).

## Base path

Assets are relative (`./`). Works under `/Real-Estate/foreclosures/` on GitHub Pages and when served from this folder locally.

```bash
cd /workspace/foreclosures-pages && python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Scout → re-publish

1. Scout overwrites `listings.json` here (or under the Real-Estate `foreclosures/` folder) with real data — keep `listings: []` until then.
2. Run `/workspace/scripts/publish-foreclosures.sh` to copy site + JSON into the Real-Estate checkout.
3. Commit in the Real-Estate repo when ready. Do not invent listings.

See `SCHEMA.md` for the JSON contract.
