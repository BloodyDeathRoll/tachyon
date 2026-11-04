import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, random, staticFile, useVideoConfig } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";

/*
  Sunday swell teaser, 15 s, light theme. Motion language: a feature-teaser piece (black void, a
  single light source pulses like a heartbeat, a UI element slams in oversized, the product flips in
  behind it, data builds in hard beats with strobe cuts between, light streaks and sparks, a
  white flash into the reveal). Here: a blue glow beats twice on black, a huge push notification
  "Next week's swell is coming" drops in, the phone flips in behind with spot-supertubos.png and its
  day bars fill one day at a time, a wave clip strobes between each day. End card: logo, white
  "Next swell? You'll know.", space, glowing blue "Follow for the swell", rosa.surf →.
  Bars in screen px (1170×2532 capture → 400×866): y 147..183, columns from x 17, pitch 57.6.
*/

export const SECONDS = 15;
const T = { beat1: 0.25, beat2: 0.75, notif: 1.5, flip: 2.6, bars: 3.6, step: 0.62, end: 8.4, out: 15 };
const DAYS = 7;
const CLIPS = ["footage/310248_large.mp4", "footage/218670_large.mp4", "footage/283533_large.mp4", "footage/1306-145340152_medium.mp4"];
const BAR = { top: 145, h: 40, x: 15, pitch: 57.6, w: 50 };
const MASK = "#f9f9fa";   // the capture's light background behind the bars

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const { fps } = useVideoConfig();
  const B = SAFE[variant];
  const cx = 540;

  // ── heartbeat glow: two thumps on black, then it keeps a slow pulse behind the phone ──
  const thump = (a: number) => Math.exp(-Math.pow((t - a) / 0.09, 2)) + 0.6 * Math.exp(-Math.pow((t - a - 0.22) / 0.08, 2));
  const glow = Math.min(1, thump(T.beat1) + thump(T.beat2) + (t > T.notif ? 0.35 + 0.15 * Math.sin(t * 6) : 0.08));

  // ── notification: drops in huge, then shrinks to the top of the box when the phone arrives ──
  const nIn = outBack(seg(t, T.notif, T.notif + 0.5));
  const nUp = inOut(seg(t, T.flip, T.flip + 0.5));
  const nOut = inOut(seg(t, T.end - 0.4, T.end - 0.1));
  const nW = lerp(B.w, B.w - 80, nUp);
  const nTop = lerp(B.y + 260, B.y + 10, nUp) + lerp(-700, 0, nIn);
  const nScale = lerp(0.85, 1, outExpo(seg(t, T.notif, T.notif + 0.6))) * (1 - 0.15 * nOut);

  // ── phone: flips in behind the notification, floats, bounces on every day ──
  const flip = outExpo(seg(t, T.flip, T.flip + 0.9));
  const day = (i: number) => T.bars + i * T.step;
  const bump = Array.from({ length: DAYS }, (_, i) => 0.035 * Math.sin(Math.PI * seg(t, day(i), day(i) + 0.22))).reduce((a, b) => a + b, 0);
  const phS = 0.78, phCy = B.y + B.h - (880 * phS) / 2 - 6;
  const zoom = Math.pow(seg(t, T.end - 0.5, T.end), 3);
  const pose: Pose = {
    x: 0,
    y: lerp(160, 0, flip) + 6 * Math.sin(t * 1.3),
    s: (lerp(0.5, phS, flip) + bump) * lerp(1, 6, zoom),
    rx: lerp(25, 4 * Math.sin(t * 0.8), flip),
    ry: lerp(-180, 10 * Math.sin(t * 0.6 + 0.4), flip),
    rz: lerp(-12, 1.5 * Math.sin(t * 0.5), flip),
    o: t < T.flip ? 0 : 1 - seg(t, T.end - 0.15, T.end),
  };

  // ── bars fill day by day; a mask over each column drops away ──
  const masks = Array.from({ length: DAYS }, (_, i) => {
    const k = outBack(seg(t, day(i) + 0.12, day(i) + 0.45));
    return <div key={i} style={{ position: "absolute", left: BAR.x + i * BAR.pitch, top: BAR.top, width: BAR.w, height: Math.max(0, BAR.h * (1 - k)), background: MASK }} />;
  });
  const lit = Array.from({ length: DAYS }, (_, i) => {
    const h = Math.sin(Math.PI * seg(t, day(i) + 0.1, day(i) + 0.6));
    return h > 0 && <div key={i} style={{ position: "absolute", left: BAR.x + i * BAR.pitch - 4, top: BAR.top - 6, width: BAR.w + 8, height: BAR.h + 12, borderRadius: 10,
      boxShadow: `0 0 0 3px rgba(17,183,242,${h}), 0 0 ${30 * h}px rgba(17,183,242,${0.8 * h})` }} />;
  });

  // ── strobe: a wave clip flashes full frame just before each day lands ──
  const strobeAt = Array.from({ length: DAYS }, (_, i) => day(i) - 0.16);
  const si = strobeAt.findIndex((a) => t >= a && t < a + 0.16);
  const strobe = si >= 0 && (
    <AbsoluteFill style={{ opacity: 1 - 0.4 * seg(t, strobeAt[si] + 0.08, strobeAt[si] + 0.16) }}>
      <OffthreadVideo src={staticFile(CLIPS[si % CLIPS.length])} muted startFrom={Math.round((2 + 2 * Math.floor(si / CLIPS.length)) * fps)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.25 - 0.4 * seg(t, strobeAt[si], strobeAt[si] + 0.16)})`, filter: "saturate(1.3) contrast(1.15)" }} />
      <AbsoluteFill style={{ background: "rgba(3,42,250,.28)", mixBlendMode: "multiply" }} />
    </AbsoluteFill>
  );

  // ── sparks rise past the phone while the week builds; light streaks sweep on the flip ──
  const sparks = t > T.flip && t < T.end && Array.from({ length: 34 }, (_, i) => {
    const sp = 120 + 260 * random(`v${i}`), p = ((t - T.flip) * sp + 1920 * random(`y${i}`)) % 1920;
    const s = 4 + 8 * random(`s${i}`);
    return <div key={i} style={{ position: "absolute", left: 1080 * random(`x${i}`), top: 1920 - p, width: s, height: s, borderRadius: s, background: i % 3 ? C.acc : "#fff",
      opacity: 0.25 + 0.5 * random(`o${i}`), boxShadow: `0 0 ${3 * s}px ${C.acc}` }} />;
  });
  const streak = (a: number, y: number, rot: number) => {
    const p = seg(t, a, a + 0.45);
    return p > 0 && p < 1 && <div style={{ position: "absolute", left: lerp(-900, 1300, inOut(p)), top: y, width: 700, height: 10, borderRadius: 10, transform: `rotate(${rot}deg)`,
      background: `linear-gradient(90deg, transparent, ${C.acc}, #fff, transparent)`, boxShadow: `0 0 40px ${C.acc}` }} />;
  };

  const flash = Math.min(seg(t, T.end - 0.2, T.end), 1 - seg(t, T.end, T.end + 0.3));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ── the heartbeat: one blue light in the void ── */}
      {t < T.end && (
        <AbsoluteFill style={{ background: `radial-gradient(${lerp(260, 900, glow)}px ${lerp(260, 900, glow)}px at 50% ${((t < T.flip ? 960 : phCy) / 1920) * 100}%, rgba(17,183,242,${0.85 * glow}) 0%, rgba(3,42,250,${0.35 * glow}) 40%, rgba(0,0,0,0) 75%)` }} />
      )}
      {t < T.notif && (
        <div style={{ position: "absolute", left: cx - 22, top: 960 - 22, width: 44, height: 44, borderRadius: 44, background: "#fff", opacity: 0.2 + 0.8 * Math.min(1, thump(T.beat1) + thump(T.beat2)),
          transform: `scale(${1 + 0.8 * Math.min(1, thump(T.beat1) + thump(T.beat2))})`, boxShadow: `0 0 80px 30px ${C.acc}` }} />
      )}
      {sparks}
      {streak(T.flip, phCy - 300, -14)}
      {streak(T.flip + 0.12, phCy + 200, -14)}

      {/* ── the phone, light theme, bars filling ── */}
      {t < T.end && (
        <Phone pose={pose} cx={cx} cy={phCy} glow={0.45}>
          <Screen src="captures-light/spot-supertubos.png" />
          {masks}
          {lit}
        </Phone>
      )}

      {strobe}

      {/* ── the push notification, oversized ── */}
      {t >= T.notif && t < T.end && (
        <div style={{ position: "absolute", left: cx - nW / 2, top: nTop, width: nW, transform: `scale(${nScale})`, opacity: 1 - nOut,
          display: "flex", alignItems: "center", gap: 30, padding: "30px 36px", borderRadius: 48, boxSizing: "border-box",
          background: "rgba(248,248,250,.94)", boxShadow: `0 30px 90px rgba(0,0,0,.6), 0 0 ${50 + 30 * glow}px rgba(17,183,242,${0.5 + 0.3 * glow})` }}>
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 120, height: 120, borderRadius: 28, flexShrink: 0 }} />
          <div style={{ ...font, color: "#0d1225", fontWeight: 800, fontSize: lerp(64, 52, nUp), lineHeight: 1.05, letterSpacing: "-.03em" }}>
            Next week's swell is coming<span style={{ color: C.acc }}>.</span>
          </div>
        </div>
      )}

      {/* ── end card ── */}
      <Footage src="footage/218670_large.mp4" from={T.end} to={T.out} startFrom={4} dark={0.55} zoom={0.1} fadeIn={0.05} />
      {t >= T.end && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 110, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <H1 size={96} style={{ marginTop: 56, color: "#fff", opacity: seg(t, T.end + 0.3, T.end + 0.4), transform: `scale(${lerp(1.6, 1, outExpo(seg(t, T.end + 0.3, T.end + 0.6)))})` }}>
              Next swell?<br />You'll know<span style={{ color: C.acc }}>.</span>
            </H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 56px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 56, marginTop: 110,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.9, T.end + 1.05), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.9, T.end + 1.25)))})` }}>Follow for the swell</div>
            <div style={{ ...font, color: "#fff", fontWeight: 700, fontSize: 44, marginTop: 40, opacity: seg(t, T.end + 1.3, T.end + 1.6) }}>rosa.surf →</div>
          </div>
        </>
      )}

      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

export default Film;
