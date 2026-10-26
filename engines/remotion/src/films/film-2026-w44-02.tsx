import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Swell map, 12 s. Hook "The whole ocean, one screen." on Pixabay sunrise waves, the phone swings in
  on the swell map (captures-light/charts.png), pushes in on the UK and pans slowly down the Atlantic swell
  arrows to South Africa, then drops to the timeline: the play button pulses and Sun to Sat lights up
  left to right while the camera follows. End card: logo, rosa.surf/charts, Footage: Pixabay.
  Screen coordinates below are the capture (1170 wide) scaled to the 400 px screen.
*/

export const SECONDS = 12;
const T = { hook: 0, phone: 2.0, push: 2.7, pan: 3.3, panEnd: 5.5, tl: 5.6, play: 6.2, sweep: 6.8, sweepEnd: 8.4, end: 9.2, out: 12 };

// points on the capture in screen px
const UK = { x: 134, y: 260 };
const SA = { x: 212, y: 526 };
const PLAY = { x: 50, y: 738, r: 16 };
const LINE = { x0: 78, x1: 366, y: 728 };
const DAYS = [["Sun", 88], ["Mon", 129], ["Tue", 171], ["Wed", 211], ["Thu", 252], ["Fri", 293], ["Sat", 334]] as const;
const DAY_Y = 752;

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

  // ── camera inside the screen: full → UK → pan to South Africa → play → follow the week → full
  const a = inOut(seg(t, T.push, T.push + 0.6));
  const b = inOut(seg(t, T.pan, T.panEnd));
  const c = inOut(seg(t, T.tl, T.tl + 0.6));
  const d = inOut(seg(t, T.sweep, T.sweepEnd));
  const e = inOut(seg(t, T.end - 0.9, T.end - 0.4));
  const z = lerp(lerp(lerp(1, 2.4, a), 2.0, c), 1, e);
  const px = lerp(lerp(lerp(lerp(lerp(200, UK.x, a), SA.x, b), 120, c), 300, d), 200, e);
  const py = lerp(lerp(lerp(lerp(430, UK.y, a), SA.y, b), PLAY.y, c), 430, e);
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * px));
  const ty = Math.min(0, Math.max(860 - 866 * z, 430 - z * py));

  // ── overlays ───────────────────────────────────────────────────────────────
  const ukRing = win(t, T.push + 0.4, T.pan + 0.8, 0.3, 0.4);
  const saRing = win(t, T.panEnd - 0.3, T.tl + 0.3, 0.3, 0.3);
  const ringPulse = (from: number) => 1 + 0.12 * Math.sin(Math.max(0, t - from) * 8);
  const playOn = win(t, T.play, T.end - 0.4, 0.2, 0.3);
  const playPulse = 1 + 0.35 * Math.abs(Math.sin(Math.max(0, t - T.play) * 5));
  const k = Math.max(0, Math.min(1, (t - T.sweep) / (T.sweepEnd - T.sweep)));
  const head = lerp(LINE.x0, LINE.x1, k);
  const lineOn = win(t, T.sweep - 0.1, T.end - 0.4, 0.2, 0.3);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/310248_large.mp4" from={0} to={T.phone + 1.0} startFrom={0} dark={0.4} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.2, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.6} to={T.out} startFrom={5} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 110 }}>
        <Eyebrow style={rise(t, 0.1, T.phone - 0.1)}>Swell map · Atlantic</Eyebrow>
        <H1 size={130} style={{ marginTop: 26, ...rise(t, 0.25, T.phone - 0.1) }}>The whole</H1>
        <H1 size={130} style={rise(t, 0.4, T.phone - 0.1)}>ocean,</H1>
        <H1 size={130} style={{ color: C.acc, ...rise(t, 0.55, T.phone - 0.1) }}>one screen.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 866, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <Screen src="captures-light/charts.png" />
          {/* UK and South Africa pins */}
          {[{ p: UK, o: ukRing, from: T.push }, { p: SA, o: saRing, from: T.panEnd - 0.3 }].map(({ p, o, from }, i) => (
            <div key={i} style={{ position: "absolute", left: p.x - 14, top: p.y - 14, width: 28, height: 28, borderRadius: 99, border: "1.5px solid rgba(255,255,255,.95)", boxShadow: `0 0 12px ${C.acc}`, opacity: o, transform: `scale(${ringPulse(from)})` }} />
          ))}
          {/* play button pulse */}
          <div style={{ position: "absolute", left: PLAY.x - PLAY.r, top: PLAY.y - PLAY.r, width: PLAY.r * 2, height: PLAY.r * 2, borderRadius: 99, border: `1.5px solid ${C.acc}`, boxShadow: `0 0 10px ${C.acc}`, opacity: playOn * (1.6 - playPulse), transform: `scale(${playPulse})` }} />
          {/* Sun → Sat highlight */}
          <div style={{ position: "absolute", left: LINE.x0, top: LINE.y - 1.5, width: head - LINE.x0, height: 3, borderRadius: 2, background: C.acc, boxShadow: `0 0 8px ${C.acc}`, opacity: lineOn }} />
          <div style={{ position: "absolute", left: head - 4, top: LINE.y - 4, width: 8, height: 8, borderRadius: 99, background: "#fff", boxShadow: `0 0 10px ${C.acc}`, opacity: lineOn }} />
          {DAYS.map(([name, x]) => {
            const lit = win(t, lerp(T.sweep, T.sweepEnd, (x - LINE.x0) / (LINE.x1 - LINE.x0)), T.end - 0.4, 0.15, 0.3);
            return <div key={name} style={{ position: "absolute", left: x - 17, top: DAY_Y - 8, width: 34, height: 16, borderRadius: 6, background: "rgba(17,183,242,.28)", boxShadow: `0 0 0 1px ${C.acc} inset`, opacity: lit }} />;
          })}
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.push + 0.3, T.tl)}>Swell map</Eyebrow>
          <H1 size={64} style={{ marginTop: 22, ...rise(t, T.push + 0.4, T.tl, 30) }}>UK</H1>
          <H1 size={64} style={{ color: C.acc, ...rise(t, T.pan + 0.6, T.tl, 30) }}>↓</H1>
          <H1 size={64} style={rise(t, T.panEnd - 0.4, T.tl, 30)}>South Africa</H1>
          <Sub size={30} style={{ marginTop: 22, ...rise(t, T.pan + 0.2, T.tl, 30) }}>Every swell arrow, one slow swipe.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.tl + 0.3, T.end - 0.3)}>Press play</Eyebrow>
          <H1 size={72} style={{ marginTop: 22, ...rise(t, T.play, T.end - 0.3, 30) }}>Sun <span style={{ color: C.acc }}>→</span> Sat</H1>
          <Sub size={30} style={{ marginTop: 22, ...rise(t, T.sweep, T.end - 0.3, 30) }}>Watch the week roll across the map.</Sub>
        </div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>The swell map. Free, worldwide.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf/charts <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
