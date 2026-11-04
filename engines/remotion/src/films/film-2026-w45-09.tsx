import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Variant, font, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Friday dawn patrol, 15 s. Motion language: a fast-cut UI launch, calmed down (four hard cuts on the
  beat with a light flash, the device punching in a touch on every cut, kinetic type that slams in, a
  spark burst on the payoff). Here: a bright wave under the hook; then the app owns the frame over
  surf footage: a big phone on Home with a swell-alert banner dropping over it, cut to the light
  Pipeline screen with the rating flashing Good, cut to a punch-in on the rating card. Each clip is
  used once and kept bright. Full-frame layout: the phone fills the frame under the headline, the Rosa
  app particles rise off the bottom throughout. VO from 0.5 s. End card: logo, white "Let the swell find you.", space,
  glowing blue "rosa.surf →". Pipeline Good: the live index of 2026-10-25 (see Favorites.tsx).
*/

export const SECONDS = 15;
const T = { hook: 0, alert: 1.6, spot: 3.6, zoom: 6.4, free: 7.6, end: 8.8, out: 15 };
const CUTS = [T.alert, T.spot, T.zoom, T.end];

// the Epic chip on the light Pipeline capture, in screen px (400 wide)
const CHIP = { x: 33, y: 521, w: 52, h: 25 };

// Rosa loading-screen particles, same port as film-2026-w45-03 (rosa/web particles.ts, splash options:
// density 1.4, alpha 0.3, two-tone palette, 460 px bottom band), screen-blended: specks rise off the
// bottom and fade as they climb. App px (430 wide phone) scaled by PS.
const PS = 2.5, PBAND = { h: 460 * PS }, ALPHA = 0.3;
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const N = Math.round(((1080 / PS) * (PBAND.h / PS)) / 11000 * 1.4);
const SPECKS = Array.from({ length: N }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`sl${i}`)), off: random(`so${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`s${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = PBAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const fadeIn = Math.min(1, (PBAND.h - y) / (80 * PS)), fadeOut = Math.min(1, Math.max(0, y) / (PBAND.h * 0.55));
  const a = (0.22 + depth * 0.7) * ALPHA * fadeIn * fadeOut * tw * env;
  return { x, y, depth, rad, bucket, a: Math.max(0, Math.min(1, a)), color: PALETTE[Math.floor(r("c") * PALETTE.length)] };
};
const Particles: React.FC<{ t: number; o: number }> = ({ t, o }) => {
  const ps = SPECKS.map(({ i, life, off }) => {
    const k = Math.floor((t + off) / life);
    return { i, ...speck(i, k, t + off - k * life, life) };
  }).filter((p) => p.a > 0.002).sort((a, b) => a.depth - b.depth);
  const dot = (p: (typeof ps)[number], rad: number, blur: number, a: number, key: string) => (
    <div key={key} style={{ position: "absolute", left: p.x - rad, top: p.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%",
      background: `rgb(${p.color})`, opacity: a, filter: blur ? `blur(${blur * PS}px)` : undefined }} />
  );
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: 1080, height: PBAND.h, opacity: o, overflow: "hidden", pointerEvents: "none", mixBlendMode: "screen" }}>
      {ps.filter((p) => p.bucket === 0 && p.rad > 1.4 * PS).map((p) => dot(p, p.rad * 2.6, 8, p.a * 0.55, `g${p.i}`))}
      {ps.map((p) => dot(p, p.rad, p.bucket, p.a, `d${p.i}`))}
    </div>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const S = 1.45; // phone scale: 1276 px tall, filling the frame under the headline
  const cy = 1150;

  // ── the phone: big and centred, a small punch and a new tilt on every cut ──
  const app = t >= T.alert && t < T.end;
  const cut = [...CUTS].reverse().find((c) => t >= c) ?? 0;
  const k = outExpo(seg(t, cut, cut + 0.35));
  const tilt = t < T.spot ? -3 : t < T.zoom ? 2.5 : -1.5;
  const enter = outExpo(seg(t, T.alert, T.alert + 0.5));
  const pose: Pose = {
    x: 0, y: lerp(900, 0, enter) + 5 * Math.sin(t * 2),
    s: S * lerp(1.07, 1, k), rx: 4 + 2 * Math.sin(t * 1.3), ry: 6 * Math.sin(t * 0.9), rz: lerp(tilt * 2, tilt, k),
    o: app ? 1 - seg(t, T.end - 0.12, T.end) : 0,
  };
  // punch-in on the rating card inside the screen
  const zoom = t >= T.zoom ? lerp(1.55, 1.35, outExpo(seg(t, T.zoom, T.zoom + 0.5))) : 1;

  // rating flashes Good: three blinks, then holds
  const gk = t - T.spot - 0.35;
  const goodOn = t >= T.zoom || (gk >= 0 && (gk > 0.75 || Math.floor(gk / 0.125) % 2 === 0));
  const goodPop = outBack(seg(t, T.spot + 0.35, T.spot + 0.6));

  // light flash frame on every hard cut
  const flash = Math.max(0, ...CUTS.map((c) => (t >= c && t < c + 0.08 ? 0.35 * (1 - seg(t, c, c + 0.08)) : 0)));
  // slam-in for kinetic type
  const slam = (a: number): React.CSSProperties => ({ opacity: t >= a ? 1 : 0, transform: `scale(${lerp(1.5, 1, outExpo(seg(t, a, a + 0.25)))})` });
  const drop = outBack(seg(t, T.alert + 0.45, T.alert + 0.85));
  const buzz = t >= T.alert + 0.45 && t < T.alert + 1.0 ? 6 * Math.sin(t * 90) : 0;
  const head: React.CSSProperties = { position: "absolute", left: B.x, top: B.y + 20, width: B.w, display: "flex", justifyContent: "center", textAlign: "center" };

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* ── hook bed: the wave, bright ── */}
      <Footage src="footage/218670_large.mp4" from={0} to={T.alert} startFrom={3} dark={0.18} zoom={0.1} fadeIn={0.2} fadeOut={0.05} />
      {/* ── app bed: surf footage ── */}
      <Footage src="footage/310248_large.mp4" from={T.alert} to={T.end} startFrom={2} dark={0.25} zoom={0.1} fadeIn={0.05} fadeOut={0.05} />
      {/* ── end bed ── */}
      <Footage src="footage/283533_large.mp4" from={T.end} to={T.out} startFrom={4} dark={0.3} zoom={0.1} fadeIn={0.05} />
      {/* ── Rosa app particles rising off the bottom, behind everything ── */}
      <Particles t={t} o={win(t, 0, SECONDS + 1, 0.6, 0.01)} />

      {/* ── hook: words slam in on the beat ── */}
      {t < T.alert && (
        <div style={{ position: "absolute", left: B.x, top: 960 - 220, width: B.w, textAlign: "center" }}>
          {["Weekend", "swell", "incoming."].map((w, i) => (
            <H1 key={w} size={150} style={{ color: i === 1 ? C.acc : "#fff", textShadow: "0 8px 40px rgba(0,0,0,.6)", ...slam(0.1 + 0.35 * i) }}>{w}</H1>
          ))}
        </div>
      )}

      {/* ── headline band above the phone ── */}
      {t >= T.alert && t < T.spot && (
        <div style={head}><H1 size={120} style={{ color: "#fff", ...slam(T.alert + 0.1) }}>Swell alert.</H1></div>
      )}
      {t >= T.spot && t < T.zoom && (
        <div style={head}>
          <div style={{ ...font, padding: "8px 64px", borderRadius: 999, background: C.good, color: "#fff", fontWeight: 800, fontSize: 112, letterSpacing: "-.035em", lineHeight: 1.1,
            opacity: goodOn ? 1 : 0.35, boxShadow: `0 0 ${goodOn ? 70 : 0}px rgba(255,255,255,.7)`, transform: `scale(${lerp(0.3, 1, goodPop)}) rotate(-3deg)` }}>Good</div>
          {/* spark burst off the pill */}
          {Array.from({ length: 16 }, (_, j) => {
            const p = seg(t, T.spot + 0.4, T.spot + 1.0);
            if (p <= 0 || p >= 1) return null;
            const a = (j / 16) * Math.PI * 2 + random(`ga${j}`) * 0.3, d = (160 + 140 * random(`gd${j}`)) * outExpo(p);
            return <div key={j} style={{ position: "absolute", left: B.w / 2 + Math.cos(a) * d * 1.45 - 7, top: 70 + Math.sin(a) * d * 0.4 - 7, width: 14, height: 14, borderRadius: 7, background: "#fff", boxShadow: `0 0 18px ${C.good}`, opacity: 1 - p }} />;
          })}
        </div>
      )}
      {t >= T.zoom && t < T.end && (
        <div style={head}>
          {t < T.free
            ? <H1 size={120} style={{ color: "#fff", ...slam(T.zoom + 0.1) }}>Wax up.</H1>
            : <H1 size={120} style={{ color: "#fff", ...slam(T.free) }}>It's free.</H1>}
        </div>
      )}

      {/* ── the phone ── */}
      <Phone pose={pose} cx={540} cy={cy} glow={0.5} island={false}>
        {t < T.spot
          ? <Screen src="captures-light/home.png" />
          : (
            <div style={{ position: "absolute", inset: 0, transformOrigin: "40px 578px", transform: `scale(${zoom})` }}>
              <Screen src="captures-light/spot-pipeline.png" />
              {/* rating chip in the app's own style, flashing Good */}
              <div style={{ ...font, position: "absolute", left: CHIP.x - 3, top: CHIP.y - 2, width: CHIP.w + 6, height: CHIP.h + 4, borderRadius: 999, background: goodOn ? C.good : "#fff", color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{goodOn ? "Good" : ""}</div>
            </div>
          )}
      </Phone>

      {/* ── the push banner drops over the phone ── */}
      {t >= T.alert + 0.45 && t < T.spot && (
        <div style={{ position: "absolute", left: B.x + 45, top: lerp(B.y - 60, B.y + 250, drop), width: B.w - 90, display: "flex", alignItems: "center", gap: 28, padding: "26px 32px",
          borderRadius: 40, background: "rgba(255,255,255,.97)", boxShadow: "0 30px 80px rgba(3,20,60,.45)", opacity: seg(t, T.alert + 0.45, T.alert + 0.55), transform: `translateX(${buzz}px)` }}>
          <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 96, height: 96, borderRadius: 22 }} />
          <div style={{ ...font, color: "#0b1220" }}>
            <div style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.1 }}>Swell alert</div>
            <div style={{ fontWeight: 500, fontSize: 40, lineHeight: 1.2, color: "#3a4456" }}>Banzai Pipeline is <span style={{ color: C.good, fontWeight: 800 }}>Good</span></div>
          </div>
        </div>
      )}

      {/* ── end card ── */}
      {t >= T.end && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.18) 0%, rgba(0,0,0,.3) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: 560, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            {["Let the swell", "find you."].map((w, i) => (
              <H1 key={w} size={110} style={{ marginTop: i === 0 ? 56 : 0, color: "#fff", textShadow: "0 8px 40px rgba(0,0,0,.55)", ...slam(T.end + 0.3 + 0.2 * i) }}>{w}</H1>
            ))}
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 60px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 60, marginTop: 100,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.8, T.end + 0.95), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.8, T.end + 1.15)))})` }}>rosa.surf →</div>
          </div>
        </>
      )}

      {/* hard-cut flash */}
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

export default Film;
