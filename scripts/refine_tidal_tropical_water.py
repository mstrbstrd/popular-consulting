from pathlib import Path


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found.")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found.")
    return text[:start] + replacement + text[end:]


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}.")
    return text.replace(old, new)


shader_path = Path("src/components/CreatorOSFieldShader.js")
shader = shader_path.read_text(encoding="utf-8")

water_palette = '''vec3 tidalWaterPalette(float h) {
  float current = 0.5 + 0.5 * sin(h * TAU);
  float shallow = smoothstep(0.06, 0.58, current);
  float crystal = smoothstep(0.56, 1.0, current);
  vec3 deepTropical = mix(
    vec3(0.000, 0.120, 0.145),
    vec3(0.018, 0.365, 0.390),
    u_light
  );
  vec3 lagoonTeal = mix(
    vec3(0.000, 0.490, 0.535),
    vec3(0.000, 0.680, 0.660),
    u_light
  );
  vec3 turquoise = mix(
    vec3(0.000, 0.850, 0.805),
    vec3(0.190, 0.905, 0.820),
    u_light
  );
  vec3 crystalAqua = mix(
    vec3(0.450, 0.985, 0.925),
    vec3(0.690, 0.985, 0.925),
    u_light
  );
  vec3 color = mix(deepTropical, lagoonTeal, shallow);
  color = mix(color, turquoise, crystal);
  return mix(color, crystalAqua, crystal * crystal * 0.34);
}

'''
shader = replace_between(
    shader,
    "vec3 tidalWaterPalette(float h) {",
    "vec2 aspectScale() {",
    water_palette,
    "tropical water palette function",
)

scene_start = shader.find("vec4 sceneTidalWeave(vec2 uv, float time) {")
if scene_start < 0:
    raise SystemExit("Tidal Weave scene not found.")
color_start = shader.find("  vec3 spectralTintA", scene_start)
scene_end = shader.find("\n}\n\nvec4 sceneMoireHalo", color_start)
if color_start < 0 or scene_end < 0:
    raise SystemExit("Tidal Weave color block boundaries not found.")

color_block = '''  vec3 spectralTintA = spectral(0.47 + phaseA * 0.18 + time * 0.012);
  vec3 spectralTintB = spectral(0.84 + phaseB * 0.17 - time * 0.010);
  vec3 spectralTint = mix(spectralTintA, spectralTintB, overUnder);
  spectralTint = mix(
    spectralTint,
    spectral(0.12 + time * 0.016),
    crossing * 0.44
  );

  vec3 waterTintA = tidalWaterPalette(
    0.60 + phaseA * 0.16 + p.x * 0.024 + time * 0.006
  );
  vec3 waterTintB = tidalWaterPalette(
    0.18 + phaseB * 0.15 - p.x * 0.020 - time * 0.005
  );
  vec3 waterTint = mix(waterTintA, waterTintB, overUnder);

  // The existing weave lines become sunlight caustics. Only their color
  // changes: geometry, timing, interaction, and field density stay intact.
  float causticLines = sat(
    max(bandA, bandB) * 0.48
      + crossing * 0.38
  );
  float refractedSpark = pow(sat(crossing), 0.72);
  vec3 refractedLight = mix(
    vec3(0.610, 1.000, 0.940),
    vec3(0.905, 1.000, 0.975),
    u_light
  );
  float causticAmount = sat(
    causticLines * 0.52
      + refractedSpark * 0.26
      + pointerWake * 0.08
      + pulse * 0.10
  );
  waterTint = mix(waterTint, refractedLight, causticAmount);

  vec3 tint = mix(
    waterTint,
    spectralTint,
    sat(u_tidalPaletteMix)
  );
  return fluidMaterial(field, tint, 0.34, 0.22, 0.94);'''

shader = shader[:color_start] + color_block + shader[scene_end:]
shader_path.write_text(shader, encoding="utf-8")


field_css_path = Path("src/components/CreatorOSFieldCanvas.css")
field_css = field_css_path.read_text(encoding="utf-8")
tidal_fallback = '''.creatoros-field-mode-1 .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 51% 43%, rgba(226, 255, 249, 0.58), transparent 17%),
    radial-gradient(ellipse at 66% 62%, rgba(77, 246, 221, 0.34), transparent 28%),
    repeating-linear-gradient(164deg, transparent 0 4.1rem, rgba(185, 255, 241, 0.46) 4.25rem 4.65rem, transparent 4.8rem 8.7rem),
    repeating-linear-gradient(16deg, transparent 0 5.1rem, rgba(0, 190, 181, 0.34) 5.25rem 5.65rem, transparent 5.8rem 9.9rem),
    linear-gradient(145deg, #074b55 0%, #00aeb0 46%, #46e3cf 100%);
}

.creatoros-field-mode-1.creatoros-field-palette-spectral .creatoros-field-fallback {
  background:
    repeating-linear-gradient(164deg, transparent 0 4.1rem, rgba(0, 238, 255, 0.24) 4.25rem 4.65rem, transparent 4.8rem 8.7rem),
    repeating-linear-gradient(16deg, transparent 0 5.1rem, rgba(255, 0, 255, 0.20) 5.25rem 5.65rem, transparent 5.8rem 9.9rem),
    #fff8f7;
}

'''
field_css = replace_between(
    field_css,
    ".creatoros-field-mode-1 .creatoros-field-fallback {",
    ".creatoros-field-mode-2 .creatoros-field-fallback {",
    tidal_fallback,
    "Tidal fallback palette",
)
field_css_path.write_text(field_css, encoding="utf-8")


page_css_path = Path("src/components/DitherCanvasPage.css")
page_css = page_css_path.read_text(encoding="utf-8")
water_button = '''.tidal-palette-option.is-active[data-palette="water"] {
  border-color: rgba(92, 240, 220, 0.66);
  background: linear-gradient(
    135deg,
    rgba(0, 95, 110, 0.94),
    rgba(0, 174, 176, 0.86) 52%,
    rgba(70, 227, 207, 0.82)
  );
  color: rgba(235, 255, 251, 0.99);
  box-shadow:
    inset 0 1px 0 rgba(222, 255, 248, 0.52),
    0 0 1.8rem rgba(70, 227, 207, 0.24);
}

'''
page_css = replace_between(
    page_css,
    '.tidal-palette-option.is-active[data-palette="water"] {',
    '.tidal-palette-option.is-active[data-palette="spectral"] {',
    water_button,
    "water palette selector color",
)
page_css_path.write_text(page_css, encoding="utf-8")


canvas_test_path = Path("src/components/CreatorOSFieldCanvas.test.js")
canvas_test = canvas_test_path.read_text(encoding="utf-8")n