import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Phone, SAFE, Screen, Variant, countUp, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";

/*
  When's it on? 15 s, all type. Motion language: bold kinetic typography (solid colour panels wipe
  over each other on the beat; giant words whip in from the sides and settle out of a skew; numbers
  count up; one small chart). Script: "WHEN'S / IT / ON?" (Rosa blue) → "16" counting up over 16
  rating bars, "DAYS AHEAD." (black) → "3,056 SPOTS", "55 countries" (light) → "4× A DAY." round a
  four-tick dial (accent) → "ONE LOOK." with size · period · wind over the phone on
  captures-light/spot-uluwatu-full.png, bottom nav pinned (black) → end card: logo, "FREE.", "No sign-up.", glowing
  "rosa.surf →" (Rosa blue). All numbers: clients/rosa/product.md. Light app theme: captures-light/ only.
*/

export const SECONDS = 15;
const T = { q: 0, days: 1.7, spots: 3.6, runs: 5.4, look: 7.1, end: 10.7, out: 15 };
const TILE = "#032afa", LIGHT = "#f4f3f3", INK = "#0d1225";
// 16 days of ratings for the bar row (bucket colours from brand)
const BARS = [C.epic, C.epic, C.good, C.good, C.fair, C.fair, C.good, C.epic, C.epic, C.good, C.fair, C.fair, C.good, C.good, C.fair, C.good];
const BAR_H = [0.9, 1, 0.75, 0.6, 0.4, 0.35, 0.65, 0.95, 0.85, 0.6, 0.45, 0.3, 0.55, 0.7, 0.4, 0.6];
// the full capture has the bottom nav baked into the page: cut that band out of the scrolling page and pin
// the nav pill (cropped from the same capture) to the screen bottom, where the app keeps it (as film-2026-w44-04)
const CAP = "captures-light/spot-uluwatu-full.png";
const CUT = [777, 864];
const NAV = { x: 17, y: 785, w: 366, h: 63 };

/** a word whipped in from the side at `a`: slides, then settles out of a skew */
const whip = (t: number, a: number, dir: 1 | -1): React.CSSProperties => {
  const k = outExpo(seg(t, a, a + 0.38));
  return { opacity: t >= a ? 1 : 0, transform: `translateX(${dir * 1100 * (1 - k)}px) skewX(${dir * -18 * (1 - k)}deg)` };
};
/** a word dropped in from above at `a`, overshooting */
const drop = (t: number, a: number): React.CSSProperties => {
  const k = outBack(seg(t, a, a + 0.4));
  return { opacity: seg(t, a, a + 0.06), transform: `translateY(${lerp(-160, 0, k)}px) scale(${lerp(1.25, 1, k)})` };
};

/** a solid panel that wipes over everything before it at `a` (from the bottom or the left) */
const Panel: React.FC<{ t: number; a: number; b: number; bg: string; side?: "up" | "left"; children: React.ReactNode }> = ({ t, a, b, bg, side = "up", children }) => {
  if (t < a || t >= b) return null;
  const r = 100 * (1 - outExpo(seg(t, a, a + 0.45)));
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden", clipPath: side === "up" ? `inset(${r}% 0 0 0)` : `inset(0 ${r}% 0 0)` }}>
      {children}
    </AbsoluteFill>
  );
};

const big = (size: number, color: string): React.CSSProperties =>
  ({ ...font, color, fontWeight: 900, fontSize: size, lineHeight: 0.86, letterSpacing: "-.05em", whiteSpace: "nowrap" });

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const mx = B.x + B.w / 2;
  const box: React.CSSProperties = { position: "absolute", left: B.x, top: B.y, width: B.w, height: B.h };
  const col: React.CSSProperties = { ...box, display: "flex", flexDirection: "column", justifyContent: "center" };

  // the phone in "ONE LOOK.": rises from below, swings flat, scrolls a little
  const L = T.look, rise = outExpo(seg(t, L + 0.35, L + 1.1));
  // big phone filling the right of the safe box, type stacked on its left
  const ps = 1.03, pcx = B.x + B.w - (420 * ps) / 2 - 12, pcy = B.y + B.h / 2;
  const pose ={ x: 0, y: lerp(900, 0, rise) + 6 * Math.sin(t * 1.5), s: ps, rx: lerp(35, 0, rise), ry: lerp(-25, 0, rise) + 5 * Math.sin(t * 1.1), rz: lerp(8, 0, rise), o: 1 };
  const scroll = 230 * inOut(seg(t, L + 1.9, L + 3.1));

  return (
    <AbsoluteFill style={{ background: TILE, overflow: "hidden" }}>
      {/* ── 1. WHEN'S / IT / ON? ── */}
      <Panel t={t} a={T.q} b={T.days + 0.5} bg={TILE}>
        <div style={{ ...col, alignItems: "flex-start", gap: 30 }}>
          <div style={{ ...big(220, "#fff"), ...whip(t, 0.05, -1) }}>WHEN'S</div>
          <div style={{ ...big(360, C.acc), alignSelf: "flex-end", ...whip(t, 0.4, 1) }}>IT</div>
          <div style={{ ...big(320, "#fff"), ...whip(t, 0.75, -1) }}>ON?</div>
          <div style={{ height: 34, borderRadius: 17, background: C.acc, width: `${100 * outExpo(seg(t, 1.05, 1.4))}%` }} />
        </div>
      </Panel>

      {/* ── 2. 16 DAYS AHEAD. ── */}
      <Panel t={t} a={T.days} b={T.spots + 0.5} bg="#000">
        <div style={{ ...col, alignItems: "center" }}>
          <div style={{ ...big(560, "#fff"), ...drop(t, T.days + 0.15) }}>{countUp(t, T.days + 0.15, T.days + 1.0, 16)}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 170, marginTop: 40 }}>
            {BARS.map((c, i) => {
              const k = outBack(seg(t, T.days + 0.3 + i * 0.045, T.days + 0.6 + i * 0.045));
              return <div key={i} style={{ width: 44, height: 170 * BAR_H[i] * k, borderRadius: 8, background: c }} />;
            })}
          </div>
          <div style={{ ...big(120, C.acc), marginTop: 50, ...whip(t, T.days + 0.9, 1) }}>DAYS AHEAD.</div>
        </div>
      </Panel>

      {/* ── 3. 3,056 SPOTS ── */}
      <Panel t={t} a={T.spots} b={T.runs + 0.5} bg={LIGHT} side="left">
        <div style={{ ...col, alignItems: "flex-start", gap: 34 }}>
          <div style={{ ...big(270, INK), ...whip(t, T.spots + 0.15, 1) }}>{countUp(t, T.spots + 0.15, T.spots + 1.1, 3056).toLocaleString("en-US")}</div>
          <div style={{ ...big(250, "transparent"), WebkitTextStroke: `8px ${TILE}`, ...whip(t, T.spots + 0.4, -1) }}>SPOTS</div>
          <div style={{ ...big(110, TILE), letterSpacing: "-.03em", ...whip(t, T.spots + 0.75, 1) }}>55 countries.</div>
        </div>
      </Panel>

      {/* ── 4. 4× A DAY. ── */}
      <Panel t={t} a={T.runs} b={T.look + 0.5} bg={C.acc}>
        <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0 }}>
          {[0, 1, 2, 3].map((i) => {
            const k = outExpo(seg(t, T.runs + 0.3 + i * 0.15, T.runs + 0.7 + i * 0.15));
            const r = 400, a0 = (-90 + i * 90 + 8) * Math.PI / 180, a1 = a0 + (74 * k) * Math.PI / 180, cy = B.y + B.h / 2;
            return <path key={i} d={`M ${mx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${mx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`}
              fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="round" opacity={k > 0 ? 1 : 0}
              transform={`rotate(${30 * (t - T.runs)} ${mx} ${cy})`} />;
          })}
        </svg>
        <div style={{ ...col, alignItems: "center" }}>
          <div style={{ ...big(440, "#fff"), ...drop(t, T.runs + 0.2) }}>4×</div>
          <div style={{ ...big(150, TILE), marginTop: 30, ...whip(t, T.runs + 0.65, -1) }}>A DAY.</div>
        </div>
      </Panel>

      {/* ── 5. ONE LOOK. ── */}
      <Panel t={t} a={T.look} b={T.end + 0.5} bg="#000" side="left">
        <div style={{ ...col, width: pcx - (420 * ps) / 2 - B.x - 30, gap: 22 }}>
          <div style={{ ...big(150, "#fff"), ...whip(t, L + 0.15, 1) }}>ONE</div>
          <div style={{ ...big(150, "#fff"), marginBottom: 30, ...whip(t, L + 0.3, -1) }}>LOOK.</div>
          {["size", "period", "wind"].map((w, i) => (
            <div key={w} style={{ ...big(80, i === 2 ? C.acc : C.good), letterSpacing: "-.02em", ...drop(t, L + 1.3 + i * 0.3) }}>{w}</div>
          ))}
        </div>
        <Phone pose={pose} glow={0.4} cx={pcx} cy={pcy}>
          <div style={{ position: "absolute", inset: 0, background: "#fafafa" }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: 400, transform: `translateY(${44 - scroll}px)` }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: CUT[0], overflow: "hidden" }}><Screen src={CAP} /></div>
            <div style={{ position: "absolute", left: 0, top: CUT[0], width: 400, height: 1593 - CUT[1], overflow: "hidden" }}><Screen src={CAP} scroll={CUT[1]} /></div>
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 44, background: "#fafafa" }} />
          {/* outside the scroll layer: the app's nav stays put while the page scrolls */}
          <div style={{ position: "absolute", left: NAV.x, top: NAV.y, width: NAV.w, height: NAV.h, borderRadius: NAV.h / 2, overflow: "hidden", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
            <Screen src={CAP} x={-NAV.x} scroll={NAV.y} />
          </div>
        </Phone>
      </Panel>

      {/* ── 6. end card ── */}
      <Panel t={t} a={T.end} b={T.out + 1} bg={TILE}>
        <div style={{ ...col, alignItems: "center", textAlign: "center" }}>
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 150, height: 150, opacity: seg(t, T.end + 0.2, T.end + 0.3),
            transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end + 0.2, T.end + 0.65)))}) rotate(${lerp(-90, 0, outExpo(seg(t, T.end + 0.2, T.end + 0.8)))}deg)` }} />
          <div style={{ display: "flex", marginTop: 50 }}>
            {"FREE.".split("").map((ch, i) => <div key={i} style={{ ...big(280, "#fff"), ...drop(t, T.end + 0.45 + i * 0.08) }}>{ch}</div>)}
          </div>
          <div style={{ ...big(96, C.acc), letterSpacing: "-.03em", marginTop: 40, ...whip(t, T.end + 1.1, -1) }}>No sign-up.</div>
          <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "26px 54px", borderRadius: 999, background: "#fff", color: TILE, fontWeight: 800, fontSize: 58, marginTop: 90,
            boxShadow: `0 0 ${40 + 16 * Math.sin(t * 3)}px rgba(17,183,242,.9), 0 0 100px rgba(17,183,242,.5)`,
            opacity: seg(t, T.end + 1.6, T.end + 1.75), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 1.6, T.end + 2.0)))})` }}>rosa.surf <span>→</span></div>
        </div>
      </Panel>
    </AbsoluteFill>
  );
};

export default Film;
