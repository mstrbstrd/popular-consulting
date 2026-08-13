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

  test("keeps a pale core and persistent spectral edges on every contour", () => {
    expect(scene).toContain("float minorEdge");
    expect(scene).toContain("float indexEdge");
    expect(scene).toContain("float contourEdge");
    expect(scene).toContain("vec3 contourCoreTint");
    expect(scene).toContain("vec3 lineCoreTint");
    expect(scene).toContain("vec3 spectralContourEdge");
    expect(scene).toContain("mix(0.264, 0.192, u_light)");
    expect(scene).toContain("sat(contourEdge * 1.104)");
    expect(scene).toContain("spectralContourEdge * 0.96");
    expect(scene).toContain(
      "terrainPaletteWeight * contourEdge * 0.864",
    );
    expect(scene).toContain("terrainPaletteWeight * contourCore * 0.88");
    expect(scene).not.toContain("crossing *");
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
