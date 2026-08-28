import {
  advanceVisualRuntimeLightAnimation,
  createVisualRuntimeLightAnimationState,
  hideVisualRuntimeLightReveal,
  resolveVisualRuntimeLightFieldSize,
  resolveVisualRuntimeLightSceneSampleBudget,
  VISUAL_RUNTIME_LIGHT_FIXED,
  VISUAL_RUNTIME_LIGHT_PRESETS,
} from "./visualRuntimeLightState";

describe("optimized light animation state", () => {
  test("maps one field texel to each authored glyph cell", () => {
    expect(
      resolveVisualRuntimeLightFieldSize({
        width: 1920,
        height: 1080,
        cellSize: 6,
      }),
    ).toEqual({
      width: 320,
      height: 120,
      cellSize: 6,
      cellHeight: 9,
    });

    expect(
      resolveVisualRuntimeLightFieldSize({
        width: 390,
        height: 844,
        cellSize: 12,
      }),
    ).toMatchObject({
      width: 32,
      height: 46,
      cellHeight: 18,
    });
  });

  test("quantifies the procedural scene-sample reduction", () => {
    const budget = resolveVisualRuntimeLightSceneSampleBudget({
      width: 1920,
      height: 1080,
      fieldWidth: 320,
      fieldHeight: 120,
    });

    expect(budget).toEqual({
      outputPixels: 2073600,
      fieldPixels: 38400,
      referenceSceneSamples: 10368000,
      optimizedSceneSamples: 153600,
      reduction: 67.5,
    });
  });

  test("preserves the reference presets and frame-based transition rates", () => {
    const state = createVisualRuntimeLightAnimationState();
    expect(state.params).toMatchObject({
      speed: VISUAL_RUNTIME_LIGHT_PRESETS[0].speed,
      contrast: VISUAL_RUNTIME_LIGHT_PRESETS[0].contrast,
      warp: VISUAL_RUNTIME_LIGHT_PRESETS[0].warp,
      rainbowSpeed: VISUAL_RUNTIME_LIGHT_PRESETS[0].rainbowSpeed,
      shapeA: 6,
      shapeB: 6,
      shapeMix: 0,
    });

    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 16.6667,
      timestamp: 16.6667,
      section: 1,
      reducedMotion: false,
    });

    expect(state.params.shapeA).toBe(6);
    expect(state.params.shapeB).toBe(3);
    expect(state.params.shapeMix).toBeCloseTo(0.011, 8);
    expect(state.params.speed).toBeCloseTo(
      0.7 + (0.32 - 0.7) * 0.025,
      8,
    );
  });

  test("caps wall-time advancement and preserves reveal choreography", () => {
    const state = createVisualRuntimeLightAnimationState();
    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 1000,
      timestamp: 0,
      section: 0,
      reducedMotion: false,
    });
    expect(state.timeSeconds).toBeCloseTo(0.7 / 15, 8);
    expect(state.reveal).toBe(0);

    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 16,
      timestamp: 1250,
      section: 0,
      reducedMotion: false,
    });
    expect(state.reveal).toBeCloseTo(0.5, 8);

    hideVisualRuntimeLightReveal(state);
    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 16,
      timestamp: 2000,
      section: 0,
      reducedMotion: false,
    });
    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 16,
      timestamp: 4500,
      section: 0,
      reducedMotion: false,
    });
    expect(state.reveal).toBe(0);
    expect(state.revealOutCompleted).toBe(true);
  });

  test("renders the authored section as one settled reduced-motion frame", () => {
    const state = createVisualRuntimeLightAnimationState();
    const preset = VISUAL_RUNTIME_LIGHT_PRESETS[2];

    advanceVisualRuntimeLightAnimation(state, {
      deltaMs: 1000,
      timestamp: 5000,
      section: 2,
      reducedMotion: true,
    });

    expect(state.params).toEqual({
      speed: preset.speed,
      contrast: preset.contrast,
      warp: preset.warp,
      rainbowSpeed: preset.rainbowSpeed,
      shapeA: preset.shape,
      shapeB: preset.shape,
      shapeMix: 0,
    });
    expect(state.timeSeconds).toBe(
      VISUAL_RUNTIME_LIGHT_FIXED.staticTimeSeconds,
    );
    expect(state.hueOffset).toBeCloseTo(
      (VISUAL_RUNTIME_LIGHT_FIXED.staticTimeSeconds *
        preset.rainbowSpeed *
        0.15) %
        1,
      8,
    );
    expect(state.reveal).toBe(1);
    expect(state.revealOutCompleted).toBe(false);

    hideVisualRuntimeLightReveal(state);
    advanceVisualRuntimeLightAnimation(state, {
      section: 2,
      reducedMotion: true,
    });

    expect(state.reveal).toBe(0);
    expect(state.revealHiding).toBe(false);
    expect(state.revealOutCompleted).toBe(true);
  });

  test("keeps mobile overrides inside the same state machine", () => {
    const state = createVisualRuntimeLightAnimationState();
    for (let index = 0; index < 300; index += 1) {
      advanceVisualRuntimeLightAnimation(state, {
        deltaMs: 16,
        timestamp: index * 16,
        section: 2,
        mobile: true,
        reducedMotion: false,
      });
    }

    expect(state.params.warp).toBeLessThan(0.004);
    expect(state.params.speed).toBeLessThanOrEqual(0.181);
    expect(state.params.rainbowSpeed).toBeLessThanOrEqual(0.253);
  });
});
