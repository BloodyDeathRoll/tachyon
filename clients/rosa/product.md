# Rosa — product facts sheet

Status: **draft for CP1**, 2026-10-24. Every number below was measured on that date from
the live site or `origin/main` of `~/Projects/rosa` (commit d0e58cf). This file is the
only source the Factory may put on screen. Re-measure anything older than 14 days.

## What it is

- A free, worldwide, mobile-first surf forecast web app (PWA) at https://rosa.surf.
  No paywall, no trial, no price anywhere in the code (`web/src` searched for paywall,
  trial, premium, stripe, price: none). Being free is a design rule (`CLAUDE.md:25`).
- Site title: "Rosa - free surf forecast, worldwide". Site description: "Free 15-day
  surf forecast, worldwide." (`web/index.html:16,38,45`)
- English only (`<html lang="en">`).

## Numbers

| Fact | Value | Source |
|---|---|---|
| Spots | **3,056** | `GET rosa-data-opal.vercel.app/data/index.json`, counted |
| Countries / regions | 55 / 127 | same |
| Top countries | USA 505 · Brazil 360 · Australia 277 · UK 196 · Spain 192 · Japan 126 · Chile 115 · South Africa 103 · Indonesia 97 · France 84 | same |
| Forecast horizon | **16 days including today** (3-hour steps) | `pipeline/.../fetch.py:24 FORECAST_DAYS = 16` |
| Refresh | **4 runs a day**, 02:20 / 08:20 / 14:20 / 20:20 UTC | `deploy/oracle/setup.sh:24-26` |
| Live cams | **14**, all official YouTube embeds: Japan 5, Portugal 3, California 2, Costa Rica 2, Hawaii 1, Israel 1 | `git grep "cam: {" origin/main -- data/spots` |
| Entry JS / CSS | 184 KB / 70 KB raw, 63 KB / 15 KB gzip | measured on live entry files |
| Spot JSON | ~63 KB (carcavelos) | measured |

On-screen wording: the site says "15-day"; the measured horizon is 16 days including
today. **Pick one before any clip ships.** The existing clips were made 2026-10-04 and
may carry old numbers (2,254 or 2,290 spots): re-measure before reuse.

## The rating (what we may explain)

- Score 0–100 = size (0–40) + period (0–20) + wind (0–40). Wind points are scaled by
  `min(1, (size+period)/60)`, so wind alone cannot lift a flat day
  (`pipeline/src/rosa_pipeline/score.py:1-47`, `docs/ALGORITHM.md`).
- Buckets: 0–9 Flat · 10–29 Poor · 30–49 Fair · 50–69 Good · 70+ **Epic**
  (`web/src/conditions.ts:12`).
- The app explains this in words on `/about/reading` and shows Size / Period / Wind
  bars on every spot page. The exact 40/20/40 split is in the repo, not in the app
  copy: we may say "size, period and wind, and wind can only polish", and may show the
  bars.

## Features that are live

- **Install as an app** (PWA, offline copy of the last forecast). Google Play wrapper
  `surf.rosa.app` exists but the store page returns 404 today: do not mention Play.
- **Push swell alerts** (`web/src/push.ts`). Swell events appear only as push.
- **Favorites**, grouped by country, need Google sign-in; the forecast never does.
- **Share**: native share sheet or copy link; every spot has a 1200×630 share card.
- **Widget**: `https://rosa.surf/widget/?spot=<id>&theme=dark|light&units=metric|imperial`,
  embeddable by any site (`frame-ancestors *`). Skill `/rosa-widget` generates the tag.
- **Swell map** `/charts` (rotates with the map since 2026-10-24) and map `/map`.
- **Spot pages** `/spot/<id>`, prerendered; about pages `/about/how|reading|terms|privacy|contact`.
- **Units**: m/ft, °C/°F; wind km/h with metres, knots with feet.
- **Surf / Swim mode** (swim weights mostly untuned: do not make claims about swim).
- Water clarity and bathing-water quality on the spot card (CMEMS, EEA, NSW Beachwatch).

## Data and proof we may use

- Waves: 50/50 blend of NOAA GFS-Wave and ECMWF open data. Weather: GFS via self-hosted
  Open-Meteo. Peak periods: DWD GWAM. Sea temp: NOAA OISST. Tides: EOT20.
- **Attribution is required on every forecast**: "Waves: NOAA GFS-Wave + ECMWF open
  data (CC-BY 4.0) · Peak periods: DWD GWAM (CC-BY 4.0) · Weather by Open-Meteo.com
  (CC-BY 4.0) · Sea temp: NOAA OISST · Tides: EOT20 (CC-BY 4.0)" (`publish.py:22-26`).
  Any clip that shows a forecast carries this line in the caption or on the end card.
- No measured accuracy comparison with Surfline exists. **Never claim accuracy.**
  Buoy ground truth exists only for the US and Portugal.

## Traction (private unless the operator says otherwise)

- 33 user accounts on 2026-10-23 after cleaning Tango sign-ins; real sign-ups "near zero".
- GA4, 28 days to 2026-10-06: ~1,000 users, ~480 via the Tango app (not surfers).
- 27 `app_install` events 2026-09-13..19.
- Organic search exists (prose, unmeasured). Search Console not set up.

## Red lines (from the client's own docs)

- Never use Surfline data, text, cams or spot list; never name-compare without a
  measurement. Never use Surfers Against Sewage data. Never scrape cameras; cams only
  if officially embeddable or by partnership; credit the owner (`by`, `by_url`).
- Open-Meteo free tier is non-commercial: re-check before any paid offer. ISRAMAR is
  all-rights-reserved.
- Do not mention the Play Store until the listing is public.

## Brand assets (`web/public/`)

- Logos: `favicon.svg`, `icon.svg`, `icon-maskable.svg` (blue tile, white mark),
  `icon-192/512.png`, `og.jpg`, `splash.jpg`.
- Accent `#11b7f2`; tile / theme `#032afa`. Light: text `#0d1225`, bg `#f4f3f3`,
  primary `#1c2137`. Dark: bg `#000000`, text `#f5f0e8`. Rating: Fair `#11b7f2`,
  Good `#24b161`, Epic `#0c6733`. Wind: good `#24b161`, cross `#e48022`, bad `#d0574a`.
- Font: Inter Variable.

## Open items that touch marketing

- `[assumed]` "15-day" vs "16-day" wording.
- Numeric GA4 property id for `grants.yaml` (the measurement id is `G-NKQNM6YLQ1`).
- Play Store listing not public. Search Console not set up, sitemap never submitted.
- Local checkout `~/Projects/rosa` is 113 commits behind `origin/main`; pull before any
  app capture.
