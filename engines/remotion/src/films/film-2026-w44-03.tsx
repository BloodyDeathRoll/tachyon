import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  No account needed, 13 s. Hook "No account. No paywall." on a black card, fast cut to the phone on
  Home (captures/home.png): the Ollie's Point card with its Epic rating, no sign-in screen. Swipe to
  Supertubos (captures/spot-supertubos.png), then to search (captures/search.png), one beat each.
  A black card reads "No paywall. No trial." End card: logo, "rosa.surf, it's free".
  Numbers: clients/rosa/product.md (3,056 spots; no paywall, no trial; the forecast never needs sign-in).
  Screen coordinates below are the capture (1170 wide) scaled to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 1.8, spot: 4.0, search: 6.0, card: 8.2, end: 10.2, out: 13 };

const HOME_SCROLL = 44;
// Epic badges in screen px (before scroll)
const RINGS = [
  { from: T.phone + 0.5, to: T.spot - 0.1, x: 253, y: 227 - HOME_SCROLL, w: 62, h: 26 },
  { from: T.spot + 0.5, to: T.search - 0.1, x: 33, y: 245, w: 50, h: 23 },
];

const BEATS = [
  { from: T.phone + 0.2, to: T.spot, eyebrow: "Open rosa.surf", title: "No sign-in.", sub: "Ollie's Point, Epic. Right there on Home." },
  { from: T.spot, to: T.search, eyebrow: "Any spot", title: "Every page, open.", sub: "Supertubos, today. Nothing to unlock." },
  { from: T.search, to: T.card - 0.2, eyebrow: "Search", title: "3,056 spots.", sub: "All of them free to check." },
];

// Rosa particles: the app's bottom treatment (rosa/web BottomGlow.tsx + particles.ts, dark theme),
// a two-tone mesh with specks rising and fading. Made a pure function of t: each speck loops its own
// life, respawning with fresh seeded values per cycle. App px (430 wide phone) scaled by PS.
const PS = 2.5, BAND = { top: 1280, h: 640 };
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const SPECKS = Array.from({ length: 32 }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`ql${i}`)), off: random(`qo${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`q${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = BAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const a = (0.22 + depth * 0.7) * 0.35 * Math.min(1, (BAND.h - y) / (80 * PS)) * Math.min(1, Math.max(0, y) / (BAND.h * 0.55)) * tw * env;
  return { x, y, rad, bucket, a: Math.max(0, Math.min(1, a)), color: PALETTE[Math.floor(r("c") * PALETTE.length)] };
};
const RosaParticles: React.FC<{ t: number; o: number }> = ({ t, o }) => (
  <div style={{ position: "absolute", left: 0, top: BAND.top, width: 1080, height: BAND.h, opacity: o, overflow: "hidden", pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 0, background:
      "radial-gradient(95% 100% at 18% 130%, rgba(3,42,250,.55) 0%, transparent 72%), radial-gradient(85% 90% at 82% 120%, rgba(36,177,97,.40) 0%, transparent 70%), linear-gradient(180deg, transparent 0%, rgba(3,42,250,.12) 100%)" }} />
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      {SPECKS.map(({ i, life, off }) => {
        const k = Math.floor((t + off) / life), p = speck(i, k, t + off - k * life, life);
        if (p.a <= 0.002) return null;
        const dot = (rad: number, blur: number, a: number, key: string) => (
          <div key={key} style={{ position: "absolute", left: p.x - rad, top: p.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%",
            background: `rgb(${p.color})`, opacity: a, filter: blur ? `blur(${blur * PS}px)` : undefined }} />
        );
        return (
          <React.Fragment key={i}>
            {p.bucket === 0 && p.rad > 1.4 * PS && dot(p.rad * 2.6, 8, p.a * 0.55, "g")}
            {dot(p.rad, p.bucket, p.a, "d")}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: snaps in from below on the cut, floats, drops out for the card ─
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 4 * Math.sin(t * 0.37 + 1.3), rz: -1.5 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const pop = outBack(seg(t, T.phone - 0.2, T.phone + 0.4));
  const enter = outExpo(seg(t, T.phone - 0.2, T.phone + 0.4));
  const exit = inOut(seg(t, T.card - 0.45, T.card + 0.1));
  const kick = (a: number) => Math.sin(Math.PI * seg(t, a - 0.15, a + 0.35));   // small lean on each swipe
  const lean = kick(T.spot) + kick(T.search);
  const pose = {
    x: -205, y: lerp(700, -30, enter) + float.y + 900 * exit, s: lerp(0.86, 0.98, pop),
    rx: float.rx + lerp(14, 0, enter), ry: float.ry + lerp(-24, 0, enter) - 12 * lean, rz: float.rz + 2 * lean,
    o: t < T.phone - 0.2 ? 0 : 1 - exit,
  };
  const swipe = (a: number) => 400 * (1 - outExpo(seg(t, a - 0.15, a + 0.3)));
  const spotO = seg(t, T.spot - 0.15, T.spot) * (1 - seg(t, T.search, T.search + 0.15));
  const searchO = seg(t, T.search - 0.15, T.search);

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* dark panel while the phone is the subject */}
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone - 0.1, T.card, 0.3, 0.4) }} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.4} to={T.out} startFrom={2} dark={0.5} zoom={0.1} fadeIn={0.8} />
      <RosaParticles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook: black card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 250, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.1, 30, 0.4, 0.15)}>Free surf forecast</Eyebrow>
        <H1 size={140} style={{ marginTop: 26, ...rise(t, 0.15, T.phone - 0.1, 50, 0.4, 0.15) }}>No account.</H1>
        <H1 size={140} style={{ color: C.acc, ...rise(t, 0.6, T.phone - 0.1, 50, 0.4, 0.15) }}>No paywall.</H1>
      </div>

      <Phone pose={pose}>
        <Screen src="captures/home.png" scroll={HOME_SCROLL} />
        {spotO > 0 && <Screen src="captures/spot-supertubos.png" o={spotO} x={swipe(T.spot)} />}
        {searchO > 0 && <Screen src="captures/search.png" o={searchO} x={swipe(T.search)} />}
        {RINGS.map((r, i) => (
          <div key={i} style={{
            position: "absolute", left: r.x - 3, top: r.y - 3, width: r.w + 6, height: r.h + 6, borderRadius: 18,
            border: "1.5px solid rgba(255,255,255,.9)", boxShadow: `0 0 14px ${C.good}`, opacity: win(t, r.from, r.to, 0.25, 0.15),
            transform: `scale(${1 + 0.08 * Math.sin(Math.max(0, t - r.from) * 9)})`,
          }} />
        ))}
      </Phone>

      {/* beats on the right */}
      {BEATS.map((b) => t > b.from - 0.1 && t < b.to + 0.1 && (
        <div key={b.title} style={{ position: "absolute", left: B.x + 530, top: B.y + 150, width: 420 }}>
          <Eyebrow style={rise(t, b.from, b.to, 30, 0.35, 0.15)}>{b.eyebrow}</Eyebrow>
          <H1 size={72} style={{ marginTop: 18, ...rise(t, b.from + 0.08, b.to, 40, 0.35, 0.15) }}>{b.title}</H1>
          <Sub size={32} style={{ marginTop: 20, ...rise(t, b.from + 0.18, b.to, 30, 0.35, 0.15) }}>{b.sub}</Sub>
        </div>
      ))}

      {/* card: No paywall. No trial. */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 260, width: B.w, textAlign: "center" }}>
        <H1 size={136} style={rise(t, T.card, T.end - 0.05, 60, 0.4, 0.2)}>No paywall.</H1>
        <H1 size={136} style={{ color: C.acc, ...rise(t, T.card + 0.45, T.end - 0.05, 60, 0.4, 0.2) }}>No trial.</H1>
        <Sub size={38} style={{ marginTop: 34, ...rise(t, T.card + 0.8, T.end - 0.05, 30, 0.4, 0.2) }}>Free is the whole idea.</Sub>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.5, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.6)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.12, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.25, T.out + 1)}>rosa.surf, it's free.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.4, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.55, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.6} />
    </AbsoluteFill>
  );
};

export default Film;
