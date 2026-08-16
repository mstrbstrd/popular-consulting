from pathlib import Path


def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source block, found {count}."
        )
    return source.replace(old, new, 1)


shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")

shader = replace_exact(
    shader,
    '''// Metalbloom keeps the exact same field topology and derives a pseudo-normal
// from its screen-space slope. High-contrast reflected studio bands, dark
// environment bands, and sharper specular turns create mirror-fluid mercury.
vec2 metalSlope = vec2(dFdx(materialField), dFdy(materialField));''',
    '''// Metalbloom keeps the exact same field topology while separating its
// optical surface from the oscillating membrane field. This prevents internal
// material contours from reading as carved grooves while preserving the motion.
float metalSurfaceField = potential * 1.12 + edge * 0.10;
vec2 metalSlope = vec2(
  dFdx(metalSurfaceField),
  dFdy(metalSurfaceField)
);''',
    "smooth Metalbloom optical surface",
)

shader = replace_exact(
    shader,
    '''float darkReflectionBand = exp(
  -abs(reflectedDirection.y + 0.12) * 7.6
);''',
    '''float darkReflectionDistance = reflectedDirection.y + 0.12;
float darkReflectionBand = exp(
  -darkReflectionDistance * darkReflectionDistance * 10.0
);
float darkReflectionShoulderA = darkReflectionDistance - 0.26;
float darkReflectionShoulderB = darkReflectionDistance + 0.26;
float darkReflectionSheen = sat(
  exp(-darkReflectionShoulderA * darkReflectionShoulderA * 48.0)
    + exp(-darkReflectionShoulderB * darkReflectionShoulderB * 48.0)
);''',
    "soft reflected environment trough",
)

shader = replace_exact(
    shader,
    '''    + (environmentReflection - 0.50) * 0.30
    - darkReflectionBand * 0.38''',
    '''    + (environmentReflection - 0.50) * 0.30
    + darkReflectionSheen * 0.12
    - darkReflectionBand * 0.20''',
    "soft mirror trough composition",
)

shader = replace_exact(
    shader,
    '''  sat(reflectedDepth + darkReflectionBand * 0.18)
);''',
    '''  sat(reflectedDepth * 0.84 + darkReflectionBand * 0.07)
);''',
    "restrained inner shadow depth",
)

shader = replace_exact(
    shader,
    '''metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
);''',
    '''metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + darkReflectionSheen * 0.08
);''',
    "soft reflected sheen highlight",
)

shader = replace_exact(
    shader,
    '''    + ceilingStrip * 0.32
    + floorReflection * 0.22
    + keySpecular * 1.00''',
    '''    + ceilingStrip * 0.32
    + floorReflection * 0.22
    + darkReflectionSheen * 0.30
    + keySpecular * 1.00''',
    "prismatic reflection sheen mask",
)

shader = replace_exact(
    shader,
    '''  + horizonStrip * 0.10
  + verticalStrip * 0.07;''',
    '''  + horizonStrip * 0.10
  + verticalStrip * 0.07
  + darkReflectionSheen * 0.08;''',
    "soft sheen reflection luminance",
)

shader = replace_exact(
    shader,
    '''  fwidth(materialField) * 0.68,''',
    '''  fwidth(metalSurfaceField) * 0.68,''',
    "spectral edge derivative surface",
)

shader = replace_exact(
    shader,
    '''  abs(materialField - metalEdgeLevel)
);''',
    '''  abs(metalSurfaceField - metalEdgeLevel)
);''',
    "spectral edge optical surface",
)

shader = replace_exact(
    shader,
    '''vec4 metalMaterial = fluidMaterial(
  materialField,
  metalTint,
  0.72 + edge * 0.16,''',
    '''vec4 metalMaterial = fluidMaterial(
  metalSurfaceField,
  metalTint,
  0.38 + edge * 0.10,''',
    "soft liquid-metal rim",
)

shader = replace_exact(
    shader,
    '''float metalBody = smoothstep(0.68, 1.16, materialField);''',
    '''float metalBody = smoothstep(0.68, 1.16, metalSurfaceField);''',
    "smooth metal body field",
)

shader = replace_exact(
    shader,
    '''metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + metalFresnel * edge * 0.07
);''',
    '''metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + metalFresnel * edge * 0.07
    + darkReflectionSheen * 0.06
);''',
    "final soft sheen highlight",
)

shader_path.write_text(shader, encoding="utf-8")


test_path = Path("src/components/MetalbloomTheme.test.js")
test_source = test_path.read_text(encoding="utf-8")

test_source = replace_exact(
    test_source,
    '''  test("threads white and spectral colour through every bright reflection", () => {''',
    '''  test("softens the inner contour into a broad mirrored reflection", () => {
    expect(scene).toContain(
      "float metalSurfaceField = potential * 1.12 + edge * 0.10",
    );
    expect(scene).toContain("dFdx(metalSurfaceField)");
    expect(scene).toContain("dFdy(metalSurfaceField)");
    expect(scene).toContain(
      "float darkReflectionDistance = reflectedDirection.y + 0.12",
    );
    expect(scene).toContain(
      "-darkReflectionDistance * darkReflectionDistance * 10.0",
    );
    expect(scene).toContain("float darkReflectionSheen = sat(");
    expect(scene).toContain("+ darkReflectionSheen * 0.12");
    expect(scene).toContain("- darkReflectionBand * 0.20");
    expect(scene).toContain("darkReflectionBand * 0.07");
    expect(scene).toContain("darkReflectionSheen * 0.30");
    expect(scene).toContain("darkReflectionSheen * 0.08");
    expect(scene).toContain("0.38 + edge * 0.10");
    expect(scene).toContain(
      "float metalBody = smoothstep(0.68, 1.16, metalSurfaceField)",
    );
    expect(scene).not.toContain(
      "-abs(reflectedDirection.y + 0.12) * 7.6",
    );
    expect(scene).not.toContain("0.72 + edge * 0.16");
  });

  test("threads white and spectral colour through every bright reflection", () => {''',
    "Metalbloom inner reflection regression coverage",
)

test_path.write_text(test_source, encoding="utf-8")
