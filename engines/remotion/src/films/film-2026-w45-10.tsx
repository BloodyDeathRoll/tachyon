import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";

/*
  Swell as particles, 15 s. Motion language: abstract particle flow (a dense field of points riding
  sine bands like a swell train, pouring into a form and resolving it, then streaming on along a
  curve to a target; type slams in on the beat). Here: blue particles cross a black frame, pour into
  the phone and resolve into the dark charts screen, the colours lighting up; the phone swings in 3D
  while the stream flows past it to a pin on the coast; as the pin pops the phone spins once to the left,
  landing larger on a spot screen; the pin pops again, a white flash cuts to a real
  wave. End card: logo, white "See it coming.", space, glowing blue "rosa.surf/charts".
  16 days: clients/rosa/product.md.
*/

export const SECONDS = 15;
const T = { hook: 0, pour: 2.0, settle: 3.4, swing: 4.2, next: 5.8, hit: 7.4, wave: 7.6, end: 9.6, out: 15 };
const N = 240;
const BLUES = [C.acc, "#6fd8ff", "#ffffff", "#2f7bff", C.acc];

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const my = B.y + B.h / 2;

  // ── the phone: lands centre-low as the particles pour in, then swings left in 3D ──
  // the phone is a picture, not UI: it uses the whole 1080x1920 frame, only the type keeps to the safe box
  const cx = 540, cy = 960;
  const sw = outExpo(seg(t, T.swing, T.swing + 0.8));
  const land = outBack(seg(t, T.pour, T.pour + 0.6));
  // as the pin pops: one full spin to the left, the screen swaps to a spot, and the phone grows
  // to fill the frame height (1.4x across)
  const spin = inOut(seg(t, T.swing + 0.4, T.swing + 1.3));
  const ry = -360 * spin;
  const big = lerp(1, 1.4, spin);
  const calm = 1 - 0.7 * spin; // less sway once big, so the edges stay in frame
  const pose: Pose = {
    x: lerp(0, -110, sw) - 70 * spin, y: lerp(160, 40, land) + 110 * spin + 6 * Math.sin(t * 2.2),
    s: lerp(0.62, 1.1, land) * lerp(1, 0.95, sw) * big,
    rx: lerp(18, 8, land) + 6 * sw * calm * Math.sin(t * 1.4), ry: lerp(-12, 0, land) + ry + sw * calm * 30 * Math.sin((t - T.swing) * 2.1), rz: lerp(8, 0, land) - 4 * sw * calm * Math.sin(t * 1.1),
    o: t >= T.pour && t < T.wave ? Math.min(seg(t, T.pour, T.pour + 0.25), 1 - seg(t, T.hit + 0.1, T.wave)) : 0,
  };
  const reveal = outExpo(seg(t, T.pour + 0.4, T.settle + 0.2)); // circular wipe of the screen
  const lit = seg(t, T.settle - 0.3, T.settle + 0.6);            // swell colours light up

  // pin on the coast, bottom right of the frame
  const PIN = { x: 930, y: 1760 };
  const pinPop = outBack(seg(t, T.swing + 0.4, T.swing + 0.8));
  const hitK = seg(t, T.hit, T.hit + 0.5);

  // ── particles ──
  const parts = Array.from({ length: N }, (_, i) => {
    const r1 = random(`a${i}`), r2 = random(`b${i}`), r3 = random(`c${i}`), r4 = random(`d${i}`);
    const size = 4 + 8 * r3;
    // swell train: six sine bands crossing the whole frame, top to bottom
    const band = i % 6;
    const sp = 380 + 260 * r2;
    const sx = ((r1 * 1300 + sp * t) % 1300) - 110;
    const sy = 110 + band * 340 + 70 * Math.sin(sx * 0.008 - t * 3 + band * 1.3) + (r4 - 0.5) * 50;
    let x = sx, y = sy, o = 0.35 + 0.65 * r4, w = size * (1.6 + 2 * r2), front = true;
    if (t >= T.pour && t < T.swing) {
      // pour into the screen, staggered, absorbed as the screen resolves
      const k = outExpo(seg(t, T.pour + 0.6 * r1, T.pour + 0.6 * r1 + 0.8));
      const s = pose.s;
      x = lerp(sx, cx + pose.x + (r2 - 0.5) * 380 * s, k);
      y = lerp(sy, cy + pose.y + (r4 - 0.5) * 840 * s, k);
      w = lerp(w, size, k);
      o *= 1 - seg(k, 0.85, 1) * 0.9;
    } else if (t >= T.swing) {
      // flow past the phone to the pin: a bezier from the left edge, wiggling less as it nears
      const u = (r1 + (t - T.swing) * (0.45 + 0.25 * r2)) % 1;
      const S = { x: -80, y: 60 + r4 * 1800 }, K = { x: 560, y: S.y - 360 + 260 * r3 };
      x = (1 - u) ** 2 * S.x + 2 * (1 - u) * u * K.x + u * u * PIN.x;
      y = (1 - u) ** 2 * S.y + 2 * (1 - u) * u * K.y + u * u * (PIN.y - 40) + 40 * Math.sin(u * 14 + i) * (1 - u);
      w = size * lerp(2.4, 0.8, u);
      o *= seg(t, T.swing, T.swing + 0.5) * (1 - seg(u, 0.9, 1)) * (1 - seg(t, T.hit, T.wave));
      front = i % 2 === 0;
    }
    return { x, y, w, h: size, o, front, col: BLUES[i % BLUES.length], i };
  });
  const dot = (p: (typeof parts)[number]) => p.o > 0.01 && (
    <div key={p.i} style={{ position: "absolute", left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h, borderRadius: p.h, background: p.col, opacity: p.o, boxShadow: p.i % 7 === 0 ? `0 0 14px ${C.acc}` : undefined }} />
  );

  const flash = t >= T.hit + 0.1 && t < T.wave + 0.15 ? 0.8 * (1 - seg(t, T.hit + 0.1, T.wave + 0.15)) : 0;
  const slam = (a: number): React.CSSProperties => ({ opacity: t >= a ? 1 : 0, transform: `scale(${lerp(1.6, 1, outExpo(seg(t, a, a + 0.25)))})` });
  const shadow = "0 10px 60px rgba(0,0,0,.85)";

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {t < T.wave && <AbsoluteFill style={{ background: "radial-gradient(1300px 2000px at 50% 50%, rgba(3,42,250,.16) 0%, #000 75%)" }} />}

      {/* ── particles behind the phone ── */}
      {t < T.wave && parts.filter((p) => !p.front).map(dot)}

      {/* ── the phone: charts, resolved from the particles ── */}
      <Phone pose={pose} cx={cx} cy={cy} glow={0.2 + 0.4 * lit}>
        <div style={{ position: "absolute", inset: 0, clipPath: `circle(${lerp(0, 75, reveal)}% at 50% 50%)`, filter: `saturate(${lerp(0, 1.5, lit)}) brightness(${lerp(0.6, 1.1, lit)})` }}>
          {/* the back half of the spin shows the dark phone body; the spot is on the screen when it turns back */}
          {Math.cos((ry * Math.PI) / 180) > 0 && <Screen src={spin < 0.5 ? "captures/charts.png" : "captures/spot-supertubos.png"} />}
        </div>
      </Phone>

      {/* ── pin on the coast ── */}
      {t >= T.swing && t < T.wave && (
        <div style={{ position: "absolute", left: PIN.x - 60, top: PIN.y - 150, width: 120, height: 150, transformOrigin: "50% 100%", transform: `scale(${pinPop * (1 + 0.35 * Math.sin(Math.PI * hitK))})` }}>
          {[0, 1, 2].map((j) => {
            const p = ((t - T.swing) * 0.8 + j / 3) % 1;
            return <div key={j} style={{ position: "absolute", left: 60 - 90 * p, top: 150 - 30 * p, width: 180 * p, height: 60 * p, borderRadius: "50%", border: `3px solid ${C.acc}`, opacity: 1 - p }} />;
          })}
          <svg width={120} height={150} viewBox="0 0 120 150" style={{ position: "absolute", left: 0, top: 0, filter: `drop-shadow(0 0 ${24 + 40 * hitK}px ${C.acc})` }}>
            <path d="M60 148 C40 110 6 86 6 56 A54 54 0 0 1 114 56 C114 86 80 110 60 148 Z" fill={C.acc} />
            <circle cx={60} cy={56} r={20} fill="#fff" />
          </svg>
        </div>
      )}

      {/* ── particles in front of the phone ── */}
      {t < T.wave && parts.filter((p) => p.front).map(dot)}

      {/* ── type ── */}
      {t < T.pour && (
        <div style={{ position: "absolute", left: B.x, top: my - 295, width: B.w, textAlign: "center" }}>
          {["See the", "swell", "before it", "lands."].map((w, i) => (
            <H1 key={w} size={150} style={{ color: i === 1 ? C.acc : "#fff", textShadow: shadow, ...slam(0.08 + 0.3 * i) }}>{w}</H1>
          ))}
        </div>
      )}
      {t >= T.pour && t < T.swing && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 30, width: B.w, textAlign: "center" }}>
          <H1 size={120} style={{ color: "#fff", textShadow: shadow, ...slam(T.settle - 0.2) }}>Swell, live<span style={{ color: C.acc }}>.</span></H1>
        </div>
      )}
      {t >= T.swing && t < T.wave && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 30, width: B.w, textAlign: "right" }}>
          {t < T.next
            ? <><H1 size={130} style={{ color: "#fff", textShadow: shadow, ...slam(T.swing + 0.3) }}>16 days</H1><H1 size={130} style={{ color: C.acc, textShadow: shadow, ...slam(T.swing + 0.55) }}>out.</H1></>
            : <><H1 size={130} style={{ color: "#fff", textShadow: shadow, ...slam(T.next) }}>Right to</H1><H1 size={130} style={{ color: C.acc, textShadow: shadow, ...slam(T.next + 0.25) }}>your spot.</H1></>}
        </div>
      )}

      {/* ── it lands: a real wave ── */}
      <Footage src="footage/218670_large.mp4" from={T.wave} to={T.end} startFrom={3} dark={0.4} zoom={0.14} fadeIn={0.05} fadeOut={0.05} />
      {t >= T.wave && t < T.end && (
        <div style={{ position: "absolute", left: B.x, top: my - 140, width: B.w, textAlign: "center" }}>
          <H1 size={150} style={{ color: "#fff", textShadow: shadow, ...slam(T.wave + 0.2) }}>Be there</H1>
          <H1 size={150} style={{ color: C.acc, textShadow: shadow, ...slam(T.wave + 0.45) }}>first.</H1>
        </div>
      )}

      {/* ── end card ── */}
      <Footage src="footage/283533_large.mp4" from={T.end} to={T.out} startFrom={2} dark={0.55} zoom={0.1} fadeIn={0.05} />
      {t >= T.end && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <H1 size={104} style={{ marginTop: 56, color: "#fff", ...slam(T.end + 0.3) }}>See it coming.</H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 60px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 60, marginTop: 120,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.8, T.end + 0.95), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.8, T.end + 1.15)))})` }}>rosa.surf/charts</div>
          </div>
        </>
      )}

      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

export default Film;
