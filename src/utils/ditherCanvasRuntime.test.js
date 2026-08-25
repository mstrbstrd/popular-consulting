import {
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
