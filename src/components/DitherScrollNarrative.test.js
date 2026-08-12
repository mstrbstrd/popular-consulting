const fs = require("fs");
const path = require("path");

describe("Dither scroll narrative", () => {
  const pageSource = fs.readFileSync(
    path.join(__dirname, "DitherCanvasPage.js"),
    "utf8",
  );
  const ruptureSource = fs.readFileSync(
    path.join(__dirname, "RuptureCanvas.js"),
    "utf8",
  );
  const narrativeStyles = fs.readFileSync(
    path.join(__dirname, "DitherScrollNarrative.css"),
    "utf8",
  );

  test("maps native page scroll through all ten studies", () => {
    expect(pageSource).toContain("const FIRST_STUDY_SCROLL_UNITS = 1.35");
    expect(pageSource).toContain("const RUPTURE_OPEN_SCROLL_UNITS = 0.92");
    expect(pageSource).toContain("studyIndexForScrollUnits");
    expect(pageSource).toContain('window.addEventListener("scroll", handleScroll');
    expect(pageSource).toContain('className="dither-scroll-sequence"');
    expect(pageSource).toContain("progress={firstSurfaceProgress}");
  });

  test("gives every study a distinct transition contract", () => {
    [
      "second-surface",
      "metabloom",
      "tidal-weave",
      "moire-halo",
      "contour-drift",
      "lava-lamp",
      "morphogen-divide",
      "quasicrystal-chorus",
      "hyperbolic-garden",
      "forward-pass",
    ].forEach((studyId) => {
      expect(pageSource).toContain(`"${studyId}"`);
      expect(narrativeStyles).toContain(`data-transition="${studyId}"`);
    });

    expect(pageSource).toContain(
      '"lava-lamp": { enter: "native", exit: "lava-lamp" }',
    );
    expect(narrativeStyles).not.toContain(
      'is-entering[data-transition="lava-lamp"]',
    );
  });

  test("animates copy independently and keeps instructions in document flow", () => {
    expect(pageSource).toContain(
      "className={`rupture-copy dither-copy is-",
    );
    expect(narrativeStyles).toContain(
      ".rupture-instruction {\n  position: static",
    );
    expect(narrativeStyles).toContain("max-width: min(10.5ch, 100%)");
    expect(narrativeStyles).toContain("dither-copy-forward-enter");
    expect(narrativeStyles).toContain("dither-copy-hyperbolic-exit");
  });

  test("keeps Second Surface externally controllable without removing legacy inputs", () => {
    expect(ruptureSource).toContain("controlledProgressRef");
    expect(ruptureSource).toContain("syncControlledProgressRef");
    expect(ruptureSource).toContain("controlledProgressRef.current !== null");
    expect(ruptureSource).toContain(
      'window.addEventListener("wheel", handleWheel',
    );
    expect(ruptureSource).toContain(
      'window.addEventListener("keydown", handleKeyDown)',
    );
  });
});
