import React from "react";

/* SpectralTopography — "the hairline as landscape."
   An original Aetheris-family backdrop: fine luminous isolines of a slowly
   evolving noise terrain, drawn like a survey map of invisible ground. Every
   fourth contour is an index line (bolder, like real topographic maps), hue
   travels along the four-stop spectral palette, and the whole image is
   quantized through the kit's Bayer-8 ordered dither at half resolution so
   the cells stay chunky and designed.

   Engineering discipline matches the styleguide's fluid-background snippet:
   30fps cap, low-power context, pause when the tab is hidden, a single
   static frame under prefers-reduced-motion, theme read from data-theme
   every frame, and a one-shot warm-up where the contours rise into place. */

const RENDER_SCALE = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const STATIC_TIME_S = 40;
const INTRO_DURATION_S = 3.2;

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
uniform float u_intro;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return v;
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

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  float t = u_time * 0.05;

  /* Terrain: fbm elevation with a gentle domain warp so ridgelines meander
     instead of reading as static noise. Drift is glacial by design. */
  vec2 q = vec2(
    fbm(uv * 1.1 + vec2(0.0, t)),
    fbm(uv * 1.1 + vec2(7.3, -t * 0.8))
  );
  float h = fbm(uv * 1.5 + (q - 0.5) * 1.1 + vec2(t * 0.35, t * 0.2));

  /* Warm-up: the survey resolves — contour density rises from sparse to
     full over the intro, like a map being plotted. */
  float settle = 1.0 - pow(1.0 - u_intro, 3.0);
  float levels = mix(4.0, 13.0, settle);

  float f = h * levels;
  float d = abs(fract(f) - 0.5);
#ifdef GL_OES_standard_derivatives
  float w = max(fwidth(f), 0.02);
#else
  float w = 0.08;
#endif
  float line = 1.0 - smoothstep(w, w * 2.6, d);

  /* Every 4th contour is an index line — bolder, brighter, instrument-like. */
  float major = 1.0 - step(0.5, mod(floor(f + 0.5), 4.0));
  line = max(line * 0.62, line * major);

  /* A whisper of glow pooled around each line, and a soft bloom on summits. */
  float band = 1.0 - smoothstep(0.0, 0.5, d);
  float glow = band * band * 0.1;
  float summit = smoothstep(0.74, 0.96, h) * 0.1;

  /* Hue climbs with elevation and creeps with time — one spectral traversal
     from valley floor to summit, never a rainbow soup. */
  vec3 col = spectral(h * 0.62 + t * 0.1 + 0.55);
  col = mix(col, vec3(1.0), major * line * 0.18);

  /* Light theme: darken the pigment so hairlines hold contrast on warm white. */
  col *= mix(1.0, 0.58, u_light);

  float alpha = line * mix(0.62, 0.72, u_light)
    + glow * mix(1.0, 0.7, u_light)
    + summit * mix(1.0, 0.5, u_light);
  alpha = clamp(alpha, 0.0, 1.0) * settle;

  /* Family signature: Bayer-8 ordered dither, quantized to a few levels. */
  float qlevels = mix(5.0, 7.0, u_light);
  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  col = clamp(col + dither / qlevels, 0.0, 1.0);
  col = floor(col * qlevels + 0.5) / qlevels;
  alpha = clamp(alpha + dither / qlevels, 0.0, 1.0);
  alpha = floor(alpha * qlevels + 0.5) / qlevels;

  gl_FragColor = vec4(col * alpha, alpha);
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

const SpectralTopography = () => {
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

    const resolutionUniform = gl.getUniformLocation(program, "u_res");
    const timeUniform = gl.getUniformLocation(program, "u_time");
    const lightUniform = gl.getUniformLocation(program, "u_light");
    const introUniform = gl.getUniformLocation(program, "u_intro");

    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const prefersReducedMotion = () => Boolean(reducedMotion?.matches);

    let rafId = 0;
    let lastFrameAt = 0;
    let introStartS = -1;

    const draw = (timeS) => {
      let intro = 1;
      if (!prefersReducedMotion()) {
        if (introStartS < 0) {
          introStartS = timeS;
        }
        intro = Math.min(1, (timeS - introStartS) / INTRO_DURATION_S);
      }
      gl.uniform1f(introUniform, intro);
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(timeUniform, timeS);
      gl.uniform1f(
        lightUniform,
        document.documentElement.getAttribute("data-theme") === "light" ? 1 : 0,
      );
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
      lastFrameAt = now;
      draw(now / 1000);
    };

    const start = () => {
      window.cancelAnimationFrame(rafId);
      if (prefersReducedMotion()) {
        draw(STATIC_TIME_S);
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
        draw(STATIC_TIME_S);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(rafId);
      } else {
        start();
      }
    };

    resize();
    start();

    /* The loop reads the theme every frame; the observer only matters for
       reduced-motion users, whose single static frame must be repainted. */
    const themeObserver = new MutationObserver(() => {
      if (prefersReducedMotion()) {
        draw(STATIC_TIME_S);
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

export default SpectralTopography;
