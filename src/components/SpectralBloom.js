import React from "react";

/* SpectralBloom — a flower grown from spectral light.
   An original Aetheris-family backdrop rendered in DOCUMENT space: the
   flower is rooted at the very bottom of the page, its serpentine stem
   winds back and forth up the entire scroll height with leaves at
   intermittent nodes along the whole way, and the bloom sits near the top
   of the document. The sprout is one continuous motion: leaves unfold as
   the rising tip passes their node, and the bud fans open right as the
   stem tops out (~2.3s end to end). As the visitor scrolls, the head
   rises out of view and coils of leafed stem pass by, while petals detach
   seamlessly from their attached positions and cascade down through world
   space to a pile on the page-bottom ground. Petal fall is one-way.

   Scroll smoothness: the 30fps idle cap is bypassed whenever the scroll
   position changed (the stem must track native scrolling frame-perfect),
   the idle sway lives only in the tip region so the stem body is static
   in world space, and the Bayer lattice scrolls with the document in
   whole-cell steps so dithered edges do not crawl during scroll.

   Rendering is a single fullscreen SDF pass. The stem is a sinusoid graph
   x = f(worldY) with an analytic distance (cheap at any page length);
   leaves and petals are teardrop profiles composited in-shader, then
   quantized through the kit's Bayer-8 ordered dither at half resolution
   with pixelated upscale — the family signature.

   Engineering discipline matches the styleguide's fluid-background snippet:
   30fps idle cap, low-power context, pause when the tab is hidden, a
   static full-bloom frame under prefers-reduced-motion (repainted on theme
   change and on scroll so the world stays anchored), and the theme read
   from data-theme every frame. The only CPU work is a 10-petal state
   machine (attached -> falling -> settled) fed to the shader as a vec4
   array. */

const RENDER_SCALE = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const STATIC_TIME_S = 40;
const PETAL_COUNT = 10;

/* Stem shape constants — mirrored between the shader and flowerTip() so
   detaching petals spawn exactly where their attached twin was drawn.
   World units: 2 per viewport height, y decreasing downward from the
   document top; the bloom head rests at world y = 0.30. */
const STEM_AMP = 0.18;
const STEM_FREQ = 3.3;
const STEM_PHASE = 2.0;
const HEAD_Y = 0.3;

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
uniform float u_tip;
uniform float u_bloom;
uniform float u_scroll;
uniform vec4 u_petals[10];

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

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

/* Antialiased coverage of a signed distance. The AA width is capped:
   where a field jumps discontinuously (e.g. the leaf loop's candidate
   window shifting between rows, or a sentinel meeting a real distance),
   fwidth spikes to the jump's magnitude and an uncapped smoothstep would
   smear ~50% coverage along the entire discontinuity row — a full-width
   horizontal line. Normal edges have fwidth ~0.005-0.01 in field units at
   half resolution, so the 0.02 cap never touches real silhouettes. */
float cover(float d) {
#ifdef GL_OES_standard_derivatives
  float w = clamp(fwidth(d), 1e-4, 0.02);
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

/* Serpentine stem as a graph x = f(y). The body has a FIXED phase so it
   is perfectly still in world space while scrolling; the only motion is
   a gentle sway confined to the tip region. Constants are mirrored in JS
   (STEM_AMP / STEM_FREQ / STEM_PHASE / HEAD_Y / the sway term). */
float stemX(float wy, float rootX, float tip, float t) {
  float sway = 0.02 * sin(0.6 * t + 1.0) * smoothstep(tip - 1.4, tip, wy);
  return rootX + 0.18 * sin(wy * 3.3 + 2.0) + sway;
}

float stemSlope(float wy) {
  return 0.18 * 3.3 * cos(wy * 3.3 + 2.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  float aspect = u_res.x / u_res.y;
  float t = u_time;

  /* World space: the document scrolls past the fixed canvas. */
  vec2 wp = vec2(uv.x, uv.y - u_scroll);

  float rootX = -0.70 * aspect;

  float fx = stemX(wp.y, rootX, u_tip, t);
  float fp = stemSlope(wp.y);
  float dstem = abs(wp.x - fx) / sqrt(1.0 + fp * fp);
  dstem = max(dstem, wp.y - u_tip);
  float taper = smoothstep(u_tip - 1.2, u_tip, wp.y);
  dstem -= mix(0.017, 0.007, taper);

  /* Leaves at intermittent nodes down the ENTIRE stem (every 0.65 world
     units, alternating sides, seeded size/angle variation). Each leaf's
     unfold progress derives from how far the tip has grown past its node
     — one rule that makes leaves open with the sprout during the intro
     and stand fully open along the stem when scrolling. */
  float dleaf = 1e4;
  float leafShade = 1.0;
  float kBase = floor((-0.1 - wp.y) / 0.65) - 1.0;
  for (int j = 0; j < 3; j++) {
    float k = kBase + float(j);
    if (k >= 0.0) {
      float nodeY = -0.1 - k * 0.65;
      float side = (mod(k, 2.0) < 0.5) ? -1.0 : 1.0;
      float h1 = hash1(k + 7.0);
      float uj = smoothstep(0.12, 0.5, u_tip - nodeY);
      if (uj > 0.001) {
        vec2 P = vec2(stemX(nodeY, rootX, u_tip, t), nodeY);
        vec2 tn = normalize(vec2(stemSlope(nodeY), 1.0));
        float ang = atan(tn.y, tn.x)
          + side * mix(0.18, 1.05, uj)
          + (h1 - 0.5) * 0.25;
        vec2 lp = rot2(-ang) * (wp - P);
        float len = (0.17 + 0.06 * h1) * uj;
        float dl = sdPetalShape(lp, len, 0.055 * uj);
        if (dl < dleaf) {
          dleaf = dl;
          leafShade = mix(0.72, 1.0, uj) * (0.85 + 0.15 * h1);
        }
      }
    }
  }

  /* Bloom head rides the stem tip. */
  vec2 H = vec2(stemX(u_tip, rootX, u_tip, t), u_tip);
  float bloom = clamp(u_bloom, 0.0, 1.2);
  float opened = min(bloom, 1.0);

  /* Composite back-to-front: glow, stem, leaves, petals, pistil. */
  float rH = length(wp - H);
  vec3 colOut = spectral(0.6 + 0.05 * sin(t * 0.2));
  float aOut = exp(-rH * rH * 30.0) * 0.14 * opened;

  vec3 green = vec3(0.07, 0.78, 0.42);
  float band = 0.5 + 0.5 * sin(6.2831853 * (wp.y * 0.8 - t * 0.3));
  vec3 stemCol = mix(green, spectral(fract(wp.y * 0.12 + t * 0.02)), 0.20 * band);
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
        vec2 pp = rot2(-ang) * (wp - H);
        dpet = sdPetalShape(pp, mix(0.030, 0.150, bloom), mix(0.014, 0.052, opened));
      }
    } else {
      /* Falling or settled: position and rotation come from the CPU sim,
         at exactly the attached petal's size so detachment is seamless. */
      vec2 pp = rot2(-pd.z) * (wp - pd.xy);
      dpet = sdPetalShape(pp, 0.15, 0.052);
    }
    float cp = cover(dpet);
    colOut = mix(colOut, pCol, cp);
    aOut = mix(aOut, 0.92, cp);
  }

  float dcore = length(wp - H) - 0.045 * opened;
  float cCore = cover(dcore);
  colOut = mix(colOut, vec3(1.0, 0.90, 0.15), cCore);
  aOut = mix(aOut, 0.95, cCore);

  /* Light theme: darken the pigment so shapes hold contrast on warm white. */
  colOut *= mix(1.0, 0.60, u_light);
  aOut = clamp(aOut * mix(1.0, 1.05, u_light), 0.0, 1.0);

  /* Family signature: Bayer-8 ordered dither. The lattice scrolls with
     the document in whole-cell steps so edges do not crawl during
     scroll. The offset is wrapped to the pattern's 8-cell period and
     the coordinate kept strictly positive: bayer2's a.y*a.y term is
     symmetric about zero, so a negative row range would mirror the
     pattern and draw a full-width seam line. Quantized to a few levels. */
  float qlevels = mix(5.0, 7.0, u_light);
  float dOff = mod(floor(u_scroll * u_res.y * 0.5), 8.0);
  vec2 dco = vec2(gl_FragCoord.x, gl_FragCoord.y + 8.0 - dOff);
  float dith = bayer8(dco) - 0.5;
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
      tip: gl.getUniformLocation(program, "u_tip"),
      bloom: gl.getUniformLocation(program, "u_bloom"),
      scroll: gl.getUniformLocation(program, "u_scroll"),
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
    let lastDrawnScrollY = -1;
    let growStartS = -1;
    let staticRedrawQueued = false;

    /* Scroll offset in uv units (2 per viewport height). */
    const scrollOffset = () =>
      (window.scrollY / Math.max(window.innerHeight, 1)) * 2;

    /* World y of the ground at the very bottom of the document. */
    const groundY = () => {
      const range =
        document.documentElement.scrollHeight - window.innerHeight;
      return -1 - (Math.max(range, 0) / Math.max(window.innerHeight, 1)) * 2;
    };

    /* Mirrors the shader's stemX at the tip so detaching petals spawn
       exactly where their attached twin was drawn (same constants, same
       tip sway, which is at full strength at the tip itself). */
    const flowerTip = (timeS) => {
      const aspect = canvas.width / Math.max(canvas.height, 1);
      return {
        x:
          -0.7 * aspect +
          STEM_AMP * Math.sin(HEAD_Y * STEM_FREQ + STEM_PHASE) +
          0.02 * Math.sin(0.6 * timeS + 1.0),
        y: HEAD_Y,
      };
    };

    const detachPetal = (i, timeS) => {
      const p = petals[i];
      const tip = flowerTip(timeS);
      const phi = (i / PETAL_COUNT) * Math.PI * 2 + 0.31;
      p.mode = 1;
      /* Fall begins at the attached petal's exact base and angle. */
      p.x0 = tip.x;
      p.x = tip.x;
      p.y = tip.y;
      p.rot0 = phi;
      p.rot = phi;
      p.tFall = 0;
      p.phase = seeded(i, 1) * Math.PI * 2;
      p.speed = 0.4 + 0.15 * seeded(i, 2);
      p.swayW = 1.6 + 1.2 * seeded(i, 3);
      p.restY =
        groundY() + 0.02 + 0.022 * (settledCount % 3) + 0.012 * seeded(i, 4);
      settledCount += 1;
    };

    const updatePetals = (timeS, dt, bloomDone) => {
      if (bloomDone) {
        for (let j = 0; j < PETAL_COUNT; j++) {
          const i = DETACH_ORDER[j];
          const threshold = 0.12 + (0.72 * j) / (PETAL_COUNT - 1);
          if (petals[i].mode === 0 && maxScrollProgress >= threshold) {
            detachPetal(i, timeS);
          }
        }
      }
      for (let i = 0; i < PETAL_COUNT; i++) {
        const p = petals[i];
        if (p.mode === 1) {
          p.tFall += dt;
          /* Sway and spin are zero at tFall=0 and the fall speed eases
             in, so the petal drifts away instead of popping off. */
          const ramp = Math.min(1, p.tFall / 0.8);
          p.y -= p.speed * ramp * dt;
          p.x =
            p.x0 +
            0.06 * (Math.sin(p.swayW * p.tFall + p.phase) - Math.sin(p.phase));
          p.rot =
            p.rot0 +
            0.9 * (Math.sin(1.3 * p.tFall + p.phase) - Math.sin(p.phase));
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

    /* One continuous sprout: the tip rises over 1.4s (leaves unfold in
       the shader as the tip passes their node), and the bloom's spring
       begins at 0.95s — while the tip is settling into place — so bud
       formation overlaps the last of the growth and the flower opens
       right as the stem finishes. */
    const draw = (timeS, staticFrame) => {
      let tip = HEAD_Y;
      let bloom = 1;
      if (!staticFrame) {
        if (growStartS < 0) {
          growStartS = timeS;
        }
        const tG = timeS - growStartS;
        tip =
          -1.15 +
          (HEAD_Y + 1.15) * easeOutCubic(Math.min(1, Math.max(0, tG / 1.4)));
        bloom = springBloom((tG - 0.95) / 1.3);
      }
      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, timeS);
      gl.uniform1f(
        uniforms.light,
        document.documentElement.getAttribute("data-theme") === "light" ? 1 : 0,
      );
      gl.uniform1f(uniforms.tip, tip);
      gl.uniform1f(uniforms.bloom, bloom);
      gl.uniform1f(uniforms.scroll, scrollOffset());
      gl.uniform4fv(uniforms.petals, petalData);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.classList.add("work-page__backdrop--ready");
    };

    const tick = (now) => {
      rafId = window.requestAnimationFrame(tick);
      /* The 30fps idle cap would make the world-anchored stem judder
         against native scrolling, so scroll changes draw every frame. */
      const scrolled = window.scrollY !== lastDrawnScrollY;
      if (!scrolled && now - lastFrameAt < FRAME_INTERVAL_MS) {
        return;
      }
      const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      lastDrawnScrollY = window.scrollY;
      const timeS = now / 1000;
      const bloomDone = growStartS >= 0 && timeS - growStartS > 2.6;
      updatePetals(timeS, dt, bloomDone);
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

    /* The CSS size is pinned to exactly 1/RENDER_SCALE times the backing
       store (inline style overrides the stylesheet's 100%). A fractional
       upscale under image-rendering: pixelated would duplicate one canvas
       row into an extra CSS pixel — a stationary full-width band of
       stretched dither cells that reads as a line while content scrolls
       beneath it. The <=1px overhang from ceil() is harmless (the fixed
       ambient layer clips it). */
    const resize = () => {
      const w = Math.max(2, Math.ceil(window.innerWidth * RENDER_SCALE));
      const h = Math.max(2, Math.ceil(window.innerHeight * RENDER_SCALE));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w / RENDER_SCALE}px`;
      canvas.style.height = `${h / RENDER_SCALE}px`;
      gl.viewport(0, 0, w, h);
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

    /* One-way petal shedding: only the maximum scroll depth matters. For
       reduced-motion users the scene is world-anchored, so the single
       static frame is repainted (rAF-debounced) as they scroll. */
    const onScroll = () => {
      const range =
        document.documentElement.scrollHeight - window.innerHeight;
      if (range > 0) {
        maxScrollProgress = Math.max(
          maxScrollProgress,
          Math.min(1, window.scrollY / range),
        );
      }
      if (prefersReducedMotion() && !staticRedrawQueued) {
        staticRedrawQueued = true;
        window.requestAnimationFrame(() => {
          staticRedrawQueued = false;
          petalData.fill(0);
          draw(STATIC_TIME_S, true);
        });
      }
    };

    resize();
    start();
    window.addEventListener("scroll", onScroll, { passive: true });

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
