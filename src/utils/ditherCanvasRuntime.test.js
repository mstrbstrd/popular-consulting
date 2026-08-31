import {
  createDitherCanvasCadence,
  createDitherCanvasContext,
  DITHER_CANVAS_RUNTIME_PROFILES,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
  resolveDitherCanvasRuntimeProfile,
} from "./ditherCanvasRuntime";

jest.mock("./deviceTier", () => ({ isMobileTier: false }));
jest.mock("./graphicsPolicy", () => ({
  isWindowsPlatform: false,
  recordGraphicsEvent: jest.fn(),
}));

describe("Dither Field Lab runtime policy", () => {
  test("selects the bounded Windows profile without changing shader code", () => {
    expect(resolveDitherCanvasRuntimeProfile({ windows: true })).toBe(
      DITHER_CANVAS_RUNTIME_PROFILES.windows,
    );
    expect(DITHER_CANVAS_RUNTIME_PROFILES.windows).toMatchObject({
      maxPixels: 600_000,
      frameIntervalMs: 1000 / 24,
      powerPreference: "high-performance",
    });
  });

  test("bounds every Windows drawing buffer before allocation", () => {
    const size = getDitherCanvasSize(
      3840,
      2160,
      1,
      DITHER_CANVAS_RUNTIME_PROFILES.windows,
    );

    expect(size.width * size.height).toBeLessThanOrEqual(600_000);
    expect(size.profileId).toBe("windows");
  });

  test("preserves the authored desktop scale while enforcing Windows cadence", () => {
    expect(
      getDitherCanvasSize(
        1920,
        1080,
        0.5,
        DITHER_CANVAS_RUNTIME_PROFILES.desktop,
      ),
    ).toMatchObject({ width: 960, height: 540 });
    expect(
      getDitherCanvasFrameInterval(
        1000 / 30,
        DITHER_CANVAS_RUNTIME_PROFILES.windows,
      ),
    ).toBeCloseTo(1000 / 24);
  });

  test("sleeps between capped frames instead of polling every display refresh", () => {
    let now = 0;
    let nextId = 1;
    const animationFrames = new Map();
    const timers = new Map();
    const onFrame = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const windowObject = {
      performance: { now: () => now },
      requestAnimationFrame: jest.fn((callback) => {
        const id = nextId;
        nextId += 1;
        animationFrames.set(id, callback);
        return id;
      }),
      cancelAnimationFrame: jest.fn((id) => {
        animationFrames.delete(id);
      }),
      setTimeout: jest.fn((callback) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, callback);
        return id;
      }),
      clearTimeout: jest.fn((id) => {
        timers.delete(id);
      }),
    };
    const cadence = createDitherCanvasCadence({
      frameIntervalMs: 1000 / 30,
      onFrame,
      windowObject,
    });

    expect(cadence.schedule()).toBe(true);
    expect(cadence.schedule()).toBe(false);
    expect(animationFrames.size).toBe(1);

    const firstFrame = animationFrames.values().next().value;
    animationFrames.clear();
    firstFrame(0);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(1);
    expect(animationFrames.size).toBe(0);

    now = 34;
    const timer = timers.values().next().value;
    timers.clear();
    timer();
    expect(animationFrames.size).toBe(1);

    const secondFrame = animationFrames.values().next().value;
    animationFrames.clear();
    secondFrame(34);

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(cadence.snapshot()).toMatchObject({
      animationFrameId: 0,
      timerId: 0,
      disposed: false,
    });

    cadence.dispose();
    expect(cadence.schedule()).toBe(false);
    expect(cadence.snapshot().disposed).toBe(true);
  });

  test("retries a caveated adapter with the same renderer options", () => {
    const context = {};
    const canvas = {
      getContext: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(context),
    };

    expect(
      createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "test-field",
        profile: DITHER_CANVAS_RUNTIME_PROFILES.windows,
        options: { antialias: false },
      }),
    ).toBe(context);
    expect(canvas.getContext).toHaveBeenNthCalledWith(
      1,
      "webgl2",
      expect.objectContaining({
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "high-performance",
      }),
    );
    expect(canvas.getContext).toHaveBeenNthCalledWith(
      2,
      "webgl2",
      expect.objectContaining({
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
      }),
    );
  });
});
