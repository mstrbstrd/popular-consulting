from pathlib import Path
import re


def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}.")
    return source.replace(old, new, 1)


def replace_regex(
    source: str,
    pattern: str,
    replacement: str,
    label: str,
    flags: int = 0,
) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}.")
    return updated


# Dither page controls and copy.
page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text(encoding="utf-8")

page = replace_exact(
    page,
    '''    description:
      "A live reaction-diffusion system grows cells, fronts, and dividing islands, now rendered as translucent CreatorOS pigment rather than glyphs.",
    instruction:
      "Move to feed the chemistry · tap to seed an expanding reaction front · reseed for a new organism",''',
    '''    description:
      "A live reaction-diffusion system grows cells, fronts, and dividing islands as translucent CreatorOS pigment.",
    instruction:
      "Move to feed the chemistry · tap to seed an expanding reaction front · reseed for a new organism",
    paintDescription:
      "A living sand canvas turns Morphogen Divide into a tactile drawing surface, where every stroke settles, diffuses, and keeps the Spectral Display grain.",
    paintInstruction:
      "Press and drag anywhere outside the controls to paint · choose a gradient, brush, or eraser · Clear starts a fresh canvas",''',
    "Morphogen study copy",
)

page = replace_exact(
    page,
    '''const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";
const EXIT_DURATION_MS = 420;''',
    '''const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";
const MORPHOGEN_EXPERIENCE_ORGANISM = "organism";
const MORPHOGEN_EXPERIENCE_PAINT = "paint";
const MORPHOGEN_PALETTE_SPECTRAL = "spectral";
const MORPHOGEN_PALETTE_TIDE = "tide";
const MORPHOGEN_PALETTE_BLOOM = "bloom";
const MORPHOGEN_PALETTE_GRAPHITE = "graphite";
const MORPHOGEN_TOOL_DRAW = "draw";
const MORPHOGEN_TOOL_ERASE = "erase";
const MORPHOGEN_BRUSH_FINE = "fine";
const MORPHOGEN_BRUSH_MEDIUM = "medium";
const MORPHOGEN_BRUSH_BROAD = "broad";
const EXIT_DURATION_MS = 420;''',
    "Morphogen control constants",
)

page = replace_exact(
    page,
    '''  const [contourPalette, setContourPalette] = useState(
    CONTOUR_PALETTE_TERRAIN,
  );
  const activeStudy = STUDIES[displayStudyIndex];
  displayStudyIndexRef.current = displayStudyIndex;''',
    '''  const [contourPalette, setContourPalette] = useState(
    CONTOUR_PALETTE_TERRAIN,
  );
  const [morphogenExperience, setMorphogenExperience] = useState(
    MORPHOGEN_EXPERIENCE_ORGANISM,
  );
  const [morphogenPalette, setMorphogenPalette] = useState(
    MORPHOGEN_PALETTE_SPECTRAL,
  );
  const [morphogenTool, setMorphogenTool] = useState(MORPHOGEN_TOOL_DRAW);
  const [morphogenBrushSize, setMorphogenBrushSize] = useState(
    MORPHOGEN_BRUSH_MEDIUM,
  );
  const activeStudy = STUDIES[displayStudyIndex];
  const isMorphogenPaint =
    activeStudy.id === "morphogen-divide"
    && morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT;
  const activeDescription = isMorphogenPaint
    ? activeStudy.paintDescription
    : activeStudy.description;
  const activeInstruction = isMorphogenPaint
    ? activeStudy.paintInstruction
    : activeStudy.instruction;
  const activeResetLabel = isMorphogenPaint
    ? "Clear"
    : activeStudy.resetLabel;
  displayStudyIndexRef.current = displayStudyIndex;''',
    "Morphogen control state",
)

page = replace_exact(
    page,
    '''        metabloomPalette={metabloomPalette}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}
        onFieldStateChange={setFieldState}''',
    '''        metabloomPalette={metabloomPalette}
        contourPalette={contourPalette}
        morphogenExperience={morphogenExperience}
        morphogenPalette={morphogenPalette}
        morphogenTool={morphogenTool}
        morphogenBrushSize={morphogenBrushSize}
        tidalPalette={tidalPalette}
        onFieldStateChange={setFieldState}''',
    "Morphogen renderer props",
)

page = replace_exact(
    page,
    '''      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase}`}''',
    '''      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase} morphogen-experience-${morphogenExperience}`}''',
    "Morphogen page state class",
)

page = replace_exact(
    page,
    '''                {activeStudy.resetLabel}''',
    '''                {activeResetLabel}''',
    "dynamic Morphogen reset label",
)

page = replace_exact(
    page,
    '''          <p className="rupture-description">{activeStudy.description}</p>
          <p className="rupture-instruction">{activeStudy.instruction}</p>''',
    '''          <p className="rupture-description">{activeDescription}</p>
          <p className="rupture-instruction">{activeInstruction}</p>''',
    "dynamic Morphogen copy",
)

morphogen_controls = '''          {activeStudy.id === "morphogen-divide" && (
            <div className="morphogen-control-stack">
              <div
                className="morphogen-experience-selector"
                role="group"
                aria-label="Morphogen Divide experience"
              >
                <span className="morphogen-experience-selector-label">Mode</span>
                <button
                  type="button"
                  className={`morphogen-experience-option${
                    morphogenExperience === MORPHOGEN_EXPERIENCE_ORGANISM
                      ? " is-active"
                      : ""
                  }`}
                  data-experience="organism"
                  onClick={() => {
                    setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM);
                    setFieldState("forming");
                  }}
                  aria-pressed={
                    morphogenExperience === MORPHOGEN_EXPERIENCE_ORGANISM
                  }
                  aria-label="Use the living organism experience"
                >
                  Organism
                </button>
                <button
                  type="button"
                  className={`morphogen-experience-option${
                    morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT
                      ? " is-active"
                      : ""
                  }`}
                  data-experience="paint"
                  onClick={() => {
                    setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT);
                    setFieldState("ready");
                  }}
                  aria-pressed={
                    morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT
                  }
                  aria-label="Use the interactive sand paint experience"
                >
                  Sand Paint
                </button>
              </div>

              {morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT && (
                <div
                  className="morphogen-paint-toolbar"
                  role="group"
                  aria-label="Sand paint controls"
                >
                  <div
                    className="morphogen-control-row"
                    role="group"
                    aria-label="Sand paint tool"
                  >
                    <span className="morphogen-control-label">Tool</span>
                    <div className="morphogen-control-options">
                      <button
                        type="button"
                        className={`morphogen-control-option${
                          morphogenTool === MORPHOGEN_TOOL_DRAW
                            ? " is-active"
                            : ""
                        }`}
                        data-tool="draw"
                        onClick={() => setMorphogenTool(MORPHOGEN_TOOL_DRAW)}
                        aria-pressed={morphogenTool === MORPHOGEN_TOOL_DRAW}
                        aria-label="Draw with sand"
                      >
                        Draw
                      </button>
                      <button
                        type="button"
                        className={`morphogen-control-option${
                          morphogenTool === MORPHOGEN_TOOL_ERASE
                            ? " is-active"
                            : ""
                        }`}
                        data-tool="erase"
                        onClick={() => setMorphogenTool(MORPHOGEN_TOOL_ERASE)}
                        aria-pressed={morphogenTool === MORPHOGEN_TOOL_ERASE}
                        aria-label="Erase sand"
                      >
                        Erase
                      </button>
                    </div>
                  </div>

                  <div
                    className="morphogen-control-row"
                    role="group"
                    aria-label="Sand paint brush size"
                  >
                    <span className="morphogen-control-label">Brush</span>
                    <div className="morphogen-control-options morphogen-brush-options">
                      {[
                        [MORPHOGEN_BRUSH_FINE, "Fine"],
                        [MORPHOGEN_BRUSH_MEDIUM, "Medium"],
                        [MORPHOGEN_BRUSH_BROAD, "Broad"],
                      ].map(([size, label]) => (
                        <button
                          key={size}
                          type="button"
                          className={`morphogen-control-option${
                            morphogenBrushSize === size ? " is-active" : ""
                          }`}
                          data-brush={size}
                          onClick={() => setMorphogenBrushSize(size)}
                          aria-pressed={morphogenBrushSize === size}
                          aria-label={`${label} sand brush`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="morphogen-control-row morphogen-gradient-row"
                    role="group"
                    aria-label="Sand paint gradient"
                  >
                    <span className="morphogen-control-label">Gradient</span>
                    <div className="morphogen-control-options morphogen-gradient-options">
                      {[
                        [MORPHOGEN_PALETTE_SPECTRAL, "Spectral"],
                        [MORPHOGEN_PALETTE_TIDE, "Tide"],
                        [MORPHOGEN_PALETTE_BLOOM, "Bloom"],
                        [MORPHOGEN_PALETTE_GRAPHITE, "Graphite"],
                      ].map(([palette, label]) => (
                        <button
                          key={palette}
                          type="button"
                          className={`morphogen-control-option${
                            morphogenPalette === palette ? " is-active" : ""
                          }`}
                          data-palette={palette}
                          onClick={() => setMorphogenPalette(palette)}
                          aria-pressed={morphogenPalette === palette}
                          aria-label={`Use the ${label} sand gradient`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
'''

page = replace_exact(
    page,
    '''          <div className="dither-study-options">''',
    morphogen_controls + '''          <div className="dither-study-options">''',
    "Morphogen paint toolbar",
)

page_path.write_text(page, encoding="utf-8")


# CreatorOS renderer lifecycle, brush input, and uniforms.
canvas_path = Path("src/components/CreatorOSFieldCanvas.js")
canvas = canvas_path.read_text(encoding="utf-8")

canvas = replace_exact(
    canvas,
    '''const REACTION_WARMUP_STEPS = isMobileTier ? 18 : 32;

const clamp =''',
    '''const REACTION_WARMUP_STEPS = isMobileTier ? 18 : 32;
const MORPHOGEN_PALETTE_INDEX = Object.freeze({
  spectral: 0,
  tide: 1,
  bloom: 2,
  graphite: 3,
});
const MORPHOGEN_BRUSH_RADIUS = Object.freeze({
  fine: 0.012,
  medium: 0.024,
  broad: 0.046,
});

const clamp =''',
    "Morphogen renderer constants",
)

canvas = replace_exact(
    canvas,
    '''const resolveContourPaletteMix = (palette) =>
  normalizeContourPalette(palette) === "spectral" ? 1 : 0;

const createRandom =''',
    '''const resolveContourPaletteMix = (palette) =>
  normalizeContourPalette(palette) === "spectral" ? 1 : 0;

const normalizeMorphogenExperience = (experience) =>
  experience === "paint" ? "paint" : "organism";

const resolveMorphogenPaintMix = (experience) =>
  normalizeMorphogenExperience(experience) === "paint" ? 1 : 0;

const normalizeMorphogenPalette = (palette) =>
  Object.prototype.hasOwnProperty.call(MORPHOGEN_PALETTE_INDEX, palette)
    ? palette
    : "spectral";

const resolveMorphogenPaletteIndex = (palette) =>
  MORPHOGEN_PALETTE_INDEX[normalizeMorphogenPalette(palette)];

const normalizeMorphogenTool = (tool) =>
  tool === "erase" ? "erase" : "draw";

const resolveMorphogenEraseMix = (tool) =>
  normalizeMorphogenTool(tool) === "erase" ? 1 : 0;

const normalizeMorphogenBrushSize = (size) =>
  Object.prototype.hasOwnProperty.call(MORPHOGEN_BRUSH_RADIUS, size)
    ? size
    : "medium";

const resolveMorphogenBrushRadius = (size) =>
  MORPHOGEN_BRUSH_RADIUS[normalizeMorphogenBrushSize(size)];

const createRandom =''',
    "Morphogen renderer normalizers",
)

canvas = replace_regex(
    canvas,
    r'''const buildReactionSeed = \(size, seed\) => \{\n  const random = createRandom\(seed\);\n  const circles = Array\.from\(\{ length: isMobileTier \? 9 : 13 \}, \(\) => \(\{\n    x: 0\.08 \+ random\(\) \* 0\.84,\n    y: 0\.08 \+ random\(\) \* 0\.84,\n    radius: 0\.020 \+ random\(\) \* 0\.048,\n    strength: 0\.42 \+ random\(\) \* 0\.42,\n  \}\)\);\n  const data = new Uint8Array\(size \* size \* 4\);''',
    '''const buildReactionSeed = (size, seed, morphogenPaintMix = 0) => {
  const random = createRandom(seed);
  const data = new Uint8Array(size * size * 4);

  if (morphogenPaintMix >= 0.5) {
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = 255;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
    return data;
  }

  const circles = Array.from({ length: isMobileTier ? 9 : 13 }, () => ({
    x: 0.08 + random() * 0.84,
    y: 0.08 + random() * 0.84,
    radius: 0.020 + random() * 0.048,
    strength: 0.42 + random() * 0.42,
  }));''',
    "blank sand-paint reaction seed",
)

canvas = replace_exact(
    canvas,
    '''const createReactionTargets = (gl, size, seed) => {
  const textures = [];
  const framebuffers = [];
  const data = buildReactionSeed(size, seed);''',
    '''const createReactionTargets = (
  gl,
  size,
  seed,
  morphogenPaintMix = 0,
) => {
  const textures = [];
  const framebuffers = [];
  const data = buildReactionSeed(size, seed, morphogenPaintMix);''',
    "paint-aware reaction target creation",
)

canvas = replace_exact(
    canvas,
    '''const resetReactionTargets = (gl, targets, seed) => {
  const data = buildReactionSeed(targets.size, seed);''',
    '''const resetReactionTargets = (
  gl,
  targets,
  seed,
  morphogenPaintMix = 0,
) => {
  const data = buildReactionSeed(
    targets.size,
    seed,
    morphogenPaintMix,
  );''',
    "paint-aware reaction reset",
)

canvas = replace_exact(
    canvas,
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  metabloomPalette = "spectral",
  mode = 0,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {''',
    '''const CreatorOSFieldCanvas = ({
  contourPalette = "terrain",
  isDark = false,
  metabloomPalette = "spectral",
  mode = 0,
  morphogenBrushSize = "medium",
  morphogenExperience = "organism",
  morphogenPalette = "spectral",
  morphogenTool = "draw",
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
  tidalPalette = "water",
}) => {''',
    "Morphogen renderer props",
)

canvas = replace_exact(
    canvas,
    '''  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));
  const onFieldStateChangeRef = useRef(onFieldStateChange);''',
    '''  const tidalPaletteRef = useRef(resolveTidalPaletteMix(tidalPalette));
  const morphogenPaintRef = useRef(
    resolveMorphogenPaintMix(morphogenExperience),
  );
  const morphogenPaletteRef = useRef(
    resolveMorphogenPaletteIndex(morphogenPalette),
  );
  const morphogenEraseRef = useRef(resolveMorphogenEraseMix(morphogenTool));
  const morphogenBrushRadiusRef = useRef(
    resolveMorphogenBrushRadius(morphogenBrushSize),
  );
  const onFieldStateChangeRef = useRef(onFieldStateChange);''',
    "Morphogen renderer refs",
)

canvas = replace_exact(
    canvas,
    '''  useEffect(() => {
    tidalPaletteRef.current = resolveTidalPaletteMix(tidalPalette);
    redrawRef.current();
  }, [tidalPalette]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;''',
    '''  useEffect(() => {
    tidalPaletteRef.current = resolveTidalPaletteMix(tidalPalette);
    redrawRef.current();
  }, [tidalPalette]);

  useEffect(() => {
    const nextPaintMix = resolveMorphogenPaintMix(morphogenExperience);
    if (morphogenPaintRef.current !== nextPaintMix) {
      morphogenPaintRef.current = nextPaintMix;
      restartRef.current = true;
    }
    redrawRef.current();
  }, [morphogenExperience]);

  useEffect(() => {
    morphogenPaletteRef.current = resolveMorphogenPaletteIndex(
      morphogenPalette,
    );
    redrawRef.current();
  }, [morphogenPalette]);

  useEffect(() => {
    morphogenEraseRef.current = resolveMorphogenEraseMix(morphogenTool);
    redrawRef.current();
  }, [morphogenTool]);

  useEffect(() => {
    morphogenBrushRadiusRef.current = resolveMorphogenBrushRadius(
      morphogenBrushSize,
    );
    redrawRef.current();
  }, [morphogenBrushSize]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;''',
    "Morphogen prop effects",
)

canvas = replace_exact(
    canvas,
    '''    let activeState = currentMode === REACTION_MODE ? "forming" : "drifting";
    let reactionStepsTaken = 0;
    let reactionWarmupRemaining =
      currentMode === REACTION_MODE ? REACTION_WARMUP_STEPS : 0;''',
    '''    let activeState = currentMode === REACTION_MODE
      ? morphogenPaintRef.current >= 0.5
        ? "ready"
        : "forming"
      : "drifting";
    let reactionStepsTaken = 0;
    let reactionWarmupRemaining =
      currentMode === REACTION_MODE && morphogenPaintRef.current < 0.5
        ? REACTION_WARMUP_STEPS
        : 0;''',
    "Morphogen initial state",
)

canvas = replace_exact(
    canvas,
    '''    const pulseOrigin = { x: 0.52, y: 0.52 };
    const page = root.closest(".dither-canvas-page");''',
    '''    const pulseOrigin = { x: 0.52, y: 0.52 };
    const brush = {
      down: false,
      pending: false,
      pointerId: null,
      fromX: 0.52,
      fromY: 0.52,
      toX: 0.52,
      toY: 0.52,
    };
    const page = root.closest(".dither-canvas-page");''',
    "Morphogen brush state",
)

canvas = replace_exact(
    canvas,
    '''      reactionTargets = createReactionTargets(gl, REACTION_SIZE, seed);''',
    '''      reactionTargets = createReactionTargets(
        gl,
        REACTION_SIZE,
        seed,
        morphogenPaintRef.current,
      );''',
    "paint-aware initial targets",
)

canvas = replace_exact(
    canvas,
    '''      "u_tidalPaletteMix",
      "u_reaction",''',
    '''      "u_tidalPaletteMix",
      "u_morphogenPaintMix",
      "u_morphogenPalette",
      "u_reaction",''',
    "Morphogen display uniforms",
)

canvas = replace_exact(
    canvas,
    '''      "u_dt",
    ]);''',
    '''      "u_dt",
      "u_morphogenPaintMix",
      "u_brushDown",
      "u_brushErase",
      "u_brushFrom",
      "u_brushTo",
      "u_brushRadius",
      "u_brushAspect",
    ]);''',
    "Morphogen reaction uniforms",
)

pointer_pattern = r'''    const handlePointerMove = \(event\) => \{.*?    const handlePointerLeave = \(\) => \{\n      pointer\.sampleX = pointer\.x;\n      pointer\.sampleY = pointer\.y;\n    \};'''
pointer_replacement = '''    const isMorphogenPaintActive = () =>
      modeRef.current === REACTION_MODE
      && morphogenPaintRef.current >= 0.5;

    const isInteractivePointerTarget = (target) =>
      target instanceof Element
      && Boolean(target.closest(
        "a, button, input, select, textarea, [role='button'], "
          + "[role='slider'], .dither-study-switcher, .rupture-header",
      ));

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const magnitude = Math.hypot(
        next.x - pointer.sampleX,
        next.y - pointer.sampleY,
      );
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      energy = clamp(energy + magnitude * 4.4);

      if (
        isMorphogenPaintActive()
        && brush.down
        && event.pointerId === brush.pointerId
      ) {
        brush.toX = next.x;
        brush.toY = next.y;
        brush.pending = true;
      }
      forceRender = true;
      if (reducedMotion && brush.down) redrawRef.current();
    };

    const handlePointerDown = (event) => {
      if (isMorphogenPaintActive()) return;
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      pulseOrigin.x = next.x;
      pulseOrigin.y = next.y;
      pulseAge = 0;
      energy = 1;
      root.setPointerCapture?.(event.pointerId);
      forceRender = true;
    };

    const handlePaintPointerDown = (event) => {
      if (
        !isMorphogenPaintActive()
        || isInteractivePointerTarget(event.target)
        || (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }

      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      brush.down = true;
      brush.pending = true;
      brush.pointerId = event.pointerId;
      brush.fromX = next.x;
      brush.fromY = next.y;
      brush.toX = next.x;
      brush.toY = next.y;
      energy = 1;
      if (event.cancelable) event.preventDefault();
      try {
        root.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // The page can still track the stroke when capture is unavailable.
      }
      forceRender = true;
      if (reducedMotion) redrawRef.current();
    };

    const finishPaintStroke = (event) => {
      if (event.pointerId !== brush.pointerId) return;
      brush.down = false;
      brush.pointerId = null;
      try {
        root.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // Capture may already have been released by the browser.
      }
      forceRender = true;
      if (reducedMotion) redrawRef.current();
    };

    const handlePointerLeave = () => {
      pointer.sampleX = pointer.x;
      pointer.sampleY = pointer.y;
    };'''
canvas = replace_regex(
    canvas,
    pointer_pattern,
    pointer_replacement,
    "Morphogen paint pointer lifecycle",
    flags=re.DOTALL,
)

canvas = replace_exact(
    canvas,
    '''    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    pointerSurface.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });''',
    '''    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    pointerSurface.addEventListener("pointerdown", handlePaintPointerDown);
    window.addEventListener("pointerup", finishPaintStroke, { passive: true });
    window.addEventListener("pointercancel", finishPaintStroke, {
      passive: true,
    });
    pointerSurface.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });''',
    "Morphogen paint listeners",
)

canvas = replace_exact(
    canvas,
    '''      reactionStepsTaken = 0;
      reactionWarmupRemaining =
        currentMode === REACTION_MODE ? REACTION_WARMUP_STEPS : 0;
      resetReactionTargets(gl, reactionTargets, seed);
      activeState = currentMode === REACTION_MODE ? "forming" : "drifting";''',
    '''      reactionStepsTaken = 0;
      reactionWarmupRemaining =
        currentMode === REACTION_MODE && morphogenPaintRef.current < 0.5
          ? REACTION_WARMUP_STEPS
          : 0;
      brush.down = false;
      brush.pending = false;
      brush.pointerId = null;
      brush.fromX = 0.52;
      brush.fromY = 0.52;
      brush.toX = 0.52;
      brush.toY = 0.52;
      resetReactionTargets(
        gl,
        reactionTargets,
        seed,
        morphogenPaintRef.current,
      );
      activeState = currentMode === REACTION_MODE
        ? morphogenPaintRef.current >= 0.5
          ? "ready"
          : "forming"
        : "drifting";''',
    "paint-aware simulation reset",
)

canvas = replace_exact(
    canvas,
    '''        desiredMode === REACTION_MODE
        && !reactionWasVisible
        && reactionStepsTaken === 0''',
    '''        desiredMode === REACTION_MODE
        && morphogenPaintRef.current < 0.5
        && !reactionWasVisible
        && reactionStepsTaken === 0''',
    "organism-only reaction warmup",
)

canvas = replace_regex(
    canvas,
    r'''      let nextState = "drifting";\n      if \(currentMode !== incomingMode\) nextState = "crossfading";\n      else if \(\n        currentMode === REACTION_MODE\n        && reactionStepsTaken < REACTION_WARMUP_STEPS\n      \) \{\n        nextState = "forming";\n      \} else if \(pulseAge < 1\.4 \|\| energy >= 0\.62\) nextState = "resonance";\n      else if \(energy >= 0\.18\) nextState = "responding";\n      else if \(idleSeconds > 2\.8\) nextState = "settling";\n      reportState\(nextState\);''',
    '''      const paintVisible =
        morphogenPaintRef.current >= 0.5
        && (currentMode === REACTION_MODE || incomingMode === REACTION_MODE);
      let nextState = "drifting";
      if (currentMode !== incomingMode) nextState = "crossfading";
      else if (paintVisible && (brush.down || brush.pending)) {
        nextState = morphogenEraseRef.current >= 0.5 ? "erasing" : "painting";
      } else if (paintVisible && energy >= 0.16) nextState = "settling";
      else if (paintVisible) nextState = "ready";
      else if (
        currentMode === REACTION_MODE
        && reactionStepsTaken < REACTION_WARMUP_STEPS
      ) {
        nextState = "forming";
      } else if (pulseAge < 1.4 || energy >= 0.62) nextState = "resonance";
      else if (energy >= 0.18) nextState = "responding";
      else if (idleSeconds > 2.8) nextState = "settling";
      reportState(nextState);''',
    "Morphogen paint field states",
)

canvas = replace_exact(
    canvas,
    '''      gl.uniform1f(reactionUniforms.u_dt, timeStep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);''',
    '''      gl.uniform1f(reactionUniforms.u_dt, timeStep);
      gl.uniform1f(
        reactionUniforms.u_morphogenPaintMix,
        morphogenPaintRef.current,
      );
      gl.uniform1f(
        reactionUniforms.u_brushDown,
        morphogenPaintRef.current >= 0.5 && (brush.down || brush.pending)
          ? 1
          : 0,
      );
      gl.uniform1f(reactionUniforms.u_brushErase, morphogenEraseRef.current);
      gl.uniform2f(
        reactionUniforms.u_brushFrom,
        brush.fromX,
        brush.fromY,
      );
      gl.uniform2f(reactionUniforms.u_brushTo, brush.toX, brush.toY);
      gl.uniform1f(
        reactionUniforms.u_brushRadius,
        morphogenBrushRadiusRef.current,
      );
      gl.uniform1f(
        reactionUniforms.u_brushAspect,
        canvas.width / Math.max(canvas.height, 1),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);''',
    "Morphogen brush reaction uniforms",
)

canvas = replace_exact(
    canvas,
    '''    const advanceReaction = () => {
      const reactionVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      if (!reactionVisible && reactionWarmupRemaining <= 0) return;

      let steps = reducedMotion ? 1 : REACTION_STEPS;
      if (reactionWarmupRemaining > 0) {
        const warmupBatch = Math.min(
          reactionWarmupRemaining,
          isMobileTier ? 2 : 4,
        );
        steps += warmupBatch;
        reactionWarmupRemaining -= warmupBatch;
      }

      for (let index = 0; index < steps; index += 1) {
        drawReactionStep(reducedMotion ? 0.62 : 1.0);
      }
    };''',
    '''    const commitBrushSegment = () => {
      if (!brush.pending && !brush.down) return;
      brush.fromX = brush.toX;
      brush.fromY = brush.toY;
      brush.pending = false;
    };

    const advanceReaction = () => {
      const reactionVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      if (!reactionVisible && reactionWarmupRemaining <= 0) return;

      let steps = reducedMotion ? 1 : REACTION_STEPS;
      if (reactionWarmupRemaining > 0) {
        const warmupBatch = Math.min(
          reactionWarmupRemaining,
          isMobileTier ? 2 : 4,
        );
        steps += warmupBatch;
        reactionWarmupRemaining -= warmupBatch;
      }

      for (let index = 0; index < steps; index += 1) {
        drawReactionStep(reducedMotion ? 0.62 : 1.0);
      }
      if (morphogenPaintRef.current >= 0.5) commitBrushSegment();
    };''',
    "Morphogen stroke commit",
)

canvas = replace_exact(
    canvas,
    '''      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );

      gl.activeTexture(gl.TEXTURE0);''',
    '''      gl.uniform1f(
        displayUniforms.u_tidalPaletteMix,
        tidalPaletteRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_morphogenPaintMix,
        morphogenPaintRef.current,
      );
      gl.uniform1f(
        displayUniforms.u_morphogenPalette,
        morphogenPaletteRef.current,
      );

      gl.activeTexture(gl.TEXTURE0);''',
    "Morphogen display uniform values",
)

canvas = replace_exact(
    canvas,
    '''      if (currentMode === REACTION_MODE && reactionStepsTaken === 0) {
        for (let index = 0; index < REACTION_WARMUP_STEPS; index += 1) {
          drawReactionStep(0.62);
        }
      }''',
    '''      if (
        currentMode === REACTION_MODE
        && morphogenPaintRef.current >= 0.5
        && (brush.down || brush.pending)
      ) {
        drawReactionStep(0.0);
        commitBrushSegment();
      } else if (
        currentMode === REACTION_MODE
        && morphogenPaintRef.current < 0.5
        && reactionStepsTaken === 0
      ) {
        for (let index = 0; index < REACTION_WARMUP_STEPS; index += 1) {
          drawReactionStep(0.62);
        }
      }''',
    "reduced-motion sand painting",
)

canvas = replace_exact(
    canvas,
    '''      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
      }

      updateSize();''',
    '''      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
        if (
          currentMode === REACTION_MODE
          && morphogenPaintRef.current >= 0.5
          && (brush.down || brush.pending)
        ) {
          drawReactionStep(0.0);
          commitBrushSegment();
        }
      }

      updateSize();''',
    "paint while paused",
)

canvas = replace_exact(
    canvas,
    '''      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);''',
    '''      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      pointerSurface.removeEventListener("pointerdown", handlePaintPointerDown);
      window.removeEventListener("pointerup", finishPaintStroke);
      window.removeEventListener("pointercancel", finishPaintStroke);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);''',
    "Morphogen listener cleanup",
)

canvas = replace_exact(
    canvas,
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-metabloom-palette-${normalizeMetabloomPalette(metabloomPalette)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)}${
        fallback ? " is-fallback" : ""
      }`}''',
    '''      className={`creatoros-field-shell creatoros-field-mode-${clampMode(mode)} creatoros-field-metabloom-palette-${normalizeMetabloomPalette(metabloomPalette)} creatoros-field-palette-${normalizeTidalPalette(tidalPalette)} creatoros-field-contour-palette-${normalizeContourPalette(contourPalette)} creatoros-field-morphogen-experience-${normalizeMorphogenExperience(morphogenExperience)} creatoros-field-morphogen-palette-${normalizeMorphogenPalette(morphogenPalette)} creatoros-field-morphogen-tool-${normalizeMorphogenTool(morphogenTool)} creatoros-field-morphogen-brush-${normalizeMorphogenBrushSize(morphogenBrushSize)}${
        fallback ? " is-fallback" : ""
      }`}''',
    "Morphogen shell classes",
)

canvas_path.write_text(canvas, encoding="utf-8")


# Reaction simulation and sand material shader.
shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")

shader = replace_exact(
    shader,
    '''uniform float u_dt;

#define PI''',
    '''uniform float u_dt;
uniform float u_morphogenPaintMix;
uniform float u_brushDown;
uniform float u_brushErase;
uniform vec2 u_brushFrom;
uniform vec2 u_brushTo;
uniform float u_brushRadius;
uniform float u_brushAspect;

#define PI''',
    "reaction sand-paint uniforms",
)

shader = replace_exact(
    shader,
    '''vec2 vortexFlow(vec2 uv, vec2 center, float spin) {
  vec2 delta = uv - center;
  float falloff = exp(-dot(delta, delta) * 18.0);
  return vec2(-delta.y, delta.x) * falloff * spin;
}

void main() {
  float flowPhase''',
    '''vec2 vortexFlow(vec2 uv, vec2 center, float spin) {
  vec2 delta = uv - center;
  float falloff = exp(-dot(delta, delta) * 18.0);
  return vec2(-delta.y, delta.x) * falloff * spin;
}

float sandHash(vec2 point) {
  return fract(
    sin(dot(point, vec2(127.1, 311.7)) + u_seed * 91.7)
      * 43758.5453123
  );
}

float brushSegmentDistance(vec2 point, vec2 from, vec2 to) {
  point.x *= u_brushAspect;
  from.x *= u_brushAspect;
  to.x *= u_brushAspect;
  vec2 segment = to - from;
  float segmentLengthSquared = max(dot(segment, segment), 0.000001);
  float projection = clamp(
    dot(point - from, segment) / segmentLengthSquared,
    0.0,
    1.0
  );
  return length(point - (from + segment * projection));
}

void main() {
  if (u_morphogenPaintMix > 0.5) {
    vec2 boundary = u_texel * 2.0;
    vec2 safeUv = clamp(v_uv, boundary, vec2(1.0) - boundary);
    vec4 centerState = texture(u_state, safeUv);
    float centerSand = centerState.g;
    float above = texture(
      u_state,
      clamp(safeUv + vec2(0.0, u_texel.y), boundary, vec2(1.0) - boundary)
    ).g;
    float aboveLeft = texture(
      u_state,
      clamp(safeUv + vec2(-u_texel.x, u_texel.y), boundary, vec2(1.0) - boundary)
    ).g;
    float aboveRight = texture(
      u_state,
      clamp(safeUv + vec2(u_texel.x, u_texel.y), boundary, vec2(1.0) - boundary)
    ).g;
    float below = texture(
      u_state,
      clamp(safeUv - vec2(0.0, u_texel.y), boundary, vec2(1.0) - boundary)
    ).g;
    float left = texture(
      u_state,
      clamp(safeUv - vec2(u_texel.x, 0.0), boundary, vec2(1.0) - boundary)
    ).g;
    float right = texture(
      u_state,
      clamp(safeUv + vec2(u_texel.x, 0.0), boundary, vec2(1.0) - boundary)
    ).g;

    vec2 grainCell = floor(safeUv / max(u_texel, vec2(0.000001)));
    float grainChoice = sandHash(grainCell + floor(u_time * 7.0));
    float diagonalSource = mix(aboveLeft, aboveRight, step(0.5, grainChoice));
    float support = smoothstep(0.18, 0.72, below);
    float fallingSource = mix(above, diagonalSource, (1.0 - support) * 0.32);
    float fallRate = (0.025 + (1.0 - support) * 0.11) * u_dt;
    float sand = mix(centerSand, fallingSource, sat(fallRate));
    float neighborMean = (centerSand + left + right + above + below) * 0.20;
    sand = mix(sand, neighborMean, sat(u_dt * 0.010));

    float brushDistance = brushSegmentDistance(
      safeUv,
      u_brushFrom,
      u_brushTo
    );
    float brushShape = 1.0 - smoothstep(
      u_brushRadius * 0.52,
      u_brushRadius,
      brushDistance
    );
    float grainDeposit = mix(0.68, 1.0, sandHash(
      grainCell + vec2(floor(u_time * 11.0), 17.0)
    ));
    float brushMask = brushShape * grainDeposit * u_brushDown;
    float deposit = brushMask * (1.0 - u_brushErase);
    float erase = brushMask * u_brushErase;
    sand += deposit * (1.0 - sand) * 0.78;
    sand *= 1.0 - erase * 0.88;
    sand *= 1.0 - u_dt * 0.00035;
    sand = sat(sand);

    float movement = abs(sand - centerSand);
    float activityTarget = sat(
      movement * 9.0 + deposit * 0.95 + erase * 0.88
    );
    float activity = max(centerState.b * 0.944, activityTarget);
    float carrier = sat(1.0 - sand * 0.62);
    fragColor = vec4(carrier, sand, activity, 1.0);
    return;
  }

  float flowPhase''',
    "sand-paint reaction branch",
)

shader = replace_exact(
    shader,
    '''uniform float u_tidalPaletteMix;
uniform sampler2D u_reaction;''',
    '''uniform float u_tidalPaletteMix;
uniform float u_morphogenPaintMix;
uniform float u_morphogenPalette;
uniform sampler2D u_reaction;''',
    "sand display uniforms",
)

shader = replace_exact(
    shader,
    '''  return mix(violet, cyan, (h - 0.75) * 4.0);
}

float hash''',
    '''  return mix(violet, cyan, (h - 0.75) * 4.0);
}

vec3 threeStopGradient(vec3 start, vec3 middle, vec3 end, float amount) {
  amount = sat(amount);
  return amount < 0.5
    ? mix(start, middle, amount * 2.0)
    : mix(middle, end, (amount - 0.5) * 2.0);
}

float hash''',
    "three-stop sand gradients",
)

morphogen_scene = '''vec4 sceneMorphogen(vec2 uv, float time) {
  vec4 chemical = texture(u_reaction, uv);
  float v = chemical.g;
  float u = chemical.r;
  float activity = chemical.b;
  float north = texture(u_reaction, uv + vec2(0.0, u_reactionTexel.y)).g;
  float south = texture(u_reaction, uv - vec2(0.0, u_reactionTexel.y)).g;
  float east = texture(u_reaction, uv + vec2(u_reactionTexel.x, 0.0)).g;
  float west = texture(u_reaction, uv - vec2(u_reactionTexel.x, 0.0)).g;
  vec2 gradientVector = vec2(east - west, north - south);
  float gradient = length(gradientVector);
  float curvature = abs(north + south + east + west - 4.0 * v);
  float pulse = pulseField(uv);
  float intro = smoothstep(0.0, 0.72, u_intro);

  // Preserve the original autonomous organism as the default experience.
  float cells = smoothstep(0.055, 0.52, v);
  float membrane = smoothstep(0.006, 0.078, gradient);
  float cleavage = smoothstep(0.010, 0.095, curvature)
    * smoothstep(0.10, 0.58, v);
  float interior = smoothstep(0.12, 0.60, v)
    * (1.0 - smoothstep(0.68, 0.94, v));
  float transport = 0.5 + 0.5 * sin(
    time * 0.62
      + activity * 5.0
      + v * 10.0
      + atan(gradientVector.y, gradientVector.x) * 1.6
  );
  float organismField = (
    cells * 0.78
      + membrane * 1.18
      + cleavage * 0.82
      + interior * 0.24
      + activity * (0.58 + transport * 0.28)
      + pulse * 0.58
  ) * intro;

  float edgeAngle = atan(gradientVector.y, gradientVector.x) / TAU;
  vec3 interiorTint = spectral(0.56 + v * 0.58 + time * 0.011);
  vec3 edgeTint = spectral(
    0.82 + edgeAngle + time * 0.020 + activity * 0.16
  );
  vec3 activityTint = spectral(0.08 + activity * 0.56 - time * 0.014);
  vec3 organismTint = mix(
    interiorTint,
    edgeTint,
    sat(membrane * 0.82 + cleavage * 0.72)
  );
  organismTint = mix(organismTint, activityTint, activity * 0.42);

  vec4 organismMaterial = fluidMaterial(
    organismField,
    organismTint,
    0.34,
    0.26,
    0.91
  );
  organismMaterial.rgb += edgeTint * (
    membrane * 0.12 + activity * 0.08
  );
  organismMaterial.a = max(
    organismMaterial.a,
    (membrane * 0.48 + cleavage * 0.34 + activity * 0.28) * intro
  );
  organismMaterial.a *= 0.76 + membrane * 0.18 + activity * 0.10;

  // Sand Paint interprets the same bounded reaction texture as a persistent
  // granular canvas. Palette changes recolor existing strokes without clearing.
  vec2 grainCell = floor(
    uv / max(u_reactionTexel, vec2(0.000001))
  );
  float grainNoise = hash(grainCell + vec2(u_seed * 113.0, u_seed * 71.0));
  float grainSpark = smoothstep(0.76, 0.98, grainNoise);
  float sandMass = smoothstep(0.012, 0.92, v);
  float sandEdge = smoothstep(0.004, 0.070, gradient);
  float gradientPosition = sat(
    uv.x * 0.54
      + (1.0 - uv.y) * 0.34
      + activity * 0.12
      + (grainNoise - 0.5) * 0.08
  );

  vec3 spectralSand = spectral(
    0.54 + gradientPosition * 0.72 + activity * 0.08
  );
  spectralSand = mix(
    spectralSand,
    vec3(1.0),
    0.055 + grainSpark * 0.10
  );

  vec3 tideStart = mix(
    vec3(0.018, 0.145, 0.180),
    vec3(0.075, 0.560, 0.620),
    u_light
  );
  vec3 tideMiddle = mix(
    vec3(0.000, 0.620, 0.640),
    vec3(0.120, 0.850, 0.790),
    u_light
  );
  vec3 tideEnd = mix(
    vec3(0.580, 0.970, 0.900),
    vec3(0.840, 1.000, 0.960),
    u_light
  );
  vec3 tideSand = threeStopGradient(
    tideStart,
    tideMiddle,
    tideEnd,
    gradientPosition
  );

  vec3 bloomStart = mix(
    vec3(0.170, 0.055, 0.360),
    vec3(0.420, 0.220, 0.760),
    u_light
  );
  vec3 bloomMiddle = mix(
    vec3(0.720, 0.070, 0.700),
    vec3(0.930, 0.300, 0.760),
    u_light
  );
  vec3 bloomEnd = mix(
    vec3(1.000, 0.420, 0.650),
    vec3(1.000, 0.760, 0.850),
    u_light
  );
  vec3 bloomSand = threeStopGradient(
    bloomStart,
    bloomMiddle,
    bloomEnd,
    gradientPosition
  );

  vec3 graphiteStart = mix(
    vec3(0.080, 0.090, 0.110),
    vec3(0.280, 0.300, 0.330),
    u_light
  );
  vec3 graphiteMiddle = mix(
    vec3(0.430, 0.460, 0.510),
    vec3(0.650, 0.670, 0.710),
    u_light
  );
  vec3 graphiteEnd = mix(
    vec3(0.900, 0.920, 0.950),
    vec3(0.985, 0.990, 1.000),
    u_light
  );
  vec3 graphiteSand = threeStopGradient(
    graphiteStart,
    graphiteMiddle,
    graphiteEnd,
    gradientPosition
  );

  float paletteIndex = floor(u_morphogenPalette + 0.5);
  vec3 sandTint = spectralSand;
  if (paletteIndex > 0.5 && paletteIndex < 1.5) sandTint = tideSand;
  else if (paletteIndex >= 1.5 && paletteIndex < 2.5) sandTint = bloomSand;
  else if (paletteIndex >= 2.5) sandTint = graphiteSand;

  float granularLight = 0.76 + grainNoise * 0.28 + activity * 0.10;
  float pileShadow = smoothstep(0.24, 0.90, v)
    * (1.0 - grainNoise)
    * 0.12;
  sandTint *= granularLight * (1.0 - pileShadow);
  sandTint += vec3(1.0) * sandEdge * grainSpark * mix(0.13, 0.10, u_light);
  sandTint = max(sandTint, spectralSand * 0.08 + sandTint * 0.86);

  float sandAlpha = sat(
    sandMass * (0.72 + grainNoise * 0.24)
      + sandEdge * 0.20
      + activity * 0.08
  ) * intro;
  vec4 sandMaterial = vec4(sandTint, sandAlpha);

  return mix(
    organismMaterial,
    sandMaterial,
    sat(u_morphogenPaintMix)
  );
}

'''
shader = replace_regex(
    shader,
    r'''vec4 sceneMorphogen\(vec2 uv, float time\) \{.*?\n\}\n\nvec4 sceneQuasicrystal''',
    morphogen_scene + '''vec4 sceneQuasicrystal''',
    "Morphogen sand material scene",
    flags=re.DOTALL,
)

shader_path.write_text(shader, encoding="utf-8")


# Morphogen control styling.
page_css_path = Path("src/components/DitherCanvasPage.css")
page_css = page_css_path.read_text(encoding="utf-8")

page_css = replace_exact(
    page_css,
    '''.metabloom-palette-option:focus-visible,
.tidal-palette-option:focus-visible,
.contour-palette-option:focus-visible,
.dither-study-option:focus-visible {''',
    '''.metabloom-palette-option:focus-visible,
.tidal-palette-option:focus-visible,
.contour-palette-option:focus-visible,
.morphogen-experience-option:focus-visible,
.morphogen-control-option:focus-visible,
.dither-study-option:focus-visible {''',
    "Morphogen focus styles",
)

morphogen_css = '''
.morphogen-control-stack {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.morphogen-experience-selector {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.45rem;
  margin: 0 0.4rem;
  padding: 0.4rem;
  border: 1px solid var(--rupture-border);
  border-radius: 1.35rem;
  background: var(--rupture-control);
}

.morphogen-experience-selector-label,
.morphogen-control-label {
  padding: 0 0.55rem;
  color: var(--rupture-text-muted);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.morphogen-experience-option,
.morphogen-control-option {
  min-height: 3.35rem;
  padding: 0 0.72rem;
  border: 1px solid transparent;
  border-radius: 1rem;
  background: transparent;
  color: var(--rupture-text-soft);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: 0.055em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 220ms ease,
    border-color 220ms ease,
    color 220ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
}

.morphogen-experience-option:hover,
.morphogen-control-option:hover {
  border-color: var(--rupture-border);
  color: var(--rupture-text);
  transform: translateY(-1px);
}

.morphogen-experience-option.is-active[data-experience="organism"] {
  border-color: rgba(99, 68, 245, 0.52);
  background: linear-gradient(
    135deg,
    rgba(0, 238, 255, 0.24),
    rgba(99, 68, 245, 0.56) 54%,
    rgba(255, 86, 214, 0.30)
  );
  color: rgba(255, 255, 255, 0.98);
}

.morphogen-experience-option.is-active[data-experience="paint"] {
  border-color: rgba(228, 219, 198, 0.62);
  background:
    radial-gradient(circle at 18% 34%, rgba(255, 255, 255, 0.30) 0 1px, transparent 1.5px),
    radial-gradient(circle at 74% 68%, rgba(255, 255, 255, 0.22) 0 1px, transparent 1.5px),
    linear-gradient(135deg, rgba(31, 188, 197, 0.92), rgba(119, 72, 224, 0.90) 52%, rgba(236, 84, 178, 0.88));
  background-size: 0.8rem 0.8rem, 1.1rem 1.1rem, auto;
  color: rgba(255, 255, 255, 0.99);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.36),
    0 0 1.8rem rgba(99, 68, 245, 0.16);
}

.morphogen-paint-toolbar {
  display: grid;
  gap: 0.42rem;
  margin: 0 0.4rem;
  padding: 0.55rem;
  border: 1px solid var(--rupture-border);
  border-radius: 1.35rem;
  background: color-mix(in srgb, var(--rupture-panel-active) 72%, transparent);
}

.morphogen-control-row {
  display: grid;
  grid-template-columns: 5.8rem minmax(0, 1fr);
  align-items: center;
  gap: 0.42rem;
}

.morphogen-control-options {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 0.35rem;
}

.morphogen-gradient-options {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-flow: row;
}

.morphogen-control-option.is-active {
  border-color: rgba(255, 255, 255, 0.40);
  background: var(--rupture-panel-active);
  color: var(--rupture-text);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.morphogen-control-option.is-active[data-tool="draw"] {
  border-color: rgba(36, 204, 255, 0.54);
  box-shadow: inset 0 0 0 1px rgba(36, 204, 255, 0.12);
}

.morphogen-control-option.is-active[data-tool="erase"] {
  border-color: rgba(255, 255, 255, 0.52);
  background: linear-gradient(135deg, rgba(92, 99, 116, 0.48), rgba(225, 229, 237, 0.30));
}

.morphogen-control-option.is-active[data-brush] {
  border-color: rgba(99, 68, 245, 0.44);
}

.morphogen-control-option.is-active[data-palette="spectral"] {
  background: linear-gradient(135deg, rgba(0, 238, 255, 0.45), rgba(99, 68, 245, 0.72) 52%, rgba(255, 86, 214, 0.52));
  color: white;
}

.morphogen-control-option.is-active[data-palette="tide"] {
  background: linear-gradient(135deg, rgba(4, 87, 111, 0.94), rgba(0, 188, 190, 0.86), rgba(142, 255, 225, 0.80));
  color: rgba(239, 255, 252, 0.99);
}

.morphogen-control-option.is-active[data-palette="bloom"] {
  background: linear-gradient(135deg, rgba(78, 38, 154, 0.94), rgba(215, 46, 176, 0.88), rgba(255, 139, 182, 0.84));
  color: rgba(255, 247, 253, 0.99);
}

.morphogen-control-option.is-active[data-palette="graphite"] {
  background: linear-gradient(135deg, rgba(27, 31, 40, 0.98), rgba(122, 132, 148, 0.94) 52%, rgba(238, 242, 247, 0.96));
  color: rgba(255, 255, 255, 0.98);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.34);
}

.dither-study-morphogen-divide.morphogen-experience-paint .dither-study-scene,
.dither-study-morphogen-divide.morphogen-experience-paint .rupture-copy {
  cursor: crosshair;
  touch-action: none;
}

.dither-study-morphogen-divide.morphogen-experience-paint .rupture-header,
.dither-study-morphogen-divide.morphogen-experience-paint .dither-study-switcher {
  cursor: auto;
  touch-action: manipulation;
}

.rupture-painting .rupture-state span {
  background: #ff56d6;
  box-shadow:
    0 0 1.4rem rgba(255, 86, 214, 0.94),
    0 0 2.6rem rgba(36, 204, 255, 0.42);
}

.rupture-erasing .rupture-state span {
  background: #eef2f7;
  box-shadow: 0 0 1.5rem rgba(238, 242, 247, 0.84);
}

.rupture-ready .rupture-state span {
  background: #24ccff;
  box-shadow: 0 0 1.4rem rgba(36, 204, 255, 0.88);
}

'''
page_css = replace_exact(
    page_css,
    '''.rupture-copy {''',
    morphogen_css + '''.rupture-copy {''',
    "Morphogen paint control styles",
)

page_css += '''

@media (max-width: 700px) {
  .morphogen-control-stack {
    gap: 0.35rem;
    margin-bottom: 0.55rem;
  }

  .morphogen-experience-selector,
  .morphogen-paint-toolbar {
    margin-right: 0;
    margin-left: 0;
  }

  .morphogen-paint-toolbar {
    max-height: min(27dvh, 18rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .morphogen-control-row {
    grid-template-columns: 5rem minmax(0, 1fr);
  }

  .morphogen-experience-option,
  .morphogen-control-option {
    min-height: 3.1rem;
    padding-right: 0.48rem;
    padding-left: 0.48rem;
    font-size: 0.76rem;
  }

  .morphogen-experience-selector-label,
  .morphogen-control-label {
    padding: 0 0.35rem;
    font-size: 0.72rem;
  }
}
'''
page_css_path.write_text(page_css, encoding="utf-8")


field_css_path = Path("src/components/CreatorOSFieldCanvas.css")
field_css = field_css_path.read_text(encoding="utf-8")
field_css += '''

.creatoros-field-mode-4.creatoros-field-morphogen-experience-paint .creatoros-field-canvas {
  cursor: crosshair;
}

.creatoros-field-mode-4.creatoros-field-morphogen-experience-paint .creatoros-field-fallback {
  background:
    radial-gradient(circle at 22% 28%, rgba(0, 238, 255, 0.54) 0 1px, transparent 1.8px),
    radial-gradient(circle at 62% 44%, rgba(99, 68, 245, 0.56) 0 1.2px, transparent 2px),
    radial-gradient(circle at 78% 70%, rgba(255, 86, 214, 0.50) 0 1px, transparent 1.8px),
    #fff8f7;
  background-size: 0.9rem 0.9rem, 1.2rem 1.2rem, 1.05rem 1.05rem, auto;
}

.creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-tide .creatoros-field-fallback {
  background:
    radial-gradient(circle at 22% 28%, rgba(142, 255, 225, 0.62) 0 1px, transparent 1.8px),
    radial-gradient(circle at 62% 44%, rgba(0, 188, 190, 0.58) 0 1.2px, transparent 2px),
    linear-gradient(145deg, rgba(4, 87, 111, 0.22), transparent 68%),
    #fff8f7;
}

.creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-bloom .creatoros-field-fallback {
  background:
    radial-gradient(circle at 22% 28%, rgba(255, 139, 182, 0.62) 0 1px, transparent 1.8px),
    radial-gradient(circle at 62% 44%, rgba(215, 46, 176, 0.58) 0 1.2px, transparent 2px),
    linear-gradient(145deg, rgba(78, 38, 154, 0.18), transparent 68%),
    #fff8f7;
}

.creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-graphite .creatoros-field-fallback {
  background:
    radial-gradient(circle at 22% 28%, rgba(238, 242, 247, 0.68) 0 1px, transparent 1.8px),
    radial-gradient(circle at 62% 44%, rgba(122, 132, 148, 0.62) 0 1.2px, transparent 2px),
    linear-gradient(145deg, rgba(27, 31, 40, 0.16), transparent 68%),
    #fff8f7;
}

[data-theme="dark"] .creatoros-field-mode-4.creatoros-field-morphogen-experience-paint .creatoros-field-fallback,
[data-theme="dark"] .creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-tide .creatoros-field-fallback,
[data-theme="dark"] .creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-bloom .creatoros-field-fallback,
[data-theme="dark"] .creatoros-field-mode-4.creatoros-field-morphogen-experience-paint.creatoros-field-morphogen-palette-graphite .creatoros-field-fallback {
  background-color: #080809;
}
'''
field_css_path.write_text(field_css, encoding="utf-8")


# Page behavior test mock and interactive flow.
page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text(encoding="utf-8")

page_test = replace_exact(
    page_test,
    '''    metabloomPalette = "spectral",
    mode,
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(''',
    '''    metabloomPalette = "spectral",
    mode,
    morphogenBrushSize = "medium",
    morphogenExperience = "organism",
    morphogenPalette = "spectral",
    morphogenTool = "draw",
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(''',
    "Morphogen page test mock props",
)

page_test = replace_exact(
    page_test,
    '''        "data-contour-palette": contourPalette,
        "data-tidal-palette": tidalPalette,''',
    '''        "data-contour-palette": contourPalette,
        "data-morphogen-experience": morphogenExperience,
        "data-morphogen-palette": morphogenPalette,
        "data-morphogen-tool": morphogenTool,
        "data-morphogen-brush-size": morphogenBrushSize,
        "data-tidal-palette": tidalPalette,''',
    "Morphogen page test data attributes",
)

morphogen_page_test = '''

  test("offers a drawable sand canvas with tools, brush sizes, and live gradients", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    flushScrollFrame();
    finishStudyTransition();

    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "4");
    expect(renderer).toHaveAttribute("data-morphogen-experience", "organism");
    expect(screen.getByRole("button", { name: "Reseed" })).toBeInTheDocument();

    const experienceGroup = screen.getByRole("group", {
      name: "Morphogen Divide experience",
    });
    const organismOption = within(experienceGroup).getByRole("button", {
      name: "Use the living organism experience",
    });
    const paintOption = within(experienceGroup).getByRole("button", {
      name: "Use the interactive sand paint experience",
    });
    expect(organismOption).toHaveAttribute("aria-pressed", "true");
    expect(paintOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(paintOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-morphogen-experience",
      "paint",
    );
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sand paint controls" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Erase sand" }));
    fireEvent.click(screen.getByRole("button", { name: "Broad sand brush" }));
    fireEvent.click(screen.getByRole("button", {
      name: "Use the Tide sand gradient",
    }));

    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-morphogen-tool",
      "erase",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-morphogen-brush-size",
      "broad",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-morphogen-palette",
      "tide",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-reset-version",
      "1",
    );

    fireEvent.click(organismOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-morphogen-experience",
      "organism",
    );
    expect(screen.getByRole("button", { name: "Reseed" })).toBeInTheDocument();
  });
'''
page_test = replace_exact(
    page_test,
    '''  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    morphogen_page_test + '''
  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    "Morphogen page interaction test",
)
page_test_path.write_text(page_test, encoding="utf-8")


# Focused regression coverage for the new optional experience.
morphogen_test_path = Path("src/components/MorphogenSandPaint.test.js")
morphogen_test_path.write_text(
    '''import {
  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} from "./CreatorOSFieldShader";

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
const pageStyles = fs.readFileSync(
  path.join(__dirname, "DitherCanvasPage.css"),
  "utf8",
);
const fieldStyles = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.css"),
  "utf8",
);

describe("Morphogen Sand Paint", () => {
  test("keeps the organism default and exposes the paint experience", () => {
    expect(pageSource).toContain('MORPHOGEN_EXPERIENCE_ORGANISM = "organism"');
    expect(pageSource).toContain('MORPHOGEN_EXPERIENCE_PAINT = "paint"');
    expect(pageSource).toContain("Morphogen Divide experience");
    expect(pageSource).toContain("interactive sand paint experience");
    expect(pageSource).toContain("Sand paint controls");
    expect(pageSource).toContain("morphogenExperience={morphogenExperience}");
    expect(pageSource).toContain('activeResetLabel = isMorphogenPaint');
    expect(pageSource).toContain('? "Clear"');
  });

  test("provides draw, erase, three brush sizes, and four recolorable gradients", () => {
    expect(pageSource).toContain('MORPHOGEN_TOOL_DRAW = "draw"');
    expect(pageSource).toContain('MORPHOGEN_TOOL_ERASE = "erase"');
    expect(pageSource).toContain('MORPHOGEN_BRUSH_FINE = "fine"');
    expect(pageSource).toContain('MORPHOGEN_BRUSH_MEDIUM = "medium"');
    expect(pageSource).toContain('MORPHOGEN_BRUSH_BROAD = "broad"');
    expect(pageSource).toContain('MORPHOGEN_PALETTE_TIDE = "tide"');
    expect(pageSource).toContain('MORPHOGEN_PALETTE_BLOOM = "bloom"');
    expect(pageSource).toContain('MORPHOGEN_PALETTE_GRAPHITE = "graphite"');
    expect(pageSource).toContain("Use the ${label} sand gradient");
    expect(pageStyles).toContain('.morphogen-control-option.is-active[data-palette="spectral"]');
    expect(pageStyles).toContain('.morphogen-control-option.is-active[data-palette="tide"]');
    expect(pageStyles).toContain('.morphogen-control-option.is-active[data-palette="bloom"]');
    expect(pageStyles).toContain('.morphogen-control-option.is-active[data-palette="graphite"]');
  });

  test("draws continuous bounded brush segments and supports erasing", () => {
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "uniform float u_morphogenPaintMix",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float brushSegmentDistance",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "u_brushFrom",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("u_brushTo");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "u_brushRadius",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "sand += deposit * (1.0 - sand) * 0.78",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "sand *= 1.0 - erase * 0.88",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(carrier, sand, activity, 1.0)",
    );
    expect(canvasSource).toContain("brush.pending");
    expect(canvasSource).toContain("commitBrushSegment");
    expect(canvasSource).toContain("handlePaintPointerDown");
    expect(canvasSource).toContain("finishPaintStroke");
    expect(canvasSource).toContain("isInteractivePointerTarget");
    expect(canvasSource).toContain('window.addEventListener("pointerup"');
    expect(canvasSource).toContain('window.removeEventListener("pointerup"');
  });

  test("settles persistent grains while preserving the Gray-Scott organism", () => {
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float fallingSource",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float support = smoothstep",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "sand *= 1.0 - u_dt * 0.00035",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("u * v * v");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("laplacian");
    expect(canvasSource).toContain("morphogenPaintMix >= 0.5");
    expect(canvasSource).toContain("data[offset] = 255");
    expect(canvasSource).toContain("data[offset + 1] = 0");
  });

  test("renders sand with selectable gradients without storing color in the simulation", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "uniform float u_morphogenPalette",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "vec3 threeStopGradient",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 spectralSand");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 tideSand");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 bloomSand");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 graphiteSand");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "return mix(\n    organismMaterial,\n    sandMaterial,",
    );
    expect(canvasSource).toContain("resolveMorphogenPaletteIndex");
    expect(canvasSource).toContain('"u_morphogenPalette"');
    expect(fieldStyles).toContain(
      ".creatoros-field-morphogen-experience-paint",
    );
  });

  test("retains renderer limits and paints while paused or reduced-motion", () => {
    expect(canvasSource).toContain("const RENDER_SCALE = 0.5");
    expect(canvasSource).toContain("const FRAME_INTERVAL_MS = 1000 / 30");
    expect(canvasSource).toContain("drawReactionStep(0.0)");
    expect(canvasSource).toContain("if (reducedMotion && brush.down)");
    expect(canvasSource).toContain("webglcontextlost");
    expect(canvasSource).toContain("destroyReactionTargets");
  });
});
''',
    encoding="utf-8",
)
