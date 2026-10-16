import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import ProductionThemeCanvas from "./ProductionThemeCanvas";
import { createVisualRuntimeDarkPass } from "../utils/visualRuntimeDarkPass";
import { createVisualRuntimeLightPass } from "../utils/visualRuntimeLightPass";
import {
  claimLiveBackgroundRenderer,
  getLiveBackgroundRenderers,
  LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
  LIVE_BACKGROUND_RENDERER_EVENT,
  resetLiveBackgroundRenderers,
} from "../utils/rendererOwnership";

jest.mock("../utils/deviceTier", () => ({
  isMobileTier: false,
  shaderRuntimeProfile: { maxDpr: 1, maxPixels: 1_000_000 },
}));
jest.mock("../utils/visualRuntimeDarkPass", () => ({ createVisualRuntimeDarkPass: jest.fn() }));
jest.mock("../utils/visualRuntimeLightPass", () => ({ createVisualRuntimeLightPass: jest.fn() }));

let loseContext;
let ownershipChange;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetLiveBackgroundRenderers();
  ownershipChange = jest.fn();
  window.addEventListener(LIVE_BACKGROUND_RENDERER_EVENT, ownershipChange);
  loseContext = jest.fn();
  // Keep the real shell, scheduler, resize authority and ownership lifecycle.
  // Only the GPU work is replaced; each registered pass still renders/disposes.
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    FRAMEBUFFER: 36160, SCISSOR_TEST: 3089, DEPTH_TEST: 2929,
    STENCIL_TEST: 2960, BLEND: 3042, COLOR_BUFFER_BIT: 16384,
    bindFramebuffer: jest.fn(), disable: jest.fn(), colorMask: jest.fn(),
    clearColor: jest.fn(), viewport: jest.fn(), clear: jest.fn(),
    getExtension: () => ({ loseContext }),
  });
  const createPass = () => ({
    id: "test-pass",
    render: jest.fn(() => ({ continue: false })),
    dispose: jest.fn(),
  });
  createVisualRuntimeDarkPass.mockImplementation(createPass);
  createVisualRuntimeLightPass.mockImplementation(createPass);
});

afterEach(() => {
  cleanup();
  window.removeEventListener(LIVE_BACKGROUND_RENDERER_EVENT, ownershipChange);
  resetLiveBackgroundRenderers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each(["light", "dark"])("%s production renderer ownership", (theme) => {
  test.each([false, true])("embedded lifecycle preserves document ownership (existing background: %s)", (hasBackground) => {
    const releaseBackground = hasBackground ? claimLiveBackgroundRenderer("existing-background") : () => {};
    const expectedOwners = hasBackground ? ["existing-background"] : [];
    ownershipChange.mockClear();
    const props = { theme, claimBackgroundOwnership: false };
    const { container, rerender, unmount } = render(<ProductionThemeCanvas {...props} />);
    const host = container.firstElementChild;
    const firstCanvas = host.querySelector("canvas");
    const createPass = theme === "dark" ? createVisualRuntimeDarkPass : createVisualRuntimeLightPass;
    const firstPass = createPass.mock.results[0].value;
    act(() => jest.advanceTimersByTime(32));
    expect(firstPass.render).toHaveBeenCalledTimes(1);
    expect(host).toHaveAttribute("data-runtime-fallback", "none");
    expect(getLiveBackgroundRenderers()).toEqual(expectedOwners);
    expect(document.documentElement.getAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE))
      .toBe(hasBackground ? "existing-background" : null);

    rerender(<ProductionThemeCanvas {...props} paused />);
    expect(host).toHaveAttribute("data-visual-runtime-shell-state", "suspended");
    rerender(<ProductionThemeCanvas {...props} paused resetVersion={1} />);
    expect(host.querySelector("canvas")).not.toBe(firstCanvas);
    expect(firstPass.dispose).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(host).toHaveAttribute("data-visual-runtime-shell-state", "suspended");
    rerender(<ProductionThemeCanvas {...props} resetVersion={1} />);
    act(() => jest.advanceTimersByTime(32));
    const resetPass = createPass.mock.results[1].value;
    expect(resetPass.render).toHaveBeenCalledTimes(1);
    expect(host).toHaveAttribute("data-runtime-fallback", "none");

    unmount();
    expect(resetPass.dispose).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(2);
    expect(getLiveBackgroundRenderers()).toEqual(expectedOwners);
    expect(document.documentElement.getAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE))
      .toBe(hasBackground ? "existing-background" : null);
    // Also reject transient claims that disappear before the final assertion.
    expect(ownershipChange).not.toHaveBeenCalled();
    releaseBackground();
  });

  test("a page background claims ownership by default and releases on unmount", () => {
    const { container, unmount } = render(<ProductionThemeCanvas theme={theme} runtimeScope="immersive" />);
    act(() => jest.advanceTimersByTime(32));
    expect(container.firstElementChild).toHaveAttribute("data-runtime-fallback", "none");
    expect(getLiveBackgroundRenderers()).toEqual([`immersive-${theme}-theme`]);
    expect(document.documentElement).toHaveAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE, `immersive-${theme}-theme`);
    unmount();
    expect(getLiveBackgroundRenderers()).toEqual([]);
    expect(document.documentElement).not.toHaveAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});

test("changing ownership mode releases only this renderer's claim", () => {
  const releaseBackground = claimLiveBackgroundRenderer("existing-background");
  const { rerender, unmount } = render(<ProductionThemeCanvas />);
  expect(getLiveBackgroundRenderers()).toEqual(["existing-background", "dither-canvas-light-theme"]);
  rerender(<ProductionThemeCanvas claimBackgroundOwnership={false} />);
  expect(getLiveBackgroundRenderers()).toEqual(["existing-background"]);
  expect(document.documentElement).toHaveAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE, "existing-background");
  rerender(<ProductionThemeCanvas />);
  expect(getLiveBackgroundRenderers()).toEqual(["existing-background", "dither-canvas-light-theme"]);
  unmount();
  expect(getLiveBackgroundRenderers()).toEqual(["existing-background"]);
  expect(loseContext).toHaveBeenCalledTimes(3);
  releaseBackground();
  expect(document.documentElement).not.toHaveAttribute(LIVE_BACKGROUND_RENDERER_ATTRIBUTE);
});
