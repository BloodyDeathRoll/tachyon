import React, { useEffect, useState } from "react";
import { AbsoluteFill, Easing, OffthreadVideo, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type Variant = "reel" | "story";

// ── safe box (tools/safezone.py box) ───────────────────────────────────────
export const SAFE = {
  reel: { x: 65, y: 285, w: 950, h: 963 },
  story: { x: 65, y: 269, w: 950, h: 979 },
};

// ── palette (clients/rosa/brand.md) ─────────────────────────────────────────
export const C = {
  ink: "#f5f0e8", muted: "#9aa3b2", acc: "#11b7f2", epic: "#0c6733", good: "#24b161", fair: "#11b7f2",
  wind: "#e48022", bad: "#d0574a", page: "#060607",
};

// ── time helpers: everything in seconds ───────────────────────────────────────
// A film is authored in "story time". TimeMap maps real seconds → story seconds, so a cut can be
// compressed or sped up without re-timing every beat (piecewise-linear knots, real → story).
export type Knots = [number, number][];
export const TimeMap = React.createContext<Knots | null>(null);
export const remap = (x: number, k: Knots | null) => {
  if (!k || k.length < 2) return x;
  for (let i = 1; i < k.length; i++) if (x <= k[i][0] || i === k.length - 1) {
    const [a0, b0] = k[i - 1], [a1, b1] = k[i];
    return b0 + (b1 - b0) * (x - a0) / (a1 - a0);
  }
  return x;
};
export const useT = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return remap(f / fps, React.useContext(TimeMap));
};
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const outExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const inOut = Easing.inOut(Easing.cubic);
export const outBack = Easing.out(Easing.back(1.6));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 1 between a..b with an exponential enter over fi and a smooth exit over fo */
export const win = (t: number, a: number, b: number, fi = 0.4, fo = 0.3) =>
  t < a || t > b ? 0 : Math.min(outExpo(seg(t, a, a + fi)), 1 - inOut(seg(t, b - fo, b)));

// ── fonts: Inter variable from public/fonts ─────────────────────────────────
export const useInter = () => {
  const [h] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const face = new FontFace("Inter", `url(${staticFile("fonts/inter-latin-wght-normal.woff2")}) format("woff2")`, { weight: "100 900" });
    face.load().then((f) => { (document as any).fonts.add(f); continueRender(h); }).catch(() => continueRender(h));
  }, [h]);
};

export const font: React.CSSProperties = { fontFamily: "Inter, system-ui, sans-serif", fontFeatureSettings: '"tnum" 1', color: C.ink };

// ── footage: a Pixabay clip covering the frame, darkened, with a slow push ──
export const Footage: React.FC<{ src: string; from: number; to: number; startFrom?: number; dark?: number; zoom?: number; fadeIn?: number; fadeOut?: number }> =
  ({ src, from, to, startFrom = 0, dark = 0.55, zoom = 0.08, fadeIn = 0.6, fadeOut = 0.6 }) => {
    const t = useT(); const { fps } = useVideoConfig();
    if (t < from - 0.05 || t > to + 0.05) return null;
    const o = win(t, from, to, fadeIn, fadeOut);
    const k = seg(t, from, to);
    return (
      <AbsoluteFill style={{ opacity: o }}>
        <OffthreadVideo src={staticFile(src)} muted startFrom={Math.round(startFrom * fps)}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1 + zoom * k})` }} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,${dark + 0.15}) 0%, rgba(0,0,0,${dark}) 45%, rgba(0,0,0,${dark + 0.3}) 100%)` }} />
      </AbsoluteFill>
    );
  };

// ── the phone: a 3D-floating device with a screen stack ─────────────────────
export type Pose = { x: number; y: number; s: number; rx: number; ry: number; rz: number; o: number };
export const Phone: React.FC<{ pose: Pose; children: React.ReactNode; glow?: number }> = ({ pose, children, glow = 0.14 }) => {
  const W = 420, H = 880;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, perspective: 2400, perspectiveOrigin: "540px 760px", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", left: 540 - W / 2, top: 760 - H / 2, width: W, height: H, borderRadius: 64,
        background: "linear-gradient(145deg,#1b2230,#05070c 40%,#0d1320 70%,#20283a)",
        boxShadow: `0 60px 140px rgba(0,0,0,.75), 0 0 0 1.5px #2a3345 inset, 0 0 120px rgba(17,183,242,${glow})`,
        opacity: pose.o, transformStyle: "preserve-3d",
        transform: `translate(${pose.x}px, ${pose.y}px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) rotateZ(${pose.rz}deg) scale(${pose.s})`,
      }}>
        <div style={{ position: "absolute", left: 10, top: 10, right: 10, bottom: 10, borderRadius: 54, overflow: "hidden", background: "#000" }}>
          {children}
        </div>
        <div style={{ position: "absolute", left: "50%", top: 18, width: 120, height: 34, marginLeft: -60, borderRadius: 20, background: "#000", zIndex: 3 }} />
        {/* edge highlight */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 64, boxShadow: "0 0 0 1px rgba(255,255,255,.08) inset", pointerEvents: "none" }} />
      </div>
    </div>
  );
};

/** a capture (1170×2532 → 400 wide) placed in the screen; `scroll` in screen px; `o` opacity */
export const Screen: React.FC<{ src: string; scroll?: number; o?: number; x?: number }> = ({ src, scroll = 0, o = 1, x = 0 }) => (
  <img src={staticFile(src)} style={{ position: "absolute", left: x, top: 0, width: 400, opacity: o, transform: `translateY(${-scroll}px)`, display: "block" }} />
);

// ── type ─────────────────────────────────────────────────────────────────────
/** Small-caps labels are gone (decision 16: no on-screen text under 34 px at 1080 wide).
 *  Kept as a no-op so older films still compile; use Sub/H1 for anything worth saying. */
export const Eyebrow: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = () => null;
/** smallest on-screen type allowed at 1080×1920 */
export const MIN_TYPE = 38;
export const H1: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 128, style }) => (
  <div style={{ ...font, fontWeight: 800, fontSize: size, lineHeight: 0.98, letterSpacing: "-.035em", ...style }}>{children}</div>
);
export const Sub: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 38, style }) => (
  <div style={{ ...font, fontWeight: 500, fontSize: Math.max(size, MIN_TYPE), lineHeight: 1.25, color: C.muted, ...style }}>{children}</div>
);
export const Pill: React.FC<{ children: React.ReactNode; bg: string; fg?: string; size?: number }> = ({ children, bg, fg = "#fff", size = 34 }) => (
  <span style={{ ...font, display: "inline-block", padding: "10px 22px", borderRadius: 999, fontWeight: 800, fontSize: size, background: bg, color: fg }}>{children}</span>
);

/** rise-in: opacity + translateY from an exponential enter at time a, exit at b */
export const rise = (t: number, a: number, b: number, dy = 40, fi = 0.6, fo = 0.3): React.CSSProperties => {
  const e = outExpo(seg(t, a, a + fi));
  const o = win(t, a, b, fi, fo);
  const out = inOut(seg(t, b - fo, b));
  return { opacity: o, transform: `translateY(${lerp(dy, 0, e) - 50 * out}px)` };
};

/** numbers that count up once */
export const countUp = (t: number, a: number, b: number, to: number) => Math.round(lerp(0, to, outExpo(seg(t, a, b))));

export const SafeDebug: React.FC<{ variant: Variant }> = ({ variant }) => {
  const b = SAFE[variant];
  return <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, border: "2px dashed rgba(0,255,120,.5)" }} />;
};

/** no on-screen footage credit (decision 16); Pixabay licence needs none, the caption carries attribution */
export const Credit: React.FC<{ t: number; from: number }> = () => null;
