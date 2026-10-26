# Rosa favorites film v1 (15 s, light mode)

Source of `~/Videos/rosa/rosa-favorites-9x16.mp4` (2026-10-04). Recovered 2026-10-25 by replaying the
session transcript `6dcbf668-683b-43ae-9e78-b4162e16f0c0.jsonl` (project `-home-shahar--superset-worktrees-rosa-good-dewberry-b886be00`).

Files
- `fav.html` 1920x1080, `fav_v.html` 1080x1920 (the shipped 9:16). One `render(t)` per frame, t in seconds 0..15; `window.READY` when loaded.
- `lib.js` / `lib_v.js` easing, tracks, phone mark, icons. `pts.js` spot lat/lon dots, regenerated from `data/spots/*.yaml` on 2026-10-25 (3046 points; the 2026-10-04 original had 2731).
- `inter.woff2` Inter variable (SIL OFL), from `@fontsource-variable/inter`.
- `audio2.py` -> `audio2.wav` synthesised soundtrack (numpy only).
- `mkvert.py` makes `fav_v.html`, `index_v.html`, `lib_v.js` from the 16:9 files by asserted string swaps. Re-run after editing `fav.html`.
- `index.html` / `index_v.html` / `audio.py`: the 15 s dark reel (`rosa-showreel.mp4`) from the same session, kept because `mkvert.py` reads it.
- `render.cjs` frame renderer (Playwright from `/home/shahar/Projects/oneshot/node_modules/playwright`). Env: `HTML OUT FPS N WK VW VH`.

Render (final, as shipped: 120 fps frames, blended to 60 fps)
```
python3 audio2.py
HTML=fav_v.html OUT=fr FPS=120 N=1800 WK=4 VW=1080 VH=1920 node render.cjs
ffmpeg -y -framerate 120 -i fr/f%05d.jpg -i audio2.wav -vf "tmix=frames=2,fps=60,format=yuv420p" -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 256k -shortest -movflags +faststart rosa-favorites-9x16.mp4
```
16:9: `HTML=fav.html VW=1920 VH=1080` and the same ffmpeg line.
Preview (30 fps, ~1 min): `HTML=fav_v.html OUT=pv FPS=30 N=450 WK=8 VW=1080 VH=1920 node render.cjs && ffmpeg -y -framerate 30 -i pv/f%05d.jpg -i audio2.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest preview.mp4`

Content: mock forecast rows ("Today · Oct 4"), 12 named spots; no live data, no footage.
