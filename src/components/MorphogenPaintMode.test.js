const fs = require("fs");
const path = require("path");
const {
  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} = require("./CreatorOSFieldShader");

const pageSource = fs.readFileSync(
  path.join(__dirname, "DitherCanvasPage.js"),
  "utf8",
);
const canvasSource = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.js"),
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

describe("Morphogen Divide sand paint option", () => {
  test("keeps Organism as the default and exposes a complete paint tray", () => {
    expect(pageSource).toContain(
      'const MORPHOGEN_EXPERIENCE_ORGANISM = "organism"',
    );
    expect(pageSource).toContain(
      'const MORPHOGEN_EXPERIENCE_PAINT = "paint"',
    );
    expect(pageSource).toContain('aria-label="Morphogen Divide experience"');
    expect(pageSource).toContain(
      'aria-label="Morphogen sand paint tools"',
    );
    expect(pageSource).toContain('aria-label="Paint tool"');
    expect(pageSource).toContain('aria-label="Brush size"');
    expect(pageSource).toContain('aria-label="Sand gradient"');
    expect(pageSource).toContain('aria-label="Sand colors"');
    expect(pageSource).toContain('type="color"');
    expect(pageSource).toContain("data-gradient={value}");
    expect(pageSource).toContain('"Clear"');
  });

  test("restores the original organism default without removing Sand Paint", () => {
    expect(pageSource).toMatch(
      /const \[morphogenExperience, setMorphogenExperience\] = useState\(\s*MORPHOGEN_EXPERIENCE_ORGANISM,\s*\);/,
    );
    expect(pageSource).toContain('activeStudy.id !== "morphogen-divide"');
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM)",
    );
    expect(canvasSource).toContain('morphogenExperience = "organism"');
    expect(canvasSource).toContain(
      "data[offset + 3] = paintMode ? 0 : 255",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(pageSource).toContain(
      "setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT)",
    );
  });

  test("threads paint controls into the existing WebGL renderer without remounting it", () => {
    expect(pageSource).toContain(
      "morphogenExperience={morphogenExperience}",
    );
    expect(pageSource).toContain("morphogenTool={morphogenTool}");
    expect(pageSource).toContain(
      "morphogenBrushSize={morphogenBrushSize}",
    );
    expect(pageSource).toContain(
      "morphogenGradient={morphogenGradient}",
    );
    expect(pageSource).toContain("morphogenColorA={morphogenColorA}");
    expect(pageSource).toContain("morphogenColorB={morphogenColorB}");
    expect(canvasSource).toContain("resolveMorphogenPaintMix");
    expect(canvasSource).toContain("morphogenPaintRef");
    expect(canvasSource).toContain('"u_morphogenPaintMix"');
    expect(canvasSource).toContain('"u_morphogenColorA"');
    expect(canvasSource).toContain('"u_morphogenColorB"');
    expect(canvasSource).toContain('"u_morphogenGradientMode"');
    expect(canvasSource).toContain(
      "creatoros-field-morphogen-${normalizeMorphogenExperience",
    );
  });

  test("draws continuous granular strokes and supports erasing", () => {
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "uniform float u_brushActive",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "uniform vec2 u_brushFrom",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "uniform vec2 u_brushTo",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float segmentDistance",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float paintDeposit",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float paintErase",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "paintLaplacian",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float outputAlpha = mix(1.0, sat(paint), paintMode)",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, outputAlpha)",
    );
    expect(canvasSource).toContain("handlePaintPointerDown");
    expect(canvasSource).toContain("finishPaintStroke");
    expect(canvasSource).toContain("brush.pending = brush.down");
    const pointerMove = canvasSource.slice(
      canvasSource.indexOf("const handlePointerMove"),
      canvasSource.indexOf("const handlePointerDown"),
    );
    const pointerFinish = canvasSource.slice(
      canvasSource.indexOf("const finishPaintStroke"),
      canvasSource.indexOf("const handlePointerLeave"),
    );
    expect(pointerMove).not.toContain("brush.fromX = brush.toX");
    expect(pointerFinish).not.toContain("brush.fromX = brush.toX");
    expect(canvasSource).toContain("isInteractiveTarget(event.target)");
  });

  test("renders custom two-color gradients as reaction-diffusion sand", () => {
    const morphogenStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneMorphogen",
    );
    const morphogenEnd = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneQuasicrystal",
    );
    const morphogenScene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(
      morphogenStart,
      morphogenEnd,
    );

    expect(morphogenScene).toContain("float paint = chemical.a");
    expect(morphogenScene).toContain("float sandGrain");
    expect(morphogenScene).toContain("float sandSparkle");
    expect(morphogenScene).toContain("float sandFlowPhase");
    expect(morphogenScene).toContain(
      "float flowGradient = 0.5 + 0.5 * sin(sandFlowPhase * TAU)",
    );
    expect(morphogenScene).not.toContain("float flowGradient = fract(");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "float paintDeposit = sat(",
    );
    expect(morphogenScene).toContain("float linearGradient");
    expect(morphogenScene).toContain("float radialGradient");
    expect(morphogenScene).toContain("u_morphogenColorA");
    expect(morphogenScene).toContain("u_morphogenColorB");
    expect(morphogenScene).toContain("vec3 spectralSandGlint");
    expect(morphogenScene).toContain("float brushPreview");
    expect(morphogenScene).toContain(
      "return mix(\n    organismMaterial,\n    sandMaterial,",
    );
  });

  test("keeps the paint experience styled, bounded, and recoverable", () => {
    expect(pageStyles).toContain(".morphogen-paint-toolbar");
    expect(pageStyles).toContain(".morphogen-color-control input");
    expect(pageStyles).toContain(".dither-morphogen-paint");
    expect(pageStyles).toContain(
      ".dither-morphogen-paint {\n  touch-action: none;",
    );
    expect(fieldStyles).toContain(
      ".creatoros-field-mode-4.creatoros-field-morphogen-paint",
    );
    expect(fieldStyles).toContain(".rupture-painting");
    expect(fieldStyles).toContain(".rupture-erasing");
    expect(canvasSource).toContain("resetReactionTargets(");
    expect(canvasSource).toContain("morphogenPaintRef.current >= 0.5");
    expect(canvasSource).toContain("gl.deleteFramebuffer");
    expect(canvasSource).toContain("gl.deleteTexture");
  });
});
