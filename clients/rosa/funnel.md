# Rosa — funnel

Status: **draft for CP1**, 2026-10-24.

## Conversion events (GA4 `G-NKQNM6YLQ1`, all already firing per `web/src/ga.ts`)

| Event | Counts as | Notes |
|---|---|---|
| `spot_view` | engaged visit | from a reel's spot link |
| `share` | advocacy | method native / copy |
| `push_optin_start` | activation | the `SWELL` keyword's goal |
| `app_install` | activation | pwa; Play excluded until public |
| `favorite_add` | **lead** | requires Google sign-in |
| `favorite_remove`, `message_send`, `page_view` | context only | |

Vercel Web Analytics is not enabled on the project; GA4 is the only visitor source.

## UTM scheme

`https://rosa.surf/<path>?utm_source=instagram&utm_medium=social&utm_campaign=<slot_id>&utm_content=<bio|reel|dm>`

- Bio link: `utm_campaign=bio`, updated weekly to the current week's featured spot or
  `/charts`.
- Keyword DM links: `utm_content=dm`, `utm_campaign=<slot_id>` of the reel that earned
  the comment.
- `ga4.py` groups sessions and events by `utm_campaign`, so one slot maps to one row.

## Landing pages

| Pillar | Landing |
|---|---|
| Why this rating, Spot spotlight, Swell alert | `/spot/<id>` of the spot in the reel |
| Swell map | `/charts` |
| Free, no paywall | `/` |
| Shops and schools | `/widget/?spot=<id>&theme=dark` demo plus a DM with the embed tag |

## Link in bio

One link, to `rosa.surf` with the bio UTM. No link-in-bio service in phase 1.

## Product asks (not built in Rosa yet)

- Numeric GA4 property id for the Data API into `grants.yaml`.
- Search Console + sitemap submission (organic is the second funnel).
- A shareable `/charts` state (URL with region and time) so the swell-map reel can link
  to the exact view.
