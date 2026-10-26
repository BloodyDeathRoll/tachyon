import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, countUp, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  16 days out, 12 s. Hook "Plan the trip 16 days out." in big Inter numerals over Pixabay surf footage
  (218670_large). The phone rises on captures/charts.png and the timeline scrubber slides from Sun across
  to Sat 18:00 (where the capture's own label sits). Swipe to captures/spot-uluwatu-full.png and step the
  day strip, 25 → 30, one day at a time. Card: "Pick your swell window." End card: logo, rosa.surf/charts,
  Footage: Pixabay. Numbers: product.md (16 days including today, 3-hour steps); 2026-10-25 is a Sunday.
*/

export const SECONDS = 12;
const T = { hook: 0, phone: 2.3, scrub: 2.9, scrubEnd: 5.0, swipe: 5.3, days: 5.8, card: 8.2, end: 9.7, out: 12 };

// charts.png timeline in screen px (400 wide): Sun 00:00 at x 78, Sat 00:00 at x 334, handle y 720–745
const SCRUB = { x0: 78, x1: 334, y: 720, h: 26 };
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = 162;   // Sun 00:00 → Sat 18:00
// spot-uluwatu-full.png day strip in screen px: cell centres 25…31, pitch 57.5, strip y 68–203
const ULU_SCROLL = 40;
const CELL = (i: number) => 40.6 + 57.5 * i;
const STRIP = { y: 68 - ULU_SCROLL, h: 135, w: 54 };
const DAY_NAMES = ["Sun 25", "Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30"];
const STEPS = 5, STEP = 0.42;

// Rosa loading-screen particles, ported 1:1 from rosa/web particles.ts with the splash's options (main.tsx
// splashParticles: density 1.4, alpha 0.3, two-tone palette) on the splash's 460 px bottom band, screen-blended:
// specks rise off the bottom and fade as they climb. Pure function of t: each speck loops its own life with
// fresh seeded values per cycle. App px (430 wide phone) scaled by PS.
const PS = 2.5, BAND = { h: 460 * PS }, ALPHA = 0.3;
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const N = Math.round(((1080 / PS) * (BAND.h / PS)) / 11000 * 1.4);
const SPECKS = Array.from({ length: N }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`sl${i}`)), off: random(`so${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`s${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = BAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const fadeIn = Math.min(1, (BAND.h - y) / (80 * PS)), fadeOut = Math.min(1, Math.max(0, y) / (BAND.h * 0.55));
  const a = (0.22 + depth * 0.7) * ALPHA * fadeIn * fadeOut * tw * env;
  return { x, y, depth, rad, bucket, a: Math.max(0, Math.min(1, a)), color: PALETTE[Math.floor(r("c") * PALETTE.length)] };
};
const Particles: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const ps = SPECKS.map(({ i, life, off }) => {
    const k = Math.floor((t + off) / life);
    return { i, ...speck(i, k, t + off - k * life, life) };
  }).filter((p) => p.a > 0.002).sort((a, b) => a.depth - b.depth);
  const dot = (p: (typeof ps)[number], rad: number, blur: number, a: number, key: string) => (
    <div key={key} style={{ position: "absolute", left: p.x - rad, top: p.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%",
      background: `rgb(${p.color})`, opacity: a, filter: blur ? `blur(${blur * PS}px)` : undefined }} />
  );
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: 1080, height: BAND.h, opacity: o, overflow: "hidden", pointerEvents: "none", mixBlendMode: "screen" }}>
      {ps.filter((p) => p.bucket === 0 && p.rad > 1.4 * PS).map((p) => dot(p, p.rad * 2.6, 8, p.a * 0.55, `g${p.i}`))}
      {ps.map((p) => dot(p, p.rad, p.bucket, p.a, `d${p.i}`))}
    </div>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: rises after the hook, floats, leaves before the end card ──
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 3.5 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const pop = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.1));
  const pose = {
    x: -205, y: lerp(900, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, pop),
    rx: float.rx + lerp(18, 0, enter), ry: float.ry + lerp(-22, 0, enter), rz: float.rz,
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── scrubber: Sun 00:00 → Sat 18:00 in 3-hour steps ──
  const scrubK = inOut(seg(t, T.scrub, T.scrubEnd));
  const hour = Math.round((scrubK * HOURS) / 3) * 3;
  const hx = lerp(SCRUB.x0, SCRUB.x1, (scrubK * HOURS) / 144);
  const dragging = t > T.scrub - 0.2 && t < T.scrubEnd + 0.15;
  const label = `${DAYS[Math.floor(hour / 24)]}`, clock = `${String(hour % 24).padStart(2, "0")}:00`;

  // ── uluwatu: slides in, the day highlight steps 25 → 30 ──
  const swipeX = 400 * (1 - outExpo(seg(t, T.swipe, T.swipe + 0.4)));
  let step = 0;
  for (let i = 1; i <= STEPS; i++) step += outBack(seg(t, T.days + (i - 1) * STEP, T.days + (i - 1) * STEP + 0.3));
  const dayIdx = Math.min(STEPS, Math.max(0, Math.round(step)));
  const fingerO = win(t, T.days - 0.2, T.days + STEPS * STEP + 0.1, 0.15, 0.2);

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Footage src="footage/218670_large.mp4" from={0} to={T.phone + 0.6} startFrom={0} dark={0.45} zoom={0.1} fadeIn={0.2} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone - 0.2, T.end + 0.2, 0.8, 0.6) }} />
      <Footage src="footage/218670_large.mp4" from={T.end - 0.5} to={T.out} startFrom={3} dark={0.55} zoom={0.1} fadeIn={0.8} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook: big numerals */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 70, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Surf trip?</Eyebrow>
        <H1 size={120} style={{ marginTop: 24, ...rise(t, 0.12, T.phone - 0.15, 60) }}>Plan the trip</H1>
        <div style={{ ...font, fontWeight: 800, fontSize: 440, lineHeight: 0.9, letterSpacing: "-.06em", color: C.acc, marginTop: 10,
          ...rise(t, 0.3, T.phone - 0.15, 80), transform: `${rise(t, 0.3, T.phone - 0.15, 80).transform} scale(${lerp(0.7, 1, outBack(seg(t, 0.3, 0.9)))})`, transformOrigin: "left center" }}>
          {countUp(t, 0.3, 1.1, 16)}
        </div>
        <H1 size={120} style={rise(t, 0.55, T.phone - 0.15, 60)}>days out.</H1>
      </div>

      <Phone pose={pose}>
        {/* the swell map with a live scrubber */}
        <Screen src="captures-light/charts.png" />
        <div style={{ position: "absolute", left: 72, top: SCRUB.y - 6, width: 12, height: SCRUB.h + 8, background: "#0b0b0d", opacity: t < T.scrub - 0.2 ? 0 : 1 }} />
        <div style={{ position: "absolute", left: 278, top: 682, width: 96, height: 30, background: "#0b0b0d", opacity: t < T.scrub - 0.2 ? 0 : 1 }} />
        {t >= T.scrub - 0.2 && (
          <>
            <div style={{ ...font, position: "absolute", right: 33, top: 684, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#8a92a6" }}>{label}</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{clock}</span>
            </div>
            <div style={{ position: "absolute", left: hx - 1.3, top: SCRUB.y, width: 2.6, height: SCRUB.h, borderRadius: 2, background: C.acc }} />
            <div style={{ position: "absolute", left: hx - 3.5, top: SCRUB.y - 3.5, width: 7, height: 7, borderRadius: 4, background: C.acc }} />
            <div style={{ position: "absolute", left: hx - 24, top: SCRUB.y - 12, width: 48, height: 48, borderRadius: 24, background: "rgba(17,183,242,.18)", border: "2px solid rgba(255,255,255,.9)",
              opacity: dragging ? 1 : 0, transform: `scale(${dragging ? 0.85 : 1})` }} />
          </>
        )}
        {/* uluwatu slides in; the day highlight steps along the strip */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, overflow: "hidden", background: "#000", opacity: t < T.swipe ? 0 : 1, transform: `translateX(${swipeX}px)` }}>
          <Screen src="captures-light/spot-uluwatu-full.png" scroll={ULU_SCROLL} />
          <div style={{ position: "absolute", left: lerp(CELL(0), CELL(1), step) - STRIP.w / 2, top: STRIP.y, width: STRIP.w, height: STRIP.h, borderRadius: 12,
            border: `2px solid ${C.acc}`, background: "rgba(17,183,242,.12)", boxShadow: "0 0 24px rgba(17,183,242,.35)", opacity: seg(t, T.days - 0.3, T.days) }} />
          <div style={{ position: "absolute", left: lerp(CELL(0), CELL(1), step) - 24, top: STRIP.y + 40, width: 48, height: 48, borderRadius: 24, background: "rgba(17,183,242,.18)",
            border: "2px solid rgba(255,255,255,.9)", opacity: fingerO, transform: `translateX(${-14 * Math.sin(Math.PI * (step % 1))}px) scale(0.88)` }} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.scrub - 0.1, T.swipe)}><Eyebrow>Swell map</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Sun to Sat.</H1><Sub size={28} style={{ marginTop: 10 }}>Drag the timeline. Watch the swell roll in.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.swipe + 0.2, T.card - 0.1) }}><Eyebrow>Uluwatu · {DAY_NAMES[dayIdx]}</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Day after day.</H1><Sub size={28} style={{ marginTop: 10 }}>16 days, in 3-hour steps.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.card, T.end - 0.3) }}><Eyebrow>Then</Eyebrow>
          <H1 size={72} style={{ marginTop: 12 }}>Pick your</H1>
          <H1 size={72} style={{ color: C.acc, ...rise(t, T.card + 0.2, T.end - 0.3, 30) }}>swell window.</H1></div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>16 days of swell. Free.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf/charts <span>→</span></div>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
