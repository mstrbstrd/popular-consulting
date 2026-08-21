jest.mock("./deviceTier", () => ({
  hasHardwareWebGL: true,
  isMobileTier: false,
}));

import {
  isOrbBlackHoleModeActive,
  ORB_BLACK_HOLE_MODE_EVENT,
  resolveOrbBlackHoleOwnership,
  setOrbBlackHoleModeActive,
} from "./rendererOwnership";

describe("Orb renderer ownership", () => {
  beforeEach(() => {
    setOrbBlackHoleModeActive(false);
  });

  afterEach(() => {
    setOrbBlackHoleModeActive(false);
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
});
