import React from "react";
import { AbsoluteFill, Img, random, staticFile, useVideoConfig } from "remotion";
import { C, Footage, H1, Phone, Pose, SAFE, Screen, Variant, font, inOut, lerp, outBack, outExpo, seg, useInter, useT } from "../lib";

/*
  App blows apart, 15 s, dark theme. Motion language: a deconstructed-UI piece (the screen is cut
  into its components and they fly apart in 3D with overshoot, each one hanging on its own depth,
  pulsing on the beat; shards burst out, a dot grid appears behind like a blueprint; words drop in
  letter by letter between the layers; everything slams back together and punches past camera).
  Here: home.png floats centre, splits into six strips (toast, spot card, day bar, two spot cards,
  nav bar) with the swell map (charts.png) dropping out behind. VO beats from 0.5 s: "Spots" →
  the spot cards, "swell map" → the map, "alerts" → the Epic card; "Fast." "Free." "Worldwide."
  land between the layers. End card: logo, white "All of it, free.", space, glowing blue "rosa.surf".
  Strips in screen px (1170×2532 capture → 400×866).
*/

export const SECONDS = 15;
const T = { hook: 0, burst: 1.5, fast: 2.4, spots: 2.6, map: 3.2, alerts: 3.8, free: 4.6, world: 5.6, snap: 6.5, zoom: 7.0, end: 7.6, out: 15 };
const HOME = "captures/home.png";
type L = { src: string; y: number; h: number; z: number; dx: number; dy: number; rz: number; hi?: number[]; front?: boolean };
const LAYERS: L[] = [
  { src: "captures/charts.png", y: 0, h: 660, z: -240, dx: 0, dy: -30, rz: 0, hi: [T.map] },
  { src: HOME, y: 0, h: 69, z: 170, dx: 40, dy: -110, rz: 3 },
  { src: HOME, y: 69, h: 321, z: 90, dx: -45, dy: -55, rz: -2, hi: [T.alerts] },
  { src: HOME, y: 390, h: 72, z: 210, dx: 55, dy: 5, rz: 2 },
  { src: HOME, y: 462, h: 160, z: 130, dx: -35, dy: 45, rz: -1.5, hi: [T.spots] },
  { src: HOME, y: 622, h: 148, z: 60, dx: 45, dy: 85, rz: 1.5, hi: [T.spots] },
  { src: HOME, y: 770, h: 90, z: 290, dx: 0, dy: 125, rz: 0, front: true },
];
const shadow = "0 10px 60px rgba(0,0,0,.75)";

/** the same 3D box as lib Phone, without the body, so its children can sit at their own depth */
const Rig: React.FC<{ pose: Pose; cx: number; cy: number; children: React.ReactNode }> = ({ pose, cx, cy, children }) => {
  const { width, height } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, perspective: 2400, perspectiveOrigin: `${cx}px ${cy}px`, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: cx - 210, top: cy - 440, width: 420, height: 880, transformStyle: "preserve-3d",
        transform: `translate(${pose.x}px, ${pose.y}px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) rotateZ(${pose.rz}deg) scale(${pose.s})` }}>
        {children}
      </div>
    </div>
  );
};

const Film: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const { width, height } = useVideoConfig();
  const cx = width / 2, cy = height / 2; // the app fills the whole frame, not the safe box

  // ── the phone: floats under the hook, rises to centre, blows apart, snaps back, punches past camera ──
  const up = inOut(seg(t, T.burst - 0.4, T.burst));
  const collapse = Math.pow(seg(t, T.snap, T.snap + 0.3), 2);
  const ek = outExpo(seg(t, T.burst, T.burst + 0.8)) * (1 - collapse);
  const beat = (a: number) => 0.04 * Math.sin(Math.PI * seg(t, a, a + 0.25));
  const punch = 1 + beat(T.fast) + beat(T.map) + beat(T.alerts) + beat(T.free) + beat(T.world) + beat(T.snap + 0.3);
  const zk = seg(t, T.zoom, T.end);
  const float = { rx: 6 * Math.sin(t * 0.9), ry: 14 * Math.sin(t * 0.7 + 0.5), rz: 2 * Math.sin(t * 0.5) };
  const pose: Pose = {
    x: 0,
    y: lerp(300, 0, up) + 8 * Math.sin(t * 1.4),
    s: lerp(1.5, 2.05, up) * punch * lerp(1, 4, zk * zk * zk),
    rx: lerp(float.rx, 16, ek),
    ry: lerp(float.ry, -24 + 8 * Math.sin(t * 0.6), ek),
    rz: lerp(float.rz, 0, ek),
    o: 1 - seg(t, T.end - 0.2, T.end),
  };
  const bodyO = 1 - Math.min(seg(t, T.burst, T.burst + 0.3), 1 - seg(t, T.snap + 0.15, T.snap + 0.3));
  const exploded = t >= T.burst && t < T.snap + 0.3;

  const layer = (l: L, i: number) => {
    const k = outBack(seg(t, T.burst + 0.05 * i, T.burst + 0.05 * i + 0.7)) * (1 - collapse);
    const h = Math.max(0, ...(l.hi ?? []).map((a) => Math.sin(Math.PI * seg(t, a, a + 0.9))));
    const z = (l.z + 70 * h) * k, dy = (l.dy + 8 * Math.sin(t * 1.4 + i)) * k;
    return (
      <div key={i} style={{ position: "absolute", left: 10, top: 10 + l.y, width: 400, height: l.h, overflow: "hidden", borderRadius: 18 * k,
        opacity: l.src === HOME ? 1 : Math.min(1, 2 * k),
        boxShadow: `0 0 0 ${2 + 2 * h}px rgba(17,183,242,${0.6 * k + 0.4 * h}), 0 0 ${30 + 50 * h}px rgba(17,183,242,${0.35 * k + 0.5 * h}), 0 30px 60px rgba(0,0,0,${0.5 * k})`,
        transform: `translate3d(${l.dx * k}px, ${dy}px, ${z}px) rotateZ(${l.rz * k}deg) scale(${1 + 0.06 * h})` }}>
        <img src={staticFile(l.src)} style={{ position: "absolute", left: 0, top: -l.y, width: 400, display: "block" }} />
      </div>
    );
  };

  // ── shards burst out on the split and on the snap ──
  const shards = (at: number, n: number, seed: string) => {
    const p = seg(t, at, at + 1.0);
    if (p <= 0 || p >= 1) return null;
    return Array.from({ length: n }, (_, i) => {
      const a = random(`${seed}a${i}`) * Math.PI * 2, d = (500 + 700 * random(`${seed}d${i}`)) * outExpo(p);
      const s = 10 + 24 * random(`${seed}s${i}`), sq = i % 3 === 0;
      return <div key={`${seed}${i}`} style={{ position: "absolute", left: cx + Math.cos(a) * d - s / 2, top: cy + Math.sin(a) * d * 1.2 - s / 2, width: s, height: s, borderRadius: sq ? 3 : s,
        background: i % 2 ? "#fff" : C.acc, opacity: 1 - p, transform: `rotate(${360 * p * random(`${seed}r${i}`)}deg)`, boxShadow: `0 0 ${2 * s}px ${C.acc}` }} />;
    });
  };
  const ring = seg(t, T.snap + 0.3, T.snap + 0.9);
  const flash = Math.min(seg(t, T.end - 0.3, T.end), 1 - seg(t, T.end, T.end + 0.25));

  // ── type: hook lines slam, the three words drop in letter by letter ──
  const slam = (a: number, b: number): React.CSSProperties => ({ opacity: t >= a ? 1 - seg(t, b, b + 0.2) : 0, transform: `translateY(${-120 * inOut(seg(t, b, b + 0.2))}px) scale(${lerp(1.7, 1, outExpo(seg(t, a, a + 0.25)))})` });
  const Word = (text: string, a: number, b: number, top: number, size: number) => {
    if (t < a || t > b + 0.25) return null;
    const out = seg(t, b, b + 0.25);
    return (
      <div style={{ position: "absolute", left: B.x, top, width: B.w, textAlign: "center", opacity: 1 - out, transform: `scale(${1 + 0.4 * out})` }}>
        <H1 size={size} style={{ color: "#fff", textShadow: shadow }}>
          {[...text].map((ch, i) => {
            const k = seg(t, a + 0.035 * i, a + 0.035 * i + 0.35);
            return <span key={i} style={{ display: "inline-block", color: ch === "." ? C.acc : "#fff", opacity: k > 0 ? 1 : 0, transform: `translateY(${lerp(-90, 0, outBack(k))}px) scale(${lerp(1.8, 1, outExpo(k))})` }}>{ch}</span>;
          })}
        </H1>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {/* ── surf bed, graded blue, with a blueprint dot grid while the app is apart ── */}
      <Footage src="footage/1306-145340152_medium.mp4" from={0} to={T.end} startFrom={1} dark={0.45} zoom={0.15} fadeIn={0.05} fadeOut={0.05} />
      {t < T.end && (
        <>
          <AbsoluteFill style={{ background: `radial-gradient(1100px 1500px at 50% ${(cy / height) * 100}%, rgba(3,42,250,.3) 0%, rgba(0,0,0,.6) 100%)` }} />
          <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(17,183,242,.55) 1.5px, transparent 1.5px)", backgroundSize: "36px 36px", opacity: 0.35 * ek }} />
        </>
      )}

      {t < T.end && shards(T.burst, 36, "b")}

      {/* ── the phone, then its layers in 3D; the words land between the back layers and the nav bar ── */}
      {t < T.end && (
        <Phone pose={{ ...pose, o: pose.o * bodyO }} cx={cx} cy={cy} glow={0.3}>
          <Screen src={HOME} />
        </Phone>
      )}
      {/* ── hook, over the phone ── */}
      {t < T.burst && (
        <div style={{ position: "absolute", left: B.x, top: B.y + 20, width: B.w, textAlign: "center" }}>
          <H1 size={104} style={{ color: "#fff", textShadow: shadow, ...slam(0.1, T.burst - 0.4) }}>Here's what's</H1>
          <H1 size={104} style={{ color: "#fff", textShadow: shadow, ...slam(0.4, T.burst - 0.35) }}>inside Rosa<span style={{ color: C.acc }}>.</span></H1>
        </div>
      )}
      {exploded && <Rig pose={pose} cx={cx} cy={cy}>{LAYERS.map((l, i) => !l.front && layer(l, i))}</Rig>}
      {Word("Fast.", T.fast, T.free - 0.1, B.y + 250, 180)}
      {Word("Free.", T.free, T.world - 0.1, B.y + 420, 180)}
      {Word("Worldwide.", T.world, T.snap, B.y + 600, 150)}
      {exploded && <Rig pose={pose} cx={cx} cy={cy}>{LAYERS.map((l, i) => l.front && layer(l, i))}</Rig>}

      {ring > 0 && ring < 1 && (
        <div style={{ position: "absolute", left: cx - 1100 * outExpo(ring), top: cy - 1100 * outExpo(ring), width: 2200 * outExpo(ring), height: 2200 * outExpo(ring), borderRadius: "50%", border: `6px solid ${C.acc}`, opacity: 1 - ring, boxShadow: `0 0 60px ${C.acc}` }} />
      )}
      {t < T.end && shards(T.snap + 0.3, 28, "s")}

      {/* ── end card ── */}
      <Footage src="footage/310248_large.mp4" from={T.end} to={T.out} startFrom={6} dark={0.55} zoom={0.1} fadeIn={0.05} />
      {t >= T.end && (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(800px 900px at 50% 45%, rgba(3,42,250,.25) 0%, rgba(0,0,0,.55) 100%)" }} />
          <div style={{ position: "absolute", left: B.x, top: B.y + 150, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 176, height: 176, opacity: seg(t, T.end, T.end + 0.12), transform: `scale(${lerp(0.2, 1, outBack(seg(t, T.end, T.end + 0.5)))})` }} />
            <H1 size={100} style={{ marginTop: 56, color: "#fff", ...slam(T.end + 0.3, T.out + 1) }}>All of it, free<span style={{ color: C.acc }}>.</span></H1>
            <div style={{ ...font, display: "inline-flex", alignItems: "center", padding: "26px 60px", borderRadius: 999, background: C.acc, color: "#fff", fontWeight: 800, fontSize: 60, marginTop: 120,
              boxShadow: `0 0 ${36 + 14 * Math.sin(t * 3)}px rgba(17,183,242,.85), 0 0 90px rgba(17,183,242,.45)`,
              opacity: seg(t, T.end + 0.8, T.end + 0.95), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end + 0.8, T.end + 1.15)))})` }}>rosa.surf</div>
          </div>
        </>
      )}

      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

export default Film;
