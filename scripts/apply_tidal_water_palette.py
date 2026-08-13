from pathlib import Path


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}.")
    return text.replace(old, new)


# DitherCanvasPage.js
page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text(encoding="utf-8")
page = replace_exact(
    page,
    '''const VIEWPORT_WIDTH_CHANGE_THRESHOLD = 48;
const EXIT_DURATION_MS = 420;''',
    '''const VIEWPORT_WIDTH_CHANGE_THRESHOLD = 48;
const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const EXIT_DURATION_MS = 420;''',
    "Tidal palette constants",
)
page = replace_exact(
    page,
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const activeStudy = STUDIES[displayStudyIndex];''',
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);
  const activeStudy = STUDIES[displayStudyIndex];''',
    "Tidal palette state",
)
page = replace_exact(
    page,
    '''      <CreatorOSFieldCanvas
        {...sharedProps}
        mode={activeStudy.mode}
        onFieldStateChange={setFieldState}
      />''',
    '''      <CreatorOSFieldCanvas
        {...sharedProps}
        mode={activeStudy.mode}
        tidalPalette={tidalPalette}
        onFieldStateChange={setFieldState}
      />''',
    "Tidal palette renderer prop",
)
page = replace_exact(
    page,
    '''        <nav className="dither-study-switcher" aria-label="Dither background studies">
          <p className="dither-study-switcher-label">Field studies</p>
          <div className="dither-study-options">''',
    '''        <nav className="dither-study-switcher" aria-label="Dither background studies">
          <p className="dither-study-switcher-label">Field studies</p>
          {activeStudy.id === "tidal-weave" && (
            <div
              className="tidal-palette-selector"
              role="group"
              aria-label="Tidal Weave color scheme"
            >
              <span className="tidal-palette-selector-label">Color</span>
              <button
                type="button"
                className={`tidal-palette-option${
                  tidalPalette === TIDAL_PALETTE_WATER ? " is-active" : ""
                }`}
                data-palette="water"
                onClick={() => setTidalPalette(TIDAL_PALETTE_WATER)}
                aria-pressed={tidalPalette === TIDAL_PALETTE_WATER}
                aria-label="Use water colors for Tidal Weave"
              >
                Water
              </button>
              <button
                type="button"
                className={`tidal-palette-option${
                  tidalPalette === TIDAL_PALETTE_SPECTRAL ? " is-active" : ""
                }`}
                data-palette="spectral"
                onClick={() => setTidalPalette(TIDAL_PALETTE_SPECTRAL)}
                aria-pressed={tidalPalette === TIDAL_PALETTE_SPECTRAL}
                aria-label="Use spectral colors for Tidal Weave"
              >
                Spectral
              </button>
            </div>
          )}
          <div className="dither-study-options">''',
    "Tidal palette selector",
)
page_path.write_text(page, encoding="utf-8")


# CreatorOSFieldCanvas.js
canvas_path = Path("src/components/CreatorOSFieldCanvas.js")
canvas = canvas_path.read_text(encoding="utf-8")
canvas = replace_exact(
    canvas,
    '''const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));''',
    '''const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

const normalizeTidalPalette = (palette) =>
  palette === "spectral" ? "spectral" : "water";

const resolveTidalPaletteMix = (palette) =>
  normalizeTidalPalette(palette) === "spectral" ? 1 : 0;''',
    "Tidal palette normalization",
)
canvas = replace_exact(
    canvas,
    '''  onFieldStateChange,
  paused = false,
  resetVersion = 0,
}) => {''',
    '''  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {''',
    "Tidal palette prop",
)
canvas = replace_exact(
    canvas,
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const onFieldStateChangeRef = useRef(onFieldStateChange);''',
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));
  const onFieldStateChangeRef = useRef(onFieldStateChange);''',
    "Tidal palette ref",
)
canvas = replace_exact(
    canvas,
    '''  useEffect(() => {
    modeRef.current = clampMode(mode);
    redrawRef.current();
  }, [mode]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;''',
    '''  useEffect(() => {
    modeRef.current = clampMode(mode);
    redrawRef.current();
  }, [mode]);

  useEffect(() => {
    tidalPaletteRef.current = resolveTidalPaletteMix(tidalPalette);
    redrawRef.current();
  }, [tidalPalette]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;''',
    "Tidal palette effect",
)
canvas = replace_exact(
    canvas,
    '''      "u_modeA",
      "u_modeB",
      "u_modeMix",
      "u_reaction",''',
    '''      "u_modeA",
      "u_modeB",
      "u_modeMix",
      "u_tidalPaletteMix",
      "u_reaction",''',
    "Tidal palette uniform collection",
)
canvas = replace_exact(
    canvas,
    '''      gl.uniform1i(displayUniforms.u_modeA, currentMode);
      gl.uniform1i(displayUniforms.u_modeB, incomingMode);
      gl.uniform1f(displayUniforms.u_modeMix, modeMix);

      gl.activeTexture(gl.TEXTURE0);''',
    '''      gl.uniform1i(displayUniforms.u_modeA, currentMode);
      gl.uniform1i(displayUniforms.u_modeB, incomingMode);
      gl.uniform1f(displayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );

      gl.activeTexture(gl.TEXTURE0);''',
    "Tidal palette uniform draw",
)
canvas = replace_exact(
    canvas,
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)}${
        fallback ? " is-fallback" : ""
      }`}''',
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)}${
        fallback ? " is-fallback" : ""
      }`}''',
    "Tidal palette fallback class",
)
canvas_path.write_text(canvas, encoding="utf-8")


# CreatorOSFieldShader.js
shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")
shader = replace_exact(
    shader,
    '''uniform int u_modeA;
uniform int u_modeB;
uniform float u_modeMix;
uniform sampler2D u_reaction;''',
    '''uniform int u_modeA;
uniform int u_modeB;
uniform float u_modeMix;
uniform float u_tidalPaletteMix;
uniform sampler2D u_reaction;''',
    "Tidal palette shader uniform",
)
water_function = '''vec3 tidalWaterPalette(float h) {
  float wave = 0.5 + 0.5 * sin(h * TAU);
  float caustic = pow(
    0.5 + 0.5 * cos(h * TAU * 2.0 - 0.72),
    5.0
  );
  vec3 abyss = mix(
    vec3(0.012, 0.075, 0.125),
    vec3(0.055, 0.330, 0.465),
    u_light
  );
  vec3 cobalt = mix(
    vec3(0.027, 0.325, 0.592),
    vec3(0.078, 0.498, 0.682),
    u_light
  );
  vec3 current = mix(
    vec3(0.000, 0.714, 0.816),
    vec3(0.224, 0.722, 0.788),
    u_light
  );
  vec3 foam = mix(
    vec3(0.655, 1.000, 0.945),
    vec3(0.784, 0.969, 0.945),
    u_light
  );
  vec3 color = mix(abyss, cobalt, smoothstep(0.04, 0.72, wave));
  color = mix(color, current, smoothstep(0.48, 0.98, wave));
  return mix(color, foam, caustic * (0.10 + wave * 0.26));
}

'''
shader = replace_exact(
    shader,
    '''vec2 aspectScale() {''',
    water_function + '''vec2 aspectScale() {''',
    "Tidal water palette function",
)
shader = replace_exact(
    shader,
    '''  vec3 tintA = spectral(0.47 + phaseA * 0.18 + time * 0.012);
  vec3 tintB = spectral(0.84 + phaseB * 0.17 - time * 0.010);
  vec3 tint = mix(tintA, tintB, overUnder);
  tint = mix(tint, spectral(0.12 + time * 0.016), crossing * 0.44);

  return fluidMaterial(field, tint, 0.34, 0.22, 0.94);''',
    '''  vec3 spectralTintA = spectral(0.47 + phaseA * 0.18 + time * 0.012);
  vec3 spectralTintB = spectral(0.84 + phaseB * 0.17 - time * 0.010);
  vec3 spectralTint = mix(spectralTintA, spectralTintB, overUnder);
  spectralTint = mix(
    spectralTint,
    spectral(0.12 + time * 0.016),
    crossing * 0.44
  );

  vec3 waterTintA = tidalWaterPalette(
    0.58 + phaseA * 0.19 + p.x * 0.035 + time * 0.008
  );
  vec3 waterTintB = tidalWaterPalette(
    0.16 + phaseB * 0.17 - p.x * 0.028 - time * 0.007
  );
  vec3 waterTint = mix(waterTintA, waterTintB, overUnder);
  vec3 waterFoam = mix(
    vec3(0.655, 1.000, 0.945),
    vec3(0.784, 0.969, 0.945),
    u_light
  );
  waterTint = mix(waterTint, waterFoam, sat(crossing * 0.52));

  vec3 tint = mix(
    waterTint,
    spectralTint,
    sat(u_tidalPaletteMix)
  );
  return fluidMaterial(field, tint, 0.34, 0.22, 0.94);''',
    "Tidal palette-only shader branch",
)
shader_path.write_text(shader, encoding="utf-8")


# CreatorOSFieldCanvas.css
field_css_path = Path("src/components/CreatorOSFieldCanvas.css")
field_css = field_css_path.read_text(encoding="utf-8")
field_css = replace_exact(
    field_css,
    '''.creatoros-field-mode-1 .creatoros-field-fallback {
  background:
    repeating-linear-gradient(164deg, transparent 0 4.1rem, rgba(0, 238, 255, 0.24) 4.25rem 4.65rem, transparent 4.8rem 8.7rem),
    repeating-linear-gradient(16deg, transparent 0 5.1rem, rgba(255, 0, 255, 0.20) 5.25rem 5.65rem, transparent 5.8rem 9.9rem),
    #fff8f7;
}''',
    '''.creatoros-field-mode-1 .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 52% 44%, rgba(167, 255, 241, 0.28), transparent 22%),
    repeating-linear-gradient(164deg, transparent 0 4.1rem, rgba(18, 107, 143, 0.34) 4.25rem 4.65rem, transparent 4.8rem 8.7rem),
    repeating-linear-gradient(16deg, transparent 0 5.1rem, rgba(34, 166, 184, 0.28) 5.25rem 5.65rem, transparent 5.8rem 9.9rem),
    #fff8f7;
}

.creatoros-field-mode-1.creatoros-field-palette-spectral .creatoros-field-fallback {
  background:
    repeating-linear-gradient(164deg, transparent 0 4.1rem, rgba(0, 238, 255, 0.24) 4.25rem 4.65rem, transparent 4.8rem 8.7rem),
    repeating-linear-gradient(16deg, transparent 0 5.1rem, rgba(255, 0, 255, 0.20) 5.25rem 5.65rem, transparent 5.8rem 9.9rem),
    #fff8f7;
}''',
    "Tidal fallback palettes",
)
field_css_path.write_text(field_css, encoding="utf-8")


# DitherCanvasPage.css
page_css_path = Path("src/components/DitherCanvasPage.css")
page_css = page_css_path.read_text(encoding="utf-8")
page_css = replace_exact(
    page_css,
    '''.rupture-brand:focus-visible,
.rupture-nav button:focus-visible,
.dither-study-option:focus-visible {''',
    '''.rupture-brand:focus-visible,
.rupture-nav button:focus-visible,
.tidal-palette-option:focus-visible,
.dither-study-option:focus-visible {''',
    "Tidal palette focus style",
)
palette_css = '''
.tidal-palette-selector {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.45rem;
  margin: 0 0.4rem 0.8rem;
  padding: 0.4rem;
  border: 1px solid var(--rupture-border);
  border-radius: 1.35rem;
  background: var(--rupture-control);
}

.tidal-palette-selector-label {
  padding: 0 0.55rem;
  color: var(--rupture-text-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.tidal-palette-option {
  min-height: 3.5rem;
  padding: 0 0.9rem;
  border: 1px solid transparent;
  border-radius: 1rem;
  background: transparent;
  color: var(--rupture-text-soft);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 220ms ease, border-color 220ms ease, color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
}

.tidal-palette-option:hover {
  border-color: var(--rupture-border);
  color: var(--rupture-text);
  transform: translateY(-1px);
}

.tidal-palette-option.is-active[data-palette="water"] {
  border-color: rgba(34, 166, 184, 0.58);
  background: linear-gradient(
    135deg,
    rgba(11, 47, 74, 0.88),
    rgba(18, 107, 143, 0.78) 52%,
    rgba(34, 166, 184, 0.72)
  );
  color: rgba(234, 255, 252, 0.98);
  box-shadow:
    inset 0 1px 0 rgba(200, 247, 241, 0.32),
    0 0 1.8rem rgba(34, 166, 184, 0.18);
}

.tidal-palette-option.is-active[data-palette="spectral"] {
  border-color: rgba(99, 68, 245, 0.54);
  background: linear-gradient(
    135deg,
    rgba(0, 238, 255, 0.32),
    rgba(99, 68, 245, 0.64) 52%,
    rgba(255, 86, 214, 0.42)
  );
  color: rgba(255, 255, 255, 0.98);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 0 1.8rem rgba(99, 68, 245, 0.18);
}
'''
page_css = replace_exact(
    page_css,
    '''.rupture-copy {
  left: max(4.8rem, env(safe-area-inset-left));''',
    palette_css + '''
.rupture-copy {
  left: max(4.8rem, env(safe-area-inset-left));''',
    "Tidal palette selector styling",
)
page_css = replace_exact(
    page_css,
    '''  .dither-study-switcher-label {
    display: none;
  }

  .dither-study-options {''',
    '''  .dither-study-switcher-label {
    display: none;
  }

  .tidal-palette-selector {
    margin: 0 0 0.55rem;
    padding: 0.35rem;
  }

  .tidal-palette-selector-label {
    padding: 0 0.4rem;
    font-size: 0.78rem;
  }

  .tidal-palette-option {
    min-height: 3.35rem;
    padding: 0 0.65rem;
    font-size: 0.84rem;
  }

  .dither-study-options {''',
    "Tidal palette mobile styling",
)
page_css = replace_exact(
    page_css,
    '''  .rupture-brand,
  .rupture-nav button,
  .rupture-header,''',
    '''  .rupture-brand,
  .rupture-nav button,
  .tidal-palette-option,
  .rupture-header,''',
    "Tidal palette reduced motion",
)
page_css_path.write_text(page_css, encoding="utf-8")


# DitherCanvasPage.test.js
page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text(encoding="utf-8")
page_test = replace_exact(
    page_test,
    '''  return ({ isDark, mode, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(''',
    '''  return ({
    isDark,
    mode,
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(''',
    "CreatorOS field mock palette prop",
)
page_test = replace_exact(
    page_test,
    '''        "data-mode": String(mode),
        "data-theme-mode": isDark ? "dark" : "light",''',
    '''        "data-mode": String(mode),
        "data-tidal-palette": tidalPalette,
        "data-theme-mode": isDark ? "dark" : "light",''',
    "CreatorOS field mock palette attribute",
)
palette_test = '''  test("defaults Tidal Weave to water and keeps spectral as a color-only option", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Tidal Weave/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Tidal Weave" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "1");
    expect(renderer).toHaveAttribute("data-tidal-palette", "water");

    const paletteGroup = screen.getByRole("group", {
      name: "Tidal Weave color scheme",
    });
    const waterOption = within(paletteGroup).getByRole("button", {
      name: "Use water colors for Tidal Weave",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral colors for Tidal Weave",
    });
    expect(waterOption).toHaveAttribute("aria-pressed", "true");
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(spectralOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "1",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-tidal-palette",
      "spectral",
    );
    expect(waterOption).toHaveAttribute("aria-pressed", "false");
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
  });

'''
page_test = replace_exact(
    page_test,
    '''  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    palette_test
    + '''  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    "Tidal palette page test",
)
page_test_path.write_text(page_test, encoding="utf-8")


# CreatorOSFieldCanvas.test.js
canvas_test_path = Path("src/components/CreatorOSFieldCanvas.test.js")
canvas_test = canvas_test_path.read_text(encoding="utf-8")
palette_contract_test = '''  test("defaults Tidal Weave to water and preserves spectral as a palette-only option", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.css"),
      "utf8",
    );
    const tidalStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneTidalWeave",
    );
    const tidalEnd = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneMoireHalo",
    );
    const tidalScene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(
      tidalStart,
      tidalEnd,
    );

    expect(source).toContain('tidalPalette = "water"');
    expect(source).toContain("resolveTidalPaletteMix");
    expect(source).toContain('"u_tidalPaletteMix"');
    expect(source).toContain("creatoros-field-palette-");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "uniform float u_tidalPaletteMix",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "vec3 tidalWaterPalette",
    );
    expect(tidalScene).toContain(
      "mix(waterTint, spectralTint, sat(u_tidalPaletteMix))",
    );
    expect(tidalScene).toContain("weave * 1.18");
    expect(tidalScene).toContain(
      "return fluidMaterial(field, tint, 0.34, 0.22, 0.94)",
    );
    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-spectral",
    );
  });

'''
canvas_test = replace_exact(
    canvas_test,
    '''  test("keeps every refined study distinct inside one renderer", () => {''',
    palette_contract_test
    + '''  test("keeps every refined study distinct inside one renderer", () => {''',
    "Tidal palette renderer contract test",
)
canvas_test_path.write_text(canvas_test, encoding="utf-8")
