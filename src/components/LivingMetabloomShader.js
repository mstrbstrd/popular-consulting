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
uniform float u_emotionAge;
uniform float u_coherence;
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

float bayer2(vec2 coordinate) {
  coordinate = floor(coordinate);
  return fract(coordinate.x * 0.5 + coordinate.y * coordinate.y * 0.75);
}

#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), curve.x),
    mix(
      hash(cell + vec2(0.0, 1.0)),
      hash(cell + vec2(1.0, 1.0)),
      curve.x
    ),
    curve.y
  );
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    value += amplitude * noise(point);
    point = point * 2.03 + vec2(11.3, 7.7);
    amplitude *= 0.5;
  }
  return value;
}

mat2 rotate2d(float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return mat2(cosine, -sine, sine, cosine);
}

vec3 spectral(float hue) {
  vec3 cyan = vec3(0.0, 0.933, 1.0);
  vec3 magenta = vec3(1.0, 0.0, 1.0);
  vec3 yellow = vec3(1.0, 0.933, 0.0);
  vec3 violet = vec3(0.616, 0.0, 1.0);
  hue = fract(hue);

  if (hue < 0.25) return mix(cyan, magenta, hue * 4.0);
  if (hue < 0.5) return mix(magenta, yellow, (hue - 0.25) * 4.0);
  if (hue < 0.75) return mix(yellow, violet, (hue - 0.5) * 4.0);
  return mix(violet, cyan, (hue - 0.75) * 4.0);
}

float stateWeight(int index, int fromState, int toState, float mixAmount) {
  return
    (fromState == index ? 1.0 - mixAmount : 0.0) +
    (toState == index ? mixAmount : 0.0);
}

float gaussianField(
  vec2 point,
  vec2 center,
  vec2 radius,
  float angle
) {
  vec2 local = rotate2d(angle) * (point - center);
  local /= max(radius, vec2(0.001));
  return exp2(-dot(local, local) * 1.45);
}

float ellipseSdf(vec2 point, vec2 radius) {
  return length(point / max(radius, vec2(0.001))) - 1.0;
}

float band(float distanceValue, float width) {
  return exp(-abs(distanceValue) / max(width, 0.0001));
}

float starGlint(vec2 point, vec2 center, float scale) {
  vec2 local = (point - center) / max(scale, 0.0001);
  float core = exp(-dot(local, local) * 2.8);
  float cross =
    exp(-abs(local.x) * 7.0 - abs(local.y) * 1.2) +
    exp(-abs(local.y) * 7.0 - abs(local.x) * 1.2);
  return sat(core + cross * 0.38);
}

float pulseField(vec2 uv) {
  vec2 scale = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 delta = (uv - u_pulseOrigin) * scale;
  float radius = length(delta);
  float ring = u_pulseAge * 0.22;
  return
    exp(-abs(radius - ring) * 42.0) *
    (1.0 - smoothstep(2.6, 5.8, u_pulseAge));
}

float eyeDistance(
  vec2 point,
  vec2 center,
  float width,
  float aperture,
  float curve,
  float slant
) {
  vec2 local = rotate2d(slant) * (point - center);
  local.y += curve * local.x * local.x / max(width * width, 0.0001);
  return ellipseSdf(local, vec2(width, max(aperture, 0.006)));
}

void main() {
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 pagePoint = (v_uv * 2.0 - 1.0) * aspect;

  float happy = stateWeight(
    0,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float excited = stateWeight(
    1,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float sad = stateWeight(
    2,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float surprised = stateWeight(
    3,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float thinking = stateWeight(
    4,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float sleepy = stateWeight(
    5,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );
  float angry = stateWeight(
    6,
    u_expressionA,
    u_expressionB,
    u_expressionMix
  );

  float companion = stateWeight(0, u_formA, u_formB, u_formMix);
  float bloom = stateWeight(1, u_formA, u_formB, u_formMix);
  float focus = stateWeight(2, u_formA, u_formB, u_formMix);
  float drift = stateWeight(3, u_formA, u_formB, u_formMix);

  // Metabloom is the avatar. Coherence determines whether the fluid is
  // diffuse, attentive, or temporarily organized into readable anatomy.
  float coherence = sat(u_coherence);
  float organization = smoothstep(0.08, 0.82, coherence);
  float anatomy = smoothstep(0.52, 0.88, coherence);
  float intro = smoothstep(0.0, 1.0, u_intro);

  float lifeSpeed =
    0.58 +
    excited * 0.58 * organization +
    surprised * 0.16 * organization -
    sleepy * 0.28 * organization -
    sad * 0.08 * organization +
    angry * 0.12 * organization;
  float time = u_time * lifeSpeed;
  float breath = sin(time * 1.08 + u_seed * TAU);
  float secondaryBreath = sin(time * 0.61 - u_seed * 4.8);
  float heartbeat = pow(
    max(0.0, sin(time * 1.82 + u_seed * 3.9)),
    10.0
  );
  float pulse = pulseField(v_uv);

  pagePoint /= mix(1.12, 1.0, intro);

  vec2 organizedScale =
    companion * vec2(1.10, 1.00) +
    bloom * vec2(1.12, 1.08) +
    focus * vec2(0.82, 1.26) +
    drift * vec2(1.42, 0.82);
  vec2 responseScale = mix(vec2(1.0), organizedScale, organization);
  float responseAngle =
    organization *
    (
      drift * -0.10 +
      thinking * 0.045 +
      angry * 0.025 +
      breath * 0.008
    );

  vec2 point = rotate2d(responseAngle) * pagePoint;
  point /= max(responseScale, vec2(0.25));

  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect;
  pointer = rotate2d(responseAngle) * pointer;
  pointer /= max(responseScale, vec2(0.25));

  vec2 idleAttention = vec2(
    sin(time * 0.17 + u_seed * 11.0),
    sin(time * 0.13 - u_seed * 7.0)
  ) * 0.022;
  vec2 attentionDirection = clamp(
    pointer * 0.18 + idleAttention,
    vec2(-0.10),
    vec2(0.10)
  );

  vec2 freeWarp = vec2(
    noise(point * 1.54 + vec2(time * 0.040, -time * 0.026)),
    noise(
      point * 1.54 +
      vec2(-time * 0.032, time * 0.038) +
      vec2(17.7)
    )
  ) - 0.5;
  float freeViscosity = mix(
    0.090,
    0.034 +
      bloom * 0.020 +
      drift * 0.028 +
      sleepy * 0.012 -
      focus * 0.014,
    organization
  );
  vec2 fluidPoint = point + freeWarp * freeViscosity;

  float flowA = fbm(
    rotate2d(0.52) * fluidPoint * 1.48 +
    vec2(time * 0.024, -time * 0.018) +
    u_seed * 3.2
  );
  float flowB = fbm(
    rotate2d(-0.73) * fluidPoint * 2.15 +
    vec2(-time * 0.016, time * 0.021) +
    vec2(9.7, 13.1)
  );

  float field = 0.0;
  float potential = 0.0;
  vec3 tintAccumulator = vec3(0.0);
  float tintWeight = 0.0001;

  // The latent state is a free fluid swarm. The same nine masses interpolate
  // toward a response pattern only while coherence is present.
  for (int index = 0; index < 9; index++) {
    float fi = float(index);
    float randomA = hash(vec2(fi + 1.7, u_seed * 11.0 + 3.1));
    float randomB = hash(vec2(fi + 8.9, u_seed * 17.0 + 7.3));
    float directionSign = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;
    float idleAngle =
      TAU * randomA +
      directionSign * time * (0.060 + 0.050 * randomB) +
      sin(time * 0.085 + fi * 1.73) * 0.34;
    float idleRadius = 0.14 + 0.28 * randomB;
    vec2 idleCenter = vec2(
      cos(idleAngle) * idleRadius * (0.84 + 0.24 * randomA),
      sin(idleAngle * 0.83 + fi * 0.71) * (0.13 + 0.21 * randomA)
    );
    idleCenter += vec2(
      sin(time * 0.13 + fi * 2.17),
      cos(time * 0.11 - fi * 1.39)
    ) * (0.024 + 0.026 * randomB);

    float organizedAngle = fi / 9.0 * TAU + PI * 0.5;
    vec2 direction = vec2(
      cos(organizedAngle),
      sin(organizedAngle)
    );
    vec2 companionCenter = direction * vec2(0.205, 0.180);
    vec2 bloomCenter = direction * vec2(0.365, 0.315);
    float row = (fi - 4.0) / 4.0;
    vec2 focusCenter = vec2(
      sin(fi * 2.31) * 0.050,
      row * 0.305
    );
    vec2 driftCenter = vec2(
      (fi - 4.0) * 0.094,
      sin(fi * 1.23 + time * 0.22) * 0.105
    );
    vec2 organizedCenter =
      companion * companionCenter +
      bloom * bloomCenter +
      focus * focusCenter +
      drift * driftCenter;

    organizedCenter.y +=
      happy * 0.026 * max(direction.y, 0.0) +
      excited * 0.038 * direction.y -
      sad * (0.050 + 0.038 * max(direction.y, 0.0)) -
      sleepy * 0.032;
    organizedCenter *=
      1.0 + excited * 0.080 + surprised * 0.045;
    organizedCenter.x *= 1.0 - angry * 0.090;
    organizedCenter.y *= 1.0 + focus * 0.090;
    organizedCenter += attentionDirection * (0.045 + 0.018 * randomA);

    if (index == 1) {
      organizedCenter += vec2(0.070, 0.055) * thinking;
    }
    if (index == 5 || index == 6) {
      organizedCenter.y -= 0.040 * sad;
    }

    float organizedWobble =
      0.010 +
      excited * 0.020 +
      drift * 0.012 -
      focus * 0.006 -
      sleepy * 0.005;
    organizedCenter += vec2(
      sin(time * (0.46 + fi * 0.018) + fi * 1.71),
      cos(time * (0.40 + fi * 0.016) - fi * 1.29)
    ) * organizedWobble;

    vec2 center = mix(idleCenter, organizedCenter, organization);

    vec2 idleLobeRadius = vec2(
      0.112 + 0.052 * randomA,
      0.082 + 0.046 * randomB
    );
    vec2 companionRadius = vec2(0.190, 0.164);
    vec2 bloomRadius = vec2(0.174, 0.205);
    vec2 focusRadius = vec2(0.128, 0.186);
    vec2 driftRadius = vec2(0.210, 0.124);
    vec2 organizedRadius =
      companion * companionRadius +
      bloom * bloomRadius +
      focus * focusRadius +
      drift * driftRadius;
    organizedRadius *=
      0.92 +
      0.12 * randomA +
      breath * (0.016 + bloom * 0.014);
    organizedRadius += vec2(
      excited * 0.012 + surprised * 0.010,
      sad * 0.010
    );

    vec2 radius = mix(idleLobeRadius, organizedRadius, organization);
    float lobeAngle = mix(
      idleAngle * 0.23,
      -organizedAngle * 0.28,
      organization
    );
    float contribution = gaussianField(
      fluidPoint,
      center,
      radius,
      lobeAngle
    );
    float lobeStrength = mix(
      0.76 + randomB * 0.10,
      0.90 + randomA * 0.12,
      organization
    );

    field += contribution * lobeStrength;
    potential += contribution * (0.58 + 0.34 * organization);
    tintAccumulator += spectral(
      0.54 +
      fi * 0.105 +
      time * 0.011 +
      u_seed * 0.13
    ) * contribution;
    tintWeight += contribution;
  }

  // A central body is not latent anatomy. It is synthesized only as the
  // fluid organizes in response to attention, emotion, speech, or touch.
  vec2 organizedCoreRadius =
    companion * vec2(0.355, 0.315) +
    bloom * vec2(0.278, 0.288) +
    focus * vec2(0.220, 0.390) +
    drift * vec2(0.430, 0.220);
  organizedCoreRadius += vec2(
    excited * 0.016 + surprised * 0.026,
    surprised * 0.020
  );
  organizedCoreRadius -= vec2(angry * 0.018, 0.0);
  vec2 organizedCoreCenter = vec2(
    thinking * 0.020,
    -0.012 -
      sad * 0.044 -
      sleepy * 0.024 +
      happy * 0.012 +
      secondaryBreath * 0.006
  );
  vec2 emergingCoreRadius = mix(
    vec2(0.070, 0.055),
    organizedCoreRadius,
    organization
  );
  float coreField = gaussianField(
    fluidPoint,
    organizedCoreCenter,
    emergingCoreRadius,
    0.0
  );
  float coreContribution =
    coreField *
    organization *
    (1.00 + 0.20 * organization);

  field += coreContribution;
  potential += coreContribution * 1.12;
  tintAccumulator += spectral(
    0.68 + time * 0.012 + u_seed * 0.11
  ) * coreContribution;
  tintWeight += coreContribution;

  float pointerPresence = smoothstep(0.10, 0.42, length(pointer));
  float attention = sat(u_energy * pointerPresence);
  if (attention > 0.001) {
    vec2 direction = normalize(pointer + vec2(0.0001));
    float directionAngle = atan(direction.y, direction.x);
    vec2 center = direction * mix(0.30, 0.43, organization);
    vec2 localRadius = vec2(
      0.135 + 0.040 * attention,
      0.070 + 0.030 * organization
    );
    float reach = gaussianField(
      fluidPoint,
      center,
      localRadius,
      -directionAngle
    );
    float reachWeight = reach * attention * (0.42 + 0.24 * organization);
    field += reachWeight;
    potential += reachWeight * 0.72;
    tintAccumulator += spectral(
      0.50 + time * 0.018
    ) * reachWeight;
    tintWeight += reachWeight;
  }

  if (organization > 0.001 && excited > 0.001) {
    vec2 center = vec2(cos(time * 0.78), sin(time * 0.78)) * 0.53;
    float bud = gaussianField(
      fluidPoint,
      center,
      vec2(0.056),
      time * 0.10
    ) * excited * organization;
    field += bud * 0.72;
    potential += bud * 0.40;
    tintAccumulator += spectral(0.08 + time * 0.02) * bud;
    tintWeight += bud;
  }

  if (organization > 0.001 && thinking > 0.001) {
    float rise = fract(time * 0.07 + u_seed);
    vec2 center = vec2(0.36, 0.24 + rise * 0.22);
    float bud = gaussianField(
      fluidPoint,
      center,
      vec2(mix(0.058, 0.025, rise)),
      0.0
    ) * thinking * organization * (1.0 - rise);
    field += bud * 0.68;
    potential += bud * 0.34;
    tintAccumulator += spectral(0.46 + rise * 0.18) * bud;
    tintWeight += bud;
  }

  if (organization > 0.001 && sad > 0.001) {
    float fall = fract(time * 0.055 + u_seed * 0.7);
    vec2 center = vec2(-0.16, -0.30 - fall * 0.24);
    float drop = gaussianField(
      fluidPoint,
      center,
      vec2(0.040, 0.062),
      0.0
    ) * sad * organization * (1.0 - fall);
    field += drop * 0.54;
    potential += drop * 0.24;
    tintAccumulator += vec3(0.12, 0.54, 1.0) * drop;
    tintWeight += drop;
  }

  field +=
    (flowA - 0.5) *
    mix(0.060, 0.020, organization) *
    smoothstep(0.02, 0.52, field);

  float isoLevel = mix(0.56, 0.50, organization);
  float signedField = isoLevel - field;
  if (signedField > 0.22) {
    fragColor = vec4(0.0);
    return;
  }

  float antialiasWidth = max(fwidth(field) * 1.18, 0.002);
  float fluidAlpha = smoothstep(
    isoLevel - antialiasWidth,
    isoLevel + antialiasWidth,
    field
  );
  float innerDepth = sat((field - isoLevel) * 1.36);
  float rim = exp(-abs(signedField) * 28.0);
  float aura =
    smoothstep(isoLevel * 0.18, isoLevel * 0.84, field) *
    (1.0 - fluidAlpha) *
    0.20;

  float membrane =
    0.5 +
    0.5 * sin(
      potential * 4.10 +
      flowA * 5.30 +
      flowB * 3.10 +
      time * 0.20 +
      breath * 0.22
    );
  float caustic = pow(
    0.5 +
      0.5 * sin(
        (fluidPoint.x * 0.68 + fluidPoint.y * 0.91) * 13.0 +
        flowB * 5.4 -
        flowA * 2.1 -
        time * 0.15
      ),
    5.0
  );
  float cellular = pow(
    sat(1.0 - abs(flowA - flowB) * 2.15),
    3.0
  );

  float baseHue =
    0.64 +
    fluidPoint.x * 0.15 +
    fluidPoint.y * 0.18 +
    (flowA - 0.5) * 0.28 +
    (flowB - 0.5) * 0.15 +
    potential * 0.028 +
    time * 0.012 +
    u_seed * 0.12;
  vec3 lobeTint = tintAccumulator / max(tintWeight, 0.001);
  float spectrumBlend = sat(
    0.5 + fluidPoint.x * 0.72 + (flowA - 0.5) * 0.62
  );
  vec3 nativeSpectrum = mix(
    spectral(baseHue - 0.10),
    spectral(baseHue + 0.20),
    spectrumBlend
  );
  nativeSpectrum = mix(
    nativeSpectrum,
    spectral(baseHue + 0.42),
    sat(0.28 - fluidPoint.y * 0.46 + flowB * 0.18) * 0.34
  );
  vec3 baseTint = mix(
    lobeTint,
    nativeSpectrum,
    0.80 + membrane * 0.08
  );

  vec3 moodPrimary =
    happy * vec3(1.00, 0.62, 0.22) +
    excited * vec3(1.00, 0.05, 0.72) +
    sad * vec3(0.16, 0.48, 1.00) +
    surprised * vec3(0.42, 0.94, 1.00) +
    thinking * vec3(0.56, 0.16, 1.00) +
    sleepy * vec3(0.30, 0.20, 0.92) +
    angry * vec3(1.00, 0.16, 0.16);
  vec3 moodSecondary =
    happy * vec3(0.10, 0.96, 0.80) +
    excited * vec3(1.00, 0.91, 0.12) +
    sad * vec3(0.32, 0.10, 0.88) +
    surprised * vec3(0.92, 0.55, 1.00) +
    thinking * vec3(0.10, 0.90, 0.72) +
    sleepy * vec3(0.08, 0.52, 1.00) +
    angry * vec3(1.00, 0.58, 0.08);
  float emotionEnvelope =
    smoothstep(0.0, 0.16, u_emotionAge) *
    (1.0 - smoothstep(2.45, 6.4, u_emotionAge));
  vec3 moodTint = mix(
    moodPrimary,
    moodSecondary,
    sat(flowA * 0.72 + membrane * 0.28)
  );
  vec3 materialTint = mix(
    baseTint,
    moodTint,
    emotionEnvelope * 0.80 * max(coherence, 0.35)
  );
  materialTint = mix(
    materialTint,
    spectral(baseHue + 0.18),
    pulse * (0.24 + u_energy * 0.34)
  );

  // A face is a temporary communication gesture. At zero coherence these
  // structures do not exist, even invisibly, inside the latent fluid.
  float facialNeed =
    happy * 0.92 +
    excited * 1.00 +
    sad * 0.48 +
    surprised * 1.00 +
    thinking * 0.74 +
    sleepy * 0.42 +
    angry * 0.68;
  float facePresence =
    anatomy *
    facialNeed *
    organization;
  facePresence = max(facePresence, u_talking * 0.98);

  vec2 face = fluidPoint - organizedCoreCenter;
  float faceMorph = smoothstep(0.10, 1.0, facePresence);
  float eyeSeparation = mix(0.030, 0.154, faceMorph);
  float eyeWidth = mix(
    0.018,
    0.104 +
      happy * 0.006 +
      excited * 0.012 +
      surprised * 0.018 -
      angry * 0.005,
    faceMorph
  );
  float baseEyeOpen =
    0.076 +
    happy * 0.010 +
    excited * 0.021 +
    surprised * 0.042 -
    thinking * 0.004 -
    sleepy * 0.060 -
    angry * 0.020;
  float leftOpen = max(0.008, baseEyeOpen);
  float rightOpen = max(0.008, baseEyeOpen - thinking * 0.032);
  float blink = pow(
    max(0.0, sin(time * 0.56 + u_seed * 17.0)),
    48.0
  );
  float blinkDepth = 0.96 - excited * 0.08;
  leftOpen *= 1.0 - blink * blinkDepth;
  rightOpen *= 1.0 - blink * blinkDepth;
  leftOpen = mix(0.006, leftOpen, faceMorph);
  rightOpen = mix(0.006, rightOpen, faceMorph);

  float eyeCurve = 0.010 * sad - 0.006 * happy;
  float leftSlant =
    angry * 0.18 -
    sad * 0.050 -
    thinking * 0.020;
  float rightSlant =
    -angry * 0.18 +
    sad * 0.050 +
    thinking * 0.085;
  vec2 leftEye = vec2(-eyeSeparation, 0.094);
  vec2 rightEye = vec2(eyeSeparation, 0.094);
  leftEye += attentionDirection * vec2(0.29, 0.23);
  rightEye += attentionDirection * vec2(0.29, 0.23);

  float leftDistance = eyeDistance(
    face,
    leftEye,
    eyeWidth,
    leftOpen,
    eyeCurve,
    leftSlant
  );
  float rightDistance = eyeDistance(
    face,
    rightEye,
    eyeWidth,
    rightOpen,
    eyeCurve,
    rightSlant
  );
  float leftGate = smoothstep(0.014, 0.032, leftOpen) * facePresence;
  float rightGate = smoothstep(0.014, 0.032, rightOpen) * facePresence;
  float leftInside =
    (1.0 - smoothstep(-0.040, 0.045, leftDistance)) *
    leftGate;
  float rightInside =
    (1.0 - smoothstep(-0.040, 0.045, rightDistance)) *
    rightGate;
  float leftCrease =
    band(leftDistance, 0.012) *
    (1.0 - leftGate * 0.76) *
    facePresence;
  float rightCrease =
    band(rightDistance, 0.012) *
    (1.0 - rightGate * 0.76) *
    facePresence;
  float eyeSocket = max(
    max(leftInside, rightInside),
    max(leftCrease, rightCrease) * 0.72
  );
  float eyeRim = sat(
    band(leftDistance, 0.010) * leftGate +
    band(rightDistance, 0.010) * rightGate
  );

  vec2 irisOffset = attentionDirection * 0.48;
  float leftIris =
    gaussianField(
      face,
      leftEye + irisOffset,
      vec2(0.061, 0.066),
      0.0
    ) *
    leftGate;
  float rightIris =
    gaussianField(
      face,
      rightEye + irisOffset,
      vec2(0.061, 0.066),
      0.0
    ) *
    rightGate *
    (1.0 - thinking * 0.36);
  float iris = sat(leftIris + rightIris);
  float pupil = sat(
    gaussianField(
      face,
      leftEye + irisOffset,
      vec2(0.034, 0.041),
      0.0
    ) *
      leftGate +
    gaussianField(
      face,
      rightEye + irisOffset,
      vec2(0.034, 0.041),
      0.0
    ) *
      rightGate *
      (1.0 - thinking * 0.36)
  );
  float eyeSpark = sat(
    starGlint(
      face,
      leftEye + irisOffset + vec2(-0.024, 0.027),
      0.019
    ) +
    starGlint(
      face,
      rightEye + irisOffset + vec2(-0.024, 0.027),
      0.019
    ) +
    gaussianField(
      face,
      leftEye + irisOffset + vec2(0.022, -0.014),
      vec2(0.009),
      0.0
    ) *
      0.72 +
    gaussianField(
      face,
      rightEye + irisOffset + vec2(0.022, -0.014),
      vec2(0.009),
      0.0
    ) *
      0.72
  ) * facePresence;
  float ocularDome = sat(iris * 0.82 + eyeRim * 0.28);

  float mouthX = face.x;
  float neutralY = -0.124 + mouthX * 0.018;
  float smileY = -0.112 + mouthX * mouthX * 1.22;
  float sadY = -0.076 - mouthX * mouthX * 0.92;
  float mouthY =
    neutralY +
    (smileY - neutralY) * (happy + excited * 0.80) +
    (sadY - neutralY) * sad +
    angry * (-0.006 - mouthX * 0.17) +
    thinking * (0.008 + mouthX * 0.12);
  float targetMouthWidth =
    0.132 +
    happy * 0.030 +
    excited * 0.034 -
    sleepy * 0.046 -
    angry * 0.010;
  float mouthWidth = mix(0.018, targetMouthWidth, faceMorph);
  float mouthGate =
    (1.0 - smoothstep(
      mouthWidth * 0.78,
      mouthWidth,
      abs(mouthX)
    )) *
    facePresence;
  float mouthCrease =
    exp(-abs(face.y - mouthY) * 90.0) *
    mouthGate;
  float cornerX = mouthWidth * 0.76;
  float cornerY = -0.112 + cornerX * cornerX * 1.22;
  float smileCorner =
    (
      gaussianField(
        face,
        vec2(-cornerX, cornerY),
        vec2(0.024, 0.020),
        0.0
      ) +
      gaussianField(
        face,
        vec2(cornerX, cornerY),
        vec2(0.024, 0.020),
        0.0
      )
    ) *
    sat(happy + excited * 0.78) *
    facePresence;
  float talkCycle = 0.5 + 0.5 * sin(u_time * 11.2 + u_seed * 4.4);
  float mouthOpenAmount =
    u_talking * (0.020 + talkCycle * 0.034) +
    surprised * 0.068 * facePresence +
    excited * 0.036 * facePresence;
  float mouthDistance = ellipseSdf(
    face - vec2(0.0, -0.124),
    vec2(
      0.064 + surprised * 0.014,
      max(0.010, mouthOpenAmount)
    )
  );
  float mouthOpenGate = sat(
    u_talking +
    surprised * facePresence +
    excited * 0.62 * facePresence
  );
  float mouthInside =
    (1.0 - smoothstep(-0.05, 0.05, mouthDistance)) *
    mouthOpenGate;
  float mouthRim = band(mouthDistance, 0.013) * mouthOpenGate;
  float mouthCavity = max(mouthCrease * 0.66, mouthInside);
  float lipRidge = sat(
    mouthRim * 0.70 +
    smileCorner * 0.55 +
    mouthCrease * 0.18
  );

  float browStrength =
    sat(angry + sad * 0.64 + thinking * 0.52) *
    facePresence;
  float browY = 0.190;
  float leftBrowY =
    browY + leftSlant * (face.x + eyeSeparation);
  float rightBrowY =
    browY + rightSlant * (face.x - eyeSeparation);
  float leftBrow =
    exp(-abs(face.y - leftBrowY) * 80.0) *
    (1.0 - smoothstep(
      0.052,
      0.118,
      abs(face.x + eyeSeparation)
    ));
  float rightBrow =
    exp(-abs(face.y - rightBrowY) * 80.0) *
    (1.0 - smoothstep(
      0.052,
      0.118,
      abs(face.x - eyeSeparation)
    ));
  float browRidge = (leftBrow + rightBrow) * browStrength;

  float cheek =
    (
      gaussianField(
        face,
        vec2(-0.238, -0.010),
        vec2(0.094, 0.058),
        0.0
      ) +
      gaussianField(
        face,
        vec2(0.238, -0.010),
        vec2(0.094, 0.058),
        0.0
      )
    ) *
    (0.22 + happy * 0.78 + excited * 0.82 + surprised * 0.15) *
    facePresence;

  float faceGate =
    smoothstep(0.035, 0.17, innerDepth) *
    organization;
  eyeSocket *= faceGate;
  mouthCavity *= faceGate;
  browRidge *= faceGate;
  eyeRim *= faceGate;
  mouthRim *= faceGate;
  iris *= faceGate;
  pupil *= faceGate;
  eyeSpark *= faceGate;
  ocularDome *= faceGate;
  lipRidge *= faceGate;
  smileCorner *= faceGate;
  cheek *= faceGate;

  float surfaceHeight =
    innerDepth +
    (membrane - 0.5) * 0.012 * fluidAlpha -
    eyeSocket * 0.078 -
    mouthCavity * 0.100 +
    ocularDome * 0.052 +
    lipRidge * 0.022 +
    cheek * 0.014 +
    browRidge * 0.028 +
    rim * 0.018;
  vec2 gradient = vec2(
    dFdx(surfaceHeight),
    dFdy(surfaceHeight)
  );
  vec3 normal = normalize(
    vec3(-gradient.x * 2.75, -gradient.y * 2.75, 0.57)
  );
  vec3 keyDirection = normalize(vec3(-0.48, 0.55, 0.68));
  vec3 fillDirection = normalize(vec3(0.62, -0.20, 0.70));
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float diffuse = 0.42 + 0.58 * sat(dot(normal, keyDirection));
  float fill = 0.22 * sat(dot(normal, fillDirection));
  float fresnel = pow(1.0 - sat(normal.z), 2.7);
  float specular = pow(
    sat(dot(reflect(-keyDirection, normal), viewDirection)),
    38.0
  );
  float softSpecular = pow(
    sat(dot(reflect(-fillDirection, normal), viewDirection)),
    14.0
  );

  vec3 gel = materialTint * (0.40 + diffuse * 0.66 + fill);
  gel +=
    materialTint *
    (membrane * 0.13 + caustic * 0.10 + cellular * 0.07) *
    innerDepth;
  float coreGlow = exp(
    -dot(
      fluidPoint * vec2(0.92, 1.04),
      fluidPoint * vec2(0.92, 1.04)
    ) *
      mix(2.2, 3.4, organization)
  );
  float broadHighlight = gaussianField(
    fluidPoint,
    vec2(-0.17, 0.25),
    vec2(0.28, 0.19),
    0.0
  );
  gel += materialTint * coreGlow * (0.055 + organization * 0.040);
  gel +=
    vec3(1.0, 0.98, 0.94) *
    broadHighlight *
    0.10 *
    fluidAlpha;
  gel +=
    vec3(1.0) * specular * 0.58 +
    materialTint * softSpecular * 0.22;
  gel +=
    spectral(baseHue + 0.12) *
    rim *
    (0.28 + fresnel * 0.52);
  gel +=
    moodTint *
    heartbeat *
    0.060 *
    innerDepth *
    max(organization, emotionEnvelope);
  gel +=
    moodSecondary *
    cheek *
    emotionEnvelope *
    0.10;
  gel *= mix(1.0, 0.90, u_light);

  float cavity = sat(eyeSocket * 0.58 + mouthCavity * 0.86);
  vec3 cavityTint =
    gel * 0.14 +
    materialTint * 0.08 +
    moodSecondary * 0.08 * emotionEnvelope;
  gel = mix(gel, cavityTint, cavity * 0.56);
  gel += materialTint * eyeRim * 0.21;
  gel += materialTint * mouthRim * 0.18;
  vec3 ocularColor = mix(
    vec3(0.050, 0.016, 0.135),
    moodSecondary * 0.40 + materialTint * 0.18,
    0.34
  );
  vec3 ocularRimColor = mix(
    materialTint,
    moodSecondary,
    0.48
  );
  gel = mix(gel, ocularColor, iris * 0.78);
  gel += ocularRimColor * eyeRim * 0.22;
  gel = mix(gel, vec3(0.004, 0.006, 0.020), pupil * 0.90);
  gel += vec3(1.24, 1.16, 1.30) * eyeSpark * 0.82;
  gel +=
    moodSecondary *
    iris *
    (0.08 + 0.18 * emotionEnvelope);
  float blush =
    cheek *
    (0.07 + happy * 0.18 + excited * 0.24) *
    facePresence;
  gel += mix(
    vec3(1.00, 0.19, 0.46),
    moodPrimary,
    0.22
  ) * blush;
  gel += materialTint * lipRidge * 0.11;

  float mirror = sat(
    0.24 +
    diffuse * 0.16 +
    specular * 1.25 +
    softSpecular * 0.44 +
    fresnel * 0.74 +
    (flowA - 0.5) * 0.14
  );
  vec3 metalShadow = mix(
    vec3(0.045, 0.055, 0.080),
    vec3(0.16, 0.18, 0.22),
    u_light
  );
  vec3 metalMid = mix(
    vec3(0.48, 0.54, 0.66),
    vec3(0.68, 0.72, 0.79),
    u_light
  );
  vec3 metalHighlight = mix(
    vec3(1.38, 1.48, 1.62),
    vec3(1.28, 1.36, 1.48),
    u_light
  );
  vec3 metal = mix(
    metalShadow,
    metalMid,
    smoothstep(0.12, 0.48, mirror)
  );
  metal = mix(
    metal,
    metalHighlight,
    smoothstep(0.50, 0.96, mirror)
  );
  metal += materialTint * (0.10 + rim * (0.22 + fresnel * 0.28));
  metal = mix(
    metal,
    metal * 0.22 + materialTint * 0.08,
    cavity * 0.56
  );
  metal += materialTint * (eyeRim + mouthRim) * 0.15;
  metal = mix(
    metal,
    mix(vec3(0.035, 0.012, 0.090), moodSecondary * 0.34, 0.38),
    iris * 0.70
  );
  metal = mix(metal, vec3(0.006, 0.008, 0.020), pupil * 0.88);
  metal += vec3(1.20, 1.14, 1.28) * eyeSpark * 0.70;
  float metalAmount = focus * organization;
  vec3 color = mix(gel, metal, metalAmount);

  float alpha =
    fluidAlpha * (0.88 + innerDepth * 0.10) +
    aura;
  alpha *= smoothstep(0.04, 0.72, intro);
  alpha *= 1.0 - cavity * 0.035;
  alpha = max(
    alpha,
    (eyeRim + mouthRim) * 0.025 * fluidAlpha
  );

  // Ordered dither remains a persistent property of both the latent fluid and
  // every temporary expression it organizes into.
  vec2 ditherCoordinate = floor(gl_FragCoord.xy);
  float orderedDither = bayer8(ditherCoordinate) - 0.5;
  float coarseDither =
    bayer8(
      floor(gl_FragCoord.xy * 0.5) +
      vec2(3.0, 5.0)
    ) -
    0.5;
  float edgeDither = (1.0 - innerDepth) * 0.95 + 0.24;
  float alphaLevels = 22.0;
  alpha = sat(
    floor(
      alpha * (alphaLevels - 1.0) +
      orderedDither * edgeDither +
      0.5
    ) /
      (alphaLevels - 1.0)
  );

  float colorLevels = 18.0;
  vec3 ditheredColor =
    floor(
      max(color, vec3(0.0)) * (colorLevels - 1.0) +
      orderedDither * 0.95 +
      0.5
    ) /
    (colorLevels - 1.0);
  float ditherInk =
    coarseDither *
    (0.046 + rim * 0.030 + membrane * 0.014) *
    fluidAlpha;
  color = max(
    vec3(0.0),
    mix(color, ditheredColor, 0.90) +
    materialTint * ditherInk
  );

  fragColor = vec4(color * alpha, alpha);
}
`;