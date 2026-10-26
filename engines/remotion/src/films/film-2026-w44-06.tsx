import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Onshore by nine, 13 s. Hook "Onshore by nine?" on a black card, cut to the phone on the Supertubos page
  (captures-light/spot-supertubos.png), push down into the hourly table: the wind column reads CROSS at 00:00,
  03:00 and 06:00, then the 09:00 cell flips CROSS → ONSHORE and the row lights up red while the period
  column holds. Brand card: "Same swell. Different wind." End card: logo, rosa.surf, link in bio.
  All numbers on screen are the capture's own; callouts carry none (clients/rosa/product.md).
  Screen coordinates below are the capture (1170×2532) displayed at 924 wide, scaled by K to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 1.9, dive: 2.5, c0: 3.1, c3: 3.55, c6: 4.0, flip: 5.0, back: 7.2, card: 7.5, end: 10.0, out: 13 };

const K = 400 / 924;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const WIND = [1172, 1342, 1510, 1678].map((y) => r(537, y, 196, 126));   // wind cells 00 / 03 / 06 / 09
const LABEL09 = r(548, 1745, 174, 54);                                     // "ONSHORE" label in the 09:00 cell
const ROW09 = r(14, 1662, 896, 148);                                       // the 09:00 row, down to the nav bar
const PERIOD = r(362, 1168, 146, 480);                                     // swell period cells 00 → 06
const SCREEN_H = 2532 * (400 / 1170);

const Ring: React.FC<{ b: { x: number; y: number; w: number; h: number }; color: string; o: number; s?: number; glow?: number }> = ({ b, color, o, s = 1, glow = 12 }) => (
  <div style={{ position: "absolute", left: b.x - 2, top: b.y - 2, width: b.w + 4, height: b.h + 4, borderRadius: 9, border: `1.5px solid ${color}`,
    boxShadow: `0 0 ${glow}px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

// Rosa particles: the app's bottom treatment, ported 1:1 from rosa/web particles.ts + BottomGlow.tsx (dark theme)
// and the .app::before mesh: specks rise out of the glow and fade as they climb. Pure function of t: each speck
// loops its own life with fresh seeded values per cycle. App px (430 wide phone) scaled by PS; count from the app's
// density rule (area / 11000 × 1.4). Strength 0.35 instead of the app's 0.08 so it reads on video.
const PS = 2.5, BAND = { top: 1280, h: 640 }, STRENGTH = 0.35;
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const N = Math.round(((1080 / PS) * (BAND.h / PS)) / 11000 * 1.4);
const SPECKS = Array.from({ length: N }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`ql${i}`)), off: random(`qo${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`q${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = BAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const fadeIn = Math.min(1, (BAND.h - y) / (80 * PS)), fadeOut = Math.min(1, Math.max(0, y) / (BAND.h * 0.55));
  const a = (0.22 + depth * 0.7) * STRENGTH * fadeIn * fadeOut * tw * env;
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
    <div style={{ position: "absolute", left: 0, top: BAND.top, width: 1080, height: BAND.h, opacity: o, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background:
        "radial-gradient(95% 100% at 18% 130%, rgba(3,42,250,.55) 0%, transparent 72%), radial-gradient(85% 90% at 82% 120%, rgba(36,177,97,.40) 0%, transparent 70%), linear-gradient(180deg, transparent 0%, rgba(3,42,250,.12) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
        {ps.filter((p) => p.bucket === 0 && p.rad > 1.4 * PS).map((p) => dot(p, p.rad * 2.6, 8, p.a * 0.55, `g${p.i}`))}
        {ps.map((p) => dot(p, p.rad, p.bucket, p.a, `d${p.i}`))}
      </div>
    </div>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: tilts in from below, floats, drops out for the brand card ──────
  const float = { ry: 9 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.card - 0.3, T.card + 0.3));
  const pose = {
    x: -205, y: lerp(700, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, enter),
    rx: float.rx + lerp(55, 0, tilt), ry: float.ry + lerp(-25, 0, tilt), rz: float.rz + lerp(8, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── camera: scroll down into the table, push on the 09:00 row, ease back ──
  const knots = [T.phone, T.dive, T.dive + 0.6, T.flip - 0.3, T.flip + 0.2, T.back, T.back + 0.4];
  const ease = { easing: inOut, extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const z = interpolate(t, knots, [1, 1, 1.4, 1.4, 1.75, 1.75, 1.2], ease);
  const fx = interpolate(t, knots, [200, 200, 220, 220, 250, 250, 220], ease);
  const fy = interpolate(t, knots, [300, 300, 590, 600, 700, 700, 600], ease);
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * fx));
  const ty = Math.min(0, Math.max(860 - SCREEN_H * z, 430 - z * fy));

  // ── wind cells: CROSS, CROSS, CROSS ring up in orange; 09:00 flips to ONSHORE ─
  const crossAt = [T.c0, T.c3, T.c6];
  const pop = (a: number) => lerp(1.15, 1, outBack(seg(t, a, a + 0.35)));
  const flip = inOut(seg(t, T.flip, T.flip + 0.35));
  const onshore = outBack(seg(t, T.flip + 0.3, T.flip + 0.7));
  const rowPulse = 0.75 + 0.25 * Math.sin(Math.max(0, t - T.flip) * 8);
  const periodO = win(t, T.c6 + 0.3, T.back + 0.2, 0.4, 0.3);

  // ── brand card ─────────────────────────────────────────────────────────────
  const slide = outExpo(seg(t, T.card, T.card + 0.6));
  const cardOut = inOut(seg(t, T.end - 0.4, T.end));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/218670_large.mp4" from={T.end - 0.6} to={T.out} startFrom={3} dark={0.5} zoom={0.1} fadeIn={1.0} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook on a black card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 150 }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.1)}>Supertubos · today</Eyebrow>
        <H1 size={150} style={{ marginTop: 26, ...rise(t, 0.15, T.phone - 0.1) }}>Onshore</H1>
        <H1 size={150} style={{ ...rise(t, 0.3, T.phone - 0.1) }}>by <span style={{ color: C.bad }}>nine?</span></H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.55, T.phone - 0.1) }}>Read the wind column.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <Screen src="captures-light/spot-supertubos.png" />
          {/* period column holds */}
          <div style={{ position: "absolute", left: PERIOD.x, top: PERIOD.y, width: PERIOD.w, height: PERIOD.h, borderRadius: 10, border: `1.5px dashed ${C.ink}`, opacity: 0.8 * periodO }} />
          {/* CROSS × 3 */}
          {crossAt.map((a, i) => <Ring key={i} b={WIND[i]} color={C.wind} o={win(t, a, T.back + 0.2, 0.2, 0.3)} s={pop(a)} />)}
          {/* 09:00: the row lights up, the label flips CROSS → ONSHORE */}
          <div style={{ position: "absolute", left: ROW09.x, top: ROW09.y, width: ROW09.w, height: ROW09.h, borderRadius: 10, background: "rgba(208,87,74,.14)",
            border: `1.5px solid ${C.bad}`, boxShadow: `0 0 ${14 * rowPulse}px ${C.bad}`, opacity: win(t, T.flip + 0.3, T.back + 0.2, 0.3, 0.3) }} />
          <Ring b={WIND[3]} color={C.bad} o={win(t, T.flip + 0.3, T.back + 0.2, 0.2, 0.3)} s={lerp(1.2, 1, onshore)} glow={16} />
          {t > T.c6 && (
            <div style={{ position: "absolute", left: LABEL09.x, top: LABEL09.y, width: LABEL09.w, height: LABEL09.h, perspective: 300 }}>
              <div style={{ ...font, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "#111a2c",
                color: C.wind, fontWeight: 700, fontSize: 11.5, letterSpacing: ".06em", opacity: flip < 1 ? 1 : 0, transform: `rotateX(${90 * flip}deg)`,
                ...(t < T.c6 + 0.3 ? { opacity: seg(t, T.c6, T.c6 + 0.3) } : {}) }}>CROSS</div>
            </div>
          )}
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Sub size={44} style={{ fontWeight: 700, ...rise(t, T.c0 - 0.1, T.flip - 0.05) }}>Midnight → 06:00</Sub>
          <H1 size={76} style={{ marginTop: 18, color: C.wind, ...rise(t, T.c0, T.flip - 0.05) }}>Cross.</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.c3, T.flip - 0.05) }}>Cross. Cross.</Sub>
          <Sub size={30} style={{ marginTop: 10, ...rise(t, T.c6 + 0.35, T.flip - 0.05) }}>Period holds all night.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Sub size={44} style={{ fontWeight: 700, ...rise(t, T.flip + 0.3, T.back + 0.2), color: C.bad }}>09:00</Sub>
          <H1 size={76} style={{ marginTop: 18, color: C.bad, ...rise(t, T.flip + 0.4, T.back + 0.2) }}>Onshore.</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.flip + 0.6, T.back + 0.2) }}>Go early or go home.</Sub>
        </div>
      </div>

      {/* brand card slides in */}
      {t > T.card - 0.1 && t < T.end + 0.1 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 200, width: B.w, padding: "64px 60px", boxSizing: "border-box", borderRadius: 48,
          background: "linear-gradient(150deg, #0b2a44 0%, #071a2c 60%, #04101c 100%)", boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 0 1.5px rgba(17,183,242,.35) inset`,
          opacity: (1 - cardOut) * seg(t, T.card, T.card + 0.2), transform: `translateX(${lerp(1100, 0, slide)}px) translateY(${-60 * cardOut}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 72, height: 72 }} />
            <Eyebrow>rosa · hour by hour</Eyebrow>
          </div>
          <H1 size={112} style={{ marginTop: 40, ...rise(t, T.card + 0.3, T.end + 1) }}>Same swell.</H1>
          <H1 size={112} style={{ marginTop: 14, color: C.bad, ...rise(t, T.card + 0.5, T.end + 1) }}>Different wind.</H1>
          <Sub style={{ marginTop: 30, ...rise(t, T.card + 0.75, T.end + 1) }}>Free. No sign-in to check the surf.</Sub>
        </div>
      )}

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>Know the wind before you paddle out.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
