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
 *   false → software/VM renderer (Hyper-V, WARP, llvmpipe, SwiftShader, VMware).
 *   All WebGL components are skipped entirely on these machines — the CSS
 *   gradient background is shown instead.
 */

/**
 * Returns false when the browser is using a known software or virtual-machine
 * GPU renderer that cannot handle complex GLSL shaders without crashing.
 * Creates a throwaway canvas/context — not stored, GC'd immediately.
 */
export const hasHardwareWebGL = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    // Extension unavailable in some browsers — assume hardware and let it try.
    if (!ext) return true;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    const isSoftware = /microsoft basic render|warp|llvmpipe|swiftshader|hyper-v|vmware|virtualbox|softpipe/i.test(renderer);
    return !isSoftware;
  } catch (_) {
    return false;
  }
})();

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
