export const SPECTRAL_DITHER_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const SPECTRAL_DITHER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_theme;
uniform float u_energy;
uniform float u_reveal;
uniform float u_seed;
uniform vec2 u_pointer;
uniform vec2 u_pulseOrigin;
uniform float u_pulseAge;
uniform int u_modeA;
uniform int u_modeB;
uniform float u_modeMix;
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_charCount;
uniform int u_atlasCols;
uniform int u_atlasRows;

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 5; index++) {
    value += amplitude * noise2(p);
    p = p * 2.03 + vec2(17.2, 9.7);
    amplitude *= 0.5;
  }
  return value;
}

mat2 rotate2(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

vec3 hsb2rgb(float h, float s, float b) {
  vec3 c = clamp(
    abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
    0.0,
    1.0
  );
  return b * mix(vec3(1.0), c, s);
}

vec3 spectral(float hue, float brightness) {
  vec3 raw = hsb2rgb(fract(hue), 1.0, 1.0);
  float luminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = min(raw * (0.58 / max(luminance, 0.1)), vec3(1.0));
  float normalizedLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = mix(vec3(normalizedLuminance), raw, 1.24);
  return clamp(raw * brightness, 0.0, 1.0);
}

vec2 aspectScale() {
  return vec2(u_res.x / max(u_res.y, 1.0), 1.0);
}

float pulseField(vec2 uv) {
  vec2 delta = (uv - u_pulseOrigin) * aspectScale();
  float radius = length(delta);
  float ringRadius = u_pulseAge * 0.21;
  float envelope = 1.0 - smoothstep(3.8, 6.8, u_pulseAge);
  return exp(-abs(radius - ringRadius) * 46.0) * envelope;
}

vec2 pointerFlow(vec2 uv, float strength) {
  vec2 scale = aspectScale();
  vec2 delta = (uv - u_pointer) * scale;
  float influence = exp(-dot(delta, delta) * 4.6);
  vec2 tangent = vec2(-delta.y, delta.x);
  return uv + tangent / scale * influence * strength * (0.36 + u_energy * 0.84);
}

vec3 sceneMetabloom(vec2 uv, float time) {
  vec2 scale = aspectScale();
  uv = pointerFlow(uv, 0.075);
  vec2 p = (uv - 0.5) * scale;
  p = rotate2(-0.08 + sin(time * 0.07) * 0.035) * p;

  float potential = 0.0;
  float nearest = 10.0;
  for (int index = 0; index < 7; index++) {
    float layer = float(index);
    float phase = time * (0.16 + layer * 0.009)
      + layer * 1.71
      + u_seed * 7.0;
    vec2 center = vec2(
      sin(phase * 1.13 + layer * 0.91) * (0.18 + 0.035 * layer),
      cos(phase * 0.87 - layer * 1.27) * (0.12 + 0.028 * layer)
    );
    center += vec2(
      sin(time * 0.09 + layer * 2.2),
      cos(time * 0.075 - layer * 1.8)
    ) * 0.055;
    float radius = 0.105 + 0.025 * sin(phase * 1.7 + layer);
    vec2 delta = p - center;
    float distanceSquared = dot(delta, delta) + 0.007;
    potential += radius * radius / distanceSquared;
    nearest = min(nearest, sqrt(distanceSquared));
  }

  vec2 pointer = (u_pointer - 0.5) * scale;
  vec2 pointerDelta = p - pointer;
  potential += (0.018 + u_energy * 0.035)
    / (dot(pointerDelta, pointerDelta) + 0.012);

  float pulse = pulseField(uv);
  potential += pulse * (0.55 + u_energy * 0.85);
  potential = min(potential, 8.0);

  float membrane = 0.5 + 0.5 * sin(
    potential * 4.4
      + fbm(p * 2.35 + vec2(time * 0.035, -time * 0.026)) * 4.2
  );
  float body = smoothstep(0.36, 2.65, potential);
  float edge = exp(-abs(potential - 1.18) * 2.7);
  float density = sat(body * 0.69 + membrane * body * 0.31 + edge * 0.18);
  float hue = 0.70
    + atan(p.y, p.x) / TAU * 0.22
    + potential * 0.047
    + time * 0.018
    + u_seed * 0.13;
  float glow = sat(edge * 0.70 + pulse * 0.72 + exp(-nearest * 8.0) * 0.20);
  return vec3(density, hue, glow);
}

vec3 sceneTidalWeave(vec2 uv, float time) {
  vec2 scale = aspectScale();
  uv = pointerFlow(uv, -0.055);
  vec2 p = (uv - 0.5) * scale;
  p = rotate2(-0.18 + 0.035 * sin(time * 0.09)) * p;
  p += vec2(
    fbm(p * 1.55 + vec2(time * 0.035, 3.1)) - 0.5,
    fbm(p * 1.35 + vec2(-4.7, -time * 0.028)) - 0.5
  ) * 0.16;

  float phaseA = p.y
    + 0.20 * sin(p.x * 2.7 + time * 0.42)
    + 0.055 * sin(p.x * 7.1 - time * 0.31);
  float phaseB = p.y
    - 0.19 * sin(p.x * 2.45 - time * 0.36 + 1.4)
    + 0.060 * sin(p.x * 6.4 + time * 0.27 + 2.1);
  float bandA = exp(-abs(sin(phaseA * PI * 3.05)) * 4.8);
  float bandB = exp(-abs(sin(phaseB * PI * 3.20)) * 5.0);
  float crossing = bandA * bandB;
  float overUnder = 0.5 + 0.5 * sin(p.x * 10.8 + time * 0.78);
  float weave = mix(max(bandA, bandB), bandA + bandB - crossing * 0.58, overUnder);

  float pulse = pulseField(uv);
  float pointerWake = exp(-length((uv - u_pointer) * scale) * 4.8) * u_energy;
  float density = sat(weave * 0.88 + crossing * 0.34 + pulse * 0.50 + pointerWake * 0.22);
  float hue = 0.48
    + (phaseA - phaseB) * 0.38
    + p.x * 0.055
    + time * 0.015
    + u_seed * 0.11;
  float glow = sat(crossing * 1.15 + pulse * 0.66 + pointerWake * 0.34);
  return vec3(density, hue, glow);
}

vec3 sceneMoireHalo(vec2 uv, float time) {
  vec2 scale = aspectScale();
  vec2 p = (uv - 0.5) * scale;
  vec2 pointer = (u_pointer - 0.5) * scale;
  vec2 centerA = pointer * 0.27 + vec2(
    sin(time * 0.17 + u_seed * 4.0),
    cos(time * 0.13 - u_seed * 3.0)
  ) * 0.075;
  vec2 centerB = -pointer * 0.18 + vec2(
    cos(time * 0.11 + 1.2),
    sin(time * 0.19 - 0.8)
  ) * 0.090;

  float radiusA = length(p - centerA);
  float radiusB = length(p - centerB);
  float noiseWarp = fbm(p * 2.0 + vec2(time * 0.025, -time * 0.018));
  float ringA = sin(radiusA * 72.0 - time * 1.28 + noiseWarp * 2.5);
  float ringB = sin(radiusB * 78.0 + time * 1.09 - noiseWarp * 2.1);
  float interference = 0.5 + 0.5 * ringA * ringB;
  float radialGate = exp(-length(p) * 0.58);
  float spokes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 9.0 + time * 0.35);
  float lens = exp(-abs(radiusA - radiusB) * 8.5);
  float pulse = pulseField(uv);

  float density = sat(
    interference * (0.58 + radialGate * 0.30)
      + lens * 0.24
      + spokes * radialGate * 0.10
      + pulse * 0.48
  );
  float hue = atan(p.y, p.x) / TAU
    + (radiusA - radiusB) * 0.72
    + time * 0.022
    + interference * 0.12
    + u_seed * 0.09;
  float glow = sat(lens * 0.70 + pulse * 0.76 + pow(interference, 3.0) * 0.34);
  return vec3(density, hue, glow);
}

vec3 sceneContourDrift(vec2 uv, float time) {
  vec2 scale = aspectScale();
  vec2 p = (uv - 0.5) * scale;
  vec2 drift = vec2(time * 0.027, -time * 0.021);
  float terrain = fbm(p * 2.10 + drift + vec2(u_seed * 3.1));
  terrain += fbm(rotate2(0.72) * p * 4.45 - drift * 1.7 + vec2(11.0)) * 0.31;
  terrain /= 1.31;

  vec2 pointerDelta = (uv - u_pointer) * scale;
  float pointerLift = exp(-dot(pointerDelta, pointerDelta) * 7.0)
    * (0.12 + u_energy * 0.33);
  float pulse = pulseField(uv);
  terrain = sat(terrain + pointerLift - pulse * 0.14);

  float levels = terrain * 10.5;
  float contourDistance = abs(fract(levels) - 0.5);
  float contour = 1.0 - smoothstep(0.065, 0.19, contourDistance);
  float secondary = 1.0 - smoothstep(
    0.030,
    0.095,
    abs(fract(levels * 0.5 + 0.25) - 0.5)
  );
  float land = smoothstep(0.24, 0.78, terrain);
  float basin = 1.0 - smoothstep(0.34, 0.62, terrain);
  float density = sat(contour * 0.74 + secondary * 0.18 + land * 0.27 + basin * 0.08);
  float hue = 0.08
    + terrain * 0.88
    + p.x * 0.035
    + time * 0.010
    + u_seed * 0.14;
  float glow = sat(contour * (0.24 + terrain * 0.52) + pulse * 0.64 + pointerLift * 0.72);
  return vec3(density, hue, glow);
}

vec3 sampleScene(int mode, vec2 uv, float time) {
  if (mode == 0) return sceneMetabloom(uv, time);
  if (mode == 1) return sceneTidalWeave(uv, time);
  if (mode == 2) return sceneMoireHalo(uv, time);
  return sceneContourDrift(uv, time);
}

vec4 sampleGlyph(int index, vec2 cellUv) {
  index = clamp(index, 0, u_charCount - 1);
  int column = index % u_atlasCols;
  int row = index / u_atlasCols;
  vec2 atlasUv = vec2(
    (float(column) + cellUv.x) / float(u_atlasCols),
    (float(row) + cellUv.y) / float(u_atlasRows)
  );
  return texture(u_atlas, atlasUv);
}

float revealMask(vec2 coordinate) {
  float coarse = hash21(floor(coordinate / 112.0));
  float medium = hash21(floor(coordinate / 31.0) + vec2(29.7, 13.2));
  float fine = hash21(floor(coordinate / 8.0) + vec2(71.1, 49.6));
  float threshold = (coarse * 0.46 + medium * 0.34 + fine * 0.20) * 0.88;
  return smoothstep(threshold - 0.06, threshold + 0.06, u_reveal);
}

void main() {
  vec2 cellCount = max(
    floor(u_res / max(u_cellSize, 1.0)),
    vec2(1.0)
  );
  vec2 cellId = floor(v_uv * cellCount);
  vec2 cellUv = fract(v_uv * cellCount);
  vec2 sampleUv = (cellId + 0.5) / cellCount;

  vec3 scene = sampleScene(u_modeA, sampleUv, u_time);
  if (u_modeA != u_modeB && u_modeMix > 0.001) {
    vec3 incomingScene = sampleScene(u_modeB, sampleUv, u_time);
    float sceneMix = smoothstep(0.0, 1.0, u_modeMix);
    scene = mix(scene, incomingScene, sceneMix);
  }

  float density = sat(scene.x);
  float shimmer = (
    sin(cellId.x * 0.39 + cellId.y * 0.27 + u_time * 0.94) * 0.46
      + sin(cellId.x * 0.81 - cellId.y * 0.55 + u_time * 0.61) * 0.34
      + sin((cellId.x + cellId.y) * 0.19 + u_time * 1.41) * 0.20
  ) * smoothstep(0.06, 0.78, density);

  float characterValue = clamp(
    pow(density, 0.86) * float(u_charCount - 1) + shimmer,
    0.0,
    float(u_charCount - 1)
  );
  int characterA = int(floor(characterValue));
  int characterB = min(characterA + 1, u_charCount - 1);

  vec2 distortion = vec2(
    sin(u_time * 0.68 + cellId.y * 0.31),
    cos(u_time * 0.54 + cellId.x * 0.29)
  ) * scene.z * 0.065;
  vec2 distortedCellUv = clamp(cellUv + distortion, vec2(0.02), vec2(0.98));
  float glyphAlpha = mix(
    sampleGlyph(characterA, distortedCellUv).r,
    sampleGlyph(characterB, distortedCellUv).r,
    fract(characterValue)
  );

  ivec2 bayerCell = ivec2(mod(floor(gl_FragCoord.xy / 2.0), 4.0));
  const int bayer4[16] = int[16](
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  );
  float threshold = float(bayer4[bayerCell.y * 4 + bayerCell.x]) / 16.0;
  glyphAlpha *= step(threshold * 0.34 + 0.16, glyphAlpha);

  vec3 lightSurface = vec3(1.000, 0.985, 0.978);
  vec3 darkSurface = vec3(0.005, 0.007, 0.019);
  vec3 surface = mix(lightSurface, darkSurface, u_theme);
  float paper = hash21(gl_FragCoord.xy * 0.37 + u_seed * 31.0) - 0.5;
  surface += paper * mix(0.008, 0.004, u_theme);

  vec3 wash = spectral(scene.y + 0.48, 0.62);
  surface = mix(
    surface,
    wash,
    scene.z * mix(0.055, 0.105, u_theme)
  );

  vec3 ink = spectral(scene.y + density * 0.075, mix(1.02, 1.14, u_theme));
  float glyphPresence = glyphAlpha * smoothstep(0.035, 0.88, density);
  vec3 color = mix(surface, ink, glyphPresence * 0.96);
  color += ink * scene.z * glyphPresence * mix(0.08, 0.20, u_theme);

  float pulse = pulseField(v_uv);
  color += spectral(scene.y + 0.18, 0.96)
    * pulse
    * mix(0.05, 0.14, u_theme);

  float vignette = 1.0 - 0.13 * pow(length(v_uv - 0.5), 2.0);
  color *= vignette;

  float reveal = revealMask(gl_FragCoord.xy);
  color = mix(surface, color, reveal);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
