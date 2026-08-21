import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import ManagedDitherBackground from "./ManagedDitherBackground";
import {
  getLiveBackgroundRenderers,
  resetLiveBackgroundRenderers,
} from "../utils/rendererOwnership";

const mockDisableWebGLForSession = jest.fn();
const mockRecordGraphicsEvent = jest.fn();
const mockGetShaderCanvasSize = jest.fn();

jest.mock("../utils/deviceTier", () => ({
  disableWebGLForSession: (...args) => mockDisableWebGLForSession(...args),
  getShaderCanvasSize: (...args) => mockGetShaderCanvasSize(...args),
  hasHardwareWebGL: true,
  isMobileTier: false,
  MAX_SHADER_PIXELS: 1_000_000,
  TARGET_SHADER_FRAME_MS: 1000 / 30,
}));

jest.mock("../utils/graphicsPolicy", () => ({
  recordGraphicsEvent: (...args) => mockRecordGraphicsEvent(...args),
}));

jest.mock("./DitherBackground", () => ({ activeSection, isDark }) => (
  <canvas
    data-testid="dither-canvas"
    data-section={activeSection}
    data-dark={String(isDark)}
    width="640"
    height="360"
  />
));

const setVisibility = (value) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
};

const setReducedMotion = (matches) => {
  window.matchMedia = jest.fn().mockReturnValue({
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  });
};

describe("ManagedDitherBackground", () => {
  beforeEach(() => {
    mockDisableWebGLForSession.mockClear();
    mockRecordGraphicsEvent.mockClear();
    mockGetShaderCanvasSize.mockReset();
    mockGetShaderCanvasSize.mockImplementation(() => ({
      width: 320,
      height: 180,
      scale: 0.5,
    }));
    window.__bhModeActive = false;
    resetLiveBackgroundRenderers();
    setVisibility("visible");
    setReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    window.__bhModeActive = false;
    resetLiveBackgroundRenderers();
    setVisibility("visible");
  });

  test("mounts one governed live renderer only while enabled and visible", async () => {
    const { container } = render(
      <ManagedDitherBackground
        activeSection={2}
        enabled={true}
        isDark={false}
        rendererId="main-dither"
      />,
    );

    const renderer = container.querySelector(
      "[data-renderer-id='main-dither']",
    );
    expect(screen.getByTestId("dither-canvas")).toHaveAttribute(
      "data-section",
      "2",
    );
    expect(renderer).toHaveAttribute("data-renderer-state", "running");
    expect(renderer).toHaveAttribute("data-graphics-governor", "true");
    expect(renderer).toHaveAttribute("data-graphics-single-pass", "true");
    expect(renderer).toHaveAttribute("data-max-shader-pixels", "1000000");
    expect(Number(renderer.getAttribute("data-shader-frame-interval"))).toBeCloseTo(
      1000 / 30,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dither-canvas").width).toBe(320);
      expect(screen.getByTestId("dither-canvas").height).toBe(180);
    });
  });

  test("claims live ownership only while its renderer is running", () => {
    const { rerender } = render(
      <ManagedDitherBackground
        enabled={true}
        rendererId="main-dither"
      />,
    );

    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(document.documentElement).toHaveAttribute(
      "data-live-background-renderer",
      "main-dither",
    );

    rerender(
      <ManagedDitherBackground
        enabled={false}
        rendererId="main-dither"
      />,
    );

    expect(getLiveBackgroundRenderers()).toEqual([]);
    expect(document.documentElement).not.toHaveAttribute(
      "data-live-background-renderer",
    );
  });

  test("unmounts the renderer while the document is hidden", () => {
    render(
      <ManagedDitherBackground
        enabled={true}
        fallback={<div data-testid="graphics-fallback" />}
      />,
    );

    expect(screen.getByTestId("dither-canvas")).toBeInTheDocument();

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.queryByTestId("dither-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("graphics-fallback")).toBeInTheDocument();
  });

  test("uses the static fallback for reduced-motion users", () => {
    setReducedMotion(true);

    const { container } = render(
      <ManagedDitherBackground
        enabled={true}
        fallback={<div data-testid="graphics-fallback" />}
      />,
    );

    expect(screen.queryByTestId("dither-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("graphics-fallback")).toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-state='reduced-motion']"),
    ).toBeInTheDocument();
  });

  test("suspends the dither while the exclusive orb black-hole renderer is active", async () => {
    const { container } = render(
      <ManagedDitherBackground
        enabled={true}
        fallback={<div data-testid="graphics-fallback" />}
        rendererId="orb-dither"
      />,
    );

    expect(screen.getByTestId("dither-canvas")).toBeInTheDocument();

    act(() => {
      window.__bhModeActive = true;
    });

    await waitFor(() => {
      expect(screen.queryByTestId("dither-canvas")).not.toBeInTheDocument();
      expect(
        container.querySelector(
          "[data-renderer-state='exclusive-suspended']",
        ),
      ).toBeInTheDocument();
    });

    act(() => {
      window.__bhModeActive = false;
    });

    await waitFor(() => {
      expect(screen.getByTestId("dither-canvas")).toBeInTheDocument();
    });
  });

  test("fails closed locally after WebGL context loss", () => {
    const { container } = render(
      <ManagedDitherBackground
        enabled={true}
        fallback={<div data-testid="graphics-fallback" />}
        rendererId="orb-dither"
      />,
    );

    const contextLoss = new Event("webglcontextlost", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      fireEvent(screen.getByTestId("dither-canvas"), contextLoss);
    });

    expect(contextLoss.defaultPrevented).toBe(true);
    expect(mockDisableWebGLForSession).toHaveBeenCalledWith(
      "context-lost:orb-dither",
    );
    expect(screen.queryByTestId("dither-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("graphics-fallback")).toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-state='failed']"),
    ).toBeInTheDocument();
  });
});
