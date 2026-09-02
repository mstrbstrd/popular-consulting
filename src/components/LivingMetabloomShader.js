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
  return fract(
    coordinate.x * 0.5
      + coordinate.y * coordinate.y * 0.75
  );
}

#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

float hash(vec2 point) {
  return fract(
    sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123
  );
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(
      hash(cell),
      hash(cell + vec2(1.0, 0.0)),
      blend.x
    ),
    mix(
      hash(cell + vec2(0.0, 1.0)),
      hash(cell + vec2(1.0, 1.0)),
      blend.x
    ),
    blend.y
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

mat2 rotate2(float angle) {
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
  if (hue < 0.5) {
    return mix(magenta, yellow, (hue - 0.25) * 4.0);
  }
  if (hue < 0.75) {
    return mix(yellow, violet, (hue - 0.5) * 4.0);
  }
  return mix(violet, cyan, (hue - 0.75) * 4.0);
}

float stateWeight(
  int index,
  int stateA,
  int stateB,
  float transition
) {
  float weightA = stateA == index ? 1.0 - transition : 0.0;
  float weightB = stateB == index ? transition : 0.0;
  return weightA + weightB;
}

float ellipseSdf(vec2 point, vec2 radii) {
  return length(point / max(radii, vec2(0.001))) - 1.0;
}

float smin(float a, float b, float smoothing) {
  float safeSmoothing = max(smoothing, 0.001);
  float blend = clamp(
    0.5 + 0.5 * (b - a) / safeSmoothing,
    0.0,
    1.0
  );
  return mix(b, a, blend)
    - safeSmoothing * blend * (1.0 - blend);
}

float gaussian(
  vec2 point,
  vec2 center,
  vec2 radii
) {
  vec2 delta = (point - center) / max(radii, vec2(0.001));
  return exp2(-dot(delta, delta) * 1.45);
}

float band(float distanceValue, float width) {
  return exp(-abs(distanceValue) / max(width, 0.0001));
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
  local.y += curve
    * local.x
    * local.x
    / max(width * width, 0.0001);
  return ellipseSdf(
    local,
    vec2(width, max(aperture, 0.006))
  );
}

float pulseField(vec2 uv) {
  vec2 aspect = vec2(
    u_res.x / max(u_res.y, 1.0),
    1.0
  );
  vec2 delta = (uv - u_pulseOrigin) * aspect;
  float radius = length(delta);
  float ringRadius = u_pulseAge * 0.22;
  float envelope = 1.0
    - smoothstep(2.6, 5.8, u_pulseAge);
  return exp(-abs(radius - ringRadius) * 42.0)
    * envelope;
}

void main() {
  vec2 aspect = vec2(
    u_res.x / max(u_res.y, 1.0),
    1.0
  );
  vec2 point = (v_uv * 2.0 - 1.0) * aspect;

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

  float companion = stateWeight(
    0,
    u_formA,
    u_formB,
    u_formMix
  );
  float bloom = stateWeight(
    1,
    u_formA,
    u_formB,
    u_formMix
  );
  float focus = stateWeight(
    2,
    u_formA,
    u_formB,
    u_formMix
  );
  float drift = stateWeight(
    3,
    u_formA,
    u_formB,
    u_formMix
  );

  float lifeSpeed = 0.70
    + excited * 0.64
    + surprised * 0.20
    - sleepy * 0.36
    - sad * 0.10
    + angry * 0.12;
  float livingTime = u_time * lifeSpeed;
  float breath = sin(
    livingTime * 1.08 + u_seed * TAU
  );
  float secondaryBreath = sin(
    livingTime * 0.61 - u_seed * 4.8
  );
  float heartbeat = pow(
    max(
      0.0,
      sin(livingTime * 1.78 + u_seed * 3.9)
    ),
    10.0
  );
  float pulse = pulseField(v_uv);
  float intro = smoothstep(0.0, 1.0, u_intro);

  point /= mix(0.78, 1.0, intro);

  vec2 formScale =
    companion * vec2(1.06, 1.06)
    + bloom * vec2(1.10, 1.10)
    + focus * vec2(0.78, 1.24)
    + drift * vec2(1.42, 0.80);
  float bodyAngle =
    drift * -0.09
    + thinking * 0.045
    + angry * 0.022
    + breath * 0.006;
  point = rotate2(bodyAngle) * point;
  vec2 organismPoint = point / max(
    formScale,
    vec2(0.25)
  );

  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect;
  pointer = rotate2(bodyAngle)
    * pointer
    / max(formScale, vec2(0.25));
  vec2 idleGaze = vec2(
    sin(livingTime * 0.19 + u_seed * 8.0),
    sin(livingTime * 0.14 - u_seed * 5.0)
  ) * 0.012;
  vec2 gaze = clamp(
    pointer * 0.18 + idleGaze,
    vec2(-0.088),
    vec2(0.088)
  );

  vec2 bodyLean = gaze * (0.13 + u_energy * 0.11);
  organismPoint -= bodyLean
    * exp(-dot(organismPoint, organismPoint) * 2.3);
  organismPoint.y -=
    happy * 0.012
    + excited * 0.028
    - sad * 0.066
    - sleepy * 0.040;
  organismPoint.x += thinking * 0.024;

  vec2 shapeWarp = vec2(
    noise(
      organismPoint * 1.55
        + vec2(livingTime * 0.032, -livingTime * 0.021)
    ),
    noise(
      organismPoint * 1.55
        + vec2(-livingTime * 0.026, livingTime * 0.030)
        + 17.7
    )
  ) - 0.5;
  float viscosity =
    0.024
    + bloom * 0.020
    + drift * 0.032
    + sleepy * 0.010
    - focus * 0.012;
  organismPoint += shapeWarp * viscosity;

  vec2 coreRadii = vec2(0.365, 0.415);
  coreRadii += vec2(
    surprised * 0.030
      + excited * 0.010
      + breath * 0.006,
    surprised * 0.034
      + excited * 0.014
      + breath * 0.008
  );
  coreRadii -= vec2(focus * 0.018, 0.0);
  coreRadii *= 1.0 + heartbeat * 0.010;

  vec2 coreCenter = vec2(
    0.0,
    -0.028
      + secondaryBreath * 0.006
      - sad * 0.026
      - sleepy * 0.014
  );
  float shape = ellipseSdf(
    organismPoint - coreCenter,
    coreRadii
  );
  float coreWeight = gaussian(
    organismPoint,
    coreCenter,
    coreRadii
  );
  float potential = coreWeight * 1.20;
  vec3 tintAccumulator = spectral(
    0.68
      + livingTime * 0.010
      + u_seed * 0.11
  ) * coreWeight;
  float tintWeight = coreWeight;

  float spread =
    0.315
    + bloom * 0.090
    + drift * 0.025
    - focus * 0.045
    + surprised * 0.014
    + pulse * 0.012;
  float unionSmoothing =
    0.195
    + companion * 0.025
    + focus * 0.040
    - bloom * 0.055;

  for (int lobeIndex = 0; lobeIndex < 7; lobeIndex++) {
    float lobe = float(lobeIndex);
    float baseAngle = PI * 0.5 + lobe / 7.0 * TAU;
    float lobeWobble = sin(
      livingTime * (0.11 + lobe * 0.004)
        + lobe * 1.71
        + u_seed * TAU
    ) * (
      0.018
        + excited * 0.024
        + drift * 0.014
        - focus * 0.008
        - sleepy * 0.006
    );
    float lobeAngle = baseAngle + lobeWobble;
    vec2 direction = vec2(
      cos(lobeAngle),
      sin(lobeAngle)
    );

    float crown = smoothstep(
      0.15,
      0.95,
      direction.y
    );
    float side = smoothstep(
      0.45,
      0.95,
      abs(direction.x)
    );
    float lower = smoothstep(
      0.05,
      0.95,
      -direction.y
    );

    vec2 center = direction * vec2(
      spread,
      spread * 0.90
    );
    center.x *= 1.0 + drift * (
      0.30 + 0.12 * direction.x
    );
    center.y *= 1.0 - drift * 0.16;
    center.y -= (
      sad * 0.058
        + sleepy * 0.030
    ) * max(0.0, direction.y);
    center.y += happy
      * 0.012
      * max(0.0, direction.y);
    center.x *= 1.0
      - focus * 0.14
      - angry * 0.08;
    center.y *= 1.0 + focus * 0.12;
    center += gaze * (
      0.035 + 0.015 * sin(lobe * 2.0)
    );

    vec2 companionRadii = vec2(
      0.222 + crown * 0.026 + side * 0.010,
      0.205 + crown * 0.018 + lower * 0.018
    );
    vec2 bloomRadii = vec2(
      0.252 + crown * 0.024,
      0.174 + lower * 0.010
    );
    vec2 focusRadii = vec2(0.188, 0.222);
    vec2 driftRadii = vec2(0.246, 0.168);

    vec2 radii =
      companion * companionRadii
      + bloom * bloomRadii
      + focus * focusRadii
      + drift * driftRadii;
    radii += vec2(
      excited * 0.010 + surprised * 0.010,
      excited * 0.008 + surprised * 0.012
    );
    radii *= 1.0
      + breath * (0.012 + bloom * 0.012);
    radii *= 1.0 - angry * 0.035;

    if (lobeIndex == 1) {
      radii *= 1.0 + thinking * 0.18;
      center += vec2(0.030, 0.028) * thinking;
    }
    if (
      lobeIndex == 4
      || lobeIndex == 5
    ) {
      radii *= 1.0 + sad * 0.08;
    }

    vec2 local = rotate2(
      -lobeAngle * 0.26
    ) * (organismPoint - center);
    float lobeShape = ellipseSdf(local, radii);
    shape = smin(
      shape,
      lobeShape,
      unionSmoothing
    );

    float lobeWeight = gaussian(
      local,
      vec2(0.0),
      radii
    );
    potential += lobeWeight * 0.72;
    tintAccumulator += spectral(
      0.06
        + lobe / 7.0 * 0.88
        + livingTime * 0.008
        + u_seed * 0.14
    ) * lobeWeight;
    tintWeight += lobeWeight;
  }

  if (excited > 0.001) {
    vec2 satelliteCenter = vec2(
      cos(livingTime * 0.74 + u_seed * 5.0),
      sin(livingTime * 0.74 + u_seed * 5.0)
    ) * 0.50;
    float satelliteShape = ellipseSdf(
      organismPoint - satelliteCenter,
      vec2(0.052)
    );
    shape = smin(
      shape,
      satelliteShape,
      0.060 * excited + 0.001
    );
    float satelliteWeight = gaussian(
      organismPoint,
      satelliteCenter,
      vec2(0.052)
    ) * excited;
    potential += satelliteWeight * 0.36;
    tintAccumulator += spectral(
      0.08 + livingTime * 0.020
    ) * satelliteWeight;
    tintWeight += satelliteWeight;
  }

  if (thinking > 0.001) {
    float thoughtRise = fract(
      livingTime * 0.070 + u_seed
    );
    vec2 thoughtCenter = vec2(
      0.34,
      0.27 + thoughtRise * 0.18
    );
    vec2 thoughtRadii = vec2(
      mix(0.052, 0.020, thoughtRise)
    );
    float thoughtShape = ellipseSdf(
      organismPoint - thoughtCenter,
      thoughtRadii
    );
    shape = smin(
      shape,
      thoughtShape,
      0.052 * thinking + 0.001
    );
    float thoughtWeight = gaussian(
      organismPoint,
      thoughtCenter,
      vec2(0.050)
    ) * thinking * (1.0 - thoughtRise);
    potential += thoughtWeight * 0.34;
    tintAccumulator += spectral(
      0.48 + thoughtRise * 0.18
    ) * thoughtWeight;
    tintWeight += thoughtWeight;
  }

  float pointerPresence = smoothstep(
    0.10,
    0.42,
    length(pointer)
  );
  float attention = sat(
    u_energy * pointerPresence
  );
  if (attention > 0.001) {
    vec2 reachDirection = normalize(
      pointer + vec2(0.0001)
    );
    float directionAngle = atan(
      reachDirection.y,
      reachDirection.x
    );
    vec2 reachCenter = reachDirection * (
      0.43 + 0.035 * attention
    );
    vec2 reachLocal = rotate2(
      -directionAngle
    ) * (organismPoint - reachCenter);
    vec2 reachRadii = vec2(
      0.135 + 0.035 * attention,
      0.092 + 0.012 * attention
    );
    float reachShape = ellipseSdf(
      reachLocal,
      reachRadii
    );
    shape = smin(
      shape,
      reachShape,
      0.070 + 0.080 * attention
    );
    float reachWeight = gaussian(
      reachLocal,
      vec2(0.0),
      reachRadii
    ) * attention;
    potential += reachWeight * 0.46;
    tintAccumulator += spectral(
      0.50 + livingTime * 0.018
    ) * reachWeight;
    tintWeight += reachWeight;
  }

  if (shape > 0.14) {
    fragColor = vec4(0.0);
    return;
  }

  float antialiasWidth = max(
    fwidth(shape),
    0.002
  );
  float bodyAlpha = 1.0 - smoothstep(
    -antialiasWidth,
    antialiasWidth * 1.5,
    shape
  );
  float rim = exp(-abs(shape) * 38.0);
  float innerDepth = sat(-shape * 2.40);
  float aura = exp(
    -max(shape, 0.0) * 34.0
  ) * (1.0 - bodyAlpha) * 0.13;

  float flowA = fbm(
    rotate2(0.52) * organismPoint * 1.52
      + vec2(
        livingTime * 0.026,
        -livingTime * 0.019
      )
      + u_seed * 3.2
  );
  float flowB = fbm(
    rotate2(-0.73) * organismPoint * 2.18
      + vec2(
        -livingTime * 0.017,
        livingTime * 0.022
      )
      + vec2(9.7, 13.1)
  );
  float membrane = 0.5 + 0.5 * sin(
    potential * 4.20
      + flowA * 5.40
      + flowB * 3.20
      + livingTime * 0.18
      + breath * 0.22
  );
  float cellular = pow(
    sat(1.0 - abs(flowA - flowB) * 2.10),
    3.0
  );
  float caustic = pow(
    0.5 + 0.5 * sin(
      (
        organismPoint.x * 0.66
          + organismPoint.y * 0.92
      ) * 13.0
        + flowB * 5.20
        - flowA * 2.00
        - livingTime * 0.14
    ),
    5.0
  );

  float baseHue =
    0.02
    + organismPoint.x * 0.24
    + organismPoint.y * 0.17
    + (flowA - 0.5) * 0.52
    + (flowB - 0.5) * 0.20
    + potential * 0.028
    + livingTime * 0.010
    + u_seed * 0.13;
  vec3 lobeTint = tintAccumulator
    / max(tintWeight, 0.001);
  vec3 spectralPrimary = spectral(baseHue);
  vec3 spectralSecondary = spectral(
    baseHue + 0.31
  );
  vec3 baseTint = mix(
    spectralPrimary,
    spectralSecondary,
    sat(cellular * 0.62 + membrane * 0.24)
  );
  baseTint = mix(
    baseTint,
    lobeTint,
    0.34 + rim * 0.08
  );

  vec3 moodPrimary =
    happy * vec3(1.00, 0.63, 0.20)
    + excited * vec3(1.00, 0.03, 0.70)
    + sad * vec3(0.12, 0.40, 1.00)
    + surprised * vec3(0.40, 0.94, 1.00)
    + thinking * vec3(0.08, 0.88, 0.68)
    + sleepy * vec3(0.24, 0.18, 0.90)
    + angry * vec3(1.00, 0.10, 0.12);
  vec3 moodSecondary =
    happy * vec3(0.08, 0.96, 0.78)
    + excited * vec3(1.00, 0.90, 0.08)
    + sad * vec3(0.30, 0.08, 0.84)
    + surprised * vec3(0.90, 0.52, 1.00)
    + thinking * vec3(0.52, 0.12, 1.00)
    + sleepy * vec3(0.06, 0.48, 1.00)
    + angry * vec3(1.00, 0.52, 0.04);
  float emotionEnvelope =
    smoothstep(0.0, 0.20, u_emotionAge)
    * (
      1.0
        - smoothstep(
          2.1,
          6.4,
          u_emotionAge
        )
    );
  vec3 moodTint = mix(
    moodPrimary,
    moodSecondary,
    sat(flowA * 0.70 + membrane * 0.30)
  );
  vec3 materialTint = mix(
    baseTint,
    moodTint,
    emotionEnvelope * 0.76
  );
  materialTint = mix(
    materialTint,
    spectral(baseHue + 0.18),
    pulse * (0.24 + u_energy * 0.32)
  );

  float organellePhase =
    livingTime * 0.18 + u_seed * TAU;
  vec2 organelleCenterA = vec2(
    cos(organellePhase),
    sin(organellePhase * 0.87)
  ) * vec2(0.18, 0.13);
  vec2 organelleCenterB = vec2(
    sin(-organellePhase * 0.71 + 1.8),
    cos(organellePhase * 0.63 - 0.9)
  ) * vec2(0.22, 0.16);
  vec2 organelleCenterC = vec2(
    cos(organellePhase * 0.49 + 2.4),
    sin(-organellePhase * 0.58 + 0.5)
  ) * vec2(0.14, 0.20);
  float organelleA = gaussian(
    organismPoint,
    organelleCenterA,
    vec2(0.080, 0.064)
  );
  float organelleB = gaussian(
    organismPoint,
    organelleCenterB,
    vec2(0.062, 0.082)
  );
  float organelleC = gaussian(
    organismPoint,
    organelleCenterC,
    vec2(0.050, 0.050)
  );
  float organelleField = sat(
    organelleA + organelleB + organelleC
  ) * innerDepth;

  vec2 facePoint = organismPoint
    - vec2(0.0, 0.016);

  float leftOpen =
    0.052
    + excited * 0.018
    + surprised * 0.032
    - happy * 0.020
    - sleepy * 0.040
    - angry * 0.012;
  float rightOpen =
    leftOpen - thinking * 0.024;
  leftOpen = max(0.008, leftOpen);
  rightOpen = max(0.008, rightOpen);

  float blink = pow(
    max(
      0.0,
      sin(livingTime * 0.55 + u_seed * 17.0)
    ),
    46.0
  );
  leftOpen *= 1.0 - blink * 0.92;
  rightOpen *= 1.0 - blink * 0.92;

  float eyeWidth =
    0.082
    + excited * 0.008
    + surprised * 0.012
    - angry * 0.006;
  float eyeCurve =
    -0.10 * happy
    + 0.16 * sad
    - 0.06 * sleepy;
  float leftSlant =
    angry * 0.18
    - sad * 0.08
    - thinking * 0.02;
  float rightSlant =
    -angry * 0.18
    + sad * 0.08
    + thinking * 0.11;

  vec2 leftEyeCenter =
    vec2(-0.145, 0.092)
    + gaze * vec2(0.26, 0.20);
  vec2 rightEyeCenter =
    vec2(0.145, 0.092)
    + gaze * vec2(0.26, 0.20);

  float leftEyeDistance = eyeDistance(
    facePoint,
    leftEyeCenter,
    eyeWidth,
    leftOpen,
    eyeCurve,
    leftSlant
  );
  float rightEyeDistance = eyeDistance(
    facePoint,
    rightEyeCenter,
    eyeWidth,
    rightOpen,
    eyeCurve,
    rightSlant
  );

  float leftOpenGate = smoothstep(
    0.014,
    0.034,
    leftOpen
  );
  float rightOpenGate = smoothstep(
    0.014,
    0.034,
    rightOpen
  );
  float leftEyeInterior = (
    1.0
      - smoothstep(
        -0.035,
        0.045,
        leftEyeDistance
      )
  ) * leftOpenGate;
  float rightEyeInterior = (
    1.0
      - smoothstep(
        -0.035,
        0.045,
        rightEyeDistance
      )
  ) * rightOpenGate;
  float leftCrease = band(
    leftEyeDistance,
    0.012
  ) * (1.0 - leftOpenGate * 0.70);
  float rightCrease = band(
    rightEyeDistance,
    0.012
  ) * (1.0 - rightOpenGate * 0.70);
  float eyeSocket = max(
    max(leftEyeInterior, rightEyeInterior),
    max(leftCrease, rightCrease) * 0.64
  );
  float eyeRim = sat(
    band(leftEyeDistance, 0.010) * leftOpenGate
      + band(rightEyeDistance, 0.010) * rightOpenGate
  );

  vec2 irisOffset = gaze * 0.40;
  float leftIris = gaussian(
    facePoint,
    leftEyeCenter + irisOffset,
    vec2(0.033, 0.036)
  ) * leftOpenGate;
  float rightIris = gaussian(
    facePoint,
    rightEyeCenter + irisOffset,
    vec2(0.033, 0.036)
  ) * rightOpenGate * (1.0 - thinking * 0.48);
  float iris = sat(leftIris + rightIris);

  float leftPupil = gaussian(
    facePoint,
    leftEyeCenter + irisOffset,
    vec2(0.012, 0.017)
  ) * leftOpenGate;
  float rightPupil = gaussian(
    facePoint,
    rightEyeCenter + irisOffset,
    vec2(0.012, 0.017)
  ) * rightOpenGate * (1.0 - thinking * 0.48);
  float pupil = sat(leftPupil + rightPupil);

  float eyeSpark = sat(
    gaussian(
      facePoint,
      leftEyeCenter
        + irisOffset
        + vec2(-0.011, 0.013),
      vec2(0.005)
    )
      + gaussian(
        facePoint,
        rightEyeCenter
          + irisOffset
          + vec2(-0.011, 0.013),
        vec2(0.005)
      )
  ) * sat(leftOpenGate + rightOpenGate);

  float mouthX = facePoint.x;
  float neutralMouthY =
    -0.120 + mouthX * 0.022;
  float happyMouthY =
    -0.108 + mouthX * mouthX * 1.03;
  float sadMouthY =
    -0.078 - mouthX * mouthX * 0.84;
  float mouthY = neutralMouthY
    + (
      happyMouthY - neutralMouthY
    ) * (happy + excited * 0.76)
    + (
      sadMouthY - neutralMouthY
    ) * sad
    + angry * (-0.006 - mouthX * 0.16)
    + thinking * (0.008 + mouthX * 0.13);

  float mouthWidth =
    0.110
    + happy * 0.020
    + excited * 0.026
    - sleepy * 0.042
    - angry * 0.012;
  float mouthGate = 1.0 - smoothstep(
    mouthWidth * 0.76,
    mouthWidth,
    abs(mouthX)
  );
  float mouthCrease = exp(
    -abs(facePoint.y - mouthY) * 104.0
  ) * mouthGate;

  float talkCycle =
    0.5
    + 0.5 * sin(
      u_time * 11.2 + u_seed * 4.4
    );
  float mouthOpenAmount =
    u_talking * (0.019 + talkCycle * 0.033)
    + surprised * 0.064
    + excited * 0.034;
  float mouthDistance = ellipseSdf(
    facePoint - vec2(0.0, -0.122),
    vec2(
      0.058 + surprised * 0.012,
      max(0.010, mouthOpenAmount)
    )
  );
  float mouthOpenGate = sat(
    u_talking
      + surprised
      + excited * 0.62
  );
  float mouthInterior = (
    1.0
      - smoothstep(
        -0.05,
        0.05,
        mouthDistance
      )
  ) * mouthOpenGate;
  float mouthRim = band(
    mouthDistance,
    0.013
  ) * mouthOpenGate;
  float mouthCavity = max(
    mouthCrease * 0.58,
    mouthInterior
  );

  float browStrength = sat(
    angry
      + sad * 0.64
      + thinking * 0.52
  );
  float browY = 0.194;
  float leftBrowY =
    browY + leftSlant * (facePoint.x + 0.145);
  float rightBrowY =
    browY + rightSlant * (facePoint.x - 0.145);
  float leftBrow = exp(
    -abs(facePoint.y - leftBrowY) * 78.0
  ) * (
    1.0
      - smoothstep(
        0.052,
        0.118,
        abs(facePoint.x + 0.145)
      )
  );
  float rightBrow = exp(
    -abs(facePoint.y - rightBrowY) * 78.0
  ) * (
    1.0
      - smoothstep(
        0.052,
        0.118,
        abs(facePoint.x - 0.145)
      )
  );
  float browRidge = (
    leftBrow + rightBrow
  ) * browStrength;

  float cheek = (
    gaussian(
      facePoint,
      vec2(-0.232, -0.002),
      vec2(0.080, 0.044)
    )
      + gaussian(
        facePoint,
        vec2(0.232, -0.002),
        vec2(0.080, 0.044)
      )
  ) * (happy + excited * 0.72);

  float faceGate = smoothstep(
    0.045,
    0.18,
    innerDepth
  );
  eyeSocket *= faceGate;
  eyeRim *= faceGate;
  iris *= faceGate;
  pupil *= faceGate;
  eyeSpark *= faceGate;
  mouthCavity *= faceGate;
  mouthRim *= faceGate;
  browRidge *= faceGate;
  cheek *= faceGate;

  float surfaceHeight =
    innerDepth
    - eyeSocket * 0.072
    - mouthCavity * 0.082
    + browRidge * 0.030
    + rim * 0.018
    + (
      membrane - 0.5
    ) * 0.011 * bodyAlpha;
  vec2 surfaceGradient = vec2(
    dFdx(surfaceHeight),
    dFdy(surfaceHeight)
  );
  vec3 normal = normalize(
    vec3(
      -surfaceGradient.x * 2.55,
      -surfaceGradient.y * 2.55,
      0.62
    )
  );

  vec3 keyDirection = normalize(
    vec3(-0.48, 0.55, 0.68)
  );
  vec3 fillDirection = normalize(
    vec3(0.62, -0.20, 0.70)
  );
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float keyDiffuse = sat(
    dot(normal, keyDirection)
  );
  float fillDiffuse = sat(
    dot(normal, fillDirection)
  );
  float fresnel = pow(
    1.0 - sat(normal.z),
    2.6
  );
  float keySpecular = pow(
    sat(
      dot(
        reflect(-keyDirection, normal),
        viewDirection
      )
    ),
    40.0
  );
  float softSpecular = pow(
    sat(
      dot(
        reflect(-fillDirection, normal),
        viewDirection
      )
    ),
    16.0
  );

  float volumeLight =
    0.44
    + keyDiffuse * 0.54
    + fillDiffuse * 0.16;
  float lowerShadow = smoothstep(
    0.34,
    -0.42,
    organismPoint.y
  );
  volumeLight *= 1.0 - lowerShadow * 0.08;

  vec3 gel = materialTint * volumeLight;
  gel += spectralSecondary
    * (
      membrane * 0.12
        + cellular * 0.08
        + caustic * 0.08
    ) * innerDepth;
  gel += spectralPrimary
    * organelleField
    * (
      0.12 + emotionEnvelope * 0.08
    );
  gel += spectral(
    baseHue + 0.46
  ) * organelleA * innerDepth * 0.08;
  gel += spectral(
    baseHue + 0.18
  ) * organelleB * innerDepth * 0.07;
  gel += vec3(1.0)
    * keySpecular
    * 0.42;
  gel += materialTint
    * softSpecular
    * 0.18;
  gel += spectral(
    baseHue + 0.12
  ) * rim * (0.24 + fresnel * 0.44);
  gel += moodTint
    * heartbeat
    * 0.050
    * innerDepth;
  gel += moodSecondary
    * cheek
    * emotionEnvelope
    * 0.09;

  float cavity = sat(
    eyeSocket * 0.62
      + mouthCavity * 0.76
  );
  vec3 sensoryDepth = mix(
    materialTint * 0.34,
    spectral(baseHue + 0.40) * 0.26,
    0.42
  );
  gel = mix(
    gel,
    sensoryDepth,
    cavity * 0.62
  );
  gel += (
    materialTint * 0.38
      + spectralSecondary * 0.18
  ) * eyeRim;
  gel += (
    materialTint * 0.34
      + spectralPrimary * 0.14
  ) * mouthRim;

  vec3 irisColor = mix(
    spectral(baseHue + 0.34),
    moodSecondary,
    emotionEnvelope * 0.62
  );
  gel = mix(
    gel,
    irisColor * 0.72 + materialTint * 0.18,
    iris * 0.70
  );
  gel = mix(
    gel,
    spectral(baseHue + 0.58) * 0.10
      + materialTint * 0.05,
    pupil * 0.68
  );
  gel += vec3(1.0, 0.98, 0.92)
    * eyeSpark
    * 0.36;

  float mouthInner = mouthInterior
    * gaussian(
      facePoint,
      vec2(0.0, -0.122),
      vec2(0.044, 0.028)
    );
  gel += mix(
    spectral(baseHue + 0.54),
    moodPrimary,
    emotionEnvelope
  ) * mouthInner * 0.16;

  gel *= mix(1.0, 0.92, u_light);

  float mirror = sat(
    0.20
      + keyDiffuse * 0.14
      + keySpecular * 1.30
      + softSpecular * 0.44
      + fresnel * 0.78
      + (flowA - 0.5) * 0.16
  );
  vec3 metalShadow = mix(
    vec3(0.035, 0.048, 0.080),
    vec3(0.16, 0.18, 0.23),
    u_light
  );
  vec3 metalMid = mix(
    vec3(0.44, 0.52, 0.68),
    vec3(0.68, 0.72, 0.80),
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
  metal += materialTint * (
    0.08 + rim * (0.22 + fresnel * 0.28)
  );
  metal = mix(
    metal,
    metal * 0.34 + sensoryDepth * 0.22,
    cavity * 0.55
  );
  metal += materialTint
    * (eyeRim + mouthRim)
    * 0.12;
  metal = mix(
    metal,
    irisColor * 0.56 + metal * 0.24,
    iris * 0.48
  );
  metal = mix(
    metal,
    vec3(0.010, 0.016, 0.034),
    pupil * 0.66
  );

  vec3 color = mix(gel, metal, focus);

  float alpha =
    bodyAlpha * (0.91 + innerDepth * 0.075)
    + aura;
  alpha *= smoothstep(0.04, 0.72, intro);
  alpha *= 1.0 - cavity * 0.018;
  alpha = max(
    alpha,
    (eyeRim + mouthRim) * 0.020 * bodyAlpha
  );

  float dither = bayer8(gl_FragCoord.xy) - 0.5;
  float edgeDither =
    (1.0 - innerDepth) * 0.44 + 0.12;
  alpha = sat(
    floor(alpha * 64.0 + dither * edgeDither)
      / 63.0
  );
  color = max(
    vec3(0.0),
    floor(color * 80.0 + dither * 0.28)
      / 79.0
  );

  fragColor = vec4(color * alpha, alpha);
}`;
