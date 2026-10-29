import React from "react";
import { AbsoluteFill, Composition, OffthreadVideo, Sequence, registerRoot, staticFile } from "remotion";
import { C, H1, Phone, SAFE, Screen, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";
import { Particles } from "../films/film-2026-w44-13";

/*
  One-off "That face when it says Epic" (2026-10-28). cut2 (Higgsfield, the old surfer staring at his phone,
  coffee spilling) with "That face when…", hard cut to black, the phone pops up centred and large on
  captures/spot-uluwatu.png, the camera pushes into the score card (Size / Period / Wind) and then the
  06:00 BEST SESSION row; then the promo_mobile wave end card (public/oneoff/wave.mp4, silent).
  VO (Gemini TTS) is mixed outside, starting at 5.3 s; the freeze + fade to black is the ffmpeg pass.
*/

const FPS = 30;
const CUT2 = 5.04;
// VO words (absolute, one Gemini TTS take: gemini-3.1-flash-tts-preview, voice Sadachbia): "Epic" 7.42, "It scores" 8.68,
// "size" 10.20, "period" 11.02, "wind" 11.62, "exactly" 12.62, "go" 13.68
const T = { pop: CUT2 + 0.05, land: CUT2 + 1.05, epic: 7.36, pushA: 8.66, size: 10.1, period: 10.92, wind: 11.52, pushB: 11.9, go: 13.58, out: 14.9, wave: 15.2 };
const WAVE = 2.65;   // wave.mp4 up to its own fade
export const SECONDS = T.wave + WAVE;

// capture coordinates at the 400 px screen width (spot-uluwatu.png, 1170×2532 → 400×866)
const S0 = 1.8, S1 = 2.6;
const CARD = { x: 16, y: 230, w: 368, h: 146, cy: 302 };
const PILL = { x: 31, y: 244, w: 53, h: 27 };
const ROW = { x: 0, y: 645, w: 400, h: 78, cy: 684 };
/** camera offset that puts screen y `sy` at the frame centre at scale s (phone centred at 540, 960) */
const aim = (s: number, sy: number) => -s * (sy - 430);

const Ring: React.FC<{ b: { x: number; y: number; w: number; h: number }; o: number; r?: number; pulse?: number }> = ({ b, o, r = 18, pulse = 0 }) => (
  <div style={{ position: "absolute", left: b.x - 4, top: b.y - 4, width: b.w + 8, height: b.h + 8, borderRadius: r, opacity: o,
    border: `2px solid ${C.acc}`, boxShadow: `0 0 ${18 + 14 * pulse}px rgba(17,183,242,${0.55 + 0.3 * pulse}), inset 0 0 14px rgba(17,183,242,.25)` }} />
);

const Epic: React.FC = () => {
  useInter();
  const t = useT();
  const B = SAFE.reel;

  const k = outExpo(seg(t, T.pop, T.land));
  const pop = outBack(seg(t, T.pop, T.land));
  const a = inOut(seg(t, T.pushA, T.pushA + 0.6));
  const b = inOut(seg(t, T.pushB, T.pushB + 0.6));
  const s = lerp(lerp(lerp(0.3, S0, pop), S1, a), S1, b);
  const y = lerp(lerp(0, aim(S1, CARD.cy), a), aim(S1, ROW.cy), b);
  const float = { ry: 4 * Math.sin(t * 0.8 + 0.4), rx: 2 * Math.sin(t * 0.6 + 1.1), y: 6 * Math.sin(t * 0.9) };
  const settle = 1 - a;   // the float calms down once the camera pushes in
  const pose = {
    x: 0, y: lerp(800, 0, k) + y + float.y * settle,
    s, rx: lerp(28, 0, k) + float.rx * settle, ry: lerp(-40, 0, k) + float.ry * settle, rz: lerp(-10, 0, k),
    o: t < T.pop ? 0 : Math.min(1, seg(t, T.pop, T.pop + 0.15)) * (1 - inOut(seg(t, T.out, T.wave))),
  };
  const beat = (at: number) => Math.max(0, Math.sin(Math.PI * seg(t, at, at + 0.5)));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ── cut2: the face ── */}
      <Sequence durationInFrames={Math.round(CUT2 * FPS)}>
        <AbsoluteFill><OffthreadVideo src={staticFile("oneoff/cut2.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 32%)" }} />
        <div style={{ position: "absolute", left: B.x, top: B.y + 40, width: B.w }}>
          <H1 size={130} style={{ textShadow: "0 8px 40px rgba(0,0,0,.5)", ...rise(t, 0.3, CUT2 + 0.2, 50) }}>That face</H1>
          <H1 size={130} style={{ color: C.acc, textShadow: "0 8px 40px rgba(0,0,0,.5)", ...rise(t, 0.55, CUT2 + 0.2, 50) }}>when…</H1>
        </div>
      </Sequence>

      {/* ── the app, centred and large ── */}
      {t >= T.pop && t < T.wave + 0.05 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(900px 1200px at 50% 50%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.pop, T.wave, 0.6, 0.3) }} />
          {/* Rosa loading-screen particles: rise off the bottom, fade as they climb */}
          <Particles t={t} o={win(t, T.pop, T.wave, 0.6, 0.3)} />
          <Phone pose={pose} cx={540} cy={960} glow={0.22}>
            <Screen src="captures/spot-uluwatu.png" />
            <Ring b={PILL} r={16} o={win(t, T.epic - 0.1, T.pushB, 0.25, 0.3)} pulse={beat(T.epic)} />
            <Ring b={CARD} r={22} o={win(t, T.pushA + 0.4, T.pushB + 0.2, 0.4, 0.3)} pulse={beat(T.size) + beat(T.period) + beat(T.wind)} />
            <Ring b={ROW} r={14} o={win(t, T.pushB + 0.4, T.out, 0.4, 0.3)} pulse={beat(T.go)} />
          </Phone>
          {/* copy band at the top of the safe box */}
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.88) 25%, rgba(0,0,0,0) 37%)", opacity: win(t, T.pushA, T.wave, 0.5, 0.3) }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, display: "flex", gap: 34 }}>
            <H1 size={104} style={rise(t, T.size, T.pushB + 0.1, 40)}>Size.</H1>
            <H1 size={104} style={rise(t, T.period, T.pushB + 0.1, 40)}>Period.</H1>
            <H1 size={104} style={rise(t, T.wind, T.pushB + 0.1, 40)}>Wind.</H1>
          </div>
          <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w }}>
            <H1 size={150} style={rise(t, T.go, T.out + 0.3, 50)}><span style={{ color: C.good }}>Epic</span> = go.</H1>
          </div>
        </>
      )}

      {/* ── wave end card (silent) ── */}
      <Sequence from={Math.round(T.wave * FPS)}>
        <AbsoluteFill><OffthreadVideo src={staticFile("oneoff/wave.mp4")} muted /></AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <Composition id="Epic" component={Epic} durationInFrames={Math.round(SECONDS * FPS)} fps={FPS} width={1080} height={1920} />
));
