export const LIVING_METABLOOM_FRAGMENT_SHADER = `#version 300 es
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
uniform int u_expressionA;
uniform int u_expressionB;
uniform float u_expressionMix;
uniform int u_formA;
uniform int u_formB;
uniform float u_formMix;
uniform float u_talking;

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

float stateWeight(int index, int stateA, int stateB, float transition) {
  float weightA = stateA == index ? 1.0 - transition : 0.0;
  float weightB = stateB == index ? transition : 0.0;
  return weightA + weightB;
}

float ellipseDistance(vec2 p, vec2 radii) {
  vec2 safeRadii = max(radii, vec2(0.001));
  return length(p / safeRadii) - 1.0;
}

float capsuleDistance(vec2 p, vec2 a, vec2 b, float radius) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denominator = max(dot(ba, ba), 0.000001);
  float position = clamp(dot(pa, ba) / denominator, 0.0, 1.0);
  return length(pa - ba * position) - radius;
}

float pulseField(vec2 uv) {
  vec2 delta = (uv - u_pulseOrigin) * aspectScale();
  float radius = length(delta);
  float ringRadius = u_pulseAge * 0.22;
  float envelope = 1.0 - smoothstep(2.8, 5.8, u_pulseAge);
  return exp(-abs(radius - ringRadius) * 42.0) * envelope;
}

void addMetaball(
  inout float potential,
  inout vec3 tintAccumulator,
  vec2 point,
  vec2 center,
  float radius,
  float hue
) {
  vec2 delta = point - center;
  float distanceSquared = dot(delta, delta) + 0.006;
  float weight = radius * radius / distanceSquared;
  potential += weight;
  tintAccumulator += spectral(hue) * weight;
}

float eyeDistance(
  vec2 point,
  vec2 center,
  float width,
  float aperture,
  float curve,
  float slant
) {
  vec2 local = rotate2(slant) * (point - center);
  local.y += curve * local.x * local.x / max(width * width, 0.0001);
  return ellipseDistance(local, vec2(width, max(aperture, 0.008)));
}

void main() {
  vec2 scale = aspectScale();
  vec2 p = (v_uv * 2.0 - 1.0) * scale;

  float happy = stateWeight(0, u_expressionA, u_expressionB, u_expressionMix);
  float excited = stateWeight(1, u_expressionA, u_expressionB, u_expressionMix);
  float sad = stateWeight(2, u_expressionA, u_expressionB, u_expressionMix);
  float surprised = stateWeight(3, u_expressionA, u_expressionB, u_expressionMix);
  float thinking = stateWeight(4, u_expressionA, u_expressionB, u_expressionMix);
  float sleepy = stateWeight(5, u_expressionA, u_expressionB, u_expressionMix);
  float angry = stateWeight(6, u_expressionA, u_expressionB, u_expressionMix);

  float companion = stateWeight(0, u_formA, u_formB, u_formMix);
  float bloom = stateWeight(1, u_formA, u_formB, u_formMix);
  float focus = stateWeight(2, u_formA, u_formB, u_formMix);
  float drift = stateWeight(3, u_formA, u_formB, u_formMix);

  float lifeSpeed = 0.72
    + excited * 0.58
    + surprised * 0.18
    - sleepy * 0.38
    - sad * 0.10;
  float livingTime = u_time * lifeSpeed;
  float breath = sin(livingTime * 1.22 + u_seed * TAU);
  float secondaryBreath = sin(livingTime * 0.71 - u_seed * 5.1);
  float talkCycle = 0.5 + 0.5 * sin(u_time * 11.4 + u_seed * 4.7);
  float pulse = pulseField(v_uv);

  vec2 formScale = vec2(
    companion
      + bloom * 1.06
      + focus * 0.72
      + drift * 1.38,
    companion
      + bloom * 1.08
      + focus * 1.30
      + drift * 0.76
  );
  p = rotate2(
    drift * -0.11
      + thinking * 0.035
      + angry * 0.025
      + breath * 0.012
  ) * p;
  vec2 q = p / max(formScale, vec2(0.3));

  float emotionalLift = excited * 0.035
    + happy * 0.012
    - sad * 0.060
    - sleepy * 0.040;
  q.y -= emotionalLift;
  q.x += thinking * 0.025;

  vec2 pointer = (u_pointer * 2.0 - 1.0) * scale;
  pointer = rotate2(drift * -0.11) * pointer / max(formScale, vec2(0.3));
  vec2 gaze = clamp(pointer * 0.20, vec2(-0.075), vec2(0.075));
  vec2 bodyLean = gaze * (0.12 + u_energy * 0.10);
  q -= bodyLean * exp(-dot(q, q) * 1.9);

  vec2 viscous = vec2(
    fbm(q * 1.62 + vec2(livingTime * 0.045, -livingTime * 0.031)),
    fbm(q * 1.62 + vec2(-livingTime * 0.037, livingTime * 0.042) + 19.7)
  ) - 0.5;
  float viscosity = 0.070
    + bloom * 0.032
    + drift * 0.052
    + sleepy * 0.018
    - focus * 0.026;
  q += viscous * viscosity;

  float potential = 0.0;
  vec3 tintAccumulator = vec3(0.0);
  float coreRadius = 0.285
    + breath * (0.008 + excited * 0.010)
    + surprised * 0.030
    + sleepy * 0.012
    + pulse * 0.025;
  addMetaball(
    potential,
    tintAccumulator,
    q,
    vec2(0.0, -0.015 + secondaryBreath * 0.008),
    coreRadius,
    0.69 + livingTime * 0.016 + u_seed * 0.11
  );

  float baseSpread = 0.205
    + bloom * 0.115
    + excited * 0.020
    - focus * 0.035
    + pulse * 0.020;
  float droop = sad * 0.095 + sleepy * 0.060;
  float tension = focus * 0.72 + angry * 0.20;

  for (int index = 0; index < 9; index++) {
    float layer = float(index);
    float normalizedIndex = layer / 9.0;
    float angle = normalizedIndex * TAU
      + livingTime * (0.025 + excited * 0.030)
      + u_seed * 1.9;
    float petalBias = 0.82 + 0.18 * cos(angle * 4.0 - livingTime * 0.16);
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 center = direction * baseSpread * mix(1.0, petalBias, bloom);

    center.x *= 1.0 + drift * (0.42 + 0.18 * direction.x);
    center.y *= 1.0 - drift * 0.22;
    center.y -= droop * (0.35 + 0.65 * max(0.0, direction.y));
    center.x *= 1.0 - tension * 0.20;
    center.y *= 1.0 + focus * 0.18;
    center += vec2(
      sin(livingTime * (0.52 + layer * 0.018) + layer * 1.73),
      cos(livingTime * (0.43 + layer * 0.015) - layer * 1.31)
    ) * (
      0.020
        + excited * 0.018
        + drift * 0.012
        - focus * 0.010
        - sleepy * 0.008
    );
    center += direction * breath * (0.006 + bloom * 0.010);
    center += gaze * (0.08 + 0.03 * sin(layer * 2.1));

    float radius = 0.145
      + 0.018 * sin(livingTime * 0.88 + layer * 1.57)
      + bloom * 0.018 * petalBias
      + surprised * 0.012
      + excited * 0.010
      - focus * 0.018
      + pulse * 0.012;
    radius *= 1.0 - tension * 0.08;
    addMetaball(
      potential,
      tintAccumulator,
      q,
      center,
      radius,
      0.58
        + normalizedIndex * 0.73
        + livingTime * 0.014
        + u_seed * 0.13
    );
  }

  if (excited > 0.001) {
    vec2 satelliteA = vec2(
      cos(livingTime * 0.82 + u_seed * 5.0),
      sin(livingTime * 0.82 + u_seed * 5.0)
    ) * 0.49;
    vec2 satelliteB = vec2(
      cos(-livingTime * 0.63 + 2.2),
      sin(-livingTime * 0.63 + 2.2)
    ) * 0.43;
    addMetaball(
      potential,
      tintAccumulator,
      q,
      satelliteA,
      0.055 * excited,
      0.10 + livingTime * 0.025
    );
    addMetaball(
      potential,
      tintAccumulator,
      q,
      satelliteB,
      0.040 * excited,
      0.86 - livingTime * 0.019
    );
  }

  if (thinking > 0.001) {
    float thoughtRise = fract(livingTime * 0.08 + u_seed);
    vec2 thoughtCenter = vec2(0.32, 0.27 + thoughtRise * 0.22);
    addMetaball(
      potential,
      tintAccumulator,
      q,
      thoughtCenter,
      mix(0.050, 0.020, thoughtRise) * thinking,
      0.48 + thoughtRise * 0.22
    );
  }

  if (sad > 0.001) {
    float tearPhase = fract(livingTime * 0.12 + u_seed * 0.7);
    vec2 tearCenter = vec2(
      0.165 + sin(tearPhase * PI) * 0.010,
      -0.045 - tearPhase * 0.42
    );
    addMetaball(
      potential,
      tintAccumulator,
      q,
      tearCenter,
      mix(0.045, 0.018, tearPhase) * sad,
      0.48 + tearPhase * 0.08
    );
  }

  vec2 pointerDelta = q - pointer;
  float pointerWeight = (0.010 + u_energy * 0.026)
    / (dot(pointerDelta, pointerDelta) + 0.018);
  potential = min(
    potential + pointerWeight + pulse * (0.48 + u_energy * 0.54),
    8.0
  );
  tintAccumulator += spectral(
    0.52 + livingTime * 0.018
  ) * (pointerWeight + pulse * 0.66);

  float membrane = 0.5 + 0.5 * sin(
    potential * 4.4
      + fbm(q * 2.30 + vec2(livingTime * 0.034, -livingTime * 0.026)) * 4.2
      + breath * 0.28
  );
  float body = smoothstep(0.42, 2.56, potential);
  float edge = exp(-abs(potential - 1.17) * 2.9);
  float density = sat(body * 0.70 + membrane * body * 0.30 + edge * 0.18);

  float colorFlow = fbm(
    rotate2(0.48) * q * 1.42
      + vec2(livingTime * 0.022, -livingTime * 0.017)
      + vec2(u_seed * 4.1, -u_seed * 3.7)
  );
  float secondaryFlow = fbm(
    rotate2(-0.71) * q * 2.18
      + vec2(-livingTime * 0.014, livingTime * 0.019)
      + vec2(13.4, 7.9)
  );
  float emotionHue = excited * 0.075
    + sad * 0.42
    + thinking * 0.14
    + sleepy * 0.27
    + angry * 0.82;
  float baseHue = 0.70
    + q.x * 0.080
    + q.y * 0.135
    + (colorFlow - 0.5) * 0.26
    + (secondaryFlow - 0.5) * 0.10
    + potential * 0.040
    + membrane * 0.035
    + livingTime * 0.018
    + u_seed * 0.13
    + emotionHue;

  vec3 tint = tintAccumulator / max(potential, 0.0001);
  vec3 flowTint = spectral(baseHue);
  tint = mix(tint, flowTint, sat(0.76 + membrane * 0.10));
  tint = mix(tint, spectral(0.48), sad * 0.20);
  tint = mix(tint, spectral(0.78), sleepy * 0.24);
  tint = mix(tint, spectral(0.97), angry * 0.25);

  float leftOpen = 0.052
    + excited * 0.020
    + surprised * 0.026
    - happy * 0.034
    - sleepy * 0.040
    - thinking * 0.010;
  float rightOpen = leftOpen - thinking * 0.032;
  float eyeWidth = 0.078
    + excited * 0.010
    + surprised * 0.012
    - angry * 0.008;
  float blinkPulse = pow(
    max(0.0, sin(livingTime * 0.57 + u_seed * 19.0)),
    42.0
  );
  leftOpen *= 1.0 - blinkPulse * 0.86;
  rightOpen *= 1.0 - blinkPulse * 0.86;

  float happyCurve = -0.58 * happy - 0.22 * sleepy;
  float sadCurve = 0.28 * sad;
  float eyeCurve = happyCurve + sadCurve;
  float leftSlant = angry * 0.22 - sad * 0.12;
  float rightSlant = -angry * 0.22 + sad * 0.12;
  vec2 leftEyeCenter = vec2(-0.135, 0.085) + gaze * vec2(0.30, 0.24);
  vec2 rightEyeCenter = vec2(0.135, 0.085) + gaze * vec2(0.30, 0.24);

  float leftEyeDistance = eyeDistance(
    q,
    leftEyeCenter,
    eyeWidth,
    leftOpen,
    eyeCurve,
    leftSlant
  );
  float rightEyeDistance = eyeDistance(
    q,
    rightEyeCenter,
    eyeWidth,
    rightOpen,
    eyeCurve,
    rightSlant
  );
  float leftEyeVoid = 1.0 - smoothstep(-0.10, 0.08, leftEyeDistance);
  float rightEyeVoid = 1.0 - smoothstep(-0.10, 0.08, rightEyeDistance);
  float eyeVoid = max(leftEyeVoid, rightEyeVoid);
  float eyeRim = exp(-abs(leftEyeDistance) * 26.0)
    + exp(-abs(rightEyeDistance) * 26.0);

  vec2 leftIrisPoint = q - leftEyeCenter - gaze * 0.58;
  vec2 rightIrisPoint = q - rightEyeCenter - gaze * 0.58;
  float irisScale = 1.0 - happy * 0.86 - sleepy * 0.90;
  float leftIris = exp(
    -dot(leftIrisPoint / vec2(0.025, 0.031), leftIrisPoint / vec2(0.025, 0.031))
  ) * irisScale;
  float rightIris = exp(
    -dot(rightIrisPoint / vec2(0.025, 0.031), rightIrisPoint / vec2(0.025, 0.031))
  ) * irisScale * (1.0 - thinking * 0.58);
  float iris = sat(leftIris + rightIris);

  float mouthX = q.x;
  float happyMouthY = -0.105 + mouthX * mouthX * 1.18;
  float sadMouthY = -0.080 - mouthX * mouthX * 0.92;
  float neutralMouthY = -0.115 + mouthX * 0.05;
  float mouthTargetY = neutralMouthY
    + (happyMouthY - neutralMouthY) * (happy + excited * 0.72)
    + (sadMouthY - neutralMouthY) * sad
    + angry * (-0.012 - mouthX * 0.22)
    + thinking * (0.012 + mouthX * 0.18);
  float mouthWidth = 0.105
    + happy * 0.020
    + excited * 0.028
    - sleepy * 0.042
    - angry * 0.012;
  float mouthLineDistance = abs(q.y - mouthTargetY);
  float mouthLine = exp(-mouthLineDistance * 118.0)
    * (1.0 - smoothstep(mouthWidth * 0.78, mouthWidth, abs(mouthX)));

  float talkOpen = u_talking * (0.018 + talkCycle * 0.032);
  float surpriseOpen = surprised * 0.058;
  float excitedOpen = excited * 0.034;
  float mouthAperture = talkOpen + surpriseOpen + excitedOpen;
  float mouthEllipseDistance = ellipseDistance(
    q - vec2(0.0, -0.115),
    vec2(
      0.052 + u_talking * 0.020 + surprised * 0.012,
      max(0.009, mouthAperture)
    )
  );
  float mouthOpen = (1.0 - smoothstep(-0.10, 0.08, mouthEllipseDistance))
    * sat(u_talking + surprised + excited * 0.62);
  float mouthRim = exp(-abs(mouthEllipseDistance) * 28.0)
    * sat(u_talking + surprised + excited * 0.62);
  float mouthVoid = max(mouthLine * 0.82, mouthOpen);

  float faceVoid = sat(max(eyeVoid, mouthVoid));
  float featureRim = sat(eyeRim * 0.62 + mouthRim + mouthLine * 0.30);
  float faceGate = smoothstep(0.78, 1.45, potential);
  faceVoid *= faceGate;
  featureRim *= faceGate;

  float materialField = potential * (1.12 + membrane * 0.18) + edge * 0.24;
  float materialBody = smoothstep(0.78, 1.18, materialField);
  float materialGlow = smoothstep(0.22, 1.02, materialField);
  float materialCore = smoothstep(1.22, 3.0, materialField);
  float materialRim = smoothstep(0.78, 0.98, materialField)
    * (1.0 - smoothstep(1.02, 1.62, materialField));

  vec3 spectralColor = tint * (0.58 + 0.62 * materialCore);
  spectralColor += vec3(materialRim * (0.38 + edge * 0.10));
  spectralColor += tint * materialGlow * (
    0.20 + exp(-length(q) * 7.0) * 0.08
  );
  spectralColor *= mix(1.0, 0.88, u_light);
  spectralColor += spectral(baseHue + 0.08) * edge * 0.12;

  vec2 slope = vec2(dFdx(potential), dFdy(potential));
  vec3 normal = normalize(vec3(
    -slope.x * 0.92,
    -slope.y * 0.92,
    0.50 + 0.18 / (1.0 + length(slope) * 3.2)
  ));
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  vec3 keyDirection = normalize(vec3(-0.52, 0.44, 0.72));
  vec3 fillDirection = normalize(vec3(0.68, -0.24, 0.64));
  float keySpecular = pow(
    sat(dot(reflect(-keyDirection, normal), viewDirection)),
    44.0
  );
  float fillSpecular = pow(
    sat(dot(reflect(-fillDirection, normal), viewDirection)),
    18.0
  );
  float fresnel = pow(1.0 - sat(normal.z), 3.4);
  float mirror = sat(
    0.10
      + keySpecular * 1.26
      + fillSpecular * 0.48
      + fresnel * 0.72
      + (colorFlow - 0.5) * 0.26
  );
  vec3 mercuryShadow = mix(
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
    vec3(1.520, 1.560, 1.630),
    vec3(1.420, 1.455, 1.515),
    u_light
  );
  vec3 metalColor = mix(
    mercuryShadow,
    mercuryMid,
    smoothstep(0.06, 0.52, mirror)
  );
  metalColor = mix(
    metalColor,
    mercuryHighlight,
    smoothstep(0.46, 0.98, mirror)
  );
  metalColor += spectral(baseHue + normal.x * 0.16)
    * edge
    * (0.20 + fresnel * 0.26);

  vec3 color = mix(spectralColor, metalColor, focus);
  color = mix(
    color,
    mix(vec3(0.006, 0.008, 0.016), vec3(0.12, 0.14, 0.19), u_light),
    faceVoid * 0.92
  );
  color += spectral(baseHue + 0.32) * featureRim * 0.62;
  color += vec3(1.18, 1.24, 1.31) * iris * 0.92;
  color += spectral(0.48 + livingTime * 0.02) * iris * 0.22;

  float blush = happy + excited * 0.72;
  float blushLeft = exp(
    -dot(
      (q - vec2(-0.225, -0.015)) / vec2(0.078, 0.040),
      (q - vec2(-0.225, -0.015)) / vec2(0.078, 0.040)
    )
  );
  float blushRight = exp(
    -dot(
      (q - vec2(0.225, -0.015)) / vec2(0.078, 0.040),
      (q - vec2(0.225, -0.015)) / vec2(0.078, 0.040)
    )
  );
  color += spectral(0.98) * (blushLeft + blushRight) * blush * 0.13;

  float heartbeat = exp(-dot(q * vec2(1.0, 1.18), q * vec2(1.0, 1.18)) * 9.5)
    * (0.5 + 0.5 * sin(livingTime * 1.9 + u_seed * 4.0));
  color += spectral(baseHue + 0.14) * heartbeat * 0.08;

  float alpha = materialBody * mix(0.90, 0.86, u_light)
    + materialGlow * (1.0 - materialBody) * mix(0.25, 0.22, u_light);
  alpha = max(alpha, density * (0.17 + membrane * 0.12));
  alpha *= smoothstep(-0.88, 0.32, q.y + u_intro * 1.14);
  alpha *= 1.0 - faceVoid * 0.84;
  alpha = max(alpha, featureRim * 0.26 + iris * 0.44);

  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  alpha = sat(floor(alpha * 18.0 + dither) / 17.0);
  color = max(vec3(0.0), floor(color * 24.0 + dither) / 23.0);

  fragColor = vec4(color * alpha, alpha);
}`;
