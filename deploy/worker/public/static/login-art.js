// The sign-in page's left panel (src/index.ts loginPage; the Figma screen "login").
// The brand pattern (login-art.svg) as a board of parts in constant motion: every shape of
// the drawing is its own part, and each sits on the drawing's 320 grid or an inner grid of it
// (160, 80). Squares, triangles and quarter circles turn a quarter in their cell, half shapes
// flip, diamonds and the star spin, dots hop round a small square.
// The parts take turns, slowly: a new one starts as another lands, so two are moving at any
// time and the rest are still. Every part is back where it began after 4 turns, so it loops.
// At the first frame every part rests where the drawing has it: the page shows the same
// drawing as a plain background, so nothing jumps when the canvas takes over.
// No canvas, or reduced motion: the plain background stays.
(() => {
  const host = document.querySelector(".brand");
  const cv = host && host.querySelector("canvas");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const g = cv && cv.getContext("2d", { alpha: false });
  if (!g) return;

  const ART_W = 1280, ART_H = 1440; // login-art.svg
  const MOVE = 3.2; // seconds one move takes
  const GAP = MOVE / 2; // between one part's start and the next one's: so two are moving at a time
  const TAU = Math.PI * 2;

  const nums = (s) => (s.match(/-?\d*\.?\d+/g) || []).map(Number);
  /** The points of a path of M, L, H, V and C commands, control points too (enough for its box). */
  function points(d) {
    const out = [];
    let x = 0, y = 0;
    for (const [, c, rest] of d.matchAll(/([MLHVC])([^MLHVCZ]*)/g)) {
      const n = nums(rest);
      if (c === "H") for (const v of n) out.push([(x = v), y]);
      else if (c === "V") for (const v of n) out.push([x, (y = v)]);
      else for (let i = 0; i + 1 < n.length; i += 2) out.push([(x = n[i]), (y = n[i + 1])]);
    }
    return out;
  }
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

  /** One shape of the drawing as a part: its outline, its box, and how it moves. */
  function part(el, i) {
    const a = (k) => +el.getAttribute(k) || 0;
    const path = new Path2D();
    let pts, kind = "";
    if (el.tagName === "ellipse") { // all near circles, so their rotate(-90) changes nothing
      path.ellipse(a("cx"), a("cy"), a("rx"), a("ry"), 0, 0, TAU);
      pts = [[a("cx") - a("rx"), a("cy") - a("ry")], [a("cx") + a("rx"), a("cy") + a("ry")]];
      kind = "dot";
    } else if (el.tagName === "rect") {
      const x = a("x"), y = a("y"), w = a("width"), h = a("height"), r = a("rx");
      const m = nums(el.getAttribute("transform") || "");
      const M = m.length === 6 ? new DOMMatrix(m) : new DOMMatrix();
      const q = new Path2D();
      if (r && q.roundRect) q.roundRect(x, y, w, h, r);
      else q.rect(x, y, w, h);
      path.addPath(q, M);
      pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [M.a * px + M.c * py + M.e, M.b * px + M.d * py + M.f]);
      if (m.length === 6) kind = "diamond";
      else if (r >= Math.min(w, h) / 2 - 1) kind = "dot"; // rounded all the way: a circle
    } else {
      const d = el.getAttribute("d");
      path.addPath(new Path2D(d));
      pts = points(d);
      if ((d.match(/L/g) || []).length >= 8) kind = "star";
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (!kind) kind = w / h > 0.85 && w / h < 1.18 ? "turn" : "flip";
    return {
      path, kind, cx, cy, w, h,
      phase: Infinity, // when it first moves (set once all the parts are known)
      fill: el.getAttribute("fill"),
      soft: !!el.closest("g[style]"), // the faded repeat at the drawing's foot
      dir: rnd(i, 4) < 0.5 ? -1 : 1,
      turn: Math.floor(rnd(i, 5) * 4), // which way a dot sets off
      hop: w < 110 ? 80 : 0, // a small dot hops one step of the inner grid, a big one only breathes
    };
  }

  const ease = (u) => { const c = 1.3; u *= 2; return u < 1 ? (u * u * ((c + 1) * u - c)) / 2 : ((u -= 2) * u * ((c + 1) * u + c) + 2) / 2; }; // a little back and past
  /** How many moves the part has made by time t, the one under way counted in part. 0 until its first. */
  function state(s, t) {
    const tau = t - s.phase, m = Math.floor(tau / per), u = (tau - m * per) / MOVE;
    return tau < 0 ? 0 : m + (u < 1 ? ease(u) : 1);
  }
  const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

  let parts = [], per = 0, raf = 0, t0 = 0; // per: seconds between two moves of one part
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    const k = Math.max(cv.width / ART_W, cv.height / ART_H), ox = (cv.width - ART_W * k) / 2; // cover, from the top centre
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#111";
    g.fillRect(0, 0, cv.width, cv.height);
    for (const s of parts) {
      const q = state(s, t), bump = Math.abs(Math.sin(Math.PI * q)); // 0 at rest, 1 mid move
      let ang = 0, sx = 1, sy = 1, dx = 0, dy = 0;
      if (s.kind === "turn") { // a quarter turn, shrunk while askew so it never leaves its cell
        ang = s.dir * q * (TAU / 4);
        sx = sy = 1 / (Math.abs(Math.cos(ang)) + Math.abs(Math.sin(ang)));
      } else if (s.kind === "flip") { // over its short side
        if (s.w < s.h) sx = Math.cos(Math.PI * q);
        else sy = Math.cos(Math.PI * q);
      } else if (s.kind === "diamond") {
        ang = s.dir * q * (TAU / 4);
        sx = sy = 1 + 0.1 * bump;
      } else if (s.kind === "star") { // a fifth of a turn: it lands on itself
        ang = s.dir * q * (TAU / 5);
        sx = sy = 1 + 0.18 * bump;
      } else { // dot: round the corners of a small square
        const n = Math.floor(q), f = q - n;
        const [ax, ay] = CORNERS[(((n + s.turn) % 4) + 4) % 4], [bx, by] = CORNERS[(((n + 1 + s.turn) % 4) + 4) % 4];
        const [zx, zy] = CORNERS[s.turn]; // where it rests at time 0: no offset there
        dx = (ax + (bx - ax) * f - zx) * s.hop * s.dir;
        dy = (ay + (by - ay) * f - zy) * s.hop;
        sx = sy = 1 - 0.2 * bump;
      }
      g.setTransform(k, 0, 0, k, ox, 0);
      g.globalCompositeOperation = s.soft ? "soft-light" : "source-over";
      g.translate(s.cx + dx, s.cy + dy);
      g.rotate(ang);
      g.scale(sx, sy);
      g.translate(-s.cx, -s.cy);
      g.fillStyle = s.fill;
      g.fill(s.path);
    }
  }

  const go = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    cv.classList.toggle("on", !still.matches);
    if (still.matches) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(host.clientWidth * dpr);
    cv.height = Math.round(host.clientHeight * dpr);
    raf = requestAnimationFrame(frame);
  };
  // any failure (no file, a shape this browser will not parse): the plain background stays
  fetch("/static/login-art.svg").then((r) => (r.ok ? r.text() : Promise.reject())).then((text) => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    // every shape of the drawing but its ground
    parts = [...doc.querySelectorAll("g rect, g ellipse, g path")].filter((el) => el.getAttribute("width") != ART_W).map(part);
    parts = parts.filter((s) => !s.soft || s.cy - s.h / 2 > 1279); // the drawing clips its faded repeat to the foot
    if (!parts.length) return;
    // the turns, in a shuffled order. The faded repeat at the foot takes none: it hardly shows
    const turns = parts.filter((s) => !s.soft).map((s, i) => [rnd(i, 2), s]).sort((a, b) => a[0] - b[0]);
    turns.forEach(([, s], n) => { s.phase = n * GAP; });
    per = turns.length * GAP;
    new ResizeObserver(go).observe(host); // fires once at the start too
    still.addEventListener("change", go); // reduced motion turned on stops it, turned off starts it
  }).catch(() => {});
})();
