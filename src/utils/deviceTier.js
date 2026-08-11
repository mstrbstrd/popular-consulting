/**
 * deviceTier.js
 *
 * Synchronous device capability detection — evaluated once at module load.
 * 'low'  → phones, iPads, low-RAM/low-core devices  → reduced shader effects
 * 'high' → desktop, iPad Pro with plenty of cores    → full effects
 *
 * Detection signals (any one is sufficient for 'low'):
 *   - iPhone / Android UA
 *   - iPad UA or Macintosh + maxTouchPoints > 1 (modern iPad desktop-mode)
 *   - hardwareConcurrency ≤ 4  AND  deviceMemory ≤ 4 GB
 *
 * hasHardwareWebGL:
 *   true only when WebGL 2 is available on a non-software renderer and a
 *   GLSL ES 3 vertex/fragment program successfully compiles and links.
 *   Otherwise all immersive WebGL components are skipped and the CSS
 *   gradient background is shown instead.
 */

const WEBGL_DISABLED_SESSION_KEY = 'popcon-webgl-disabled';

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

/**
 * Returns false unless the browser can initialize the exact graphics baseline
 * required by the immersive renderers: hardware-backed WebGL 2 + GLSL ES 3.
 *
 * This deliberately does not fall back to WebGL 1. The site's shaders use
 * `#version 300 es`, so accepting WebGL 1 here would classify an unsupported
 * browser as capable and suppress the CSS fallback.
 */
export const hasHardwareWebGL = (() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  try {
    if (window.sessionStorage?.getItem(WEBGL_DISABLED_SESSION_KEY) === '1') {
      return false;
    }

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      failIfMajorPerformanceCaveat: true,
    });

    if (!gl) return false;

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      const isSoftware = /microsoft basic render|warp|llvmpipe|swiftshader|hyper-v|vmware|virtualbox|softpipe/i.test(renderer);
      if (isSoftware) return false;
    }

    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      '#version 300 es\nin vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.0,1.0); }',
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      '#version 300 es\nprecision highp float; out vec4 fragColor; void main(){ fragColor=vec4(1.0); }',
    );

    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      return false;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return false;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));

    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return linked;
  } catch (_) {
    return false;
  }
})();

/**
 * Disables WebGL for the current tab/session after a live context loss.
 * On reload the capability probe reads this flag and the app uses the CSS
 * fallback instead of retrying the immersive renderer.
 */
export const disableWebGLForSession = () => {
  try {
    window.sessionStorage?.setItem(WEBGL_DISABLED_SESSION_KEY, '1');
  } catch (_) {
    // Storage can be unavailable in hardened/private browser configurations.
  }
};

export const isMobileTier = (() => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobileUA  = /iPhone|Android/i.test(ua);
  const iPadUA    = /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const lowCores  = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMem    = (navigator.deviceMemory    || 8) <= 4;
  return mobileUA || iPadUA || (lowCores && lowMem);
})();

/**
 * Maximum devicePixelRatio to use when sizing shader canvases.
 * Desktop: capped at 1.5  (2x Retina → 1.5x saves 44% pixels vs 2x)
 * Mobile:  capped at 1.0  (native-CSS pixels only — 9x saving on 3x screens)
 */
export const shaderDPR = Math.min(
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
  isMobileTier ? 1.0 : 1.5,
);

/**
 * DitherBackground section presets — mobile variants.
 * Larger cellSize = fewer ASCII characters to shade per frame.
 * warp: 0 skips the entire warp distortion pass.
 * speed/rainbowSpeed: reduced to lower per-frame GPU work.
 */
export const MOBILE_DITHER_OVERRIDES = {
  cellSize:     12,
  warp:          0,
  speed:         0.18,
  rainbowSpeed:  0.25,
};
