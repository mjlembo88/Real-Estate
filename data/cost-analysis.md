# Tampa Bay mobile home parks — roster + cost analysis
Roster from Florida DBPR `mhmailing.csv` (2026-08-27). Lot rents and sale comps from park pages, MHVillage, operator sites, MMI, and listing rundowns opened the same day. MHBO $475–$725 bands look like recycled placeholders and are **not** used below.

## Headcount (official)

| Area | Parks | Lots filed |
|---|---:|---:|
| Pasco | 92 | 12,808 |
| Hillsborough | 172 | 18,610 |
| Polk | 222 | 31,648 |
| **Three counties** | **486** | **63,066** |
| Plant City (address, subset of Hillsborough) | 24 | 2,794 |

Lot counts are filed capacity, not occupied. MHVillage “near county” counts include nearby counties.

## How the money works

1. **Land-lease park** — residents own the home, pay monthly **lot rent**. Park NOI is lot rent.
2. **Park-owned rental** — park owns the home too (example: Club Wildwood featured **home rents $1,899/mo**). Do not mix that with lot rent.

GPI (lot-rent only) = lots × monthly lot rent × 12 × occupancy.

## Advertised lot rent (opened pages, not MHBO placeholders)

| Park | City | DBPR lots | Lot rent | Source |
|---|---|---:|---|---|
| Fountainview Estates | Tampa | 546 | **$685/mo** (MHVillage); one 2019 2/2 also **$673 + $45 trash** | mhvillage.com/parks/5994 ; manufacturedhomes.com dealer inventory |
| Countryside Village MHC | Tampa (Town ’n’ Country) | 414 | **$725/mo** | mhvillage.com/parks/6900 |
| Village of Tampa | Tampa | 463 | **$588/mo** | mhvillage.com/parks/7033 |
| Jersey Mobile Home Park | Tampa | (operator page) | **$725/mo** | boavidacommunities.com |
| Anclote Acres | Holiday | listing-level | **$555** | homes.com Pasco mobile under $100k |
| Holiday Travel Park | Holiday | listing-level | **$659** | same |
| Sunnyside MHP | Zephyrhills | listing-level | **$885** (water/sewer/trash included per listing) | lakehouse.com / homes.com |
| Forest Lake Estates | Zephyrhills | 1,068 | **$981** (trash + lawn per listing) | same |
| MCN Trailer Park | Tampa | RV lots, not typical MH | **$600–$800** by lot size (eff. 2/13/2026) | tampalots.com |

Not published on the park page we opened: StrawBerry Ridge Village (Valrico), Paradise Village (Tampa). Kingswood Riverview $805/$69,500 404’d on re-fetch — not confirmed.

## Illustrative GPI from confirmed lot rent (not NOI)

Occupancy **95%** is an underwrite assumption, not measured at these parks.

| Park | Lots | Rent used | Occ. used | Annual GPI |
|---|---:|---:|---:|---:|
| Fountainview Estates | 546 | $685 | 95% | $4,260,246 |
| Countryside Village | 414 | $725 | 95% | $3,421,770 |
| Village of Tampa | 463 | $588 | 95% | $3,101,258 |
| Forest Lake Estates | 1,068 | $981 | 95% | $11,947,010 |

Opex is not subtracted. Hideaway Hills’ OM is the only Tampa Bay expense ratio we opened: **~41%** of income. Do not apply that to every park.

## In-park home asking prices (listings, not sold)

- **Village of Tampa:** $39,000 to $269,900 (wide; includes cheap older stock and newer).
- **Fountainview (Cal-Am):** new/recent $198,900–$219,900.
- **Cypress Lakes Village, Lakeland (Cove):** $179,900 / $154,900 / $69,900; promo up to 12 months free lot rent on new.
- **Club Wildwood, Hudson (Sun):** home asks $79,500–$189,995; park-owned **home rent $1,899/mo** on two featured homes.

## Published park sale / listing comps

**Closed — Gasparilla Portfolio (Hillsborough: Thonotosassa, Gibsonton, Ruskin)**  
5 properties, **656 sites**, closed ~Aug 28, 2025, >90% occupied, >85% tenant-owned. MMI press release: **no price**. Broker site (mhpbroker.com): **+/- $80,000,000**, “+/- 700 sites,” called the largest 2025 FL MHC sale. Implied **~$114k–$122k/site** only if you use that broker $80M. https://www.marcusmillichap.com/news-events/press/2025/09/marcus-millichap-brokers-five-property-manufactured-home-community-sale-in-tampa-bay-area

**On market — Sandy’s / 7726 Gibsonton Dr, Gibsonton (16 lots)**  
MMI: **$1,550,000**, **$96,875/space**, **7.20% cap**, 94% occ, blended lot rent **~$700**. A 6/3/2026 rundown still showed **$1,700,000 / 6.56% cap**. https://www.marcusmillichap.com/properties/189159/7726-gibsonton-drive

**On market — Hideaway Hills MH & RV, Gibsonton (58 sites)**  
**$5,100,000** (~**$87,931/site**). Mix: 18 MH / 36 RV / 3 cottages / 1 SFR. In-place income **~$567,477**, NOI **~$335,968**, expense ratio **~41%**. MH rent ~$750, RV ~$715.

**On market — Happy Hollow, Lakeland**  
**$1,000,000**, **20 sites** ($50,000/site if you divide). Seller financing noted.

**Confidential Yale (names not published, same 6/3/2026 rundown)**  
- Senior MHC, Tampa Bay MSA: **$37,000,000**, 200–250 sites, **4.01% cap**, **$145k–$182k/site**.  
- 55+ MHC, north of Tampa: **$2,600,000**, 30–40 sites, **5.09% cap**, **$65k–$87k/site**.

**Micro — 4410 Pine St, Valrico** (6 units + pad for 2): **$700,000**, advertised 11.7% cap. Tiny pad park, not community-scale.

No LoopNet/Crexi Tampa Bay MHC prices were successfully opened. No closed $/unit besides the Gasparilla broker-site $80M figure.

## What that implies (labeled)

- Institutional 55+ in this MSA is being asked at **~4% cap** and **$145k–$182k/site**.
- Small all-age / mixed RV is on the market around **$50k–$97k/site** and **~6.5–7.2% cap**.
- A 16-lot Gibsonton listing at ~$700 lot rent and 7.2% cap is the only full underwrite we have. Scale that only as a check, not a bid.

Full roster: `tampa-bay-mh-parks.csv` and `tampa-bay-mh-parks.md`.
