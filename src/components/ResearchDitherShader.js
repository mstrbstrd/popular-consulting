export const RESEARCH_DITHER_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const REACTION_DIFFUSION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_state;
uniform vec2 u_texel;
uniform vec2 u_pointer;
uniform vec2 u_pulseOrigin;
uniform float u_pulseAge;
uniform float u_energy;
uniform float u_time;
uniform float u_seed;
uniform float u_feed;
uniform float u_kill;
uniform float u_dt;

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

void main() {
  vec2 center = texture(u_state, v_uv).rg;
  vec2 north = texture(u_state, v_uv + vec2(0.0, u_texel.y)).rg;
  vec2 south = texture(u_state, v_uv - vec2(0.0, u_texel.y)).rg;
  vec2 east = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).rg;
  vec2 west = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).rg;
  vec2 northEast = texture(u_state, v_uv + u_texel).rg;
  vec2 northWest = texture(u_state, v_uv + vec2(-u_texel.x, u_texel.y)).rg;
  vec2 southEast = texture(u_state, v_uv + vec2(u_texel.x, -u_texel.y)).rg;
  vec2 southWest = texture(u_state, v_uv - u_texel).rg;

  vec2 laplacian = -center
    + (north + south + east + west) * 0.20
    + (northEast + northWest + southEast + southWest) * 0.05;

  float u = center.r;
  float v = center.g;
  float reaction = u * v * v;
  float feed = u_feed + sin(u_time * 0.037 + u_seed * 9.0) * 0.00055;
  float kill = u_kill + cos(u_time * 0.029 - u_seed * 7.0) * 0.00045;

  float du = 0.16 * laplacian.r - reaction + feed * (1.0 - u);
  float dv = 0.08 * laplacian.g + reaction - (feed + kill) * v;

  vec2 pointerDelta = v_uv - u_pointer;
  pointerDelta.x *= 1.32;
  float pointerBrush = exp(-dot(pointerDelta, pointerDelta) * 180.0)
    * u_energy;

  vec2 pulseDelta = v_uv - u_pulseOrigin;
  pulseDelta.x *= 1.32;
  float pulseRadius = u_pulseAge * 0.16;
  float pulse = exp(-abs(length(pulseDelta) - pulseRadius) * 70.0)
    * (1.0 - smoothstep(1.5, 4.8, u_pulseAge));

  u += du * u_dt;
  v += dv * u_dt;
  v += pointerBrush * 0.040 + pulse * 0.026;
  u -= pointerBrush * 0.022 + pulse * 0.014;

  fragColor = vec4(sat(u), sat(v), 0.0, 1.0);
}`;

export const RESEARCH_DITHER_FRAGMENT_SHADER = `#version 300 es
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
uniform sampler2D u_reaction;
uniform vec2 u_reactionTexel;
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

vec2 complexMultiply(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexDivide(vec2 a, vec2 b) {
  float denominator = max(dot(b, b), 0.000001);
  return vec2(
    a.x * b.x + a.y * b.y,
    a.y * b.x - a.x * b.y
  ) / denominator;
}

vec2 mobius(vec2 z, vec2 focus) {
  vec2 product = complexMultiply(vec2(focus.x, -focus.y), z);
  return complexDivide(z - focus, vec2(1.0 - product.x, -product.y));
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
  raw = min(raw * (0.66 / max(luminance, 0.1)), vec3(1.0));
  float normalizedLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = mix(vec3(normalizedLuminance), raw, 1.38);
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

vec3 sceneLavaLamp(vec2 uv, float time) {
  vec2 scale = aspectScale();
  uv = pointerFlow(uv, 0.088);
  vec2 p = (uv - 0.5) * scale;
  p = rotate2(sin(time * 0.055) * 0.045) * p;

  float potential = 0.0;
  float nearest = 10.0;
  float hueAccumulator = 0.0;

  for (int index = 0; index < 9; index++) {
    float layer = float(index);
    float speed = 0.018 + mod(layer, 3.0) * 0.005;
    float travel = fract(
      layer * 0.173
        + time * speed
        + sin(time * 0.031 + layer * 1.91) * 0.055
        + u_seed * 0.37
    );
    float direction = mod(layer, 2.0) < 1.0 ? 1.0 : -1.0;
    float y = mix(-0.76, 0.76, direction > 0.0 ? travel : 1.0 - travel);
    float x = sin(time * (0.083 + layer * 0.006) + layer * 2.13)
      * (0.16 + 0.024 * mod(layer, 4.0));
    x += sin(y * 3.1 + layer) * 0.055;
    vec2 center = vec2(x, y);
    float radius = 0.105
      + 0.024 * sin(time * 0.13 + layer * 1.37)
      + 0.010 * cos(y * 5.0 + layer);
    vec2 delta = p - center;
    float distanceSquared = dot(delta, delta) + 0.0065;
    float contribution = radius * radius / distanceSquared;
    potential += contribution;
    hueAccumulator += contribution * (0.56 + layer * 0.061);
    nearest = min(nearest, sqrt(distanceSquared));
  }

  vec2 pointer = (u_pointer - 0.5) * scale;
  vec2 pointerDelta = p - pointer;
  potential += (0.020 + u_energy * 0.044)
    / (dot(pointerDelta, pointerDelta) + 0.012);

  float pulse = pulseField(uv);
  potential += pulse * (0.66 + u_energy * 0.92);
  potential = min(potential, 9.0);

  float body = smoothstep(0.47, 1.48, potential);
  float edge = exp(-abs(potential - 1.10) * 3.8);
  float inner = 0.5 + 0.5 * sin(
    potential * 5.0
      + fbm(p * 2.8 + vec2(time * 0.022, -time * 0.029)) * 5.2
  );
  float density = sat(body * 0.75 + inner * body * 0.24 + edge * 0.36);
  float hue = hueAccumulator / max(potential, 0.001)
    + p.y * 0.095
    + time * 0.012
    + u_seed * 0.17;
  float glow = sat(edge * 0.95 + pulse * 0.82 + exp(-nearest * 7.0) * 0.30);
  return vec3(density, hue, glow);
}

vec3 sceneMorphogen(vec2 uv, float time) {
  vec2 chemical = texture(u_reaction, uv).rg;
  float v = chemical.g;
  float u = chemical.r;
  float north = texture(u_reaction, uv + vec2(0.0, u_reactionTexel.y)).g;
  float south = texture(u_reaction, uv - vec2(0.0, u_reactionTexel.y)).g;
  float east = texture(u_reaction, uv + vec2(u_reactionTexel.x, 0.0)).g;
  float west = texture(u_reaction, uv - vec2(u_reactionTexel.x, 0.0)).g;
  float gradient = length(vec2(east - west, north - south));
  float pulse = pulseField(uv);

  float cells = smoothstep(0.08, 0.54, v);
  float membrane = smoothstep(0.010, 0.095, gradient);
  float inverse = smoothstep(0.42, 0.92, u - v * 0.42);
  float density = sat(cells * 0.82 + membrane * 0.62 + inverse * 0.10 + pulse * 0.34);
  float hue = 0.44
    + v * 0.72
    + gradient * 1.8
    + sin(time * 0.045 + u_seed * 8.0) * 0.028;
  float glow = sat(membrane * 0.92 + cells * v * 0.36 + pulse * 0.78);
  return vec3(density, hue, glow);
}

vec3 sceneQuasicrystal(vec2 uv, float time) {
  vec2 scale = aspectScale();
  uv = pointerFlow(uv, -0.036);
  vec2 p = (uv - 0.5) * scale;
  vec2 pointer = (u_pointer - 0.5) * scale;
  float pointerLens = exp(-dot(p - pointer, p - pointer) * 3.8);
  p *= 1.0 + pointerLens * (0.12 + u_energy * 0.15);
  p = rotate2(time * 0.010 + sin(time * 0.07) * 0.025) * p;

  float waveA = 0.0;
  float waveB = 0.0;
  float directional = 0.0;
  for (int index = 0; index < 6; index++) {
    float angle = float(index) * PI / 6.0;
    vec2 directionA = vec2(cos(angle), sin(angle));
    vec2 directionB = vec2(cos(angle + PI / 12.0), sin(angle + PI / 12.0));
    float phaseA = dot(p, directionA) * 37.0
      + time * (0.21 + float(index) * 0.013);
    float phaseB = dot(p, directionB) * 37.0
      - time * (0.18 + float(index) * 0.011)
      + u_seed * 5.0;
    waveA += cos(phaseA);
    waveB += cos(phaseB);
    directional += sin(phaseA * 0.5 + phaseB * 0.5);
  }
  waveA /= 6.0;
  waveB /= 6.0;
  directional /= 6.0;

  float product = waveA * waveB;
  float quasipattern = 0.5 + 0.5 * (waveA * 0.55 + waveB * 0.55 + product * 0.62);
  float ridges = pow(sat(abs(product) * 1.42), 0.58);
  float stars = pow(sat(1.0 - abs(waveA - waveB)), 3.4);
  float pulse = pulseField(uv);
  float density = sat(quasipattern * 0.54 + ridges * 0.54 + stars * 0.34 + pulse * 0.45);
  float hue = atan(waveB, waveA) / TAU
    + atan(p.y, p.x) / TAU * 0.24
    + directional * 0.095
    + time * 0.014
    + u_seed * 0.11;
  float glow = sat(stars * 0.86 + ridges * 0.27 + pointerLens * u_energy * 0.32 + pulse * 0.76);
  return vec3(density, hue, glow);
}

vec3 sceneHyperbolic(vec2 uv, float time) {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= aspect;
  p /= max(aspect, 1.0) * 1.025;

  vec2 focus = (u_pointer - 0.5) * 1.12;
  focus.x *= aspect / max(aspect, 1.0);
  float focusLength = length(focus);
  if (focusLength > 0.68) focus *= 0.68 / focusLength;
  focus *= 0.34 + u_energy * 0.34;

  float originalRadius = length(p);
  vec2 transformed = mobius(p, focus);
  transformed = rotate2(time * 0.024 + u_seed * 0.6) * transformed;
  float radius = clamp(length(transformed), 0.0, 0.997);
  float angle = atan(transformed.y, transformed.x);
  float hyperbolicRadius = log((1.0 + radius) / max(1.0 - radius, 0.003));
  float conformalScale = 2.0 / max(1.0 - radius * radius, 0.018);

  float geodesicDistance = 10.0;
  for (int index = 0; index < 7; index++) {
    float familyAngle = float(index) * TAU / 7.0
      + time * (0.008 + float(index) * 0.0006);
    float centerRadius = 1.18 + 0.08 * sin(time * 0.045 + float(index) * 1.7);
    vec2 center = vec2(cos(familyAngle), sin(familyAngle)) * centerRadius;
    float circleRadius = sqrt(max(centerRadius * centerRadius - 1.0, 0.001));
    float distanceToCircle = abs(length(transformed - center) - circleRadius);
    geodesicDistance = min(geodesicDistance, distanceToCircle * conformalScale);
  }

  float geodesics = exp(-geodesicDistance * 3.8);
  float sectorSize = TAU / 7.0;
  float foldedAngle = abs(mod(angle + sectorSize * 0.5, sectorSize) - sectorSize * 0.5);
  float spokes = exp(-foldedAngle * (8.0 + hyperbolicRadius * 2.2));
  float rings = 0.5 + 0.5 * cos(hyperbolicRadius * 8.2 - time * 0.28);
  float cells = 0.5 + 0.5 * cos(
    hyperbolicRadius * 5.4
      + foldedAngle * 31.0
      + sin(angle * 7.0 - time * 0.19) * 1.1
  );
  float boundary = exp(-abs(originalRadius - 0.985) * 42.0);
  float pulse = pulseField(uv);
  float inside = 1.0 - smoothstep(0.985, 1.025, originalRadius);

  float density = sat(
    (geodesics * 0.72 + spokes * 0.22 + rings * 0.24 + cells * 0.30)
      * inside
      + boundary * 0.65
      + pulse * 0.40
  );
  float hue = angle / TAU
    + hyperbolicRadius * 0.092
    + cells * 0.16
    + time * 0.012
    + u_seed * 0.10;
  float glow = sat(geodesics * 0.82 + boundary * 0.76 + spokes * 0.24 + pulse * 0.74);
  return vec3(density, hue, glow);
}

vec3 sampleScene(int mode, vec2 uv, float time) {
  if (mode == 0) return sceneLavaLamp(uv, time);
  if (mode == 1) return sceneMorphogen(uv, time);
  if (mode == 2) return sceneQuasicrystal(uv, time);
  return sceneHyperbolic(uv, time);
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
    scene = mix(scene, incomingScene, smoothstep(0.0, 1.0, u_modeMix));
  }

  float density = sat(scene.x);
  float shimmer = (
    sin(cellId.x * 0.39 + cellId.y * 0.27 + u_time * 0.94) * 0.46
      + sin(cellId.x * 0.81 - cellId.y * 0.55 + u_time * 0.61) * 0.34
      + sin((cellId.x + cellId.y) * 0.19 + u_time * 1.41) * 0.20
  ) * smoothstep(0.06, 0.78, density);

  float characterValue = clamp(
    pow(density, 0.80) * float(u_charCount - 1) + shimmer,
    0.0,
    float(u_charCount - 1)
  );
  int characterA = int(floor(characterValue));
  int characterB = min(characterA + 1, u_charCount - 1);

  vec2 distortion = vec2(
    sin(u_time * 0.68 + cellId.y * 0.31),
    cos(u_time * 0.54 + cellId.x * 0.29)
  ) * scene.z * 0.075;
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
  glyphAlpha *= step(threshold * 0.31 + 0.13, glyphAlpha);

  vec3 lightSurface = vec3(1.000, 0.976, 0.965);
  vec3 darkSurface = vec3(0.003, 0.005, 0.015);
  vec3 surface = mix(lightSurface, darkSurface, u_theme);
  float paper = hash21(gl_FragCoord.xy * 0.37 + u_seed * 31.0) - 0.5;
  surface += paper * mix(0.007, 0.003, u_theme);

  vec3 wash = spectral(scene.y + 0.48, 0.94);
  float washPresence = scene.z * mix(0.12, 0.21, u_theme)
    + density * mix(0.028, 0.052, u_theme);
  surface = mix(surface, wash, sat(washPresence));

  vec3 ink = spectral(scene.y + density * 0.085, mix(1.20, 1.32, u_theme));
  float glyphPresence = glyphAlpha * smoothstep(0.025, 0.82, density);
  vec3 color = mix(surface, ink, glyphPresence * 0.985);
  color += ink * scene.z * glyphPresence * mix(0.17, 0.31, u_theme);

  float pulse = pulseField(v_uv);
  color += spectral(scene.y + 0.18, 1.14)
    * pulse
    * mix(0.12, 0.24, u_theme);

  float vignette = 1.0 - 0.10 * pow(length(v_uv - 0.5), 2.0);
  color *= vignette;
  color = pow(clamp(color, 0.0, 1.0), vec3(0.92));

  float reveal = revealMask(gl_FragCoord.xy);
  color = mix(surface, color, reveal);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
