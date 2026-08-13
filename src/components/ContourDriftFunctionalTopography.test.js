import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

describe("Contour Drift functional topography", () => {
  const start = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneContourDrift",
  );
  const end = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneMorphogen",
  );
  const scene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(start, end);

  test("builds indexed elevation contours and map-like relief", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(scene).toContain("float contourCoordinate = terrain * 18.0");
    expect(scene).toContain("float minorDistance");
    expect(scene).toContain("float indexDistance");
    expect(scene).toContain("float minorCore");
    expect(scene).toContain("float indexCore");
    expect(scene).toContain("float elevationBand = floor");
    expect(scene).toContain("float steppedRelief");
    expect(scene).toContain("float hillshade");
    expect(scene).toContain("vec3 terrainNormal");
  });

  test("keeps a pale core and a visible travelling spectral rim", () => {
    expect(scene).toContain("float minorEdge");
    expect(scene).toContain("float indexEdge");
    expect(scene).toContain("vec3 contourCoreTint");
    expect(scene).toContain("vec3 lineCoreTint");
    expect(scene).toContain("float contourHueFlow");
    expect(scene).toContain("p.x * 0.34");
    expect(scene).toContain("p.y * 0.24");
    expect(scene).toContain("rotate2(-0.42) * p * 0.72");
    expect(scene).toContain("mix(0.66, 0.58, u_light)");
    expect(scene).toContain("mix(0.56, 0.64, u_light)");
    expect(scene).toContain("float spectralContourMask");
    expect(scene).toContain("max(minorEdge, indexEdge) * 1.22");
    expect(scene).toContain("spectralContourMask * 0.98");
    expect(scene).toContain("vec3 postMaterialSpectralEdge");
    expect(scene).toContain(
      "terrainPaletteWeight * spectralContourMask * 0.96",
    );
    expect(scene).toContain("terrainPaletteWeight * contourCore * 0.88");
    expect(scene).not.toContain(
      "max(material.rgb, spectralContourEdge",
    );

    const preCore = scene.indexOf(
      "terrainTint = mix(\n    terrainTint,\n    lineCoreTint",
    );
    const preSpectrum = scene.indexOf(
      "terrainTint = mix(\n    terrainTint,\n    spectralContourEdge",
    );
    const postCore = scene.indexOf(
      "max(material.rgb, lineCoreTint * 0.96)",
    );
    const postSpectrum = scene.indexOf(
      "vec3 postMaterialSpectralEdge",
    );
    expect(preCore).toBeGreaterThanOrEqual(0);
    expect(preSpectrum).toBeGreaterThan(preCore);
    expect(postCore).toBeGreaterThanOrEqual(0);
    expect(postSpectrum).toBeGreaterThan(postCore);
  });

  test("preserves motion, interaction, and the original spectral alternate", () => {
    expect(scene).toContain("uv = pointerFlow(uv, 0.032)");
    expect(scene).toContain(
      "vec2 p = viscousWarp(centeredUv(uv), time, 0.24)",
    );
    expect(scene).toContain("vec2 drift = vec2(time * 0.027, -time * 0.021)");
    expect(scene).toContain("float pointerLift");
    expect(scene).toContain("float pulse = pulseField(uv)");
    expect(scene).toContain("float spectralField = contour * 1.18");
    expect(scene).toContain("float paletteMix = sat(u_contourPaletteMix)");
    expect(scene).toContain(
      "vec4 material = fluidMaterial(field, tint, 0.24, 0.18, 0.84)",
    );
  });
});
