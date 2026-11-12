import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, random, staticFile, useVideoConfig } from "remotion";
import { C, H1, Phone, Pose, SAFE, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";
import { LAND, SPOTS } from "./globe-data";
import { Particles } from "./Particles";

/*
  higgs-hook film, one template for every script (docs/HIGGS-HOOK.md); built on "Samurai paddle-out" (2026-11-09).
  Per script (props from spine/higgs.py): the two Higgsfield clips, their lengths, the joke's two lines and the
  lockup moment in scene 5. Everything between the clips is the same in every film. Shot list:
  1 Higgsfield scene 1, the joke on top from 2 s: two lines, left-aligned, line 2 blue.
  2 Straight into the phone: the particle stream flows to the pin on the coast, half of it pours into the
    phone, the real home screen (light theme, recorded) with "Location is everything." on one line above (script.json app_line overrides it).
  4 The phone spins once into a spot page (w45-10), "16 days forecast." then "No ads, no paywall.";
    the stream flows past it to the pin on the coast.
  5 The showreel globe (real land points, Rosa's spots lighting up in the order they were added),
    "+4,500 spots and growing." (Rosa origin/main counts 4,558 on 2026-11-12).
  6 As the globe shrinks away the app icon zooms in, centre screen, and stays on top of Higgsfield scene 5.
    At the clip's key moment (`lock` s into scene 5, per format) the icon rises to the line between the top and
    middle thirds and rosa.surf + "Find my wave" come in under it, clear of the action.
  16:9 (same timeline, the 16:9 Higgsfield clips): phone on the left, the lines on the right, the globe on the
    left with its line on the right.
  Type: the w45-10 slam (each word scales in from 1.6, no masks, so no letter is ever clipped).
  Per-script looks (script.json, all optional): app_screen (a still shown instead of the home screen, slow push-in),
  app_one_line (the app line on one line on 9:16), joke_white (no blue line), text_shadow (every text's shadow strength, 1 = default).
*/

export type FilmProps = { variant: Variant; clips: string; s1: number; s5: number; joke: string[][]; lock: number; app?: string; jokeLow?: boolean;
  appScreen?: string; appOneLine?: boolean; jokeWhite?: boolean; textShadow?: number };
export const FILM_DEFAULTS: FilmProps = { variant: "reel", clips: "higgs/samurai", s1: 5.056, s5: 5.0,
  joke: [["Preparing", "for"], ["a", "fight?"]], lock: 2.4 };
const APP = "higgs/app";   // the app section's frames, shared by every film
const times = (S1: number) => ({
  joke: 2.0, pour: S1 + 0.3, settle: S1 + 1.4, home0: S1 + 1.2, spin: S1 + 4.2, noads: S1 + 7.4,
  globe: S1 + 10.2, grow0: S1 + 10.7, grow1: S1 + 13.6, s5: S1 + 14.4,
});
type Times = ReturnType<typeof times>;
export const filmSeconds = (p: FilmProps) => times(p.s1).s5 + p.s5;

const BLUES = [C.acc, "#6fd8ff", "#ffffff", "#2f7bff", C.acc];
const shadow = (k = 1) => `0 10px 60px rgba(0,0,0,${0.85 * k})`;
const SHADOW = shadow();
const N = 240;

/** words that slam in one after another; lines are arrays of words, `blue` marks words by index */
const Slam: React.FC<{ t: number; a: number; z: number; lines: string[][]; blue: number[]; size: number; gap?: number;
  align?: "center" | "right" | "left"; style?: React.CSSProperties; shade?: string }> = ({ t, a, z, lines, blue, size, gap = 0.2, align = "center", style, shade = SHADOW }) => {
  if (t < a || t > z) return null;
  const out = seg(t, z - 0.22, z);
  let k = 0;
  return (
    <div style={{ position: "absolute", textAlign: align, opacity: 1 - out, transform: `scale(${lerp(1, 0.92, out)})`, transformOrigin: align === "right" ? "100% 0" : "50% 50%", ...style }}>
      {lines.map((ws, li) => (
        <div key={li} style={{ display: "flex", justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", gap: size * 0.26 }}>
          {ws.map((w) => {
            const i = k++, at = a + gap * i;
            return (
              <H1 key={i} size={size} style={{ lineHeight: 1.08, color: blue.includes(i) ? C.acc : "#fff", textShadow: shade, whiteSpace: "nowrap",
                opacity: t >= at ? 1 : 0, transform: `scale(${lerp(1.6, 1, outExpo(seg(t, at, at + 0.25)))})` }}>{w}</H1>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** the app: home is 60 fps stills (a smooth card swipe Topanga to Sunset Point, built from two settled
    screenshots: the recorder's snap scroll stutters); the spot page is the 30 fps recording from 3.4 s,
    held on its first frame through the flip, then playing */
const recFrame = (T: Times, t: number, spot: boolean) => spot
  ? `${APP}/scr/${String(Math.min(299, Math.floor((3.4 + Math.max(0, t - (T.spin + 0.9))) * 30) + 1)).padStart(4, "0")}.jpg`
  : `${APP}/home/${String(Math.max(1, Math.min(186, Math.round((t - T.home0) * 60) + 1))).padStart(4, "0")}.jpg`;

const Globe: React.FC<{ t: number; T: Times }> = ({ t, T }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  const k = outExpo(seg(t, T.globe, T.globe + 0.9));
  const gone = inOut(seg(t, T.s5 - 0.6, T.s5 + 0.1));
  const W = width > height;
  const R = lerp(20, W ? 400 : 420, k) * lerp(1, 0.05, gone), cx = W ? 640 : 540, cy = W ? 540 : 860, al = seg(t, T.globe, T.globe + 0.15) * (1 - gone);
  const day = 76 * inOut(seg(t, T.grow0, T.grow1)) - (t < T.grow0 ? 1 : 0);
  const lon0 = -150 + 22 * (t - T.globe), lat0 = 14;
  useLayoutEffect(() => {
    const f = ref.current?.getContext("2d");
    if (!f) return;
    f.clearRect(0, 0, width, height);
    if (al <= 0.003) return;
    const D = Math.PI / 180, hv = (la: number, lo: number) => [Math.cos(la * D) * Math.sin(lo * D), Math.sin(la * D), Math.cos(la * D) * Math.cos(lo * D)];
    const cL = Math.cos(lon0 * D), sL = Math.sin(lon0 * D), c0 = Math.cos(lat0 * D), s0 = Math.sin(lat0 * D);
    const pr = (v: number[]) => { const x = v[0] * cL - v[2] * sL, z1 = v[2] * cL + v[0] * sL; return [x, v[1] * c0 - z1 * s0, v[1] * s0 + z1 * c0]; };
    f.save(); f.globalAlpha = al;
    const rim = f.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.09);
    rim.addColorStop(0, "rgba(60,170,255,.34)"); rim.addColorStop(1, "rgba(60,170,255,0)");
    f.fillStyle = rim; f.beginPath(); f.arc(cx, cy, R * 1.09, 0, 7); f.fill();
    const bd = f.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R);
    bd.addColorStop(0, "rgb(18,30,54)"); bd.addColorStop(0.6, "rgb(7,11,21)"); bd.addColorStop(1, "rgb(3,5,10)");
    f.fillStyle = bd; f.beginPath(); f.arc(cx, cy, R, 0, 7); f.fill();
    f.strokeStyle = "rgba(140,170,230,.07)"; f.lineWidth = 1;
    for (let lo = -180; lo < 180; lo += 30) { f.beginPath(); let pen = false; for (let la = -90; la <= 90; la += 4) { const p = pr(hv(la, lo)); if (p[2] > 0) { pen ? f.lineTo(cx + R * p[0], cy - R * p[1]) : f.moveTo(cx + R * p[0], cy - R * p[1]); pen = true; } else pen = false; } f.stroke(); }
    for (let la = -60; la <= 60; la += 30) { f.beginPath(); let pen = false; for (let lo = -180; lo <= 180; lo += 4) { const p = pr(hv(la, lo)); if (p[2] > 0) { pen ? f.lineTo(cx + R * p[0], cy - R * p[1]) : f.moveTo(cx + R * p[0], cy - R * p[1]); pen = true; } else pen = false; } f.stroke(); }
    const ls = Math.max(1.3, R * 0.0062);
    for (const q of LAND) { const p = pr(hv(q[0], q[1])); if (p[2] <= 0) continue; f.fillStyle = `rgba(160,180,230,${0.16 + 0.5 * p[2]})`; f.fillRect(cx + R * p[0] - ls / 2, cy - R * p[1] - ls / 2, ls, ls); }
    f.globalCompositeOperation = "lighter";
    const BR = [[93, 252, 159], [36, 177, 97], [17, 183, 242], [110, 143, 184], [69, 77, 104]];
    const ss = Math.max(1.4, R * 0.0058);
    for (const q of SPOTS) {
      if (q[3] > day) continue;
      const p = pr(hv(q[0], q[1])); if (p[2] <= 0) continue;
      const fr = 1 - Math.min(1, Math.max(0, (day - q[3]) / 3.5)), b = BR[q[2]] || BR[4];
      const c = b.map((v) => Math.round(v + (255 - v) * fr * 0.9)), s = ss * (q[2] === 0 ? 1.15 : 1) * (1 + 2.4 * fr) * (0.6 + 0.4 * p[2]);
      f.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(q[2] > 2 ? 0.45 : 0.72) * (0.35 + 0.65 * p[2])})`;
      f.beginPath(); f.arc(cx + R * p[0], cy - R * p[1], s, 0, 7); f.fill();
      if (fr > 0.2) { f.fillStyle = `rgba(17,183,242,${0.08 * fr * p[2]})`; f.beginPath(); f.arc(cx + R * p[0], cy - R * p[1], s * 4, 0, 7); f.fill(); }
    }
    f.restore();
  });
  if (al <= 0.003) return null;
  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} />;
};

export const HiggsFilm: React.FC<FilmProps> = ({ variant, clips, s1: S1, s5: S5, joke, lock, app, jokeLow, appScreen, appOneLine, jokeWhite, textShadow = 1 }) => {
  const sh = shadow(textShadow);
  useInter();
  const t = useT();
  const { fps, width, height } = useVideoConfig();
  const W = width > height, ar = W ? "16x9" : "9x16";
  const B = SAFE[variant];
  const T = times(S1), LK = T.s5 + lock;
  const appWs = (app ?? "Location is everything.").split(" "), appBlue = [appWs.length - 1];   // the app section's first line, last word blue
  // joke: line 2 is the punch (blue); the size shrinks so the longest line fits the safe width
  const jokeW = W ? 1000 : B.w, jokeChars = Math.max(...joke.map((l) => l.join(" ").length));
  const jokeSize = Math.min(W ? 130 : 128, Math.floor(jokeW / (0.56 * jokeChars)));
  const jokeBlue = jokeWhite ? [] : joke.slice(1).flat().map((_, i) => joke[0].length + i);

  // ── phone (w45-10): lands centre as the particles pour in, then spins once into the spot page ──
  const cx = W ? 560 : 540, cy = W ? 540 : 960;
  const land = outBack(seg(t, T.pour, T.pour + 0.6));
  const sw = outExpo(seg(t, T.spin - 0.4, T.spin + 0.4));
  const spin = inOut(seg(t, T.spin, T.spin + 0.9));
  const ry = -360 * spin, big = lerp(1, 1.18, spin), calm = 1 - 0.7 * spin;
  const exit = inOut(seg(t, T.globe - 0.2, T.globe + 0.5));
  const pose: Pose = {
    x: W ? lerp(0, -40, sw) : lerp(0, -110, sw) - 60 * spin,
    y: (W ? lerp(120, 0, land) : lerp(160, 60, land) + 190 * spin) + 6 * Math.sin(t * 2.2) + 1300 * exit,
    s: lerp(0.62, 1.05, land) * lerp(1, 0.95, sw) * big * lerp(1, 0.8, exit) * (W ? 0.85 : 1),
    rx: lerp(18, 6, land) + 6 * sw * calm * Math.sin(t * 1.4) + 25 * exit,
    ry: lerp(-12, 0, land) + ry + sw * calm * 24 * Math.sin((t - T.spin) * 2.1), rz: lerp(8, 0, land) - 4 * sw * calm * Math.sin(t * 1.1),
    o: t >= T.pour && t < T.globe + 0.5 ? Math.min(seg(t, T.pour, T.pour + 0.25), 1 - seg(t, T.globe + 0.2, T.globe + 0.5)) : 0,
  };
  const reveal = outExpo(seg(t, T.pour + 0.4, T.settle + 0.2));

  // pin on the coast, bottom right (w45-10)
  const PIN = W ? { x: 1790, y: 1000 } : { x: 930, y: 1760 };
  const pinPop = outBack(seg(t, S1, S1 + 0.4));
  const pinOut = seg(t, T.globe - 0.2, T.globe + 0.2);

  // ── particle stream (w45-10): flows to the pin from the stamp on; half pours into the phone, then streams again after the spin ──
  const pOn = t >= S1 - 0.1 && t < T.globe + 0.3;
  const parts = !pOn ? [] : Array.from({ length: N }, (_, i) => {
    const r1 = random(`a${i}`), r2 = random(`b${i}`), r3 = random(`c${i}`), r4 = random(`d${i}`);
    const size = 4 + 8 * r3;
    const u = (r1 + t * (0.45 + 0.25 * r2)) % 1;
    const S = { x: -80, y: W ? 40 + r4 * 1000 : 60 + r4 * 1800 }, K = { x: W ? 1000 : 560, y: S.y - (W ? 260 : 360) + 260 * r3 };
    const sx = (1 - u) ** 2 * S.x + 2 * (1 - u) * u * K.x + u * u * PIN.x;
    const sy = (1 - u) ** 2 * S.y + 2 * (1 - u) * u * K.y + u * u * (PIN.y - 40) + 40 * Math.sin(u * 14 + i) * (1 - u);
    let x = sx, y = sy, w = size * lerp(2.4, 0.8, u);
    let o = (0.35 + 0.65 * r4) * seg(t, S1 - 0.1, S1 + 0.4) * (1 - seg(u, 0.9, 1)) * (1 - pinOut);
    if (i % 2 === 1 && t >= T.pour && t < T.spin + 0.5) {
      const k = outExpo(seg(t, T.pour + 0.6 * r1, T.pour + 0.6 * r1 + 0.8));
      x = lerp(sx, cx + pose.x + (r2 - 0.5) * 380 * pose.s, k);
      y = lerp(sy, cy + pose.y + (r4 - 0.5) * 840 * pose.s, k);
      w = lerp(w, size, k);
      o *= t < T.spin ? 1 - seg(k, 0.85, 1) * 0.9 : seg(t, T.spin, T.spin + 0.5);
      if (t >= T.spin) { x = sx; y = sy; }
    }
    return { x, y, w, h: size, o, col: BLUES[i % BLUES.length], i };
  });
  const dot = (p: (typeof parts)[number]) => p.o > 0.01 && (
    <div key={p.i} style={{ position: "absolute", left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h, borderRadius: p.h, background: p.col, opacity: p.o, boxShadow: p.i % 7 === 0 ? `0 0 14px ${C.acc}` : undefined }} />
  );

  const v = T.s5;
  const zin = outBack(seg(t, T.s5 - 0.6, T.s5 + 0.2)), up = inOut(seg(t, LK, LK + 0.6));
  const IY = height / 3 - (W ? 110 : 130), ISZ = W ? 150 : 170;
  const iy = lerp(height / 2, IY, up), isz = lerp(W ? 200 : 240, ISZ, up);
  const url = outExpo(seg(t, LK + 0.35, LK + 0.95)), btn = outBack(seg(t, LK + 0.5, LK + 0.95));
  const pulse = 1 + 0.035 * Math.sin((t - LK) * 5) * seg(t, LK + 0.8, LK + 1.2);
  const cy3 = height / 3;

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* 1 ── Higgsfield scene 1 + the joke ── */}
      <Sequence durationInFrames={Math.round(S1 * fps)}>
        <OffthreadVideo src={staticFile(`${clips}/s1-${ar}.mp4`)} volume={1} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Sequence>
      {t < S1 && <AbsoluteFill style={{ opacity: seg(t, T.joke - 0.2, T.joke + 0.3) * (1 - seg(t, S1 - 0.25, S1)),
        background: W ? "linear-gradient(90deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.1) 35%, rgba(0,0,0,0) 55%)" : `linear-gradient(${jokeLow ? 0 : 180}deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.1) 38%, rgba(0,0,0,0) 55%)` }} />}
      <Slam shade={sh} t={t} a={T.joke} z={S1} lines={joke} blue={jokeBlue} size={jokeSize} gap={0.12} align="left"
        // jokeLow (script.json joke_low): sits on the bottom of the safe area, off a face at the top of the clip
        style={jokeLow ? (W ? { left: 110, bottom: 110, width: 900 } : { left: B.x, bottom: height - B.y - B.h, width: B.w })
          : W ? { left: 110, top: 110, width: 900 } : { left: B.x, top: B.y + 10, width: B.w }} />

      {/* 2–4 ── black frame, particles, phone ── */}
      {t >= S1 && t < T.globe + 0.6 && <AbsoluteFill style={{ background: "radial-gradient(1300px 2000px at 50% 50%, rgba(3,42,250,.16) 0%, #000 75%)" }} />}
      {parts.map(dot)}
      <Phone pose={pose} cx={cx} cy={cy} glow={0.2 + 0.4 * seg(t, T.settle - 0.3, T.settle + 0.6)}>
        <div style={{ position: "absolute", inset: 0, clipPath: `circle(${lerp(0, 75, reveal)}% at 50% 50%)`, background: "#f4f3f3" }}>
          {/* home until the phone is edge-on in the flip, then the spot page; on the back half it is un-mirrored */}
          {t >= T.pour && t < T.globe + 0.6 &&
            <Img src={staticFile(spin < 0.25 && appScreen ? appScreen : recFrame(T, t, spin >= 0.25))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
              transform: `${Math.cos((pose.ry * Math.PI) / 180) < 0 ? "scaleX(-1) " : ""}${spin < 0.25 && appScreen ? `scale(${lerp(1, 1.08, inOut(seg(t, T.pour, T.spin)))})` : ""}` || undefined }} />}
        </div>
      </Phone>
      {t >= S1 && t < T.globe + 0.2 && (
        <div style={{ position: "absolute", left: PIN.x - 60, top: PIN.y - 150, width: 120, height: 150, transformOrigin: "50% 100%", opacity: 1 - pinOut, transform: `scale(${pinPop})` }}>
          {[0, 1, 2].map((j) => {
            const p = ((t - S1) * 0.8 + j / 3) % 1;
            return <div key={j} style={{ position: "absolute", left: 60 - 90 * p, top: 150 - 30 * p, width: 180 * p, height: 60 * p, borderRadius: "50%", border: `3px solid ${C.acc}`, opacity: 1 - p }} />;
          })}
          <svg width={120} height={150} viewBox="0 0 120 150" style={{ position: "absolute", left: 0, top: 0, filter: `drop-shadow(0 0 24px ${C.acc})` }}>
            <path d="M60 148 C40 110 6 86 6 56 A54 54 0 0 1 114 56 C114 86 80 110 60 148 Z" fill={C.acc} />
            <circle cx={60} cy={56} r={20} fill="#fff" />
          </svg>
        </div>
      )}

      {app
        // a script's own line is set like "16 days forecast."
        ? <Slam shade={sh} t={t} a={T.pour + 0.15} z={T.spin + 0.1} lines={appOneLine && !W ? [appWs] : [appWs.slice(0, -1), appWs.slice(-1)]} blue={appBlue}
            size={appOneLine && !W ? Math.min(130, Math.floor(B.w / (0.56 * app.length))) : 130} align="left" gap={0.22}
            style={W ? { left: 1060, top: 540 - 1.08 * 130, width: 780 } : { left: B.x, top: B.y + 20, width: B.w }} />
        : W
        ? <Slam shade={sh} t={t} a={T.pour + 0.15} z={T.spin + 0.1} lines={[appWs.slice(0, -1), appWs.slice(-1)]} blue={appBlue} size={120} align="left"
            style={{ left: 1060, top: 540 - 1.08 * 120, width: 780 }} />
        : <Slam shade={sh} t={t} a={T.pour + 0.15} z={T.spin + 0.1} lines={[appWs]} blue={appBlue} size={84}
            style={{ left: B.x, top: B.y + 20, width: B.w }} />}
      <Slam shade={sh} t={t} a={T.spin + 0.45} z={T.noads} lines={[["16", "days"], ["forecast."]]} blue={[2]} size={130} align={W ? "left" : "right"} gap={0.22}
        style={W ? { left: 1060, top: 540 - 1.08 * 130, width: 780 } : { left: B.x, top: B.y + 20, width: B.w }} />
      <Slam shade={sh} t={t} a={T.noads + 0.05} z={T.globe} lines={[["No", "ads,"], ["no", "paywall."]]} blue={[2, 3]} size={130} align={W ? "left" : "right"} gap={0.2}
        style={W ? { left: 1060, top: 540 - 1.08 * 130, width: 780 } : { left: B.x, top: B.y + 20, width: B.w }} />

      {/* 5 ── the showreel globe ── */}
      {t >= T.globe - 0.3 && t < v + 0.6 && <AbsoluteFill style={{ opacity: seg(t, T.globe - 0.3, T.globe + 0.3) * (1 - inOut(seg(t, v, v + 0.6))) }}>
        <Particles t={t} o={1} w={width} band={W ? 1080 : 1250} alpha={0.75} density={3.5} />
      </AbsoluteFill>}
      <Globe t={t} T={T} />
      <Slam shade={sh} t={t} a={T.globe + 0.6} z={T.s5} lines={[["+4,500", "spots"], ["and", "growing."]]} blue={[2, 3]} size={W ? 104 : 124} gap={0.24} align={W ? "left" : "center"}
        style={W ? { left: 1150, top: 540 - 1.08 * 104, width: 740 } : { left: B.x, top: 1320, width: B.w }} />

      {/* 6 ── closing: scene 5, then the lockup on it ── */}
      {t >= v && (
        <Sequence from={Math.round(v * fps)} durationInFrames={Math.round(S5 * fps)}>
          <AbsoluteFill style={{ opacity: outExpo(seg(t, v, v + 0.6)) }}>
            <OffthreadVideo src={staticFile(`${clips}/s5-${ar}.mp4`)} volume={0.35} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
        </Sequence>
      )}
      {t >= T.s5 - 0.6 && (
        <AbsoluteFill>
          <AbsoluteFill style={{ opacity: seg(t, LK, LK + 0.6), background: `radial-gradient(760px 540px at 50% ${cy3}px, rgba(2,8,20,.58) 0%, rgba(2,8,20,.26) 55%, rgba(2,8,20,0) 100%)` }} />
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ position: "absolute", left: width / 2 - isz / 2, top: iy - isz / 2, width: isz, height: isz, borderRadius: isz * 0.235,
            transform: `scale(${zin}) rotate(${lerp(-20, 0, zin)}deg)`, boxShadow: "0 20px 70px rgba(3,42,250,.55)" }} />
          {t >= LK + 0.35 && (
            <div style={{ position: "absolute", left: 0, width, top: IY + ISZ / 2 + 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
              <div style={{ ...font, fontWeight: 800, fontSize: 76, letterSpacing: "-.03em", lineHeight: 1.15, opacity: url, transform: `translateY(${lerp(30, 0, url)}px)`, textShadow: `0 4px 30px rgba(0,0,0,${0.5 * textShadow})` }}>rosa.surf</div>
              <div style={{ ...font, fontWeight: 800, fontSize: 52, lineHeight: 1.2, color: "#fff", background: "#032afa", padding: "22px 60px", borderRadius: 999,
                transform: `scale(${btn * pulse})`, boxShadow: "0 16px 48px rgba(3,42,250,.6), 0 0 0 2px rgba(255,255,255,.12) inset" }}>Find my wave</div>
            </div>
          )}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
