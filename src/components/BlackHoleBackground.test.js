import fs from "fs";
import path from "path";
import {
  BLACK_HOLE_INITIAL_ZOOM,
  BLACK_HOLE_POINTER_LERP_RATE,
  BLACK_HOLE_SECTION_ZOOMS,
  BLACK_HOLE_ZOOM_LERP_RATE,
  isImmersiveBlackHolePath,
} from "./BlackHoleBackground";

describe("persistent dark-mode black-hole invariants", () => {
  const componentSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/BlackHoleBackground.js"),
    "utf8",
  );
  const themeSource = fs.readFileSync(
    path.join(process.cwd(), "src/contexts/ThemeContext.js"),
    "utf8",
  );
  const parallaxSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/ParallaxBackground.js"),
    "utf8",
  );

  test("preserves the original section camera choreography", () => {
    expect(BLACK_HOLE_SECTION_ZOOMS).toEqual([14, 28, 44, 62, 22, 18]);
    expect(BLACK_HOLE_INITIAL_ZOOM).toBe(80);
    expect(BLACK_HOLE_ZOOM_LERP_RATE).toBe(0.025);
    expect(BLACK_HOLE_POINTER_LERP_RATE).toBe(0.035);
  });

  test("runs only on immersive routes", () => {
    expect(isImmersiveBlackHolePath("/")).toBe(true);
    expect(isImmersiveBlackHolePath("/engineering")).toBe(true);
    expect(isImmersiveBlackHolePath("/unknown-route")).toBe(true);
    expect(isImmersiveBlackHolePath("/work")).toBe(false);
    expect(isImmersiveBlackHolePath("/orb")).toBe(false);
    expect(isImmersiveBlackHolePath("/game")).toBe(false);
    expect(isImmersiveBlackHolePath("/dither-canvas")).toBe(false);
  });

  test("reuses the canonical pipeline without duplicating shader mathematics", () => {
    expect(componentSource).toContain("new BlackHolePipeline");
    expect(componentSource).toContain("claimLiveBackgroundRenderer");
    expect(componentSource).toContain("if (nextTarget) stopObserving()");
    expect(componentSource).toContain('data-renderer-id="black-hole-background"');
    expect(componentSource).toContain('data-context-recovery="local"');
    expect(componentSource).toContain("window.__bhRevealStart");
    expect(componentSource).toContain('window.addEventListener("pointermove"');
    expect(componentSource).toContain('window.addEventListener("sectionChangeStart"');
    expect(componentSource).not.toContain("#define NUM_STEPS");
    expect(componentSource).not.toContain("schwarzschildAccel");
    expect(componentSource).not.toContain("setOrbBlackHoleModeActive");
    expect(componentSource).not.toContain("disableWebGLForSession");
  });

  test("theme ownership mounts exactly one immersive renderer", () => {
    expect(themeSource).toContain("<BlackHoleBackground isDark={isDark} />");
    expect(parallaxSource).toContain(
      "const shouldUseDither = hasHardwareWebGL && !isDark;",
    );
    expect(componentSource).toContain(
      "shouldRenderImmersiveBlackHole({",
    );
    expect(componentSource).toContain("mobile: isMobileTier");
    expect(componentSource).not.toContain("!isMobileTier &&");
  });
});
