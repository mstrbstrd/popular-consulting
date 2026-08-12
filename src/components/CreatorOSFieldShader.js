export const CREATOROS_FIELD_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const CREATOROS_REACTION_FRAGMENT_SHADER = `#version 300 es
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

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

vec2 vortexFlow(vec2 uv, vec2 center, float spin) {
  vec2 delta = uv - center;
  float falloff = exp(-dot(delta, delta) * 18.0);
  return vec2(-delta.y, delta.x) * falloff * spin;
}

void main() {
  float flowPhase = u_time * 0.055 + u_seed * TAU;
  vec2 vortexA = vec2(0.5) + vec2(
    cos(flowPhase),
    sin(flowPhase * 1.13)
  ) * 0.21;
  vec2 vortexB = vec2(0.5) + vec2(
    sin(-flowPhase * 0.79 + 1.7),
    cos(flowPhase * 0.91 - 0.8)
  ) * 0.27;
  vec2 flow = vortexFlow(v_uv, vortexA, 0.82)
    + vortexFlow(v_uv, vortexB, -0.68);

  vec2 pointerDeltaFlow = v_uv - u_pointer;
  float pointerFalloff = exp(-dot(pointerDeltaFlow, pointerDeltaFlow) * 22.0);
  flow += vec2(-pointerDeltaFlow.y, pointerDeltaFlow.x)
    * pointerFalloff
    * u_energy
    * 0.92;

  vec2 edge = u_texel * 2.0;
  vec2 sampleUv = clamp(
    v_uv - flow * u_texel * (2.0 + u_energy * 2.6),
    edge,
    vec2(1.0) - edge
  );

  vec4 centerState = texture(u_state, sampleUv);
  vec2 center = centerState.rg;
  vec2 north = texture(u_state, sampleUv + vec2(0.0, u_texel.y)).rg;
  vec2 south = texture(u_state, sampleUv - vec2(0.0, u_texel.y)).rg;
  vec2 east = texture(u_state, sampleUv + vec2(u_texel.x, 0.0)).rg;
  vec2 west = texture(u_state, sampleUv - vec2(u_texel.x, 0.0)).rg;
  vec2 northEast = texture(u_state, sampleUv + u_texel).rg;
  vec2 northWest = texture(
    u_state,
    sampleUv + vec2(-u_texel.x, u_texel.y)
  ).rg;
  vec2 southEast = texture(
    u_state,
    sampleUv + vec2(u_texel.x, -u_texel.y)
  ).rg;
  vec2 southWest = texture(u_state, sampleUv - u_texel).rg;

  vec2 laplacian = -center
    + (north + south + east + west) * 0.20
    + (northEast + northWest + southEast + southWest) * 0.05;

  float u = center.r;
  float v = center.g;
  float previousV = v;
  float reaction = u * v * v;
  float cycle = 0.5 + 0.5 * sin(u_time * 0.063 + u_seed * 8.0);
  float spatialCycle = sin(
    (v_uv.x * 0.82 + v_uv.y * 1.17) * TAU
      - u_time * 0.041
      + u_seed * 5.0
  );
  float feed = u_feed
    + (cycle - 0.5) * 0.0028
    + spatialCycle * 0.00034;
  float kill = u_kill
    - 0.00105
    - (cycle - 0.5) * 0.0018
    + cos(flowPhase + v_uv.x * TAU) * 0.00028;

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

  float beatPhase = fract(u_time * 0.086 + u_seed * 0.61);
  vec2 beatCenter = vec2(0.5) + vec2(
    cos(flowPhase * 0.57),
    sin(flowPhase * 0.73)
  ) * 0.12;
  vec2 beatDelta = (v_uv - beatCenter) * vec2(1.24, 1.0);
  float heartbeat = exp(
    -abs(length(beatDelta) - beatPhase * 0.72) * 76.0
  ) * sin(PI * beatPhase);

  vec2 migratingCenter = vec2(0.5) + vec2(
    sin(u_time * 0.071 + u_seed * 7.0),
    cos(u_time * 0.053 - u_seed * 5.0)
  ) * vec2(0.31, 0.24);
  vec2 migratingDelta = (v_uv - migratingCenter) * vec2(1.18, 1.0);
  float migratingSeed = exp(-dot(migratingDelta, migratingDelta) * 250.0);

  u += du * u_dt;
  v += dv * u_dt;
  v += pointerBrush * 0.040
    + pulse * 0.026
    + heartbeat * 0.0048
    + migratingSeed * 0.0054;
  u -= pointerBrush * 0.022
    + pulse * 0.014
    + heartbeat * 0.0026
    + migratingSeed * 0.0030;

  float activityTarget = sat(
    abs(v - previousV) * 34.0
      + reaction * 4.2
      + heartbeat * 0.58
      + migratingSeed * 0.72
      + pointerBrush * 0.82
      + pulse * 0.76
  );
  float activity = max(centerState.b * 0.972, activityTarget);

  fragColor = vec4(sat(u), sat(v), activity, 1.0);
}`;

export const CREATOROS_FIELD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_light;
uniform float u_intro;
uniform float u_energy;
uniform float u_seed;
uniform vec2 u_pointer;
uniform vec2 u_pulseOrigin;
uniform float u_pulseAge;
uniform int u_modeA;
uniform int u_modeB;
uniform float u_modeMix;
uniform sampler2D u_reaction;
uniform vec2 u_reactionTexel;

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
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

vec3 spectral(float h) {
  vec3 cyan = vec3(0.0, 0.933, 1.0);
  vec3 magenta = vec3(1.0, 0.0, 1.0);
  vec3 yellow = vec3(1.0, 0.933, 0.0);
  vec3 violet = vec3(0.616, 0.0, 1.0);
  h = fract(h);
  if (h < 0.25) return mix(cyan, magenta, h * 4.0);
  if (h < 0.5) return mix(magenta, yellow, (h - 0.25) * 4.0);
  if (h < 0.75) return mix(yellow, violet, (h - 0.5) * 4.0);
  return mix(violet, cyan, (h - 0.75) * 4.0);
}

vec2 aspectScale() {
  return vec2(u_res.x / max(u_res.y, 1.0), 1.0);
}

vec2 centeredUv(vec2 uv) {
  return (uv * 2.0 - 1.0) * aspectScale();
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

vec2 viscousWarp(vec2 p, float time, float strength) {
  vec2 warp = vec2(
    fbm(p * 1.7 + time * 0.05),
    fbm(p * 1.7 - time * 0.04 + 19.7)
  ) - 0.5;
  return p + warp * strength;
}

vec4 fluidMaterial(
  float field,
  vec3 tint,
  float rimStrength,
  float glowStrength,
  float alphaScale
) {
  float body = smoothstep(0.78, 1.18, field);
  float glow = smoothstep(0.22, 1.02, field);
  float core = smoothstep(1.22, 3.0, field);
  float rim = smoothstep(0.78, 0.98, field)
    * (1.0 - smoothstep(1.02, 1.62, field));

  vec3 color = tint * (0.58 + 0.62 * core);
  color += rim * rimStrength;
  color += tint * glow * glowStrength;
  color *= mix(1.0, 0.88, u_light);

  float alpha = body * mix(0.88, 0.85, u_light)
    + glow * (1.0 - body) * mix(0.22, 0.20, u_light);
  return vec4(color, sat(alpha * alphaScale));
}

vec4 sceneMetabloom(vec2 uv, float time) {
  vec2 scale = aspectScale();
  uv = pointerFlow(uv, 0.075);
  vec2 p = (uv - 0.5) * scale;
  p = viscousWarp(p, time, 0.08);
  p = rotate2(-0.08 + sin(time * 0.07) * 0.035) * p;

  float potential = 0.0;
  float nearest = 10.0;
  vec3 tintAccumulator = vec3(0.0);

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

    float bloom = clamp(u_intro * 1.50 - layer * 0.070, 0.0, 1.0);
    bloom = 1.0 - pow(1.0 - bloom, 3.0);
    center = mix(vec2(0.0, -0.82 + layer * 0.018), center, bloom);

    float radius = 0.105 + 0.025 * sin(phase * 1.7 + layer);
    radius *= 0.35 + 0.65 * bloom;
    vec2 delta = p - center;
    float distanceSquared = dot(delta, delta) + 0.007;
    float weight = radius * radius / distanceSquared;
    potential += weight;
    tintAccumulator += spectral(
      0.62 + layer * 0.137 + time * 0.012 + u_seed * 0.09
    ) * weight;
    nearest = min(nearest, sqrt(distanceSquared));
  }

  vec2 pointer = (u_pointer - 0.5) * scale;
  vec2 pointerDelta = p - pointer;
  float pointerWeight = (0.018 + u_energy * 0.035)
    / (dot(pointerDelta, pointerDelta) + 0.012);
  float pulse = pulseField(uv);
  float interaction = pointerWeight + pulse * (0.55 + u_energy * 0.85);
  potential = min(potential + interaction, 8.0);
  tintAccumulator += spectral(time * 0.017 + 0.08) * interaction;

  float membrane = 0.5 + 0.5 * sin(
    potential * 4.4
      + fbm(p * 2.35 + vec2(time * 0.035, -time * 0.026)) * 4.2
  );
  float body = smoothstep(0.36, 2.65, potential);
  float edge = exp(-abs(potential - 1.18) * 2.7);
  float density = sat(body * 0.69 + membrane * body * 0.31 + edge * 0.18);
  // A polar angle introduces a branch ray that Bayer quantization makes visible.
// Build hue from continuous Cartesian and noise fields instead.
float colorFlow = fbm(
  rotate2(0.48) * p * 1.42
    + vec2(time * 0.022, -time * 0.017)
    + vec2(u_seed * 4.1, -u_seed * 3.7)
);
float secondaryFlow = fbm(
  rotate2(-0.71) * p * 2.18
    + vec2(-time * 0.014, time * 0.019)
    + vec2(13.4, 7.9)
);
float baseHue = 0.70
  + p.x * 0.080
  + p.y * 0.135
  + (colorFlow - 0.5) * 0.26
  + (secondaryFlow - 0.5) * 0.10
  + potential * 0.040
  + membrane * 0.035
  + time * 0.018
  + u_seed * 0.13;

vec3 tint = tintAccumulator / max(potential, 0.0001);
vec3 flowTint = spectral(baseHue);
float flowDominance = 0.76 + membrane * 0.10;
tint = mix(tint, flowTint, sat(flowDominance));
  float materialField = potential * (1.12 + membrane * 0.18) + edge * 0.24;
  vec4 material = fluidMaterial(
    materialField,
    tint,
    0.38 + edge * 0.10,
    0.20 + exp(-nearest * 8.0) * 0.08,
    0.98
  );
  material.rgb += spectral(baseHue + 0.08) * edge * 0.12;
  material.a = max(material.a, density * (0.16 + membrane * 0.12));
  return material;
}

vec4 sceneTidalWeave(vec2 uv, float time) {
  uv = pointerFlow(uv, -0.060);
  vec2 p = viscousWarp(centeredUv(uv), time, 0.30);
  p = rotate2(-0.18 + 0.035 * sin(time * 0.09)) * p;

  float phaseA = p.y
    + 0.24 * sin(p.x * 2.4 + time * 0.39)
    + 0.072 * sin(p.x * 6.8 - time * 0.27);
  float phaseB = p.y
    - 0.22 * sin(p.x * 2.2 - time * 0.33 + 1.4)
    + 0.076 * sin(p.x * 6.1 + time * 0.24 + 2.1);
  float bandA = exp(-abs(sin(phaseA * PI * 2.65)) * 4.3);
  float bandB = exp(-abs(sin(phaseB * PI * 2.82)) * 4.5);
  float crossing = bandA * bandB;
  float overUnder = 0.5 + 0.5 * sin(p.x * 9.8 + time * 0.72);
  float weave = mix(
    bandA + bandB - crossing * 0.78,
    max(bandA, bandB) + crossing * 0.38,
    overUnder
  );

  float introSweep = smoothstep(-1.25, 0.95, p.y + u_intro * 2.25);
  float pointerWake = exp(-length((uv - u_pointer) * aspectScale()) * 4.6)
    * u_energy;
  float pulse = pulseField(uv);
  float field = (weave * 1.18 + crossing * 0.66 + pointerWake * 0.34 + pulse * 0.72)
    * introSweep;

  vec3 tintA = spectral(0.47 + phaseA * 0.18 + time * 0.012);
  vec3 tintB = spectral(0.84 + phaseB * 0.17 - time * 0.010);
  vec3 tint = mix(tintA, tintB, overUnder);
  tint = mix(tint, spectral(0.12 + time * 0.016), crossing * 0.44);

  return fluidMaterial(field, tint, 0.34, 0.22, 0.94);
}

vec4 sceneMoireHalo(vec2 uv, float time) {
  vec2 p = viscousWarp(centeredUv(uv), time, 0.12);
  vec2 pointer = centeredUv(u_pointer);
  vec2 centerA = pointer * 0.22 + vec2(
    sin(time * 0.17 + u_seed * 4.0),
    cos(time * 0.13 - u_seed * 3.0)
  ) * 0.11;
  vec2 centerB = -pointer * 0.16 + vec2(
    cos(time * 0.11 + 1.2),
    sin(time * 0.19 - 0.8)
  ) * 0.13;

  float radiusA = length(p - centerA);
  float radiusB = length(p - centerB);
  float noiseWarp = fbm(p * 1.85 + vec2(time * 0.025, -time * 0.018));
  float ringA = 0.5 + 0.5 * sin(radiusA * 68.0 - time * 1.15 + noiseWarp * 2.3);
  float ringB = 0.5 + 0.5 * sin(radiusB * 74.0 + time * 1.02 - noiseWarp * 2.0);
  float interference = pow(abs(ringA - ringB), 0.58);
  float convergence = pow(sat(ringA * ringB), 1.65);
  float lens = exp(-abs(radiusA - radiusB) * 8.0);
  float spokes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 9.0 + time * 0.31);
  float pulse = pulseField(uv);
  float bloom = smoothstep(0.0, 0.72, u_intro);

  float field = (
    0.22
      + interference * 0.92
      + convergence * 0.74
      + lens * 0.58
      + spokes * exp(-length(p) * 0.62) * 0.20
      + pulse * 0.72
  ) * bloom;
  float hue = atan(p.y, p.x) / TAU
    + (radiusA - radiusB) * 0.46
    + interference * 0.16
    + time * 0.014
    + u_seed * 0.11;
  vec3 tint = spectral(hue);

  return fluidMaterial(field, tint, 0.28, 0.24, 0.78);
}

vec4 sceneContourDrift(vec2 uv, float time) {
  uv = pointerFlow(uv, 0.032);
  vec2 p = viscousWarp(centeredUv(uv), time, 0.24);
  vec2 drift = vec2(time * 0.027, -time * 0.021);
  float terrain = fbm(p * 1.48 + drift + vec2(u_seed * 3.1));
  terrain += fbm(rotate2(0.72) * p * 3.25 - drift * 1.7 + vec2(11.0)) * 0.31;
  terrain /= 1.31;

  vec2 pointerDelta = (uv - u_pointer) * aspectScale();
  float pointerLift = exp(-dot(pointerDelta, pointerDelta) * 7.0)
    * (0.12 + u_energy * 0.33);
  float pulse = pulseField(uv);
  terrain = sat(terrain + pointerLift - pulse * 0.14);

  float levels = terrain * 10.5;
  float contourDistance = abs(fract(levels) - 0.5);
  float contour = 1.0 - smoothstep(0.055, 0.19, contourDistance);
  float secondary = 1.0 - smoothstep(
    0.028,
    0.105,
    abs(fract(levels * 0.5 + 0.25) - 0.5)
  );
  float land = smoothstep(0.24, 0.78, terrain);
  float basin = 1.0 - smoothstep(0.34, 0.62, terrain);
  float bloom = smoothstep(0.02, 0.88, u_intro);
  float field = (
    contour * 1.18
      + secondary * 0.34
      + land * 0.38
      + basin * 0.12
      + pulse * 0.58
  ) * bloom;
  vec3 tint = spectral(
    0.08 + terrain * 0.88 + p.x * 0.035 + time * 0.010 + u_seed * 0.14
  );

  return fluidMaterial(field, tint, 0.24, 0.18, 0.84);
}

vec4 sceneMorphogen(vec2 uv, float time) {
  vec4 chemical = texture(u_reaction, uv);
  float v = chemical.g;
  float u = chemical.r;
  float activity = chemical.b;
  float north = texture(u_reaction, uv + vec2(0.0, u_reactionTexel.y)).g;
  float south = texture(u_reaction, uv - vec2(0.0, u_reactionTexel.y)).g;
  float east = texture(u_reaction, uv + vec2(u_reactionTexel.x, 0.0)).g;
  float west = texture(u_reaction, uv - vec2(u_reactionTexel.x, 0.0)).g;
  vec2 gradientVector = vec2(east - west, north - south);
  float gradient = length(gradientVector);
  float curvature = abs(north + south + east + west - 4.0 * v);
  float pulse = pulseField(uv);

  float cells = smoothstep(0.055, 0.52, v);
  float membrane = smoothstep(0.006, 0.078, gradient);
  float cleavage = smoothstep(0.010, 0.095, curvature)
    * smoothstep(0.10, 0.58, v);
  float interior = smoothstep(0.12, 0.60, v)
    * (1.0 - smoothstep(0.68, 0.94, v));
  float transport = 0.5 + 0.5 * sin(
    time * 0.62
      + activity * 5.0
      + v * 10.0
      + atan(gradientVector.y, gradientVector.x) * 1.6
  );
  float field = (
    cells * 0.78
      + membrane * 1.18
      + cleavage * 0.82
      + interior * 0.24
      + activity * (0.58 + transport * 0.28)
      + pulse * 0.58
  ) * smoothstep(0.0, 0.72, u_intro);

  float edgeAngle = atan(gradientVector.y, gradientVector.x) / TAU;
  vec3 interiorTint = spectral(0.56 + v * 0.58 + time * 0.011);
  vec3 edgeTint = spectral(
    0.82 + edgeAngle + time * 0.020 + activity * 0.16
  );
  vec3 activityTint = spectral(0.08 + activity * 0.56 - time * 0.014);
  vec3 tint = mix(
    interiorTint,
    edgeTint,
    sat(membrane * 0.82 + cleavage * 0.72)
  );
  tint = mix(tint, activityTint, activity * 0.42);

  vec4 material = fluidMaterial(field, tint, 0.34, 0.26, 0.91);
  material.rgb += edgeTint * (membrane * 0.12 + activity * 0.08);
  material.a = max(
    material.a,
    (membrane * 0.48 + cleavage * 0.34 + activity * 0.28)
      * smoothstep(0.0, 0.72, u_intro)
  );
  material.a *= 0.76 + membrane * 0.18 + activity * 0.10;
  return material;
}

vec4 sceneQuasicrystal(vec2 uv, float time) {
  uv = pointerFlow(uv, -0.038);
  vec2 p = viscousWarp(centeredUv(uv), time, 0.14);
  vec2 pointer = centeredUv(u_pointer);
  float pointerLens = exp(-dot(p - pointer, p - pointer) * 2.8);
  p *= 1.0 + pointerLens * (0.12 + u_energy * 0.15);
  p = rotate2(time * 0.010 + sin(time * 0.07) * 0.025) * p;

  float waveA = 0.0;
  float waveB = 0.0;
  float directional = 0.0;
  for (int index = 0; index < 6; index++) {
    float angle = float(index) * PI / 6.0;
    vec2 directionA = vec2(cos(angle), sin(angle));
    vec2 directionB = vec2(cos(angle + PI / 12.0), sin(angle + PI / 12.0));
    float phaseA = dot(p, directionA) * 24.0
      + time * (0.21 + float(index) * 0.013);
    float phaseB = dot(p, directionB) * 24.0
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
  float field = (
    quasipattern * 0.62
      + ridges * 0.84
      + stars * 0.56
      + pulse * 0.64
  ) * smoothstep(0.0, 0.72, u_intro);
  vec3 tint = spectral(
    atan(waveB, waveA) / TAU
      + atan(p.y, p.x) / TAU * 0.24
      + directional * 0.095
      + time * 0.014
      + u_seed * 0.11
  );

  return fluidMaterial(field, tint, 0.28, 0.22, 0.80);
}

vec4 sceneHyperbolic(vec2 uv, float time) {
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
  transformed = viscousWarp(transformed, time, 0.045);
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
  float field = (
    (geodesics * 1.06 + spokes * 0.34 + rings * 0.30 + cells * 0.42)
      * inside
      + boundary * 0.92
      + pulse * 0.58
  ) * smoothstep(0.0, 0.72, u_intro);
  vec3 tint = spectral(
    angle / TAU
      + hyperbolicRadius * 0.092
      + cells * 0.16
      + time * 0.012
      + u_seed * 0.10
  );
  vec4 material = fluidMaterial(field, tint, 0.30, 0.20, 0.84);
  material.a *= inside + boundary * 0.74;
  return material;
}

vec4 sceneForwardPass(vec2 uv, float time) {
  float aspect = u_res.x / max(u_res.y, 1.0);
  float intro = smoothstep(0.0, 0.88, u_intro);
  float pulse = pulseField(uv);
  float gateBias = (u_pointer.y - 0.5) * 1.8
    + (u_pointer.x - 0.5) * 0.6;
  float field = 0.0;
  float tintWeight = 0.0;
  vec3 tintAccumulator = vec3(0.0);

  // Horizontal lanes are token positions. Causal attention can pull
  // from the same or an earlier lane, while the FFN expands each
  // token independently before it rejoins the residual stream.
  for (int token = 0; token < 5; token++) {
    float tokenIndex = float(token);
    float laneY = 0.18 + tokenIndex * 0.16;
    float tokenHue = 0.48 + tokenIndex * 0.105 + time * 0.008;
    float packet = pow(
      0.5 + 0.5 * cos(
        (uv.x * 6.0 - time * 0.16 - tokenIndex * 0.17) * TAU
      ),
      14.0
    );
    float residualStream = exp(-abs(uv.y - laneY) * 190.0)
      * (0.20 + packet * 0.62);
    vec3 streamTint = spectral(tokenHue);
    field += residualStream;
    tintAccumulator += streamTint * residualStream;
    tintWeight += residualStream;

    for (int layer = 0; layer < 4; layer++) {
      float layerIndex = float(layer);
      float blockStart = 0.055 + layerIndex * 0.235;
      float blockWidth = 0.205;
      float local = (uv.x - blockStart) / blockWidth;
      float blockMask = smoothstep(0.0, 0.045, local)
        * (1.0 - smoothstep(0.955, 1.0, local));
      float layerReveal = smoothstep(
        layerIndex * 0.16,
        layerIndex * 0.16 + 0.36,
        u_intro
      );
      float direction = mod(tokenIndex + layerIndex, 2.0) < 1.0
        ? 1.0
        : -1.0;

      float residualCurve = laneY
        + direction
          * sin(PI * sat(local))
          * (0.026 + 0.008 * sin(time * 0.11 + tokenIndex));
      float residualBypass = exp(
        -abs(uv.y - residualCurve) * 210.0
      ) * blockMask * layerReveal * (0.28 + packet * 0.36);
      vec3 residualTint = spectral(
        tokenHue + layerIndex * 0.045 + 0.12
      );
      field += residualBypass;
      tintAccumulator += residualTint * residualBypass;
      tintWeight += residualBypass;

      float causalLookback = 1.0 + mod(layerIndex, 2.0);
      float sourceIndex = max(tokenIndex - causalLookback, 0.0);
      float sourceY = 0.18 + sourceIndex * 0.16;
      float attentionProgress = sat((local - 0.045) / 0.26);
      float attentionWindow = smoothstep(0.02, 0.075, local)
        * (1.0 - smoothstep(0.285, 0.34, local))
        * layerReveal;
      float attentionY = mix(sourceY, laneY, attentionProgress)
        + direction * sin(attentionProgress * PI) * 0.018;
      float contextPulse = pow(
        0.5 + 0.5 * cos(
          (local * 2.4
            - time * 0.20
            - tokenIndex * 0.17
            - layerIndex * 0.09) * TAU
        ),
        10.0
      );
      float attentionMix = exp(-abs(uv.y - attentionY) * 165.0)
        * attentionWindow
        * (0.30 + contextPulse * 0.80);
      vec3 attentionTint = spectral(
        tokenHue + sourceIndex * 0.055 + layerIndex * 0.03
      );
      field += attentionMix;
      tintAccumulator += attentionTint * attentionMix;
      tintWeight += attentionMix;

      float ffnProgress = sat((local - 0.34) / 0.52);
      float ffnWindow = smoothstep(0.31, 0.37, local)
        * (1.0 - smoothstep(0.86, 0.92, local))
        * layerReveal;
      float hiddenExpansion = sin(ffnProgress * PI)
        * (0.052
          + 0.010 * sin(
            time * 0.13 + tokenIndex * 1.7 + layerIndex
          ));
      float projectionFunnel = smoothstep(0.62, 1.0, ffnProgress);
      float laneBias = exp(-abs(u_pointer.y - laneY) * 8.0)
        * u_energy;

      for (int hidden = 0; hidden < 4; hidden++) {
        float hiddenIndex = float(hidden);
        float hiddenOffset = (hiddenIndex - 1.5) / 1.5;
        float hiddenY = laneY + hiddenOffset * hiddenExpansion;
        float valueProjection = 0.5 + 0.5 * sin(
          time * 0.33
            + tokenIndex * 1.31
            + layerIndex * 0.77
            + hiddenIndex * 1.91
            + local * 8.0
        );
        float gateProjection = sat(
          (0.5 + 0.5 * cos(
            time * 0.29
              - tokenIndex * 0.83
              + layerIndex * 1.17
              + hiddenIndex * 2.23
              + gateBias
          )) * 0.84
            + laneBias * 0.52
        );
        float swigluGate = gateProjection
          / (1.0 + exp(-(gateProjection * 7.0 - 3.5)));
        float gatedActivation = sat(
          valueProjection * swigluGate * 2.15
        );
        float hiddenLine = exp(-abs(uv.y - hiddenY) * 190.0)
          * ffnWindow
          * (0.18 + gatedActivation * 1.18)
          * (0.82 + projectionFunnel * 0.24);
        vec3 hiddenTint = spectral(
          tokenHue
            + layerIndex * 0.035
            + hiddenIndex * 0.055
            + gatedActivation * 0.08
        );
        field += hiddenLine;
        tintAccumulator += hiddenTint * hiddenLine;
        tintWeight += hiddenLine;
      }

      float entryNorm = exp(
        -abs(uv.x - blockStart) * aspect * 145.0
      ) * exp(-abs(uv.y - laneY) * 68.0) * layerReveal;
      float ffnNorm = exp(
        -abs(uv.x - (blockStart + blockWidth * 0.33))
          * aspect
          * 160.0
      ) * exp(-abs(uv.y - laneY) * 72.0) * layerReveal;
      float mergeNode = exp(
        -abs(uv.x - (blockStart + blockWidth * 0.92))
          * aspect
          * 165.0
      ) * exp(-abs(uv.y - laneY) * 82.0) * layerReveal;
      float structure = entryNorm * 0.34
        + ffnNorm * 0.40
        + mergeNode * (0.46 + projectionFunnel * 0.38);
      vec3 structureTint = spectral(
        tokenHue + layerIndex * 0.06 + 0.20
      );
      field += structure;
      tintAccumulator += structureTint * structure;
      tintWeight += structure;
    }
  }

  float promptEnvelope = 1.0 - smoothstep(2.8, 5.6, u_pulseAge);
  float promptX = u_pulseOrigin.x + u_pulseAge * 0.13;
  float promptFront = exp(
    -abs(uv.x - promptX) * aspect * 88.0
  ) * exp(-abs(uv.y - u_pulseOrigin.y) * 11.0) * promptEnvelope;
  float promptSignal = promptFront * 1.45 + pulse * 0.32;
  vec3 promptTint = spectral(
    0.08 + u_pulseOrigin.y * 0.48 + time * 0.015
  );
  field += promptSignal;
  tintAccumulator += promptTint * promptSignal;
  tintWeight += promptSignal;

  field *= intro;
  vec3 tint = tintAccumulator / max(tintWeight, 0.0001);
  tint = mix(
    tint,
    promptTint,
    sat(promptFront * 0.78 + pulse * 0.24)
  );
  vec4 material = fluidMaterial(field, tint, 0.26, 0.22, 0.88);
  material.a = max(material.a, sat((field - 0.12) * 0.22));
  return material;
}
vec4 sampleScene(int mode, vec2 uv, float time) {
  if (mode == 0) return sceneMetabloom(uv, time);
  if (mode == 1) return sceneTidalWeave(uv, time);
  if (mode == 2) return sceneMoireHalo(uv, time);
  if (mode == 3) return sceneContourDrift(uv, time);
  if (mode == 4) return sceneMorphogen(uv, time);
  if (mode == 5) return sceneQuasicrystal(uv, time);
  if (mode == 6) return sceneHyperbolic(uv, time);
  return sceneForwardPass(uv, time);
}

void main() {
  vec4 colorSample = sampleScene(u_modeA, v_uv, u_time);
  if (u_modeA != u_modeB && u_modeMix > 0.001) {
    vec4 incomingSample = sampleScene(u_modeB, v_uv, u_time);
    colorSample = mix(
      colorSample,
      incomingSample,
      smoothstep(0.0, 1.0, u_modeMix)
    );
  }

  float levels = mix(5.0, 7.0, u_light);
  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  vec3 color = clamp(colorSample.rgb + dither / levels, 0.0, 1.0);
  color = floor(color * levels + 0.5) / levels;
  float alpha = clamp(colorSample.a + dither / levels, 0.0, 1.0);
  alpha = floor(alpha * levels + 0.5) / levels;

  fragColor = vec4(color * alpha, alpha);
}`;