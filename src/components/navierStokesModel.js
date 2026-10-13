// The sentinel selects the renderer's existing clock. Invalid inputs fail back
// to that mode, never pass NaN or infinity to a GPU uniform.
export const normalizeNavierProgress = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, 1) : -1;

// Paper section 1.3: 0 < h < 1/100. These are normalized leading-order core
// scales, not a numerical solution or the total energy of the surrounding flow.
export const navierCoreScales = (progress) => {
  const p = Math.max(0, normalizeNavierProgress(progress));
  const h = 0.005;
  const tau = Math.pow(10, -4 * p);
  return {
    tau,
    radius: Math.pow(tau, 0.5),
    length: Math.pow(tau, 0.5 - h),
    speed: Math.pow(tau, -0.5 - h),
    energy: Math.pow(tau, 0.5 - 3 * h),
  };
};
