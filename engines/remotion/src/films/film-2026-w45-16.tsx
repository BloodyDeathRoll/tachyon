import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, rise, seg, useInter, useT, win } from "../lib";
import { Particles } from "./film-2026-w44-13";

/*
  Uluwatu, why it rates, 16 s, dark theme. The phone fills the frame from the first frame on
  captures/spot-uluwatu-full.png over slow ocean footage, Rosa particles rising in the dark sides.
  Hook "Why is Uluwatu rated that?" while the phone eases in close on the Epic pill; it pans to the
  bars and the page scrolls Size → Period → Wind (bottom nav pinned), one big white word per bar.
  "Wind can only polish." holds on Wind as the phone glides back out to full size. End card as W44 · 03
  (logo, white "it's free.", glowing button with white text a little below, white "link in bio") over
  the closer clip not used in recent closers. Screen px: capture 1170×4659 scaled to 400 wide.
*/

export const SECONDS = 16;
const T = { zoom: 1.4, bars: 3.4, size: 4.0, period: 5.0, wind: 6.6, line: 8.2, back: 8.6, end: 10.6, out: 16 };

const CAP = "captures/spot-uluwatu-full.png";
const PAGE_H = 1593;
// the bottom nav is baked into the full capture: cut its band out of the page and pin a crop of it (as film-2026-w45-05)
const CUT = [777, 864];
const NAV = { x: 17, y: 785, w: 366, h: 63 };
const EPIC = { x: 58, y: 257 };
const ROWS = [253, 278, 303]; // Size, Period, Wind rows of the bars card
const shadow = "0 6px 40px rgba(0,0,0,.85)";

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const { width, height } = useVideoConfig();
  const cx = width / 2, cy = height / 2;

  // ── camera: zoom on Epic, pan to the bars, the page scrolls row by row, glide back out ──
  const z1 = inOut(seg(t, T.zoom, T.zoom + 1.4));
  const z2 = inOut(seg(t, T.back, T.back + 1.4));
  const s1 = inOut(seg(t, T.period, T.period + 0.6)), s2 = inOut(seg(t, T.wind, T.wind + 0.6));
  const scroll = 25 * (s1 + s2);
  // close-up stops where the 400 px screen spans the frame width, so no row is cut at the sides
  const S = lerp(lerp(2.05, width / 400, z1), 2.05, z2);
  const sx = 200;
  const sy = lerp(lerp(430, EPIC.y, z1), 430, z2);
  const FX = cx;
  const calm = 1 - 0.75 * Math.min(1, z1 * (1 - z2) * 1.0);
  const exit = inOut(seg(t, T.end - 0.3, T.end + 0.3));
  // place screen point (sx, sy) at frame (FX, cy): the phone box is 420×880, the screen sits 10 px in
  const pose: Pose = {
    x: FX - cx - S * (sx - 200), y: -S * (sy - 430) + 8 * Math.sin(t * 1.2) * calm + 1400 * exit, s: S,
    rx: 3 * Math.sin(t * 0.6 + 1.1) * calm, ry: 7 * Math.sin(t * 0.5) * calm, rz: 0.8 * Math.sin(t * 0.4 + 2) * calm, o: 1 - exit,
  };
  const row = scroll < 12 ? 0 : scroll < 37 ? 1 : 2;
  const ringO = win(t, T.size, T.back + 0.4, 0.3, 0.4);

  const words = [["Size", T.size, T.period], ["Period", T.period + 0.5, T.wind], ["Wind", T.wind + 0.5, T.line]] as const;
  const scrim = Math.max(win(t, 0, T.zoom + 1.6, 0.05, 0.4), win(t, T.size, T.end, 0.3, 0.3));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* slow ocean bed under the phone, fresh closer clip for the end card */}
      <Footage src="footage/283533_large.mp4" from={0} to={T.end + 0.2} startFrom={1} dark={0.45} zoom={0.08} fadeIn={0.05} fadeOut={0.4} />
      <Footage src="footage/1306-145340152_medium.mp4" from={T.end - 0.2} to={T.out} startFrom={3} dark={0.5} zoom={0.1} fadeIn={0.6} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.3, 0.01)} />

      {t < T.end + 0.4 && (
        <Phone pose={pose} cx={cx} cy={cy} glow={0.25}>
          <div style={{ position: "absolute", inset: 0, background: C.page }} />
          <div style={{ position: "absolute", left: 0, top: 0, width: 400, transform: `translateY(${-scroll}px)` }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: CUT[0], overflow: "hidden" }}><Screen src={CAP} /></div>
            <div style={{ position: "absolute", left: 0, top: CUT[0], width: 400, height: PAGE_H - CUT[1], overflow: "hidden" }}><Screen src={CAP} scroll={CUT[1]} /></div>
            {/* the bar in focus */}
            <div style={{ position: "absolute", left: 172, top: ROWS[row] - 12, width: 164, height: 24, borderRadius: 8, border: "1.5px solid rgba(255,255,255,.9)",
              boxShadow: "0 0 10px rgba(255,255,255,.5)", opacity: ringO }} />
          </div>
          {/* outside the scroll layer: the app's nav stays put while the page scrolls */}
          <div style={{ position: "absolute", left: NAV.x, top: NAV.y, width: NAV.w, height: NAV.h, borderRadius: NAV.h / 2, overflow: "hidden" }}>
            <Screen src={CAP} x={-NAV.x} scroll={NAV.y} />
          </div>
        </Phone>
      )}

      {/* scrim so the type reads over the app */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.45) 30%, rgba(0,0,0,0) 48%)", opacity: scrim }} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w, textAlign: "center" }}>
        <H1 size={130} style={{ color: "#fff", textShadow: shadow, ...rise(t, 0.05, T.zoom + 1.6, 50, 0.35, 0.3) }}>Why is Uluwatu</H1>
        <H1 size={130} style={{ color: "#fff", textShadow: shadow, ...rise(t, 0.3, T.zoom + 1.6, 50, 0.35, 0.3) }}>rated that?</H1>
      </div>

      {/* one word per bar */}
      {words.map(([w, a, b]) => (
        <div key={w} style={{ position: "absolute", left: B.x, top: B.y + 40, width: B.w, textAlign: "center" }}>
          <H1 size={200} style={{ color: "#fff", textShadow: shadow, ...rise(t, a, b, 60, 0.4, 0.25) }}>{w}</H1>
        </div>
      ))}

      {/* final beat */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 40, width: B.w, textAlign: "center" }}>
        <H1 size={130} style={{ color: "#fff", textShadow: shadow, ...rise(t, T.line, T.end - 0.1, 50, 0.4, 0.3) }}>Wind can</H1>
        <H1 size={130} style={{ color: "#fff", textShadow: shadow, ...rise(t, T.line + 0.25, T.end - 0.1, 50, 0.4, 0.3) }}>only polish.</H1>
      </div>

      {/* end card (W44 · 03) */}
      {t >= T.end && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.5, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.6)))})` }} />
          <div style={{ ...font, color: "#fff", fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.12, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
          <Sub size={50} style={{ color: "#fff", marginTop: -16, ...rise(t, T.end + 0.25, T.out + 1) }}>it's free.</Sub>
          <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40, marginTop: 36,
            boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.4, T.out + 1) }}>rosa.surf <span>→</span></div>
          <Sub size={38} style={{ color: "#fff", ...rise(t, T.end + 0.55, T.out + 1) }}>link in bio</Sub>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default Film;
