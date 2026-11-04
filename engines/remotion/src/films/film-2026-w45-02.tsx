import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Zoom to Supertubos, 15 s. Motion language: multi-scale camera zoom (a single glowing dot opens the frame, a
  three-octave dot grid scales with the camera's zoom, windows emerge as points and grow
  until they fill the frame, motion blur on the fast legs, the end zooms everything back to a point).
  A dot on black irises open onto Pixabay ocean footage (1306-145340152); hook "From space / to / Supertubos."
  The phone on captures/map.png appears as a point and the camera dives through it onto the pins; an accent
  iris punches through the pin into captures/spot-supertubos.png full screen. The camera pushes into the hour
  rows until the 06:00 row fills the frame ("Every 3 hours."), then pulls back to the phone floating over
  Pixabay surfer footage (218670) with "16 days." and "3,500+ spots.". Everything zooms out to a point that
  blooms into the end card: logo, white "Your break, up close.", space, glowing blue "rosa.surf →".
  Dark theme: captures/ only. 3,500+ is the operator's number (product.md still says 3,056); 16 days and
  3-hour steps from product.md. VO from 0.5 s.
*/

export const SECONDS = 15;
const T = { dot: 0, dive: 1.3, iris: 3.1, swap: 3.45, rows: 4.05, pull: 6.0, rest: 6.9, plates: 6.7, out: 8.2, end: 8.95, fin: 15 };

// camera keyframes: [time, phone scale, screen point u, v (400 px screen coords), frame point fx, fy it sits on]
type K = [number, number, number, number, number, number];
const MAP: K[] = [[T.dive, 0.006, 205, 440, 540, 760], [T.swap, 12, 205, 440, 540, 760]];
const restY = (B: { y: number; h: number }) => B.y + B.h - 340;
const TUBOS = (B: { y: number; h: number }): K[] => [
  [T.swap, 1.7, 200, 330, 540, 760], [3.95, 2.7, 200, 282, 540, 760], [T.rows, 2.7, 200, 282, 540, 760],
  [4.9, 4.4, 175, 535, 540, 900],                     // 00:00 row
  [5.55, 5.4, 175, 682, 540, 900], [T.pull, 5.4, 175, 682, 540, 900],   // glide down to the 06:00 row and hold
  [T.rest, 0.77, 200, 430, 710, restY(B)], [T.out, 0.77, 200, 430, 710, restY(B)],
  [T.end - 0.05, 0.004, 200, 430, 540, 520],          // back to a point where the logo blooms
];
const cam = (t: number, ks: K[]) => {
  if (t <= ks[0][0]) return ks[0];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) {
    const a = ks[i - 1], b = ks[i], e = inOut(seg(t, a[0], b[0]));
    return [t, Math.pow(2, lerp(Math.log2(a[1]), Math.log2(b[1]), e)), lerp(a[2], b[2], e), lerp(a[3], b[3], e), lerp(a[4], b[4], e), lerp(a[5], b[5], e)] as K;
  }
  return ks[ks.length - 1];
};
// warp: continuous log2 zoom (the map leg hands over to the spot leg at the same value) plus a slow drift
const warp = (t: number, B: { y: number; h: number }) =>
  0.3 * t + (t < T.swap ? Math.log2(cam(t, MAP)[1]) : Math.log2(cam(t, TUBOS(B))[1]) + Math.log2(12 / 1.7));

// infinite-zoom dot grid: three octaves of a map grid scale with the camera and hand over seamlessly
const Grid: React.FC<{ w: number; o: number; cx: number; cy: number }> = ({ w, o, cx, cy }) => (
  <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, opacity: o }}>
    <defs>
      {[0, 1, 2].map((i) => {
        const p = (i + ((w % 1) + 1) % 1) / 3, d = 36 * Math.pow(2, 3 * p);
        return (
          <pattern key={i} id={`g${i}`} patternUnits="userSpaceOnUse" width={d} height={d} x={cx - d / 2} y={cy - d / 2}>
            <circle cx={d / 2} cy={d / 2} r={1 + d * 0.025} fill={C.acc} opacity={0.55 * Math.sin(Math.PI * p)} />
          </pattern>
        );
      })}
    </defs>
    {[0, 1, 2].map((i) => <rect key={i} width={1080} height={1920} fill={`url(#g${i})`} />)}
  </svg>
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── camera ──
  const onMap = t < T.swap;
  const [, s, u, v, fx, fy] = onMap ? cam(t, MAP) : cam(t, TUBOS(B));
  const w = warp(t, B), speed = (warp(t + 1 / 30, B) - w) * 30;
  const blur = Math.min(6, Math.max(0, (Math.abs(speed) - 2.5) * 0.9));
  const restK = inOut(seg(t, T.pull + 0.3, T.rest)) * (1 - inOut(seg(t, T.out, T.end - 0.2)));
  const pose = {
    x: fx - 540 - s * (u - 200),
    y: fy - 760 - s * (v - 430) + restK * 8 * Math.sin(t * 1.2),
    s,
    rx: restK * (8 + 3 * Math.sin(t * 0.7)),
    ry: restK * (-16 + 5 * Math.sin(t * 0.9)),
    rz: lerp(-25, 0, outExpo(seg(t, T.dive, T.dive + 1.2))) + restK * 3 + 40 * inOut(seg(t, T.out, T.end)),
    o: t < T.dive || t > T.end ? 0 : 1,
  };

  // ── opening: a dot irises open onto the footage ──
  const open = outExpo(seg(t, 0.15, 1.0));
  const dotO = 1 - seg(t, 0.4, 0.7);
  const diveK = inOut(seg(t, T.dive, T.swap));
  const iris = outExpo(seg(t, T.iris, T.swap)), irisO = 1 - seg(t, T.swap, T.swap + 0.3);

  // hook words punch on, then the camera flies through them
  const pass = inOut(seg(t, T.dive + 0.3, T.dive + 1.0));
  const word = (a: number): React.CSSProperties => ({ opacity: seg(t, a, a + 0.08) * (1 - pass), transform: `scale(${lerp(1.6, 1, outBack(seg(t, a, a + 0.3)))})`, transformOrigin: "left center" });

  // to-a-point exit for the rest copy
  const outK = inOut(seg(t, T.out, T.end - 0.15));
  const endDim = seg(t, T.out, T.end);

  const plate = (a: number): React.CSSProperties => ({ opacity: seg(t, a, a + 0.08), transform: `scale(${lerp(1.5, 1, outBack(seg(t, a, a + 0.35)))})`, transformOrigin: "left center" });

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ocean, pushed by the dive */}
      <AbsoluteFill style={{ clipPath: `circle(${lerp(0, 1300, open)}px at 540px 760px)`, transform: `scale(${Math.pow(2, 2.5 * diveK)})`, filter: `blur(${blur * 0.6}px)` }}>
        <Footage src="footage/1306-145340152_medium.mp4" from={0} to={T.swap + 0.1} startFrom={1} dark={0.35} zoom={0.15} fadeIn={0.01} fadeOut={0.2} />
      </AbsoluteFill>
      <Footage src="footage/218670_large.mp4" from={T.pull - 0.2} to={T.fin} startFrom={2} dark={0.4} zoom={0.12} fadeIn={0.6} />
      <AbsoluteFill style={{ background: "#000", opacity: 0.6 * endDim }} />

      <Grid w={w} cx={540} cy={lerp(760, 520, outK)} o={0.75 * (1 - win(t, T.rows - 0.3, T.pull + 0.2, 0.3, 0.4))} />

      {/* the first dot */}
      <div style={{ position: "absolute", left: 540 - 14, top: 760 - 14, width: 28, height: 28, borderRadius: "50%", background: "#fff", opacity: dotO,
        transform: `scale(${1 + 0.25 * Math.sin(t * 18)})`, boxShadow: `0 0 40px 12px rgba(17,183,242,.8)` }} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 40, width: B.w, transformOrigin: `${540 - B.x}px ${760 - B.y - 40}px`, transform: `scale(${lerp(1, 3.5, pass)})` }}>
        <H1 size={136} style={word(0.35)}>From space</H1>
        <H1 size={136} style={word(0.7)}>to</H1>
        <H1 size={136} style={{ color: C.acc, textShadow: "0 0 40px rgba(17,183,242,.6)", ...word(1.0) }}>Supertubos.</H1>
      </div>

      {/* the phone: a point that becomes the map, then the spot page, then a floating phone, then a point again */}
      <AbsoluteFill style={{ filter: `blur(${blur}px)` }}>
        <Phone pose={pose} glow={0.35}>
          {onMap ? <Screen src="captures/map.png" /> : (
            <>
              <Screen src="captures/spot-supertubos.png" />
              {/* 06:00 row outline, in screen px so it scales with the camera */}
              <div style={{ position: "absolute", left: 6, top: 645, width: 388, height: 74, borderRadius: 8, border: `2px solid ${C.acc}`,
                boxShadow: "0 0 10px rgba(17,183,242,.8), inset 0 0 10px rgba(17,183,242,.35)", opacity: win(t, 5.3, T.rest, 0.3, 0.4) }} />
            </>
          )}
        </Phone>
      </AbsoluteFill>
      {/* glow on the point while the phone is too small to read */}
      {[[T.dive, T.dive + 0.7, 760], [T.end - 0.4, T.end + 0.15, 520]].map(([a, b, y]) => (
        <div key={a} style={{ position: "absolute", left: 540 - 12, top: y - 12, width: 24, height: 24, borderRadius: "50%", background: "#fff",
          opacity: win(t, a, b, 0.1, 0.25), boxShadow: "0 0 40px 14px rgba(17,183,242,.85)" }} />
      ))}

      {/* iris through the pin */}
      <div style={{ position: "absolute", left: 540 - 1300, top: 760 - 1300, width: 2600, height: 2600, borderRadius: "50%", background: C.acc,
        transform: `scale(${iris})`, opacity: t > T.iris ? irisO : 0 }} />

      {/* rows beat */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.6) 28%, rgba(0,0,0,0) 40%)", opacity: win(t, 4.3, T.pull + 0.2, 0.3, 0.3) }} />
      <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w }}>
        <H1 size={128} style={{ opacity: win(t, 4.3, T.pull + 0.1, 0.1, 0.3), transform: `scale(${lerp(1.5, 1, outBack(seg(t, 4.3, 4.65)))})`, transformOrigin: "left center" }}>
          Every <span style={{ color: C.acc, textShadow: "0 0 40px rgba(17,183,242,.6)" }}>3 hours.</span>
        </H1>
      </div>

      {/* rest beat: the facts, then everything flies to the point */}
      {t > T.plates - 0.05 && t < T.end && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, opacity: 1 - outK, transformOrigin: `${540 - B.x}px ${520 - B.y - 10}px`, transform: `scale(${lerp(1, 0.02, outK)})` }}>
          <div style={{ position: "relative", display: "inline-block", ...plate(T.plates) }}>
            <div style={{ position: "absolute", inset: 0, background: C.acc, boxShadow: "0 0 60px rgba(17,183,242,.6)", transformOrigin: "left", transform: `scaleX(${outExpo(seg(t, T.plates, T.plates + 0.3))})` }} />
            <H1 size={120} style={{ position: "relative", padding: "6px 26px 14px", color: "#fff" }}>16 days.</H1>
          </div>
          <H1 size={110} style={{ marginTop: 26, ...plate(T.plates + 0.35) }}>3,500+ spots.</H1>
        </div>
      )}

      {/* end card: the point blooms into the logo */}
      {t > T.end - 0.1 && (
        <>
          {/* soft light bloom where the point opens */}
          <div style={{ position: "absolute", left: 540 - 500, top: 520 - 500, width: 1000, height: 1000, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(17,183,242,.55) 0%, rgba(17,183,242,.18) 35%, rgba(17,183,242,0) 70%)",
            transform: `scale(${lerp(0.05, 1, outExpo(seg(t, T.end, T.end + 0.6)))})`, opacity: lerp(1, 0.35, seg(t, T.end + 0.3, T.end + 1.4)) }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: seg(t, T.end, T.end + 0.15), transform: `scale(${lerp(0.1, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, marginTop: 30, opacity: seg(t, T.end + 0.12, T.end + 0.3),
              transform: `scale(${lerp(1.4, 1, outBack(seg(t, T.end + 0.12, T.end + 0.45)))})` }}>rosa<span style={{ color: C.acc }}>.</span></div>
            <H1 size={72} style={{ color: "#fff", marginTop: 30, opacity: seg(t, T.end + 0.3, T.end + 0.45), transform: `translateY(${lerp(30, 0, outExpo(seg(t, T.end + 0.3, T.end + 0.7)))}px)` }}>Your break, up close.</H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "24px 52px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 48, marginTop: 110,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`,
              opacity: seg(t, T.end + 0.5, T.end + 0.65), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.5, T.end + 0.85)))})` }}>rosa.surf <span>→</span></div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
