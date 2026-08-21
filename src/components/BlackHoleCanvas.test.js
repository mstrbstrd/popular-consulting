import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import BlackHoleCanvas, {
  BLACK_HOLE_FRAGMENT_SHADER,
  BLACK_HOLE_RENDER_PROFILES,
  createBlackHoleFragmentShader,
  getBlackHoleCanvasSize,
  resolveBlackHoleRenderProfile,
} from "./BlackHoleCanvas";

const mockRecordGraphicsEvent = jest.fn();
const mockSetOrbBlackHoleModeActive = jest.fn();

jest.mock("../utils/graphicsPolicy", () => ({
  isWindowsPlatform: false,
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
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("preserves the original geodesic renderer at original quality", () => {
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("#define NUM_STEPS 200");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("#define STEP_SIZE 0.080000");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("schwarzschildAccel");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("void rk4Step");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain(
      "for (int ch = 0; ch < 3; ch++)",
    );
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("vec3 diskColor");
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("psychePalette");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toContain("Analytic lensing");
  });

  test("Windows profile changes workload without replacing the visual algorithm", () => {
    const shader = createBlackHoleFragmentShader(
      BLACK_HOLE_RENDER_PROFILES.balanced,
    );

    expect(shader).toContain("#define NUM_STEPS 96");
    expect(shader).toContain("#define STEP_SIZE 0.166667");
    expect(shader).toContain("void rk4Step");
    expect(shader).toContain("for (int ch = 0; ch < 3; ch++)");
    expect(shader).toContain("vec3 diskColor");
    expect(shader).toContain("psychePalette");
  });

  test("selects exact quality off Windows and bounded quality on Windows", () => {
    expect(resolveBlackHoleRenderProfile({ windows: false }).id).toBe(
      "original",
    );
    expect(resolveBlackHoleRenderProfile({ windows: true }).id).toBe(
      "balanced",
    );
    expect(
      resolveBlackHoleRenderProfile({
        windows: true,
        search: "?black-hole-quality=original",
      }).id,
    ).toBe("original");
    expect(
      resolveBlackHoleRenderProfile({
        windows: false,
        search: "?black-hole-quality=safe",
      }).id,
    ).toBe("safe");
  });

  test("preserves the original 0.35 canvas scale until a profile budget applies", () => {
    expect(
      getBlackHoleCanvasSize(
        1920,
        1080,
        BLACK_HOLE_RENDER_PROFILES.original,
      ),
    ).toMatchObject({ width: 672, height: 378, scale: 0.35 });

    const balanced = getBlackHoleCanvasSize(
      1920,
      1080,
      BLACK_HOLE_RENDER_PROFILES.balanced,
    );
    expect(balanced.width * balanced.height).toBeLessThanOrEqual(
      BLACK_HOLE_RENDER_PROFILES.balanced.maxPixels,
    );
    expect(balanced.width / balanced.height).toBeCloseTo(16 / 9, 1);
  });

  test("keeps lifecycle recovery local to the black-hole renderer", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/BlackHoleCanvas.js"),
      "utf8",
    );

    expect(source).toContain('powerPreference: "high-performance"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('canvas.addEventListener("webglcontextlost"');
    expect(source).toContain("BLACK_HOLE_RENDER_PROFILES.safe.id");
    expect(source).toContain("gl.deleteBuffer(buffer)");
    expect(source).toContain("gl.deleteProgram(program)");
    expect(source).not.toContain("disableWebGLForSession");
    expect(source).not.toContain('getExtension("WEBGL_lose_context")');
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
