import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, random, staticFile } from "remotion";
import { C, H1, Phone, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT, win } from "../lib";

/*
  Bento rating bars, 15 s. Motion language: bento UI assembly (rounded tiles snap into a grid with an
  overshoot, each snap throws a few square shards, tiles flash a colour and settle, the grid collapses
  into one tile, the product grows out of it). Deep blue field (#032afa tile colour) with a drifting dot grid.
  Hook "Good. / But why Good?". Tiles: captures-light/spot-pipeline.png panning down to its rating card,
  then Size / Period / Wind with bars in the rating colours the capture shows (good, good, fair), then a
  wide tile of Pixabay footage (310248). The grid collapses into a green tile "Good, / and here's why".
  The phone grows out of it on the same capture and tilts toward camera, the rating card outlined.
  End card: logo, white "Every rating / has a reason.", space, glowing blue "rosa.surf →".
  Light theme: captures-light/ only. No numbers on screen.
*/

export const SECONDS = 15;
const T = { hook: 0.15, why: 0.75, up: 1.55, big: 1.8, size: 2.3, period: 2.75, wind: 3.2, foot: 3.65, col: 5.6, ph: 6.9, tilt: 7.8, out: 9.9, end: 10.5 };
const NAVY = "#0d1225", FIELD = "#032afa";

type R = { x: number; y: number; w: number; h: number };
const lerpR = (a: R, b: R, k: number): R => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });

const DotGrid: React.FC<{ t: number; o: number }> = ({ t, o }) => (
  <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, opacity: o }}>
    <defs>
      <pattern id="dots" width={60} height={60} patternUnits="userSpaceOnUse" patternTransform={`translate(${-t * 12} ${-t * 24})`}>
        <circle cx={30} cy={30} r={2.5} fill="rgba(255,255,255,.18)" />
      </pattern>
    </defs>
    <rect width={1080} height={1920} fill="url(#dots)" />
  </svg>
);

/** square shards thrown out from a tile as it snaps in */
const Shards: React.FC<{ t: number; a: number; r: R; color: string; id: string }> = ({ t, a, r, color, id }) => {
  const k = seg(t, a + 0.15, a + 0.85);
  if (k <= 0 || k >= 1) return null;
  const e = outExpo(k);
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const ang = 2 * Math.PI * random(`${id}a${i}`), d = 0.5 * Math.max(r.w, r.h) + 60 + 160 * random(`${id}d${i}`), s = 14 + 18 * random(`${id}s${i}`);
        return <div key={i} style={{ position: "absolute", left: r.x + r.w / 2 + Math.cos(ang) * d * e - s / 2, top: r.y + r.h / 2 + Math.sin(ang) * d * e - s / 2,
          width: s, height: s, borderRadius: 5, background: i % 3 ? color : "#fff", opacity: 1 - k, transform: `rotate(${360 * e * (random(`${id}r${i}`) - 0.5)}deg)` }} />;
      })}
    </>
  );
};

// Rosa loading-screen particles, ported 1:1 from rosa/web particles.ts with the splash's options (main.tsx
// splashParticles: density 1.4, alpha 0.3, two-tone palette) on the splash's 460 px bottom band, screen-blended:
// specks rise off the bottom and fade as they climb. Pure function of t: each speck loops its own life with
// fresh seeded values per cycle. App px (430 wide phone) scaled by PS.
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
  const cy = B.y + B.h / 2;

  // ── bento layout inside the safe box ──
  const top = B.y + 170, gh = B.h - 170, gap = 24;
  const bigH = Math.round(gh * 0.68), sh = (bigH - 2 * gap) / 3, sw = B.w - 530 - gap;
  const MERGE: R = { x: B.x + 60, y: cy - 170, w: B.w - 120, h: 340 };
  const tiles = [
    { id: "big", a: T.big, r: { x: B.x, y: top, w: 530, h: bigH }, from: [-500, 0], flash: C.good },
    { id: "size", a: T.size, r: { x: B.x + 530 + gap, y: top, w: sw, h: sh }, from: [420, 0], flash: C.good, word: "Size", bar: 1, color: C.good },
    { id: "period", a: T.period, r: { x: B.x + 530 + gap, y: top + sh + gap, w: sw, h: sh }, from: [420, 0], flash: C.good, word: "Period", bar: 0.74, color: C.good },
    { id: "wind", a: T.wind, r: { x: B.x + 530 + gap, y: top + 2 * (sh + gap), w: sw, h: sh }, from: [420, 0], flash: C.fair, word: "Wind", bar: 0.55, color: C.fair },
    { id: "foot", a: T.foot, r: { x: B.x, y: top + bigH + gap, w: B.w, h: gh - bigH - gap }, from: [0, 400], flash: C.acc },
  ];
  const colK = inOut(seg(t, T.col, T.col + 0.6));
  const content = 1 - seg(t, T.col, T.col + 0.25);
  const mergeO = 1 - seg(t, T.ph + 0.1, T.ph + 0.4);

  // ── hook: big, then shrinks to the top line ──
  const up = inOut(seg(t, T.up, T.up + 0.45));
  const pop = (a: number): React.CSSProperties => ({ opacity: seg(t, a, a + 0.06), transform: `scale(${lerp(1.8, 1, outBack(seg(t, a, a + 0.35)))})` });

  // ── phone ──
  const g = outExpo(seg(t, T.ph, T.ph + 0.8)), tl = inOut(seg(t, T.tilt, T.tilt + 0.9)), outK = inOut(seg(t, T.out, T.end - 0.05));
  const pose = {
    x: 0, y: 8 * tl * Math.sin(t * 1.3),
    s: lerp(0.15, 1, g) * lerp(1, 0.01, outK),
    rx: tl * (12 + 3 * Math.sin(t * 0.8)), ry: tl * (-20 + 5 * Math.sin(t * 1.1)), rz: lerp(-12, 0, g) + tl * 3 + 50 * outK,
    o: t < T.ph || t > T.end ? 0 : 1,
  };
  const endDim = seg(t, T.out, T.end);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${FIELD} 0%, #021a9e 45%, #010840 100%)`, overflow: "hidden" }}>
      <DotGrid t={t} o={1 - 0.5 * endDim} />
      <Particles t={t} o={win(t, 0, SECONDS + 1, 0.6, 0.01)} />

      {/* hook */}
      {t < T.col + 0.3 && (
        <div style={{ position: "absolute", left: B.x, width: B.w, top: lerp(cy - 220, B.y, up), textAlign: "center", opacity: 1 - seg(t, T.col, T.col + 0.3) }}>
          <div style={{ height: lerp(240, 0, up), overflow: "visible" }}>
            <H1 size={200} style={{ display: "inline-block", color: "#fff", background: C.good, borderRadius: 999, padding: "10px 80px 22px", boxShadow: "0 0 60px rgba(36,177,97,.6)",
              opacity: (1 - up) * seg(t, T.hook, T.hook + 0.06), transform: pop(T.hook).transform }}>Good.</H1>
          </div>
          <H1 size={lerp(118, 100, up)} style={{ color: "#fff", marginTop: lerp(20, 0, up), ...pop(T.why) }}>But why <span style={{ color: C.good }}>Good?</span></H1>
        </div>
      )}

      {/* bento grid */}
      {t < T.ph + 0.45 && tiles.map((tile) => (
        <React.Fragment key={tile.id}>
          <Shards t={t} a={tile.a} r={tile.r} color={tile.flash} id={tile.id} />
          {t > tile.a && (() => {
            const e = outBack(seg(t, tile.a, tile.a + 0.45));
            const r = lerpR(tile.r, MERGE, colK);
            const flash = Math.max(1 - seg(t, tile.a + 0.15, tile.a + 0.7), colK);
            return (
              <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 44, overflow: "hidden", background: "#f4f3f3",
                boxShadow: "0 30px 80px rgba(0,0,20,.45)", opacity: seg(t, tile.a, tile.a + 0.08) * mergeO,
                transform: `translate(${lerp(tile.from[0], 0, e)}px, ${lerp(tile.from[1], 0, e)}px) scale(${lerp(0.6, 1, e) * lerp(1, 0.4, seg(t, T.ph, T.ph + 0.4))})` }}>
                <div style={{ position: "absolute", inset: 0, opacity: content }}>
                  {tile.id === "big" && (
                    // capture at 530 wide (1170 → 0.453), pans down to the rating card
                    <img src={staticFile("captures-light/spot-pipeline.png")} style={{ position: "absolute", left: 0, top: 0, width: 530,
                      transform: `translateY(${-lerp(0, 330, inOut(seg(t, T.big + 0.5, T.foot + 0.8)))}px)` }} />
                  )}
                  {tile.id === "foot" && (
                    <OffthreadVideo src={staticFile("footage/310248_large.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.1 + 0.05 * seg(t, T.foot, T.col)})` }} />
                  )}
                  {tile.word && (
                    <div style={{ position: "absolute", left: 36, right: 36, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
                      <H1 size={68} style={{ color: NAVY }}>{tile.word}</H1>
                      <div style={{ height: 22, borderRadius: 11, background: "rgba(13,18,37,.1)" }}>
                        <div style={{ height: "100%", borderRadius: 11, background: tile.color, width: `${100 * tile.bar! * outExpo(seg(t, tile.a + 0.3, tile.a + 1.0))}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                {/* rating-colour flash, then the merged tile's green */}
                <div style={{ position: "absolute", inset: 0, background: colK > 0 ? C.good : tile.flash, opacity: flash * (tile.word ? 0.85 : 0.7), mixBlendMode: colK > 0 ? "normal" : "multiply" }} />
              </div>
            );
          })()}
        </React.Fragment>
      ))}

      {/* merged tile copy */}
      <div style={{ position: "absolute", left: MERGE.x, top: MERGE.y, width: MERGE.w, height: MERGE.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        opacity: seg(t, T.col + 0.5, T.col + 0.6) * mergeO, transform: `scale(${lerp(1.4, 1, outBack(seg(t, T.col + 0.5, T.col + 0.85)))})` }}>
        <H1 size={130} style={{ color: "#fff" }}>Good,</H1>
        <H1 size={78} style={{ color: "#fff", marginTop: 10 }}>and here's why</H1>
      </div>

      {/* the phone grows out of the tile and tilts toward camera */}
      <Phone pose={pose} glow={0.4} cy={cy}>
        <Screen src="captures-light/spot-pipeline.png" />
        {/* rating card outline, screen px (card at 16..384 × 504..652) */}
        <div style={{ position: "absolute", left: 12, top: 500, width: 376, height: 156, borderRadius: 18, border: `3px solid ${C.good}`,
          boxShadow: "0 0 18px rgba(36,177,97,.9), inset 0 0 12px rgba(36,177,97,.4)", opacity: win(t, T.tilt + 0.2, T.out, 0.3, 0.3) }} />
      </Phone>
      <div style={{ position: "absolute", left: 540 - 12, top: cy - 12, width: 24, height: 24, borderRadius: "50%", background: "#fff",
        opacity: win(t, T.end - 0.35, T.end + 0.15, 0.1, 0.25), boxShadow: "0 0 40px 14px rgba(17,183,242,.85)" }} />

      {/* end card: tiles snap in behind the logo, then the copy */}
      {t > T.end - 0.1 && (
        <>
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: seg(t, T.end, T.end + 0.15), transform: `scale(${lerp(0.1, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, marginTop: 30, color: "#fff", opacity: seg(t, T.end + 0.12, T.end + 0.3),
              transform: `scale(${lerp(1.4, 1, outBack(seg(t, T.end + 0.12, T.end + 0.45)))})` }}>rosa<span style={{ color: C.acc }}>.</span></div>
            {["Every rating", "has a reason."].map((l, i) => (
              <H1 key={l} size={84} style={{ color: "#fff", marginTop: i ? 6 : 34, opacity: seg(t, T.end + 0.3 + 0.12 * i, T.end + 0.45 + 0.12 * i),
                transform: `translateY(${lerp(30, 0, outExpo(seg(t, T.end + 0.3 + 0.12 * i, T.end + 0.7 + 0.12 * i)))}px)` }}>{l}</H1>
            ))}
            <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "24px 52px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 48, marginTop: 100,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.6, T.end + 0.75), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.6, T.end + 0.95)))})` }}>rosa.surf <span>→</span></div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default Film;
