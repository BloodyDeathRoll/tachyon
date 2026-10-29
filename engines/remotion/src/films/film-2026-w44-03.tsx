import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Everything's free, 11 s. Hook "All of it. Free." on a black card, fast cut to the phone, one beat per
  swipe, timed to the VO ("Three thousand spots. Sixteen days out... Live cams. Swell map. And the price?
  Zero. Rosa is free, for real.", from 1.1 s): search (captures/search.png) "3,056 spots", Supertubos
  (captures/spot-supertubos.png) "16-day forecast", "Live cams": a Pixabay surf clip (218670) full-screen
  inside the phone with a LIVE tag, swell map (captures/charts.png) "Swell map". A black card reads "Price? Zero. No paywall.
  No trial." End card: logo, "it's free". Numbers: clients/rosa/product.md.
*/

export const SECONDS = 11;
const T = { hook: 0, phone: 1.1, spot: 2.45, cams: 3.85, charts: 5.05, card: 5.95, end: 7.6, out: 11 };   // on the voice-over words (VO starts at 1.1 s)

const BEATS = [
  { from: T.phone + 0.2, to: T.spot, title: "3,056 spots" },
  { from: T.spot, to: T.cams, title: "16-day forecast" },
  { from: T.cams, to: T.charts, title: "Live cams" },
  { from: T.charts, to: T.card - 0.2, title: "Swell map" },
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
  const lean = kick(T.spot) + kick(T.cams) + kick(T.charts);
  const pose = {
    x: -205, y: lerp(700, -30, enter) + float.y + 900 * exit, s: lerp(0.86, 0.98, pop),
    rx: float.rx + lerp(14, 0, enter), ry: float.ry + lerp(-24, 0, enter) - 12 * lean, rz: float.rz + 2 * lean,
    o: t < T.phone - 0.2 ? 0 : 1 - exit,
  };
  const swipe = (a: number) => 400 * (1 - outExpo(seg(t, a - 0.15, a + 0.3)));
  const spotO = seg(t, T.spot - 0.15, T.spot) * (1 - seg(t, T.charts, T.charts + 0.15));
  const chartsO = seg(t, T.charts - 0.15, T.charts);

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* dark panel while the phone is the subject */}
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone - 0.1, T.card, 0.3, 0.4) }} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.4} to={T.out} startFrom={2} dark={0.5} zoom={0.1} fadeIn={0.8} />
      <RosaParticles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook: black card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 250, width: B.w }}>
        <H1 size={160} style={rise(t, 0.05, T.phone - 0.1, 50, 0.35, 0.15)}>All of it.</H1>
        <H1 size={160} style={{ color: C.acc, ...rise(t, 0.4, T.phone - 0.1, 50, 0.35, 0.15) }}>Free.</H1>
      </div>

      <Phone pose={pose}>
        <Screen src="captures/search.png" />
        {spotO > 0 && <Screen src="captures/spot-supertubos.png" o={spotO} x={swipe(T.spot)} />}
        {/* "Live cams": the Pixabay surf clip fills the phone screen, with a LIVE tag */}
        {t > T.cams - 0.2 && t < T.charts + 0.15 && (
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${swipe(T.cams)}px)` }}>
            <Footage src="footage/218670_large.mp4" from={T.cams - 0.15} to={T.charts + 0.1} startFrom={2} dark={0.1} zoom={0.06} fadeIn={0.12} fadeOut={0.12} />
            <div style={{ ...font, position: "absolute", left: 28, top: 76, display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 20px", borderRadius: 999, background: C.bad, fontWeight: 800, fontSize: 38, color: "#fff", opacity: win(t, T.cams, T.charts, 0.2, 0.1) }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 4)) }} />LIVE
            </div>
          </div>
        )}
        {chartsO > 0 && <Screen src="captures/charts.png" o={chartsO} x={swipe(T.charts)} />}
      </Phone>

      {/* beats on the right */}
      {BEATS.map((b) => t > b.from - 0.1 && t < b.to + 0.1 && (
        <div key={b.title} style={{ position: "absolute", left: B.x + 530, top: B.y + 150, width: 420 }}>
          <H1 size={80} style={rise(t, b.from, b.to, 40, 0.3, 0.15)}>{b.title}</H1>
        </div>
      ))}

      {/* card: Price? Zero. */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 260, width: B.w, textAlign: "center" }}>
        <H1 size={150} style={rise(t, T.card, T.end - 0.05, 60, 0.4, 0.2)}>Price?</H1>
        <H1 size={150} style={{ color: C.acc, ...rise(t, T.card + 0.4, T.end - 0.05, 60, 0.4, 0.2) }}>Zero.</H1>
        <Sub size={48} style={{ marginTop: 34, ...rise(t, T.card + 0.7, T.end - 0.05, 30, 0.4, 0.2) }}>No paywall. No trial.</Sub>
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
