# listings.json schema v2 (Home Hunt)

Root: `{ "updatedAt": ISO-8601, "schemaVersion": 2, "criteria"?: string, "listings": [] }`

The board shows a listing by default only if `match` starts with `hard` or `weak` (case-insensitive) and `status` is not `dead`/`sold`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | **Stable** unique id — synced favorites/notes key on it. Never reuse or renumber. |
| `status` | string | `watch`, `over-budget`, `sold`, `dead` |
| `type` | string | `sale` |
| `match` | string | `hard` or `weak` (may be followed by a short blurb, e.g. `weak — ac 0.9`) |
| `flags` | string[] | e.g. `construction_unverified`, `outbuilding_unverified`, `x_shaded`, `flood_unverified` (shown as dashed “unverified” pills) |
| `address`, `city`, `zip`, `county` | string | |
| `price` | number | USD; `priceLabel` (string) overrides display |
| `beds`, `baths`, `sqft`, `acres` | number | |
| `construction` | string | e.g. `CBS`, `frame`, `CBS (per remarks)` |
| `floodZone` | string | e.g. `X`, `X (shaded)`, `AE` |
| `floodSource` | string | Where the zone came from (FEMA NFHL, county GIS, listing) |
| `outbuilding` | string \| bool | e.g. `detached garage`, `barn`, `workshop` |
| `workshop` | string | Evidence text for the outbuilding |
| `driveNote` | string | Minutes to Hudson |
| `lat`, `lng` | number | Map pin |
| `url`, `source`, `notes`, `garage`, `hoa` | string | optional |
| `openHouse` / `openHouseToday` | string/object / bool | optional |

Do not invent listings. Home Hunt owns the file.
