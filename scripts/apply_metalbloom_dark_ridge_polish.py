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
    '''float innerReflectionDistance = reflectedDirection.y + 0.12;
float innerReflectionBand = exp(
  -innerReflectionDistance * innerReflectionDistance * 5.4
);
float innerReflectionShoulderA = innerReflectionDistance - 0.30;
float innerReflectionShoulderB = innerReflectionDistance + 0.30;
float innerReflectionSheen = sat(
  exp(-innerReflectionShoulderA * innerReflectionShoulderA * 28.0)
    + exp(-innerReflectionShoulderB * innerReflectionShoulderB * 28.0)
);''',
    "broaden inner reflected environment band",
)

shader = replace_exact(
    shader,
    '''    + (environmentReflection - 0.50) * 0.30
    + darkReflectionSheen * 0.12
    - darkReflectionBand * 0.20''',
    '''    + (environmentReflection - 0.50) * 0.30
    + innerReflectionBand * 0.035
    + innerReflectionSheen * 0.08''',
    "remove subtractive inner ridge",
)

shader = replace_exact(
    shader,
    '''vec3 mercuryHighlight = mix(
  vec3(1.580, 1.620, 1.690),
  vec3(1.470, 1.505, 1.570),
  u_light
);''',
    '''vec3 mercuryHighlight = mix(
  vec3(1.520, 1.560, 1.630),
  vec3(1.420, 1.455, 1.515),
  u_light
);''',
    "slightly restrain mercury highlights",
)

shader = replace_exact(
    shader,
    '''float reflectedDepth = smoothstep(0.88, 2.8, potential)
  * (1.0 - smoothstep(0.16, 0.78, mirrorLevel))
  * (0.12 + metalFresnel * 0.16);
metalTint = mix(
  metalTint,
  mercuryShadow * 0.50,
  sat(reflectedDepth * 0.84 + darkReflectionBand * 0.07)
);
metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + darkReflectionSheen * 0.08
);''',
    '''float reflectedDepth = smoothstep(0.88, 2.8, potential)
  * (1.0 - smoothstep(0.16, 0.78, mirrorLevel))
  * (0.075 + metalFresnel * 0.095);
vec3 mercuryInnerReflection = mix(
  mercuryMid,
  mercuryShadow,
  mix(0.24, 0.16, u_light)
);
metalTint = mix(
  metalTint,
  mercuryInnerReflection,
  sat(reflectedDepth * 0.34)
);
vec3 innerReflectionTint = mix(
  mercuryMid,
  mercuryHighlight,
  mix(0.20, 0.16, u_light)
);
metalTint = mix(
  metalTint,
  innerReflectionTint,
  innerReflectionBand * mix(0.10, 0.08, u_light)
);
metalTint += mercuryHighlight * (
  keySpecular * 0.22
    + fillSpecular * 0.08
    + rimSpecular * 0.06
    + innerReflectionSheen * 0.055
);''',
    "replace dark inner groove with silver reflection",
)

shader = replace_exact(
    shader,
    '''    + ceilingStrip * 0.32
    + floorReflection * 0.22
    + darkReflectionSheen * 0.30
    + keySpecular * 1.00''',
    '''    + ceilingStrip * 0.32
    + floorReflection * 0.22
    + innerReflectionBand * 0.10
    + innerReflectionSheen * 0.22
    + keySpecular * 1.00''',
    "carry prism through inner reflection",
)

shader = replace_exact(
    shader,
    '''float reflectionLuma = mix(1.28, 1.36, u_light)
  + keySpecular * 0.18
  + horizonStrip * 0.10
  + verticalStrip * 0.07
  + darkReflectionSheen * 0.08;''',
    '''float reflectionLuma = mix(1.22, 1.30, u_light)
  + keySpecular * 0.16
  + horizonStrip * 0.09
  + verticalStrip * 0.06
  + innerReflectionBand * 0.035
  + innerReflectionSheen * 0.05;''',
    "tone down reflection luminance",
)

shader = replace_exact(
    shader,
    '''  metalTint * (1.02 + mirrorLevel * 0.32),''',
    '''  metalTint * (1.00 + mirrorLevel * 0.28),''',
    "restrain final mirror gain",
)

shader = replace_exact(
    shader,
    '''metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
    + metalFresnel * edge * 0.07
    + darkReflectionSheen * 0.06
);''',
    '''metalMaterial.rgb += mercuryHighlight * (
  keySpecular * 0.22
    + fillSpecular * 0.08
    + rimSpecular * 0.06
    + metalFresnel * edge * 0.06
    + innerReflectionSheen * 0.045
);''',
    "restrain final highlight layer",
)

shader_path.write_text(shader, encoding="utf-8")


test_path = Path("src/components/MetalbloomTheme.test.js")
test_source = test_path.read_text(encoding="utf-8")

test_source = replace_exact(
    test_source,
    '''    expect(scene).toContain("float darkReflectionBand");''',
    '''    expect(scene).toContain("float innerReflectionBand");''',
    "rename inner reflection expectation",
)

test_source = replace_exact(
    test_source,
    '''    expect(scene).toContain("vec3(1.580, 1.620, 1.690)");''',
    '''    expect(scene).toContain("vec3(1.520, 1.560, 1.630)");''',
    "update highlight expectation",
)

old_soft_test = '''  test("softens the inner contour into a broad mirrored reflection", () => {
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
  });'''

new_soft_test = '''  test("removes the dark inner ridge while retaining a soft silver reflection", () => {
    expect(scene).toContain(
      "float metalSurfaceField = potential * 1.12 + edge * 0.10",
    );
    expect(scene).toContain("dFdx(metalSurfaceField)");
    expect(scene).toContain("dFdy(metalSurfaceField)");
    expect(scene).toContain(
      "float innerReflectionDistance = reflectedDirection.y + 0.12",
    );
    expect(scene).toContain(
      "-innerReflectionDistance * innerReflectionDistance * 5.4",
    );
    expect(scene).toContain("float innerReflectionSheen = sat(");
    expect(scene).toContain("+ innerReflectionBand * 0.035");
    expect(scene).toContain("+ innerReflectionSheen * 0.08");
    expect(scene).toContain("vec3 mercuryInnerReflection = mix(");
    expect(scene).toContain("sat(reflectedDepth * 0.34)");
    expect(scene).toContain("vec3 innerReflectionTint = mix(");
    expect(scene).toContain(
      "innerReflectionBand * mix(0.10, 0.08, u_light)",
    );
    expect(scene).toContain("innerReflectionBand * 0.10");
    expect(scene).toContain("innerReflectionSheen * 0.22");
    expect(scene).toContain("0.38 + edge * 0.10");
    expect(scene).toContain(
      "float metalBody = smoothstep(0.68, 1.16, metalSurfaceField)",
    );
    expect(scene).toContain("metalTint * (1.00 + mirrorLevel * 0.28)");
    expect(scene).not.toContain("- innerReflectionBand *");
    expect(scene).not.toContain("mercuryShadow * 0.50");
    expect(scene).not.toContain("darkReflectionBand");
    expect(scene).not.toContain("0.72 + edge * 0.16");
  });'''

test_source = replace_exact(
    test_source,
    old_soft_test,
    new_soft_test,
    "replace dark-ridge regression test",
)

test_source = replace_exact(
    test_source,
    '''    expect(scene).toContain("float reflectionLuma = mix(1.28, 1.36, u_light)");''',
    '''    expect(scene).toContain("float reflectionLuma = mix(1.22, 1.30, u_light)");''',
    "update reflection luminance expectation",
)

test_path.write_text(test_source, encoding="utf-8")
