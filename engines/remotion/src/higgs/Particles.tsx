import React from "react";
import { random } from "remotion";

/*
  Rosa loading-screen specks (rosa/web particles.ts, ported in films/film-2026-w44-13.tsx) for any frame
  width: specks rise off the bottom band, twinkle and fade as they climb, screen-blended. Pure function of t.
*/
const PS = 2.5;
const PALETTE = ["125, 185, 240", "94, 205, 205"];

const make = (w: number, band: number, ALPHA: number, dens: number) => {
  const n = Math.round(((w / PS) * (band / PS)) / 11000 * dens);
  const specks = Array.from({ length: n }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`sl${i}`)), off: random(`so${i}`) * 4 }));
  const speck = (i: number, k: number, age: number, life: number) => {
    const r = (s: string) => random(`s${s}${i}-${k}`);
    const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
    const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
    const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
    const x = r("x") * w + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
    const y = band + r("y") * 30 * PS - vy * age;
    const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
    const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
    const fadeIn = Math.min(1, (band - y) / (80 * PS)), fadeOut = Math.min(1, Math.max(0, y) / (band * 0.55));
    const a = (0.22 + depth * 0.7) * ALPHA * fadeIn * fadeOut * tw * env;
    return { x, y, depth, rad, bucket, a: Math.max(0, Math.min(1, a)), color: PALETTE[Math.floor(r("c") * PALETTE.length)] };
  };
  return { specks, speck };
};

/** alpha 0.3 is the app's splash; on the film's blue stage it needs more to read */
export const Particles: React.FC<{ t: number; o: number; w: number; band: number; alpha?: number; density?: number }> = ({ t, o, w, band, alpha = 0.3, density = 1.4 }) => {
  const { specks, speck } = React.useMemo(() => make(w, band, alpha, density), [w, band, alpha, density]);
  if (o <= 0) return null;
  const ps = specks.map(({ i, life, off }) => {
    const k = Math.floor((t + off) / life);
    return { i, ...speck(i, k, t + off - k * life, life) };
  }).filter((p) => p.a > 0.002).sort((a, b) => a.depth - b.depth);
  const dot = (p: (typeof ps)[number], rad: number, blur: number, a: number, key: string) => (
    <div key={key} style={{ position: "absolute", left: p.x - rad, top: p.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%",
      background: `rgb(${p.color})`, opacity: a, filter: blur ? `blur(${blur * PS}px)` : undefined }} />
  );
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: w, height: band, opacity: o, overflow: "hidden", pointerEvents: "none", mixBlendMode: "screen" }}>
      {ps.filter((p) => p.bucket === 0 && p.rad > 1.4 * PS).map((p) => dot(p, p.rad * 2.6, 8, p.a * 0.55, `g${p.i}`))}
      {ps.map((p) => dot(p, p.rad, p.bucket, p.a, `d${p.i}`))}
    </div>
  );
};
