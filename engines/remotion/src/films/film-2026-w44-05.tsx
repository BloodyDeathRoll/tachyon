import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  Swell finds you, 12 s. Hook "Let the swell find you." on Pixabay waves (310248), cut to the phone on
  the Banzai Pipeline page (captures/spot-pipeline.png), push in on the day strip: the Today bars step up
  to Sunday's and turn dark green, the selection hops Today → Sun. A brand card slides in:
  "Swell alert. Straight to your phone." End card: logo, rosa.surf, link in bio, Footage: Pixabay.
  Numbers: clients/rosa/product.md (16 days; push swell alerts).
  Screen coordinates below are the capture (1170×2532) scaled to the 400 px screen (866 px tall).
*/

export const SECONDS = 12;
const T = { hook: 0, phone: 2.0, push: 2.9, step: 3.7, hop: 4.7, back: 6.3, card: 6.7, end: 9.3, out: 12 };

// the day strip in screen px (capture displayed at 924 wide × K)
const K = 400 / 924;
const r = (x: number, y: number, w: number, h: number) => ({ x: x * K, y: y * K, w: w * K, h: h * K });
const BASE = 418 * K;                                  // bar baseline
const BAR_W = 28 * K;
const TODAY_X = [45, 81, 117].map((x) => x * K);       // Today's three bars
const TODAY_TOP = [372, 353, 345].map((y) => y * K);
const SUN_TOP = [335, 337, 340].map((y) => y * K);     // Sunday's three bars
const TODAY_COL = r(31, 128, 127, 130);                // the selected-day box
const SUN_COL = r(164, 128, 127, 130);
const STRIP = { x: 200, y: 140 };                      // push-in focus

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone: tilts in from below, floats, drops out for the brand card ──────
  const float = { ry: 9 * Math.sin(t * 0.5 + 0.6), rx: 3 * Math.sin(t * 0.37 + 1.3), rz: -1.2 + Math.sin(t * 0.3 + 2.1), y: 6 * Math.sin(t * 0.6) };
  const tilt = outBack(seg(t, T.phone - 0.4, T.phone + 0.5));
  const enter = outExpo(seg(t, T.phone - 0.4, T.phone + 0.5));
  const exit = inOut(seg(t, T.card - 0.3, T.card + 0.3));
  const pose = {
    x: -205, y: lerp(700, -30, enter) + float.y + 900 * exit, s: lerp(0.8, 0.98, enter),
    rx: float.rx + lerp(55, 0, tilt), ry: float.ry + lerp(-25, 0, tilt), rz: float.rz + lerp(8, 0, tilt),
    o: t < T.phone - 0.4 ? 0 : 1 - exit,
  };

  // ── push in on the day strip, back out before the card ────────────────────
  const z = lerp(1, lerp(2.2, 1, inOut(seg(t, T.back, T.back + 0.4))), inOut(seg(t, T.push, T.push + 0.6)));
  const tx = Math.min(0, Math.max(400 - 400 * z, 200 - z * STRIP.x));
  const ty = Math.min(0, Math.max(860 - 860 * z, 430 - z * STRIP.y));

  // ── bars step up Today → Sunday, one at a time, and turn dark green ───────
  const barK = [0, 1, 2].map((i) => outBack(seg(t, T.step + 0.18 * i, T.step + 0.18 * i + 0.4)));
  const barO = win(t, T.step - 0.05, T.out, 0.1, 0.01);
  const hop = outExpo(seg(t, T.hop, T.hop + 0.45));
  const sel = { x: lerp(TODAY_COL.x, SUN_COL.x, hop) };
  const selO = win(t, T.step, T.back + 0.3, 0.3, 0.3);
  const sunGlow = win(t, T.hop + 0.3, T.back + 0.3, 0.3, 0.3) * (0.7 + 0.3 * Math.sin(Math.max(0, t - T.hop) * 9));

  // ── brand card ─────────────────────────────────────────────────────────────
  const slide = outExpo(seg(t, T.card, T.card + 0.6));
  const cardOut = inOut(seg(t, T.end - 0.4, T.end));

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/310248_large.mp4" from={0} to={T.phone + 1.0} startFrom={0} dark={0.45} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.phone + 0.2, T.end - 0.2, 0.8, 0.7) }} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.6} to={T.out} startFrom={4} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.1, T.phone - 0.1)}>Swell alerts</Eyebrow>
        <H1 size={124} style={{ marginTop: 26, ...rise(t, 0.25, T.phone - 0.1) }}>Let the swell</H1>
        <H1 size={124} style={{ ...rise(t, 0.4, T.phone - 0.1) }}>find <span style={{ color: C.acc }}>you.</span></H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.6, T.phone - 0.1) }}>Stop checking. Get told.</Sub>
      </div>

      <Phone pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <Screen src="captures/spot-pipeline.png" />
          {/* Today's bars grow to Sunday's height and go dark green */}
          {TODAY_X.map((x, i) => {
            const top = lerp(TODAY_TOP[i], SUN_TOP[i], barK[i]);
            return <div key={i} style={{ position: "absolute", left: x, top, width: BAR_W, height: BASE - top, borderRadius: 1.5, opacity: barO,
              background: barK[i] > 0.5 ? C.epic : i === 0 ? C.fair : C.good, boxShadow: barK[i] > 0.5 ? `0 0 ${6 * barK[i]}px rgba(36,177,97,.7)` : "none" }} />;
          })}
          {/* selection hops Today → Sun */}
          <div style={{ position: "absolute", left: sel.x - 2, top: TODAY_COL.y - 2, width: TODAY_COL.w + 4, height: TODAY_COL.h + 4, borderRadius: 12, border: `1.5px solid ${C.ink}`, opacity: selO }} />
          <div style={{ position: "absolute", left: SUN_COL.x, top: TODAY_TOP[0] - 6, width: SUN_COL.w, height: BASE - TODAY_TOP[0] + 10, borderRadius: 8, boxShadow: `0 0 16px ${C.good}`, opacity: sunGlow }} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.push + 0.2, T.hop - 0.05)}>The day strip</Eyebrow>
          <H1 size={68} style={{ marginTop: 18, ...rise(t, T.push + 0.3, T.hop - 0.05) }}>Swell building</H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.push + 0.45, T.hop - 0.05) }}>Watch the bars step up.</Sub>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: 420 }}>
          <Eyebrow style={rise(t, T.hop + 0.1, T.back + 0.2)}>Today → Sunday</Eyebrow>
          <H1 size={68} style={{ marginTop: 18, ...rise(t, T.hop + 0.2, T.back + 0.2) }}>Dark <span style={{ color: C.good }}>green.</span></H1>
          <Sub size={30} style={{ marginTop: 18, ...rise(t, T.hop + 0.4, T.back + 0.2) }}>16 days ahead, every spot.</Sub>
        </div>
      </div>

      {/* brand card slides in */}
      {t > T.card - 0.1 && t < T.end + 0.1 && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 200, width: B.w, padding: "64px 60px", boxSizing: "border-box", borderRadius: 48,
          background: "linear-gradient(150deg, #0b2a44 0%, #071a2c 60%, #04101c 100%)", boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 0 1.5px rgba(17,183,242,.35) inset`,
          opacity: (1 - cardOut) * seg(t, T.card, T.card + 0.2), transform: `translateX(${lerp(1100, 0, slide)}px) translateY(${-60 * cardOut}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 72, height: 72 }} />
            <Eyebrow>rosa · push alerts</Eyebrow>
          </div>
          <H1 size={112} style={{ marginTop: 40, ...rise(t, T.card + 0.3, T.end + 1) }}>Swell alert.</H1>
          <H1 size={88} style={{ marginTop: 14, color: C.acc, ...rise(t, T.card + 0.5, T.end + 1) }}>Straight to your phone.</H1>
          <Sub style={{ marginTop: 30, ...rise(t, T.card + 0.75, T.end + 1) }}>Free. No sign-in to check the surf.</Sub>
        </div>
      )}

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>Let the swell find you.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};

export default Film;
