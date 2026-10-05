import { createMetabloomSceneTransition } from "./metabloomSceneTransition";

test("blends to exact endpoints in a bounded time", () => {
  const transition = createMetabloomSceneTransition();
  transition.target(1);
  expect(transition.weights).toEqual([1, 0, 0]);
  transition.advance(0.6);
  expect(transition.weights).toEqual([0.5, 0.5, 0]);
  transition.advance(0.6);
  expect(transition.weights).toEqual([0, 1, 0]);
  expect(transition.active).toBe(false);
});

test("a reversal and a third scene start from the visible mixture", () => {
  const transition = createMetabloomSceneTransition();
  transition.target(1);
  transition.advance(0.4);
  const visible = transition.weights;
  transition.target(0);
  expect(transition.weights).toEqual(visible);
  transition.advance(0.2);
  const returning = transition.weights;
  transition.target(3);
  expect(transition.weights).toEqual(returning);
  for (let i = 0; i < 40; i++) {
    transition.advance(1 / 30);
    expect(transition.weights.reduce((a, b) => a + b)).toBeCloseTo(1);
    transition.weights.forEach((weight) => {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    });
  }
  expect(transition.weights).toEqual([0, 0, 1]);
});

test("invalid inputs cannot disturb playback and static mode settles immediately", () => {
  const transition = createMetabloomSceneTransition();
  transition.target(1);
  transition.advance(0.3);
  const visible = transition.weights;
  expect(transition.target(4)).toBe(false);
  [NaN, Infinity, -1].forEach((value) => transition.advance(value));
  expect(transition.weights).toEqual(visible);
  transition.target(3, true);
  expect(transition.weights).toEqual([0, 0, 1]);
  expect(transition.active).toBe(false);
});
