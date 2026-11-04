import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";

/*
  Phone launch, Uluwatu, 17 s. Motion language: a product-UI launch (the device rises slowly out
  of the dark like a keynote reveal, light sweeps across the glass, it turns to face camera, the UI
  runs itself; type slams in on the beat, glints of light drift up, a whip-spin and a white flash
  cut to the end card). Here: the phone rises out of a sunset-graded wave, turns to camera on the
  light-theme Uluwatu page, the day highlight runs Mon to Sun, then the page scrolls the hours, the
  tide and sunset. The hook word "Uluwatu" grows into a giant white word behind the phone, half hidden.
  End card: logo, white "Plan your Bali week.", space, glowing blue "rosa.surf".
  Screen: captures-light/spot-uluwatu-full.png (1170×4659 → 400×1593 in the screen).
*/

export const SECONDS = 17;
const T = { hook: 0, rise: 1.6, face: 3.6, week: 4.6, hours: 8.0, tide: 10.2, spin: 12.0, end: 12.6, out: 17 };
// day columns in the capture, screen px (502-wide preview × 400/502)
const DAY_X = [51, 123, 195, 267, 339, 411, 483].map((x) => x * 0.797);
const GLINTS = 70;

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const cx = 540, cy = B.y + 600;

  // ── the phone: slow rise from below, back turned, swings to face camera; whip-spin out ──
  const up = inOut(seg(t, T.rise, T.face + 0.4));
  const turn = outBack(seg(t, T.rise + 0.6, T.face + 0.2));
  const spin = seg(t, T.spin, T.end);
  const beat = (a: number) => 0.035 * Math.sin(Math.PI * seg(t, a, a + 0.25)); // little punch on each slam
  const punch = beat(T.face) + beat(T.week) + beat(T.hours) + beat(T.tide);
  const pose: Pose = {
    x: 0,
    y: lerp(1100, 0, up) + 8 * Math.sin(t * 1.6) * up,
    s: (lerp(0.7, 0.78, up) + punch) * lerp(1, 2.6, spin * spin),
    rx: lerp(24, 0, up) + 3 * Math.sin(t * 0.9),
    ry: lerp(-80, 0, turn) + 7 * Math.sin(t * 0.7) * turn + 360 * inOut(spin),
    rz: lerp(-6, 0, up) + 1.5 * Math.sin(t * 0.5),
    o: t < T.rise || t >= T.end ? 0 : 1,
  };
  // light sweeps across the glass as it faces camera, and again before the spin
  const sweep = (a: number) => lerp(-140, 140, inOut(seg(t, a, a + 0.9)));
  const sweepOn = (a: number) => t > a && t < a + 0.9;

  // ── the UI runs itself: day highlight Mon → Sun, then scroll the hours, then tide + sunset ──
  const dayK = seg(t, T.week + 0.3, T.hours - 0.3) * 6;
  const day = Math.min(6, Math.floor(dayK));
  const hiX = day === 0 ? DAY_X[0] : lerp(DAY_X[day - 1], DAY_X[day], outExpo(Math.min(1, (dayK - day) * 3)));
  const scroll = 470 * inOut(seg(t, T.hours, T.tide - 0.2)) + 263 * inOut(seg(t, T.tide, T.spin - 0.4));

  // ── hook word → the giant word behind the phone ──
  const grow = inOut(seg(t, T.rise + 0.4, T.face + 0.2));
  const slam = (a: number): React.CSSProperties => ({ opacity: t >= a ? 1 : 0, transform: `scale(${lerp(1.7, 1, outExpo(seg(t, a, a + 0.25)))})` });
  const shadow = "0 10px 60px rgba(0,0,0,.7)";

  // ── glints drifting up around the phone ──
  const glints = Array.from({ length: GLINTS }, (_, i) => {
    const r1 = random(`g${i}`), r2 = random(`h${i}`), r3 = random(`k${i}`);
    const life = 2.2 + 1.8 * r2;
    const p = ((t - T.rise) / life + r1) % 1;
    const x = cx + (r3 - 0.5) * 900 + 30 * Math.sin(t * 2 + i);
    const y = B.y + B.h + 60 - p * (B.h + 160);
    const o = (t > T.rise ? seg(t, T.rise, T.rise + 0.8) : 0) * (1 - seg(t, T.spin, T.end)) * Math.sin(Math.PI * p) * (0.4 + 0.6 * r2);
    const s = 3 + 7 * r3;
    return <div key={i} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: s, background: i % 3 ? "#fff" : C.acc, opacity: o, boxShadow: `0 0 ${3 * s}px ${i % 3 ? "rgba(255,210,150,.9)" : C.acc}` }} />;
  });
  // a ring of light bursts out when the phone faces camera
  const ring = seg(t, T.face, T.face + 0.7);

  const flash = Math.min(seg(t, T.spin + 0.3, T.end), 1 - seg(t, T.end, T.end + 0.25));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ── the sunset wave ── */}
      <Footage src="footage/218670_large.mp4" from={0} to={T.end} startFrom={2} dark={0.25} zoom={0.18} fadeIn={0.05} fadeOut={0.05} />
      {t < T.end && (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,120,60,.55) 0%, rgba(255,170,90,.35) 40%, rgba(3,42,250,.35) 100%)", mixBlendMode: "overlay" }} />
          <AbsoluteFill style={{ background: `radial-gradient(900px 1100px at 50% ${(cy / 1920) * 100}%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.65) 100%)`, opacity: seg(t, T.rise, T.face) }} />
        </>
      )}

      {/* ── hook, then the giant word behind the phone ── */}
      {t < T.end && (
        <div style={{ position: "absolute", left: B.x, top: lerp(B.y + 120, cy - 200, grow), width: B.w, textAlign: "center" }}>
          <H1 size={lerp(150, 214, grow)} style={{ color: "#fff", textShadow: shadow, ...slam(0.1) }}>Uluwatu{grow < 0.5 && ","}</H1>
          <H1 size={130} style={{ color: C.acc, textShadow: shadow, marginTop: 10, ...slam(0.45), opacity: t >= 0.45 ? 1 - seg(t, T.rise + 0.2, T.rise + 0.6) : 0 }}>the whole</H1>
          <H1 size={130} style={{ color: C.acc, textShadow: shadow, ...slam(0.75), opacity: t >= 0.75 ? 1 - seg(t, T.rise + 0.2, T.rise + 0.6) : 0 }}>week.</H1>
        </div>
      )}

      {t < T.end && glints.filter((_, i) => i % 2)}

      {/* ── light ring behind the phone ── */}
      {ring > 0 && ring < 1 && (
        <div style={{ position: "absolute", left: cx - 500 * outExpo(ring), top: cy - 500 * outExpo(ring), width: 1000 * outExpo(ring), height: 1000 * outExpo(ring), borderRadius: "50%", border: `6px solid ${C.acc}`, opacity: 1 - ring, boxShadow: `0 0 60px ${C.acc}` }} />
      )}

      {/* ── the phone ── */}
      <Phone pose={pose} cx={cx} cy={cy} glow={0.25 + 0.35 * turn}>
        <Screen src="captures-light/spot-uluwatu-full.png" scroll={scroll} />
        {t > T.week && t < T.hours + 0.3 && (
          <div style={{ position: "absolute", left: hiX - 30, top: 52, width: 60, height: 66, borderRadius: 14, border: `3px solid ${C.acc}`, boxShadow: `0 0 18px ${C.acc}`, opacity: seg(t, T.week, T.week + 0.2) * (1 - seg(t, T.hours, T.hours + 0.3)), transform: `translateY(${-scroll}px) scale(${1 + 0.08 * Math.sin(Math.PI * (dayK % 1))})` }} />
        )}
        {[T.face - 0.4, T.spin - 1.0].map((a) => sweepOn(a) && (
          <div key={a} style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, transparent ${sweep(a) - 20}%, rgba(255,255,255,.65) ${sweep(a)}%, transparent ${sweep(a) + 20}%)`, mixBlendMode: "screen" }} />
        ))}
      </Phone>

      {t < T.end && glints.filter((_, i) => i % 2 === 0)}

      {/* ── type slams over the top of the frame ── */}
      {t >= T.week && t < T.spin && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center" }}>
          {t < T.hours ? <H1 size={110} style={{ color: "#fff", textShadow: shadow, ...slam(T.week) }}>Mon to Sun<span style={{ color: C.acc }}>.</span></H1>
            : t < T.tide ? <H1 size={110} style={{ color: "#fff", textShadow: shadow, ...slam(T.hours) }}>Hour by hour<span style={{ color: C.acc }}>.</span></H1>
            : <H1 size={110} style={{ color: "#fff", textShadow: shadow, ...slam(T.tide) }}>Tide to sunset<span style={{ color: C.acc }}>.</span></H1>}
        </div>
      )}

      {/* ── end card ── */}
      <Footage src="footage/310248_large.mp4" from={T.end} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.05} />
      {t >= T.end && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <H1 size={100} style={{ marginTop: 56, color: "#fff", ...slam(T.end + 0.3) }}>Plan your Bali week.</H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 60px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 60, marginTop: 120,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.8, T.end + 0.95), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.8, T.end + 1.15)))})` }}>rosa.surf</div>
          </div>
        </>
      )}

      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

export default Film;
