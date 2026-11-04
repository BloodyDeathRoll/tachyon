import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Epic is earned, 15 s. Motion language: a premium 3D badge unlock (a solid, extruded medallion that
  tilts toward a drifting cursor with damped physics, fast and smooth, never bouncy, then a gold particle
  celebration). Here: "Most days aren't Epic." over a locked steel medallion; Size, Period and Wind bars
  fill one by one and charge a ring around it while its score counts to 70 ("Wind only polishes.");
  at 70 it spins open to the green Epic face and bursts into gold and green particles: "Score 70+
  unlocks Epic." The phone rises on captures/spot-uluwatu.png and the medallion flies into the Epic
  pill: "Find it up to 16 days out." End card over a Pixabay wave: logo, "Free surf forecast.",
  glowing blue "rosa.surf →". 70+ = Epic, 16 days: clients/rosa/product.md.
*/

export const SECONDS = 15;
const T = { size: 2.4, period: 3.6, wind: 4.8, open: 6.0, burst: 6.35, app: 8.3, fly: 8.7, land: 9.4, end: 11.2, out: 15 };

const D = 300, DEPTH = 16; // medallion diameter and extrusion, px
const GOLD = "#f4c542";
// the Epic pill in the 400-wide capture (measured on spot-uluwatu.png), pushed 44 px under the notch
const NOTCH = 44;
const SLOT = { x: 58, y: 257 + NOTCH, w: 50 };
const PS = 0.72; // phone scale in the app beat

/** a particle: launched from the medallion, drag + gravity, flipping in 3D */
const PIECES = Array.from({ length: 110 }, (_, i) => {
  const a = random(`pa${i}`) * Math.PI * 2, v = 700 + 1400 * random(`pv${i}`);
  return {
    vx: Math.cos(a) * v, vy: Math.sin(a) * v - 400, r: 8 + 14 * random(`pr${i}`), star: i % 3 === 0,
    spin: 300 + 600 * random(`ps${i}`), color: [GOLD, GOLD, "#ffe08a", C.good, "#fff"][i % 5], delay: 0.06 * random(`pd${i}`),
  };
});

const Particles: React.FC<{ t: number; a: number; x: number; y: number }> = ({ t, a, x, y }) => {
  if (t < a || t > a + 2.4) return null;
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1600 }}>
      {PIECES.map((p, i) => {
        const s = Math.max(0, t - a - p.delay), k = 2.8;
        const d = (1 - Math.exp(-k * s)) / k;
        const px = x + p.vx * d, py = y + p.vy * d + 480 * s * s;
        return <div key={i} style={{ position: "absolute", left: px - p.r, top: py - p.r * 0.6, width: 2 * p.r, height: 1.2 * p.r,
          borderRadius: p.star ? "50%" : 3, background: p.color, opacity: s > 0 ? 1 - seg(s, 1.5, 2.3) : 0, boxShadow: `0 0 16px ${p.color}`,
          transform: `rotateX(${p.spin * s}deg) rotateZ(${p.spin * 0.5 * s + i * 41}deg)` }} />;
      })}
    </div>
  );
};

/** an outlined ring bursting from (x, y) at `a` */
const Ring: React.FC<{ t: number; a: number; x: number; y: number; r: number; color: string }> = ({ t, a, x, y, r, color }) => {
  const k = seg(t, a, a + 0.6);
  if (k <= 0 || k >= 1) return null;
  const R = r * outExpo(k);
  return <div style={{ position: "absolute", left: x - R, top: y - R, width: 2 * R, height: 2 * R, borderRadius: "50%", border: `${lerp(18, 2, k)}px solid ${color}`, opacity: 1 - k }} />;
};

/** one medallion face; the back one sits behind the extrusion, turned round */
const Face: React.FC<{ back?: boolean; shine: number; children: React.ReactNode; bg: string }> = ({ back, shine, children, bg }) => (
  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: bg, overflow: "hidden", backfaceVisibility: "hidden",
    boxShadow: `0 0 0 8px ${GOLD} inset, 0 0 0 12px rgba(0,0,0,.25) inset, 0 -10px 30px rgba(0,0,0,.35) inset`,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    transform: back ? `translateZ(${-DEPTH}px) rotateY(180deg)` : undefined }}>
    {children}
    <div style={{ position: "absolute", top: -60, bottom: -60, left: `${lerp(-50, 130, shine)}%`, width: 80, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent)", transform: "rotate(20deg)" }} />
  </div>
);

const Medallion: React.FC<{ x: number; y: number; s: number; rx: number; ry: number; score: number; glow: number; o: number }> = ({ x, y, s, rx, ry, score, glow, o }) => {
  const shine = (((ry % 360) + 360) % 360) / 360;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, perspective: 1600, perspectiveOrigin: `${x}px ${y}px`, opacity: o }}>
      <div style={{ position: "absolute", left: x - D / 2, top: y - D / 2, width: D, height: D, transformStyle: "preserve-3d",
        transform: `scale(${s}) rotateX(${rx}deg) rotateY(${ry}deg)`,
        filter: `drop-shadow(0 0 ${50 * glow}px rgba(244,197,66,.8)) drop-shadow(0 40px 50px rgba(0,0,0,.6))` }}>
        {Array.from({ length: DEPTH }, (_, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: i % 3 ? "#9a7a1c" : "#b8922a", transform: `translateZ(${-i - 0.5}px)` }} />
        ))}
        <Face back shine={shine} bg={`radial-gradient(circle at 35% 30%, #3fe08c 0%, ${C.good} 40%, ${C.epic} 100%)`}>
          <div style={{ ...font, color: "#fff", fontWeight: 800, fontSize: 92, letterSpacing: "-.03em", textShadow: "0 3px 8px rgba(0,0,0,.3)" }}>Epic</div>
        </Face>
        <Face shine={shine} bg="radial-gradient(circle at 35% 30%, #4a5262 0%, #262b35 50%, #12151b 100%)">
          <div style={{ ...font, color: "#fff", fontWeight: 800, fontSize: 120, letterSpacing: "-.04em", lineHeight: 1 }}>{score}</div>
          <div style={{ ...font, color: C.muted, fontWeight: 700, fontSize: 40, marginTop: 6 }}>score</div>
        </Face>
      </div>
    </div>
  );
};

/** three charge arcs round the medallion, one per bar */
const Charge: React.FC<{ x: number; y: number; fills: number[]; o: number }> = ({ x, y, fills, o }) => {
  const R = 196, L = 2 * Math.PI * R / 3 - 24; // each arc a third of the ring, minus a gap
  const colors = [C.good, C.good, C.acc];
  return (
    <svg width={2 * R + 40} height={2 * R + 40} style={{ position: "absolute", left: x - R - 20, top: y - R - 20, opacity: o, transform: "rotate(-90deg)" }}>
      {fills.map((f, i) => (
        <g key={i} transform={`rotate(${i * 120 + 3.5} ${R + 20} ${R + 20})`}>
          <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke="#1d222c" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${L} 9999`} />
          <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke={colors[i]} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${L * f} 9999`}
            style={{ filter: `drop-shadow(0 0 10px ${colors[i]})` }} opacity={f > 0.01 ? 1 : 0} />
        </g>
      ))}
    </svg>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const mx = B.x + B.w / 2, cy = B.y + 430;

  // ── the charge: Size, Period, Wind fill one by one; the score follows ──
  const fills = [T.size, T.period, T.wind].map((a) => inOut(seg(t, a + 0.15, a + 0.95)));
  const score = Math.round(70 * (fills[0] * 0.45 + fills[1] * 0.25 + fills[2] * 0.3));
  const charge = win(t, 0.3, T.burst + 0.3, 0.4, 0.3);

  // ── the medallion: tilts toward a drifting cursor 0.12 s late (damped, no overshoot), spins open at 70 ──
  const lag = t - 0.12;
  const cur = { x: Math.sin(lag * 1.7), y: Math.cos(lag * 1.2) };
  const intro = outExpo(seg(t, 0.2, 0.9));
  const spin = 540 * inOut(seg(t, T.open, T.open + 0.6));
  const fly = inOut(seg(t, T.fly, T.land));

  // ── the phone: rises for the app beat ──
  const up = outExpo(seg(t, T.app, T.app + 0.8));
  const out = inOut(seg(t, T.end - 0.4, T.end));
  const phoneCy = B.y + 600;
  const pose = { x: 0, y: lerp(900, 0, up) + 5 * Math.sin(t * 1.3), s: PS, rx: lerp(20, 0, up) + 2 * Math.sin(t * 1.1), ry: 3 * Math.sin(t * 0.9), rz: 0, o: seg(t, T.app, T.app + 0.2) * (1 - out) };
  const slotX = mx + pose.x + PS * (SLOT.x - 200), slotY = phoneCy + pose.y + PS * (SLOT.y - 430);

  const med = {
    x: lerp(mx, slotX, fly), y: lerp(cy + lerp(60, 0, intro), slotY, fly) - 90 * Math.sin(Math.PI * fly),
    s: lerp(lerp(0.4, 1, intro) * (1 + 0.06 * win(t, T.burst, T.burst + 0.5, 0.1, 0.4)), (SLOT.w * PS) / D * 1.4, fly),
    rx: -12 * cur.y * (1 - fly), ry: spin + 16 * cur.x * (1 - fly), score,
    glow: 0.15 + 0.85 * seg(t, T.open, T.burst) * (1 - fly), o: seg(t, 0.2, 0.4) * (1 - seg(t, T.land - 0.15, T.land)),
  };
  const landGlow = win(t, T.land - 0.1, T.end - 0.5, 0.1, 0.6);
  const flash = t > T.burst ? 0.4 * (1 - seg(t, T.burst, T.burst + 0.14)) : 0;

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 40%, #121a26 0%, #05070b 60%, #000 100%)" }} />
      {/* the room warms to gold as it charges, then blooms on the unlock */}
      <AbsoluteFill style={{ background: `radial-gradient(620px 620px at ${mx}px ${cy}px, rgba(244,197,66,${0.08 + 0.1 * fills[2]}) 0%, transparent 70%)`, opacity: 1 - seg(t, T.app, T.app + 0.4) }} />
      <AbsoluteFill style={{ background: `radial-gradient(760px 760px at ${mx}px ${cy}px, rgba(36,177,97,.4) 0%, rgba(244,197,66,.12) 45%, transparent 75%)`, opacity: win(t, T.burst, T.app + 0.3, 0.1, 0.5) }} />

      {/* ── hook ── */}
      {t < T.size + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center", opacity: 1 - seg(t, T.size - 0.1, T.size + 0.25) }}>
          <H1 size={104} style={{ color: "#fff", opacity: seg(t, 0.05, 0.25), transform: `translateY(${lerp(40, 0, outExpo(seg(t, 0.05, 0.55)))}px)` }}>Most days</H1>
          <H1 size={104} style={{ color: "#fff", opacity: seg(t, 0.4, 0.6), transform: `translateY(${lerp(40, 0, outExpo(seg(t, 0.4, 0.9)))}px)` }}>
            aren't <span style={{ color: C.good, textShadow: "0 0 30px rgba(36,177,97,.7)" }}>Epic.</span>
          </H1>
        </div>
      )}
      {t > T.size && t < T.open + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 40, width: B.w, textAlign: "center", opacity: win(t, T.size, T.open + 0.3, 0.4, 0.3) }}>
          <H1 size={96} style={{ color: "#fff", transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.size, T.size + 0.5)))}px)` }}>It has to earn it.</H1>
        </div>
      )}

      {/* ── the bars that charge it ── */}
      {t > T.size - 0.2 && t < T.open + 0.4 && (
        <div style={{ position: "absolute", left: B.x + 110, top: B.y + 650, width: B.w - 220, opacity: win(t, T.size - 0.2, T.open + 0.4, 0.3, 0.35) }}>
          {(["Size", "Period", "Wind"] as const).map((label, i) => {
            const a = [T.size, T.period, T.wind][i];
            const on = outExpo(seg(t, a - 0.1, a + 0.4));
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 36, height: 70, opacity: lerp(0.35, 1, on) }}>
                <div style={{ ...font, width: 220, fontSize: 56, fontWeight: 800, color: "#fff", letterSpacing: "-.02em" }}>{label}</div>
                <div style={{ flex: 1, height: 20, borderRadius: 10, background: "#1d222c", overflow: "hidden" }}>
                  <div style={{ width: `${100 * fills[i]}%`, height: "100%", borderRadius: 10, background: i === 2 ? C.acc : C.good, boxShadow: `0 0 18px ${i === 2 ? C.acc : C.good}` }} />
                </div>
              </div>
            );
          })}
          <div style={{ ...font, textAlign: "center", fontSize: 46, fontWeight: 700, color: C.acc, marginTop: 18, opacity: seg(t, T.wind + 0.3, T.wind + 0.6) }}>Wind only polishes.</div>
        </div>
      )}

      {/* ── the unlock ── */}
      <Charge x={mx} y={cy} fills={fills} o={charge * (1 - seg(t, T.burst, T.burst + 0.3))} />
      <Ring t={t} a={T.burst} x={mx} y={cy} r={560} color={GOLD} />
      <Ring t={t} a={T.burst + 0.12} x={mx} y={cy} r={720} color={C.good} />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <Particles t={t} a={T.burst} x={mx} y={cy} />
      {t > T.burst + 0.15 && t < T.app + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 700, width: B.w, textAlign: "center", opacity: win(t, T.burst + 0.15, T.app + 0.3, 0.4, 0.3) }}>
          <H1 size={112} style={{ color: "#fff", transform: `translateY(${lerp(50, 0, outExpo(seg(t, T.burst + 0.15, T.burst + 0.7)))}px)` }}>Score 70+</H1>
          <H1 size={84} style={{ color: C.good, marginTop: 14, transform: `translateY(${lerp(50, 0, outExpo(seg(t, T.burst + 0.35, T.burst + 0.9)))}px)` }}>unlocks Epic.</H1>
        </div>
      )}

      {/* ── the app: the medallion lands in the Epic pill ── */}
      {t > T.app - 0.05 && t < T.end + 0.05 && (
        <>
          <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center", opacity: win(t, T.app + 0.3, T.end, 0.4, 0.4) }}>
            <H1 size={84} style={{ color: "#fff", transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.app + 0.3, T.app + 0.8)))}px)` }}>Find it up to</H1>
            <H1 size={84} style={{ color: "#fff", transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.app + 0.45, T.app + 0.95)))}px)` }}>
              <span style={{ color: C.acc }}>16 days</span> out.
            </H1>
          </div>
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(${B.y}px ${1080 - B.x - B.w}px ${1920 - B.y - B.h}px ${B.x}px round 56px)` }}>
            <Phone pose={pose} glow={0.2 + 0.35 * landGlow} cy={phoneCy}>
              <Screen src="captures/spot-uluwatu.png" scroll={-NOTCH} />
              <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: NOTCH, background: "#000" }} />
              {/* the pill is empty until the medallion lands */}
              <div style={{ position: "absolute", left: SLOT.x - 28, top: SLOT.y - 14, width: 56, height: 28, borderRadius: 14, background: "#16181d", opacity: t < T.land - 0.1 ? 1 : 0 }} />
              <div style={{ position: "absolute", left: SLOT.x - 27, top: SLOT.y - 13, width: 54, height: 26, borderRadius: 13, boxShadow: `0 0 ${20 * landGlow}px ${7 * landGlow}px rgba(244,197,66,.85)` }} />
            </Phone>
          </div>
          <Ring t={t} a={T.land - 0.05} x={slotX} y={slotY} r={240} color={GOLD} />
        </>
      )}
      {t < T.land && <Medallion {...med} />}

      {/* ── end card ── */}
      <Footage src="footage/218670_large.mp4" from={T.end - 0.2} to={T.out} startFrom={4} dark={0.55} zoom={0.1} fadeIn={0.4} />
      {t > T.end - 0.05 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(7,32,58,.45) 0%, rgba(0,0,0,.6) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 170, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.3, 1, outExpo(seg(t, T.end, T.end + 0.5)))}) rotateY(${lerp(180, 0, inOut(seg(t, T.end, T.end + 0.6)))}deg)` }} />
            <H1 size={104} style={{ marginTop: 60, color: "#fff", opacity: seg(t, T.end + 0.3, T.end + 0.45), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.end + 0.3, T.end + 0.8)))}px)` }}>Free surf</H1>
            <H1 size={104} style={{ color: "#fff", opacity: seg(t, T.end + 0.5, T.end + 0.65), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.end + 0.5, T.end + 1.0)))}px)` }}>forecast.</H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "26px 54px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 54, marginTop: 100,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.9, T.end + 1.05), transform: `scale(${lerp(0.7, 1, outBack(seg(t, T.end + 0.9, T.end + 1.25)))})` }}>rosa.surf <span>→</span></div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
