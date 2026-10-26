import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Home screen install, 13 s. Hook "Put it on your home screen." over Pixabay surf footage. The phone rises
  on a home screen (drawn: blank icon grid, no other apps named); the rosa tile drops into the empty slot,
  a tap, and the app opens from the tile to captures/home.png. Card: "Works offline with the last
  forecast." Quick swipe to captures/spot-uluwatu-full.png. End card: logo, "rosa.surf, it's free",
  Footage: Pixabay. No numbers on screen outside the captures (product.md: PWA, offline copy of the
  last forecast; Play Store not mentioned).
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.2, drop: 3.0, tap: 4.2, open: 4.4, card: 6.2, swipe: 8.4, end: 10.6, out: 13 };

// home-screen grid in screen px (400 × 860): 4 columns, the rosa slot is row 2, column 2
const ICON = 68, COLS = [30, 128, 226, 324], ROWS = [96, 206, 316, 426];
const SLOT = { x: COLS[1], y: ROWS[1] };
const TINTS = ["#2b3a55", "#3a2f4f", "#24414a", "#4a3a2a", "#2f4a36", "#4a2a33", "#2a3550", "#3d4250"];

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

  // ── phone: rises in after the hook, floats, leaves before the end card ──
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 3.5 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const pop = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.1));
  const pose = {
    x: -205, y: lerp(900, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, pop),
    rx: float.rx + lerp(18, 0, enter), ry: float.ry + lerp(-22, 0, enter), rz: float.rz,
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── the tile drop: falls from above the screen, bounces into the slot, neighbours nudge ──
  const fall = outBack(seg(t, T.drop, T.drop + 0.55));
  const land = seg(t, T.drop + 0.4, T.drop + 0.8);
  const bump = Math.sin(Math.PI * land) * (1 - land);
  const tileY = lerp(-260, SLOT.y, fall), tileS = lerp(1.7, 1, outExpo(seg(t, T.drop, T.drop + 0.5))), tileR = lerp(-14, 0, fall);
  const tapK = seg(t, T.tap, T.tap + 0.3);
  // app open: home.png grows out of the tile
  const openK = inOut(seg(t, T.open, T.open + 0.5));
  const ox = SLOT.x + ICON / 2, oy = SLOT.y + ICON / 2;
  // quick swipe to the spot page
  const swipeX = 400 * (1 - outExpo(seg(t, T.swipe, T.swipe + 0.35)));
  const uluScroll = 48 + 160 * inOut(seg(t, T.swipe + 0.6, T.swipe + 1.4));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* footage for hook and end, dark panel while the phone is the subject */}
      <Footage src="footage/1306-145340152_medium.mp4" from={0} to={T.phone + 0.6} startFrom={1} dark={0.45} zoom={0.1} fadeIn={0.2} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone - 0.2, T.end + 0.2, 0.8, 0.6) }} />
      <Footage src="footage/1306-145340152_medium.mp4" from={T.end - 0.5} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.8} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 90, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Install rosa</Eyebrow>
        <H1 size={150} style={{ marginTop: 24, ...rise(t, 0.12, T.phone - 0.15, 60) }}>Put it on</H1>
        <H1 size={150} style={rise(t, 0.24, T.phone - 0.15, 60)}>your</H1>
        <H1 size={150} style={{ color: C.acc, ...rise(t, 0.5, T.phone - 0.15, 60) }}>home</H1>
        <H1 size={150} style={{ color: C.acc, ...rise(t, 0.62, T.phone - 0.15, 60) }}>screen.</H1>
      </div>

      <Phone pose={pose}>
        {/* home screen wallpaper + blank icon grid */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, background: "linear-gradient(170deg,#0b2a5c 0%,#071a3a 45%,#040b1c 100%)" }}>
          {ROWS.flatMap((y, ri) => COLS.map((x, ci) => {
            if (ri === 1 && ci === 1) return null;
            const i = ri * 4 + ci;
            const near = Math.abs(ri - 1) + Math.abs(ci - 1) === 1 ? 1 : 0;
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y, width: ICON, height: ICON, borderRadius: 16, background: TINTS[i % TINTS.length],
                boxShadow: "0 0 0 1px rgba(255,255,255,.06) inset", opacity: 0.85, transform: `scale(${1 - 0.1 * near * bump})` }} />
            );
          }))}
          {/* dock */}
          <div style={{ position: "absolute", left: 18, right: 18, bottom: 26, height: 96, borderRadius: 30, background: "rgba(255,255,255,.08)" }} />
          {/* the rosa tile */}
          <div style={{ position: "absolute", left: SLOT.x, top: tileY, width: ICON, opacity: t < T.drop ? 0 : 1 - seg(t, T.open + 0.1, T.open + 0.3),
            transform: `rotate(${tileR}deg) scale(${tileS * (1 - 0.12 * Math.sin(Math.PI * tapK))})` }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: ICON, height: ICON, display: "block", filter: `drop-shadow(0 ${lerp(30, 6, fall)}px ${lerp(30, 10, fall)}px rgba(0,0,0,.6))` }} />
            <div style={{ ...font, fontSize: 13, fontWeight: 600, textAlign: "center", marginTop: 6, opacity: seg(t, T.drop + 0.5, T.drop + 0.8) }}>rosa</div>
          </div>
          {/* tap */}
          <div style={{ position: "absolute", left: ox - 26, top: oy - 26, width: 52, height: 52, borderRadius: 26, background: "rgba(17,183,242,.18)", border: "2px solid rgba(255,255,255,.9)",
            opacity: tapK > 0 && tapK < 1 ? 1 : 0, transform: `scale(${1 - 0.3 * Math.sin(Math.PI * tapK)})` }} />
        </div>
        {/* the app opens out of the tile */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, overflow: "hidden", background: "#000", opacity: t < T.open ? 0 : Math.min(1, openK * 3),
          transformOrigin: `${ox}px ${oy}px`, transform: `scale(${lerp(ICON / 400, 1, openK)})`, borderRadius: lerp(60, 0, openK) }}>
          <Screen src="captures/home.png" scroll={44} />
          <Screen src="captures/spot-uluwatu-full.png" scroll={uluScroll} o={t < T.swipe ? 0 : 1} x={swipeX} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.drop + 0.2, T.open + 0.2)}><Eyebrow>Install</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Straight from the browser.</H1><Sub size={28} style={{ marginTop: 10 }}>Add to Home Screen. Done.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.open + 0.4, T.card - 0.1) }}><Eyebrow>One tap</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Opens like an app.</H1><Sub size={28} style={{ marginTop: 10 }}>Your spots, right on Home.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.card, T.swipe - 0.1) }}><Eyebrow>No signal?</Eyebrow>
          <H1 size={64} style={{ marginTop: 12 }}>Works offline</H1>
          <H1 size={64} style={{ color: C.acc, ...rise(t, T.card + 0.3, T.swipe - 0.1, 30) }}>with the last forecast.</H1></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.swipe + 0.2, T.end - 0.3) }}><Eyebrow>Uluwatu</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Still there.</H1><Sub size={28} style={{ marginTop: 10 }}>Saved on your phone.</Sub></div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>On your home screen.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf, it's free <span>→</span></div>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
