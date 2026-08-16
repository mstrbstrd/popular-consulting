from pathlib import Path


def replace_exact(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source block, found {count}."
        )
    return source.replace(old, new, 1)


def replace_between(source, start_marker, end_marker, replacement, label):
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker was not found.")
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker was not found.")
    return source[:start] + replacement + source[end:]


shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")

metal_block = '''// Metalbloom keeps the exact same field topology and derives a pseudo-normal
// from its screen-space slope. High-contrast reflected studio bands, dark
// environment bands, and sharper specular turns create mirror-fluid mercury.
vec2 metalSlope = vec2(dFdx(materialField), dFdy(materialField));
float metalSlopeMagnitude = length(metalSlope);
vec3 metalNormal = normalize(vec3(
  -metalSlope.x * 0.92,
  -metalSlope.y * 0.92,
  0.44 + 0.24 / (1.0 + metalSlopeMagnitude * 3.4)
));
vec3 viewDirection = vec3(0.0, 0.0, 1.0);
vec3 reflectedDirection = reflect(-viewDirection, metalNormal);
vec3 keyDirection = normalize(vec3(-0.50, 0.42, 0.76));
vec3 fillDirection = normalize(vec3(0.72, -0.18, 0.66));
vec3 rimDirection = normalize(vec3(-0.08, -0.94, 0.34));
float keySpecular = pow(
  sat(dot(reflect(-keyDirection, metalNormal), viewDirection)),
  54.0
);
float fillSpecular = pow(
  sat(dot(reflect(-fillDirection, metalNormal), viewDirection)),
  22.0
);
float rimSpecular = pow(
  sat(dot(reflect(-rimDirection, metalNormal), viewDirection)),
  64.0
);
float horizonStrip = exp(-abs(reflectedDirection.y - 0.10) * 8.4);
float verticalStrip = exp(-abs(reflectedDirection.x + 0.28) * 14.0);
float counterStrip = exp(-abs(reflectedDirection.x - 0.36) * 17.0);
float ceilingStrip = exp(-abs(reflectedDirection.y - 0.58) * 10.0);
float floorReflection = exp(-abs(reflectedDirection.y + 0.52) * 8.0);
float darkReflectionBand = exp(
  -abs(reflectedDirection.y + 0.12) * 7.6
);
float environmentReflection = fbm(
  rotate2(-0.36) * (p + reflectedDirection.xy * 0.38) * 1.22
    + vec2(u_seed * 3.3, -u_seed * 2.4)
    + vec2(time * 0.010, -time * 0.008)
);
float mirrorRaw = sat(
  0.10
    + horizonStrip * 0.48
    + verticalStrip * 0.34
    + counterStrip * 0.22
    + ceilingStrip * 0.14
    + floorReflection * 0.12
    + keySpecular * 1.30
    + fillSpecular * 0.52
    + rimSpecular * 0.22
    + (environmentReflection - 0.50) * 0.30
    - darkReflectionBand * 0.38
);
float mirrorLevel = smoothstep(0.04, 0.92, mirrorRaw);
float metalFresnel = pow(1.0 - sat(metalNormal.z), 3.8);

vec3 mercuryShadow = mix(
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
);
vec3 metalTint = mix(
  mercuryShadow,
  mercuryMid,
  smoothstep(0.06, 0.54, mirrorLevel)
);
metalTint = mix(
  metalTint,
  mercuryHighlight,
  smoothstep(0.48, 0.98, mirrorLevel)
);
float reflectedDepth = smoothstep(0.88, 2.8, potential)
  * (1.0 - smoothstep(0.16, 0.78, mirrorLevel))
  * (0.12 + metalFresnel * 0.16);
metalTint = mix(
  metalTint,
  mercuryShadow * 0.50,
  sat(reflectedDepth + darkReflectionBand * 0.18)
);
metalTint += mercuryHighlight * (
  keySpecular * 0.24
    + fillSpecular * 0.09
    + rimSpecular * 0.07
);

// The spectral accent is a dedicated, continuous iso-band around the visible
// mercury boundary. It is independent of crossings and studio reflections,
// so a pale rainbow gradient remains visible around the full object at all times.
float metalEdgeLevel = 0.98;
float metalEdgeWidth = clamp(
  fwidth(materialField) * 0.68,
  0.010,
  0.060
);
float spectralEdgeMask = 1.0 - smoothstep(
  metalEdgeWidth,
  metalEdgeWidth * 2.10,
  abs(materialField - metalEdgeLevel)
);
float metalAccentHue = baseHue
  + p.x * 0.22
  - p.y * 0.17
  + reflectedDirection.x * 0.10
  - reflectedDirection.y * 0.08
  + environmentReflection * 0.08
  + time * 0.014;
vec3 metalAccentSpectrum = spectral(metalAccentHue);

vec4 metalMaterial = fluidMaterial(
  materialField,
  metalTint,
  0.72 + edge * 0.16,
  0.035 + horizonStrip * 0.045 + verticalStrip * 0.025,
  0.99
);
float metalBody = smoothstep(0.68, 1.16, materialField);
metalMaterial.rgb = mix(
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

// Compose the spectral rim last. Direct colour blending is required here:
// channel-wise maxima against silver would neutralize the gradient back to white.
float metalEdgeLuma = max(
  dot(metalMaterial.rgb, vec3(0.2126, 0.7152, 0.0722)),
  mix(0.72, 0.80, u_light)
);
float metalEdgeChroma = mix(0.50, 0.44, u_light);
float metalEdgeFloor = mix(0.66, 0.74, u_light);
vec3 prismaticEdge = max(
  mix(vec3(metalEdgeLuma), metalAccentSpectrum, metalEdgeChroma),
  vec3(metalEdgeFloor)
);
metalMaterial.rgb = mix(
  metalMaterial.rgb,
  prismaticEdge,
  spectralEdgeMask * mix(0.78, 0.70, u_light)
);
metalMaterial.rgb += metalAccentSpectrum * spectralEdgeMask * 0.035;
metalMaterial.a = max(
  metalMaterial.a,
  max(
    density * (0.26 + membrane * 0.10),
    spectralEdgeMask * mix(0.74, 0.68, u_light)
  )
);

'''

shader = replace_between(
    shader,
    "// Metalbloom keeps the exact same field topology and derives a pseudo-normal",
    "return mix(\n  spectralMaterial,\n  metalMaterial,\n  sat(u_metabloomPaletteMix)\n);",
    metal_block,
    "Metalbloom shader material block",
)
shader_path.write_text(shader, encoding="utf-8")

css_path = Path("src/components/CreatorOSFieldCanvas.css")
css = css_path.read_text(encoding="utf-8")

css = replace_between(
    css,
    ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {\n",
    ".creatoros-field-mode-1.creatoros-field-palette-water {",
    "",
    "Metalbloom shell background overrides",
)

fallback_block = '''.creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 30% 68%, rgba(238, 244, 248, 0.92), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(58, 66, 76, 0.84), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(218, 226, 232, 0.88), transparent 26%),
    radial-gradient(ellipse at 54% 46%, rgba(99, 68, 245, 0.12), transparent 42%),
    #fff8f7;
}

[data-theme="dark"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 30% 68%, rgba(226, 234, 240, 0.72), transparent 25%),
    radial-gradient(ellipse at 58% 34%, rgba(8, 12, 17, 0.94), transparent 29%),
    radial-gradient(ellipse at 74% 64%, rgba(176, 187, 197, 0.62), transparent 26%),
    radial-gradient(ellipse at 54% 46%, rgba(255, 86, 214, 0.10), transparent 42%),
    #080809;
}

'''

css = replace_between(
    css,
    ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback {\n",
    ".creatoros-field-mode-1 .creatoros-field-fallback {",
    fallback_block,
    "Metalbloom fallback backgrounds",
)
css_path.write_text(css, encoding="utf-8")

test_path = Path("src/components/MetalbloomTheme.test.js")
test_source = test_path.read_text(encoding="utf-8")

mirror_test = '''  test("renders mercury through high-contrast mirror reflections and Fresnel", () => {
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
    expect(scene).toContain("vec4 metalMaterial = fluidMaterial");
  });

'''

test_source = replace_between(
    test_source,
    '  test("renders mercury through normals, reflected studio light, and Fresnel", () => {',
    '  test("keeps the rainbow as a restrained accent and preserves topology", () => {',
    mirror_test,
    "Metalbloom mirror optics test",
)

edge_test = '''  test("keeps a continuous pale spectral rim and preserves topology", () => {
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

'''

test_source = replace_between(
    test_source,
    '  test("keeps the rainbow as a restrained accent and preserves topology", () => {',
    '  test("keeps the selector and fallback inside the site visual language", () => {',
    edge_test,
    "Metalbloom spectral edge test",
)

background_test = '''  test("keeps the original light and dark page backgrounds", () => {
    const lightShellOverride =
      ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {\\n  background:";
    const darkShellOverride =
      "[data-theme=\\\"dark\\\"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom {\\n  background:";
    const lightFallbackStart = fieldStyles.indexOf(
      ".creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback",
    );
    const darkFallbackStart = fieldStyles.indexOf(
      "[data-theme=\\\"dark\\\"] .creatoros-field-mode-0.creatoros-field-metabloom-palette-metalbloom .creatoros-field-fallback",
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
'''

test_source = replace_between(
    test_source,
    '  test("keeps the selector and fallback inside the site visual language", () => {',
    "\n  });\n});",
    background_test,
    "Metalbloom background invariance test",
)
test_path.write_text(test_source, encoding="utf-8")

required_shader_tokens = (
    "float darkReflectionBand",
    "float spectralEdgeMask = 1.0 - smoothstep",
    "vec3 prismaticEdge",
    "spectralEdgeMask * mix(0.78, 0.70, u_light)",
)
for token in required_shader_tokens:
    if token not in shader:
        raise SystemExit(f"Refined Metalbloom shader token missing: {token}")

for forbidden in (
    "float metalAccentMask",
    "linear-gradient(145deg, #d8dde1",
    "linear-gradient(145deg, #020305",
):
    if forbidden in shader or forbidden in css:
        raise SystemExit(f"Obsolete Metalbloom behavior remains: {forbidden}")
