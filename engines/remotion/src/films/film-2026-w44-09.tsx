import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Ocean to break, 13 s. Hook "From open ocean to your break." on a black card. The phone flies in on
  the swell map (captures/charts.png) and pushes toward the Pacific edge, cross-dissolves into the
  North Shore map (captures/map.png) with its numbered pins, the Rocky Point card slides up and its
  Good badge rings. Hard cut to the Banzai Pipeline week strip (captures/spot-pipeline.png).
  End card: logo, rosa.surf/charts →. Only number on screen: 16 days (clients/rosa/product.md).
  Screen coordinates are the captures (1170×2532) scaled to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 1.7, push: 2.3, map: 4.2, pins: 4.8, card: 6.0, week: 7.8, end: 10.2, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const PINS = [[356, 1584], [467, 1465], [566, 1308], [627, 1229]].map(([x, y]) => ({ x: x * K, y: y * K }));   // pins 2..5
const CARD = r(263, 1836, 642, 354);     // Rocky Point card
const BADGE = r(694, 1871, 170, 74);     // its Good badge
const STRIP = r(30, 160, 1130, 445);     // the week strip: day, arrow, bars, range
const DAY_X = [95, 227, 360, 492, 625, 758, 890].map((x) => x * 1.266 * K);
const PUSH_O = { x: 30, y: 330 };        // the Pacific edge of the swell map, in screen px

const Ring: React.FC<{ b: { x: number; y: number; w: number; h: number }; color: string; o: number; s?: number; radius?: number }> = ({ b, color, o, s = 1, radius = 12 }) => (
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

  // ── phone: flies in with a spin, floats, punches on the cut, drops out for the end card ──
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const punch = 0.06 * (1 - outExpo(seg(t, T.week, T.week + 0.5))) * (t >= T.week ? 1 : 0);
  const pose = {
    x: lerp(-300, -205, enter), y: lerp(760, -30, enter) + float.y + 900 * exit, s: lerp(0.75, 0.98, enter) + punch,
    rx: float.rx + lerp(40, 0, tilt), ry: float.ry + lerp(60, 0, tilt), rz: float.rz + lerp(-14, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── screens ──
  const push = lerp(1, 2.4, inOut(seg(t, T.push, T.map + 0.5)));
  const mapO = seg(t, T.map, T.map + 0.6);
  const mapZoom = lerp(1.18, 1, outExpo(seg(t, T.map, T.map + 1.0)));
  const weekO = t >= T.week ? 1 : 0;
  const cardK = outExpo(seg(t, T.card, T.card + 0.5));
  const pinPop = (i: number) => { const a = T.pins + i * 0.16; return { o: win(t, a, T.week, 0.2, 0.2), s: lerp(1.8, 1, outBack(seg(t, a, a + 0.4))) }; };
  const badgePop = lerp(1.4, 1, outBack(seg(t, T.card + 0.45, T.card + 0.85)));
  const sweep = seg(t, T.week + 0.6, T.week + 1.8);
  const dayI = Math.min(6, Math.floor(sweep * 7));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* footage bed behind the phone, then the dark panel takes over */}
      <Footage src="footage/218670_large.mp4" from={T.phone - 0.3} to={T.map + 0.6} startFrom={2} dark={0.62} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.map - 0.2, T.end - 0.2, 0.8, 0.7) }} />
      {/* the app's loading-screen particles on the empty dark bottom: under the hook card, then the dark panel */}
      <Particles t={t} o={Math.max(win(t, 0, T.phone - 0.1, 0.6, 0.5), win(t, T.map - 0.2, T.end - 0.2, 0.8, 0.7))} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.6} to={T.out} startFrom={3} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook on a black card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.1)}>Swell map · spot</Eyebrow>
        <H1 size={124} style={{ marginTop: 26, ...rise(t, 0.15, T.phone - 0.1) }}>From open</H1>
        <H1 size={124} style={{ ...rise(t, 0.3, T.phone - 0.1) }}>ocean to</H1>
        <H1 size={124} style={{ color: C.acc, ...rise(t, 0.5, T.phone - 0.1) }}>your break.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: `${PUSH_O.x}px ${PUSH_O.y}px`, opacity: 1 - mapO }}>
          <Screen src="captures/charts.png" />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: mapO, transform: `scale(${mapZoom})`, transformOrigin: "180px 480px" }}>
          <Screen src="captures/map.png" />
          {PINS.map((p, i) => { const k = pinPop(i); return (
            <div key={i} style={{ position: "absolute", left: p.x - 19, top: p.y - 19, width: 38, height: 38, borderRadius: 19, border: `2px solid ${C.good}`, boxShadow: `0 0 14px ${C.good}`, opacity: k.o, transform: `scale(${k.s})` }} />
          ); })}
          {/* the Rocky Point card: hidden in place, then slides up */}
          <div style={{ position: "absolute", left: CARD.x - 4, top: CARD.y - 4, width: CARD.w + 8, height: CARD.h + 8, background: "#18191d", opacity: 1 - cardK }} />
          <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 14, overflow: "hidden", opacity: cardK, transform: `translateY(${lerp(140, 0, cardK)}px)`, boxShadow: `0 ${18 * cardK}px 40px rgba(0,0,0,.6)` }}>
            <img src={staticFile("captures/map.png")} style={{ position: "absolute", left: -CARD.x, top: -CARD.y, width: 400, display: "block" }} />
          </div>
          <Ring b={BADGE} color={C.good} o={win(t, T.card + 0.45, T.week, 0.2, 0.2)} s={badgePop} radius={14} />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: weekO }}>
          <Screen src="captures/spot-pipeline.png" />
          <Ring b={STRIP} color={C.acc} o={win(t, T.week + 0.2, T.end - 0.4, 0.25, 0.3)} s={lerp(1.1, 1, outBack(seg(t, T.week + 0.2, T.week + 0.6)))} radius={16} />
          <div style={{ position: "absolute", left: DAY_X[dayI] - 26, top: STRIP.y + 4, width: 52, height: STRIP.h - 8, borderRadius: 12, background: "rgba(17,183,242,.16)", boxShadow: `0 0 0 1.5px ${C.acc} inset`, opacity: win(t, T.week + 0.6, T.week + 2.1, 0.15, 0.3) }} />
        </div>
      </Phone>

      {/* callouts on the right, one per beat */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.phone + 0.3, T.map - 0.1)}><Eyebrow>Swell map</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Open ocean.</H1><Sub size={28} style={{ marginTop: 10 }}>Every swell, out at sea.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.map + 0.2, T.card - 0.1) }}><Eyebrow>North Shore</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Your coast.</H1><Sub size={28} style={{ marginTop: 10 }}>Numbered pins, spot by spot.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.card + 0.2, T.week - 0.1) }}><Eyebrow>Rocky Point</Eyebrow><H1 size={64} style={{ marginTop: 12, color: C.good }}>Good.</H1><Sub size={28} style={{ marginTop: 10 }}>The rating, right on the map.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.week + 0.2, T.end - 0.1) }}><Eyebrow>Banzai Pipeline</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>The week.</H1><Sub size={28} style={{ marginTop: 10 }}>And 16 days out, at a glance.</Sub></div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={{ color: "#fff", ...rise(t, T.end + 0.3, T.out + 1) }}>From open ocean to your break.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40, marginTop: 36,
          boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf/charts <span>→</span></div>
        <Sub size={30} style={{ color: "#fff", ...rise(t, T.end + 0.6, T.out + 1) }}>free · link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
