import fs from "fs";
import path from "path";
import {
  canAttemptMobileBlackHole,
  isMobileBlackHolePath,
  shouldRenderImmersiveBlackHole,
} from "./BlackHoleBackground";

describe("mobile immersive dark theme", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BlackHoleBackground.js"),
    "utf8",
  );

  const capablePhone = {
    hardwareConcurrency: 6,
    deviceMemory: 4,
    connection: { saveData: false },
  };

  test("allows the index on capable mobile hardware", () => {
    expect(isMobileBlackHolePath("/")).toBe(true);
    expect(isMobileBlackHolePath("/engineering")).toBe(false);
    expect(
      shouldRenderImmersiveBlackHole({
        isDark: true,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(true);
  });

  test("fails closed for low-capacity, data-saving, or unsupported contexts", () => {
    expect(
      canAttemptMobileBlackHole({
        hardwareConcurrency: 2,
        deviceMemory: 4,
      }),
    ).toBe(false);
    expect(
      canAttemptMobileBlackHole({
        hardwareConcurrency: 8,
        deviceMemory: 2,
      }),
    ).toBe(false);
    expect(
      canAttemptMobileBlackHole({
        hardwareConcurrency: 8,
        deviceMemory: 8,
        saveData: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderImmersiveBlackHole({
        isDark: true,
        hardwareWebGL: false,
        mobile: true,
        pathname: "/",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
    expect(
      shouldRenderImmersiveBlackHole({
        isDark: true,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/engineering",
        navigatorObject: capablePhone,
      }),
    ).toBe(false);
  });

  test("keeps desktop immersive routes and runtime recovery intact", () => {
    expect(
      shouldRenderImmersiveBlackHole({
        isDark: true,
        hardwareWebGL: true,
        mobile: false,
        pathname: "/engineering",
      }),
    ).toBe(true);
    expect(source).toContain("new BlackHolePipeline");
    expect(source).toContain("black-hole-background-local-retry");
    expect(source).toContain('data-context-recovery="local"');
    expect(source).toContain(
      'data-device-tier={mobile ? "mobile" : "desktop"}',
    );
    expect(source).not.toContain("!isMobileTier &&");
  });
});
