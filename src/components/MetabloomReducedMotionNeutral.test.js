import { createMetabloomMotionRuntime, METABLOOM_NEUTRAL_POSE } from "./metabloomMotionRuntime";

describe("Metabloom reduced-motion neutrality", () => {
  test("settle and reform resolve to the neutral terminal pose", () => {
    const runtime = createMetabloomMotionRuntime();
    runtime.snap({ action: "thinking", phase: 0.5, intensity: 0.6 });
    expect(runtime.snapshot().pose.rotation).not.toBe(0);
    runtime.snap({ action: "reform", phase: 0.5, intensity: 0.8 });
    expect(runtime.snapshot().pose).toEqual(METABLOOM_NEUTRAL_POSE);
    expect(Object.values(runtime.snapshot().velocity).every((value) => value === 0)).toBe(true);
  });
});
