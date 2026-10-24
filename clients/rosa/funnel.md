# Rosa — funnel

Status: **approved at CP1, 2026-10-24.**

## Conversion events (GA4 `G-NKQNM6YLQ1`, all already firing per `web/src/ga.ts`)

| Event | Counts as | Notes |
|---|---|---|
| `spot_view` | engaged visit | from a reel's spot link |
| `share` | advocacy | method native / copy |
| `push_optin_start` | activation | swell-alert reels' goal |
| `app_install` | activation | pwa; Play excluded until public |
| `favorite_add` | **lead** | requires Google sign-in |
| `favorite_remove`, `message_send`, `page_view` | context only | |

Vercel Web Analytics is not enabled on the project; GA4 is the only visitor source.

## UTM scheme

`https://rosa.surf/<path>?utm_source=instagram&utm_medium=social&utm_campaign=<slot_id>&utm_content=<bio|comment|reply|screen>`

- Bio link: `utm_campaign=bio`, updated weekly to the current week's featured spot or
  `/charts`.
- First-comment links: `utm_content=comment`, `utm_campaign=<slot_id>`. Reply links to a
  question: `utm_content=reply`. Never a keyword funnel.
- `ga4.py` groups sessions and events by `utm_campaign`, so one slot maps to one row.

## Landing pages

| Pillar | Landing |
|---|---|
| Why this rating, Spot spotlight, Swell alert | `/spot/<id>` of the spot in the reel |
| Swell map | `/charts` |
| Free, and why | `/` |
| Shops and schools | `/widget/?spot=<id>&theme=dark` demo; the embed tag is on the page and in the first comment |

## Link in bio

One link, to `rosa.surf` with the bio UTM. No link-in-bio service in phase 1.

## Product asks (not built in Rosa yet)

- Numeric GA4 property id for the Data API into `grants.yaml`.
- Search Console + sitemap submission (organic is the second funnel).
- A shareable `/charts` state (URL with region and time) so the swell-map reel can link
  to the exact view.
