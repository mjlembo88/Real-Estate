# listings.json schema (Home Hunt)

Home Hunt (or any feeder) overwrites `listings.json` in place. The viewer reads only this file.

## Root

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `updatedAt` | string (ISO-8601) | yes | Shown as “Updated: …” (America/New_York) |
| `listings` | array | yes | Empty `[]` until data arrives |

## Listing object

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Stable unique id |
| `status` | string | yes | One of: `watch`, `over-budget`, `sold`, `dead`, `rent` |
| `type` | string | yes | `sale` or `rent` |
| `match` | string | no | Short match blurb |
| `address` | string | yes | Street line |
| `city` | string | yes | |
| `zip` | string | no | |
| `county` | string | no | e.g. Pinellas, Pasco, Hillsborough, Hernando |
| `price` | number | no | Numeric USD (sort/filter) |
| `priceLabel` | string | no | Display string; preferred over formatted `price` when set |
| `acres` | number | no | Lot size |
| `beds` | number | no | |
| `baths` | number | no | |
| `sqft` | number | no | Living area |
| `garage` | string | no | Freeform (e.g. `3-car`, `detached shop`) |
| `hoa` | string | no | One of: `none`, `cdd`, `deed`, `unknown`, `hoa` |
| `workshop` | string | no | Non-empty → “Has shop” filter |
| `lat` | number | no | Map pin when both `lat` and `lng` present (non-zero) |
| `lng` | number | no | |
| `driveNote` | string | no | Drive-time note (e.g. vs Pinellas) |
| `notes` | string | no | Internal notes |
| `source` | string | no | Origin label |
| `url` | string | no | Listing URL |
| `flags` | string[] | no | Chips; shop-related values also satisfy “Has shop” |

## Filter rules (viewer)

- **Buy:** `type === "sale"` and status not `dead`/`sold` (includes `over-budget`)
- **Rent:** `type === "rent"` OR `status === "rent"`
- **Watch:** `status === "watch"`
- **Has shop:** `workshop` non-empty OR `flags` contain shop/workshop OR `garage` mentions workshop/shop

## Empty seed

```json
{
  "updatedAt": "2026-09-17T10:25:07-04:00",
  "listings": []
}
```

Do not invent live listings. Home Hunt owns the file.
