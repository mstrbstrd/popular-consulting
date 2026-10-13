import { navierCoreRadius, writeNavierCores } from "./navierStokesField";

// Excluded states: zero/infinite radii, synchronized replay, overlapping cores,
// an unbounded population, per-frame arrays, and inspection altering history.
test("reuses exactly four bounded slots with distinct centers", () => {
  const state = new Float32Array(16);
  for (const count of [3, 4]) for (const seed of [0, 0.37, 1]) {
    for (const time of [0, 10, 28, 56, 120, 100000]) {
      expect(writeNavierCores(state, time, seed, count)).toBe(state);
      expect([...state].every(Number.isFinite)).toBe(true);
      expect([...state].filter((_, index) => index % 4 === 3 && state[index] !== 0)).toHaveLength(count);
      for (let i = 0; i < count; i++) {
        expect(state[i * 4]).toBeGreaterThan(0.15);
        expect(state[i * 4]).toBeLessThan(0.85);
        expect(state[i * 4 + 1]).toBeGreaterThan(0.15);
        expect(state[i * 4 + 1]).toBeLessThan(0.85);
        for (let j = i + 1; j < count; j++) {
          expect(Math.hypot(state[i * 4] - state[j * 4], state[i * 4 + 1] - state[j * 4 + 1])).toBeGreaterThan(0.25);
        }
      }
    }
  }
});

test("each core contracts monotonically across the former 28-second reset", () => {
  const state = new Float32Array(16);
  let previous = [Infinity, Infinity, Infinity, Infinity];
  for (const time of [0, 10, 27.99, 28, 28.01, 56, 120, 100000]) {
    writeNavierCores(state, time, 0.37);
    const radii = Array.from({ length: 4 }, (_, i) => navierCoreRadius(state[i * 4 + 2]));
    radii.forEach((radius, i) => {
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBeLessThanOrEqual(previous[i]);
    });
    previous = radii;
  }
  expect(previous.every(radius => radius < 0.00003)).toBe(true);
});

test("invalid clocks and seeds remain finite; invalid storage fails explicitly", () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, "2", {}]) {
    const state = writeNavierCores(new Float32Array(16), bad, bad);
    expect([...state].every(Number.isFinite)).toBe(true);
    expect(navierCoreRadius(bad)).toBe(0.11);
    expect(() => writeNavierCores(bad, 0, 0)).toThrow(TypeError);
  }
  expect(() => writeNavierCores(new Float32Array(12), 0, 0)).toThrow(TypeError);
  expect(navierCoreRadius(2)).toBe(navierCoreRadius(1));
  expect(navierCoreRadius(-1)).toBe(navierCoreRadius(0));
});
