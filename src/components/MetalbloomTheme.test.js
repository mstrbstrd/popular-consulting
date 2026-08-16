import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

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

  test("renders mercury through high-contrast mirror reflections and Fresnel", () => {
    expect(sceneStart).toBeGreaterThanOrEqual(0);
    expect(sceneEnd).toBeGreaterThan(sceneStart);
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "uniform float u_metabloomPaletteMix",
    );
    expect(scene).toContain("vec2 metalSlope = vec2(dFdx(materialField)");
    expect(scene).toContain("vec3 metalNormal = normalize");
    expect(scene).toContain("reflect(-viewDirection, metalNormal)");
    expect(scene).toContain("float keySpecular");
    expect(scene).toContain("float horizonStrip");
    expect(scene).toContain("float verticalStrip");
    expect(scene).toContain("float counterStrip");
    expect(scene).toContain("float darkReflectionBand");
    expect(scene).toContain("float mirrorRaw");
    expect(scene).toContain("float mirrorLevel = smoothstep(0.04, 0.92, mirrorRaw)");
    expect(scene).toContain("float metalFresnel");
    expect(scene).toContain("vec3 mercuryShadow");
    expect(scene).toContain("vec3 mercuryMid");
    expect(scene).toContain("vec3 mercuryHighlight");
    expect(scene).toContain("vec3(0.480, 0.505, 0.545)");
    expect(scene).toContain("vec3(0.655, 0.675, 0.710)");
    expect(scene).toContain("vec3(1.580, 1.620, 1.690)");
    expect(scene).toContain("metalTint * (1.02 + mirrorLevel * 0.32)");
    expect(scene).toContain("vec4 metalMaterial = fluidMaterial");
  });

  test("threads white and spectral colour through every bright reflection", () => {
    expect(scene).toContain("float reflectionPrismMask = sat(");
    expect(scene).toContain("horizonStrip * 0.72");
    expect(scene).toContain("verticalStrip * 0.56");
    expect(scene).toContain("counterStrip * 0.42");
    expect(scene).toContain("keySpecular * 1.00");
    expect(scene).toContain("vec3 reflectionSpectrum = spectral(reflectionHue)");
    expect(scene).toContain("float reflectionLuma = mix(1.28, 1.36, u_light)");
    expect(scene).toContain("float reflectionChroma = mix(0.36, 0.31, u_light)");
    expect(scene).toContain("vec3 prismaticReflection = max(");
    expect(scene).toContain(
      "reflectionPrismMask * mix(0.34, 0.30, u_light)",
    );
    expect(scene).toContain(
      "reflectionPrismMask * mix(0.28, 0.24, u_light)",
    );
    expect(scene).toContain(`prismaticReflection
  * reflectionPrismMask
  * 0.055`);
  });

  test("keeps a continuous pale spectral rim and preserves topology", () => {
    expect(scene).toContain("float metalEdgeLevel = 0.98");
    expect(scene).toContain("fwidth(materialField) * 0.68");
    expect(scene).toContain("float spectralEdgeMask = 1.0 - smoothstep");
    expect(scene).toContain("p.x * 0.22");
    expect(scene).toContain("- p.y * 0.17");
    expect(scene).toContain("vec3 metalAccentSpectrum");
    expect(scene).toContain("vec3 prismaticEdge");
    expect(scene).toContain(
      "spectralEdgeMask * mix(0.78, 0.70, u_light)",
    );
    expect(scene).toContain(
      "spectralEdgeMask * mix(0.74, 0.68, u_light)",
    );
    expect(scene).not.toContain("float metalAccentMask");
    expect(scene).not.toContain("max(metalMaterial.rgb, prismaticEdge");
    expect(scene).toContain("spectralMaterial");
    expect(scene).toContain("metalMaterial");
    expect(scene).toContain("sat(u_metabloomPaletteMix)");

    expect(scene).toContain("for (int index = 0; index < 7; index++)");
    expect(scene).toContain("time * (0.16 + layer * 0.009)");
    expect(scene).toContain("p = viscousWarp(p, time, 0.08)");
    expect(scene).toContain("potential * 4.4");
    expect(scene).toContain("smoothstep(0.36, 2.65, potential)");
  });

  test("keeps the original light and dark page backgrounds", () => {
    const lightShellOverride =
      ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {\n  background:";
    const darkShellOverride =
      "[data-theme=\"dark\"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {\n  background:";
    const lightFallbackStart = fieldStyles.indexOf(
      ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback",
    );
    const darkFallbackStart = fieldStyles.indexOf(
      "[data-theme=\"dark\"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback",
      lightFallbackStart,
    );
    const nextFallbackStart = fieldStyles.indexOf(
      ".creatoros-field-mode-1 .creatoros-field-fallback",
      darkFallbackStart,
    );
    const metalFallbackStyles = fieldStyles.slice(
      lightFallbackStart,
      nextFallbackStart,
    );

    expect(fieldStyles).toContain("background: #fff8f7");
    expect(fieldStyles).toContain("background: #080809");
    expect(fieldStyles).not.toContain(lightShellOverride);
    expect(fieldStyles).not.toContain(darkShellOverride);
    expect(lightFallbackStart).toBeGreaterThanOrEqual(0);
    expect(darkFallbackStart).toBeGreaterThan(lightFallbackStart);
    expect(nextFallbackStart).toBeGreaterThan(darkFallbackStart);
    expect(metalFallbackStyles).toContain("#fff8f7;");
    expect(metalFallbackStyles).toContain("#080809;");
    expect(metalFallbackStyles).not.toContain("linear-gradient(145deg");
    expect(pageStyles).toContain(".metabloom-palette-selector");
    expect(pageStyles).toContain(
      '.metabloom-palette-option.is-active[data-palette="metalbloom"]',
    );
    expect(pageStyles).toContain(
      '.metabloom-palette-option.is-active[data-palette="spectral"]',
    );

  });
});
