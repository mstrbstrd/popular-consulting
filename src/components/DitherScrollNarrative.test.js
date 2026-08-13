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

  const transitionContracts = [
    {
      id: "second-surface",
      sceneEnter: "dither-surface-enter",
      sceneExit: "dither-surface-exit",
      copyEnter: "dither-copy-surface-enter",
      copyExit: "dither-copy-surface-exit",
    },
    {
      id: "metabloom",
      sceneEnter: "dither-bloom-enter",
      sceneExit: "dither-bloom-exit",
      copyEnter: "dither-copy-bloom-enter",
      copyExit: "dither-copy-bloom-exit",
    },
    {
      id: "tidal-weave",
      sceneEnter: "dither-weave-enter",
      sceneExit: "dither-weave-exit",
      copyEnter: "dither-copy-weave-enter",
      copyExit: "dither-copy-weave-exit",
    },
    {
      id: "moire-halo",
      sceneEnter: "dither-halo-enter",
      sceneExit: "dither-halo-exit",
      copyEnter: "dither-copy-halo-enter",
      copyExit: "dither-copy-halo-exit",
    },
    {
      id: "contour-drift",
      sceneEnter: "dither-contour-enter",
      sceneExit: "dither-contour-exit",
      copyEnter: "dither-copy-contour-enter",
      copyExit: "dither-copy-contour-exit",
    },
    {
      id: "lava-lamp",
      sceneEnter: null,
      sceneExit: "dither-lava-exit",
      copyEnter: null,
      copyExit: "dither-copy-lava-exit",
    },
    {
      id: "morphogen-divide",
      sceneEnter: "dither-morphogen-enter",
      sceneExit: "dither-morphogen-exit",
      copyEnter: "dither-copy-morphogen-enter",
      copyExit: "dither-copy-morphogen-exit",
    },
    {
      id: "quasicrystal-chorus",
      sceneEnter: "dither-quasicrystal-enter",
      sceneExit: "dither-quasicrystal-exit",
      copyEnter: "dither-copy-quasicrystal-enter",
      copyExit: "dither-copy-quasicrystal-exit",
    },
    {
      id: "hyperbolic-garden",
      sceneEnter: "dither-hyperbolic-enter",
      sceneExit: "dither-hyperbolic-exit",
      copyEnter: "dither-copy-hyperbolic-enter",
      copyExit: "dither-copy-hyperbolic-exit",
    },
    {
      id: "forward-pass",
      sceneEnter: "dither-forward-enter",
      sceneExit: "dither-forward-exit",
      copyEnter: "dither-copy-forward-enter",
      copyExit: "dither-copy-forward-exit",
    },
  ];

  const expectAnimationSelector = (layer, phase, id, animationName) => {
    expect(narrativeStyles).toContain(
      `.${layer}.is-${phase}[data-transition="${id}"] {\n  animation-name: ${animationName};`,
    );
    expect(narrativeStyles).toContain(`@keyframes ${animationName}`);
  };

  test("maps native page scroll through paced desktop and mobile profiles", () => {
    expect(pageSource).toContain("const DESKTOP_SCROLL_PROFILE");
    expect(pageSource).toContain("openingUnits: 1.55");
    expect(pageSource).toContain("studyUnits: 1.18");
    expect(pageSource).toContain("const MOBILE_SCROLL_PROFILE");
    expect(pageSource).toContain("openingUnits: 1.95");
    expect(pageSource).toContain("studyUnits: 1.55");
    expect(pageSource).toContain("limitMomentum: true");
    expect(pageSource).toContain('window.matchMedia?.("(pointer: coarse)")');
    expect(pageSource).toContain("VIEWPORT_WIDTH_CHANGE_THRESHOLD");
    expect(pageSource).toContain("viewportHeightRef");
    expect(pageSource).toContain("directNavigationTargetRef");
    expect(pageSource).toContain("studyIndexForScrollUnits");
    expect(pageSource).toContain('window.addEventListener("scroll", handleScroll');
    expect(pageSource).toContain('className="dither-scroll-sequence"');
    expect(pageSource).toContain("progress={firstSurfaceProgress}");
    expect(narrativeStyles).toContain(
      "height: var(--dither-study-scroll-height, 118dvh)",
    );
    expect(narrativeStyles).toContain(
      "height: var(--dither-opening-scroll-height, 155dvh)",
    );
  });

  test("gives every authored study a unique entrance and exit", () => {
    transitionContracts.forEach((contract) => {
      expect(pageSource).toContain(`"${contract.id}"`);
      expectAnimationSelector(
        "dither-study-scene",
        "exiting",
        contract.id,
        contract.sceneExit,
      );
      expectAnimationSelector(
        "dither-copy",
        "exiting",
        contract.id,
        contract.copyExit,
      );

      if (contract.sceneEnter) {
        expectAnimationSelector(
          "dither-study-scene",
          "entering",
          contract.id,
          contract.sceneEnter,
        );
      }

      if (contract.copyEnter) {
        expectAnimationSelector(
          "dither-copy",
          "entering",
          contract.id,
          contract.copyEnter,
        );
      }
    });

    const authoredSceneEntrances = transitionContracts
      .map(({ sceneEnter }) => sceneEnter)
      .filter(Boolean);
    const sceneExits = transitionContracts.map(({ sceneExit }) => sceneExit);
    const authoredCopyEntrances = transitionContracts
      .map(({ copyEnter }) => copyEnter)
      .filter(Boolean);
    const copyExits = transitionContracts.map(({ copyExit }) => copyExit);

    expect(new Set(authoredSceneEntrances).size).toBe(
      authoredSceneEntrances.length,
    );
    expect(new Set(sceneExits).size).toBe(sceneExits.length);
    expect(new Set(authoredCopyEntrances).size).toBe(
      authoredCopyEntrances.length,
    );
    expect(new Set(copyExits).size).toBe(copyExits.length);
  });

  test("preserves the Lava Lamp native entrance and adds only its exits", () => {
    expect(pageSource).toContain(
      '"lava-lamp": { enter: "native", exit: "lava-lamp" }',
    );
    expect(narrativeStyles).not.toContain(
      '.dither-study-scene.is-entering[data-transition="lava-lamp"]',
    );
    expect(narrativeStyles).not.toContain(
      '.dither-copy.is-entering[data-transition="lava-lamp"]',
    );
    expect(narrativeStyles).toContain(
      '.dither-study-scene.is-exiting[data-transition="lava-lamp"]',
    );
    expect(narrativeStyles).toContain(
      '.dither-copy.is-exiting[data-transition="lava-lamp"]',
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
