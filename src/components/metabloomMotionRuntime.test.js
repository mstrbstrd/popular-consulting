import { METABLOOM_ACTION_IDS } from "./metabloomActions";
import {
  METABLOOM_NEUTRAL_POSE,
  METABLOOM_POSE_KEYS,
  createMetabloomMotionRuntime,
  sampleMetabloomActionPose,
  smootherstep,
} from "./metabloomMotionRuntime";

describe("Metabloom emotive motion runtime", () => {
  test("uses zero-velocity quintic boundaries", () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.001)).toBeLessThan(0.000001);
    expect(1 - smootherstep(0.999)).toBeLessThan(0.000001);
  });

  test("keeps every authored pose finite and inside conservative geometry bounds", () => {
    METABLOOM_ACTION_IDS.forEach((action) => {
      for (let index = 0; index <= 100; index += 1) {
        const pose = sampleMetabloomActionPose({
          action,
          intensity: 1,
          phase: index / 100,
          seed: 0.37,
          talking: true,
          timeSeconds: index / 30,
        });
        METABLOOM_POSE_KEYS.forEach((key) => {
          expect(Number.isFinite(pose[key])).toBe(true);
        });
        expect(pose.offsetX).toBeGreaterThanOrEqual(-0.16);
        expect(pose.offsetX).toBeLessThanOrEqual(0.16);
        expect(pose.offsetY).toBeGreaterThanOrEqual(-0.16);
        expect(pose.offsetY).toBeLessThanOrEqual(0.16);
        expect(pose.scaleX).toBeGreaterThanOrEqual(0.76);
        expect(pose.scaleY).toBeGreaterThanOrEqual(0.76);
        expect(pose.burst).toBeLessThanOrEqual(0.52);
      }
    });
  });

  test("does not move when the renderer reports a zero delta frame", () => {
    const runtime = createMetabloomMotionRuntime();
    const before = runtime.snapshot();
    const after = runtime.step({
      action: "excited",
      deltaSeconds: 0,
      intensity: 1,
      phase: 0.4,
      seed: 0.5,
      timeSeconds: 0.4,
    });

    expect(after.pose).toEqual(before.pose);
    expect(after.velocity).toEqual(before.velocity);
  });

  test("interrupts from the currently rendered pose without snapping to neutral", () => {
    const runtime = createMetabloomMotionRuntime();
    for (let index = 0; index < 24; index += 1) {
      runtime.step({
        action: "happy",
        deltaSeconds: 1 / 60,
        intensity: 0.72,
        phase: index / 60,
        seed: 0.44,
        timeSeconds: index / 60,
      });
    }

    const before = runtime.snapshot().pose;
    const after = runtime.step({
      action: "angry",
      deltaSeconds: 1 / 60,
      intensity: 0.68,
      phase: 0,
      seed: 0.44,
      timeSeconds: 0.4,
    }).pose;

    expect(before.scaleY).not.toBeCloseTo(METABLOOM_NEUTRAL_POSE.scaleY, 3);
    expect(after.scaleY).not.toBe(METABLOOM_NEUTRAL_POSE.scaleY);
    expect(Math.abs(after.scaleY - before.scaleY)).toBeLessThan(0.035);
    expect(Math.abs(after.offsetY - before.offsetY)).toBeLessThan(0.025);
  });

  test("keeps chained actions continuous under rapid command changes", () => {
    const runtime = createMetabloomMotionRuntime();
    const actions = ["thinking", "agree", "excited", "happy", "reform"];
    let previousPose = runtime.snapshot().pose;
    let maximumScaleDelta = 0;
    let maximumOffsetDelta = 0;

    actions.forEach((action, actionIndex) => {
      for (let frame = 0; frame < 18; frame += 1) {
        const pose = runtime.step({
          action,
          deltaSeconds: 1 / 60,
          intensity: 0.74,
          phase: frame / 18,
          seed: 0.21,
          talking: action !== "reform",
          timeSeconds: actionIndex * 0.3 + frame / 60,
        }).pose;
        maximumScaleDelta = Math.max(
          maximumScaleDelta,
          Math.abs(pose.scaleX - previousPose.scaleX),
          Math.abs(pose.scaleY - previousPose.scaleY),
        );
        maximumOffsetDelta = Math.max(
          maximumOffsetDelta,
          Math.abs(pose.offsetX - previousPose.offsetX),
          Math.abs(pose.offsetY - previousPose.offsetY),
        );
        previousPose = pose;
      }
    });

    expect(maximumScaleDelta).toBeLessThan(0.05);
    expect(maximumOffsetDelta).toBeLessThan(0.04);
  });

  test("is deterministic for an identical command stream", () => {
    const first = createMetabloomMotionRuntime();
    const second = createMetabloomMotionRuntime();

    for (let frame = 0; frame < 90; frame += 1) {
      const options = {
        action: frame < 45 ? "thinking" : "agree",
        deltaSeconds: 1 / 60,
        intensity: 0.58,
        phase: (frame % 45) / 45,
        seed: 0.73,
        talking: frame >= 20 && frame < 70,
        timeSeconds: frame / 60,
      };
      first.step(options);
      second.step(options);
    }

    expect(first.snapshot()).toEqual(second.snapshot());
  });
});

describe("close-up reaction invariants", () => {
  test.each(METABLOOM_ACTION_IDS)("%s returns to rest and has no gesture at zero intensity or when disabled", (action) => {
    [0, 1].forEach((phase) => {
      expect(sampleMetabloomActionPose({ action, phase, physiology: false, intensity: 1 }))
        .toEqual(METABLOOM_NEUTRAL_POSE);
    });
    for (let frame = 0; frame <= 60; frame += 1) {
      const phase = frame / 60;
      expect(sampleMetabloomActionPose({ action, phase, physiology: false, intensity: 0 }))
        .toEqual(METABLOOM_NEUTRAL_POSE);
      expect(sampleMetabloomActionPose({ action, phase, physiology: false, enabled: false, intensity: 1 }))
        .toEqual(METABLOOM_NEUTRAL_POSE);
    }
  });

  test("curiosity leans in, skepticism withdraws, and conviction never shakes sideways", () => {
    const sample = (action, phase) => sampleMetabloomActionPose({ action, phase, intensity: 0.65, physiology: false });
    expect(sample("curious", 0.5).offsetX).toBeGreaterThan(0.05);
    expect(sample("skeptical", 0.5).offsetX).toBeLessThan(-0.04);
    expect(sample("curious", 0.5).rotation).toBeGreaterThan(0);
    expect(sample("thinking", 0.5).rotation).toBeLessThan(0);
    for (let frame = 0; frame < 60; frame += 1) {
      expect(sample("resolute", frame / 60).offsetX).toBe(0);
    }
  });

  test("surprise has a readable held recoil before recovery", () => {
    const sample = (phase) => sampleMetabloomActionPose({ action: "surprised", phase, intensity: 0.65, physiology: false });
    expect(sample(0.25)).toEqual(sample(0.40));
    expect(sample(0.30).stillness).toBeGreaterThan(0.8);
    expect(sample(0.90).offsetY).toBeLessThan(sample(0.30).offsetY);
  });
});
