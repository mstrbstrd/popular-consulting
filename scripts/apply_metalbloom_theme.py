from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source block, found {count}."
        )
    return source.replace(old, new)


# Wire the Metabloom-only material selector into the scroll narrative.
page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text(encoding="utf-8")
page = replace_once(
    page,
    '''    description:
      "CreatorOS wax physics become an orbital organism: viscous bodies merge, stretch along their motion, and bloom around the observer.",''',
    '''    description:
      "CreatorOS wax physics become an orbital organism: spectral pigment or mirror-bright liquid metal merges, stretches, and blooms around the observer.",''',
    "Metabloom study copy",
)
page = replace_once(
    page,
    '''const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";''',
    '''const METABLOOM_PALETTE_SPECTRAL = "spectral";
const METABLOOM_PALETTE_METALBLOOM = "metalbloom";
const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";''',
    "Metabloom palette constants",
)
page = replace_once(
    page,
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);''',
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const [metabloomPalette, setMetabloomPalette] = useState(
    METABLOOM_PALETTE_SPECTRAL,
  );
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);''',
    "Metabloom palette state",
)
page = replace_once(
    page,
    '''        mode={activeStudy.mode}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}''',
    '''        mode={activeStudy.mode}
        metabloomPalette={metabloomPalette}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}''',
    "Metabloom renderer prop",
)
metabloom_selector = '''          {activeStudy.id === "metabloom" && (
            <div
              className="metabloom-palette-selector"
              role="group"
              aria-label="Metabloom material finish"
            >
              <span className="metabloom-palette-selector-label">Finish</span>
              <button
                type="button"
                className={`metabloom-palette-option${
                  metabloomPalette === METABLOOM_PALETTE_SPECTRAL
                    ? " is-active"
                    : ""
                }`}
                data-palette="spectral"
                onClick={() => setMetabloomPalette(METABLOOM_PALETTE_SPECTRAL)}
                aria-pressed={metabloomPalette === METABLOOM_PALETTE_SPECTRAL}
                aria-label="Use spectral fluid for Metabloom"
              >
                Spectral
              </button>
              <button
                type="button"
                className={`metabloom-palette-option${
                  metabloomPalette === METABLOOM_PALETTE_METALBLOOM
                    ? " is-active"
                    : ""
                }`}
                data-palette="metalbloom"
                onClick={() => setMetabloomPalette(METABLOOM_PALETTE_METALBLOOM)}
                aria-pressed={
                  metabloomPalette === METABLOOM_PALETTE_METALBLOOM
                }
                aria-label="Use liquid metal for Metabloom"
              >
                Metalbloom
              </button>
            </div>
          )}
'''
page = replace_once(
    page,
    '''          {activeStudy.id === "tidal-weave" && (''',
    metabloom_selector + '''          {activeStudy.id === "tidal-weave" && (''',
    "Metabloom palette selector",
)
page_path.write_text(page, encoding="utf-8")


# Pass the new palette through the existing single WebGL renderer.
canvas_path = Path("src/components/CreatorOSFieldCanvas.js")
canvas = canvas_path.read_text(encoding="utf-8")
canvas = replace_once(
    canvas,
    '''const normalizeTidalPalette = (palette) =>
  palette === "spectral" ? "spectral" : "water";''',
    '''const normalizeMetabloomPalette = (palette) =>
  palette === "metalbloom" ? "metalbloom" : "spectral";

const resolveMetabloomPaletteMix = (palette) =>
  normalizeMetabloomPalette(palette) === "metalbloom" ? 1 : 0;

const normalizeTidalPalette = (palette) =>
  palette === "spectral" ? "spectral" : "water";''',
    "Metabloom palette normalization",
)
canvas = replace_once(
    canvas,
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  mode = 0,''',
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  metabloomPalette = "spectral",
  mode = 0,''',
    "Metabloom canvas prop",
)
canvas = replace_once(
    canvas,
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const contourPaletteRef = useRef(''',
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const metabloomPaletteRef = useRef(
    resolveMetabloomPaletteMix(metabloomPalette),
  );
  const contourPaletteRef = useRef(''',
    "Metabloom palette ref",
)
canvas = replace_once(
    canvas,
    '''  useEffect(() => {
    contourPaletteRef.current = resolveContourPaletteMix(contourPalette);
    redrawRef.current();
  }, [contourPalette]);''',
    '''  useEffect(() => {
    metabloomPaletteRef.current = resolveMetabloomPaletteMix(
      metabloomPalette,
    );
    redrawRef.current();
  }, [metabloomPalette]);

  useEffect(() => {
    contourPaletteRef.current = resolveContourPaletteMix(contourPalette);
    redrawRef.current();
  }, [contourPalette]);''',
    "Metabloom palette effect",
)
canvas = replace_once(
    canvas,
    '''      "u_modeMix",
      "u_contourPaletteMix",''',
    '''      "u_modeMix",
      "u_metabloomPaletteMix",
      "u_contourPaletteMix",''',
    "Metabloom uniform collection",
)
canvas = replace_once(
    canvas,
    '''      gl.uniform1f(displayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        displayUniforms.u_contourPaletteMix,''',
    '''      gl.uniform1f(displayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        displayUniforms.u_metabloomPaletteMix,
        metabloomPaletteRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_contourPaletteMix,''',
    "Metabloom uniform draw",
)
canvas = replace_once(
    canvas,
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)}${''',
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-metabloom-palette-${normalizeMetabloomPalette(metabloomPalette)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)}${''',
    "Metabloom shell class",
)
canvas_path.write_text(canvas, encoding="utf-8")


# Shade the unchanged Metabloom implicit field as mirror-bright liquid metal.
shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")
shader = replace_once(
    shader,
    '''uniform float u_modeMix;
uniform float u_contourPaletteMix;''',
    '''uniform float u_modeMix;
uniform float u_metabloomPaletteMix;
uniform float u_contourPaletteMix;''',
    "Metabloom shader uniform",
)
scene_start = shader.index("vec4 sceneMetabloom")
scene_end = shader.index("\n}\n\nvec4 sceneTidalWeave", scene_start)
material_start = shader.index(
    "vec3 tint = tintAccumulator / max(potential, 0.0001);",
    scene_start,
    scene_end,
)
metalbloom_material = '''vec3 spectralTint = tintAccumulator / max(potential, 0.0001);
vec3 flowTint = spectral(baseHue);
float flowDominance = 0.76 + membrane * 0.10;
spectralTint = mix(spectralTint, flowTint, sat(flowDominance));
float materialField = potential * (1.12 + membrane * 0.18) + edge * 0.24;
vec4 spectralMaterial = fluidMaterial(
  materialField,
  spectralTint,
  0.38 + edge * 0.10,
  0.20 + exp(-nearest * 8.0) * 0.08,
  0.98
);
spectralMaterial.rgb += spectral(baseHue + 0.08) * edge * 0.12;
spectralMaterial.a = max(
  spectralMaterial.a,
  density * (0.16 + membrane * 0.12)
);

// Metalbloom keeps the exact same field topology and derives a pseudo-normal
// from its screen-space slope. A pair of virtual studio lights and reflected
// environment bands create the mirror-like silver response of liquid mercury.
vec2 metalSlope = vec2(dFdx(materialField), dFdy(materialField));
float metalSlopeMagnitude = length(metalSlope);
vec3 metalNormal = normalize(vec3(
  -metalSlope.x * 0.72,
  -metalSlope.y * 0.72,
  0.54 + 0.18 / (1.0 + metalSlopeMagnitude * 3.0)
));
vec3 viewDirection = vec3(0.0, 0.0, 1.0);
vec3 reflectedDirection = reflect(-viewDirection, metalNormal);
vec3 keyDirection = normalize(vec3(-0.52, 0.46, 0.72));
vec3 fillDirection = normalize(vec3(0.68, -0.24, 0.69));
float keySpecular = pow(sat(dot(metalNormal, keyDirection)), 26.0);
float fillSpecular = pow(sat(dot(metalNormal, fillDirection)), 10.0);
float studioHorizon = exp(-abs(reflectedDirection.y - 0.12) * 5.8);
float studioStrip = exp(-abs(reflectedDirection.x + 0.34) * 11.0);
float environmentReflection = fbm(
  rotate2(-0.36) * (p + reflectedDirection.xy * 0.34) * 1.18
    + vec2(u_seed * 3.3, -u_seed * 2.4)
);
float mirrorLevel = sat(
  0.05
    + studioHorizon * 0.50
    + studioStrip * 0.26
    + keySpecular * 1.18
    + fillSpecular * 0.42
    + (environmentReflection - 0.42) * 0.24
    + membrane * 0.06
);
float metalFresnel = pow(1.0 - sat(metalNormal.z), 3.2);

vec3 mercuryShadow = mix(
  vec3(0.020, 0.026, 0.034),
  vec3(0.110, 0.125, 0.145),
  u_light
);
vec3 mercuryMid = mix(
  vec3(0.290, 0.325, 0.370),
  vec3(0.460, 0.490, 0.535),
  u_light
);
vec3 mercuryHighlight = mix(
  vec3(1.300, 1.340, 1.390),
  vec3(1.190, 1.220, 1.260),
  u_light
);
vec3 metalTint = mix(
  mercuryShadow,
  mercuryMid,
  smoothstep(0.04, 0.58, mirrorLevel)
);
metalTint = mix(
  metalTint,
  mercuryHighlight,
  smoothstep(0.48, 0.96, mirrorLevel)
);
float reflectedDepth = smoothstep(0.85, 2.8, potential)
  * (1.0 - smoothstep(0.18, 0.92, mirrorLevel))
  * (0.10 + metalFresnel * 0.12);
metalTint = mix(metalTint, mercuryShadow * 0.62, reflectedDepth);
metalTint += mercuryHighlight * keySpecular * 0.18;

// The Spectral Display identity appears as a restrained prismatic film on
// the mercury rim and strongest reflection turns, never replacing the silver.
float metalAccentHue = baseHue
  + reflectedDirection.x * 0.12
  - reflectedDirection.y * 0.08
  + environmentReflection * 0.08;
vec3 metalAccentSpectrum = spectral(metalAccentHue);
float metalAccentChroma = mix(0.42, 0.34, u_light);
float metalLuma = dot(metalTint, vec3(0.2126, 0.7152, 0.0722));
vec3 prismaticSilver = mix(
  vec3(max(metalLuma, 0.58)),
  metalAccentSpectrum,
  metalAccentChroma
);
prismaticSilver = max(
  prismaticSilver,
  vec3(mix(0.34, 0.46, u_light))
);
float metalAccentMask = sat(
  edge * 0.48
    + metalFresnel * 0.32
    + studioStrip * 0.08
    + abs(membrane - 0.5) * 0.06
);
metalTint = mix(
  metalTint,
  prismaticSilver,
  metalAccentMask * mix(0.30, 0.26, u_light)
);

vec4 metalMaterial = fluidMaterial(
  materialField,
  metalTint,
  0.58 + edge * 0.12,
  0.06 + studioHorizon * 0.04,
  0.99
);
float metalBody = smoothstep(0.68, 1.16, materialField);
metalMaterial.rgb = mix(
  metalMaterial.rgb,
  metalTint * (0.90 + mirrorLevel * 0.16),
  metalBody * 0.76
);
metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.18
    + fillSpecular * 0.06
    + edge * metalFresnel * 0.05
);
metalMaterial.a = max(
  metalMaterial.a,
  density * (0.24 + membrane * 0.10)
);

return mix(
  spectralMaterial,
  metalMaterial,
  sat(u_metabloomPaletteMix)
);'''
shader = shader[:material_start] + metalbloom_material + shader[scene_end:]
shader_path.write_text(shader, encoding="utf-8")


# Give the liquid-metal finish an environment that reads as chrome in both themes.
field_css_path = Path("src/components/CreatorOSFieldCanvas.css")
field_css = field_css_path.read_text(encoding="utf-8")
metal_background = '''.creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {
  background:
    radial-gradient(ellipse at 26% 18%, rgba(255, 255, 255, 0.88), transparent 24%),
    radial-gradient(ellipse at 74% 72%, rgba(99, 68, 245, 0.10), transparent 36%),
    radial-gradient(ellipse at 54% 46%, rgba(255, 86, 214, 0.06), transparent 42%),
    linear-gradient(145deg, #d8dde1 0%, #737b86 48%, #edf0f2 100%);
}

[data-theme="dark"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {
  background:
    radial-gradient(ellipse at 26% 18%, rgba(255, 255, 255, 0.18), transparent 25%),
    radial-gradient(ellipse at 74% 72%, rgba(0, 238, 255, 0.08), transparent 36%),
    radial-gradient(ellipse at 54% 46%, rgba(255, 86, 214, 0.07), transparent 42%),
    linear-gradient(145deg, #020305 0%, #11161c 48%, #303741 100%);
}

'''
field_css = replace_once(
    field_css,
    '''.creatoros-field-mode-1.creatoros-field-palette-water {''',
    metal_background + '''.creatoros-field-mode-1.creatoros-field-palette-water {''',
    "Metalbloom shell background",
)
metal_fallback = '''.creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 30% 68%, rgba(238, 244, 248, 0.92), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(58, 66, 76, 0.84), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(218, 226, 232, 0.88), transparent 26%),
    radial-gradient(ellipse at 54% 46%, rgba(99, 68, 245, 0.12), transparent 42%),
    linear-gradient(145deg, #c8ced3 0%, #505862 52%, #e5e9ec 100%);
}

[data-theme="dark"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 30% 68%, rgba(226, 234, 240, 0.72), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(8, 12, 17, 0.94), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(176, 187, 197, 0.62), transparent 26%),
    radial-gradient(ellipse at 54% 46%, rgba(255, 86, 214, 0.10), transparent 42%),
    linear-gradient(145deg, #020305 0%, #11161c 52%, #343b45 100%);
}

'''
field_css = replace_once(
    field_css,
    '''.creatoros-field-mode-1 .creatoros-field-fallback {''',
    metal_fallback + '''.creatoros-field-mode-1 .creatoros-field-fallback {''',
    "Metalbloom CSS fallback",
)
field_css_path.write_text(field_css, encoding="utf-8")


# Extend the existing compact palette controls without changing layout conventions.
page_css_path = Path("src/components/DitherCanvasPage.css")
page_css = page_css_path.read_text(encoding="utf-8")
page_css = replace_once(
    page_css,
    '''.rupture-brand:focus-visible,
.rupture-nav button:focus-visible,
.tidal-palette-option:focus-visible,
.contour-palette-option:focus-visible,''',
    '''.rupture-brand:focus-visible,
.rupture-nav button:focus-visible,
.metabloom-palette-option:focus-visible,
.tidal-palette-option:focus-visible,
.contour-palette-option:focus-visible,''',
    "Metabloom palette focus ring",
)
page_css = replace_once(
    page_css,
    '''.tidal-palette-selector,
.contour-palette-selector {''',
    '''.metabloom-palette-selector,
.tidal-palette-selector,
.contour-palette-selector {''',
    "Metabloom palette selector layout",
)
page_css = replace_once(
    page_css,
    '''.tidal-palette-selector-label,
.contour-palette-selector-label {''',
    '''.metabloom-palette-selector-label,
.tidal-palette-selector-label,
.contour-palette-selector-label {''',
    "Metabloom palette label",
)
page_css = replace_once(
    page_css,
    '''.tidal-palette-option,
.contour-palette-option {''',
    '''.metabloom-palette-option,
.tidal-palette-option,
.contour-palette-option {''',
    "Metabloom palette options",
)
page_css = replace_once(
    page_css,
    '''.tidal-palette-option:hover,
.contour-palette-option:hover {''',
    '''.metabloom-palette-option:hover,
.tidal-palette-option:hover,
.contour-palette-option:hover {''',
    "Metabloom palette hover",
)
metal_button = '''.metabloom-palette-option.is-active[data-palette="metalbloom"] {
  border-color: rgba(228, 235, 241, 0.76);
  background: linear-gradient(
    135deg,
    rgba(35, 40, 48, 0.98) 0%,
    rgba(229, 235, 240, 0.96) 42%,
    rgba(104, 113, 126, 0.96) 68%,
    rgba(248, 250, 252, 0.98) 100%
  );
  color: rgba(17, 21, 28, 0.96);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.86),
    0 0 0 1px rgba(99, 68, 245, 0.10),
    0 0 1.8rem rgba(36, 204, 255, 0.10),
    0 0 2.2rem rgba(255, 86, 214, 0.08);
}

'''
page_css = replace_once(
    page_css,
    '''.tidal-palette-option.is-active[data-palette="spectral"],
.contour-palette-option.is-active[data-palette="spectral"] {''',
    metal_button
    + '''.metabloom-palette-option.is-active[data-palette="spectral"],
.tidal-palette-option.is-active[data-palette="spectral"],
.contour-palette-option.is-active[data-palette="spectral"] {''',
    "Metalbloom active finish styling",
)
page_css_path.write_text(page_css, encoding="utf-8")


# Exercise the real selector behavior through the page test mock.
page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text(encoding="utf-8")
page_test = replace_once(
    page_test,
    '''    isDark,
    mode,
    onFieldStateChange,''',
    '''    isDark,
    metabloomPalette = "spectral",
    mode,
    onFieldStateChange,''',
    "Metabloom test mock prop",
)
page_test = replace_once(
    page_test,
    '''        "data-mode": String(mode),
        "data-contour-palette": contourPalette,''',
    '''        "data-mode": String(mode),
        "data-metabloom-palette": metabloomPalette,
        "data-contour-palette": contourPalette,''',
    "Metabloom test mock attribute",
)
metabloom_test = '''  test("keeps spectral Metabloom by default and offers a liquid-metal finish", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Metabloom" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "0");
    expect(renderer).toHaveAttribute("data-metabloom-palette", "spectral");

    const paletteGroup = screen.getByRole("group", {
      name: "Metabloom material finish",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral fluid for Metabloom",
    });
    const metalbloomOption = within(paletteGroup).getByRole("button", {
      name: "Use liquid metal for Metabloom",
    });
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
    expect(metalbloomOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(metalbloomOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "0",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-metabloom-palette",
      "metalbloom",
    );
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");
    expect(metalbloomOption).toHaveAttribute("aria-pressed", "true");
  });

'''
page_test = replace_once(
    page_test,
    '''  test("defaults Tidal Weave to water and keeps spectral as a color-only option", () => {''',
    metabloom_test
    + '''  test("defaults Tidal Weave to water and keeps spectral as a color-only option", () => {''',
    "Metabloom page behavior test",
)
page_test_path.write_text(page_test, encoding="utf-8")


# Pin the optical construction and the no-geometry-change contract.
metal_test_path = Path("src/components/MetalbloomTheme.test.js")
metal_test_path.write_text(
    '''import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

const fs = require("fs");
const path = require("path");

const canvasSource = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.js"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.join(__dirname, "DitherCanvasPage.js"),
  "utf8",
);
const fieldStyles = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.css"),
  "utf8",
);
const pageStyles = fs.readFileSync(
  path.join(__dirname, "DitherCanvasPage.css"),
  "utf8",
);

const sceneStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
  "vec4 sceneMetabloom",
);
const sceneEnd = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
  "vec4 sceneTidalWeave",
);
const scene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(sceneStart, sceneEnd);

describe("Metalbloom material theme", () => {
  test("adds a Metabloom-only material selector without remounting the renderer", () => {
    expect(pageSource).toContain("METABLOOM_PALETTE_METALBLOOM");
    expect(pageSource).toContain("Metabloom material finish");
    expect(pageSource).toContain("Use liquid metal for Metabloom");
    expect(pageSource).toContain("metabloomPalette={metabloomPalette}");
    expect(canvasSource).toContain('metabloomPalette = "spectral"');
    expect(canvasSource).toContain("resolveMetabloomPaletteMix");
    expect(canvasSource).toContain('"u_metabloomPaletteMix"');
    expect(canvasSource).toContain("metabloomPaletteRef.current");
    expect(canvasSource).toContain(
      "creatoros-field-metabloom-palette-",
    );
  });

  test("renders mercury through normals, reflected studio light, and Fresnel", () => {
    expect(sceneStart).toBeGreaterThanOrEqual(0);
    expect(sceneEnd).toBeGreaterThan(sceneStart);
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "uniform float u_metabloomPaletteMix",
    );
    expect(scene).toContain("vec2 metalSlope = vec2(dFdx(materialField)");
    expect(scene).toContain("vec3 metalNormal = normalize");
    expect(scene).toContain("reflect(-viewDirection, metalNormal)");
    expect(scene).toContain("float keySpecular");
    expect(scene).toContain("float studioHorizon");
    expect(scene).toContain("float studioStrip");
    expect(scene).toContain("float metalFresnel");
    expect(scene).toContain("vec3 mercuryShadow");
    expect(scene).toContain("vec3 mercuryMid");
    expect(scene).toContain("vec3 mercuryHighlight");
    expect(scene).toContain("vec4 metalMaterial = fluidMaterial");
  });

  test("keeps the rainbow as a restrained accent and preserves topology", () => {
    expect(scene).toContain("float metalAccentHue");
    expect(scene).toContain("vec3 metalAccentSpectrum");
    expect(scene).toContain("float metalAccentMask");
    expect(scene).toContain("metalAccentMask * mix(0.30, 0.26, u_light)");
    expect(scene).toContain("spectralMaterial");
    expect(scene).toContain("metalMaterial");
    expect(scene).toContain("sat(u_metabloomPaletteMix)");

    expect(scene).toContain("for (int index = 0; index < 7; index++)");
    expect(scene).toContain("time * (0.16 + layer * 0.009)");
    expect(scene).toContain("p = viscousWarp(p, time, 0.08)");
    expect(scene).toContain("potential * 4.4");
    expect(scene).toContain("smoothstep(0.36, 2.65, potential)");
  });

  test("keeps the selector and fallback inside the site visual language", () => {
    expect(fieldStyles).toContain(
      ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom",
    );
    expect(fieldStyles).toContain("linear-gradient(145deg, #d8dde1");
    expect(fieldStyles).toContain("linear-gradient(145deg, #020305");
    expect(pageStyles).toContain(".metabloom-palette-selector");
    expect(pageStyles).toContain(
      '.metabloom-palette-option.is-active[data-palette="metalbloom"]',
    );
    expect(pageStyles).toContain(
      '.metabloom-palette-option.is-active[data-palette="spectral"]',
    );
  });
});
''',
    encoding="utf-8",
)
