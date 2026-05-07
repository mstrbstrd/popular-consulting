/**
 * deviceTier.js
 *
 * Synchronous device capability detection — evaluated once at module load.
 * 'low'  → phones, iPads, low-RAM/low-core/ChromeOS devices → reduced effects
 * 'high' → desktop with enough CPU/GPU headroom              → full effects
 *
 * Detection signals (any one is sufficient for 'low'):
 *   - iPhone / Android UA
 *   - iPad UA or Macintosh + maxTouchPoints > 1 (modern iPad desktop-mode)
 *   - prefers-reduced-motion
 *   - hardwareConcurrency ≤ 4 with low/unknown memory on Windows or ChromeOS
 */

export const prefersReducedMotion = (() => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
})();

export const isTouchPrimaryDevice = (() => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobileUA = /iPhone|Android|Mobile/i.test(ua);
  const iPadUA = /iPad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  return mobileUA || iPadUA || (coarse && Math.min(window.innerWidth, window.innerHeight) < 760);
})();

export const isMobileTier = (() => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const chromeOS  = /CrOS/i.test(ua);
  const windows   = /Windows NT/i.test(ua);
  const cores     = navigator.hardwareConcurrency;
  const memory    = navigator.deviceMemory;
  const lowCores  = typeof cores === 'number' ? cores <= 4 : false;
  const lowMem    = typeof memory === 'number' ? memory <= 4 : false;
  const unknownMem = typeof memory !== 'number';

  return (
    prefersReducedMotion ||
    isTouchPrimaryDevice ||
    (chromeOS && (lowCores || lowMem || unknownMem)) ||
    (windows && lowCores && (lowMem || unknownMem)) ||
    (lowCores && lowMem)
  );
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

export const canvasDPR = Math.min(
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
  isMobileTier ? 1.0 : 1.5,
);

const MAX_SHADER_DIMENSION = isMobileTier ? 1100 : 1800;
export const blackHolePixelScale = isMobileTier ? 0.24 : 0.35;
export const effectFrameInterval = isMobileTier ? 1000 / 30 : 0;

export function getShaderCanvasSize(width, height) {
  const maxSide = Math.max(width, height, 1);
  const scale = Math.min(1, MAX_SHADER_DIMENSION / maxSide);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}

/**
 * DitherBackground section presets — mobile variants.
 * Larger cellSize = fewer ASCII characters to shade per frame.
 * warp: keeps the signature distortion while capping the expensive path.
 * speed/rainbowSpeed: reduced to lower per-frame GPU work.
 */
export const MOBILE_DITHER_OVERRIDES = {
  cellSize:     12,
  warp:          0.12,
  speed:         0.22,
  rainbowSpeed:  0.35,
};
