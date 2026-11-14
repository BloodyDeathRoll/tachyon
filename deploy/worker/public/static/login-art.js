// The sign-in page's left panel (src/index.ts loginPage; the Figma screen "login").
// One 18 s loop: the particles ride the logo's three orbits, fly out and build the brand
// pattern (login-art.svg), the pattern holds crisp while a light crosses it, then it falls
// back into the orbits. The page shows the same pattern as a plain background, and the loop
// starts in the hold, so nothing jumps when the canvas takes over. No WebGL, or reduced
// motion: the plain background stays.
(() => {
  const host = document.querySelector(".brand");
  const cv = host && host.querySelector("canvas");
  if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const gl = cv.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
  if (!gl) return;

  const LOOP = 18; // seconds. The shader's timeline is written in these seconds
  const START = 7.9; // the hold: what the plain background shows
  const ART_W = 1280, ART_H = 1440, BG = 17; // login-art.svg, and its ground #111

  const POINT_VS = `
precision highp float;
attribute vec2 aB;   // where the particle sits in the pattern, px from the top left
attribute vec3 aC;   // its colour there
attribute vec4 aR;   // four random numbers
uniform vec2 uRes;
uniform float uT, uSize, uCrisp;
varying vec4 vC;
varying float vAdd;
const float TAU = 6.28318530718;
const float LOOP = ${LOOP}.0;
float ss(float a, float b, float x) { x = clamp((x - a) / (b - a), 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }
void main() {
  float ph = uT / LOOP;
  vec2 C = uRes * vec2(0.5, 0.36);
  float S = min(uRes.x, uRes.y * 0.9);

  // A: the logo's atom. Three tilted orbits, each a comet (a dense head, a widening tail)
  // that turns a whole number of times per loop, so the loop closes
  float ring = floor(aR.x * 3.0);
  float tail = pow(aR.z, 2.4);
  float th = TAU * ((3.0 + ring) * ph - tail * 0.85) + ring * 2.1;
  float wide = 1.0 + (aR.w - 0.5) * (0.03 + tail * 0.22);
  vec2 e = vec2(cos(th) * 0.42, sin(th) * 0.135) * wide * S;
  float an = ring * 1.0472 - 0.2;
  vec2 A = C + vec2(e.x * cos(an) - e.y * sin(an), e.x * sin(an) + e.y * cos(an));
  float depth = sin(th);      // +1 at the near side of the orbit
  float glow = 1.0 - tail;
  if (aR.y < 0.03) {          // the nucleus
    float a2 = TAU * (aR.z + ph * (2.0 + floor(aR.w * 3.0)));
    float rad = S * 0.035 * sqrt(aR.w) * (1.0 + 0.25 * sin(TAU * (ph * 6.0 + aR.z)));
    A = C + rad * vec2(cos(a2), sin(a2));
    depth = 0.6; glow = 1.0;
  } else if (aR.y < 0.16) {   // dust over the whole panel
    A = uRes * vec2(aR.z, aR.w) + S * 0.04 * vec2(sin(TAU * (ph * 2.0 + aR.w)), cos(TAU * (ph * 3.0 + aR.z)));
    depth = -0.5; glow = 0.15;
  }

  // the timeline: out from the centre (2.6 s on), back along the diagonal (13 s on)
  float dn = clamp(length(aB - C) / (0.8 * length(uRes)), 0.0, 1.0);
  float dg = (aB.x / uRes.x + aB.y / uRes.y) * 0.5;
  float t0 = 2.6 + dn * 1.9 + aR.w * 0.5;
  float up = ss(t0, t0 + 1.7 + aR.z * 0.5, uT);
  float t1 = 13.0 + dg * 1.9 + aR.z * 0.4;
  float dw = ss(t1, t1 + 1.8 + aR.w * 0.5, uT);
  float m = up * (1.0 - dw);  // 0 in the atom, 1 in the pattern

  // the way between the two is an arc, to either side
  vec2 d = aB - A;
  vec2 nrm = vec2(-d.y, d.x) / (length(d) + 0.001);
  float arc = sin(3.14159265 * m);
  vec2 p = mix(A, aB, m) + nrm * arc * (fract(aR.x * 3.0) - 0.5) * S * 0.5 * (dw > 0.0 ? -1.0 : 1.0);
  p += m * uSize * 0.18 * vec2(sin(TAU * (ph * 5.0 + aR.z)), cos(TAU * (ph * 4.0 + aR.w)));

  // the light that crosses the held pattern, corner to corner
  float band = mix(-0.15, 1.15, clamp((uT - 8.3) / 3.4, 0.0, 1.0));
  float x = (dg - band) / 0.02;
  float sp = exp(-x * x) * step(0.999, m) * step(0.72, aR.z);

  float settled = ss(0.92, 1.0, m);
  float a = (0.26 + 0.1 * depth) * (0.35 + 0.65 * glow);
  a = mix(a, 0.8, ss(0.0, 0.2, m));
  a = mix(a, 1.0 - uCrisp, settled);  // the crisp pattern stands in for the settled particles
  vec3 col = mix(mix(aC, vec3(0.78, 0.94, 0.31), 0.5) * (0.8 + 0.5 * glow), aC, ss(0.3, 1.0, m));
  col = mix(col, vec3(0.9, 1.0, 0.62), sp * 0.8);
  vC = vec4(col, max(a, sp * 0.85));
  vAdd = max(mix(0.5, 0.0, ss(0.0, 0.5, m)), sp * 0.6);  // light adds up in the atom, paint covers in the pattern
  float size = uSize * (mix(0.5 + 0.25 * depth + 0.35 * glow, 1.0, ss(0.6, 1.0, m)) + 0.25 * arc) * (1.0 + 0.35 * sp);
  gl_PointSize = max(size, 1.0);
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`;
  const POINT_FS = `
precision mediump float;
varying vec4 vC;
varying float vAdd;
void main() {
  float a = smoothstep(0.5, 0.3, length(gl_PointCoord - 0.5)) * vC.a;
  gl_FragColor = vec4(vC.rgb * a, a * (1.0 - vAdd));
}`;
  // one quad, two uses: the veil that fades last frame's light (the trails), and the crisp pattern
  const QUAD_VS = `
attribute vec2 aP;
varying vec2 vU;
void main() { vU = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
  const QUAD_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uA, uArt;
varying vec2 vU;
void main() {
  vec3 c = mix(vec3(${BG}.0 / 255.0), texture2D(uTex, vU).rgb, uArt);
  gl_FragColor = vec4(c * uA, uA);
}`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    return p;
  }
  const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * x * (x * (x * 6 - 15) + 10); };

  let points, quad, uni, quadBuf, pointBuf, tex, count = 0, size = 1, raf = 0, last = 0;
  const t0 = performance.now();

  /** The pattern drawn as the page's background draws it (cover, from the top), then read back:
      the picture is the crisp layer, its coloured pixels are where the particles settle. */
  function build(img) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(host.clientWidth * dpr), H = Math.round(host.clientHeight * dpr);
    if (!W || !H) return false;
    cv.width = W; cv.height = H;
    const c2 = document.createElement("canvas");
    c2.width = W; c2.height = H;
    const g = c2.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#111"; g.fillRect(0, 0, W, H);
    const s = Math.max(W / ART_W, H / ART_H);
    g.drawImage(img, (W - ART_W * s) / 2, 0, ART_W * s, ART_H * s);
    const px = g.getImageData(0, 0, W, H).data;

    const want = Math.min(60000, Math.max(12000, (W * H) / (dpr * dpr) / 8));
    const step = Math.sqrt((W * H * 0.62) / want); // about 0.62 of the pattern is coloured
    const data = [];
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const bx = Math.min(W - 1, x + Math.random() * step), by = Math.min(H - 1, y + Math.random() * step);
        const i = ((by | 0) * W + (bx | 0)) * 4;
        const r = px[i], gr = px[i + 1], b = px[i + 2];
        if (Math.max(Math.abs(r - BG), Math.abs(gr - BG), Math.abs(b - BG)) < 14) continue; // the ground
        data.push(bx, by, r / 255, gr / 255, b / 255, Math.random(), Math.random(), Math.random(), Math.random());
      }
    }
    count = data.length / 9;
    size = step * 1.9;

    gl.viewport(0, 0, W, H);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.clearColor(BG / 255, BG / 255, BG / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    last = 0;
    return count > 0;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const T = ((now - t0) / 1000 + START) % LOOP;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1; // the first frame paints in full
    last = now;
    const crisp = ss(6.9, 7.8, T) * (1 - ss(12.2, 12.9, T));

    gl.useProgram(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(uni.aP);
    gl.vertexAttribPointer(uni.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uni.uArt, 0);
    gl.uniform1f(uni.uA, 1 - Math.exp(-dt * 9)); // the same trail length at any frame rate
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (crisp > 0) {
      gl.uniform1f(uni.uArt, 1);
      gl.uniform1f(uni.uA, crisp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.useProgram(points);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    for (const [loc, n, off] of [[uni.aB, 2, 0], [uni.aC, 3, 8], [uni.aR, 4, 20]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 36, off);
    }
    gl.uniform2f(uni.uRes, cv.width, cv.height);
    gl.uniform1f(uni.uT, T);
    gl.uniform1f(uni.uSize, size);
    gl.uniform1f(uni.uCrisp, crisp);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  const stop = () => { cancelAnimationFrame(raf); raf = 0; cv.classList.remove("on"); };
  const img = new Image();
  img.onload = () => {
    try {
      points = program(POINT_VS, POINT_FS);
      quad = program(QUAD_VS, QUAD_FS);
      uni = {
        aP: gl.getAttribLocation(quad, "aP"), uA: gl.getUniformLocation(quad, "uA"), uArt: gl.getUniformLocation(quad, "uArt"),
        aB: gl.getAttribLocation(points, "aB"), aC: gl.getAttribLocation(points, "aC"), aR: gl.getAttribLocation(points, "aR"),
        uRes: gl.getUniformLocation(points, "uRes"), uT: gl.getUniformLocation(points, "uT"),
        uSize: gl.getUniformLocation(points, "uSize"), uCrisp: gl.getUniformLocation(points, "uCrisp"),
      };
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      pointBuf = gl.createBuffer();
      tex = gl.createTexture();
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // colours leave the shaders multiplied by their alpha
      const go = () => {
        stop();
        if (!build(img)) return;
        cv.classList.add("on");
        raf = requestAnimationFrame(frame);
      };
      let timer = 0;
      new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(go, 150); }).observe(host); // fires once at the start too
      cv.addEventListener("webglcontextlost", stop); // the plain background is back
    } catch (e) {
      stop(); // a shader this GPU refuses, or a canvas it will not read: the plain background stays
    }
  };
  img.src = "/static/login-art.svg";
})();
