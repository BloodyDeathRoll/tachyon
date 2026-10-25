import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, Credit, Eyebrow, Footage, H1, Phone, SAFE, Screen, Sub, Variant, font, inOut, lerp, outBack, outExpo, rise, seg, useInter, useT, win } from "./lib";

/*
  Favorites, 15 s: star a break once and it waits on Home, grouped by country. Same idea as the
  2026-10-04 favorites reel: dynamic, fun, smooth, show the feature and move along.
  Spot names and ratings: the live index of 2026-10-25 (Uluwatu 95 Firing, Supertubos 90 Firing,
  Pipeline 67 Good, Snapper Rocks 54 Good, Teahupoo 63 Good, Carcavelos 39 Fair). The favorites
  list itself is drawn in the app's own style (the real list needs a signed-in account).
*/

const FAVS = [
  { country: "Indonesia", spots: [["Uluwatu", 95, "Firing", "1.3–2.0 m"]] },
  { country: "Portugal", spots: [["Supertubos", 90, "Firing", "0.7–1.0 m"], ["Carcavelos", 39, "Fair", "0.5–0.8 m"]] },
  { country: "Hawaii", spots: [["Banzai Pipeline", 67, "Good", "1.1–1.7 m"]] },
  { country: "Australia", spots: [["Snapper Rocks", 54, "Good", "0.8–1.2 m"]] },
  { country: "French Polynesia", spots: [["Teahupoo", 63, "Good", "1.2–1.8 m"]] },
] as const;
const bucketColor = (b: string) => (b === "Firing" || b === "Epic" ? C.epic : b === "Good" ? C.good : b === "Fair" ? C.fair : "#6f7590");

export const Favorites: React.FC<{ variant: Variant }> = ({ variant }) => {
  useInter();
  const t = useT();
  const B = SAFE[variant];
  const T = { hook: 0, star: 2.2, list: 5.2, tap: 9.0, end: 12.4, out: 15 };

  const float = { ry: 12 * Math.sin(t * 0.5 + 0.6), rx: 4 * Math.sin(t * 0.37 + 1.3), rz: -1.5 + Math.sin(t * 0.3 + 2.1) };
  const enter = outExpo(seg(t, T.star - 0.5, T.star + 0.4));
  const exit = inOut(seg(t, T.end - 0.5, T.end + 0.2));
  const pose = { x: -205, y: lerp(760, -30, enter) + 6 * Math.sin(t * 0.6) + 900 * exit, s: lerp(0.85, 0.98, enter), rx: float.rx + lerp(12, 0, enter), ry: float.ry + lerp(20, 0, enter), rz: float.rz, o: t < T.star - 0.5 ? 0 : 1 - exit };

  // the star tap on the spot page
  const tapK = seg(t, T.star + 0.9, T.star + 1.25);
  const starFill = outBack(seg(t, T.star + 1.1, T.star + 1.5));
  const burst = seg(t, T.star + 1.1, T.star + 1.7);
  // swipe to the favorites list
  const listX = 400 * (1 - outExpo(seg(t, T.list - 0.3, T.list + 0.3)));
  const dayTap = seg(t, T.tap, T.tap + 0.25);

  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <Footage src="footage/218670_large.mp4" from={0} to={T.star + 1.2} startFrom={4} dark={0.5} zoom={0.1} />
      <AbsoluteFill style={{ background: "radial-gradient(900px 1100px at 50% 35%, #07203a 0%, #03101f 50%, #000 100%)", opacity: win(t, T.star + 0.4, T.end - 0.2, 0.9, 0.7) }} />
      <Footage src="footage/310248_large.mp4" from={T.end - 0.6} to={T.out} startFrom={6} dark={0.5} zoom={0.1} fadeIn={1.0} />

      {/* hook */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 130 }}>
        <Eyebrow style={rise(t, 0.1, T.star - 0.1)}>Your spots</Eyebrow>
        <H1 style={{ marginTop: 26, ...rise(t, 0.25, T.star - 0.1) }}>All your</H1>
        <H1 style={{ ...rise(t, 0.4, T.star - 0.1) }}>breaks.</H1>
        <Sub style={{ marginTop: 34, maxWidth: 760, ...rise(t, 0.6, T.star - 0.1) }}>Star a spot once. It waits on Home.</Sub>
      </div>

      <Phone pose={pose}>
        {/* the spot page with its star (top right of the header in the capture) */}
        <Screen src="captures/spot-uluwatu-full.png" scroll={48} />
        {/* finger + star fill overlay in screen coordinates (400×860) */}
        <div style={{ position: "absolute", left: 300, top: 14, width: 44, height: 44, borderRadius: 22, background: "rgba(17,183,242,.18)", border: "2px solid rgba(255,255,255,.9)", opacity: tapK > 0 && tapK < 1 ? 1 : 0, transform: `scale(${1 - 0.3 * Math.sin(Math.PI * tapK)})` }} />
        <svg style={{ position: "absolute", left: 306, top: 20 }} width={32} height={32} viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.2l1.5-7L2 9.4l7-.8z" fill={C.acc} opacity={starFill} transform={`scale(${lerp(0.4, 1, starFill)})`} style={{ transformOrigin: "12px 12px" }} /></svg>
        {[...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2; return <div key={i} style={{ position: "absolute", left: 320, top: 34, width: 6, height: 6, borderRadius: 3, background: C.acc, opacity: burst > 0 && burst < 1 ? 1 - burst : 0, transform: `translate(${Math.cos(a) * 34 * outExpo(burst)}px, ${Math.sin(a) * 34 * outExpo(burst)}px)` }} />; })}
        {/* favorites list, in the app's style */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 860, background: "#060607", transform: `translateX(${listX}px)`, ...font }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "58px 18px 10px", fontSize: 19, fontWeight: 700 }}><Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 22, height: 22 }} /> rosa<span style={{ color: C.acc }}>.</span> <span style={{ fontWeight: 500, color: "#cfd4df" }}>Your spots</span></div>
          <div style={{ display: "flex", gap: 6, padding: "6px 18px 10px" }}>
            {["Today 25", "Sun 26", "Mon 27", "Tue 28", "Wed 29"].map((d, i) => (
              <div key={d} style={{ padding: "7px 9px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: (i === 0 && dayTap < 0.5) || (i === 1 && dayTap >= 0.5) ? "#1b2432" : "transparent", color: "#f5f0e8", border: "1px solid #1b2432" }}>{d}</div>
            ))}
          </div>
          {FAVS.map((g, gi) => {
            const a = T.list + 0.15 + gi * 0.18;
            return (
              <div key={g.country} style={{ padding: "6px 18px 0", ...rise(t, a, T.end + 1, 24, 0.5, 0.01) }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "#8a92a6", margin: "8px 0 6px" }}>{g.country.toUpperCase()}</div>
                {g.spots.map(([n, r, b, h]) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: "#0e1118", marginBottom: 8, boxShadow: "0 0 0 1px #171b25 inset" }}>
                    <div><div style={{ fontSize: 17, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13, color: "#9aa3b2", marginTop: 2 }}>{dayTap >= 0.5 ? "tomorrow" : "today"} · {h}</div></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", gap: 2 }}>{[...Array(5)].map((_, k) => <div key={k} style={{ width: 6, height: 18, borderRadius: 2, background: k < Math.round(r / 20) ? bucketColor(b) : "#1b2432" }} />)}</div>
                      <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 999, background: bucketColor(b), color: "#fff" }}>{b}</span>
                      <svg width={16} height={16} viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.2l1.5-7L2 9.4l7-.8z" fill={C.acc} /></svg>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {/* day tap finger */}
          <div style={{ position: "absolute", left: 84, top: 108, width: 44, height: 44, borderRadius: 22, background: "rgba(17,183,242,.18)", border: "2px solid rgba(255,255,255,.9)", opacity: dayTap > 0 && dayTap < 1 ? 1 : 0, transform: `scale(${1 - 0.3 * Math.sin(Math.PI * dayTap)})` }} />
        </div>
      </Phone>

      {/* callouts on the right */}
      <div style={{ position: "absolute", left: B.x + 530, top: B.y + 90, width: 420 }}>
        <div style={rise(t, T.star + 1.3, T.list + 1.2)}><Eyebrow>One tap</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>Starred.</H1><Sub size={28} style={{ marginTop: 10 }}>Uluwatu waits on Home now.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.list + 1.4, T.tap + 1.6) }}><Eyebrow>Grouped</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>By country.</H1><Sub size={28} style={{ marginTop: 10 }}>Every break you follow, one screen.</Sub></div>
        <div style={{ position: "absolute", left: 0, top: 0, ...rise(t, T.tap + 1.8, T.end - 0.1) }}><Eyebrow>Tomorrow?</Eyebrow><H1 size={64} style={{ marginTop: 12 }}>One tap.</H1><Sub size={28} style={{ marginTop: 10 }}>16 days out, every spot at once.</Sub></div>
      </div>

      {/* end card */}
      <div style={{ position: "absolute", left: B.x, top: B.y + 120, width: B.w, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 34 }}>
        <Img src={staticFile("fonts/rosa-icon.svg")} style={{ width: 168, height: 168, opacity: win(t, T.end, T.out + 1, 0.7, 0.01), transform: `scale(${lerp(0.6, 1, outBack(seg(t, T.end, T.end + 0.8)))})` }} />
        <div style={{ ...font, fontWeight: 800, fontSize: 150, letterSpacing: "-.05em", lineHeight: 1, ...rise(t, T.end + 0.15, T.out + 1) }}>rosa<span style={{ color: C.acc }}>.</span></div>
        <Sub size={40} style={rise(t, T.end + 0.3, T.out + 1)}>All your breaks. One tap each.</Sub>
        <div style={{ ...font, display: "inline-flex", alignItems: "center", gap: 18, padding: "22px 44px", borderRadius: 999, background: C.acc, color: "#02131c", fontWeight: 800, fontSize: 40, ...rise(t, T.end + 0.45, T.out + 1) }}>rosa.surf <span>→</span></div>
        <Sub size={30} style={rise(t, T.end + 0.6, T.out + 1)}>free · link in bio</Sub>
      </div>
      <Credit t={t} from={T.end + 0.8} />
    </AbsoluteFill>
  );
};
