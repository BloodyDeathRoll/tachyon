import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, Pill, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Uluwatu hour by hour, 12 s. Hook "Uluwatu, hour by hour." on Pixabay surf, the phone tilts in on the
  Uluwatu spot page (captures-light/spot-uluwatu-full.png), drops to the hourly table and steps down it one
  3-hour row at a time, pauses and pushes in on the green "Best session" tag, then glides on to the
  tide curve and the first light / sunset row. End card: logo, rosa.surf/spot/uluwatu.
  Numbers: clients/rosa/product.md (16 days, 3-hour steps).
  Screen coordinates below are the capture (1170×4659) scaled to the 400 px screen (1593 px tall).
*/

export const SECONDS = 12;
const T = { hook: 0, phone: 2.0, table: 2.7, s1: 3.4, s2: 3.9, best: 4.3, s3: 6.0, s4: 6.4, tide: 6.8, end: 9.3, out: 12 };

// scroll stops in screen px: top → table → one row (≈72 px) per 3 hours → tide and light row
const ROW = 72;
const TABLE = 330;
const TIDE = 733 - 74;
const STEPS: [number, number][] = [[T.table, TABLE], [T.s1, TABLE + ROW], [T.s2, TABLE + 2 * ROW], [T.s3, TABLE + 3 * ROW], [T.s4, TABLE + 4 * ROW]];
// the "Best session" tag and the tide + light block, in capture-screen px
const TAG = { x: 285, y: 635, w: 104, h: 23 };
const TIDEBOX = { x: 12, y: 1098 - 74, w: 376, h: 178 };
// the capture has the app's bottom nav baked in over the 12:00 row: cut that band out of the scrolling page and
// pin the nav pill (cropped from the same capture) to the screen bottom, where the app keeps it
const CUT = [777, 864]; // starts above the baked nav's top edge and shadow (pill top ≈ 785) so no sliver scrolls
const NAV = { x: 17, y: 785, w: 366, h: 63 };

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

  // ── phone: tilts in from below, floats, drops out for the end card ────────
  const float = { ry: 9 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const pose = {
    x: -205,y: lerp(700, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, enter),
    rx: float.rx + lerp(55, 0, tilt), ry: float.ry + lerp(-25, 0, tilt), rz: float.rz + lerp(8, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── scroll: snappy 3-hour steps, then a long glide to the tide ─────────────
  let scroll = 0;
  for (const [at, to] of STEPS) scroll = lerp(scroll, to, inOut(seg(t, at, at + (at === T.table ? 0.5 : 0.3))));
  scroll = lerp(scroll, TIDE, inOut(seg(t, T.tide, T.tide + 0.8)));

  // ── push-in on the Best session tag while the table pauses ─────────────────
  const zin = inOut(seg(t, T.best, T.best + 0.6));
  const zout = inOut(seg(t, T.s3 - 0.5, T.s3));
  const z = lerp(1, lerp(2.2, 1, zout), zin);
  const px = TAG.x + TAG.w / 2, py = TAG.y + TAG.h / 2 - scroll;
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * px));
  const ty = Math.min(0, Math.max(860 - 860 * z, 430 - z * py));
  const ring = win(t, T.best + 0.4, T.s3 - 0.3, 0.3, 0.3);
  const pulse = 1 + 0.08 * Math.sin(Math.max(0, t - T.best - 0.4) * 9);
  const tideRing = win(t, T.tide + 0.7, T.end - 0.4, 0.4, 0.3);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/1306-145340152_medium.mp4" from={0} to={T.phone + 1.0} startFrom={0} dark={0.45} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.2, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/1306-145340152_medium.mp4" from={T.end - 0.6} to={T.out} startFrom={1} dark={0.5} zoom={0.1} fadeIn={1.0} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.6, 0.01)} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.1, T.phone - 0.1)}>Spot page · Uluwatu</Eyebrow>
        <H1 size={124} style={{ marginTop: 26, ...rise(t, 0.25, T.phone - 0.1) }}>Uluwatu,</H1>
        <H1 size={124} style={{ ...rise(t, 0.4, T.phone - 0.1) }}>hour by <span style={{ color: C.acc }}>hour.</span></H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.6, T.phone - 0.1) }}>Every 3 hours, 16 days ahead.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 400, transform: `translateY(${-scroll}px)` }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: CUT[0], overflow: "hidden" }}><Screen src="captures-light/spot-uluwatu-full.png" /></div>
            <div style={{ position: "absolute", left: 0, top: CUT[0], width: 400, height: 1593 - CUT[1], overflow: "hidden" }}><Screen src="captures-light/spot-uluwatu-full.png" scroll={CUT[1]} /></div>
            {/* Best session ring */}
            <div style={{ position: "absolute", left: TAG.x - 3, top: TAG.y - 3, width: TAG.w + 6, height: TAG.h + 6, borderRadius: 10, border: "1.5px solid rgba(255,255,255,.9)", boxShadow: `0 0 14px ${C.good}`, opacity: ring, transform: `scale(${pulse})` }} />
            {/* tide + light frame */}
            <div style={{ position: "absolute", left: TIDEBOX.x, top: TIDEBOX.y, width: TIDEBOX.w, height: TIDEBOX.h, borderRadius: 18, border: `1.5px solid ${C.acc}`, boxShadow: `0 0 18px rgba(17,183,242,.6)`, opacity: tideRing }} />
          </div>
        </div>
        {/* outside the zoom layer: the app's nav stays put while the page scrolls and zooms */}
        <div style={{ position: "absolute", left: NAV.x, top: NAV.y, width: NAV.w, height: NAV.h, borderRadius: NAV.h / 2, overflow: "hidden", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
          <Screen src="captures-light/spot-uluwatu-full.png" x={-NAV.x} scroll={NAV.y} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.table + 0.2, T.best - 0.05)}>The table</Eyebrow>
          <H1 size={68} style={{ marginTop: 18, ...rise(t, T.table + 0.3, T.best - 0.05) }}>Every 3 hours</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.table + 0.45, T.best - 0.05) }}>Size, swell and wind, row by row.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.best + 0.4, T.s3 - 0.1)}>Look for</Eyebrow>
          <div style={{ marginTop: 22, ...rise(t, T.best + 0.5, T.s3 - 0.1), transform: `${rise(t, T.best + 0.5, T.s3 - 0.1).transform} scale(${lerp(0.8, 1, outBack(seg(t, T.best + 0.5, T.best + 1.0)))})`, transformOrigin: "0 50%" }}>
            <Pill bg={C.good} size={48}>Best session</Pill>
          </div>
          <Sub size={30} style={{ marginTop: 22, ...rise(t, T.best + 0.7, T.s3 - 0.1) }}>Tagged right in the table.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.tide + 0.5, T.end - 0.3)}>Keep going</Eyebrow>
          {["Tide curve", "First light", "Sunset"].map((s, i) => (
            <H1 key={s} size={60} style={{ marginTop: i === 0 ? 22 : 14, ...rise(t, T.tide + 0.7 + 0.25 * i, T.end - 0.3, 30) }}>{s}</H1>
          ))}
          <Sub size={30} style={{ marginTop: 22, ...rise(t, T.tide + 1.5, T.end - 0.3) }}>Plan the paddle out.</Sub>
        </div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={{ color: "#fff", ...rise(t, T.end + 0.3, T.out + 1) }}>Uluwatu, every 3 hours.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40, marginTop: 36,
          boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf/spot/uluwatu <span>→</span></div>
        <Sub size={30} style={{ color: "#fff", ...rise(t, T.end + 0.6, T.out + 1) }}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
