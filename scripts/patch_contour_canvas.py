from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


path = Path("src/components/CreatorOSFieldCanvas.js")
source = path.read_text(encoding="utf-8")

source = replace_once(
    source,
    '''const resolveTidalPaletteMix = (palette) =>
  normalizeTidalPalette(palette) === "spectral" ? 1 : 0;

const createRandom = (seed) => {''',
    '''const resolveTidalPaletteMix = (palette) =>
  normalizeTidalPalette(palette) === "spectral" ? 1 : 0;

const normalizeContourPalette = (palette) =>
  palette === "spectral" ? "spectral" : "terrain";

const resolveContourPaletteMix = (palette) =>
  normalizeContourPalette(palette) === "spectral" ? 1 : 0;

const createRandom = (seed) => {''',
    "Contour palette helpers",
)
source = replace_once(
    source,
    '''const CreatorOSFieldCanvas = ({
  isDark = false,
  mode = 0,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {''',
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  mode = 0,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {''',
    "Contour palette prop",
)
source = replace_once(
    source,
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));''',
    '''  const lightRef = useRef(isDark ? 0 : 1);
  const modeRef = useRef(clampMode(mode));
  const contourPaletteRef = useRef(
    resolveContourPaletteMix(contourPalette),
  );
  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));''',
    "Contour palette ref",
)
tidal_effect = '''  useEffect(() => {
    tidalPaletteRef.current = resolveTidalPaletteMix(tidalPalette);
    redrawRef.current();
  }, [tidalPalette]);'''
contour_effect = '''  useEffect(() => {
    contourPaletteRef.current = resolveContourPaletteMix(contourPalette);
    redrawRef.current();
  }, [contourPalette]);

'''
source = replace_once(
    source,
    tidal_effect,
    contour_effect + tidal_effect,
    "Contour palette redraw effect",
)
source = replace_once(
    source,
    '''      "u_modeB",
      "u_modeMix",
      "u_tidalPaletteMix",''',
    '''      "u_modeB",
      "u_modeMix",
      "u_contourPaletteMix",
      "u_tidalPaletteMix",''',
    "Contour palette uniform collection",
)
source = replace_once(
    source,
    '''      gl.uniform1f(displayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );''',
    '''      gl.uniform1f(displayUniforms.u_modeMix, modeMix);
      gl.uniform1f(
        displayUniforms.u_contourPaletteMix,
        contourPaletteRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );''',
    "Contour palette uniform draw",
)
source = replace_once(
    source,
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)}${
        fallback ? " is-fallback" : ""
      }`}''',
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)}${
        fallback ? " is-fallback" : ""
      }`}''',
    "Contour palette class",
)
path.write_text(source, encoding="utf-8")
