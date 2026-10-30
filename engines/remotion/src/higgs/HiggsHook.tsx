import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { C, FORMAT_SAFE, Phone, SAFE, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "../lib";

/*
  higgs-hook (docs/HIGGS-HOOK.md): scene 1 clip + joke, hook card, real app recording in the phone,
  scene 5 clip + end card. Every time comes from spine/higgs.py `timeline()`; this file only places.
  Clips keep their own sound (s1Gain, s5Gain); music and voice are mixed in afterwards.
*/

type Span = [number, number];
export type HiggsProps = {
  variant: Variant; wide: boolean;
  timeline: { seconds: number; s1: Span; joke: Span; hook: Span; screens: Span; s5: Span; end: Span };
  s1: string; s5: string; screens: string; s1Gain: number; s5Gain: number;
  joke: string; hook: string; endLine: string; button: string; url: string; handle: string;
};

export const HIGGS_DEFAULTS: HiggsProps = {
  variant: "reel", wide: false,
  timeline: { seconds: 19, s1: [0, 5], joke: [2, 5], hook: [5, 7], screens: [7, 14], s5: [14, 19], end: [15.2, 19] },
  s1: "", s5: "", screens: "", s1Gain: 1, s5Gain: 0.35,
  joke: "Preparing for a fight?", hook: "Find every spot that's pumping right now",
  endLine: "Your next wave is on the map", button: "Open Rosa", url: "rosa.surf", handle: "@rosa_surf_forecast",
};

const box = (p: HiggsProps, w: number, h: number) => (p.wide ? FORMAT_SAFE(w, h) : SAFE[p.variant]);

const Clip: React.FC<{ src: string; span: Span; gain: number }> = ({ src, span, gain }) => {
  const { fps } = useVideoConfig();
  if (!src) return null;
  return (
    <Sequence from={Math.round(span[0] * fps)} durationInFrames={Math.round((span[1] - span[0]) * fps)}>
      <OffthreadVideo src={staticFile(src)} volume={gain} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Sequence>
  );
};

const Joke: React.FC<{ p: HiggsProps }> = ({ p }) => {
  const t = useT(); const { width, height } = useVideoConfig();
  const b = box(p, width, height);
  const [a, z] = p.timeline.joke;
  const pop = outBack(seg(t, a, a + 0.35));
  return (
    <div style={{ position: "absolute", left: b.x, width: b.w, top: b.y + 40, display: "flex", justifyContent: "center", opacity: win(t, a, z, 0.2, 0.2) }}>
      <div style={{ ...font, fontWeight: 800, fontSize: p.wide ? 72 : 76, lineHeight: 1.05, textAlign: "center", color: "#111",
        background: "#fff", padding: "18px 30px", borderRadius: 22, transform: `scale(${lerp(0.6, 1, pop)}) rotate(${lerp(-6, -2, pop)}deg)`,
        boxShadow: "0 18px 50px rgba(0,0,0,.45)", maxWidth: b.w }}>{p.joke}</div>
    </div>
  );
};

const Hook: React.FC<{ p: HiggsProps }> = ({ p }) => {
  const t = useT(); const { width, height } = useVideoConfig();
  const b = box(p, width, height);
  const [a, z] = p.timeline.hook;
  if (t < a || t > z + 0.4) return null;
  const words = p.hook.split(" ");
  return (
    <AbsoluteFill style={{ background: C.page, opacity: win(t, a, z + 0.4, 0.15, 0.4) }}>
      <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, display: "flex", flexWrap: "wrap",
        alignContent: "center", justifyContent: "center", gap: "0 22px" }}>
        {words.map((w, i) => {
          const at = a + 0.08 * i;
          return <span key={i} style={{ ...font, fontWeight: 800, fontSize: p.wide ? 104 : 112, lineHeight: 1.04, letterSpacing: "-.03em",
            color: i === words.length - 1 ? C.acc : C.ink, ...rise(t, at, z + 0.4, 50, 0.45, 0.01) }}>{w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

const Screens: React.FC<{ p: HiggsProps }> = ({ p }) => {
  const t = useT(); const { fps, width, height } = useVideoConfig();
  const [a, z] = p.timeline.screens;
  if (t < a - 0.1 || t > z + 0.1) return null;
  const k = outExpo(seg(t, a, a + 0.7));
  const cx = width / 2, cy = p.wide ? height / 2 : SAFE[p.variant].y + SAFE[p.variant].h / 2;
  const s = p.wide ? 0.95 : 1.05;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #0f2a3a, ${C.page} 70%)` }}>
      <Phone cx={cx} cy={cy} pose={{ x: 0, y: lerp(260, 0, k), s: s * lerp(0.9, 1, k), rx: lerp(18, 4, k), ry: lerp(-14, -3, inOut(seg(t, a, z))), rz: 0, o: 1 }}>
        {p.screens ? (
          <Sequence from={Math.round(a * fps)} durationInFrames={Math.round((z - a) * fps)} layout="none">
            <OffthreadVideo src={staticFile(p.screens)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        ) : null}
      </Phone>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ p: HiggsProps }> = ({ p }) => {
  const t = useT(); const { width, height } = useVideoConfig();
  const b = box(p, width, height);
  const [a, z] = p.timeline.end;
  if (t < a) return null;
  const logo = outBack(seg(t, a, a + 0.5));
  const btn = outBack(seg(t, a + 0.7, a + 1.1));
  const pulse = 1 + 0.04 * Math.sin((t - a) * 6) * seg(t, a + 1.1, a + 1.4);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(0,0,0,${0.75 * seg(t, a, a + 0.4)}) 60%)` }}>
      <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-end", gap: 26, paddingBottom: 10 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 150, height: 150, borderRadius: 34,
          transform: `scale(${logo}) rotate(${lerp(-25, 0, logo)}deg)`, boxShadow: "0 20px 60px rgba(3,42,250,.5)" }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 72, lineHeight: 1.05, textAlign: "center", ...rise(t, a + 0.25, z + 1, 40, 0.5, 0.01) }}>{p.endLine}</div>
        <div style={{ ...font, fontWeight: 600, fontSize: 46, color: C.ink, ...rise(t, a + 0.45, z + 1, 30, 0.5, 0.01) }}>
          {p.url} <span style={{ color: C.muted }}>·</span> {p.handle}
        </div>
        <div style={{ ...font, fontWeight: 800, fontSize: 50, color: "#fff", background: "#032afa", padding: "20px 54px", borderRadius: 999,
          transform: `scale(${btn * pulse})`, boxShadow: "0 14px 40px rgba(3,42,250,.55)" }}>{p.button}</div>
      </div>
    </AbsoluteFill>
  );
};

export const HiggsHook: React.FC<HiggsProps> = (p) => {
  useInter();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Clip src={p.s1} span={p.timeline.s1} gain={p.s1Gain} />
      <Joke p={p} />
      <Hook p={p} />
      <Screens p={p} />
      <Clip src={p.s5} span={p.timeline.s5} gain={p.s5Gain} />
      <EndCard p={p} />
    </AbsoluteFill>
  );
};
