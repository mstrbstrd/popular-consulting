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
uniform float u_contourPaletteMix;
uniform float u_tidalPaletteMix;
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

vec3 tidalWaterPalette(float h) {
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

  vec3 spectralTintA = spectral(0.47 + phaseA * 0.18 + time * 0.012);
  vec3 spectralTintB = spectral(0.84 + phaseB * 0.17 - time * 0.010);
  vec3 spectralTint = mix(spectralTintA, spectralTintB, overUnder);
  spectralTint = mix(
    spectralTint,
    spectral(0.12 + time * 0.016),
    crossing * 0.44
  );

  // Keep every visible caustic pale, even over the dark water surface.
// The tropical depth now lives beneath the transparent field rather than
// darkening the reflected-light lines themselves.
float causticSignal = sat(max(bandA, bandB));
float crossingCrystal = pow(sat(crossing), 0.72);
vec3 causticGray = mix(
  vec3(1.280, 1.320, 1.300),
  vec3(1.340, 1.370, 1.350),
  u_light
);
vec3 refractedLight = mix(
  vec3(1.480, 1.540, 1.510),
  vec3(1.550, 1.590, 1.570),
  u_light
);
float causticLift = sat(
  0.10
    + causticSignal * 0.38
    + crossingCrystal * 0.34
    + pointerWake * 0.08
    + pulse * 0.10
);
vec3 waterTint = mix(causticGray, refractedLight, causticLift);

// Keep a continuous spectral gradient on both edges of every caustic.
// The previous 0.30 iso-line lived mostly in the transparent glow, so it
// became visible chiefly where two bands crossed. This contour sits just
// inside the visible line body and is calculated independently per band.
float outlineLevel = 0.72;
float outlineWidthA = max(fwidth(bandA) * 0.72, 0.010);
float outlineWidthB = max(fwidth(bandB) * 0.72, 0.010);
float outlineA = 1.0 - smoothstep(
  outlineWidthA,
  outlineWidthA * 1.90,
  abs(bandA - outlineLevel)
);
float outlineB = 1.0 - smoothstep(
  outlineWidthB,
  outlineWidthB * 1.90,
  abs(bandB - outlineLevel)
);

// Give each ribbon its own travelling hue so the border remains a true
// gradient along the full line instead of borrowing color from crossings.
vec3 outlineSpectralA = spectral(
  0.47
    + phaseA * 0.18
    + p.x * 0.120
    + time * 0.012
);
vec3 outlineSpectralB = spectral(
  0.84
    + phaseB * 0.17
    - p.x * 0.120
    - time * 0.010
);
float outlineChroma = mix(0.48, 0.42, u_light);
float outlineFloor = mix(0.70, 0.78, u_light);
vec3 outlineTintA = max(
  mix(vec3(0.96), outlineSpectralA, outlineChroma),
  vec3(outlineFloor)
);
vec3 outlineTintB = max(
  mix(vec3(0.96), outlineSpectralB, outlineChroma),
  vec3(outlineFloor)
);
float outlineWeight = outlineA + outlineB;
vec3 spectralOutlineTint = (
  outlineTintA * outlineA
    + outlineTintB * outlineB
) / max(outlineWeight, 0.0001);

// Two pale spectral edges should combine like refracted light, not
// like stacked pigment. Lift only their overlap onto the existing
// crystal-light value while retaining a subtle spectral separation.
float outlineOverlap = smoothstep(
  0.08,
  0.46,
  outlineA * outlineB
);
float outlineLuma = dot(
  spectralOutlineTint,
  vec3(0.2126, 0.7152, 0.0722)
);
vec3 intersectionSpectralTint = refractedLight
  + (spectralOutlineTint - vec3(outlineLuma)) * 0.24;
intersectionSpectralTint = max(
  intersectionSpectralTint,
  refractedLight * 0.96
);
spectralOutlineTint = mix(
  spectralOutlineTint,
  intersectionSpectralTint,
  outlineOverlap
);

float spectralOutline = sat(max(outlineA, outlineB));
float spectralOutlineStrength = mix(0.92, 0.90, u_light);
waterTint = mix(
  waterTint,
  spectralOutlineTint,
  spectralOutline * spectralOutlineStrength
);

vec3 tint = mix(
  waterTint,
  spectralTint,
  sat(u_tidalPaletteMix)
);
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
  terrain += fbm(
    rotate2(0.72) * p * 3.25 - drift * 1.7 + vec2(11.0)
  ) * 0.31;
  terrain /= 1.31;

  vec2 pointerDelta = (uv - u_pointer) * aspectScale();
  float pointerLift = exp(-dot(pointerDelta, pointerDelta) * 7.0)
    * (0.12 + u_energy * 0.33);
  float pulse = pulseField(uv);
  terrain = sat(terrain + pointerLift - pulse * 0.14);

  // Preserve the original spectral field exactly for the alternate
  // palette while the default terrain map gains functional contour logic.
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
  float spectralField = contour * 1.18
    + secondary * 0.34
    + land * 0.38
    + basin * 0.12
    + pulse * 0.58;

  // Eighteen minor intervals with every fifth interval indexed creates
  // the hierarchy expected from a functional elevation map.
  float contourCoordinate = terrain * 18.0;
  float minorDistance = abs(
    fract(contourCoordinate + 0.5) - 0.5
  );
  float indexDistance = abs(
    fract(contourCoordinate / 5.0 + 0.5) - 0.5
  );
  float minorAA = clamp(fwidth(contourCoordinate), 0.012, 0.070);
  float indexAA = clamp(
    fwidth(contourCoordinate / 5.0),
    0.003,
    0.020
  );
  float minorCore = 1.0 - smoothstep(
    minorAA * 0.35,
    minorAA * 0.92,
    minorDistance
  );
  float minorEnvelope = 1.0 - smoothstep(
    minorAA * 0.35,
    minorAA * 1.85,
    minorDistance
  );
  float indexCore = 1.0 - smoothstep(
    indexAA * 0.28,
    indexAA * 1.20,
    indexDistance
  );
  float indexEnvelope = 1.0 - smoothstep(
    indexAA * 0.28,
    indexAA * 2.35,
    indexDistance
  );
  float minorEdge = sat(minorEnvelope - minorCore);
  float indexEdge = sat(indexEnvelope - indexCore);
  float contourCore = max(minorCore * 0.76, indexCore);
  float contourEnvelope = max(minorEnvelope * 0.74, indexEnvelope);
  float contourEdge = max(minorEdge * 0.74, indexEdge);

  float terrainSurface = 0.68 + land * 0.18 + basin * 0.08;
  float terrainField = terrainSurface
    + contourEnvelope * 0.92
    + indexCore * 0.28
    + pulse * 0.58;
  float paletteMix = sat(u_contourPaletteMix);
  float bloom = smoothstep(0.02, 0.88, u_intro);
  float field = mix(terrainField, spectralField, paletteMix) * bloom;

  vec3 spectralTint = spectral(
    0.08
      + terrain * 0.88
      + p.x * 0.035
      + time * 0.010
      + u_seed * 0.14
  );

  // Discrete hypsometric elevation bands make the terrain readable as
  // a map rather than a continuous painterly color field.
  float elevationBand = floor(sat(terrain) * 8.999) / 8.0;
  float mappedElevation = mix(terrain, elevationBand, 0.78);
  vec3 basinTone = mix(
    vec3(0.028, 0.118, 0.145),
    vec3(0.620, 0.790, 0.810),
    u_light
  );
  vec3 lowlandTone = mix(
    vec3(0.105, 0.285, 0.190),
    vec3(0.520, 0.710, 0.480),
    u_light
  );
  vec3 uplandTone = mix(
    vec3(0.300, 0.370, 0.185),
    vec3(0.730, 0.720, 0.420),
    u_light
  );
  vec3 ridgeTone = mix(
    vec3(0.470, 0.350, 0.245),
    vec3(0.780, 0.610, 0.410),
    u_light
  );
  vec3 summitTone = mix(
    vec3(0.830, 0.830, 0.780),
    vec3(0.970, 0.955, 0.900),
    u_light
  );
  vec3 terrainTint = mix(
    basinTone,
    lowlandTone,
    smoothstep(0.16, 0.30, mappedElevation)
  );
  terrainTint = mix(
    terrainTint,
    uplandTone,
    smoothstep(0.34, 0.50, mappedElevation)
  );
  terrainTint = mix(
    terrainTint,
    ridgeTone,
    smoothstep(0.55, 0.72, mappedElevation)
  );
  terrainTint = mix(
    terrainTint,
    summitTone,
    smoothstep(0.76, 0.92, mappedElevation)
  );

  // Screen-space slope supplies a restrained hillshade. Quantizing part
  // of the light response gives the relief a cartographic 3D read.
  vec2 terrainSlope = vec2(dFdx(terrain), dFdy(terrain));
  vec3 terrainNormal = normalize(vec3(
    -terrainSlope.x * 24.0,
    -terrainSlope.y * 24.0,
    1.0
  ));
  vec3 reliefLight = normalize(vec3(-0.58, 0.48, 0.66));
  float hillshade = 0.5 + 0.5 * dot(terrainNormal, reliefLight);
  float reliefValue = smoothstep(0.05, 0.98, hillshade);
  float steppedRelief = floor(reliefValue * 5.999) / 5.0;
  reliefValue = mix(reliefValue, steppedRelief, 0.34);
  float slopeShade = smoothstep(
    0.012,
    0.070,
    length(terrainSlope)
  );
  terrainTint *= mix(0.70, 1.18, reliefValue);
  terrainTint *= mix(1.0, 0.90, slopeShade * 0.46);
  terrainTint += summitTone * pow(reliefValue, 5.0) * 0.045;

  // Match Tidal Weave's successful line language: a bright pale core
  // with a continuous, extremely thin spectral gradient on both edges.
  vec3 contourCoreTint = mix(
    vec3(1.160, 1.180, 1.140),
    vec3(1.240, 1.220, 1.160),
    u_light
  );
  vec3 lineCoreTint = mix(
    contourCoreTint,
    contourCoreTint * 1.06,
    indexCore
  );
  vec3 contourSpectrum = spectral(
    0.60
      + terrain * 0.34
      + p.x * 0.055
      - p.y * 0.035
      + time * 0.006
      + u_seed * 0.10
  );
  float contourChroma = mix(0.22, 0.16, u_light);
  vec3 spectralContourEdge = mix(
    contourCoreTint,
    contourSpectrum,
    contourChroma
  );
  spectralContourEdge = max(
    spectralContourEdge,
    contourCoreTint * 0.74
  );
  terrainTint = mix(
    terrainTint,
    spectralContourEdge,
    contourEdge * 0.92
  );
  terrainTint = mix(
    terrainTint,
    lineCoreTint,
    contourCore
  );

  float terrainPaletteWeight = 1.0 - paletteMix;
  vec3 tint = mix(terrainTint, spectralTint, paletteMix);
  vec4 material = fluidMaterial(field, tint, 0.24, 0.18, 0.84);
  material.rgb = mix(
    material.rgb,
    max(material.rgb, spectralContourEdge * 0.92),
    terrainPaletteWeight * contourEdge * 0.72
  );
  material.rgb = mix(
    material.rgb,
    max(material.rgb, lineCoreTint * 0.96),
    terrainPaletteWeight * contourCore * 0.88
  );
  material.a = max(
    material.a,
    terrainPaletteWeight
      * bloom
      * (0.34 + contourEnvelope * 0.38)
  );
  return material;
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
  vec2 scale = aspectScale();
  vec2 responsiveUv = pointerFlow(uv, 0.038);
  vec2 warpedPosition = viscousWarp(
    centeredUv(responsiveUv),
    time,
    0.085
  );
  vec2 fieldUv = warpedPosition / scale * 0.5 + 0.5;
  float intro = smoothstep(0.0, 0.88, u_intro);
  float pulse = pulseField(uv);
  float gateBias = (u_pointer.y - 0.5) * 1.8
    + (u_pointer.x - 0.5) * 0.6;
  float passPhase = fract(time * 0.048 + u_seed * 0.19);
  float passX = mix(-0.10, 1.10, passPhase);
  float passFront = exp(
    -abs(fieldUv.x - passX) * aspect * 38.0
  );
  float passWake = smoothstep(
    passX - 0.18,
    passX - 0.035,
    fieldUv.x
  ) * (1.0 - smoothstep(
    passX + 0.015,
    passX + 0.105,
    fieldUv.x
  ));
  float field = 0.0;
  float tintWeight = 0.0;
  float activationEcho = 0.0;
  vec3 tintAccumulator = vec3(0.0);

  // Subtle rails establish four repeated transformer chambers while
  // preserving the site's fluid, non-diagrammatic material language.
  float architectureField = 0.0;
  float architectureWeight = 0.0;
  vec3 architectureTint = vec3(0.0);
  float architectureWindow = smoothstep(0.09, 0.15, fieldUv.y)
    * (1.0 - smoothstep(0.84, 0.91, fieldUv.y));
  float laneComb = pow(
    0.5 + 0.5 * cos((fieldUv.y - 0.18) / 0.16 * TAU),
    18.0
  );

  for (int layer = 0; layer < 4; layer++) {
    float layerIndex = float(layer);
    float blockStart = 0.055 + layerIndex * 0.235;
    float blockWidth = 0.205;
    float layerReveal = smoothstep(
      layerIndex * 0.16,
      layerIndex * 0.16 + 0.36,
      u_intro
    );
    float inputRail = exp(
      -abs(fieldUv.x - blockStart) * aspect * 190.0
    );
    float attentionRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.30))
        * aspect
        * 170.0
    );
    float gateRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.60))
        * aspect
        * 180.0
    );
    float mergeRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.92))
        * aspect
        * 200.0
    );
    float stageRails = (
      inputRail * 0.10
        + attentionRail * 0.16
        + gateRail * 0.20
        + mergeRail * 0.26
    ) * architectureWindow
      * (0.22 + laneComb * 0.78)
      * (0.60 + passFront * 0.72 + passWake * 0.20)
      * layerReveal;
    vec3 railTint = spectral(0.78 + layerIndex * 0.055);
    railTint = mix(
      railTint,
      spectral(0.23 + layerIndex * 0.028),
      attentionRail * 0.48
    );
    railTint = mix(
      railTint,
      spectral(0.43 + layerIndex * 0.018),
      gateRail * 0.54
    );
    railTint = mix(railTint, vec3(1.0), mergeRail * 0.24);
    architectureField += stageRails;
    architectureTint += railTint * stageRails;
    architectureWeight += stageRails;
  }

  field += architectureField;
  tintAccumulator += architectureTint;
  tintWeight += architectureWeight;

  for (int token = 0; token < 5; token++) {
    float tokenIndex = float(token);
    float laneY = 0.18 + tokenIndex * 0.16;
    laneY += sin(
      fieldUv.x * TAU * 0.72
        + time * 0.11
        + tokenIndex * 1.33
    ) * 0.006;
    float tokenHue = 0.69 + tokenIndex * 0.074 + time * 0.008;
    float carrierX = passX - tokenIndex * 0.010;
    float carrierDelta = (fieldUv.x - carrierX) * aspect;
    float tokenCarrier = exp(
      -carrierDelta * carrierDelta * 980.0
    );
    float packetTrain = pow(
      0.5 + 0.5 * cos(
        (fieldUv.x * 5.8 - time * 0.16 - tokenIndex * 0.17) * TAU
      ),
      16.0
    );
    float packet = sat(packetTrain * 0.55 + tokenCarrier * 1.35);
    float streamDistance = abs(fieldUv.y - laneY);
    float streamCore = exp(-streamDistance * 145.0);
    float streamGlow = exp(-streamDistance * 30.0) * 0.095;
    float carrierHalo = exp(-streamDistance * 44.0)
      * tokenCarrier
      * 0.30;
    float residualStream = streamCore * (0.16 + packet * 0.84)
      + streamGlow
      + carrierHalo;
    vec3 streamTint = spectral(tokenHue);
    field += residualStream;
    tintAccumulator += streamTint * residualStream;
    tintWeight += residualStream;

    for (int layer = 0; layer < 4; layer++) {
      float layerIndex = float(layer);
      float blockStart = 0.055 + layerIndex * 0.235;
      float blockWidth = 0.205;
      float local = (fieldUv.x - blockStart) / blockWidth;
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
      float stageFront = exp(
        -abs(fieldUv.x - passX) * aspect * 22.0
      ) * blockMask;
      float stageWake = passWake * blockMask;
      float stageActivation = sat(
        stageFront * 0.92 + stageWake * 0.34
      );

      float residualCurve = laneY
        + direction
          * sin(PI * sat(local))
          * (0.030 + 0.008 * sin(time * 0.11 + tokenIndex))
        + sin(
          local * TAU * 1.35
            + time * 0.15
            + tokenIndex * 0.9
        ) * 0.004;
      float residualDistance = abs(fieldUv.y - residualCurve);
      float residualCore = exp(-residualDistance * 180.0);
      float residualGlow = exp(-residualDistance * 36.0) * 0.12;
      float residualBypass = (
        residualCore * (0.26 + packet * 0.38)
          + residualGlow
      ) * blockMask * layerReveal;
      vec3 residualTint = spectral(
        tokenHue + layerIndex * 0.045 + 0.10
      );
      field += residualBypass;
      tintAccumulator += residualTint * residualBypass;
      tintWeight += residualBypass;

      float causalLookback = 1.0 + mod(layerIndex, 2.0);
      float sourceIndex = max(tokenIndex - causalLookback, 0.0);
      float sourceY = 0.18 + sourceIndex * 0.16;
      sourceY += sin(
        fieldUv.x * TAU * 0.72
          + time * 0.11
          + sourceIndex * 1.33
      ) * 0.006;
      float attentionProgress = sat((local - 0.045) / 0.26);
      float attentionWindow = smoothstep(0.02, 0.075, local)
        * (1.0 - smoothstep(0.285, 0.34, local))
        * layerReveal;
      float attentionY = mix(sourceY, laneY, attentionProgress)
        + direction * sin(attentionProgress * PI) * 0.022;
      float contextWave = pow(
        0.5 + 0.5 * cos(
          (local * 2.4
            - time * 0.20
            - tokenIndex * 0.17
            - layerIndex * 0.09) * TAU
        ),
        10.0
      );
      float contextPulse = sat(
        contextWave * 0.56 + stageActivation * 0.92
      );
      float attentionDistance = abs(fieldUv.y - attentionY);
      float attentionCore = exp(-attentionDistance * 150.0);
      float attentionGlow = exp(-attentionDistance * 34.0) * 0.11;
      float attentionMix = (
        attentionCore * (0.12 + contextPulse * 1.02)
          + attentionGlow * (0.64 + stageActivation * 0.78)
      ) * attentionWindow;
      vec3 attentionTint = mix(
        spectral(
          tokenHue + sourceIndex * 0.035 + layerIndex * 0.03 + 0.05
        ),
        spectral(
          0.23 + layerIndex * 0.028 + sourceIndex * 0.012
        ),
        0.54
      );
      field += attentionMix;
      tintAccumulator += attentionTint * attentionMix;
      tintWeight += attentionMix;

      float ffnProgress = sat((local - 0.34) / 0.52);
      float ffnWindow = smoothstep(0.31, 0.37, local)
        * (1.0 - smoothstep(0.86, 0.92, local))
        * layerReveal;
      float hiddenExpansion = sin(ffnProgress * PI)
        * (0.070
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
        hiddenY += sin(
          local * TAU
            + time * 0.17
            + hiddenIndex * 1.6
            + tokenIndex
        ) * 0.003;
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
          valueProjection * swigluGate * 2.0
            + stageActivation * 0.18
        );
        float gateSeparation = (
          1.0 - smoothstep(0.18, 0.58, ffnProgress)
        ) * (0.0065 + abs(hiddenOffset) * 0.0020);
        float valueY = hiddenY - gateSeparation;
        float gateY = hiddenY + gateSeparation;
        float splitEnvelope = smoothstep(0.02, 0.10, ffnProgress)
          * (1.0 - smoothstep(0.48, 0.68, ffnProgress))
          * ffnWindow;
        float valueBranch = exp(
          -abs(fieldUv.y - valueY) * 205.0
        ) * splitEnvelope * (0.05 + valueProjection * 0.28);
        float gateBranch = exp(
          -abs(fieldUv.y - gateY) * 205.0
        ) * splitEnvelope * (0.05 + gateProjection * 0.34);
        float gateSplit = valueBranch + gateBranch;
        float hiddenDistance = abs(fieldUv.y - hiddenY);
        float hiddenCore = exp(-hiddenDistance * 165.0);
        float hiddenGlow = exp(-hiddenDistance * 34.0) * 0.085;
        float hiddenLine = (
          hiddenCore * (0.14 + gatedActivation * 1.10)
            + hiddenGlow
        ) * ffnWindow * (0.78 + projectionFunnel * 0.28);

        float activationX = blockStart
          + blockWidth * (0.59 + hiddenOffset * 0.012);
        vec2 activationDelta = vec2(
          (fieldUv.x - activationX) * aspect,
          fieldUv.y - hiddenY
        );
        float activationBloom = exp(
          -dot(activationDelta, activationDelta)
            * (650.0 + hiddenIndex * 72.0)
        ) * ffnWindow
          * (0.12 + gatedActivation * 1.34)
          * (0.84 + stageActivation * 0.32);
        float hiddenMaterial = hiddenLine
          + gateSplit
          + activationBloom;
        vec3 hiddenTint = spectral(
          tokenHue
            + 0.10
            + layerIndex * 0.035
            + hiddenIndex * 0.045
            + gatedActivation * 0.07
        );
        vec3 gateTint = spectral(
          0.43 + layerIndex * 0.018 + hiddenIndex * 0.010
        );
        vec3 activationTint = mix(
          gateTint,
          vec3(1.0),
          0.10 + gatedActivation * 0.18
        );
        field += hiddenMaterial;
        tintAccumulator += hiddenTint * (hiddenLine + valueBranch)
          + gateTint * gateBranch
          + activationTint * activationBloom;
        tintWeight += hiddenMaterial;
        activationEcho += activationBloom * gatedActivation
          + gateSplit * stageActivation * 0.24;
      }

      float chamberRadius = hiddenExpansion * 0.88 + 0.015;
      float chamberMembrane = exp(
        -abs(abs(fieldUv.y - laneY) - chamberRadius) * 95.0
      ) * ffnWindow * 0.10;
      vec3 chamberTint = spectral(
        tokenHue + layerIndex * 0.04 + 0.17
      );
      field += chamberMembrane;
      tintAccumulator += chamberTint * chamberMembrane;
      tintWeight += chamberMembrane;

      vec2 entryDelta = vec2(
        (fieldUv.x - blockStart) * aspect,
        fieldUv.y - laneY
      );
      vec2 ffnDelta = vec2(
        (fieldUv.x - (blockStart + blockWidth * 0.33)) * aspect,
        fieldUv.y - laneY
      );
      float mergeX = blockStart + blockWidth * 0.92;
      vec2 mergeDelta = vec2(
        (fieldUv.x - mergeX) * aspect,
        fieldUv.y - laneY
      );
      float entryNode = exp(-dot(entryDelta, entryDelta) * 1450.0)
        + exp(-dot(entryDelta, entryDelta) * 180.0) * 0.12;
      float ffnNode = exp(-dot(ffnDelta, ffnDelta) * 1550.0)
        + exp(-dot(ffnDelta, ffnDelta) * 190.0) * 0.13;
      float mergeNode = exp(-dot(mergeDelta, mergeDelta) * 1350.0)
        + exp(-dot(mergeDelta, mergeDelta) * 165.0) * 0.16;
      float mergeFlash = exp(
        -abs(passX - mergeX) * aspect * 34.0
      );
      float structure = (
        entryNode * 0.30
          + ffnNode * 0.36
          + mergeNode * (
            0.42
              + projectionFunnel * 0.38
              + mergeFlash * 0.98
          )
      ) * layerReveal;
      vec3 structureTint = spectral(
        tokenHue + layerIndex * 0.06 + 0.18
      );
      structureTint = mix(
        structureTint,
        vec3(1.0),
        sat(mergeFlash * 0.42)
      );
      field += structure;
      tintAccumulator += structureTint * structure;
      tintWeight += structure;
      activationEcho += mergeNode * mergeFlash * 0.18;
    }
  }

  float promptEnvelope = 1.0 - smoothstep(2.8, 5.6, u_pulseAge);
  float promptX = u_pulseOrigin.x + u_pulseAge * 0.13;
  float promptFront = exp(
    -abs(fieldUv.x - promptX) * aspect * 76.0
  ) * exp(
    -abs(fieldUv.y - u_pulseOrigin.y) * 9.0
  ) * promptEnvelope;
  float promptHalo = exp(
    -abs(fieldUv.x - promptX) * aspect * 22.0
  ) * exp(
    -abs(fieldUv.y - u_pulseOrigin.y) * 4.0
  ) * promptEnvelope * 0.16;
  float promptSignal = promptFront * 1.36
    + promptHalo
    + pulse * 0.28;
  vec3 promptTint = spectral(
    0.30 + u_pulseOrigin.y * 0.20 + time * 0.015
  );
  field += promptSignal;
  tintAccumulator += promptTint * promptSignal;
  tintWeight += promptSignal;

  field *= intro;
  activationEcho *= intro;
  vec3 tint = tintAccumulator / max(tintWeight, 0.0001);
  tint = mix(
    tint,
    promptTint,
    sat(promptFront * 0.72 + pulse * 0.20)
  );
  vec4 material = fluidMaterial(field, tint, 0.30, 0.24, 0.88);
  material.rgb += spectral(0.34 + time * 0.012)
    * sat(activationEcho)
    * 0.09;
  material.a = max(material.a, sat((field - 0.10) * 0.24));
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