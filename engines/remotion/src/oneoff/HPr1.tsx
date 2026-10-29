import React from "react";
import { AbsoluteFill, Composition, OffthreadVideo, Sequence, registerRoot, staticFile } from "remotion";
import { C, H1, Phone, SAFE, Screen, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";
import { Particles } from "../films/film-2026-w44-13";
import { MARKD } from "./mark";

/*
  One-off tail for the Higgsfield promo h_pr_1 (2026-10-28), after the projected-logo shot:
  black, the phone pops up in 3D and grows to almost fill the frame, fades back, the copy rises in over the
  Rosa loading-screen particles; then the promo_mobile wave end card (public/oneoff/wave.mp4 = promo 27-30 s).
  Before the wave's own fade, a rebuilt copy of its logo + button takes over and stays, static, while the wave
  dissolves into cut3 (old man, "how do you spell Rosa?"). VO is mixed outside.
*/

const FPS = 30;
// copy beats sit on the VO words (one take, voice starts at 1.0, ends 4.85 before the wave): "16 days" 2.04,
// "of forecast" 2.68, "totally" 4.07, "free" 4.31
const T = { pop: 0.25, land: 1.45, back: 1.75, days: 1.94, forecast: 2.58, totally: 3.97, free: 4.21, out: 5.0, wave: 5.4 };
const W = { take: T.wave + 1.9, x0: T.wave + 2.0, x1: T.wave + 2.6 };
const CUT3 = 6.08;
export const SECONDS = W.x0 + CUT3;

// the wave's end-card layout in 9:16 (showreel-v14/reel13.html portrait set(): mark top 700, word top 676, cta top 990)

const MK = { x: 190, y: 700, w: 170.3, h: 184.4 }, WD = { x: 396, y: 676, ls: "-.057em" };
const EndCard: React.FC = () => (
  <>
    {/* absolute coords fitted to the baked frame (wave.mp4 at 1.9 s) so the hand-over has no ghosting */}
    <svg viewBox="0 0 762.6 828.1" width={MK.w} height={MK.h} preserveAspectRatio="none" style={{ position: "absolute", left: MK.x, top: MK.y, color: C.acc }}><path fill="currentColor" d={MARKD} /></svg>
    <div style={{ position: "absolute", left: WD.x, top: WD.y }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 228, letterSpacing: WD.ls, fontFeatureSettings: "\"ss01\" 1, \"cv01\" 1", lineHeight: 1, whiteSpace: "nowrap", color: C.ink,
        textShadow: "0 12px 60px rgba(0,0,0,.35)" }}>rosa<span style={{ color: C.acc }}>.</span></div>
    </div>
    <div style={{ position: "absolute", left: 0, top: 990, width: 1080, textAlign: "center" }}>
      <span style={{ fontFamily: "Inter, sans-serif", display: "inline-flex", alignItems: "center", gap: 18, height: 96, padding: "0 62px", borderRadius: 48,
        background: C.acc, color: "#021018", fontSize: 38, fontWeight: 800, letterSpacing: "-.02em",
        boxShadow: "0 18px 60px rgba(17,183,242,.55), 0 0 0 1.5px rgba(255,255,255,.4) inset" }}>
        Check the surf
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </div>
  </>
);

const Tail: React.FC = () => {
  useInter();
  const t = useT();
  const B = SAFE.reel;

  const k = outExpo(seg(t, T.pop, T.land));
  const pop = outBack(seg(t, T.pop, T.land));
  const back = inOut(seg(t, T.back, T.back + 0.7));
  const fade = inOut(seg(t, T.out, T.wave));
  const float = { ry: 6 * Math.sin(t * 0.8 + 0.4), rx: 3 * Math.sin(t * 0.6 + 1.1), y: 8 * Math.sin(t * 0.9) };
  const pose = {
    x: 0, y: lerp(700, 0, k) + float.y + 60 * back,
    s: lerp(0.3, 1.82, pop) - 0.25 * back,
    rx: lerp(28, 0, k) + float.rx, ry: lerp(-40, 0, k) + float.ry, rz: lerp(-10, 0, k),
    o: t < T.pop ? 0 : Math.min(1, seg(t, T.pop, T.pop + 0.2)) * lerp(1, 0.2, back) * (1 - fade),
  };

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ── app + copy ── */}
      {t < T.wave + 0.1 && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(900px 1200px at 50% 45%, #07203a 0%, #03101f 50%, #000 100%)",
            opacity: win(t, T.pop, T.wave, 0.8, 0.4) * lerp(1, 0.5, back) }} />
          <AbsoluteFill style={{ background: "radial-gradient(1400px 500px at 30% 100%, rgba(3,42,250,.45) 0%, rgba(17,183,242,.12) 45%, transparent 75%)",
            opacity: win(t, T.days, T.wave, 1.0, 0.4) }} />
          <Particles t={t} o={win(t, T.back, T.wave, 0.8, 0.4)} />
          <div style={{ position: "absolute", inset: 0, filter: `blur(${6 * back}px)` }}>
            <Phone pose={pose} cx={540} cy={960} glow={0.22}>
              <Screen src="captures/home.png" />
              {/* status-bar band hides the capture's "Spot look wrong?" toast */}
              <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 62, background: "#000" }} />
            </Phone>
          </div>
          <div style={{ position: "absolute", left: B.x, top: B.y + 220, width: B.w, opacity: 1 - fade }}>
            <H1 size={190} style={{ color: C.acc, ...rise(t, T.days, T.wave + 1, 70) }}>16 days</H1>
            <H1 size={128} style={{ marginTop: 10, ...rise(t, T.forecast, T.wave + 1, 70) }}>of forecast.</H1>
            <H1 size={128} style={{ marginTop: 70, ...rise(t, T.totally, T.wave + 1, 70) }}>Totally</H1>
            <H1 size={190} style={{ color: C.acc, ...rise(t, T.free, T.wave + 1, 70) }}>free.</H1>
          </div>
        </>
      )}

      {/* ── wave end card, then cut3 dissolving in under the carried logo ── */}
      <Sequence from={Math.round(T.wave * FPS)} durationInFrames={Math.round((W.x1 - T.wave + 0.1) * FPS)}>
        <AbsoluteFill><OffthreadVideo src={staticFile("oneoff/wave.mp4")} muted /></AbsoluteFill>
      </Sequence>
      <Sequence from={Math.round(W.x0 * FPS)}>
        <AbsoluteFill style={{ opacity: inOut(seg(t, W.x0, W.x1)) }}>
          <OffthreadVideo src={staticFile("oneoff/cut3.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      </Sequence>
      {t >= W.take && (
        <AbsoluteFill><EndCard /></AbsoluteFill>
      )}

      {/* the fade to black happens in the final ffmpeg pass, over a 1 s freeze of the last frame */}
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <Composition id="HPr1Tail" component={Tail} durationInFrames={Math.round(SECONDS * FPS)} fps={FPS} width={1080} height={1920} />
));
