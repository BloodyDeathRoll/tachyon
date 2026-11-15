// The sign-in page's ground, the whole screen (src/index.ts loginPage).
// The line wave of shaharnaor.com (its js/lineWave.js, a p5 sketch), without p5 and without
// its click, and bent into a ring: a dotted circle whose radius follows a noise field that
// drifts in time, in the logo's neon green; each frame veils the last a little, so the ring
// leaves a fading trail.
// Every 6 seconds the dot spacing and the drift speed change, as in the sketch.
// Reduced motion: one still ring.
(() => {
  const host = document.querySelector(".brand");
  const cv = host && host.querySelector("canvas");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const g = cv && cv.getContext("2d", { alpha: false });
  if (!g) return;

  const GROUND = "17,17,17"; // the page's #111
  const LINE = "#8DF000"; // the logo's green
  const TAU = Math.PI * 2;
  const FRAME = 1000 / 60; // the sketch runs at 60 frames a second, whatever the screen does

  // p5's noise(x, y): four octaves of smoothed value noise, each half the one before
  const P = Float32Array.from({ length: 4096 }, Math.random);
  const smooth = (v) => 0.5 * (1 - Math.cos(v * Math.PI));
  function noise(x, y) {
    let xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sum = 0, amp = 0.5;
    for (let o = 0; o < 4; o++) {
      const at = xi + (yi << 4), sx = smooth(xf), sy = smooth(yf);
      let a = P[at & 4095], b = P[(at + 16) & 4095];
      a += sx * (P[(at + 1) & 4095] - a);
      b += sx * (P[(at + 17) & 4095] - b);
      sum += (a + sy * (b - a)) * amp;
      amp *= 0.5;
      xi <<= 1; xf *= 2; yi <<= 1; yf *= 2;
      if (xf >= 1) { xi++; xf--; }
      if (yf >= 1) { yi++; yf--; }
    }
    return sum;
  }

  let W = 0, H = 0, raf = 0, last = 0, frames = 0;
  let time = 0, gap = 2, drift = 0.003; // the sketch's time, f and tf
  /** One frame of the sketch: the veil, then the ring. */
  function step(veil) {
    g.fillStyle = `rgba(${GROUND},${veil})`;
    g.fillRect(0, 0, W, H);
    g.fillStyle = LINE;
    // the ring reads the noise along a circle that travels through the field: so it closes on itself
    const cx = W / 2, cy = H / 2, base = Math.min(W, H) * 0.34, turn = gap / base;
    for (let a = 0; a < TAU; a += turn) {
      const c = Math.cos(a), s = Math.sin(a), r = base * (0.35 + 1.3 * noise(10 + 0.9 * c + time * 2, 10 + 0.9 * s + time));
      g.fillRect(cx + c * r, cy + s * r, 1, 1);
    }
    time += drift;
    if (++frames % 360 === 0) { gap = 1 + Math.random() * 2; drift = 0.0008 + Math.random() * 0.0022; }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // at most 3 at once: a tab that was away does not race to catch up
    const n = Math.min(3, Math.floor((now - last) / FRAME));
    for (let i = 0; i < n; i++) step(0.07);
    last = n === 3 ? now : last + n * FRAME; // the part of a frame left over counts towards the next
  }

  const go = () => {
    cancelAnimationFrame(raf);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = host.clientWidth;
    H = host.clientHeight;
    cv.width = Math.round(W * dpr); // also clears it
    cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    step(1);
    last = performance.now();
    if (!still.matches) raf = requestAnimationFrame(frame);
  };
  new ResizeObserver(go).observe(host); // fires once at the start too
  still.addEventListener("change", go); // reduced motion turned on stops it, turned off starts it
})();
