import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { C, Footage, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Swell map flyover, 15 s. Motion language: 3D page flyover (one continuous camera low over a page laid
  flat, gliding down it on one speed curve while looking up it; thin focus, everything near the lens melts;
  the camera dives and lands one piece as a card; type rises word by word out of a blur). Here the page
  is captures/charts-week (map area only, --at 15,-75), the week's forecast playing as the camera glides, with swell colour bands rolling over it. The phone stands up
  big over the map, Pixabay surf (13772) rolls in behind the tilted phone, the screen swipes
  to captures/map.png and the camera dives onto the Rocky Point card. End card: one logo, white "Watch
  the swell roll in.", space, glowing blue "rosa.surf/charts →", Rosa particles rising off the bottom. Dark theme: captures/ only. 16 days:
  clients/rosa/product.md.
*/

export const SECONDS = 15;
const T = { flight: 0, rise: 4.4, stand: 4.4, foot: 4.8, every: 5.2, swap: 7.0, dive: 7.3, land: 8.2, out: 9.6, end: 10.1 };

// ── the floor: charts-americas.png's map area (1170 × 1940 of 2532) laid flat and tilted, near its native size
// so the capture is never upscaled into pixels; the whole map width stays in frame ──
const SC = 1.1, FW = Math.round(1170 * SC), FH = Math.round(1940 * SC), WEST = 0;
/** flight: the Carolinas (y 500 of the capture) at frame centre down to the Caribbean (y 1300) by T.rise */
const P0 = 500 * SC - 960, DIST = 800 * SC;
/** share of cruise speed down the page: eases in, holds at half, doubles to cruise, eases off */
const speed = (t: number) =>
  t < 0.6 ? 0.5 * inOut(t / 0.6) : t < 1.25 ? 0.5 : t < 1.6 ? 0.5 + 0.5 * inOut(seg(t, 1.25, 1.6))
    : t < 3.9 ? 1 + 0.06 * Math.sin((t - 1.6) * 2.2) : lerp(1, 0.12, inOut(seg(t, 3.9, 4.8))) * (1 - seg(t, 4.8, 6.2));
/** page position = the speed curve integrated, never keyed */
const travel = (t: number) => { let p = 0; for (let x = 0; x < Math.min(t, 6.2); x += 1 / 120) p += speed(x) / 120; return p; };
const UNIT = travel(T.rise);
/** frames in captures/charts-week */
const WEEK = 57;const glide = (t: number) => P0 + DIST * travel(t) / UNIT;

// Rosa particles: the app's bottom treatment (rosa/web BottomGlow.tsx + particles.ts, dark theme),
// a two-tone mesh with specks rising and fading out as they climb. Pure function of t: each speck
// loops its own life, respawning with fresh seeded values per cycle. App px (430 wide phone) scaled by PS.
const PS = 2.5, BAND = { top: 1280, h: 640 };
const PALETTE = ["125, 185, 240", "94, 205, 205"];
const SPECKS = Array.from({ length: 32 }, (_, i) => ({ i, life: 4 * (0.8 + 0.4 * random(`ql${i}`)), off: random(`qo${i}`) * 4 }));
const speck = (i: number, k: number, age: number, life: number) => {
  const r = (s: string) => random(`q${s}${i}-${k}`);
  const depth = Math.pow(r("d"), 0.85), rad = (0.5 + depth * 2.7) * PS, bucket = Math.round((1 - depth) * 4.5);
  const vy = (0.24 + depth * 1.4) * 60 * PS, vx = (r("v") - 0.5) * (0.05 + depth * 0.28) * 60 * PS;
  const ph = r("p") * 6.28, ws = (0.004 + r("w") * 0.012) * 60, wa = (0.05 + depth * 0.4) * 60 * PS;
  const x = r("x") * 1080 + vx * age + (wa / ws) * (Math.cos(ph) - Math.cos(ph + ws * age));
  const y = BAND.h + r("y") * 30 * PS - vy * age;
  const lf = age / life, env = lf < 0.15 ? lf / 0.15 : lf > 0.7 ? (1 - lf) / 0.3 : 1;
  const tw = 0.75 + 0.25 * Math.sin(r("t") * 6.28 + (0.008 + r("s") * 0.025) * 60 * age);
  const a = (0.22 + depth * 0.7) * 0.35 * Math.min(1, (BAND.h - y) / (80 * PS)) * Math.min(1, Math.max(0, y) / (BAND.h * 0.55)) * tw * env;
  return { x, y, rad, bucket, a: Math.max(0, Math.min(1, a)), color: PALETTE[Math.floor(r("c") * PALETTE.length)] };
};
const RosaParticles: React.FC<{ t: number; o: number }> = ({ t, o }) => (
  <div style={{ position: "absolute", left: 0, top: BAND.top, width: 1080, height: BAND.h, opacity: o, overflow: "hidden", pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 0, background:
      "radial-gradient(95% 100% at 18% 130%, rgba(3,42,250,.55) 0%, transparent 72%), radial-gradient(85% 90% at 82% 120%, rgba(36,177,97,.40) 0%, transparent 70%), linear-gradient(180deg, transparent 0%, rgba(3,42,250,.12) 100%)" }} />
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      {SPECKS.map(({ i, life, off }) => {
        const k = Math.floor((t + off) / life), p = speck(i, k, t + off - k * life, life);
        if (p.a <= 0.002) return null;
        const dot = (rad: number, blur: number, a: number, key: string) => (
          <div key={key} style={{ position: "absolute", left: p.x - rad, top: p.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%",
            background: `rgb(${p.color})`, opacity: a, filter: blur ? `blur(${blur * PS}px)` : undefined }} />
        );
        return (
          <React.Fragment key={i}>
            {p.bucket === 0 && p.rad > 1.4 * PS && dot(p.rad * 2.6, 8, p.a * 0.55, "g")}
            {dot(p.rad, p.bucket, p.a, "d")}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

/** words rise 16 px out of a 12 px blur, one every `step` s */
const Words: React.FC<{ t: number; a: number; text: string; step?: number; color?: string; exit?: number }> = ({ t, a, text, step = 0.06, color = "#fff", exit = 99 }) => (
  <>{text.split(" ").map((w, i) => {
    const k = seg(t, a + i * step, a + i * step + 0.34), e = outExpo(k), o = 1 - inOut(seg(t, exit, exit + 0.25));
    return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", color, opacity: Math.min(seg(t, a + i * step, a + i * step + 0.12), o),
      filter: `blur(${12 * (1 - e) + 10 * (1 - o)}px)`, transform: `translateY(${16 * (1 - e) - 30 * (1 - o)}px)` }}>{w}</span>;
  })}</>
);

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── camera over the floor ──
  // low and steep at the start, flattening as it glides south, with a slow bank
  const fk = inOut(seg(t, 0, T.rise + 0.4));
  const tilt = lerp(52, 34, fk), bank = lerp(-5, 3, fk);
  const pos = glide(t);
  const floorO = 1 - seg(t, T.stand + 0.3, T.stand + 1.0);
  const roll = t * 160;
  const wp = seg(t, 0, T.stand + 1.0) * (WEEK - 1), wk = Math.floor(wp), wf = wp - wk;

  const floor = (
    <div style={{ position: "absolute", left: 540 - FW / 2, top: 960 - FH / 2, width: FW, height: FH, transformStyle: "preserve-3d",
      transform: `rotateX(${tilt}deg) rotateZ(${bank}deg) translate(${WEST}px, ${FH / 2 - 960 - pos}px)` }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 140px rgba(0,0,0,.8)" }}>
        {/* the week's forecast plays under the camera: charts-week/00..56 (3 h steps, Wed to Tue), cross-faded */}
        {[wk, Math.min(wk + 1, WEEK - 1)].map((k, j) => (
          <img key={j} src={staticFile(`captures/charts-week/${String(k).padStart(2, "0")}.png`)}
            style={{ position: "absolute", left: 0, top: 0, width: FW, display: "block", opacity: j === 0 ? 1 : wf }} />
        ))}
        {/* swell colours rolling under the camera */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.55,
          background: "repeating-linear-gradient(172deg, rgba(17,183,242,0) 0px, rgba(17,183,242,.32) 70px, rgba(36,177,97,.22) 130px, rgba(17,183,242,0) 240px)",
          backgroundPosition: `0 ${-roll}px` }} />
      </div>
    </div>
  );
  const persp: React.CSSProperties = { position: "absolute", inset: 0, perspective: 3000, perspectiveOrigin: "540px 620px" };

  // ── the phone: stands up on the map, floats tilted over the footage, then the dive ──
  // standing pose fills the bottom two thirds of the frame (880 × 1.41 ≈ 1240 px tall, centred at 1280)
  const cy = 1280;
  const up = outExpo(seg(t, T.stand, T.stand + 0.8));
  const dk = inOut(seg(t, T.dive, T.land));
  const fl = { rx: 10 + 4 * Math.sin(t * 0.9), ry: -18 + 8 * Math.sin(t * 0.7 + 0.5), rz: -3 + 2 * Math.sin(t * 0.6), y: 8 * Math.sin(t * 1.1) };
  // S kept near the capture's native 1170 px width (screen is 400 wide) so the landed card stays sharp
  const s0 = 1.41, S = 2.2 * (1 + 0.03 * seg(t, T.land, T.out)) * (1 + 0.15 * inOut(seg(t, T.out, T.end)));
  const s = Math.exp(lerp(Math.log(s0), Math.log(S), dk));
  const LANDY = B.y + B.h / 2;
  const y0 = lerp(1100, 0, up) + fl.y;
  const cardY = lerp(cy + y0 + 258 * s0, LANDY, dk);    // the Rocky Point card, pinned while the scale grows
  const pose = { x: 0, y: cardY - cy - 258 * s, s, rx: lerp(fl.rx + 22 * (1 - up), 0, dk), ry: lerp(fl.ry, 0, dk), rz: lerp(fl.rz, 0, dk), o: t < T.stand ? 0 : 1 };
  const swipe = 400 * (1 - outExpo(seg(t, T.swap, T.swap + 0.45)));
  const landO = win(t, T.land - 0.05, T.out + 0.2, 0.25, 0.3);
  const haze = seg(t, T.out + 0.1, T.end);

  // card in frame px: screen 90..310 × 628..748 at 400 wide
  const cw = 220 * S, ch = 120 * S;

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* floor */}
      {floorO > 0 && (
        <AbsoluteFill style={{ opacity: floorO }}>
          <div style={persp}>{floor}</div>
          {/* haze far up the page */}
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.page} 0%, rgba(6,6,7,.85) 14%, rgba(6,6,7,0) 34%)` }} />
          {/* the map's west edge recedes into frame far up: melt it */}
          <AbsoluteFill style={{ background: `linear-gradient(90deg, ${C.page} 0%, rgba(6,6,7,0) 16%, rgba(6,6,7,0) 88%, ${C.page} 100%)` }} />
        </AbsoluteFill>
      )}

      {/* Pixabay surf (13772) behind the tilted phone */}
      <Footage src="footage/13772-251867974_large.mp4" from={T.foot} to={T.end} startFrom={1} dark={0.38} zoom={0.12} fadeIn={0.8} fadeOut={0.4} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w }}>
        <H1 size={124}><Words t={t} a={0.15} text="Fly over" exit={T.rise - 0.3} /></H1>
        <H1 size={124}><Words t={t} a={0.3} text="this week's" exit={T.rise - 0.25} /></H1>
        <H1 size={124}><Words t={t} a={0.46} text="swell." color={C.acc} exit={T.rise - 0.2} /></H1>
      </div>
      <div style={{ position: "absolute", left: B.x, top: B.y + 10, width: B.w, textAlign: "center" }}>
        <H1 size={96}><Words t={t} a={T.every} text="Every coast." exit={T.swap - 0.1} /></H1>
        <H1 size={96}><Words t={t} a={T.every + 0.16} text="16 days out." color={C.acc} exit={T.swap - 0.05} /></H1>
      </div>

      <Phone pose={pose} glow={0.3} cy={cy}>
        <Screen src="captures/charts-americas.png" />
        <Screen src="captures/map.png" x={swipe} o={seg(t, T.swap, T.swap + 0.05)} />
      </Phone>

      {/* the landed card: glowing outline */}
      {landO > 0 && (
        <div style={{ position: "absolute", left: 540 - cw / 2, top: LANDY - ch / 2, width: cw, height: ch, opacity: landO }}>
          <div style={{ position: "absolute", inset: -6, borderRadius: 18 * S, border: `4px solid ${C.acc}`, boxShadow: `0 0 ${30 + 12 * Math.sin(t * 6)}px rgba(17,183,242,.85), inset 0 0 20px rgba(17,183,242,.35)` }} />
        </div>
      )}

      {/* haze, then the end card */}
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 40%, #07203a 0%, #03101f 50%, #000 100%)", opacity: haze }} />
      {t > T.end - 0.05 && (
        <>
          <RosaParticles t={t} o={seg(t, T.end, T.end + 0.8)} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.15), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <H1 size={96} style={{ marginTop: 56 }}><Words t={t} a={T.end + 0.25} text="Watch the swell" /></H1>
            <H1 size={96}><Words t={t} a={T.end + 0.43} text="roll in." /></H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "26px 54px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 50, marginTop: 110,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.7, T.end + 0.85), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.7, T.end + 1.05)))})` }}>rosa.surf/charts <span>→</span></div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
