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

`https://rosa.surf/<path>?utm_source=instagram&utm_medium=social&utm_campaign=<slot_id>&utm_content=<bio|screen|reply_dm>`

- Bio link is fixed: `https://rosa.surf/ig` (edge redirect, Rosa PR "web: /ig edge redirect"). Its
  target is `meta.json.bio_link_while_live` of the newest live reel, moved by `publish.py` via
  `spine/publisher/links.py` (Vercel Edge Config `tachyon-links`, item `rosa_ig`). Nobody edits the profile.
- No links in comments (not clickable). A question in the comments is answered "link in bio"; a DM reply may carry the link with `utm_content=reply_dm`. Never a keyword funnel.
- Per-post attribution therefore comes from the bio link's `utm_campaign`, changed each time a reel goes live, and from the URL on screen (`utm_content=screen` is not typeable; count it as direct).
- `ga4.py` groups sessions and events by `utm_campaign`, so one slot maps to one row.

## Landing pages

| Pillar | Landing |
|---|---|
| Why this rating, Spot spotlight, Swell alert | `/spot/<id>` of the spot in the reel |
| Swell map | `/charts` |
| Free, and why | `/` |
| Shops and schools | `/widget/?spot=<id>&theme=dark` demo; the embed tag is on the page |

## Link in bio

One link, `https://rosa.surf/ig`, set once. It redirects to the newest reel's landing page with that slot's UTM.

## Product asks (not built in Rosa yet)

- Numeric GA4 property id for the Data API into `grants.yaml`.
- Search Console + sitemap submission (organic is the second funnel).
- A shareable `/charts` state (URL with region and time) so the swell-map reel can link
  to the exact view.
