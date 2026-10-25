import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, TimeMap, Eyebrow, Footage, H1, Phone, Pill, SAFE, Screen, Sub, Variant, countUp, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "./lib";

/*
  Showreel, 30 s. The brief that produced the originals: "a dynamic motion graphics video that
  shows a user using the rosa app … like it's your showreel for a resume. Go all out."
  Chapters as in the 2026-10-04 reel: hook · 01 FAST · 02 FREE · 03 CLEAR · 04 NO ADS · 05 GETS BETTER · end.
  Every number: clients/rosa/product.md (78 KB gzip entry, 3,056 spots, 16 days, 4× a day) or the
  2026-10-25 live captures (Uluwatu Epic 1.3–2.0 m). Text stays inside SAFE[variant].
*/

const CH = { hook: 0, fast: 3.0, free: 8.0, clear: 12.5, noads: 19.0, better: 22.5, end: 27.0, out: 30 };

export const SHOWREEL_SECONDS = 18;   // rev 2026-10-25: "way too long, too slow" → 30 s of story in 18 s
export const Showreel: React.FC<{ variant: Variant }> = ({ variant }) => (
  <TimeMap.Provider value={[[0, 0], [SHOWREEL_SECONDS, CH.out]]}><ShowreelBody variant={variant} /></TimeMap.Provider>
);
const ShowreelBody: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];

  // ── phone pose: scripted beats + a continuous 3D float ──────────────────────
  const float = { ry: 14 * Math.sin(t * 0.42 + 0.6), rx: 5 * Math.sin(t * 0.31 + 1.3), rz: -2 + 1.1 * Math.sin(t * 0.27 + 2.1), y: 7 * Math.sin(t * 0.5 + 0.4) };
  const enter = outExpo(seg(t, CH.fast - 0.4, CH.fast + 0.6));
  const exit = inOut(seg(t, CH.better - 0.4, CH.better + 0.3));          // leaves for the globe chapter
  const back = outExpo(seg(t, CH.end - 0.2, CH.end + 0.6));              // returns small on the end card? no: end card is type + mark
  const clearK = inOut(seg(t, CH.clear, CH.clear + 0.8)) * (1 - inOut(seg(t, CH.noads - 0.5, CH.noads)));   // leans left for the callouts
  const pose = {
    x: lerp(-205, -235, clearK),   // phone sits left; copy column starts at B.x + 500
    y: lerp(700, -40, enter) + float.y + 900 * exit,
    s: lerp(0.9, 0.98, enter) - 0.08 * clearK,
    rx: float.rx + lerp(10, 0, enter) + 8 * clearK,
    ry: float.ry + lerp(-18, 0, enter) + 22 * clearK,
    rz: float.rz,
    o: t < CH.fast - 0.4 ? 0 : 1 - exit,
  };
  // screens: home → uluwatu (scroll) → map → charts
  const uluO = seg(t, CH.free - 0.2, CH.free + 0.3) * (1 - seg(t, CH.noads - 0.3, CH.noads + 0.2));
  const mapO = seg(t, CH.noads - 0.3, CH.noads + 0.2);
  const uluScroll = 48 + 110 * inOut(seg(t, CH.clear + 0.6, CH.clear + 1.4)) + 330 * inOut(seg(t, CH.clear + 3.4, CH.clear + 4.2));
  const swipe = (a: number) => 400 * (1 - outExpo(seg(t, a, a + 0.5)));

  // ── callouts for CLEAR ─────────────────────────────────────────────────────
  const callouts = [
    ["A", "Your favorites", "Star a spot and it waits on Home"],
    ["B", "16 days at a glance", "Three-hour steps"],
    ["C", "Why this rating", "Size · Period · Wind"],
    ["D", "Hour by hour", "Surf · Swell · Wind · Energy"],
  ];

  const globeK = outExpo(seg(t, CH.better, CH.better + 1.0));
  const zoom = Math.pow(10, 0.6 * Easing_in3(seg(t, CH.end - 1.2, CH.end + 0.3)));
  const spots = countUp(t, CH.better + 0.3, CH.better + 2.2, 3056);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      {/* footage beds */}
      <Footage src="footage/310248_large.mp4" from={0} to={CH.fast + 1.0} startFrom={2} dark={0.45} zoom={0.1} />
      <Footage src="footage/1306-145340152_medium.mp4" from={CH.clear - 0.6} to={CH.noads + 0.6} startFrom={1} dark={0.62} zoom={0.06} />
      <Footage src="footage/218670_large.mp4" from={CH.end - 0.8} to={CH.out} startFrom={3} dark={0.5} zoom={0.1} fadeIn={1.2} />
      {/* dark panel while the phone is the subject */}
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, CH.fast + 0.4, CH.clear - 0.2, 0.8, 0.6) + win(t, CH.noads, CH.end - 0.6, 0.6, 0.8) }} />

      {/* ── hook ── */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.1, CH.fast - 0.1)}>Uluwatu · today</Eyebrow>
        <H1 style={{ marginTop: 26, ...rise(t, 0.25, CH.fast - 0.1) }}>Should</H1>
        <H1 style={{ ...rise(t, 0.4, CH.fast - 0.1) }}>I surf?</H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.6, CH.fast - 0.1) }}>One tap says yes or no, and why.</Sub>
      </div>

      {/* ── phone ── */}
      <Phone pose={pose}>
        <Screen src="captures/home.png" scroll={44} />
        <Screen src="captures/spot-uluwatu-full.png" scroll={uluScroll} o={uluO} x={uluO < 1 ? swipe(CH.free - 0.2) : 0} />
        <Screen src="captures/map.png" o={mapO} x={swipe(CH.noads - 0.3)} />
        <Screen src="captures/charts.png" o={seg(t, CH.noads + 1.6, CH.noads + 2.0)} x={swipe(CH.noads + 1.6)} />
      </Phone>

      {/* ── 01 FAST ── */}
      <Chapter t={t} B={B} from={CH.fast} to={CH.free} n="01" title="Fast" big="Fast." unit="" sub="Opens in a blink. The whole app is 78 KB." align="left" />
      {/* ── 02 FREE ── */}
      <Chapter t={t} B={B} from={CH.free} to={CH.clear} n="02" title="Free" big="$0" unit="" sub="No paywall. No sign-in to check the surf." align="left"
        extra={<div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 18, ...rise(t, CH.free + 1.0, CH.clear - 0.1) }}><Pill bg={C.epic} fg="#dff7e6">Epic</Pill><span style={{ ...font, fontWeight: 800, fontSize: 56, letterSpacing: "-.03em" }}>1.3–2.0 m</span></div>} />
      {/* ── 03 CLEAR: four callouts cascade on the right ── */}
      <div style={{ position: "absolute", left: B.x + 500, top: B.y + 60, width: 450 }}>
        <Eyebrow style={rise(t, CH.clear, CH.noads - 0.1)}>03 · Clear</Eyebrow>
        {callouts.map(([k, h, s], i) => {
          const a = CH.clear + 0.5 + i * 0.75;
          return (
            <div key={k} style={{ marginTop: i === 0 ? 24 : 30, ...rise(t, a, CH.noads - 0.1, 30) }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                
                <span style={{ ...font, fontSize: 44, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.05 }}>{h}</span>
              </div>
              <Sub size={26} style={{ marginTop: 4 }}>{s}</Sub>
            </div>
          );
        })}
      </div>
      {/* ── 04 NO ADS ── */}
      <Chapter t={t} B={B} from={CH.noads} to={CH.better} n="04" title="No ads. No bloat." big="" unit="" sub="Just the surf." align="left" bigAsTitle />
      {/* ── 05 GETS BETTER: dotted globe + count ── */}
      <Globe t={t} B={B} k={globeK} zoom={zoom} visible={win(t, CH.better, CH.end + 0.3, 0.6, 0.5)} />
      <div style={{ position: "absolute", left: B.x, top: B.y + 560, width: B.w }}>
        <Eyebrow style={rise(t, CH.better + 0.2, CH.end - 0.2)}>05 · Gets better</Eyebrow>
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.045em", lineHeight: 0.95, marginTop: 10, ...rise(t, CH.better + 0.3, CH.end - 0.2) }}>{spots.toLocaleString("en-GB")}</div>
        <Sub size={34} style={{ marginTop: 10, ...rise(t, CH.better + 0.6, CH.end - 0.2) }}><b style={{ color: C.ink }}>spots worldwide</b> · 16 days · refreshed 4× a day</Sub>
      </div>
      {/* ── end card ── */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, CH.end, CH.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, CH.end, CH.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, CH.end + 0.15, CH.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, CH.end + 0.3, CH.out + 1)}>Free surf forecast, worldwide.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, CH.end + 0.45, CH.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, CH.end + 0.6, CH.out + 1)}>link in bio</Sub>
      </div>
      <Credit t={t} from={CH.end + 0.8} />
    </AbsoluteFill>
  );
};

const Easing_in3 = (x: number) => x * x * x;

const Chapter: React.FC<{ t: number; B: { x: number; y: number; w: number; h: number }; from: number; to: number; n: string; title: string; big: string; unit: string; sub: string; align: "left" | "right"; extra?: React.ReactNode; bigAsTitle?: boolean }> =
  ({ t, B, from, to, n, title, big, unit, sub, extra, bigAsTitle }) => {
    if (t < from - 0.1 || t > to + 0.2) return null;
    return (
      <div style={{ position: "absolute", left: B.x + 500, top: B.y + 90, width: 450 }}>
        <Eyebrow style={rise(t, from, to - 0.1)}>{n} · {title}</Eyebrow>
        {bigAsTitle ? (
          <H1 size={92} style={{ marginTop: 20, ...rise(t, from + 0.15, to - 0.1) }}>{title}</H1>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, ...rise(t, from + 0.15, to - 0.1) }}>
            <span style={{ ...font, fontWeight: 800, fontSize: big.length > 3 ? 136 : 170, letterSpacing: "-.05em", lineHeight: 0.9, color: C.acc }}>{big}</span>
            {unit && <span style={{ ...font, fontWeight: 700, fontSize: 48, color: C.muted }}>{unit}</span>}
          </div>
        )}
        <Sub style={{ marginTop: 18, ...rise(t, from + 0.35, to - 0.1) }}>{sub}</Sub>
        {extra}
      </div>
    );
  };

/** a dotted globe: deterministic points on a sphere, lit, spinning; zooms into the camera at the end */
const Globe: React.FC<{ t: number; B: { x: number; y: number; w: number; h: number }; k: number; zoom: number; visible: number }> = ({ t, B, k, zoom, visible }) => {
  if (visible <= 0) return null;
  const cx = 540, cy = B.y + 300, R = 300 * k * zoom;
  const pts: React.ReactNode[] = [];
  const N = 900; const spin = t * 0.35;
  for (let i = 0; i < N; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / N); const theta = Math.PI * (1 + Math.sqrt(5)) * i + spin;
    const x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
    if (z < -0.15) continue;
    const land = ((Math.sin(phi * 7 + theta * 3) + Math.cos(phi * 3 - theta * 5)) > 0.55);
    const s = (1.6 + 2.2 * (z + 0.15)) * Math.min(2.2, zoom);
    pts.push(<circle key={i} cx={cx + x * R} cy={cy - y * R} r={s} fill={land ? C.acc : "#2a4a66"} opacity={0.35 + 0.65 * (z + 0.15) / 1.15} />);
  }
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, opacity: visible }}>
      <circle cx={cx} cy={cy} r={R} fill="radial-gradient(#07203a,#000)" opacity={0} />
      {pts}
    </svg>
  );
};
