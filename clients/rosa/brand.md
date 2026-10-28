# Rosa — brand and voice

Status: **draft for CP1**, 2026-10-24. Voice items marked `[assumed]` need the operator.
The voice section is mirrored to `~/.claude/instagram/voice.md` once approved, so the
`ig-*` skills read it.

## Voice

**How Rosa talks on screen.** Short, concrete, a surfer explaining to a friend, not a
brand explaining to a market. Numbers over adjectives. One claim per card. The app's own
copy sets the register: "free, lean, fast, shareable, minus the bloat and paywall."

**Who speaks.** With a voice-over: an avid surfer who loves Rosa (operator decision
2026-10-24), first person, talks the way the comment section talks. Without a
voice-over (operator rule 2026-10-24): the brand speaks, second person ("open it, your
spots are there"), never "I" or "my". The app
is what the camera looks at; the surfer is the voice. No founder-on-camera in phase 1.

**Voice-over (2026-10-25).** About 1 reel in 4 carries one. An avid surfer who uses the app,
first person, explains one feature from a real session: 2-3 short spoken lines, 6-9 s,
contractions, plain words, no em dashes, no hype words. Generated locally (`spine/voice.py`,
Kokoro TTS, voice `am_michael`), -16 LUFS, music ducked about 12 dB under it.

**App theme (2026-10-25).** Mix light and dark app captures, about half each across a week.

**Words we never say.** game-changer, revolutionary, seamless, unlock, elevate,
powerful, next-level, "the only app you need", "best forecast", "most accurate",
"exact", "precise", "AI-powered", any accuracy claim. **No competitor is ever named or
alluded to** (operator decision 2026-10-24): we state our advantages and values, not
anyone else's gaps. Reference for the register: @lineup.experience's Brittany reel,
which sells with local knowledge and a soft CTA and never claims accuracy.

**Words we use.** free, worldwide, 3,056 spots, 16 days, four times a day, why this
rating, size · period · wind, swell alert, install it, your spots, share a spot.

**Positions we hold.** A forecast should say *why* it rates a day. Forecasts should be
free; the data is public and we credit it. Fast beats bloated. Wind can only polish.

**Off limits.** Accuracy comparisons. Swim-mode claims (weights untuned). The Play
Store (listing not public). Live cams we do not have rights to. Anything the attribution
line does not cover.

**Proof we may use.** The spot count, horizon and refresh cadence from `product.md`; the
rating explanation in words; real screen captures of the live app; the 14 official
cams with owner credit; the data sources with their attribution line.

**CTA (operator rule, 2026-10-24).** "Comment for the link" is **never allowed**, in any
form. Every reel ends with one ask that lands on rosa.surf, using one of: "rosa.surf,
link in bio"; the URL spoken and on the
end card ("rosa.surf, it's free"); a spot share link in the caption text. Questions in
the comments get the link in the reply, always. Week-4 experiment compares link in bio
vs URL on screen, by sessions per UTM. No link in a comment, ever: Instagram comments are not clickable (operator, 2026-10-24).

## Visual identity

- Accent `#11b7f2`, tile `#032afa`. Light text `#0d1225` on `#f4f3f3`; dark text
  `#f5f0e8` on `#000000`. Rating colours Fair `#11b7f2` · Good `#24b161` · Epic
  `#0c6733`. Wind good `#24b161` · cross `#e48022` · bad `#d0574a`.
- Font Inter Variable everywhere, including burned-in captions.
- Logo files in `web/public/` (`icon.svg`, `icon-maskable.svg`). Logo appears only on
  the end card, never as an intro sting.
- Motion language: the showreel clips of 2026-10-04 (`~/Videos/rosa/`) are the bar
  (operator, 2026-10-25: "a million times better"): the phone moving in 3D space, Pixabay
  ocean footage behind it, fast and fun, every feature shown; sources recovered into
  `films/showreel-v14`, `films/favorites-v1`, `films/swim-v1`.

## Banned on screen

- Stock footage presented as the product or as Rosa's own. Atmosphere footage (ocean, waves,
  surfers) from Pixabay under the Pixabay Content License is allowed behind the UI (operator,
  2026-10-25: the 2026-10-04 reels used it and that is the bar); no on-screen credit (the
  licence needs none); every clip listed in `assets/footage/SOURCES.md`.
- Small print on screen (operator, 2026-10-25): no text under 34 px at 1080×1920, no small-caps
  labels, no data attribution or footage credit in the video. Only our messages, large and
  readable. No data attribution in the caption either (operator, 2026-10-28): the app credits
  its sources itself. Caption structure: spine/caption.py.
- Watermarks, third-party logos, other apps' UI.
- Numbers not in `product.md`.

## Voice-over

- Who: a surfer friend telling you about one feature. Easygoing, likeable, approachable,
  relatable; laid back or stoked, never a newsreader (operator, 2026-10-25). Voices vary
  across clips (`spine/voice.py` ROSTER, rotated per week).
- How it sounds: speech, not copy. Short bits, contractions, "okay so", "honestly", "dude" at
  most once. No em dashes.
- **"Rosa" is said "Roza", always** (operator, 2026-10-25). `spine/voice.py` PRONOUNCE spells
  it phonetically in the speech input only; "rosa.surf" is said "Roza dot surf".
