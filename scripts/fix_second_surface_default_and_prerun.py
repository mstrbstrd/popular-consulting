from pathlib import Path


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {count}")
    return content.replace(old, new, 1)


page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text()

page = replace_once(
    page,
    'const SECOND_SURFACE_STUDIES = STUDIES.filter((study) => study.id !== "second-surface");',
    '''const ORIGINAL_SECOND_SURFACE = Object.freeze({
  id: "original-second-surface",
  title: "Original Second Surface",
});
const SECOND_SURFACE_STUDIES = STUDIES.filter(
  (study) => study.id !== "second-surface",
);
const SECOND_SURFACE_OPTIONS = Object.freeze([
  ORIGINAL_SECOND_SURFACE,
  ...SECOND_SURFACE_STUDIES,
]);''',
    "Second Surface option registry",
)

page = replace_once(
    page,
    '  const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState("metabloom");',
    '''  const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState(
    ORIGINAL_SECOND_SURFACE.id,
  );''',
    "Second Surface default selection",
)

page = replace_once(
    page,
    '''  const secondSurfaceStudy = SECOND_SURFACE_STUDIES.find(
    (study) => study.id === secondSurfaceStudyId,
  ) || SECOND_SURFACE_STUDIES[0];''',
    '''  const secondSurfaceOption = SECOND_SURFACE_OPTIONS.find(
    (study) => study.id === secondSurfaceStudyId,
  ) || ORIGINAL_SECOND_SURFACE;
  const secondSurfaceStudy =
    secondSurfaceOption.id === ORIGINAL_SECOND_SURFACE.id
      ? null
      : secondSurfaceOption;
  const usesExternalSecondSurface = secondSurfaceStudy !== null;''',
    "Second Surface option resolver",
)

page = replace_once(
    page,
    '''  const activeDescription = activeStudy.id === "second-surface"
    ? `A second surface waits beneath the page. The tear now reveals ${secondSurfaceStudy.title} as a real live field rather than a fixed hidden shader.`
    : isMorphogenPaintMode
      ? "A living sand canvas turns reaction-diffusion pigment into a drawable material. Every stroke settles, diffuses, and glints with the colors you choose."
      : activeStudy.description;''',
    '''  const activeDescription = activeStudy.id === "second-surface"
    ? usesExternalSecondSurface
      ? `A second surface waits beneath the page. The tear now reveals ${secondSurfaceStudy.title} as a live field beneath the original material.`
      : activeStudy.description
    : isMorphogenPaintMode
      ? "A living sand canvas turns reaction-diffusion pigment into a drawable material. Every stroke settles, diffuses, and glints with the colors you choose."
      : activeStudy.description;''',
    "Second Surface dynamic description",
)

page = replace_once(
    page,
    '''    const rendererPaused = asSecondSurface
      ? sharedPaused || firstSurfaceProgress < 0.015
      : sharedPaused;''',
    '''    // A selected underlay runs behind the sealed first surface so the seam
    // reveals an already-moving field rather than triggering a second entrance.
    const rendererPaused = sharedPaused;''',
    "Second Surface pre-run pause policy",
)

page = replace_once(
    page,
    '''        <div
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
        </div>''',
    '''        <div
          className="second-surface-stack"
          data-second-surface-study={secondSurfaceOption.id}
        >
          {usesExternalSecondSurface && (
            <div
              key={`second-surface-underlay-${secondSurfaceStudy.id}`}
              className="second-surface-underlay"
            >
              {renderStudy(secondSurfaceStudy, { asSecondSurface: true })}
            </div>
          )}
          <div className="second-surface-rupture">
            <RuptureCanvas
              isDark={isDark}
              paused={paused || transitionPhase === "exiting"}
              resetVersion={resetVersion}
              progress={firstSurfaceProgress}
              revealUnderlay={usesExternalSecondSurface}
              onRuptureStateChange={setFieldState}
            />
          </div>
        </div>''',
    "Second Surface conditional underlay composition",
)

page = replace_once(
    page,
    "                value={secondSurfaceStudy.id}",
    "                value={secondSurfaceOption.id}",
    "Second Surface selector value",
)

page = replace_once(
    page,
    "                {SECOND_SURFACE_STUDIES.map((study) => (",
    "                {SECOND_SURFACE_OPTIONS.map((study) => (",
    "Second Surface selector options",
)

page_path.write_text(page)

page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text()

page_test = replace_once(
    page_test,
    '''    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
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
    );''',
    '''    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reveal-underlay",
      "false",
    );
    expect(
      screen.queryByTestId("creatoros-field-renderer"),
    ).not.toBeInTheDocument();

    const secondSurfaceSelect = screen.getByRole("combobox", {
      name: "Choose the theme beneath Second Surface",
    });
    expect(secondSurfaceSelect).toHaveValue("original-second-surface");
    expect(within(secondSurfaceSelect).getAllByRole("option")).toHaveLength(12);
    expect(
      within(secondSurfaceSelect).getByRole("option", {
        name: "Original Second Surface",
      }),
    ).toBeInTheDocument();

    fireEvent.change(secondSurfaceSelect, { target: { value: "dark-theme" } });
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reveal-underlay",
      "true",
    );
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-progress",
      "0",
    );
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-production-theme",
      "dark",
    );
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-paused",
      "false",
    );

    fireEvent.change(secondSurfaceSelect, {
      target: { value: "original-second-surface" },
    });
    expect(
      screen.queryByTestId("production-theme-renderer"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reveal-underlay",
      "false",
    );''',
    "Second Surface default and pre-run interaction test",
)

page_test_path.write_text(page_test)

contract_path = Path("src/components/DitherCanvasRuntimeContract.test.js")
contract = contract_path.read_text()

contract = replace_once(
    contract,
    '''    expect(page).toContain("const rendererPaused = asSecondSurface");
    expect(page).toContain(
      "? sharedPaused || firstSurfaceProgress < 0.015",
    );
    expect(page).toContain(": sharedPaused;");''',
    '''    expect(page).toContain("const rendererPaused = sharedPaused;");
    expect(page).not.toContain("firstSurfaceProgress < 0.015");''',
    "shared renderer pause contract",
)

old_contract = '''  test("Second Surface composes one selectable underlay beneath a transparent rupture", () => {
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
new_contract = '''  test("Second Surface defaults to its original field and conditionally composes a selected live underlay", () => {
    expect(page).toContain('id: "original-second-surface"');
    expect(page).toContain('title: "Original Second Surface"');
    expect(page).toContain(
      "const SECOND_SURFACE_OPTIONS = Object.freeze([",
    );
    expect(page).toContain(
      "const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState(\\n    ORIGINAL_SECOND_SURFACE.id,",
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
  });'''

contract = replace_once(
    contract,
    old_contract,
    new_contract,
    "Second Surface composition contract",
)

contract_path.write_text(contract)
