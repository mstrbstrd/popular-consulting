from pathlib import Path


def replace_once(content, old, new, label):
    if content.count(old) != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {content.count(old)}")
    return content.replace(old, new, 1)


page = Path("src/components/DitherCanvasPage.js")
s = page.read_text()

s = replace_once(
    s,
    "];\n\nconst DESKTOP_SCROLL_PROFILE",
    "];\n\nconst SECOND_SURFACE_STUDIES = STUDIES.filter((study) => study.id !== \"second-surface\");\n\nconst DESKTOP_SCROLL_PROFILE",
    "study registry insertion",
)

s = replace_once(
    s,
    "  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] = useState(false);",
    "  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] = useState(false);\n  const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState(\"metabloom\");",
    "Second Surface state insertion",
)

s = replace_once(
    s,
    "  const activeStudy = STUDIES[displayStudyIndex];\n",
    "  const activeStudy = STUDIES[displayStudyIndex];\n  const secondSurfaceStudy = SECOND_SURFACE_STUDIES.find(\n    (study) => study.id === secondSurfaceStudyId,\n  ) || SECOND_SURFACE_STUDIES[0];\n",
    "Second Surface study resolver insertion",
)

old = '''  const activeDescription = isMorphogenPaintMode
    ? "A living sand canvas turns reaction-diffusion pigment into a drawable material. Every stroke settles, diffuses, and glints with the colors you choose."
    : activeStudy.description;
  const activeInstruction = isMorphogenPaintMode
    ? "Drag anywhere to paint · switch to erase for corrections · choose two colors and a gradient · Clear starts fresh"
    : activeStudy.instruction;'''
new = '''  const activeDescription = activeStudy.id === "second-surface"
    ? `A second surface waits beneath the page. The tear now reveals ${secondSurfaceStudy.title} as a real live field rather than a fixed hidden shader.`
    : isMorphogenPaintMode
      ? "A living sand canvas turns reaction-diffusion pigment into a drawable material. Every stroke settles, diffuses, and glints with the colors you choose."
      : activeStudy.description;
  const activeInstruction = activeStudy.id === "second-surface"
    ? "Choose a surface below · scroll to open the tear · scroll back to close it · choose Heal to seal the surface"
    : isMorphogenPaintMode
      ? "Drag anywhere to paint · switch to erase for corrections · choose two colors and a gradient · Clear starts fresh"
      : activeStudy.instruction;'''
s = replace_once(s, old, new, "Second Surface copy replacement")

s = replace_once(
    s,
    "  const handleProductionThemeStateChange = useCallback((state) => {",
    "  const ignoreFieldStateChange = useCallback(() => {}, []);\n\n  const handleProductionThemeStateChange = useCallback((state) => {",
    "underlay state isolation insertion",
)

start_marker = "  const renderActiveStudy = () => {"
end_marker = "\n\n  return (\n    <main"
if s.count(start_marker) != 1 or s.count(end_marker) != 1:
    raise SystemExit("study renderer replacement markers are not unique")
start = s.index(start_marker)
end = s.index(end_marker, start)
new_render = '''  const renderStudy = (study, { asSecondSurface = false } = {}) => {
    const sharedPaused = paused || transitionPhase === "exiting";
    const rendererPaused = asSecondSurface
      ? sharedPaused || firstSurfaceProgress < 0.015
      : sharedPaused;
    const stateHandler = asSecondSurface
      ? ignoreFieldStateChange
      : setFieldState;

    if (study.type === "creatoros-lava") {
      return (
        <CreatorOSLavaLampCanvas
          isDark={isDark}
          paused={rendererPaused}
          resetVersion={resetVersion}
          onFieldStateChange={stateHandler}
        />
      );
    }

    if (study.type === "production-theme") {
      return (
        <ProductionThemeCanvas
          paused={rendererPaused}
          resetVersion={resetVersion}
          theme={study.theme}
          highFidelityLight={asSecondSurface ? false : highFidelityMobileLight}
          runtimeScope={asSecondSurface ? "dither-canvas-second-surface" : "dither-canvas-lab"}
          onFieldStateChange={
            asSecondSurface ? ignoreFieldStateChange : handleProductionThemeStateChange
          }
        />
      );
    }

    return (
      <CreatorOSFieldCanvas
        isDark={isDark}
        paused={rendererPaused}
        resetVersion={resetVersion}
        mode={study.mode}
        metabloomPalette={metabloomPalette}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}
        morphogenExperience={morphogenExperience}
        morphogenTool={morphogenTool}
        morphogenBrushSize={morphogenBrushSize}
        morphogenGradient={morphogenGradient}
        morphogenColorA={morphogenColorA}
        morphogenColorB={morphogenColorB}
        onFieldStateChange={stateHandler}
      />
    );
  };

  const renderActiveStudy = () => {
    if (activeStudy.type === "rupture") {
      return (
        <div
          className="second-surface-stack"
          data-second-surface-study={secondSurfaceStudy.id}
        >
          <div
            key={`second-surface-underlay-${secondSurfaceStudy.id}`}
            className="second-surface-underlay"
          >
            {renderStudy(secondSurfaceStudy, { asSecondSurface: true })}
          </div>
          <div className="second-surface-rupture">
            <RuptureCanvas
              isDark={isDark}
              paused={paused || transitionPhase === "exiting"}
              resetVersion={resetVersion}
              progress={firstSurfaceProgress}
              revealUnderlay
              onRuptureStateChange={setFieldState}
            />
          </div>
        </div>
      );
    }

    return renderStudy(activeStudy);
  };'''
s = s[:start] + new_render + s[end:]

needle = '          <p className="dither-study-switcher-label">Field studies</p>\n'
selector = '''          <p className="dither-study-switcher-label">Field studies</p>
          {activeStudy.id === "second-surface" && (
            <label className="second-surface-selector">
              <span className="second-surface-selector-label">Surface</span>
              <select
                value={secondSurfaceStudy.id}
                onChange={(event) => setSecondSurfaceStudyId(event.target.value)}
                aria-label="Choose the theme beneath Second Surface"
              >
                {SECOND_SURFACE_STUDIES.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.title}
                  </option>
                ))}
              </select>
            </label>
          )}
'''
s = replace_once(s, needle, selector, "Second Surface selector insertion")
page.write_text(s)

rupture = Path("src/components/RuptureCanvas.js")
r = rupture.read_text()
r = replace_once(
    r,
    "  resetVersion = 0,\n}) => {",
    "  resetVersion = 0,\n  revealUnderlay = false,\n}) => {",
    "RuptureCanvas reveal prop insertion",
)
r = replace_once(
    r,
    "          alpha: false,",
    "          alpha: revealUnderlay,",
    "RuptureCanvas alpha policy",
)
r = replace_once(
    r,
    '      "u_atlasRows",\n',
    '      "u_atlasRows",\n      "u_externalSurface",\n',
    "RuptureCanvas underlay uniform registration",
)
r = replace_once(
    r,
    "    gl.uniform1i(uniforms.u_atlasRows, atlas.rows);\n",
    "    gl.uniform1i(uniforms.u_atlasRows, atlas.rows);\n    gl.uniform1f(uniforms.u_externalSurface, revealUnderlay ? 1 : 0);\n",
    "RuptureCanvas underlay uniform value",
)
r = replace_once(
    r,
    "  }, [contextVersion]);",
    "  }, [contextVersion, revealUnderlay]);",
    "RuptureCanvas reveal dependency",
)
rupture.write_text(r)

shader = Path("src/components/RuptureShader.js")
sh = shader.read_text()
sh = replace_once(
    sh,
    "uniform int u_atlasRows;\n",
    "uniform int u_atlasRows;\nuniform float u_externalSurface;\n",
    "rupture shader underlay uniform",
)
old_frag = "  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);"
new_frag = '''  float outputAlpha = 1.0;
  if (u_externalSurface > 0.5) {
    float seamOverlay = sat(
      edgeField * 1.35
      + glyphPresence * 0.95
      + cutLine * 0.72
      + innerRim * 0.42
    ) * (1.0 - fullOpen);
    outputAlpha = max(1.0 - inside, seamOverlay);
  }
  fragColor = vec4(clamp(color, 0.0, 1.0), outputAlpha);'''
sh = replace_once(sh, old_frag, new_frag, "rupture shader alpha output")
shader.write_text(sh)

css = Path("src/components/DitherCanvasPage.css")
c = css.read_text()
c = replace_once(
    c,
    ".rupture-shell,\n.spectral-dither-shell {",
    '''.second-surface-stack,
.second-surface-underlay,
.second-surface-rupture {
  position: absolute;
  inset: 0;
}

.second-surface-stack {
  isolation: isolate;
}

.second-surface-underlay {
  z-index: 0;
  overflow: hidden;
}

.second-surface-rupture {
  z-index: 1;
}

.rupture-shell,
.spectral-dither-shell {''',
    "Second Surface layer CSS",
)
c = replace_once(
    c,
    ".morphogen-color-control input:focus-visible,\n.dither-study-option:focus-visible {",
    ".morphogen-color-control input:focus-visible,\n.second-surface-selector select:focus-visible,\n.dither-study-option:focus-visible {",
    "Second Surface focus style",
)
insert_before = "\n\n.metabloom-palette-selector,\n"
selector_css = '''

.second-surface-selector {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  margin: 0 0.4rem 0.8rem;
  padding: 0.4rem;
  border: 1px solid var(--rupture-border);
  border-radius: 1.35rem;
  background: var(--rupture-control);
}

.second-surface-selector-label {
  padding: 0 0.55rem;
  color: var(--rupture-text-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.second-surface-selector select {
  min-width: 0;
  min-height: 3.5rem;
  padding: 0 2.8rem 0 0.9rem;
  border: 1px solid var(--rupture-border);
  border-radius: 1rem;
  background: var(--rupture-panel-active);
  color: var(--rupture-text);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
}
'''
c = replace_once(c, insert_before, selector_css + insert_before, "Second Surface selector CSS")
c = replace_once(
    c,
    "  .metabloom-palette-selector,\n  .tidal-palette-selector,",
    "  .second-surface-selector,\n  .metabloom-palette-selector,\n  .tidal-palette-selector,",
    "Second Surface responsive selector layout",
)
c = replace_once(
    c,
    "  .metabloom-palette-selector-label,\n  .tidal-palette-selector-label,",
    "  .second-surface-selector-label,\n  .metabloom-palette-selector-label,\n  .tidal-palette-selector-label,",
    "Second Surface responsive label layout",
)
css.write_text(c)

page_test = Path("src/components/DitherCanvasPage.test.js")
t = page_test.read_text()
t = replace_once(
    t,
    '    resetVersion,\n  }) =>',
    '    resetVersion,\n    revealUnderlay,\n  }) =>',
    "RuptureCanvas mock reveal prop",
)
t = replace_once(
    t,
    '        "data-reset-version": String(resetVersion),\n',
    '        "data-reset-version": String(resetVersion),\n        "data-reveal-underlay": revealUnderlay ? "true" : "false",\n',
    "RuptureCanvas mock reveal attribute",
)
anchor = '''    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-progress",
      "0",
    );'''
addition = anchor + '''
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reveal-underlay",
      "true",
    );
    const secondSurfaceSelect = screen.getByRole("combobox", {
      name: "Choose the theme beneath Second Surface",
    });
    expect(secondSurfaceSelect).toHaveValue("metabloom");
    expect(within(secondSurfaceSelect).getAllByRole("option")).toHaveLength(11);
    fireEvent.change(secondSurfaceSelect, { target: { value: "dark-theme" } });
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-production-theme",
      "dark",
    );'''
t = replace_once(t, anchor, addition, "Second Surface interaction test")
page_test.write_text(t)

contract_test = Path("src/components/DitherCanvasRuntimeContract.test.js")
contract = contract_test.read_text()
contract = replace_once(
    contract,
    '  const rupture = source("RuptureCanvas.js");\n',
    '  const rupture = source("RuptureCanvas.js");\n  const ruptureShader = source("RuptureShader.js");\n',
    "rupture shader contract source",
)
old_route_contract = '''  test("the route mounts one study renderer and never the persistent black hole", () => {
    expect(page).toContain("key={activeStudy.id}");
    expect(page).toContain("{renderActiveStudy()}");
    expect(page).toContain("data-active-study={activeStudy.id}");
    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(page).toContain(
      'paused: paused || transitionPhase === "exiting"',
    );
    expect(blackHole).toContain('"/dither-canvas"');
  });'''
new_route_contract = '''  test("the route mounts one active scene and bounds every renderer pause path", () => {
    expect(page).toContain("key={activeStudy.id}");
    expect(page).toContain("{renderActiveStudy()}");
    expect(page).toContain("data-active-study={activeStudy.id}");
    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(page).toContain(
      'const sharedPaused = paused || transitionPhase === "exiting";',
    );
    expect(page).toContain("const rendererPaused = asSecondSurface");
    expect(page).toContain(
      "? sharedPaused || firstSurfaceProgress < 0.015",
    );
    expect(page).toContain(": sharedPaused;");
    expect(page).toContain("paused={rendererPaused}");
    expect(blackHole).toContain('"/dither-canvas"');
  });'''
contract = replace_once(
    contract,
    old_route_contract,
    new_route_contract,
    "active scene pause contract",
)
old_production_contract = '''  test("production light and dark are first-class field studies", () => {
    expect(page).toContain('id: "light-theme"');
    expect(page).toContain('id: "dark-theme"');
    expect(page).toContain('type: "production-theme"');
    expect(page).toContain('<ProductionThemeCanvas');
    expect(page).toContain('highFidelityLight={highFidelityMobileLight}');
    expect(page).toContain('runtimeScope="dither-canvas-lab"');
    expect(page).toContain("canAttemptHighFidelityMobileGraphics");
    expect(page).toContain('data-mobile-light-detail={');
    expect(page).toContain('theme={activeStudy.theme}');
    expect(productionThemes).toContain("createVisualRuntimeLightPass({");
    expect(productionThemes).toContain("createVisualRuntimeDarkPass({");
    expect(productionThemes).toContain("candidateRuntime.registerPass(guardedPass)");
    expect(productionThemeStyles).toContain(
      '[data-transition="production-theme"]',
    );
  });'''
new_production_contract = '''  test("production light and dark are first-class field studies", () => {
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

  test("Second Surface composes one selectable underlay beneath a transparent rupture", () => {
    expect(page).toContain(
      'const SECOND_SURFACE_STUDIES = STUDIES.filter((study) => study.id !== "second-surface");',
    );
    expect(page).toContain(
      'const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState("metabloom");',
    );
    expect(page).toContain(
      'aria-label="Choose the theme beneath Second Surface"',
    );
    expect(page).toContain(
      "data-second-surface-study={secondSurfaceStudy.id}",
    );
    expect(page).toContain(
      "{renderStudy(secondSurfaceStudy, { asSecondSurface: true })}",
    );
    expect(page).toContain("revealUnderlay");
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
  });'''
contract = replace_once(
    contract,
    old_production_contract,
    new_production_contract,
    "production and Second Surface contracts",
)
contract_test.write_text(contract)
