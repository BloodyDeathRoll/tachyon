import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Public data credited, 13 s. Hook "The data is public. So's this." over Pixabay wave footage (1306-145340152),
  the phone flies in on the Uluwatu spot page (captures-light/spot-uluwatu-full.png) and scrolls to the hourly table.
  The sources stack up one per beat, each ringing what it feeds: NOAA + ECMWF → surf, DWD → peak periods,
  Open-Meteo → wind, EOT20 → tide (clients/rosa/product.md). Card: "Public data. Free forecast."
  End card: logo, rosa.surf →, it's free, Footage: Pixabay. No numbers in the callouts.
  Screen coordinates are the capture (1170×4659) scaled to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.2, noaa: 2.9, ecmwf: 3.5, dwd: 4.1, meteo: 4.7, eot: 5.3, card: 7.0, end: 9.8, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const SURF = r(160, 1365, 280, 940);     // SURF M column, first four hours
const SWELL = r(455, 1365, 200, 940);    // SWELL column: peak periods
const WIND = r(670, 1365, 270, 940);     // WIND KM/H column
const TIDE = r(30, 3195, 1110, 380);     // tide curve
const SCROLL = 420;

const SOURCES = [
  { name: "NOAA", what: "Waves · GFS-Wave", at: T.noaa, color: C.acc },
  { name: "ECMWF", what: "Waves · open data", at: T.ecmwf, color: C.acc },
  { name: "DWD", what: "Peak periods · GWAM", at: T.dwd, color: C.good },
  { name: "Open-Meteo", what: "Weather", at: T.meteo, color: C.wind },
  { name: "EOT20", what: "Tides", at: T.eot, color: C.acc },
];

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

const Ring: React.FC<{ b: { x: number; y: number; w: number; h: number }; color: string; o: number; s?: number; glow?: number; radius?: number }> = ({ b, color, o, s = 1, glow = 12, radius = 10 }) => (
  <div style={{ position: "absolute", left: b.x - 2, top: b.y - 2, width: b.w + 4, height: b.h + 4, borderRadius: radius, border: `1.5px solid ${color}`,
    boxShadow: `0 0 ${glow}px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: flies in from below with a spin, floats, drops out for the card ──
  const float = { ry: 10 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.card - 0.5, T.card + 0.2));
  const pose = {
    x: lerp(300, -205, enter), y: lerp(760, -30, enter) + float.y + 900 * exit, s: lerp(0.75, 0.98, enter),
    rx: float.rx + lerp(40, 0, tilt), ry: float.ry + lerp(-60, 0, tilt), rz: float.rz + lerp(14, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── screen: from the top of the spot page down to the hourly table + tide ──
  const scroll = interpolate(t, [T.phone + 0.2, T.noaa - 0.1], [0, SCROLL], { easing: inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pop = (a: number) => lerp(1.2, 1, outBack(seg(t, a, a + 0.4)));
  const ringO = (a: number) => win(t, a, T.card - 0.4, 0.25, 0.3);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/1306-145340152_medium.mp4" from={0} to={T.phone + 1.0} dark={0.45} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.3, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/1306-145340152_medium.mp4" from={T.end - 0.6} to={T.out} startFrom={2} dark={0.5} zoom={0.1} fadeIn={1.0} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook over the footage */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.1)}>Public data, credited</Eyebrow>
        <H1 size={124} style={{ marginTop: 26, ...rise(t, 0.15, T.phone - 0.1) }}>The data</H1>
        <H1 size={124} style={{ ...rise(t, 0.3, T.phone - 0.1) }}>is public.</H1>
        <H1 size={124} style={{ color: C.acc, ...rise(t, 0.6, T.phone - 0.1) }}>So's this.</H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.85, T.phone - 0.1) }}>Every source, credited on every forecast.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, transform: `translateY(${-scroll}px)` }}>
          <Screen src="captures-light/spot-uluwatu-full.png" />
          <Ring b={SURF} color={C.acc} o={ringO(T.noaa)} s={pop(T.noaa)} glow={8 + 10 * win(t, T.ecmwf, T.ecmwf + 0.5, 0.15, 0.3)} />
          <Ring b={SWELL} color={C.good} o={ringO(T.dwd)} s={pop(T.dwd)} />
          <Ring b={WIND} color={C.wind} o={ringO(T.meteo)} s={pop(T.meteo)} />
          <Ring b={TIDE} color={C.acc} o={ringO(T.eot)} s={pop(T.eot)} radius={16} />
        </div>
      </Phone>

      {/* the sources stack up on the right, one per beat */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 60, width: 420 }}>
        <Eyebrow style={rise(t, T.phone + 0.3, T.card - 0.1)}>The sources</Eyebrow>
        {SOURCES.map((s) => (
          <div key={s.name} style={{ marginTop: 30, ...rise(t, s.at, T.card - 0.1, 50, 0.45) }}>
            <H1 size={66} style={{ transform: `scale(${lerp(1.15, 1, outBack(seg(t, s.at, s.at + 0.4)))})`, transformOrigin: "0 50%" }}>{s.name}</H1>
            <Sub size={26} style={{ marginTop: 6, color: s.color }}>{s.what}</Sub>
          </div>
        ))}
      </div>

      {/* card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w }}>
        <H1 size={140} style={rise(t, T.card, T.end - 0.1, 60, 0.45)}>Public</H1>
        <H1 size={140} style={rise(t, T.card + 0.15, T.end - 0.1, 60, 0.45)}>data.</H1>
        <H1 size={140} style={{ marginTop: 30, color: C.acc, ...rise(t, T.card + 0.6, T.end - 0.1, 60, 0.45) }}>Free</H1>
        <H1 size={140} style={{ color: C.acc, ...rise(t, T.card + 0.75, T.end - 0.1, 60, 0.45) }}>forecast.</H1>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.3, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={34} style={rise(t, T.end + 0.45, T.out + 1)}>it's free</Sub>
      </div>
      <Credit t={t} from={T.end + 0.7} />
    </AbsoluteFill>
  );
};

export default Film;
