from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}.")
    return text.replace(old, new, 1)


path = Path("src/components/CreatorOSFieldShader.js")
source = path.read_text(encoding="utf-8")
source = replace_once(
    source,
    '''uniform float u_modeMix;
uniform float u_tidalPaletteMix;''',
    '''uniform float u_modeMix;
uniform float u_contourPaletteMix;
uniform float u_tidalPaletteMix;''',
    "Contour palette shader uniform",
)
old = '''  vec3 tint = spectral(
    0.08 + terrain * 0.88 + p.x * 0.035 + time * 0.010 + u_seed * 0.14
  );

  return fluidMaterial(field, tint, 0.24, 0.18, 0.84);'''
new = '''  vec3 spectralTint = spectral(
    0.08 + terrain * 0.88 + p.x * 0.035 + time * 0.010 + u_seed * 0.14
  );

  // Hypsometric tones give the field the hierarchy of a relief map.
  vec3 basinTone = mix(
    vec3(0.035, 0.155, 0.170),
    vec3(0.480, 0.720, 0.690),
    u_light
  );
  vec3 lowlandTone = mix(
    vec3(0.095, 0.285, 0.190),
    vec3(0.430, 0.660, 0.430),
    u_light
  );
  vec3 uplandTone = mix(
    vec3(0.290, 0.360, 0.190),
    vec3(0.650, 0.690, 0.410),
    u_light
  );
  vec3 ridgeTone = mix(
    vec3(0.460, 0.360, 0.260),
    vec3(0.730, 0.610, 0.440),
    u_light
  );
  vec3 summitTone = mix(
    vec3(0.820, 0.825, 0.770),
    vec3(0.960, 0.945, 0.890),
    u_light
  );
  vec3 terrainTint = mix(
    basinTone,
    lowlandTone,
    smoothstep(0.16, 0.35, terrain)
  );
  terrainTint = mix(
    terrainTint,
    uplandTone,
    smoothstep(0.34, 0.57, terrain)
  );
  terrainTint = mix(
    terrainTint,
    ridgeTone,
    smoothstep(0.56, 0.76, terrain)
  );
  terrainTint = mix(
    terrainTint,
    summitTone,
    smoothstep(0.75, 0.94, terrain)
  );

  // Screen-space slope becomes a pseudo normal for hillshade. The terrain
  // field, contour geometry, timing, and interaction remain unchanged.
  vec2 terrainSlope = vec2(dFdx(terrain), dFdy(terrain));
  vec3 terrainNormal = normalize(vec3(
    -terrainSlope.x * 18.0,
    -terrainSlope.y * 18.0,
    1.0
  ));
  vec3 reliefLight = normalize(vec3(-0.48, 0.58, 0.66));
  float hillshade = 0.5 + 0.5 * dot(terrainNormal, reliefLight);
  float reliefValue = smoothstep(0.08, 0.96, hillshade);
  terrainTint *= mix(0.72, 1.16, reliefValue);
  terrainTint += summitTone * pow(reliefValue, 5.0) * 0.055;

  vec3 contourInk = mix(
    vec3(0.960, 0.985, 0.940),
    vec3(1.080, 1.065, 1.000),
    u_light
  );
  float contourLine = sat(contour * 0.72 + secondary * 0.24);
  terrainTint = mix(terrainTint, contourInk, contourLine);

  // A low-chroma spectral film stays on both edges of every contour.
  float contourEdgeWidth = max(fwidth(contour) * 0.70, 0.009);
  float contourEdge = 1.0 - smoothstep(
    contourEdgeWidth,
    contourEdgeWidth * 1.95,
    abs(contour - 0.58)
  );
  float secondaryEdgeWidth = max(fwidth(secondary) * 0.58, 0.008);
  float secondaryEdge = 1.0 - smoothstep(
    secondaryEdgeWidth,
    secondaryEdgeWidth * 1.90,
    abs(secondary - 0.56)
  );
  float spectralEdge = sat(contourEdge + secondaryEdge * 0.20);
  vec3 contourSpectrum = spectral(
    0.62
      + terrain * 0.38
      + p.x * 0.050
      - p.y * 0.030
      + time * 0.006
      + u_seed * 0.10
  );
  float contourChroma = mix(0.14, 0.10, u_light);
  vec3 spectralContourEdge = mix(
    contourInk,
    contourSpectrum,
    contourChroma
  );
  spectralContourEdge = max(
    spectralContourEdge,
    contourInk * 0.82
  );
  terrainTint = mix(
    terrainTint,
    spectralContourEdge,
    spectralEdge * 0.64
  );

  float terrainPaletteWeight = 1.0 - sat(u_contourPaletteMix);
  vec3 tint = mix(
    terrainTint,
    spectralTint,
    sat(u_contourPaletteMix)
  );
  vec4 material = fluidMaterial(field, tint, 0.24, 0.18, 0.84);
  material.rgb = mix(
    material.rgb,
    max(material.rgb, contourInk * 0.72),
    terrainPaletteWeight * contourLine * 0.34
  );
  return material;'''
source = replace_once(source, old, new, "Contour Drift color block")
path.write_text(source, encoding="utf-8")
