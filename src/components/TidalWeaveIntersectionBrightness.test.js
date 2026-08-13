import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

describe("Tidal Weave intersection brightness", () => {
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

  test("lifts overlapping spectral edges without changing line motion", () => {
    expect(tidalStart).toBeGreaterThanOrEqual(0);
    expect(tidalEnd).toBeGreaterThan(tidalStart);
    expect(tidalScene).toContain("float outlineOverlap = smoothstep(");
    expect(tidalScene).toContain("outlineA * outlineB");
    expect(tidalScene).toContain("float outlineLuma = dot(");
    expect(tidalScene).toContain(
      "vec3 intersectionSpectralTint = refractedLight",
    );
    expect(tidalScene).toContain(
      "(spectralOutlineTint - vec3(outlineLuma)) * 0.24",
    );
    expect(tidalScene).toContain("refractedLight * 0.96");
    expect(tidalScene).toContain("intersectionSpectralTint,");
    expect(tidalScene).toContain("outlineOverlap");
    expect(tidalScene).toContain(
      "float bandA = exp(-abs(sin(phaseA * PI * 2.65)) * 4.3)",
    );
    expect(tidalScene).toContain(
      "float bandB = exp(-abs(sin(phaseB * PI * 2.82)) * 4.5)",
    );
    expect(tidalScene).toContain(
      "return fluidMaterial(field, tint, 0.34, 0.22, 0.94)",
    );
  });
});
