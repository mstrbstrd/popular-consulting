import fs from "fs";
import path from "path";

const source = (name) =>
  fs
    .readFileSync(path.join(__dirname, name), "utf8")
    .replace(/\r\n/g, "\n");

describe("Dither Field Lab runtime invariants", () => {
  const field = source("CreatorOSFieldCanvas.js");
  const lava = source("CreatorOSLavaLampCanvas.js");
  const rupture = source("RuptureCanvas.js");
  const ruptureShader = source("RuptureShader.js");
  const productionThemes = source("ProductionThemeCanvas.js");
  const page = source("DitherCanvasPage.js");
  const narrative = source("DitherScrollNarrative.css");
  const productionThemeStyles = source("ProductionThemeCanvas.css");
  const blackHole = source("BlackHoleBackground.js");

  test("every renderer owns local context recovery and a bounded runtime profile", () => {
    [field, lava, rupture].forEach((renderer) => {
      expect(renderer).toContain('data-context-recovery="local"');
      expect(renderer).toContain("ditherCanvasRuntimeProfile.id");
      expect(renderer).toContain("createDitherCanvasContext({");
      expect(renderer).toContain("getDitherCanvasSize(");
      expect(renderer).toContain("getDitherCanvasFrameInterval(");
    });
    expect(productionThemes).toContain('data-context-recovery="local"');
    expect(productionThemes).toContain("new VisualRuntimeShell({");
    expect(productionThemes).toContain("VISUAL_RUNTIME_DARK_FIXED.maxPixels");
    expect(productionThemes).toContain("shaderRuntimeProfile.maxPixels");
  });

  test("hidden, paused, and reduced-motion states do not own permanent frame loops", () => {
    [field, lava, rupture].forEach((renderer) => {
      expect(renderer).toContain("createDitherCanvasCadence({");
      expect(renderer).toContain('data-frame-cadence="timer-raf"');
      expect(renderer).toMatch(/frameCadence\??\.cancel\(\)/);
      expect(renderer).toContain("frameCadence.dispose()");
    });
    [field, lava].forEach((renderer) => {
      expect(renderer).toContain("if (pausedRef.current && !forceRender");
      expect(renderer).toContain("return !pausedRef.current");
    });
    expect(rupture).toContain(
      "return !pausedRef.current && !reducedMotion",
    );
    expect(productionThemes).toContain("runtime.scheduler.suspend(PAUSE_REASON)");
    expect(productionThemes).toContain("runtime.scheduler.resume(PAUSE_REASON)");
    expect(productionThemes).toContain("runtime?.dispose()");
  });

  test("the route mounts one active scene and bounds every renderer pause path", () => {
    expect(page).toContain("key={activeStudy.id}");
    expect(page).toContain("{renderActiveStudy()}");
    expect(page).toContain("data-active-study={activeStudy.id}");
    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(page).toContain(
      'const sharedPaused = paused || transitionPhase === "exiting";',
    );
    expect(page).toContain("const rendererPaused = sharedPaused;");
    expect(page).not.toContain("firstSurfaceProgress < 0.015");
    expect(page).toContain("paused={rendererPaused}");
    expect(blackHole).toContain('"/dither-canvas"');
  });

  test("production light and dark are first-class field studies", () => {
    expect(page).toContain('id: "light-theme"');
    expect(page).toContain('id: "dark-theme"');
    expect(page).toContain('type: "production-theme"');
    expect(page).toContain('<ProductionThemeCanvas');
    expect(page).toContain('theme={study.theme}');
    expect(page).toContain(
      "highFidelityLight={asSecondSurface ? false : highFidelityMobileLight}",
    );
    expect(page).toContain(
      'runtimeScope={asSecondSurface ? "dither-canvas-second-surface" : "dither-canvas-lab"}',
    );
    expect(page).toContain("canAttemptHighFidelityMobileGraphics");
    expect(page).toContain('data-mobile-light-detail={');
    expect(productionThemes).toContain("createVisualRuntimeLightPass({");
    expect(productionThemes).toContain("createVisualRuntimeDarkPass({");
    expect(productionThemes).toContain("candidateRuntime.registerPass(guardedPass)");
    expect(productionThemeStyles).toContain(
      '[data-transition="production-theme"]',
    );
  });

  test("Second Surface defaults to its original field and conditionally composes a selected live underlay", () => {
    expect(page).toContain('id: "original-second-surface"');
    expect(page).toContain('title: "Original Second Surface"');
    expect(page).toContain(
      "const SECOND_SURFACE_OPTIONS = Object.freeze([",
    );
    expect(page).toContain(
      "const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState(\n    ORIGINAL_SECOND_SURFACE.id,",
    );
    expect(page).toContain(
      "const usesExternalSecondSurface = secondSurfaceStudy !== null;",
    );
    expect(page).toContain(
      'aria-label="Choose the theme beneath Second Surface"',
    );
    expect(page).toContain(
      "data-second-surface-study={secondSurfaceOption.id}",
    );
    expect(page).toContain("{usesExternalSecondSurface && (");
    expect(page).toContain(
      "{renderStudy(secondSurfaceStudy, { asSecondSurface: true })}",
    );
    expect(page).toContain(
      "revealUnderlay={usesExternalSecondSurface}",
    );
    expect(page).toContain(
      "asSecondSurface ? ignoreFieldStateChange : handleProductionThemeStateChange",
    );
    expect(rupture).toContain("revealUnderlay = false");
    expect(rupture).toContain("alpha: revealUnderlay");
    expect(rupture).toContain('"u_externalSurface"');
    expect(rupture).toContain(
      "gl.uniform1f(uniforms.u_externalSurface, revealUnderlay ? 1 : 0);",
    );
    expect(ruptureShader).toContain("uniform float u_externalSurface;");
    expect(ruptureShader).toContain(
      "outputAlpha = max(1.0 - inside, seamOverlay);",
    );
  });

  test("a selected second surface fully replaces the legacy hidden world", () => {
    expect(ruptureShader).toContain(
      "bool externalSurface = u_externalSurface > 0.5;",
    );
    expect(ruptureShader).toContain("vec3 world = surface;");
    expect(ruptureShader).toContain(
      "if (!externalSurface) {\n    float worldRegion",
    );
    expect(ruptureShader).toContain(
      "world = hiddenWorld(v_uv, fault);",
    );
    expect(ruptureShader).toContain(
      "vec3 spillColor = externalSurface\n    ? mix(surface, seamSpectrum",
    );
    expect(ruptureShader).toContain(
      "vec3 color = externalSurface\n    ? surface\n    : mix(surface, world, inside);",
    );
    expect(ruptureShader).toContain("if (externalSurface) {");
  });

  test("production theme failures degrade locally to intentional CSS surfaces", () => {
    expect(productionThemes).toContain("setFallbackActive(true)");
    expect(productionThemes).toContain('onFieldStateChange("fallback")');
    expect(productionThemes).toContain('data-runtime-fallback={fallbackActive ? "css" : "none"}');
    expect(productionThemeStyles).toContain(
      ".production-theme-shell.is-fallback .production-theme-canvas",
    );
  });

  test("feedback resources exist only for Morphogen Divide", () => {
    expect(field).toContain("const reactionProgramsRequired =");
    expect(field).toContain("reactionProgram = reactionProgramsRequired");
    expect(field).toContain("reactionTargets = reactionProgramsRequired");
    expect(field).toContain('data-reaction-runtime={');
    expect(field).toContain("createNeutralReactionTexture");
    expect(field).toContain("gl.texSubImage2D(");
  });

  test("paint-only shaders compile only for the opt-in paint experience", () => {
    expect(field).toContain("const paintProgramsRequired =");
    expect(field).toContain("paintDisplayProgram = paintProgramsRequired");
    expect(field).toContain("paintReactionProgram = paintProgramsRequired");
    expect(field).toContain("[contextVersion, mode, morphogenExperience]");
  });

  test("full-screen compositor promotion exists only during transitions", () => {
    expect(narrative).toContain("will-change: auto");
    expect(narrative).toContain(
      ".dither-study-scene.is-exiting,",
    );
    expect(narrative).toContain(
      ".dither-study-scene.is-entering",
    );
  });
});
