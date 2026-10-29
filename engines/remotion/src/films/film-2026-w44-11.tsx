import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Swell filling in, 13 s. Hook "New swell filling in." over Pixabay sunrise footage (310248). The phone
  rises on the Supertubos spot page (captures/spot-supertubos.png) and pushes in on "New swell filling in"
  under Today. Then it pulls back to the day strip: the bars climb from Mon into Tue and Wed and stay
  dark green. Card: "Get the alert. Clear the morning." End card (as W44 · 03): logo, "it's free.", glowing rosa.surf →, link in bio, Footage: Pixabay.
  No numbers on screen outside the capture. Screen coordinates are the capture (1170×2532) scaled to 400 px.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.0, push: 2.9, strip: 5.2, card: 8.4, end: 10.4, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const LINE = r(66, 1225, 380, 60);                     // "New swell filling in" under Today · Oct 25
const BARS = [222, 390, 558].map((x) => r(x, 420, 135, 116));   // Mon, Tue, Wed bar groups
const BAND = r(40, 420, 1130, 116);                    // the whole bar band
const GROUP = r(212, 180, 500, 420);                   // Mon..Wed columns, labels to ranges

type Box = { x: number; y: number; w: number; h: number };
const Ring: React.FC<{ b: Box; color: string; o: number; s?: number; radius?: number }> = ({ b, color, o, s = 1, radius = 12 }) => (
  <div style={{ position: "absolute", left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, borderRadius: radius, border: `2px solid ${color}`,
    boxShadow: `0 0 14px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

// Rosa loading-screen particles, ported 1:1 from rosa/web particles.ts with the splash's options (main.tsx
// splashParticles: density 1.4, alpha 0.3, two-tone palette) on the splash's 460 px bottom band, screen-blended:
// specks rise off the bottom and fade as they climb. Pure function of t: each speck loops its own life with
// fresh seeded values per cycle. App px (430 wide phone) scaled by PS.
const PS = 2.5, PBAND = { h: 460 * PS }, ALPHA = 0.3;
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const N = Math.round(((1080 / PS) * (PBAND.h / PS)) / 11000 * 1.4);
const SPECKS = Array.from({ length: N }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`sl${i}`)), off: random(`so${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`s${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = PBAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const fadeIn = Math.min(1, (PBAND.h - y) / (80 * PS)), fadeOut = Math.min(1, Math.max(0, y) / (PBAND.h * 0.55));
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
    <div style={{ position: "absolute", left: 0, bottom: 0, width: 1080, height: PBAND.h, opacity: o, overflow: "hidden", pointerEvents: "none", mixBlendMode: "screen" }}>
      {ps.filter((p) => p.bucket === 0 && p.rad > 1.4 * PS).map((p) => dot(p, p.rad * 2.6, 8, p.a * 0.55, `g${p.i}`))}
      {ps.map((p) => dot(p, p.rad, p.bucket, p.a, `d${p.i}`))}
    </div>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: rises in, floats, leaves before the card ──
  const float = { ry: 9 * Math.sin(t * 0.5 + 0.4), rx: 3 * Math.sin(t * 0.37 + 1.1), rz: -1 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const pop = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.card - 0.5, T.card + 0.1));
  const pose = {
    x: -205, y: lerp(900, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, pop),
    rx: float.rx + lerp(18, 0, enter), ry: float.ry + lerp(-22, 0, enter), rz: float.rz,
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── in-screen camera: push in on the line, then cut over to the strip ──
  const pushK = inOut(seg(t, T.push, T.push + 0.9));
  const toStrip = inOut(seg(t, T.strip - 0.4, T.strip + 0.4));
  const lineC = { x: LINE.x + LINE.w / 2, y: LINE.y + LINE.h / 2 };
  const stripC = { x: GROUP.x + GROUP.w / 2, y: GROUP.y + GROUP.h / 2 };
  const zoom = lerp(lerp(1, 1.9, pushK), 1.7, toStrip);
  const fx = lerp(lineC.x, stripC.x, toStrip), fy = lerp(lineC.y, stripC.y, toStrip);
  // focus point to the middle of the screen (400 × 860), never past the capture's edges
  const tx = Math.min(0, Math.max(400 - 400 * zoom, 200 - fx * zoom)), ty = Math.min(0, 430 - fy * zoom);
  const camK = Math.max(pushK, toStrip);
  const cam = `translate(${lerp(0, tx, camK)}px, ${lerp(0, ty, camK)}px) scale(${lerp(1, zoom, camK)})`;

  // bars: the band dims, then Mon, Tue, Wed climb out of it, bottom up
  const barsOn = t > T.strip - 0.2;
  const climb = (i: number) => outBack(seg(t, T.strip + 0.5 + i * 0.45, T.strip + 1.0 + i * 0.45));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* sunrise under the hook, dark panel for the phone, sunrise again for card and end */}
      <Footage src="footage/310248_large.mp4" from={0} to={T.push + 0.6} dark={0.45} zoom={0.12} fadeIn={0.3} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.push - 0.2, T.card + 0.2, 0.8, 0.6) }} />
      <Footage src="footage/310248_large.mp4" from={T.card - 0.4} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.8} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Supertubos · today</Eyebrow>
        <H1 size={170} style={{ marginTop: 24, ...rise(t, 0.15, T.phone - 0.15, 60) }}>New swell</H1>
        <H1 size={170} style={{ color: C.acc, ...rise(t, 0.45, T.phone - 0.15, 60) }}>filling in.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 1200, transformOrigin: "0 0", transform: cam }}>
          <Screen src="captures/spot-supertubos.png" />
          <Ring b={LINE} color={C.acc} o={win(t, T.push + 0.6, T.strip - 0.4, 0.25, 0.3)} s={lerp(1.15, 1, outBack(seg(t, T.push + 0.6, T.push + 1.0)))} radius={8} />
          {barsOn && <>
            <div style={{ position: "absolute", left: BAND.x, top: BAND.y, width: BAND.w, height: BAND.h, background: "rgba(0,0,0,.72)", opacity: seg(t, T.strip - 0.2, T.strip + 0.2) }} />
            {BARS.map((b, i) => (
              <div key={i} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, overflow: "hidden", clipPath: `inset(${(1 - Math.min(1, climb(i))) * 100}% 0 0 0)` }}>
                <Screen src="captures/spot-supertubos.png" x={-b.x} scroll={b.y} />
              </div>
            ))}
            <Ring b={GROUP} color={C.good} o={win(t, T.strip + 1.9, T.card - 0.5, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.strip + 1.9, T.strip + 2.3)))} radius={10} />
          </>}
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.push + 0.4, T.strip - 0.1)}><Eyebrow>Today</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Something's coming.</H1><Sub size={28} style={{ marginTop: 10 }}>Right under the day.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.strip + 0.4, T.card - 0.3) }}><Eyebrow>Mon · Tue · Wed</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Bars climb.</H1>
          <H1 size={64} style={{ color: C.good, ...rise(t, T.strip + 1.9, T.card - 0.3, 30) }}>Stays green.</H1>
          <Sub size={28} style={{ marginTop: 10, ...rise(t, T.strip + 2.1, T.card - 0.3, 30) }}>Size, period and wind, day by day.</Sub></div>
      </div>

      {/* card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 220, width: B.w }}>
        <Eyebrow style={rise(t, T.card, T.end - 0.1)}>Swell alerts</Eyebrow>
        <H1 size={110} style={{ marginTop: 24, ...rise(t, T.card + 0.1, T.end - 0.1, 60) }}>Get the alert.</H1>
        <H1 size={110} style={{ color: C.acc, ...rise(t, T.card + 0.5, T.end - 0.1, 60) }}>Clear the morning.</H1>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.5, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.6)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.12, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={50} style={{ color: "#fff", marginTop: -16, ...rise(t, T.end + 0.25, T.out + 1) }}>it's free.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40, marginTop: 36,
          boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.4, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={{ color: "#fff", ...rise(t, T.end + 0.55, T.out + 1) }}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.6} />
    </AbsoluteFill>
  );
};

export default Film;
