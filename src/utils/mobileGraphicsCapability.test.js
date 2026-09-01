import {
  canAttemptHighFidelityMobileGraphics,
  MOBILE_GRAPHICS_MIN_CORES,
  MOBILE_GRAPHICS_MIN_MEMORY_GB,
  shouldUseHighFidelityMobileLight,
} from "./mobileGraphicsCapability";

describe("mobile graphics capability policy", () => {
  const capablePhone = {
    hardwareConcurrency: 6,
    deviceMemory: 6,
    connection: { saveData: false },
  };

  test("keeps the capability boundary explicit and permits missing optional metrics", () => {
    expect(MOBILE_GRAPHICS_MIN_CORES).toBe(4);
    expect(MOBILE_GRAPHICS_MIN_MEMORY_GB).toBe(4);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 6,
        deviceMemory: 4,
      }),
    ).toBe(true);
    expect(canAttemptHighFidelityMobileGraphics()).toBe(true);
  });

  test("rejects low-capacity devices and data-saving sessions", () => {
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 2,
        deviceMemory: 8,
      }),
    ).toBe(false);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 8,
        deviceMemory: 2,
      }),
    ).toBe(false);
    expect(
      canAttemptHighFidelityMobileGraphics({
        hardwareConcurrency: 8,
        deviceMemory: 8,
        saveData: true,
      }),
    ).toBe(false);
  });

  test("enables the high-fidelity light path only for the capable mobile index", () => {
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(true);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: true,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/engineering",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: false,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
  });
});
