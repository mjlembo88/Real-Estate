# listings.json schema

Scout (or any feeder) overwrites `listings.json` in place. The viewer reads only this file.

## Root

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `meta` | object | yes | Viewer shows `meta.updatedAt` as “Updated: …” |
| `meta.updatedAt` | string (ISO-8601) | yes | e.g. `2026-09-03T12:00:00Z` |
| `meta.generatedBy` | string | no | e.g. `scout` |
| `meta.notes` | string | no | Freeform |
| `listings` | array | yes | Empty `[]` until data arrives |

## Listing object

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Stable unique id (Scout-assigned) |
| `address` | string | yes | Street line |
| `city` | string | yes | |
| `state` | string | no | Default `FL` |
| `zip` | string | no | |
| `county` | string | yes | One of: `Pasco`, `Pinellas`, `Hernando` |
| `source` | string | yes | One of: `HomePath`, `First Look`, `other` |
| `status` | string | yes | Freeform status (e.g. `Available`, `Pending`, `First Look`, `Sold`) |
| `price` | number \| null | no | List / offer price USD |
| `beds` | number \| null | no | |
| `baths` | number \| null | no | |
| `sqft` | number \| null | no | Living area |
| `propertyType` | string \| null | no | e.g. `SFR`, `Condo`, `Townhome` |
| `lat` | number \| null | no | If both `lat` and `lng` present, map pin is shown |
| `lng` | number \| null | no | Longitude (preferred). `lon` is also accepted as an alias |
| `url` | string \| null | no | Listing / Homepath detail URL |
| `mls` | string \| null | no | MLS number if known |
| `firstLookEnds` | string \| null | no | ISO date when First Look window ends |
| `notes` | string \| null | no | Scout notes |

## Example (do not publish as live data)

```json
{
  "meta": {
    "updatedAt": "2026-09-03T12:00:00Z",
    "generatedBy": "scout"
  },
  "listings": [
    {
      "id": "hp-example-001",
      "address": "123 Example St",
      "city": "New Port Richey",
      "state": "FL",
      "zip": "34653",
      "county": "Pasco",
      "source": "HomePath",
      "status": "First Look",
      "price": 189000,
      "beds": 3,
      "baths": 2,
      "sqft": 1200,
      "propertyType": "SFR",
      "lat": 28.24,
      "lng": -82.72,
      "url": "https://www.homepath.com/",
      "mls": null,
      "firstLookEnds": "2026-09-10",
      "notes": null
    }
  ]
}
```
