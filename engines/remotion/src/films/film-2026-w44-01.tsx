import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, Pill, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Pipeline: why Good, 12 s. Hook "Why Good and not Epic?" on Pixabay surf, the phone swings in on
  the Banzai Pipeline spot page (captures/spot-pipeline.png), pushes in on the green Good badge, then
  the Size, Period and Wind bars light up one by one: size and period run long, wind stops short.
  Numbers: clients/rosa/product.md (Good 50–69, Epic 70+; "wind can only polish").
  Screen coordinates below are the capture (1170 wide) scaled to the 400 px screen.
*/

export const SECONDS = 12;
const T = { hook: 0, phone: 2.0, push: 3.1, size: 4.3, period: 5.1, wind: 5.9, polish: 6.9, end: 9.2, out: 12 };

// the rating card in screen px
const BADGE = { x: 31, y: 519, w: 62, h: 27 };
const BAR = { x: 258, w: 66, h: 7 };
const BARS = [
  { name: "Size", y: 529, len: 1.0, color: C.good, at: T.size, note: "runs long" },
  { name: "Period", y: 554, len: 0.84, color: C.good, at: T.period, note: "runs long" },
  { name: "Wind", y: 579, len: 0.5, color: C.fair, at: T.wind, note: "stops short" },
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

  // ── phone: swings in from the left, floats, drops out for the end card ─────
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 4 * Math.sin(t * 0.37 + 1.3), rz: -1.5 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const swing = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const pose = {
    x: lerp(-700, -205, swing), y: lerp(160, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, enter),
    rx: float.rx + lerp(8, 0, enter), ry: float.ry + lerp(-70, 0, swing), rz: float.rz + lerp(-14, 0, swing),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── push-in inside the screen: full → Good badge → the bars → full ─────────
  const toBadge = inOut(seg(t, T.push, T.push + 0.7));
  const toBars = inOut(seg(t, T.size - 0.35, T.size + 0.15));
  const back = inOut(seg(t, T.end - 1.0, T.end - 0.4));
  const z = lerp(lerp(lerp(1, 2.4, toBadge), 2.3, toBars), 1, back);
  const px = lerp(lerp(lerp(200, 62, toBadge), 262, toBars), 200, back);
  const py = lerp(lerp(lerp(430, 532, toBadge), 554, toBars), 430, back);
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * px));
  const ty = Math.min(0, Math.max(860 - 866 * z, 430 - z * py));
  const ring = win(t, T.push + 0.5, T.size - 0.2, 0.3, 0.3);
  const pulse = 1 + 0.08 * Math.sin(Math.max(0, t - T.push - 0.5) * 9);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/218670_large.mp4" from={0} to={T.phone + 1.0} startFrom={1} dark={0.45} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.2, T.end - 0.2, 0.8, 0.7) }} />
      <RosaParticles t={t} o={win(t, T.phone + 0.2, T.end - 0.2, 0.8, 0.7)} />
      <Footage src="footage/218670_large.mp4" from={T.end - 0.6} to={T.out} startFrom={4} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.1, T.phone - 0.1)}>Banzai Pipeline · today</Eyebrow>
        <H1 size={120} style={{ marginTop: 26, ...rise(t, 0.25, T.phone - 0.1) }}>Why <span style={{ color: C.good }}>Good</span></H1>
        <H1 size={120} style={{ ...rise(t, 0.4, T.phone - 0.1) }}>and not <span style={{ color: C.epic, WebkitTextStroke: `2px ${C.good}` }}>Epic?</span></H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.6, T.phone - 0.1) }}>Three bars decide it.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <Screen src="captures/spot-pipeline.png" />
          {/* Good badge ring */}
          <div style={{ position: "absolute", left: BADGE.x - 3, top: BADGE.y - 3, width: BADGE.w + 6, height: BADGE.h + 6, borderRadius: 18, border: "1.5px solid rgba(255,255,255,.9)", boxShadow: `0 0 14px ${C.good}`, opacity: ring, transform: `scale(${pulse})` }} />
          {/* bars: dim the capture's, then light them one at a time */}
          {BARS.map((b) => {
            const k = outExpo(seg(t, b.at, b.at + (b.len < 1 ? 0.45 : 0.6)));
            const glow = win(t, b.at, b.at + 0.9, 0.15, 0.5);
            const short = b.len < 1 ? win(t, b.at + 0.5, T.end - 0.4, 0.3, 0.3) : 0;
            return (
              <React.Fragment key={b.name}>
                <div style={{ position: "absolute", left: BAR.x - 1, top: b.y - BAR.h / 2 - 1, width: BAR.w + 2, height: BAR.h + 2, borderRadius: 5, background: "#141a26", opacity: seg(t, T.size - 0.4, T.size - 0.1) }} />
                {short > 0 && <div style={{ position: "absolute", left: BAR.x + BAR.w * b.len + 1, top: b.y - BAR.h / 2, width: BAR.w * (1 - b.len) - 1, height: BAR.h, borderRadius: 4, border: `1px dashed ${C.wind}`, opacity: short }} />}
                <div style={{ position: "absolute", left: BAR.x, top: b.y - BAR.h / 2, width: BAR.w * b.len * k, height: BAR.h, borderRadius: 4, background: b.color, boxShadow: `0 0 ${10 * glow}px ${b.color}`, opacity: seg(t, T.size - 0.4, T.size - 0.1) }} />
              </React.Fragment>
            );
          })}
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.push + 0.5, T.size - 0.1)}>
          <Eyebrow>Today</Eyebrow>
          <div style={{ marginTop: 18 }}><Pill bg={C.good} size={56}>Good</Pill></div>
          <Sub size={30} style={{ marginTop: 18 }}>Good is 50–69. Epic starts at 70.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.size, T.end - 0.3)}>Why Good</Eyebrow>
          {BARS.map((b, i) => (
            <div key={b.name} style={{ marginTop: i === 0 ? 22 : 26, ...rise(t, b.at + 0.1, T.end - 0.3, 30) }}>
              <H1 size={58}>{b.name}</H1>
              <Sub size={28} style={{ marginTop: 4, color: b.len < 1 ? C.wind : C.good, fontWeight: 700 }}>{b.note}</Sub>
            </div>
          ))}
          <div style={{ marginTop: 36, ...rise(t, T.polish, T.end - 0.3, 40) }}>
            <div style={{ padding: "26px 28px", borderRadius: 28, background: "rgba(14,17,24,.92)", boxShadow: `0 0 0 1.5px ${C.wind} inset, 0 30px 80px rgba(0,0,0,.6)`, transform: `scale(${lerp(0.85, 1, outBack(seg(t, T.polish, T.polish + 0.5)))})` }}>
              <H1 size={52}><span style={{ color: C.wind }}>So </span>wind can only polish</H1>
            </div>
          </div>
        </div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>Size, period and wind. Every spot.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
