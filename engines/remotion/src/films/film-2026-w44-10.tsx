import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, countUp, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  3,056 spots search, 13 s. Hook "3,056 spots. Type one." in big Inter numerals over Pixabay footage
  (218670). The phone drops in on the search screen (captures-light/search.png): the "Search spots or regions"
  bar lights up with a blinking caret, then the recent list, Banzai Pipeline, Supertubos, Uluwatu, each
  rating dot rings. A tap on Supertubos cuts to its spot page (captures-light/spot-supertubos.png), the Epic
  badge and the week strip ring. End card: logo, rosa.surf →, link in bio, Footage: Pixabay.
  Only number on screen outside the captures: 3,056 spots (clients/rosa/product.md).
  Screen coordinates are the captures (1170×2532) scaled to the 400 px screen.
*/

export const SECONDS = 13;
const T = { hook: 0, phone: 2.1, bar: 2.8, rows: 3.9, tap: 5.5, spot: 5.9, end: 9.8, out: 13 };

const K = 400 / 1170;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const BAR = r(162, 28, 978, 114);        // the "Search spots or regions" field
const CARET = { x: 268 * K, y: 56 * K, h: 60 * K };
const ROWS = [317, 513, 708].map((y) => r(24, y, 1122, 140));   // Pipeline, Supertubos, Uluwatu
const DOTS = [386, 581, 776].map((y) => ({ x: 75 * K, y: y * K })); // their rating dots
const TAP = { x: 300 * K, y: 581 * K };
const BADGE = r(95, 718, 148, 67);       // the Epic badge on the spot page
const STRIP = r(38, 162, 1132, 433);     // the week strip

type Box = { x: number; y: number; w: number; h: number };
const Ring: React.FC<{ b: Box; color: string; o: number; s?: number; radius?: number }> = ({ b, color, o, s = 1, radius = 12 }) => (
  <div style={{ position: "absolute", left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, borderRadius: radius, border: `2px solid ${color}`,
    boxShadow: `0 0 14px ${color}`, opacity: o, transform: `scale(${s})` }} />
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: drops in from above, floats, punches on the cut, drops out for the end card ──
  const float = { ry: 9 * Math.sin(t * 0.5 + 0.4), rx: 3 * Math.sin(t * 0.37 + 1.1), rz: -1 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const drop = outBack(seg(t, T.phone - 0.35, T.phone + 0.45));
  const enter = outExpo(seg(t, T.phone - 0.35, T.phone + 0.45));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const punch = 0.06 * (1 - outExpo(seg(t, T.spot, T.spot + 0.5))) * (t >= T.spot ? 1 : 0);
  const tapPress = 0.02 * win(t, T.tap, T.tap + 0.25, 0.08, 0.15);
  const pose = {
    x: -205, y: lerp(-1300, -30, drop) + float.y + 900 * exit, s: lerp(0.9, 0.98, enter) + punch - tapPress,
    rx: float.rx + lerp(-30, 0, drop), ry: float.ry + lerp(-25, 0, enter), rz: float.rz + lerp(10, 0, drop),
    o: t < T.phone - 0.35 ? 0 : 1 - exit,
  };

  // ── screen beats ──
  const spotO = t >= T.spot ? 1 : 0;
  const caretOn = t > T.bar && t < T.tap && Math.floor((t - T.bar) * 2.5) % 2 === 0 ? 1 : 0;
  const rowPop = (i: number) => { const a = T.rows + i * 0.3; return { o: win(t, a, T.tap - 0.05, 0.2, 0.2), s: lerp(2, 1, outBack(seg(t, a, a + 0.4))) }; };
  const tapK = seg(t, T.tap, T.tap + 0.45);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* footage bed under the hook and the phone drop, then the dark panel, then footage again for the end card */}
      <Footage src="footage/218670_large.mp4" from={0} to={T.rows + 0.6} dark={0.5} zoom={0.12} fadeIn={0.3} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.rows - 0.2, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/218670_large.mp4" from={T.end - 0.6} to={T.out} startFrom={6} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook: the number, big */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w }}>
        <Eyebrow style={rise(t, 0.05, T.phone - 0.15)}>Rosa · spot search</Eyebrow>
        <H1 size={300} style={{ marginTop: 20, letterSpacing: "-.05em", ...rise(t, 0.1, T.phone - 0.15, 60) }}>{countUp(t, 0.1, 1.1, 3056).toLocaleString("en-US")}</H1>
        <H1 size={130} style={{ marginTop: 6, ...rise(t, 0.35, T.phone - 0.15) }}>spots.</H1>
        <H1 size={130} style={{ color: C.acc, ...rise(t, 0.9, T.phone - 0.15) }}>Type one.</H1>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - spotO }}>
          <Screen src="captures-light/search.png" />
          <Ring b={BAR} color={C.acc} o={win(t, T.bar, T.rows + 0.2, 0.25, 0.3)} s={lerp(1.08, 1, outBack(seg(t, T.bar, T.bar + 0.4)))} radius={14} />
          <div style={{ position: "absolute", left: CARET.x, top: CARET.y, width: 2, height: CARET.h, background: C.acc, opacity: caretOn }} />
          {DOTS.map((d, i) => { const k = rowPop(i); return (
            <div key={i} style={{ position: "absolute", left: d.x - 13, top: d.y - 13, width: 26, height: 26, borderRadius: 13, border: `2px solid ${C.good}`,
              boxShadow: `0 0 12px ${C.good}`, opacity: k.o, transform: `scale(${k.s})` }} />
          ); })}
          {/* the tapped row lights up */}
          <div style={{ position: "absolute", left: ROWS[1].x, top: ROWS[1].y, width: ROWS[1].w, height: ROWS[1].h, borderRadius: 12, background: "rgba(17,183,242,.14)",
            boxShadow: `0 0 0 1.5px ${C.acc} inset`, opacity: win(t, T.tap, T.spot + 0.05, 0.08, 0.1) }} />
          {/* finger tap: a dot and a ripple */}
          <div style={{ position: "absolute", left: TAP.x - 22, top: TAP.y - 22, width: 44, height: 44, borderRadius: 22, background: "rgba(245,240,232,.55)",
            opacity: win(t, T.tap - 0.25, T.spot, 0.15, 0.1), transform: `scale(${lerp(1.4, 1, outExpo(seg(t, T.tap - 0.25, T.tap)))})` }} />
          <div style={{ position: "absolute", left: TAP.x - 22, top: TAP.y - 22, width: 44, height: 44, borderRadius: 22, border: "2px solid rgba(245,240,232,.8)",
            opacity: t >= T.tap ? 1 - tapK : 0, transform: `scale(${lerp(1, 3, outExpo(tapK))})` }} />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: spotO }}>
          <Screen src="captures-light/spot-supertubos.png" />
          <Ring b={BADGE} color={C.good} o={win(t, T.spot + 0.4, T.end - 0.4, 0.2, 0.3)} s={lerp(1.5, 1, outBack(seg(t, T.spot + 0.4, T.spot + 0.8)))} radius={18} />
          <Ring b={STRIP} color={C.acc} o={win(t, T.spot + 1.7, T.end - 0.4, 0.25, 0.3)} s={lerp(1.1, 1, outBack(seg(t, T.spot + 1.7, T.spot + 2.1)))} radius={16} />
        </div>
      </Phone>

      {/* callouts on the right, one per beat */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.bar + 0.1, T.rows - 0.1)}><Eyebrow>Search</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Type a name.</H1><Sub size={28} style={{ marginTop: 10 }}>Any spot, any region.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.rows + 0.1, T.tap + 0.2) }}><Eyebrow>Recent</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Rated at a glance.</H1><Sub size={28} style={{ marginTop: 10 }}>A rating dot on every row.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.spot + 0.3, T.spot + 1.8) }}><Eyebrow>Supertubos</Eyebrow><H1 size={64} style={{ marginTop: 12, color: C.good }}>Epic.</H1><Sub size={28} style={{ marginTop: 10 }}>One tap to the spot.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.spot + 1.8, T.end - 0.1) }}><Eyebrow>Peniche</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>The week.</H1><Sub size={28} style={{ marginTop: 10 }}>Day by day, hour by hour.</Sub></div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>3,056 spots. Type one.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
