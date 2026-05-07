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
 */

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
