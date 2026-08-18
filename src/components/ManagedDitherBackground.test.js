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

const disableWebGLForSession = jest.fn();
const recordGraphicsEvent = jest.fn();
const getShaderCanvasSize = jest.fn(() => ({
  width: 320,
  height: 180,
  scale: 0.5,
}));

jest.mock("../utils/deviceTier", () => ({
  disableWebGLForSession: (...args) => disableWebGLForSession(...args),
  getShaderCanvasSize: (...args) => getShaderCanvasSize(...args),
}));

jest.mock("../utils/graphicsPolicy", () => ({
  recordGraphicsEvent: (...args) => recordGraphicsEvent(...args),
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
    disableWebGLForSession.mockClear();
    recordGraphicsEvent.mockClear();
    getShaderCanvasSize.mockClear();
    setVisibility("visible");
    setReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    setVisibility("visible");
  });

  test("mounts one live renderer only while enabled and visible", async () => {
    const { container } = render(
      <ManagedDitherBackground
        activeSection={2}
        enabled={true}
        isDark={false}
        rendererId="main-dither"
      />,
    );

    expect(screen.getByTestId("dither-canvas")).toHaveAttribute(
      "data-section",
      "2",
    );
    expect(
      container.querySelector("[data-renderer-state='running']"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("dither-canvas").width).toBe(320);
      expect(screen.getByTestId("dither-canvas").height).toBe(180);
    });
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
    expect(disableWebGLForSession).toHaveBeenCalledWith(
      "context-lost:orb-dither",
    );
    expect(screen.queryByTestId("dither-canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("graphics-fallback")).toBeInTheDocument();
    expect(
      container.querySelector("[data-renderer-state='failed']"),
    ).toBeInTheDocument();
  });
});
