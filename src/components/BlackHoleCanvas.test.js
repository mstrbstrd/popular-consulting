import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import BlackHoleCanvas, {
  BLACK_HOLE_FRAGMENT_SHADER,
  BLACK_HOLE_FRAME_INTERVAL_MS,
  BLACK_HOLE_MAX_PIXELS,
} from "./BlackHoleCanvas";

const mockDisableWebGLForSession = jest.fn();
const mockRecordGraphicsEvent = jest.fn();
const mockGetShaderCanvasSize = jest.fn();

jest.mock("../utils/deviceTier", () => ({
  disableWebGLForSession: (...args) => mockDisableWebGLForSession(...args),
  getShaderCanvasSize: (...args) => mockGetShaderCanvasSize(...args),
  TARGET_SHADER_FRAME_MS: 1000 / 30,
}));

jest.mock("../utils/graphicsPolicy", () => ({
  recordGraphicsEvent: (...args) => mockRecordGraphicsEvent(...args),
}));

describe("BlackHoleCanvas safety invariants", () => {
  beforeEach(() => {
    mockDisableWebGLForSession.mockClear();
    mockRecordGraphicsEvent.mockClear();
    mockGetShaderCanvasSize.mockReset();
    mockGetShaderCanvasSize.mockReturnValue({
      width: 640,
      height: 360,
      scale: 0.5,
    });
    window.__bhModeActive = true;
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    window.__bhModeActive = false;
  });

  test("uses bounded analytic shading instead of iterative ray tracing", () => {
    expect(BLACK_HOLE_FRAGMENT_SHADER).toContain("Analytic lensing");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toContain("NUM_STEPS");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toContain("rk4Step");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toContain("schwarzschildAccel");
    expect(BLACK_HOLE_FRAGMENT_SHADER).not.toMatch(/for\s*\(/);
  });

  test("pins conservative pixel and frame budgets", () => {
    expect(BLACK_HOLE_MAX_PIXELS).toBeLessThanOrEqual(420_000);
    expect(BLACK_HOLE_FRAME_INTERVAL_MS).toBeGreaterThanOrEqual(1000 / 30);
  });

  test("retains visibility, context-loss, and explicit cleanup ownership", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/BlackHoleCanvas.js"),
      "utf8",
    );

    expect(source).toContain("failIfMajorPerformanceCaveat: true");
    expect(source).toContain('powerPreference: "low-power"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('canvas.addEventListener("webglcontextlost"');
    expect(source).toContain("gl.deleteBuffer(buffer)");
    expect(source).toContain("gl.deleteProgram(program)");
    expect(source).not.toContain('getExtension("WEBGL_lose_context")');
    expect(source).toContain("getShaderCanvasSize(");
    expect(source).toContain("new ResizeObserver(resize)");
    expect(source).not.toContain("if (!gl || !program || !resize())");
  });

  test("fails closed when WebGL2 cannot be created", async () => {
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

    expect(mockDisableWebGLForSession).toHaveBeenCalledWith(
      "black-hole:context-unavailable",
    );
    expect(window.__bhModeActive).toBe(false);
  });
});
