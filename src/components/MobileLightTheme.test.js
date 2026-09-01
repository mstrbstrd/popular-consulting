import fs from "fs";
import path from "path";
import { shouldUseHighFidelityMobileLight } from "../utils/mobileGraphicsCapability";

describe("capability-aware mobile light theme", () => {
  const parallaxSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ParallaxBackground.js"),
    "utf8",
  );
  const productionThemeSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ProductionThemeCanvas.js"),
    "utf8",
  );

  test("selects the optimized full-detail light pass for a capable mobile index", () => {
    expect(
      shouldUseHighFidelityMobileLight({
        isDark: false,
        hardwareWebGL: true,
        mobile: true,
        pathname: "/",
        navigatorObject: {
          hardwareConcurrency: 6,
          deviceMemory: 6,
          connection: { saveData: false },
        },
      }),
    ).toBe(true);
    expect(parallaxSource).toContain("<ProductionThemeCanvas");
    expect(parallaxSource).toContain("highFidelityLight");
    expect(parallaxSource).toContain('runtimeScope="mobile-index"');
    expect(productionThemeSource).toContain(
      "mobile: isMobileTier && !highFidelityLight",
    );
  });

  test("keeps one renderer and falls back to the compatibility dither locally", () => {
    expect(parallaxSource).toContain("const shouldUseLegacyDither =");
    expect(parallaxSource).toContain("!shouldUseMobileLight");
    expect(parallaxSource).toContain('if (state === "fallback")');
    expect(parallaxSource).toContain(
      'data-mobile-light-runtime={mobileLightRuntimeState}',
    );
    expect(productionThemeSource).toContain(
      "runtimeRef.current?.setSection(normalizedSection)",
    );
    expect(productionThemeSource).toContain(
      'data-light-detail={',
    );
  });
});
