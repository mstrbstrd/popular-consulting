import {
  disableWebGLForSession,
  isWindowsPlatform,
  recordGraphicsEvent,
  shouldAttemptWebGL,
} from "./graphicsPolicy";

export { disableWebGLForSession };

const IS_TEST_RUNTIME =
  typeof process !== "undefined" && process.env.NODE_ENV === "test";

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

const releaseProbeContext = (gl) => {
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch (_) {
    // The probe context is detached and can still be reclaimed by the browser.
  }
};

const createProbeContext = (canvas) => {
  const baseOptions = {
    antialias: false,
    powerPreference: "high-performance",
  };

  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      ...baseOptions,
      failIfMajorPerformanceCaveat: true,
    });
  } catch (_) {
    gl = null;
  }

  if (gl) return gl;

  recordGraphicsEvent("probe-relaxed-context", {
    reason: "major-performance-caveat",
  });

  try {
    return canvas.getContext("webgl2", {
      ...baseOptions,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (_) {
    return null;
  }
};

const probeHardwareWebGL = () => {
  if (
    IS_TEST_RUNTIME ||
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !shouldAttemptWebGL
  ) {
    return false;
  }

  let gl = null;
  let vertexShader = null;
  let fragmentShader = null;
  let program = null;

  try {
    const canvas = document.createElement("canvas");
    gl = createProbeContext(canvas);

    if (!gl) {
      recordGraphicsEvent("probe-rejected", { reason: "webgl2-unavailable" });
      return false;
    }

    const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (rendererInfo) {
      const renderer =
        gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) || "";
      const softwareRenderer =
        /microsoft basic render|warp|llvmpipe|swiftshader|hyper-v|vmware|virtualbox|softpipe/i.test(
          renderer,
        );
      if (softwareRenderer) {
        recordGraphicsEvent("probe-rejected", { reason: "software-renderer" });
        return false;
      }
    }

    vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      "#version 300 es\nin vec2 a_pos; void main(){ gl_Position=vec4(a_pos,0.0,1.0); }",
    );
    fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      "#version 300 es\nprecision highp float; out vec4 fragColor; void main(){ fragColor=vec4(1.0); }",
    );

    if (!vertexShader || !fragmentShader) {
      recordGraphicsEvent("probe-rejected", { reason: "shader-compile" });
      return false;
    }

    program = gl.createProgram();
    if (!program) {
      recordGraphicsEvent("probe-rejected", { reason: "program-create" });
      return false;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
    recordGraphicsEvent(linked ? "probe-passed" : "probe-rejected", {
      reason: linked ? "baseline-supported" : "program-link",
    });
    return linked;
  } catch (_) {
    recordGraphicsEvent("probe-rejected", { reason: "probe-exception" });
    return false;
  } finally {
    if (gl) {
      if (program) gl.deleteProgram(program);
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      releaseProbeContext(gl);
    }
  }
};

export const hasHardwareWebGL = probeHardwareWebGL();

export const isMobileTier = (() => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /iPhone|Android/i.test(userAgent);
  const iPadUserAgent =
    /iPad/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const lowCoreCount = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMemory = (navigator.deviceMemory || 8) <= 4;

  return mobileUserAgent || iPadUserAgent || (lowCoreCount && lowMemory);
})();

export const SHADER_RUNTIME_PROFILES = Object.freeze({
  mobile: Object.freeze({
    id: "mobile",
    maxDpr: 1,
    maxPixels: 600_000,
    frameIntervalMs: 1000 / 24,
  }),
  windows: Object.freeze({
    id: "windows",
    maxDpr: 1,
    maxPixels: 600_000,
    frameIntervalMs: 1000 / 24,
  }),
  desktop: Object.freeze({
    id: "desktop",
    maxDpr: 1.5,
    maxPixels: 1_000_000,
    frameIntervalMs: 1000 / 30,
  }),
});

export const resolveShaderRuntimeProfile = ({
  mobile = false,
  windows = false,
} = {}) => {
  if (mobile) return SHADER_RUNTIME_PROFILES.mobile;
  if (windows) return SHADER_RUNTIME_PROFILES.windows;
  return SHADER_RUNTIME_PROFILES.desktop;
};

export const shaderRuntimeProfile = resolveShaderRuntimeProfile({
  mobile: isMobileTier,
  windows: isWindowsPlatform,
});

export const shaderDPR = Math.min(
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  shaderRuntimeProfile.maxDpr,
);

export const MAX_SHADER_PIXELS = shaderRuntimeProfile.maxPixels;
export const TARGET_SHADER_FRAME_MS = shaderRuntimeProfile.frameIntervalMs;

export const getShaderCanvasSize = (
  cssWidth,
  cssHeight,
  maxPixels = MAX_SHADER_PIXELS,
) => {
  const width = Math.max(1, Number(cssWidth) || 1);
  const height = Math.max(1, Number(cssHeight) || 1);
  const safeBudget = Math.max(1, Number(maxPixels) || MAX_SHADER_PIXELS);
  const requestedPixels = width * height * shaderDPR * shaderDPR;
  const budgetScale =
    requestedPixels > safeBudget
      ? Math.sqrt(safeBudget / requestedPixels)
      : 1;
  const scale = Math.max(0.25, shaderDPR * budgetScale);

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
};

export const MOBILE_DITHER_OVERRIDES = {
  cellSize: 12,
  warp: 0,
  speed: 0.18,
  rainbowSpeed: 0.25,
};
