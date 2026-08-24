import fs from "fs";
import path from "path";

const source = (name) =>
  fs.readFileSync(path.join(__dirname, name), "utf8");

describe("Dither Field Lab runtime invariants", () => {
  const field = source("CreatorOSFieldCanvas.js");
  const lava = source("CreatorOSLavaLampCanvas.js");
  const rupture = source("RuptureCanvas.js");
  const page = source("DitherCanvasPage.js");
  const narrative = source("DitherScrollNarrative.css");
  const blackHole = source("BlackHoleBackground.js");

  test("every renderer owns local context recovery and a bounded runtime profile", () => {
    [field, lava, rupture].forEach((renderer) => {
      expect(renderer).toContain('data-context-recovery="local"');
      expect(renderer).toContain("ditherCanvasRuntimeProfile.id");
      expect(renderer).toContain("createDitherCanvasContext({");
      expect(renderer).toContain("getDitherCanvasSize(");
      expect(renderer).toContain("getDitherCanvasFrameInterval(");
    });
  });

  test("hidden, paused, and reduced-motion states do not own permanent frame loops", () => {
    [field, lava].forEach((renderer) => {
      expect(renderer).toContain("rafId = 0");
      expect(renderer).toContain("function scheduleFrame()");
      expect(renderer).toContain("if (pausedRef.current && !forceRender");
      expect(renderer).toContain("window.cancelAnimationFrame(rafId)");
    });
    expect(rupture).toContain("const scheduleRender = () =>");
    expect(rupture).toContain("animationFrameRef.current = 0");
    expect(rupture).toContain(
      "if (!pausedRef.current && !reducedMotion) scheduleRender()",
    );
  });

  test("the route mounts one study renderer and never the persistent black hole", () => {
    expect(page).toContain("key={activeStudy.id}");
    expect(page).toContain("{renderActiveStudy()}");
    expect(page).toContain("data-active-study={activeStudy.id}");
    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(blackHole).toContain('"/dither-canvas"');
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
