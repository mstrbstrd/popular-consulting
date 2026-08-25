import {
  advanceVisualRuntimeDarkAnimation,
  createVisualRuntimeDarkAnimationState,
  resolveVisualRuntimeDarkRayBudget,
  resolveVisualRuntimeDarkTiles,
  resolveVisualRuntimeDarkTransportSize,
  VISUAL_RUNTIME_DARK_FIXED,
} from "./visualRuntimeDarkState";

describe("optimized dark runtime state", () => {
  test("uses a half-linear transport map without reducing presentation size", () => {
    expect(
      resolveVisualRuntimeDarkTransportSize({
        width: 560,
        height: 350,
      }),
    ).toEqual({
      width: 280,
      height: 175,
      scale: 0.5,
    });
  });


  test("preserves the reference four-by-four workload tiles", () => {
    const tiles = resolveVisualRuntimeDarkTiles({
      width: 280,
      height: 175,
    });

    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 70, height: 43 });
    expect(
      tiles.reduce((area, tile) => area + tile.width * tile.height, 0),
    ).toBe(280 * 175);
  });

  test("models a twelve-fold reduction in geodesic ray integrations", () => {
    expect(
      resolveVisualRuntimeDarkRayBudget({
        width: 560,
        height: 350,
        transportWidth: 280,
        transportHeight: 175,
      }),
    ).toEqual({
      outputPixels: 196000,
      transportPixels: 49000,
      referenceRayIntegrations: 588000,
      optimizedRayIntegrations: 49000,
      transportRayReduction: 12,
    });
  });

  test("retains the reference zoom and pointer interpolation constants", () => {
    const state = createVisualRuntimeDarkAnimationState();
    advanceVisualRuntimeDarkAnimation(state, {
      timestamp: 1000,
      section: 0,
      pointer: [1, 1],
    });

    expect(state.timeSeconds).toBe(1);
    expect(state.currentZoom).toBeCloseTo(
      80 + (14 - 80) * VISUAL_RUNTIME_DARK_FIXED.zoomLerp,
    );
    expect(state.smoothPointer[0]).toBeCloseTo(
      0.5 + 0.5 * VISUAL_RUNTIME_DARK_FIXED.pointerLerp,
    );
    expect(state.smoothPointer[1]).toBeCloseTo(
      0.35 + 0.65 * VISUAL_RUNTIME_DARK_FIXED.pointerLerp,
    );
  });

  test("renders a deterministic settled frame for reduced motion", () => {
    const state = createVisualRuntimeDarkAnimationState();
    advanceVisualRuntimeDarkAnimation(state, {
      timestamp: 99999,
      section: 2,
      pointer: [0.2, 0.8],
      reducedMotion: true,
    });

    expect(state).toMatchObject({
      timeSeconds: 8,
      currentZoom: 44,
      pointer: [0.2, 0.8],
      smoothPointer: [0.2, 0.8],
    });
  });

  test("pins every camera input during a deterministic capture", () => {
    const state = createVisualRuntimeDarkAnimationState();
    advanceVisualRuntimeDarkAnimation(state, {
      timestamp: 1234,
      section: 5,
      pointer: [1, 1],
      captureState: {
        active: true,
        timeSeconds: 8,
        blackHoleZoom: 28,
        pointer: { x: 0.42, y: 0.61 },
      },
    });

    expect(state).toMatchObject({
      timeSeconds: 8,
      currentZoom: 28,
      pointer: [0.42, 0.61],
      smoothPointer: [0.42, 0.61],
    });
  });
});
