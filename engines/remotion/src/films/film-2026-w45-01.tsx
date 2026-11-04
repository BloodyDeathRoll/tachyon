import React from "react";
import { AbsoluteFill, Easing, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Phone drops in, 15 s. Motion language: diagrammatic shape type (a target grid drawing itself, leader lines,
  colour plates that wipe in under kinetic words, a shape burst, bar wipes). Hook "The surf forecast that's just
  free." punches on word by word over Pixabay wave footage (310248). The phone slams in from above at full size onto
  the target and bounces to rest dead centre on home.png; the frame shakes, shapes burst. Three plates wipe in on
  the beat, each tied to the phone by a leader line: "Free.", "3,500+ spots.", "16 days." The phone spins a half
  turn to the Uluwatu forecast and stays centre at full size; two more wired plates: "Epic.", "4 updates a day."
  The phone drops out of frame, straight bars wipe to the end card: logo, white "Your spots. Free.", space,
  glowing blue "rosa.surf →". The wave clip runs the whole film. Never show the sign-in screen (spots.png).
  Light theme: captures-light only. 3,500+ is the operator's number (product.md still says 3,056).
*/

export const SECONDS = 15;
const T = { hook: 0, slam: 2.0, w1: 3.0, w2: 3.8, w3: 4.6, spin: 6.6, w4: 7.8, w5: 8.7, end: 11.6, out: 15 };

// phone rect at rest (Phone default centre 540, 760; 420 × 880)
const PH = { l: 330, r: 750, t: 320, b: 1200 };
const DROP = 0.8, HIT = 1 / 2.75;           // Easing.bounce first touches down at 1/2.75 of its run
const bounce = Easing.bounce;

/** a colour plate that wipes in from `from`, the word punches in on it, then it wipes out the other way */
const Plate: React.FC<{ t: number; a: number; b: number; text: string; bg: string; fg: string; size: number; from: "left" | "right"; style: React.CSSProperties }> =
  ({ t, a, b, text, bg, fg, size, from, style }) => {
    if (t < a - 0.05 || t > b + 0.05) return null;
    const wipe = outExpo(seg(t, a, a + 0.28)), out = inOut(seg(t, b - 0.3, b));
    const punch = outBack(seg(t, a + 0.08, a + 0.4));
    const origin = from === "left" ? "left" : "right", away = from === "left" ? "right" : "left";
    return (
      <div style={{ position: "absolute", ...style }}>
        <div style={{ position: "absolute", inset: 0, background: bg, transformOrigin: out > 0 ? away : origin, transform: `scaleX(${out > 0 ? 1 - out : wipe})`,
          boxShadow: bg === C.acc ? "0 0 60px rgba(17,183,242,.55)" : "0 20px 60px rgba(0,0,0,.4)" }} />
        <H1 size={size} style={{ position: "relative", padding: "14px 30px 18px", color: fg, whiteSpace: "nowrap",
          opacity: seg(t, a + 0.08, a + 0.2) * (1 - seg(t, b - 0.35, b - 0.15)), transform: `scale(${lerp(1.5, 1, punch)})`, transformOrigin: origin }}>{text}</H1>
      </div>
    );
  };

/** an elbow leader line that draws from a node on the phone out to its plate */
const Leader: React.FC<{ t: number; a: number; b: number; pts: [number, number][] }> = ({ t, a, b, pts }) => {
  const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  const draw = outExpo(seg(t, a - 0.15, a + 0.2)), o = win(t, a - 0.15, b, 0.1, 0.25);
  const [nx, ny] = pts[0];
  return (
    <g opacity={o}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={4} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      <circle cx={nx} cy={ny} r={14 * outBack(seg(t, a - 0.2, a))} fill={C.acc} stroke="#fff" strokeWidth={4} />
    </g>
  );
};

// impact burst: seeded circles, squares and triangles flung from the landing
const BITS = Array.from({ length: 28 }, (_, i) => ({
  a: Math.PI * (1.05 + 0.9 * random(`ba${i}`)), d: 260 + 420 * random(`bd${i}`),
  s: 14 + 26 * random(`bz${i}`), k: Math.floor(random(`bk${i}`) * 3), c: [C.acc, "#fff", C.good][Math.floor(random(`bc${i}`) * 3)], spin: (random(`br${i}`) - 0.5) * 720,
  side: random(`bx${i}`) < 0.5 ? -1 : 1,
}));
const Burst: React.FC<{ t: number }> = ({ t }) => {
  const k = seg(t, T.slam, T.slam + 0.9);
  if (k <= 0 || k >= 1) return null;
  const e = outExpo(k);
  return (
    <>{BITS.map((p, i) => {
      // fling sideways and up from the phone's bottom corners
      const x = 540 + p.side * (200 + Math.abs(Math.cos(p.a)) * p.d * e), y = PH.b - 40 + Math.sin(p.a) * p.d * e + 900 * k * k;
      const st: React.CSSProperties = { position: "absolute", left: x - p.s / 2, top: y - p.s / 2, width: p.s, height: p.s, opacity: 1 - k, transform: `rotate(${p.spin * k}deg)` };
      return p.k === 0 ? <div key={i} style={{ ...st, borderRadius: "50%", background: p.c }} />
        : p.k === 1 ? <div key={i} style={{ ...st, background: p.c }} />
        : <div key={i} style={{ ...st, width: 0, height: 0, borderLeft: `${p.s / 2}px solid transparent`, borderRight: `${p.s / 2}px solid transparent`, borderBottom: `${p.s}px solid ${p.c}` }} />;
    })}</>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: slams in from above at full size, bounces to rest, spins a half turn, holds centre, drops out ──
  const dropK = seg(t, T.slam - HIT * DROP, T.slam + (1 - HIT) * DROP);
  const float = t > T.slam + 0.6 ? { ry: 5 * Math.sin(t * 0.8), rx: 3 * Math.sin(t * 0.6 + 1), y: 6 * Math.sin(t * 1.1) } : { ry: 0, rx: 0, y: 0 };
  const turn = 180 * inOut(seg(t, T.spin, T.spin + 0.7));
  const exit = inOut(seg(t, T.end - 0.7, T.end - 0.1));
  const pose = {
    x: 0,
    y: lerp(-1500, 0, bounce(dropK)) + float.y + 1700 * exit,
    s: 1,
    rx: lerp(28, 0, outExpo(dropK)) + float.rx,
    ry: (turn < 90 ? turn : turn - 180) + float.ry,
    rz: lerp(-14, 0, outExpo(dropK)),
    o: t < T.slam - HIT * DROP ? 0 : 1,
  };

  // impact shake, decaying
  const sh = t > T.slam ? Math.exp(-(t - T.slam) * 9) : 0;
  const shake = `translate(${22 * sh * Math.sin(t * 95)}px, ${16 * sh * Math.cos(t * 80)}px)`;

  // target diagram: hairline grid draws itself, crosshair rings on the landing point
  const grid = outExpo(seg(t, 0.1, 1.2)), gridO = win(t, 0, T.end - 0.5, 0.3, 0.4);
  const ring = (d: number) => outExpo(seg(t, T.slam + d, T.slam + d + 0.7));

  // hook words punch on, one per beat
  const word = (a: number): React.CSSProperties => {
    const k = outBack(seg(t, a, a + 0.3)), knock = inOut(seg(t, T.slam - 0.2, T.slam + 0.1));
    return { opacity: seg(t, a, a + 0.08) * (1 - knock), transform: `translateY(${-260 * knock}px) scale(${lerp(1.6, 1, k)})`, transformOrigin: "left center" };
  };
  const freeWipe = outExpo(seg(t, 1.25, 1.55));

  // end card: three bars wipe across, then the card
  const bar = (d: number) => lerp(1200, -1200, inOut(seg(t, T.end - 0.55 + d, T.end + 0.25 + d)));
  const endDim = seg(t, T.end - 0.1, T.end + 0.3);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: shake }}>
        {/* the wave fills the frame for the whole film */}
        <Footage src="footage/310248_large.mp4" from={0} to={T.out} startFrom={1} dark={0.42} zoom={0.14} fadeIn={0.15} fadeOut={0} />
        <AbsoluteFill style={{ background: "radial-gradient(700px 900px at 50% 40%, rgba(7,32,58,.55) 0%, rgba(0,0,0,.5) 100%)", opacity: win(t, T.slam - 0.1, T.end, 0.3, 0.5) }} />
        <AbsoluteFill style={{ background: C.page, opacity: 0.62 * endDim }} />

        {/* diagram layer: grid, landing target, leader lines */}
        <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, opacity: gridO }}>
          {[B.x, 330, 540, 750, B.x + B.w].map((x, i) => <line key={`v${i}`} x1={x} x2={x} y1={B.y} y2={B.y + B.h * grid} stroke="rgba(255,255,255,.22)" strokeWidth={2} />)}
          {[B.y, 540, 760, 980, B.y + B.h].map((y, i) => <line key={`h${i}`} y1={y} y2={y} x1={B.x} x2={B.x + B.w * grid} stroke="rgba(255,255,255,.22)" strokeWidth={2} />)}
          <circle cx={540} cy={760} r={90 * grid} fill="none" stroke={C.acc} strokeWidth={4} strokeDasharray="14 12" transform={`rotate(${t * 60} 540 760)`} opacity={1 - seg(t, T.slam - 0.2, T.slam)} />
          {[0, 0.12, 0.24].map((d) => <circle key={d} cx={540} cy={760} r={lerp(200, 620, ring(d))} fill="none" stroke={d === 0.12 ? C.acc : "#fff"} strokeWidth={6 * (1 - ring(d))} opacity={ring(d) > 0 && ring(d) < 1 ? 1 : 0} />)}
          <Leader t={t} a={T.w1} b={T.spin} pts={[[PH.l, 560], [200, 560], [200, 520]]} />
          <Leader t={t} a={T.w2} b={T.spin} pts={[[PH.r, 600], [880, 600], [880, 680]]} />
          <Leader t={t} a={T.w3} b={T.spin} pts={[[PH.l, 900], [200, 900], [200, 960]]} />
          {/* second round, wired to the forecast: the Epic badge, then the day strip */}
          <Leader t={t} a={T.w4} b={T.end - 0.6} pts={[[395, 587], [200, 587], [200, 520]]} />
          <Leader t={t} a={T.w5} b={T.end - 0.6} pts={[[PH.r - 40, 470], [880, 470], [880, 1000]]} />
        </svg>

        {/* hook */}
        <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w }}>
          <H1 size={140} style={word(0.15)}>The surf</H1>
          <H1 size={140} style={word(0.45)}>forecast</H1>
          <H1 size={140} style={word(0.75)}>that's just</H1>
          <div style={{ position: "relative", display: "inline-block", marginTop: 14, ...word(1.2) }}>
            <div style={{ position: "absolute", inset: 0, background: C.acc, transformOrigin: "left", transform: `scaleX(${freeWipe})`, boxShadow: "0 0 60px rgba(17,183,242,.6)" }} />
            <H1 size={140} style={{ position: "relative", padding: "6px 26px 14px", color: "#fff" }}>free.</H1>
          </div>
        </div>

        <Burst t={t} />

        <Phone pose={pose} glow={0.3}>
          {turn < 90 ? <Screen src="captures-light/home.png" /> : <Screen src="captures-light/spot-uluwatu.png" />}
        </Phone>

        {/* three plates on the beat, wired to the phone */}
        <Plate t={t} a={T.w1} b={T.spin + 0.1} text="Free." bg={C.acc} fg="#fff" size={130} from="left" style={{ left: B.x, top: 360 }} />
        <Plate t={t} a={T.w2} b={T.spin + 0.1} text="3,500+ spots." bg="#fff" fg={C.page} size={110} from="right" style={{ right: 1080 - B.x - B.w, top: 680 }} />
        <Plate t={t} a={T.w3} b={T.spin + 0.1} text="16 days." bg={C.acc} fg="#fff" size={130} from="left" style={{ left: B.x, top: 960 }} />
        <Plate t={t} a={T.w4} b={T.end - 0.6} text="Epic." bg={C.good} fg="#fff" size={130} from="left" style={{ left: B.x, top: 380 }} />
        <Plate t={t} a={T.w5} b={T.end - 0.6} text="4 updates a day." bg="#fff" fg={C.page} size={100} from="right" style={{ right: 1080 - B.x - B.w, top: 980 }} />
      </AbsoluteFill>

      {/* bar wipe into the end card: straight edges, no skewed corner */}
      {[["#fff", 0], [C.acc, 0.08], [C.page, 0.16]].map(([c, d]) => (
        <div key={c as string} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, background: c as string, transform: `translateX(${bar(d as number)}px)` }} />
      ))}

      {/* end card */}
      {t > T.end - 0.1 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: seg(t, T.end, T.end + 0.2), transform: `scale(${lerp(0.5, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
          <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, marginTop: 30, opacity: seg(t, T.end + 0.12, T.end + 0.3),
            transform: `scale(${lerp(1.4, 1, outBack(seg(t, T.end + 0.12, T.end + 0.45)))})` }}>rosa<span style={{ color: C.acc }}>.</span></div>
          <H1 size={72} style={{ color: "#fff", marginTop: 30, opacity: seg(t, T.end + 0.3, T.end + 0.45), transform: `translateY(${lerp(30, 0, outExpo(seg(t, T.end + 0.3, T.end + 0.7)))}px)` }}>Your spots. Free.</H1>
          <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "24px 52px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 48, marginTop: 110,
            boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`,
            opacity: seg(t, T.end + 0.5, T.end + 0.65), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.5, T.end + 0.85)))})` }}>rosa.surf <span>→</span></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default Film;
