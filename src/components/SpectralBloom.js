import React from "react";

/* SpectralBloom — a flower grown from spectral light.
   An original Aetheris-family backdrop: a single procedural flower sprouts
   from the bottom-left of the viewport — stem first, then leaves folding
   out, then a bud that blooms into a ten-petal spectral fan — over ~3.5s.
   As the visitor scrolls down the page, petals detach one by one, flutter
   down in viewport space, and settle into a pile at the bottom edge.
   Petal fall is one-way by design (calm, no looping motion).

   Rendering is a single fullscreen SDF pass: stem (sampled quadratic
   Bézier), leaves and petals (teardrop profiles) are composited inside the
   fragment shader, then quantized through the kit's Bayer-8 ordered dither
   at half resolution with pixelated upscale — the family signature.

   Engineering discipline matches the styleguide's fluid-background snippet:
   30fps cap, low-power context, pause when the tab is hidden, a single
   static full-bloom frame under prefers-reduced-motion (repainted on theme
   change), and the theme read from data-theme every frame. The only CPU
   work is a 10-petal state machine (attached -> falling -> settled) fed to
   the shader as a vec4 uniform array. */

const RENDER_SCALE = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const STATIC_TIME_S = 40;
const PETAL_COUNT = 10;

/* Petals detach in a shuffled order as scroll progress crosses each
   threshold, so the flower sheds naturally instead of unzipping. */
const DETACH_ORDER = [3, 8, 1, 6, 0, 9, 4, 7, 2, 5];

const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform float u_light;
uniform float u_stem;
uniform float u_leaf;
uniform float u_bloom;
uniform vec4 u_petals[10];

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

/* Spectral palette: cyan -> magenta -> yellow -> violet (matches CSS tokens). */
vec3 spectral(float h) {
  vec3 cyan = vec3(0.0, 0.933, 1.0);
  vec3 magenta = vec3(1.0, 0.0, 1.0);
  vec3 yellow = vec3(1.0, 0.933, 0.0);
  vec3 violet = vec3(0.616, 0.0, 1.0);
  h = fract(h);
  if (h < 0.25) return mix(cyan, magenta, h * 4.0);
  if (h < 0.5) return mix(magenta, yellow, (h - 0.25) * 4.0);
  if (h < 0.75) return mix(yellow, violet, (h - 0.5) * 4.0);
  return mix(violet, cyan, (h - 0.75) * 4.0);
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

vec2 bezier(vec2 A, vec2 B, vec2 C, float t) {
  return mix(mix(A, B, t), mix(B, C, t), t);
}

vec2 bezierTan(vec2 A, vec2 B, vec2 C, float t) {
  return 2.0 * mix(B - A, C - B, t);
}

/* Antialiased coverage of a signed distance. */
float cover(float d) {
#ifdef GL_OES_standard_derivatives
  float w = max(fwidth(d), 1e-4);
#else
  float w = 0.008;
#endif
  return 1.0 - smoothstep(-w, w, d);
}

/* Teardrop profile along +x: used for both leaves and petals. */
float sdPetalShape(vec2 p, float len, float wid) {
  float x = clamp(p.x / max(len, 1e-4), 0.0, 1.0);
  float d = abs(p.y) - wid * sin(3.14159265 * x);
  d = max(d, p.x - len);
  d = max(d, -p.x);
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;

  /* Stem anchors: rooted just below the bottom edge at 15% viewport width,
     with a gentle S and a near-imperceptible idle sway. The same constants
     are mirrored in JS to place detaching petals. */
  vec2 A = vec2(-0.70 * aspect, -1.06);
  vec2 B = vec2(A.x + 0.20, -0.30);
  vec2 C = vec2(A.x + 0.04, 0.30);
  B.x += 0.020 * sin(t * 0.60);
  C.x += 0.030 * sin(t * 0.45 + 1.7);

  /* Stem: closest-point search along the grown portion of the curve. */
  float s = 0.0;
  float dstem = 1e4;
  vec2 prev = A;
  for (int i = 1; i <= 24; i++) {
    float ft = float(i) / 24.0 * u_stem;
    vec2 q = bezier(A, B, C, ft);
    vec2 pa = uv - prev;
    vec2 ba = q - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    float dd = length(pa - ba * h);
    if (dd < dstem) {
      dstem = dd;
      s = (float(i - 1) + h) / 24.0 * u_stem;
    }
    prev = q;
  }
  float sn = s / max(u_stem, 1e-3);
  dstem -= mix(0.017, 0.007, sn);

  /* Leaves: three, alternating sides, each unfolding from the stem tangent
     once the stem has grown past its node. */
  float dleaf = 1e4;
  float leafShade = 1.0;
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float tj = 0.30 + 0.19 * fj;
    float side = (mod(fj, 2.0) < 0.5) ? -1.0 : 1.0;
    float uj = clamp((u_leaf - fj * 0.16) * 1.6, 0.0, 1.0);
    uj = uj * uj * (3.0 - 2.0 * uj);
    uj *= smoothstep(tj + 0.02, tj + 0.10, u_stem);
    if (uj > 0.001) {
      vec2 P = bezier(A, B, C, tj);
      vec2 tn = normalize(bezierTan(A, B, C, tj));
      float ang = atan(tn.y, tn.x) + side * mix(0.18, 1.05, uj);
      vec2 lp = rot2(-ang) * (uv - P);
      float dl = sdPetalShape(lp, 0.20 * uj, 0.055 * uj);
      if (dl < dleaf) {
        dleaf = dl;
        leafShade = mix(0.72, 1.0, uj);
      }
    }
  }

  vec2 H = bezier(A, B, C, u_stem);
  float bloom = clamp(u_bloom, 0.0, 1.2);
  float opened = min(bloom, 1.0);

  /* Composite back-to-front: glow, stem, leaves, petals, pistil. */
  float rH = length(uv - H);
  vec3 colOut = spectral(0.6 + 0.05 * sin(t * 0.2));
  float aOut = exp(-rH * rH * 30.0) * 0.14 * opened;

  vec3 green = vec3(0.07, 0.78, 0.42);
  float band = 0.5 + 0.5 * sin(6.2831853 * (sn * 1.6 - t * 0.30));
  vec3 stemCol = mix(green, spectral(fract(sn * 0.5 + t * 0.02)), 0.20 * band);
  float cStem = cover(dstem);
  colOut = mix(colOut, stemCol, cStem);
  aOut = mix(aOut, 0.88, cStem);

  vec3 leafCol = mix(green * leafShade, spectral(fract(0.35 + t * 0.015)), 0.12);
  float cLeaf = cover(dleaf);
  colOut = mix(colOut, leafCol, cLeaf);
  aOut = mix(aOut, 0.86, cLeaf);

  for (int i = 0; i < 10; i++) {
    vec4 pd = u_petals[i];
    float fi = float(i);
    float phi = fi / 10.0 * 6.2831853 + 0.31;
    vec3 pCol = spectral(fract(fi * 0.1 + t * 0.01));
    float dpet = 1e4;
    if (pd.w < 0.5) {
      /* Attached: bud angles cluster upward, then fan out radially. */
      if (bloom > 0.02) {
        float ang = mix(1.5708 + (phi - 3.1416) * 0.12, phi, opened);
        vec2 pp = rot2(-ang) * (uv - H);
        dpet = sdPetalShape(pp, mix(0.030, 0.150, bloom), mix(0.014, 0.052, opened));
      }
    } else {
      /* Falling or settled: position, rotation come from the CPU sim. */
      vec2 pp = rot2(-pd.z) * (uv - pd.xy);
      dpet = sdPetalShape(pp, 0.13, 0.048);
    }
    float cp = cover(dpet);
    colOut = mix(colOut, pCol, cp);
    aOut = mix(aOut, 0.92, cp);
  }

  float dcore = length(uv - H) - 0.045 * opened;
  float cCore = cover(dcore);
  colOut = mix(colOut, vec3(1.0, 0.90, 0.15), cCore);
  aOut = mix(aOut, 0.95, cCore);

  /* Light theme: darken the pigment so shapes hold contrast on warm white. */
  colOut *= mix(1.0, 0.60, u_light);
  aOut = clamp(aOut * mix(1.0, 1.05, u_light), 0.0, 1.0);

  /* Family signature: Bayer-8 ordered dither, quantized to a few levels. */
  float qlevels = mix(5.0, 7.0, u_light);
  float dith = bayer8(gl_FragCoord.xy) - 0.5;
  colOut = clamp(colOut + dith / qlevels, 0.0, 1.0);
  colOut = floor(colOut * qlevels + 0.5) / qlevels;
  aOut = clamp(aOut + dith / qlevels, 0.0, 1.0);
  aOut = floor(aOut * qlevels + 0.5) / qlevels;

  gl_FragColor = vec4(colOut * aOut, aOut);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

/* Damped-spring bloom: overshoots to ~1.13 around x=0.45, settles by 1. */
const springBloom = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-4.5 * x) * Math.cos(7 * x);
};

/* Deterministic per-petal randomness. */
const seeded = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const SpectralBloom = () => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let gl = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
    } catch (error) {
      gl = null;
    }
    if (!gl) {
      return undefined;
    }

    gl.getExtension("OES_standard_derivatives");

    const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) {
      return undefined;
    }

    const program = gl.createProgram();
    if (!program) {
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return undefined;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const positionLocation = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      light: gl.getUniformLocation(program, "u_light"),
      stem: gl.getUniformLocation(program, "u_stem"),
      leaf: gl.getUniformLocation(program, "u_leaf"),
      bloom: gl.getUniformLocation(program, "u_bloom"),
      petals:
        gl.getUniformLocation(program, "u_petals[0]") ||
        gl.getUniformLocation(program, "u_petals"),
    };

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const prefersReducedMotion = () => Boolean(reducedMotion?.matches);

    /* Petal state machine: 0 attached, 1 falling, 2 settled. */
    const petals = Array.from({ length: PETAL_COUNT }, () => ({
      mode: 0,
      x: 0,
      y: 0,
      x0: 0,
      rot: 0,
      rot0: 0,
      tFall: 0,
      restY: -1,
      phase: 0,
      speed: 0,
      swayW: 0,
    }));
    const petalData = new Float32Array(PETAL_COUNT * 4);
    let settledCount = 0;
    let maxScrollProgress = 0;
    let rafId = 0;
    let lastFrameAt = 0;
    let growStartS = -1;

    /* Mirrors the shader's stem-tip position so detaching petals spawn
       exactly where their attached twin was drawn. */
    const flowerTip = (timeS) => {
      const aspect = canvas.width / Math.max(canvas.height, 1);
      const ax = -0.7 * aspect;
      return {
        x: ax + 0.04 + 0.03 * Math.sin(timeS * 0.45 + 1.7),
        y: 0.3,
      };
    };

    const detachPetal = (i, timeS) => {
      const p = petals[i];
      const tip = flowerTip(timeS);
      const phi = (i / PETAL_COUNT) * Math.PI * 2 + 0.31;
      p.mode = 1;
      p.x0 = tip.x + 0.1 * Math.cos(phi);
      p.x = p.x0;
      p.y = tip.y + 0.1 * Math.sin(phi);
      p.rot0 = phi;
      p.rot = phi;
      p.tFall = 0;
      p.phase = seeded(i, 1) * Math.PI * 2;
      p.speed = 0.2 + 0.1 * seeded(i, 2);
      p.swayW = 1.6 + 1.2 * seeded(i, 3);
      p.restY = -0.97 + 0.022 * (settledCount % 3) + 0.012 * seeded(i, 4);
      settledCount += 1;
    };

    const updatePetals = (timeS, dt) => {
      for (let j = 0; j < PETAL_COUNT; j++) {
        const i = DETACH_ORDER[j];
        const threshold = 0.12 + (0.72 * j) / (PETAL_COUNT - 1);
        if (petals[i].mode === 0 && maxScrollProgress >= threshold) {
          detachPetal(i, timeS);
        }
      }
      for (let i = 0; i < PETAL_COUNT; i++) {
        const p = petals[i];
        if (p.mode === 1) {
          p.tFall += dt;
          p.y -= p.speed * dt;
          p.x = p.x0 + 0.05 * Math.sin(p.swayW * p.tFall + p.phase);
          p.rot = p.rot0 + 0.9 * Math.sin(1.3 * p.tFall + p.phase);
          if (p.y <= p.restY) {
            p.y = p.restY;
            p.mode = 2;
          }
        }
        petalData[i * 4] = p.x;
        petalData[i * 4 + 1] = p.y;
        petalData[i * 4 + 2] = p.rot;
        petalData[i * 4 + 3] = p.mode === 0 ? 0 : 1;
      }
    };

    const draw = (timeS, staticFrame) => {
      let stem = 1;
      let leaf = 1;
      let bloom = 1;
      if (!staticFrame) {
        if (growStartS < 0) {
          growStartS = timeS;
        }
        const tG = timeS - growStartS;
        stem = easeOutCubic(Math.min(1, Math.max(0, tG / 1.1)));
        leaf = Math.min(1, Math.max(0, (tG - 0.9) / 1.2));
        bloom = springBloom((tG - 1.9) / 1.4);
      }
      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, timeS);
      gl.uniform1f(
        uniforms.light,
        document.documentElement.getAttribute("data-theme") === "light" ? 1 : 0,
      );
      gl.uniform1f(uniforms.stem, stem);
      gl.uniform1f(uniforms.leaf, leaf);
      gl.uniform1f(uniforms.bloom, bloom);
      gl.uniform4fv(uniforms.petals, petalData);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.classList.add("work-page__backdrop--ready");
    };

    const tick = (now) => {
      rafId = window.requestAnimationFrame(tick);
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        return;
      }
      const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      const timeS = now / 1000;
      updatePetals(timeS, dt);
      draw(timeS, false);
    };

    const start = () => {
      window.cancelAnimationFrame(rafId);
      if (prefersReducedMotion()) {
        /* Static frame: fully bloomed, nothing fallen. */
        petalData.fill(0);
        draw(STATIC_TIME_S, true);
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * RENDER_SCALE));
      canvas.height = Math.max(
        1,
        Math.floor(window.innerHeight * RENDER_SCALE),
      );
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (prefersReducedMotion()) {
        draw(STATIC_TIME_S, true);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(rafId);
      } else {
        start();
      }
    };

    /* One-way petal shedding: only the maximum scroll depth matters. */
    const onScroll = () => {
      const range =
        document.documentElement.scrollHeight - window.innerHeight;
      if (range > 0) {
        maxScrollProgress = Math.max(
          maxScrollProgress,
          Math.min(1, window.scrollY / range),
        );
      }
    };

    resize();
    start();
    if (!prefersReducedMotion()) {
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    /* The loop reads the theme every frame; the observer only matters for
       reduced-motion users, whose single static frame must be repainted. */
    const themeObserver = new MutationObserver(() => {
      if (prefersReducedMotion()) {
        draw(STATIC_TIME_S, true);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion?.addEventListener?.("change", start);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion?.removeEventListener?.("change", start);
      themeObserver.disconnect();
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="work-page__backdrop"
      aria-hidden="true"
    />
  );
};

export default SpectralBloom;
