import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Where to next, 16 s. Motion language: a tiling UI montage, without the grid (a strip of three big
  spot screens tiles across the frame in 3D, kinetic one-word labels punch in sync with the tile in
  focus, a cascade lifts the strip away, a hero device rises in its place). Here: hook "Where are we
  surfing next?", the strip slides Pipeline → Supertubos → Uluwatu with "Hawaii?" "Portugal?" "Bali?",
  the tiles cascade up and out, the phone rises with the spots list then the map under "Check them all."
  / "Free. Worldwide.". End card: logo, white "One app. Every coast.", glowing blue "Follow for the
  swell", rosa.surf →. No numbers on screen.
*/

export const SECONDS = 16;
const T = { strip: 2.3, step1: 3.6, step2: 5.0, lift: 6.5, phone: 6.8, line2: 9.0, exit: 10.6, end: 11.0, out: 16 };

const CARDS = ["spot-pipeline", "spot-supertubos", "spot-uluwatu"];
const WORDS = ["Hawaii?", "Portugal?", "Bali?"];
const BLUE = "#032afa";
const CW = 360, CH = (CW * 2532) / 1170, DX = 330, SIDE = 0.7;

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const my = B.y + B.h / 2;

  // focus index along the strip: 0 → 1 → 2, a snappy slide at each step
  const f = inOut(seg(t, T.step1, T.step1 + 0.45)) + inOut(seg(t, T.step2, T.step2 + 0.45));
  const word = t >= T.strip + 0.3 && t < T.lift ? Math.round(f) : -1;
  const wordAt = [T.strip + 0.3, T.step1 + 0.25, T.step2 + 0.25][Math.max(0, word)];

  // phone rises where the strip was
  const up = outExpo(seg(t, T.phone, T.phone + 0.8));
  const exit = inOut(seg(t, T.exit, T.end));
  const pose = {
    x: 0, y: 70 + lerp(900, 0, up) + 8 * Math.sin(t * 1.5), s: 0.92 * lerp(1, 2.2, exit),
    rx: lerp(35, 0, up) + 4 * Math.sin(t * 1.1), ry: -10 * Math.sin(t * 0.8), rz: lerp(-6, 0, up),
    o: seg(t, T.phone, T.phone + 0.15) * (1 - exit),
  };

  return (
    <AbsoluteFill style={{ background: BLUE, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(1200px 1500px at 50% 40%, #1d4dff 0%, #032afa 40%, #01136e 100%)" }} />

      {/* ── hook ── */}
      {t < T.strip + 0.4 && (
        <div style={{ position: "absolute", left: B.x, top: my - 150, width: B.w, textAlign: "center", opacity: 1 - seg(t, T.strip - 0.1, T.strip + 0.3),
          transform: `translateY(${-120 * inOut(seg(t, T.strip - 0.1, T.strip + 0.4))}px)` }}>
          <H1 size={118} style={{ color: "#fff", opacity: seg(t, 0.05, 0.2), transform: `translateY(${lerp(60, 0, outExpo(seg(t, 0.05, 0.55)))}px)` }}>Where are we</H1>
          <div style={{ ...font, display: "inline-block", marginTop: 28, padding: "10px 44px", borderRadius: 999, background: "#fff", color: BLUE, fontWeight: 800, fontSize: 112, letterSpacing: "-.035em", lineHeight: 1.1,
            boxShadow: "0 0 60px rgba(17,183,242,.8)", opacity: seg(t, 0.5, 0.6), transform: `scale(${lerp(0.4, 1, outBack(seg(t, 0.5, 0.85)))}) rotate(-3deg)` }}>surfing next?</div>
        </div>
      )}

      {/* ── the strip: three big spot tiles, the focused one forward ── */}
      {t >= T.strip - 0.05 && t < T.lift + 1.2 && CARDS.map((src, i) => {
        const d = i - f, a = Math.abs(d), sd = Math.sign(d);
        const enter = outExpo(seg(t, T.strip + 0.08 * i, T.strip + 0.08 * i + 0.7));
        const lift = inOut(seg(t, T.lift + 0.1 * i, T.lift + 0.1 * i + 0.6));
        const s = lerp(1, SIDE, Math.min(1, a));
        const o = (1 - seg(a, 1, 1.35)) * seg(t, T.strip + 0.08 * i, T.strip + 0.08 * i + 0.15);
        if (o <= 0) return null;
        return (
          <div key={src} style={{ position: "absolute", left: 540 - CW / 2, top: my - CH / 2, width: CW, height: CH, borderRadius: 44, overflow: "hidden", background: "#f4f3f3",
            zIndex: 10 - Math.round(a * 2), opacity: o,
            boxShadow: a < 0.5 ? "0 40px 110px rgba(0,0,0,.55), 0 0 0 5px #fff, 0 0 70px rgba(17,183,242,.7)" : "0 30px 80px rgba(0,0,0,.5)",
            filter: `brightness(${lerp(1, 0.7, Math.min(1, a))})`,
            transform: `perspective(1600px) translate(${sd * DX * Math.min(1, a)}px, ${lerp(1100, 0, enter) - 1500 * lift}px) rotateY(${-sd * 28 * Math.min(1, a)}deg) rotateZ(${lerp(8, 0, enter)}deg) scale(${s})` }}>
            <Img src={staticFile(`captures-light/${src}.png`)} style={{ width: "100%", display: "block" }} />
          </div>
        );
      })}

      {/* ── kinetic labels, in sync with the tile in focus ── */}
      {word >= 0 && (() => {
        const k = seg(t, wordAt, wordAt + 0.25);
        return (
          <div style={{ position: "absolute", left: B.x, top: B.y + B.h - 190, width: B.w, display: "flex", justifyContent: "center", zIndex: 20 }}>
            <div style={{ ...font, padding: "14px 56px", borderRadius: 999, background: "#fff", color: BLUE, fontWeight: 800, fontSize: 120, letterSpacing: "-.04em", lineHeight: 1.1,
              boxShadow: "0 20px 70px rgba(0,0,0,.45), 0 0 60px rgba(17,183,242,.7)", opacity: 1 - seg(t, T.lift - 0.2, T.lift),
              transform: `scale(${lerp(0.5, 1, outBack(k))}) rotate(${word % 2 ? 3 : -3}deg)` }}>{WORDS[word]}</div>
          </div>
        );
      })()}

      {/* ── the phone: spots list, then the map ── */}
      <Phone pose={pose} glow={0.35} cy={my}>
        <Screen src="captures-light/spots.png" scroll={lerp(0, 120, inOut(seg(t, T.phone + 0.6, T.line2)))} />
        <Screen src="captures-light/map.png" o={seg(t, T.line2 - 0.1, T.line2 + 0.25)} />
      </Phone>
      {t > T.phone + 0.3 && t < T.exit + 0.3 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center", opacity: win(t, T.phone + 0.4, T.exit + 0.3, 0.3, 0.3) }}>
          <H1 size={92} style={{ color: "#fff", textShadow: "0 8px 40px rgba(0,0,0,.5)", opacity: 1 - seg(t, T.line2 - 0.2, T.line2),
            transform: `translateY(${lerp(50, 0, outExpo(seg(t, T.phone + 0.4, T.phone + 0.9)))}px)` }}>Check them all.</H1>
          {t >= T.line2 - 0.05 && (
            <div style={{ position: "absolute", left: 0, top: 0, width: B.w, display: "flex", justifyContent: "center" }}>
              <div style={{ ...font, padding: "6px 40px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 84, letterSpacing: "-.035em", lineHeight: 1.1,
                boxShadow: "0 0 50px rgba(17,183,242,.8)", transform: `scale(${lerp(0.5, 1, outBack(seg(t, T.line2, T.line2 + 0.35)))}) rotate(-2deg)` }}>Free. Worldwide.</div>
            </div>
          )}
        </div>
      )}

      {/* ── end card ── */}
      <Footage src="footage/310248_large.mp4" from={T.end - 0.3} to={T.out} startFrom={10} dark={0.55} zoom={0.1} fadeIn={0.4} />
      {t > T.end - 0.05 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outExpo(seg(t, T.end, T.end + 0.5)))}) rotateY(${lerp(180, 0, inOut(seg(t, T.end, T.end + 0.6)))}deg)` }} />
            <H1 size={110} style={{ marginTop: 56, color: "#fff", opacity: seg(t, T.end + 0.3, T.end + 0.45), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.end + 0.3, T.end + 0.8)))}px)` }}>One app.</H1>
            <H1 size={110} style={{ color: "#fff", opacity: seg(t, T.end + 0.55, T.end + 0.7), transform: `translateY(${lerp(40, 0, outExpo(seg(t, T.end + 0.55, T.end + 1.05)))}px)` }}>Every coast.</H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 54px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 54, marginTop: 110,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.95, T.end + 1.1), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.95, T.end + 1.3)))})` }}>Follow for the swell</div>
            <div style={{ ...font, color: "#fff", fontWeight: 700, fontSize: 48, marginTop: 40, opacity: seg(t, T.end + 1.3, T.end + 1.5), transform: `translateY(${lerp(30, 0, outExpo(seg(t, T.end + 1.3, T.end + 1.8)))}px)` }}>rosa.surf →</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
