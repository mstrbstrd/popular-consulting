// Four fixed slots, no births, timers, random walks or per-frame allocations.
// The solver and display share these centers. Concentration never rewinds.
const CENTERS = [[0.65, 0.62], [0.27, 0.43], [0.73, 0.22], [0.28, 0.79]];
const SPINS = [1, -0.78, 0.66, -0.58];
const DELAYS = [0, 6, 12, 3];
const RATES = [23, 29, 25, 35];

export const navierCoreRadius = (progress) =>
  0.11 * 2 ** (-12 * (Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0));

export const writeNavierCores = (target, time, seed, count = 4) => {
  if (!(target instanceof Float32Array) || target.length !== 16) {
    throw new TypeError("Navier cores require exactly sixteen Float32 values.");
  }
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const phase = (Number.isFinite(seed) ? Math.max(0, Math.min(1, seed)) : 0) * Math.PI * 2;
  const active = count === 3 ? 3 : 4;
  for (let index = 0; index < 4; index++) {
    const offset = index * 4;
    const age = Math.max(0, t - DELAYS[index]);
    target[offset] = CENTERS[index][0] + Math.sin(t * 0.047 + phase + index * 1.7) * 0.025;
    target[offset + 1] = CENTERS[index][1] + Math.cos(t * 0.039 + phase + index * 2.3) * 0.025;
    target[offset + 2] = 1 - Math.exp(-age / RATES[index]);
    target[offset + 3] = index < active ? SPINS[index] : 0;
  }
  return target;
};

// Periodic displacement is zero outside each local influence before its seam.
// Units are fractions of the shorter viewport dimension, keeping cores round.
export const NAVIER_CORE_SHADER = `
uniform vec4 u_navierCores[4];
uniform int u_navierCoreCount;
uniform float u_navierAspect;
vec2 navierMetric() {
  float a = clamp(u_navierAspect, 0.125, 8.0);
  return vec2(max(a, 1.0), max(1.0 / a, 1.0));
}
vec2 navierDelta(vec2 uv, vec2 center) {
  return (fract(uv - center + 0.5) - 0.5) * navierMetric();
}
float navierRadius(float progress) {
  return 0.11 * exp2(-12.0 * clamp(progress, 0.0, 1.0));
}
`;
