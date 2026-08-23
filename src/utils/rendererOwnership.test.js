import {
  claimLiveBackgroundRenderer,
  getLiveBackgroundRenderers,
  isOrbBlackHoleModeActive,
  LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
  LIVE_BACKGROUND_RENDERER_EVENT,
  ORB_BLACK_HOLE_MODE_EVENT,
  resetLiveBackgroundRenderers,
  resolveOrbBlackHoleOwnership,
  setOrbBlackHoleModeActive,
} from "./rendererOwnership";

jest.mock("./deviceTier", () => ({
  hasHardwareWebGL: true,
  isMobileTier: false,
}));

describe("Orb renderer ownership", () => {
  beforeEach(() => {
    setOrbBlackHoleModeActive(false);
    resetLiveBackgroundRenderers();
  });

  afterEach(() => {
    setOrbBlackHoleModeActive(false);
    resetLiveBackgroundRenderers();
  });

  test("rejects ownership when the renderer cannot actually mount", () => {
    expect(
      resolveOrbBlackHoleOwnership({
        requested: true,
        hardwareWebGL: false,
        mobile: false,
      }),
    ).toBe(false);
    expect(
      resolveOrbBlackHoleOwnership({
        requested: true,
        hardwareWebGL: true,
        mobile: true,
      }),
    ).toBe(false);
    expect(
      resolveOrbBlackHoleOwnership({
        requested: true,
        hardwareWebGL: true,
        mobile: false,
      }),
    ).toBe(true);
  });

  test("dispatches ownership changes from the explicit setter", () => {
    const listener = jest.fn();
    window.addEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);

    setOrbBlackHoleModeActive(true);

    expect(isOrbBlackHoleModeActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ active: true });

    window.removeEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);
  });

  test("bridges the existing OrbSection global assignment synchronously", () => {
    const listener = jest.fn();
    window.addEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);

    window.__bhModeActive = true;

    expect(isOrbBlackHoleModeActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ active: true });

    window.removeEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);
  });

  test("does not emit duplicate ownership events for the same state", () => {
    const listener = jest.fn();
    window.addEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);

    setOrbBlackHoleModeActive(true);
    setOrbBlackHoleModeActive(true);

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);
  });

  test("reference-counts live background ownership and releases idempotently", () => {
    const listener = jest.fn();
    window.addEventListener(LIVE_BACKGROUND_RENDERER_EVENT, listener);

    const releaseFirst = claimLiveBackgroundRenderer("main-dither");
    const releaseSecond = claimLiveBackgroundRenderer("main-dither");

    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(document.documentElement).toHaveAttribute(
      LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
      "main-dither",
    );
    expect(listener).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseFirst();
    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(listener).toHaveBeenCalledTimes(1);

    releaseSecond();
    expect(getLiveBackgroundRenderers()).toEqual([]);
    expect(document.documentElement).not.toHaveAttribute(
      LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
    );
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener(LIVE_BACKGROUND_RENDERER_EVENT, listener);
  });
});
