import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Wind can only polish, 18 s. Motion language: an animated chart UI (a live line chart drawing with a
  glowing tip, bucket gridlines sweeping in, a ticker pill that flips with the line, bars filling
  under it, a whip-zoom in, a glow pulse on the peak). Script: hook over the blown-up Supertubos
  wind bar, "Perfect wind." + "Still Flat." → whip into the chart: Size fills, the line climbs to
  Fair; Period, Good; Wind, Epic (pulse) → Size and Period drain, the wind bar stays full and the
  line drops back to Flat → "Wind can only polish." → the phone over a glassy wave, "Every spot
  shows the bars." → end card: logo, "Size. Period. Wind.", glowing "rosa.surf →". No numbers.
*/

export const SECONDS = 18;
const T = { hook: 0, whip: 2.3, chart: 2.6, size: 3.0, period: 4.2, wind: 5.4, epic: 6.2, drain: 7.2, flat: 8.0, line: 8.6, polish: 8.5, pull: 10.4, pulled: 11.2, exit: 13.3, end: 13.8, out: 18 };

const BUCKETS = [
  { name: "Flat", col: "#5b6170" },
  { name: "Poor", col: C.bad },
  { name: "Fair", col: C.fair },
  { name: "Good", col: C.good },
  { name: "Epic", col: C.epic },
];
// the score in bucket units (0 Flat … 4 Epic): climbs with size, period, wind; falls when the swell drains
const SCORE: [number, number][] = [[T.chart, 0.2], [T.size, 0.2], [T.size + 0.8, 2.3], [T.period, 2.3], [T.period + 0.8, 3.3], [T.wind, 3.3], [T.wind + 0.8, 4.35], [T.drain, 4.35], [T.flat, 0.35], [T.line, 0.35]];
const score = (x: number) => interpolate(x, SCORE.map((k) => k[0]), SCORE.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut });
const bar = (t: number, at: number, to: number, drains: boolean) => to * outExpo(seg(t, at, at + 0.8)) * (drains ? 1 - inOut(seg(t, T.drain, T.flat)) : 1);

// the capture: 1170 wide; the Wind bar sits around (815, 889)
const CAP = { cx: 815, cy: 889 };

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const my = B.y + B.h / 2;

  // ── hook: the capture blown up on the wind bar, slow push, whip-zoom out ──
  const whip = inOut(seg(t, T.whip, T.chart));
  const k = lerp(2.4 + 0.2 * seg(t, 0, T.whip), 5, whip);
  const capO = 1 - seg(t, T.chart - 0.1, T.chart + 0.2);

  // ── chart geometry ──
  const LBL = 170, CW = B.w - LBL - 20, CY = B.y + 200, CH = 380;
  const yOf = (s: number) => CY + CH - (s / 4.4) * CH;
  const xOf = (x: number) => B.x + ((x - T.chart) / (T.line - T.chart)) * CW;
  const now = Math.min(t, T.line);
  const pts: [number, number][] = [];
  for (let x = T.chart; x <= now; x += 1 / 30) pts.push([xOf(x), yOf(score(x) + 0.05 * Math.sin(x * 11) * Math.sin(x * 3.7))]);
  const tip = pts[pts.length - 1];
  const s = score(now);
  const bk = BUCKETS[Math.min(4, Math.max(0, Math.floor(s + 0.05)))];
  const flipAt = [T.size + 0.3, T.size + 0.55, T.period + 0.5, T.wind + 0.5, T.drain + 0.3, T.drain + 0.55, T.flat - 0.15].filter((f) => f <= t).pop() ?? T.chart;
  const flip = seg(t, flipAt, flipAt + 0.25);
  const pulse = Math.sin(Math.PI * seg(t, T.epic, T.epic + 0.7));
  const dim = 1 - 0.8 * inOut(seg(t, T.polish, T.polish + 0.4));
  const pull = inOut(seg(t, T.pull, T.pulled));
  const chartO = (t >= T.chart ? 1 : 0) * (1 - seg(t, T.pull + 0.2, T.pull + 0.5));

  const ROWS = [
    { w: "Size", len: bar(t, T.size, 0.82, true), col: C.acc },
    { w: "Period", len: bar(t, T.period, 0.7, true), col: C.acc },
    { w: "Wind", len: bar(t, T.wind, 0.92, false), col: C.good },
  ];
  const RY = CY + CH + 70, TRACK = B.w - 330;

  // ── phone ──
  const settle = seg(t, T.pulled, T.pulled + 0.6);
  const out = inOut(seg(t, T.exit, T.end));
  const pose = {
    x: 0, y: 90 + 8 * Math.sin((t - T.pulled) * 1.4) * settle, s: lerp(2.6, 0.8, pull) * lerp(1, 2.2, out),
    rx: lerp(0, 10, pull) + 4 * Math.sin((t - T.pulled) * 1.1) * settle, ry: lerp(0, -18, pull) + 10 * Math.sin((t - T.pulled) * 0.9) * settle, rz: lerp(0, -3, pull),
    o: seg(t, T.pull + 0.1, T.pull + 0.4) * (1 - out),
  };

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* ── the screen, blown up on the wind bar ── */}
      {capO > 0 && (
        <div style={{ position: "absolute", left: 540 - CAP.cx * k, top: my + 120 - CAP.cy * k, width: 1170 * k, opacity: capO, filter: `blur(${14 * whip}px)` }}>
          <Img src={staticFile("captures/spot-supertubos.png")} style={{ width: "100%", display: "block" }} />
        </div>
      )}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.2) 75%, rgba(0,0,0,.6) 100%)", opacity: capO }} />

      {/* ── hook ── */}
      {t < T.whip + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w, textAlign: "center", opacity: 1 - seg(t, T.whip, T.whip + 0.25) }}>
          <H1 size={150} style={{ color: "#fff", textShadow: "0 10px 60px rgba(0,0,0,.8)", opacity: seg(t, 0.05, 0.15), transform: `translateY(${lerp(80, 0, outExpo(seg(t, 0.05, 0.5)))}px)` }}>Perfect wind.</H1>
          <div style={{ ...font, display: "inline-block", marginTop: 34, padding: "12px 50px", borderRadius: 999, background: BUCKETS[0].col, color: "#fff", fontWeight: 800, fontSize: 120, letterSpacing: "-.035em", lineHeight: 1.1,
            boxShadow: "0 0 60px rgba(0,0,0,.8)", opacity: seg(t, 0.8, 0.9), transform: `scale(${lerp(0.3, 1, outBack(seg(t, 0.8, 1.2)))}) rotate(-3deg)` }}>Still Flat.</div>
        </div>
      )}

      {/* ── the live chart ── */}
      {chartO > 0 && (
        <AbsoluteFill style={{ opacity: chartO, transform: `scale(${lerp(1, 0.3, pull)})`, transformOrigin: `540px ${my}px` }}>
          <AbsoluteFill style={{ background: `radial-gradient(900px 900px at 50% ${CY + CH / 2}px, ${bk.col}${Math.round(40 + 90 * pulse).toString(16).padStart(2, "0")} 0%, rgba(0,0,0,0) 70%)` }} />
          <AbsoluteFill style={{ opacity: dim }}>
            {/* rating pill: flips with the line */}
            <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w, display: "flex", justifyContent: "center" }}>
              <div style={{ ...font, padding: "12px 64px", borderRadius: 999, background: bk.col, color: "#fff", fontWeight: 800, fontSize: 104, letterSpacing: "-.035em", lineHeight: 1.1,
                boxShadow: `0 0 ${40 + 80 * pulse}px ${bk.col}`, transform: `translateY(${lerp(-30, 0, outExpo(flip))}px) scale(${lerp(0.8, 1, outBack(flip)) * (1 + 0.12 * pulse)})` }}>{bk.name}</div>
            </div>

            {/* bucket gridlines sweep in, names on the right */}
            {BUCKETS.map((b, i) => {
              const d = seg(t, T.chart + 0.06 * i, T.chart + 0.06 * i + 0.4);
              const y = yOf(i);
              const on = bk === b;
              return (
                <React.Fragment key={b.name}>
                  <div style={{ position: "absolute", left: B.x, top: y, width: CW * outExpo(d), height: 2, background: `rgba(255,255,255,${on ? 0.35 : 0.12})` }} />
                  <div style={{ ...font, position: "absolute", left: B.x + B.w - LBL + 10, top: y - 26, width: LBL - 10, fontSize: 44, fontWeight: 800, color: on ? b.col : "rgba(255,255,255,.4)", opacity: d,
                    transform: `scale(${on ? 1.15 : 1})`, transformOrigin: "left center" }}>{b.name}</div>
                </React.Fragment>
              );
            })}

            {/* the line, its fill and the glowing tip */}
            {pts.length > 1 && (
              <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
                <defs>
                  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={bk.col} stopOpacity={0.45} />
                    <stop offset="1" stopColor={bk.col} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <polygon points={`${pts.map((p) => p.join(",")).join(" ")} ${tip[0]},${CY + CH} ${B.x},${CY + CH}`} fill="url(#fill)" />
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={bk.col} strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 14px ${bk.col})` }} />
                <circle cx={tip[0]} cy={tip[1]} r={22 + 6 * Math.sin(t * 8)} fill={bk.col} opacity={0.35} />
                <circle cx={tip[0]} cy={tip[1]} r={13} fill="#fff" />
              </svg>
            )}

            {/* the three bars */}
            {ROWS.map((r, i) => {
              const y = RY + i * 115;
              const a = T.chart + 0.2 + 0.1 * i;
              return (
                <React.Fragment key={r.w}>
                  <H1 size={76} style={{ position: "absolute", left: B.x, top: y, color: "#fff", opacity: seg(t, a, a + 0.15), transform: `translateX(${lerp(-80, 0, outExpo(seg(t, a, a + 0.5)))}px)` }}>{r.w}</H1>
                  <div style={{ position: "absolute", left: B.x + B.w - TRACK, top: y + 10, width: TRACK, height: 56, borderRadius: 56, background: "rgba(255,255,255,.1)", opacity: seg(t, a, a + 0.2) }} />
                  <div style={{ position: "absolute", left: B.x + B.w - TRACK, top: y + 10, width: TRACK * r.len, height: 56, borderRadius: 56, background: r.col, boxShadow: `0 0 36px ${r.col}` }} />
                </React.Fragment>
              );
            })}
          </AbsoluteFill>

          {/* the payoff */}
          {t > T.polish && (
            <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, textAlign: "center" }}>
              <H1 size={150} style={{ color: "#fff", textShadow: "0 10px 60px rgba(0,0,0,.9)", opacity: seg(t, T.polish, T.polish + 0.12), transform: `scale(${lerp(1.3, 1, outExpo(seg(t, T.polish, T.polish + 0.5)))})` }}>Wind can only polish.</H1>
              <H1 size={92} style={{ marginTop: 50, color: C.acc, opacity: seg(t, T.polish + 0.8, T.polish + 0.95), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.polish + 0.8, T.polish + 1.3)))}px)` }}>Size and period first.</H1>
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* ── pull back: the phone over a glassy wave ── */}
      <Footage src="footage/218670_large.mp4" from={T.pull} to={T.end + 0.2} startFrom={3} dark={0.4} zoom={0.1} fadeIn={0.5} fadeOut={0.3} />
      <Phone pose={pose} glow={0.4} cy={my}>
        <Screen src="captures/spot-supertubos.png" />
      </Phone>
      {t > T.pulled - 0.2 && t < T.exit + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w, textAlign: "center", opacity: win(t, T.pulled - 0.2, T.exit + 0.3, 0.3, 0.3) }}>
          <H1 size={100} style={{ color: "#fff", textShadow: "0 8px 50px rgba(0,0,0,.85)", transform: `translateY(${lerp(50, 0, outExpo(seg(t, T.pulled - 0.2, T.pulled + 0.3)))}px)` }}>Every spot shows the bars.</H1>
        </div>
      )}

      {/* ── end card ── */}
      <Footage src="footage/310248_large.mp4" from={T.end - 0.3} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.4} />
      {t > T.end - 0.05 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outExpo(seg(t, T.end, T.end + 0.5)))}) rotateY(${lerp(180, 0, inOut(seg(t, T.end, T.end + 0.6)))}deg)` }} />
            {["Size.", "Period.", "Wind."].map((w, i) => (
              <H1 key={w} size={110} style={{ marginTop: i === 0 ? 56 : 0, color: "#fff", opacity: seg(t, T.end + 0.3 + 0.2 * i, T.end + 0.45 + 0.2 * i), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.end + 0.3 + 0.2 * i, T.end + 0.8 + 0.2 * i)))}px)` }}>{w}</H1>
            ))}
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 60px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 60, marginTop: 100,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 1.05, T.end + 1.2), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 1.05, T.end + 1.4)))})` }}>rosa.surf →</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
