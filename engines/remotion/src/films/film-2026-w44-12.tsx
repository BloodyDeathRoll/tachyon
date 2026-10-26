import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Pipeline live cam, 13 s. Hook "Forecast first. Then the cam." on a black card. The phone rises on the
  Banzai Pipeline spot page (captures-light/spot-pipeline.png): the week strip first, then the in-screen camera
  scrolls down to the embedded live cam with its owner credit line, then to the Good badge and the
  Size / Period / Wind bars. Card: "Forecast, then the cam." End card: logo, rosa.surf →, link in bio,
  Footage: Pixabay. No numbers on screen outside the capture. Screen coordinates are the capture
  (1170×2532) scaled to 400 px.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 1.8, strip: 2.3, cam: 4.5, good: 6.9, card: 9.2, end: 10.8, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const STRIP = r(38, 162, 823, 440);                   // Today 24 .. Wed 28, labels to ranges
const CAM = r(0, 668, 1170, 658);                     // the embedded YouTube cam
const CREDIT = r(44, 1340, 1010, 102);                // "Live cam by Explore … explore.org North Shore stream"
const BADGE = r(96, 1524, 170, 68);                   // Good
const BARS = r(548, 1520, 412, 344);                  // Size · Period · Wind · Clarity bars

type Box = { x: number; y: number; w: number; h: number };
const Ring: React.FC<{ b: Box; color: string; o: number; s?: number; radius?: number }> = ({ b, color, o, s = 1, radius = 12 }) => (
  <div style={{ position: "absolute", left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, borderRadius: radius, border: `2px solid ${color}`,
    boxShadow: `0 0 14px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

// in-screen camera stops: focus point (screen px) and zoom; widths chosen so each subject stays whole
const STOPS = {
  strip: { x: 160, y: 130, z: 1.25 },  // Today .. Wed
  cam: { x: 188, y: 380, z: 1.15 },    // cam + full credit line
  good: { x: 179, y: 580, z: 1.3 },    // badge + bars
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

  // ── in-screen camera: full page → strip → scroll down to the cam → down to Good + bars ──
  const inK = inOut(seg(t, T.strip, T.strip + 0.7));
  const toCam = inOut(seg(t, T.cam - 0.4, T.cam + 0.5));
  const toGood = inOut(seg(t, T.good - 0.4, T.good + 0.5));
  const lerpStop = (k: "x" | "y" | "z") => lerp(lerp(STOPS.strip[k], STOPS.cam[k], toCam), STOPS.good[k], toGood);
  const zoom = lerpStop("z"), fx = lerpStop("x"), fy = lerpStop("y");
  // focus point to the middle of the screen (400 × 860), never past the capture's edges
  const tx = Math.min(0, Math.max(400 - 400 * zoom, 200 - fx * zoom)), ty = Math.min(0, Math.max(860 - 866 * zoom, 430 - fy * zoom));
  const cam = `translate(${lerp(0, tx, inK)}px, ${lerp(0, ty, inK)}px) scale(${lerp(1, zoom, inK)})`;

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* black card for the hook, dark panel for the phone, footage for card and end */}
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone - 0.3, T.card + 0.2, 0.8, 0.6) }} />
      <Footage src="footage/1306-145340152_medium.mp4" from={T.card - 0.4} to={T.out} startFrom={2} dark={0.55} zoom={0.1} fadeIn={0.8} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 90, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Banzai Pipeline · Hawaii</Eyebrow>
        <H1 size={150} style={{ marginTop: 24, ...rise(t, 0.12, T.phone - 0.15, 60) }}>Forecast</H1>
        <H1 size={150} style={rise(t, 0.24, T.phone - 0.15, 60)}>first.</H1>
        <H1 size={150} style={{ color: C.acc, ...rise(t, 0.6, T.phone - 0.15, 60) }}>Then</H1>
        <H1 size={150} style={{ color: C.acc, ...rise(t, 0.72, T.phone - 0.15, 60) }}>the cam.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, transformOrigin: "0 0", transform: cam }}>
          <Screen src="captures-light/spot-pipeline.png" />
          <Ring b={STRIP} color={C.good} o={win(t, T.strip + 0.6, T.cam - 0.4, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.strip + 0.6, T.strip + 1.0)))} radius={10} />
          <Ring b={CAM} color={C.acc} o={win(t, T.cam + 0.5, T.good - 0.4, 0.25, 0.3)} s={lerp(1.04, 1, outBack(seg(t, T.cam + 0.5, T.cam + 0.9)))} radius={4} />
          <Ring b={CREDIT} color={C.ink} o={win(t, T.cam + 1.2, T.good - 0.4, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.cam + 1.2, T.cam + 1.6)))} radius={8} />
          <Ring b={BADGE} color={C.good} o={win(t, T.good + 0.5, T.card - 0.5, 0.25, 0.3)} s={lerp(1.2, 1, outBack(seg(t, T.good + 0.5, T.good + 0.9)))} radius={999} />
          <Ring b={BARS} color={C.good} o={win(t, T.good + 1.1, T.card - 0.5, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.good + 1.1, T.good + 1.5)))} radius={10} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.strip + 0.4, T.cam - 0.1)}><Eyebrow>The week</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Forecast first.</H1><Sub size={28} style={{ marginTop: 10 }}>Every day rated, at a glance.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.cam + 0.4, T.good - 0.1) }}><Eyebrow>Live cam</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Then the cam.</H1>
          <Sub size={28} style={{ marginTop: 10, ...rise(t, T.cam + 1.2, T.good - 0.1, 30) }}>Official embed. Owner credited.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.good + 0.4, T.card - 0.3) }}><Eyebrow>Today</Eyebrow><H1 size={64} style={{ marginTop: 12, color: C.good }}>Good.</H1>
          <H1 size={64} style={rise(t, T.good + 1.0, T.card - 0.3, 30)}>And why.</H1>
          <Sub size={28} style={{ marginTop: 10, ...rise(t, T.good + 1.2, T.card - 0.3, 30) }}>Size, period and wind.</Sub></div>
      </div>

      {/* card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 220, width: B.w }}>
        <Eyebrow style={rise(t, T.card, T.end - 0.1)}>Check, then go</Eyebrow>
        <H1 size={110} style={{ marginTop: 24, ...rise(t, T.card + 0.1, T.end - 0.1, 60) }}>Forecast,</H1>
        <H1 size={110} style={{ color: C.acc, ...rise(t, T.card + 0.4, T.end - 0.1, 60) }}>then the cam.</H1>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>Free surf forecast, worldwide.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
