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
    '''vec3 mercuryShadow = mix(
  vec3(0.012, 0.016, 0.022),
  vec3(0.075, 0.085, 0.100),
  u_light
);
vec3 mercuryMid = mix(
  vec3(0.300, 0.330, 0.380),
  vec3(0.450, 0.480, 0.530),
  u_light
);
vec3 mercuryHighlight = mix(
  vec3(1.380, 1.420, 1.480),
  vec3(1.280, 1.310, 1.360),
  u_light
);''',
    '''vec3 mercuryShadow = mix(
  vec3(0.010, 0.014, 0.020),
  vec3(0.070, 0.078, 0.090),
  u_light
);
vec3 mercuryMid = mix(
  vec3(0.480, 0.505, 0.545),
  vec3(0.655, 0.675, 0.710),
  u_light
);
vec3 mercuryHighlight = mix(
  vec3(1.580, 1.620, 1.690),
  vec3(1.470, 1.505, 1.570),
  u_light
);''',
    "silver reflectance range",
)

shader = replace_exact(
    shader,
    '''metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
);

// The spectral accent is a dedicated, continuous iso-band around the visible''',
    '''metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
);

// Bright studio reflections carry a white-hot centre and a restrained
// travelling spectrum, matching the prismatic light treatment used by Tidal
// Weave and Contour Drift without turning the mercury into coloured plastic.
float reflectionPrismMask = sat(
  horizonStrip * 0.72
    + verticalStrip * 0.56
    + counterStrip * 0.42
    + ceilingStrip * 0.32
    + floorReflection * 0.22
    + keySpecular * 1.00
    + fillSpecular * 0.48
    + rimSpecular * 0.30
    + metalFresnel * 0.16
);
float reflectionHue = baseHue
  + p.x * 0.19
  - p.y * 0.13
  + reflectedDirection.x * 0.16
  - reflectedDirection.y * 0.12
  + environmentReflection * 0.10
  + time * 0.016;
vec3 reflectionSpectrum = spectral(reflectionHue);
float reflectionLuma = mix(1.28, 1.36, u_light)
  + keySpecular * 0.18
  + horizonStrip * 0.10
  + verticalStrip * 0.07;
float reflectionChroma = mix(0.36, 0.31, u_light);
float reflectionFloor = mix(0.72, 0.80, u_light);
vec3 prismaticReflection = max(
  mix(vec3(reflectionLuma), reflectionSpectrum, reflectionChroma),
  vec3(reflectionFloor)
);
metalTint = mix(
  metalTint,
  prismaticReflection,
  reflectionPrismMask * mix(0.34, 0.30, u_light)
);

// The spectral accent is a dedicated, continuous iso-band around the visible''',
    "prismatic reflection construction",
)

shader = replace_exact(
    shader,
    '''metalMaterial.rgb = mix(
  metalMaterial.rgb,
  metalTint * (0.92 + mirrorLevel * 0.24),
  metalBody * 0.84
);
metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.22
    + fillSpecular * 0.08
    + rimSpecular * 0.06
    + metalFresnel * edge * 0.06
);

// Compose the spectral rim last.''',
    '''metalMaterial.rgb = mix(
  metalMaterial.rgb,
  metalTint * (1.02 + mirrorLevel * 0.32),
  metalBody * 0.90
);
metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + metalFresnel * edge * 0.07
);
metalMaterial.rgb = mix(
  metalMaterial.rgb,
  prismaticReflection,
  reflectionPrismMask * mix(0.28, 0.24, u_light)
);
metalMaterial.rgb += prismaticReflection
  * reflectionPrismMask
  * 0.055;

// Compose the spectral rim last.''',
    "post-material silver and prism composition",
)

shader_path.write_text(shader, encoding="utf-8")


test_path = Path("src/components/MetalbloomTheme.test.js")
test_source = test_path.read_text(encoding="utf-8")

test_source = replace_exact(
    test_source,
    '''    expect(scene).toContain("vec3 mercuryShadow");
    expect(scene).toContain("vec3 mercuryMid");
    expect(scene).toContain("vec3 mercuryHighlight");
    expect(scene).toContain("vec4 metalMaterial = fluidMaterial");
  });

  test("keeps a continuous pale spectral rim and preserves topology", () => {''',
    '''    expect(scene).toContain("vec3 mercuryShadow");
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
    expect(scene).toContain("prismaticReflection\n  * reflectionPrismMask\n  * 0.055");
  });

  test("keeps a continuous pale spectral rim and preserves topology", () => {''',
    "Metalbloom silver reflection regression coverage",
)

test_path.write_text(test_source, encoding="utf-8")
