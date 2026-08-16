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
