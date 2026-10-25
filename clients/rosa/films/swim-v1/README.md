# Rosa swim film v1 (15 s, 9:16, light mode)

Source of `~/Videos/rosa/rosa-swim-9x16.mp4` (2026-10-04). Recovered 2026-10-25 by replaying the session
transcript `b73dd86f-b9fa-46a3-951b-1de141beba57.jsonl` (project `-home-shahar--superset-worktrees-rosa-good-dewberry-b886be00`), steps #15-#32.

Files
- `swim.html` 1080x1920. One `render(t)` per frame, t in seconds 0..15; `window.READY` when loaded. Logo path is the live `web/public/favicon.svg` of 2026-10-04.
- `lib.js` easing/tracks (subset of the favorites film's lib). `inter.woff2` Inter variable (SIL OFL).
- `audio.py` -> `audio.wav` synthesised soundtrack (numpy only).
- `render.cjs` frame renderer (Playwright from `/home/shahar/Projects/oneshot/node_modules/playwright`). Env: `HTML OUT FPS N WK VW VH`.

Render (final, as shipped: 120 fps frames, blended to 60 fps)
```
python3 audio.py
HTML=swim.html OUT=fr FPS=120 N=1800 WK=6 VW=1080 VH=1920 node render.cjs
ffmpeg -y -framerate 120 -i fr/f%05d.jpg -i audio.wav -vf "tmix=frames=2,fps=60,format=yuv420p" -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 256k -shortest -movflags +faststart rosa-swim-9x16.mp4
```
Preview (30 fps): `HTML=swim.html OUT=pv FPS=30 N=450 WK=8 VW=1080 VH=1920 node render.cjs && ffmpeg -y -framerate 30 -i pv/f%05d.jpg -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest preview.mp4`

Content: mock swim-mode screens (Hilton Beach, "Today · Oct 4"); no live data, no footage.
