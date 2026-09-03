# Foreclosures · HomePath / First Look

Phone-friendly static SPA for Maker Mark’s Pasco / Pinellas / Hernando foreclosure desk.

**Live:** https://mjlembo88.github.io/Real-Estate/foreclosures/

## UX

- Sticky compact header + horizontal **chip filters** (County / Source / First Look / price quick picks)
- **Card grid** with thumb, big price, address, beds/baths/sqft, source chip, First Look days-left badge
- Tap a card → **bottom sheet** (mobile) or **side panel** (wide) — no competing dual scroll panes
- Primary CTA: **Open listing**; MLS when present; long notes collapsed by default
- Photos: `photo` (string) and/or `photos` (string[]) — calm placeholder when missing

## Files

| File | Role |
|------|------|
| `index.html` | Shell |
| `app.js` | Chips, card grid, sheet detail, optional Leaflet map |
| `styles.css` | Dark, tight spacing, large tap targets |
| `listings.json` | Scout data drop |
| `photos/` | Optional Scout image drop (referenced from JSON) |
| `SCHEMA.md` | Field contract for Scout |
| `.nojekyll` | GitHub Pages passthrough |

## Filters

- County: Pasco / Pinellas / Hernando
- Source: HomePath / First Look / other
- First Look: active window only (`firstLookEnds` in the future)
- Price chips: ≤$150k / ≤$250k / ≤$350k / $350k+

Header shows **Updated: …** from `meta.updatedAt` (America/New_York).

## Base path

Assets are relative (`./`). Works under `/Real-Estate/foreclosures/` on GitHub Pages and when served from this folder locally.

```bash
cd /workspace/foreclosures-pages && python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Scout → re-publish

1. Scout overwrites `listings.json` (and optionally adds files under `photos/`) — never invent listings or fake photo URLs.
2. Run `/workspace/scripts/publish-foreclosures.sh` to copy site + JSON into the Real-Estate checkout.
3. Commit in the Real-Estate repo when ready.

See `SCHEMA.md` for the JSON contract (including `photo` / `photos`).
