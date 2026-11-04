import React from "react";
import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";
import { Particles } from "./film-2026-w44-13";

/*
  Search to Uluwatu, 15 s, dark theme. Hook "Type a spot. Get 16 days." in the top third; the phone fills
  the lower two thirds on captures/search.png. "Ulu" types into the field and the list settles to the
  Uluwatu row (rows cut from the same capture). A tap, and captures/spot-uluwatu-full.png slides in, phone still
  large; one ease-out scroll down the forecast with the bottom nav pinned. The camera pulls back for
  "16 days ahead, any spot." Rosa particles rise in the empty bottom throughout. End card as W44 · 03 over
  1306-145340152 (not on recent closers). Numbers: clients/rosa/product.md (16 days). Screen px: 1170 → 400.
*/

export const SECONDS = 15;
const T = { hook: 0, type: 0.9, settle: 1.6, tap: 2.5, spot: 2.75, scroll: 3.4, pull: 6.4, line: 6.9, exit: 9.9, end: 10.3, out: 15 };

const SEARCH = "captures/search.png", SH = 866;
const FULL = "captures/spot-uluwatu-full.png", FH = 1593;
const SPOT = "captures/spot-uluwatu.png";
const HEAD = 76;            // the full capture has a toast over its header: take the header from spot-uluwatu.png
const CUT = [777, 864];     // the nav band baked into the full page, cut out of the scrolling layer
const NAV = { x: 17, y: 785, w: 366, h: 63 };
const ROWS = { recent: [66, 98], banzai: [100, 164], tubos: [167, 231], ulu: [234, 298] };

/** a slice y0..y1 of a 400-wide capture, placed at `top` */
const Slice: React.FC<{ src: string; y0: number; y1: number; top: number; o?: number; dx?: number }> = ({ src, y0, y1, top, o = 1, dx = 0 }) => (
  <div style={{ position: "absolute", left: dx, top, width: 400, height: y1 - y0, overflow: "hidden", opacity: o }}><Screen src={src} scroll={y0} /></div>
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const shadow = "0 6px 40px rgba(0,0,0,.85)";

  // ── phone: lower two thirds of the frame, pulls back for the line, drops out before the end card ──
  const float = { ry: 6 * Math.sin(t * 0.5 + 0.6), rx: 2.5 * Math.sin(t * 0.37 + 1.3), rz: 0.8 * Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const enter = outExpo(seg(t, 0, 0.7));
  const pull = inOut(seg(t, T.pull, T.pull + 1.0));
  const exit = inOut(seg(t, T.exit, T.exit + 0.45));
  const pose = {
    x: 0, y: lerp(900, 0, enter) + lerp(0, -250, pull) + 1400 * exit + float.y, s: lerp(1.42, 1.08, pull),
    rx: float.rx + lerp(22, 0, enter), ry: float.ry, rz: float.rz, o: 1 - seg(t, T.exit + 0.25, T.exit + 0.45),
  };

  // ── search: "Ulu" types, the list settles to Uluwatu, a tap ──
  const typed = "Ulu".slice(0, Math.floor(seg(t, T.type, T.type + 0.6) * 3 + (t >= T.type ? 1 : 0)));
  const caret = t >= T.type - 0.3 && t < T.spot && Math.floor(t * 3) % 2 === 0;
  const settle = Easing.out(Easing.cubic)(seg(t, T.settle, T.settle + 0.55));
  const tapK = seg(t, T.tap, T.tap + 0.3);
  const spotX = 400 * (1 - outExpo(seg(t, T.spot, T.spot + 0.5)));
  const scroll = 560 * Easing.out(Easing.cubic)(seg(t, T.scroll, T.scroll + 2.6));

  // the empty right of the search field and the empty page below the list, stretched over what they hide
  const fieldK = 196 / 90;

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/283533_large.mp4" from={0} to={T.end} startFrom={1} dark={0.45} zoom={0.12} fadeIn={0.05} fadeOut={0.3} />
      <AbsoluteFill style={{ background: "radial-gradient(1000px 1300px at 50% 65%, rgba(7,32,58,.85) 0%, rgba(3,16,31,.7) 50%, rgba(0,0,0,.6) 100%)", opacity: win(t, 0, T.end, 0.4, 0.3) }} />
      <Particles t={t} o={win(t, 0, T.out + 1, 0.5, 0.01)} />

      <Phone pose={pose} cx={540} cy={1290} glow={0.3} island={false}>
        {/* search */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, transform: `translateX(${-120 * (1 - spotX / 400)}px)` }}>
          <Screen src={SEARCH} />
          {typed && (
            <>
              <div style={{ position: "absolute", left: 92, top: 14, width: 196, height: 30, overflow: "hidden",
                backgroundImage: `url(${staticFile(SEARCH)})`, backgroundSize: `${400 * fieldK}px ${SH}px`, backgroundPosition: `${-295 * fieldK}px -14px` }} />
              <div style={{ ...font, position: "absolute", left: 94, top: 17, fontSize: 17, lineHeight: "24px", fontFeatureSettings: "normal" }}>{typed}</div>
            </>
          )}
          {caret && <div style={{ position: "absolute", left: 94 + 12 * typed.length, top: 18, width: 2, height: 22, background: C.acc }} />}
          {settle > 0 && (
            <>
              <div style={{ position: "absolute", left: 0, top: ROWS.recent[0], width: 400, height: ROWS.ulu[1] - ROWS.recent[0] + 4, overflow: "hidden" }}>
                <Screen src={SEARCH} scroll={330} />
              </div>
              <Slice src={SEARCH} y0={ROWS.recent[0]} y1={ROWS.recent[1]} top={ROWS.recent[0]} o={1 - settle} />
              <Slice src={SEARCH} y0={ROWS.banzai[0]} y1={ROWS.banzai[1]} top={ROWS.banzai[0] - 20 * settle} o={1 - settle} dx={-40 * settle} />
              <Slice src={SEARCH} y0={ROWS.tubos[0]} y1={ROWS.tubos[1]} top={ROWS.tubos[0] - 20 * settle} o={1 - settle} dx={-40 * settle} />
              <Slice src={SEARCH} y0={ROWS.ulu[0]} y1={ROWS.ulu[1]} top={lerp(ROWS.ulu[0], ROWS.recent[0], settle)} />
            </>
          )}
          <div style={{ position: "absolute", left: 200 - 24, top: ROWS.recent[0] + 32 - 24, width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,.45)",
            boxShadow: "0 0 0 3px rgba(255,255,255,.35), 0 0 18px rgba(255,255,255,.6)", opacity: Math.sin(Math.PI * tapK), transform: `scale(${1 - 0.25 * Math.sin(Math.PI * tapK)})` }} />
        </div>

        {/* Uluwatu spot page: scrolls, the nav stays put */}
        {t >= T.spot && (
          <div style={{ position: "absolute", left: spotX, top: 0, width: 400, height: 860, background: "#000", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 400, transform: `translateY(${-scroll}px)` }}>
              <Slice src={FULL} y0={0} y1={CUT[0]} top={0} />
              <Slice src={FULL} y0={CUT[1]} y1={FH} top={CUT[0]} />
              <Slice src={SPOT} y0={0} y1={HEAD} top={0} />
            </div>
            <div style={{ position: "absolute", left: NAV.x, top: NAV.y, width: NAV.w, height: NAV.h, borderRadius: NAV.h / 2, overflow: "hidden" }}>
              <Screen src={SPOT} x={-NAV.x} scroll={NAV.y} />
            </div>
          </div>
        )}
      </Phone>

      {/* hook, top third */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center" }}>
        <H1 size={124} style={{ color: "#fff", textShadow: shadow, ...rise(t, 0.1, T.pull, 60) }}>Type a spot.</H1>
        <H1 size={124} style={{ color: C.acc, textShadow: shadow, marginTop: 14, ...rise(t, 0.45, T.pull, 60) }}>Get 16 days.</H1>
      </div>

      {/* the line, over the pulled-back app */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center" }}>
        <H1 size={124} style={{ color: "#fff", textShadow: shadow, ...rise(t, T.line, T.exit, 60) }}>16 days ahead,</H1>
        <H1 size={124} style={{ color: C.acc, textShadow: shadow, marginTop: 14, ...rise(t, T.line + 0.3, T.exit, 60) }}>any spot.</H1>
      </div>

      {/* end card (as W44 · 03) over a fresh ocean clip */}
      <Footage src="footage/1306-145340152_medium.mp4" from={T.end - 0.3} to={T.out} startFrom={9} dark={0.5} zoom={0.1} fadeIn={0.4} />
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.5, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.6)))})` }} />
        <div style={{ ...font, color: "#fff", fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.12, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={50} style={{ color: "#fff", marginTop: -16, ...rise(t, T.end + 0.25, T.out + 1) }}>it's free.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 40, marginTop: 36,
          boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.75), 0 0 90px rgba(17,183,242,.35)`, ...rise(t, T.end + 0.4, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={38} style={{ color: "#fff", ...rise(t, T.end + 0.55, T.out + 1) }}>link in bio</Sub>
      </div>
    </AbsoluteFill>
  );
};

export default Film;
