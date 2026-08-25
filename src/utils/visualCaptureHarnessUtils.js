const MAX_METRIC_SAMPLES = 512;

export const pushBounded = (samples, value) => {
  samples.push(value);
  if (samples.length > MAX_METRIC_SAMPLES) samples.shift();
};

export const createSeededRandom = (seed = 1) => {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const summarizeSamples = (samples = []) => {
  const finite = samples
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (finite.length === 0) {
    return {
      count: 0,
      min: null,
      median: null,
      p95: null,
      max: null,
      mean: null,
    };
  }

  const percentile = (ratio) =>
    finite[
      Math.min(
        finite.length - 1,
        Math.max(0, Math.ceil(finite.length * ratio) - 1),
      )
    ];
  const total = finite.reduce((sum, value) => sum + value, 0);

  return {
    count: finite.length,
    min: finite[0],
    median: percentile(0.5),
    p95: percentile(0.95),
    max: finite[finite.length - 1],
    mean: total / finite.length,
  };
};

export const expectedRendererForCapture = (
  state,
  pathname = '/',
) => {
  const normalizedPath =
    String(pathname || '/').replace(/\/+$/, '') || '/';

  if (normalizedPath === '/orb') return 'orb-dither';
  if (normalizedPath === '/game') return 'game-dither';

  if (
    state.theme === 'dark' &&
    !['/work', '/orb', '/game', '/dither-canvas'].includes(
      normalizedPath,
    )
  ) {
    return 'black-hole-background';
  }

  return 'dither-background';
};

export const popPhaseToElapsedMs = (phase) => {
  const value = Number(phase);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value < 1) return value * 380;
  if (value < 1.6) {
    return 380 + ((value - 1) / 0.6) * 1560;
  }
  return 380 + 1560 + ((Math.min(value, 3) - 1.6) / 1.4) * 2800;
};
