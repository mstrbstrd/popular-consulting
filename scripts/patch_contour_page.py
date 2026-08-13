from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


path = Path("src/components/DitherCanvasPage.js")
source = path.read_text(encoding="utf-8")

source = replace_once(
    source,
    '''    description:
      "Procedural terrain flows like suspended pigment, with elevation expressed through viscous spectral contour bands and crisp Bayer cells.",''',
    '''    description:
      "A living relief map drifts beneath pale topographic lines: teal basins, green lowlands, stone ridges, and light summits gain depth through hillshade while spectral color clings subtly to each contour edge.",''',
    "Contour Drift description",
)
source = replace_once(
    source,
    '''const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const EXIT_DURATION_MS = 420;''',
    '''const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";
const EXIT_DURATION_MS = 420;''',
    "Contour palette constants",
)
source = replace_once(
    source,
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);
  const activeStudy = STUDIES[displayStudyIndex];''',
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);
  const [contourPalette, setContourPalette] = useState(
    CONTOUR_PALETTE_TERRAIN,
  );
  const activeStudy = STUDIES[displayStudyIndex];''',
    "Contour palette state",
)
source = replace_once(
    source,
    '''        mode={activeStudy.mode}
        tidalPalette={tidalPalette}
        onFieldStateChange={setFieldState}''',
    '''        mode={activeStudy.mode}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}
        onFieldStateChange={setFieldState}''',
    "Contour palette renderer prop",
)
selector = '''          {activeStudy.id === "contour-drift" && (
            <div
              className="contour-palette-selector"
              role="group"
              aria-label="Contour Drift color scheme"
            >
              <span className="contour-palette-selector-label">Color</span>
              <button
                type="button"
                className={`contour-palette-option${
                  contourPalette === CONTOUR_PALETTE_TERRAIN ? " is-active" : ""
                }`}
                data-palette="terrain"
                onClick={() => setContourPalette(CONTOUR_PALETTE_TERRAIN)}
                aria-pressed={contourPalette === CONTOUR_PALETTE_TERRAIN}
                aria-label="Use terrain colors for Contour Drift"
              >
                Terrain
              </button>
              <button
                type="button"
                className={`contour-palette-option${
                  contourPalette === CONTOUR_PALETTE_SPECTRAL ? " is-active" : ""
                }`}
                data-palette="spectral"
                onClick={() => setContourPalette(CONTOUR_PALETTE_SPECTRAL)}
                aria-pressed={contourPalette === CONTOUR_PALETTE_SPECTRAL}
                aria-label="Use spectral colors for Contour Drift"
              >
                Spectral
              </button>
            </div>
          )}
'''
source = replace_once(
    source,
    '          <div className="dither-study-options">',
    selector + '          <div className="dither-study-options">',
    "Contour palette selector",
)
path.write_text(source, encoding="utf-8")
