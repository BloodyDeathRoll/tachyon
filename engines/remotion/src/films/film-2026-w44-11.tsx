import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Swell filling in, 13 s. Hook "New swell filling in." over Pixabay sunrise footage (310248). The phone
  rises on the Supertubos spot page (captures/spot-supertubos.png) and pushes in on "New swell filling in"
  under Today. Then it pulls back to the day strip: the bars climb from Mon into Tue and Wed and stay
  dark green. Card: "Get the alert. Clear the morning." End card: logo, rosa.surf →, link in bio, Footage: Pixabay.
  No numbers on screen outside the capture. Screen coordinates are the capture (1170×2532) scaled to 400 px.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.0, push: 2.9, strip: 5.2, card: 8.4, end: 10.4, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const LINE = r(66, 1225, 380, 60);                     // "New swell filling in" under Today · Oct 25
const BARS = [222, 390, 558].map((x) => r(x, 420, 135, 116));   // Mon, Tue, Wed bar groups
const BAND = r(40, 420, 1130, 116);                    // the whole bar band
const GROUP = r(212, 180, 500, 420);                   // Mon..Wed columns, labels to ranges

type Box = { x: number; y: number; w: number; h: number };
const Ring: React.FC<{ b: Box; color: string; o: number; s?: number; radius?: number }> = ({ b, color, o, s = 1, radius = 12 }) => (
  <div style={{ position: "absolute", left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, borderRadius: radius, border: `2px solid ${color}`,
    boxShadow: `0 0 14px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

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

  // ── in-screen camera: push in on the line, then cut over to the strip ──
  const pushK = inOut(seg(t, T.push, T.push + 0.9));
  const toStrip = inOut(seg(t, T.strip - 0.4, T.strip + 0.4));
  const lineC = { x: LINE.x + LINE.w / 2, y: LINE.y + LINE.h / 2 };
  const stripC = { x: GROUP.x + GROUP.w / 2, y: GROUP.y + GROUP.h / 2 };
  const zoom = lerp(lerp(1, 1.9, pushK), 1.7, toStrip);
  const fx = lerp(lineC.x, stripC.x, toStrip), fy = lerp(lineC.y, stripC.y, toStrip);
  // focus point to the middle of the screen (400 × 860), never past the capture's edges
  const tx = Math.min(0, Math.max(400 - 400 * zoom, 200 - fx * zoom)), ty = Math.min(0, 430 - fy * zoom);
  const camK = Math.max(pushK, toStrip);
  const cam = `translate(${lerp(0, tx, camK)}px, ${lerp(0, ty, camK)}px) scale(${lerp(1, zoom, camK)})`;

  // bars: the band dims, then Mon, Tue, Wed climb out of it, bottom up
  const barsOn = t > T.strip - 0.2;
  const climb = (i: number) => outBack(seg(t, T.strip + 0.5 + i * 0.45, T.strip + 1.0 + i * 0.45));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* sunrise under the hook, dark panel for the phone, sunrise again for card and end */}
      <Footage src="footage/310248_large.mp4" from={0} to={T.push + 0.6} dark={0.45} zoom={0.12} fadeIn={0.3} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.push - 0.2, T.card + 0.2, 0.8, 0.6) }} />
      <Footage src="footage/310248_large.mp4" from={T.card - 0.4} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.8} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Supertubos · today</Eyebrow>
        <H1 size={170} style={{ marginTop: 24, ...rise(t, 0.15, T.phone - 0.15, 60) }}>New swell</H1>
        <H1 size={170} style={{ color: C.acc, ...rise(t, 0.45, T.phone - 0.15, 60) }}>filling in.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 1200, transformOrigin: "0 0", transform: cam }}>
          <Screen src="captures/spot-supertubos.png" />
          <Ring b={LINE} color={C.acc} o={win(t, T.push + 0.6, T.strip - 0.4, 0.25, 0.3)} s={lerp(1.15, 1, outBack(seg(t, T.push + 0.6, T.push + 1.0)))} radius={8} />
          {barsOn && <>
            <div style={{ position: "absolute", left: BAND.x, top: BAND.y, width: BAND.w, height: BAND.h, background: "rgba(0,0,0,.72)", opacity: seg(t, T.strip - 0.2, T.strip + 0.2) }} />
            {BARS.map((b, i) => (
              <div key={i} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, overflow: "hidden", clipPath: `inset(${(1 - Math.min(1, climb(i))) * 100}% 0 0 0)` }}>
                <Screen src="captures/spot-supertubos.png" x={-b.x} scroll={b.y} />
              </div>
            ))}
            <Ring b={GROUP} color={C.good} o={win(t, T.strip + 1.9, T.card - 0.5, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.strip + 1.9, T.strip + 2.3)))} radius={10} />
          </>}
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.push + 0.4, T.strip - 0.1)}><Eyebrow>Today</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Something's coming.</H1><Sub size={28} style={{ marginTop: 10 }}>Right under the day.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.strip + 0.4, T.card - 0.3) }}><Eyebrow>Mon · Tue · Wed</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Bars climb.</H1>
          <H1 size={64} style={{ color: C.good, ...rise(t, T.strip + 1.9, T.card - 0.3, 30) }}>Stays green.</H1>
          <Sub size={28} style={{ marginTop: 10, ...rise(t, T.strip + 2.1, T.card - 0.3, 30) }}>Size, period and wind, day by day.</Sub></div>
      </div>

      {/* card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 220, width: B.w }}>
        <Eyebrow style={rise(t, T.card, T.end - 0.1)}>Swell alerts</Eyebrow>
        <H1 size={110} style={{ marginTop: 24, ...rise(t, T.card + 0.1, T.end - 0.1, 60) }}>Get the alert.</H1>
        <H1 size={110} style={{ color: C.acc, ...rise(t, T.card + 0.5, T.end - 0.1, 60) }}>Clear the morning.</H1>
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
