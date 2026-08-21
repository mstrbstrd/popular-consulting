import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import BlackHoleCanvas, {
  BLACK_HOLE_FRAGMENT_SHADER,
  BLACK_HOLE_MAX_PIXELS,
  BLACK_HOLE_RECOVERY_MAX_PIXELS,
  BLACK_HOLE_RENDER_SCHEDULES,
  BLACK_HOLE_TILE_COUNT,
  chooseBlackHoleRenderSchedule,
  createBlackHoleFragmentShader,
  createBlackHoleTiles,
  getBlackHoleCanvasSize,
  resolveBlackHoleRenderSchedule,
} from "./BlackHoleCanvas";

const mockRecordGraphicsEvent = jest.fn();
const mockSetOrbBlackHoleModeActive = jest.fn();

jest.mock("../utils/graphicsPolicy", () => ({
  recordGraphicsEvent: (...args) => mockRecordGraphicsEvent(...args),
}));

jest.mock("../utils/rendererOwnership", () => ({
  setOrbBlackHoleModeActive: (...args) =>
    mockSetOrbBlackHoleModeActive(...args),
}));

describe("BlackHoleCanvas preservation and safety invariants", () => {
  beforeEach(() => {
    mockRecordGraphicsEvent.mockClear();
    mockSetOrbBlackHoleModeActive.mockClear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("keeps the original geodesic shader canonical on every platform", () => {
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("#define NUM_STEPS 200");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("#define STEP_SIZE 0.08");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("schwarzschildAccel");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("void rk4Step");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain(
      "for (int ch = 0; ch < 3; ch++)",
    );
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("vec3 diskColor");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("psychePalette");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toContain("Analytic lensing");
    expect(createBlackHoleFragmentShader()).toBe(BLACK_HOLE_FRAGMENT_SHADER);
  });

  test("changes scheduling before shader mathematics or resolution", () => {
    const adaptiveSchedules = [
      BLACK_HOLE_RENDER_SCHEDULES.full,
      BLACK_HOLE_RENDER_SCHEDULES.fast,
      BLACK_HOLE_RENDER_SCHEDULES.balanced,
      BLACK_HOLE_RENDER_SCHEDULES.conservative,
      BLACK_HOLE_RENDER_SCHEDULES.safe,
    ];

    expect(adaptiveSchedules.map((schedule) => schedule.tilesPerBatch)).toEqual([
      16, 8, 4, 2, 1,
    ]);
    expect(BLACK_HOLE_RENDER_SCHEDULES.calibration.tilesPerBatch).toBe(1);
    adaptiveSchedules.forEach((schedule) => {
      expect(schedule.pixelScale).toBe(0.35);
      expect(schedule.maxPixels).toBe(BLACK_HOLE_MAX_PIXELS);
      expect(schedule).not.toHaveProperty("numSteps");
      expect(schedule).not.toHaveProperty("stepSize");
    });
    expect(BLACK_HOLE_RENDER_SCHEDULES.recovery.maxPixels).toBe(
      BLACK_HOLE_RECOVERY_MAX_PIXELS,
    );
  });

  test("selects the same measured calibration path on Windows and macOS", () => {
    expect(resolveBlackHoleRenderSchedule({ windows: false }).id).toBe(
      "calibration",
    );
    expect(resolveBlackHoleRenderSchedule({ windows: true }).id).toBe(
      "calibration",
    );
    expect(
      resolveBlackHoleRenderSchedule({
        windows: true,
        search: "?black-hole-quality=original",
      }).id,
    ).toBe("full");
    expect(
      resolveBlackHoleRenderSchedule({
        windows: false,
        storedSchedule: JSON.stringify({ id: "balanced" }),
      }).id,
    ).toBe("balanced");
  });

  test("maps measured full-frame GPU time to bounded batch sizes", () => {
    expect(chooseBlackHoleRenderSchedule(10).id).toBe("full");
    expect(chooseBlackHoleRenderSchedule(30).id).toBe("fast");
    expect(chooseBlackHoleRenderSchedule(60).id).toBe("balanced");
    expect(chooseBlackHoleRenderSchedule(120).id).toBe("conservative");
    expect(chooseBlackHoleRenderSchedule(220).id).toBe("safe");
  });

  test("tiles cover every target pixel exactly once", () => {
    const width = 7;
    const height = 5;
    const coverage = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => 0),
    );
    const tiles = createBlackHoleTiles(width, height);

    expect(tiles).toHaveLength(BLACK_HOLE_TILE_COUNT);
    tiles.forEach((tile) => {
      for (let y = tile.y; y < tile.y + tile.height; y += 1) {
        for (let x = tile.x; x < tile.x + tile.width; x += 1) {
          coverage[y][x] += 1;
        }
      }
    });

    expect(coverage.flat().every((count) => count === 1)).toBe(true);
  });

  test("preserves the original 0.35 canvas scale until local recovery", () => {
    expect(
      getBlackHoleCanvasSize(
        1920,
        1080,
        BLACK_HOLE_RENDER_SCHEDULES.full,
      ),
    ).toMatchObject({ width: 672, height: 378, scale: 0.35 });

    const recovery = getBlackHoleCanvasSize(
      1920,
      1080,
      BLACK_HOLE_RENDER_SCHEDULES.recovery,
    );
    expect(recovery.width * recovery.height).toBeLessThanOrEqual(
      BLACK_HOLE_RECOVERY_MAX_PIXELS,
    );
    expect(recovery.width / recovery.height).toBeCloseTo(16 / 9, 1);
  });

  test("presents only completed double-buffered frames and recovers locally", () => {
    const source = [
      "BlackHoleCanvas.js",
      "blackHoleRenderer.js",
      "blackHolePipeline.js",
      "blackHoleFramePump.js",
      "blackHoleWebGL.js",
    ]
      .map((file) =>
        fs.readFileSync(
          path.join(process.cwd(), "src/components", file),
          "utf8",
        ),
      )
      .join("\n");

    expect(source).toContain('powerPreference: "high-performance"');
    expect(source).toContain("failIfMajorPerformanceCaveat: true");
    expect(source).toContain("failIfMajorPerformanceCaveat: false");
    expect(source).toContain("gl.scissor(");
    expect(source).toContain("gl.viewport(tile.x, tile.y");
    expect(source).toContain("gl.finish()");
    expect(source).toContain("blocking-calibration-tile");
    expect(source).toContain("gl.fenceSync(");
    expect(source).toContain("gl.clientWaitSync(");
    expect(source).toContain("CALIBRATION_GRID = 8");
    expect(source).toContain("frontTarget = completedTarget");
    expect(source).toContain("backTarget = frontTarget");
    expect(source).toContain(
      "reducedMotion && pipeline.frontReady && !pipeline.frameInProgress",
    );
    expect(source).not.toContain(
      "presentBlackHoleFrame(pipeline);\n  if (!pollBatch(pipeline))",
    );
    expect(source).toContain('data-context-recovery="local"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('canvas.addEventListener("webglcontextlost"');
    expect(source).toContain("gl.deleteFramebuffer");
    expect(source).toContain("gl.deleteTexture");
    expect(source).toContain("gl.deleteSync");
    expect(source).not.toContain("disableWebGLForSession");
    expect(source).not.toContain("isWindowsPlatform");
    expect(source).not.toContain("navigator.userAgent");
  });

  test("restores renderer ownership when WebGL2 cannot be created", async () => {
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const onFadeOutEnd = jest.fn();
    const { container } = render(
      <BlackHoleCanvas visible={true} onFadeOutEnd={onFadeOutEnd} />,
    );

    await waitFor(() => {
      expect(onFadeOutEnd).toHaveBeenCalledTimes(1);
      expect(container.querySelector("canvas")).not.toBeInTheDocument();
    });

    expect(mockSetOrbBlackHoleModeActive).toHaveBeenCalledWith(false);
    expect(mockRecordGraphicsEvent).toHaveBeenCalledWith(
      "black-hole-failed",
      expect.objectContaining({ reason: "context-unavailable" }),
    );
  });
});
