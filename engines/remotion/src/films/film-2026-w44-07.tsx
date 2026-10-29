import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Costa Rica classics, 13 s. Hook "Costa Rica's two famous rights." over Pixabay surfer footage (218670),
  the phone flies in on Home (captures/home.png): push on the Ollie's Point card, ring the Epic badge and the
  offshore wind line. Pan down to the Costa Rica group: Ollie's Point and Witch's Rock side by side with their
  next three days. End card: logo, rosa.surf, link in bio, Footage: Pixabay.
  All numbers on screen are the capture's own; callouts carry none (clients/rosa/product.md).
  Screen coordinates below are the capture (1170×2532) displayed at 924 wide, scaled by K to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.2, card: 2.8, epic: 3.3, wind: 3.9, group: 5.9, ollie: 6.7, witch: 7.3, days: 8.0, end: 10.0, out: 13 };

const K = 400 / 924;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const EPIC = r(580, 518, 152, 72);       // Epic badge on the Ollie's Point card
const WIND = r(84, 708, 520, 60);        // "ENE 5 km/h offshore · 15 s SW"
const OLLIE = r(54, 1134, 816, 298);     // Costa Rica group: Ollie's Point row
const WITCH = r(54, 1454, 816, 298);     // Costa Rica group: Witch's Rock row
const DAYS = r(90, 1236, 470, 196);      // first three day columns of the Ollie's Point row …
const DAYS2 = r(90, 1556, 470, 196);     // … and of Witch's Rock
const SCREEN_H = 2532 * (400 / 1170);

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

const Ring: React.FC<{ b: { x: number; y: number; w: number; h: number }; color: string; o: number; s?: number; glow?: number; radius?: number }> = ({ b, color, o, s = 1, glow = 12, radius = 9 }) => (
  <div style={{ position: "absolute", left: b.x - 2, top: b.y - 2, width: b.w + 4, height: b.h + 4, borderRadius: radius, border: `1.5px solid ${color}`,
    boxShadow: `0 0 ${glow}px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: flies in from below with a spin, floats, drops out for the end card ──
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const pose = {
    x: lerp(300, -205, enter), y: lerp(760, -30, enter) + float.y + 900 * exit, s: lerp(0.75, 0.98, enter),
    rx: float.rx + lerp(40, 0, tilt), ry: float.ry + lerp(-60, 0, tilt), rz: float.rz + lerp(14, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── camera: push on the Ollie's Point card, then scroll down to the Costa Rica group ──
  const knots = [T.phone, T.card, T.card + 0.5, T.group - 0.4, T.group + 0.4, T.end];
  const ease = { easing: inOut, extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const z = interpolate(t, knots, [1, 1, 1.45, 1.45, 1.12, 1.12], ease);
  const fx = interpolate(t, knots, [200, 200, 178, 178, 200, 200], ease);
  const fy = interpolate(t, knots, [300, 300, 240, 240, 620, 620], ease);
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * fx));
  const ty = Math.min(0, Math.max(860 - SCREEN_H * z, 430 - z * fy));

  const pop = (a: number) => lerp(1.2, 1, outBack(seg(t, a, a + 0.4)));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/218670_large.mp4" from={0} to={T.phone + 1.0} startFrom={1} dark={0.45} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.3, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/218670_large.mp4" from={T.end - 0.6} to={T.out} startFrom={7} dark={0.5} zoom={0.1} fadeIn={1.0} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook over the footage */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.1)}>Costa Rica classics</Eyebrow>
        <H1 size={124} style={{ marginTop: 26, ...rise(t, 0.15, T.phone - 0.1) }}>Costa Rica's</H1>
        <H1 size={124} style={{ ...rise(t, 0.3, T.phone - 0.1) }}>two famous</H1>
        <H1 size={124} style={{ color: C.acc, ...rise(t, 0.45, T.phone - 0.1) }}>rights.</H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.7, T.phone - 0.1) }}>Ollie's Point and Witch's Rock.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <Screen src="captures/home.png" />
          {/* Ollie's Point card: Epic badge + offshore wind line */}
          <Ring b={EPIC} color={C.good} o={win(t, T.epic, T.group - 0.3, 0.25, 0.3)} s={pop(T.epic)} radius={18} glow={16} />
          <Ring b={WIND} color={C.good} o={win(t, T.wind, T.group - 0.3, 0.25, 0.3)} s={pop(T.wind)} />
          {/* Costa Rica group: both rows, then their next three days */}
          <Ring b={OLLIE} color={C.acc} o={win(t, T.ollie, T.days, 0.25, 0.25)} s={pop(T.ollie)} radius={14} />
          <Ring b={WITCH} color={C.acc} o={win(t, T.witch, T.days, 0.25, 0.25)} s={pop(T.witch)} radius={14} />
          <Ring b={DAYS} color={C.good} o={win(t, T.days, T.end - 0.3, 0.25, 0.3)} s={pop(T.days)} />
          <Ring b={DAYS2} color={C.good} o={win(t, T.days + 0.15, T.end - 0.3, 0.25, 0.3)} s={pop(T.days + 0.15)} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.card, T.group - 0.1)}>Ollie's Point</Eyebrow>
          <H1 size={88} style={{ marginTop: 18, color: C.good, ...rise(t, T.epic, T.group - 0.1) }}>Epic.</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.wind, T.group - 0.1) }}>Light wind, blowing offshore.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.group + 0.2, T.end - 0.1)}>Costa Rica</Eyebrow>
          <H1 size={76} style={{ marginTop: 18, ...rise(t, T.ollie, T.end - 0.1) }}>Side</H1>
          <H1 size={76} style={{ color: C.acc, ...rise(t, T.witch, T.end - 0.1) }}>by side.</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.days, T.end - 0.1) }}>Both rights, the next three days.</Sub>
        </div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40,
          boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.3, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={{ color: "#fff", ...rise(t, T.end + 0.45, T.out + 1) }}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.7} />
    </AbsoluteFill>
  );
};

export default Film;
