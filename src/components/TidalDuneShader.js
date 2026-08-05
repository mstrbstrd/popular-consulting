export const DITHER_WORLD_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const DITHER_WORLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_phase;
uniform vec2 u_pointer;
uniform vec2 u_motion;
uniform float u_stillness;
uniform vec4 u_impulse;
uniform float u_paletteMix;
uniform float u_themeMix;
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_naturalCharCount;
uniform int u_classicCharCount;
uniform int u_classicCharOffset;
uniform int u_atlasCols;
uniform int u_atlasRows;
uniform float u_intro;
uniform float u_passMix;

#define PI 3.14159265359
#define TAU 6.28318530718

struct WorldSample {
  vec3 color;
  float field;
  float material;
};

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
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise2(p);
    p = p * 2.03 + vec2(11.2, 17.4);
    amplitude *= 0.5;
  }
  return value;
}

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float belowMask(float y, float height, float softness) {
  return 1.0 - smoothstep(height - softness, height + softness, y);
}

float lineMask(float value, float width) {
  return 1.0 - smoothstep(width, width * 1.85, abs(value));
}

float segmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 offset = point - start;
  vec2 segment = end - start;
  float amount = clamp(dot(offset, segment) / dot(segment, segment), 0.0, 1.0);
  return length(offset - segment * amount);
}

vec3 hsb2rgb(float h, float s, float b) {
  vec3 c = clamp(
    abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
    0.0,
    1.0
  );
  return b * mix(vec3(1.0), c, s);
}

vec3 classicRainbow(float brightness, vec2 gradient, float material) {
  float hue = atan(gradient.y, gradient.x) / TAU
    + brightness * 0.48
    + material * 0.10
    + v_uv.x * 0.08
    - v_uv.y * 0.04
    + fract(u_time * 0.018 + u_phase * 0.10);
  hue = fract(hue);

  vec3 raw = hsb2rgb(hue, 1.0, 1.0);
  float currentLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = min(raw * (0.74 / max(currentLuminance, 0.10)), vec3(1.0));
  float boostedLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = mix(vec3(boostedLuminance), raw, 1.48);
  return clamp(raw, vec3(0.0), vec3(1.0));
}

float farDuneHeight(float x) {
  return 0.425
    + 0.032 * sin(x * 5.2 + 0.8)
    + 0.055 * (fbm(vec2(x * 3.0, 2.0)) - 0.5);
}

float middleDuneHeight(float x) {
  return 0.305
    + 0.060 * sin(x * 4.7 - 1.1)
    + 0.090 * (fbm(vec2(x * 3.8, 8.2)) - 0.48);
}

float nearDuneHeight(float x, float cameraLift) {
  return 0.175
    + 0.050 * sin(x * 6.0 + 2.0)
    + 0.075 * (fbm(vec2(x * 5.4, 12.8)) - 0.42)
    + cameraLift * 0.18;
}

float shorelineHeight(float x, float cameraLift, float time) {
  return 0.235
    + 0.020 * sin(x * 8.5 + time * 0.10)
    + 0.026 * (fbm(vec2(x * 5.0 - time * 0.028, 5.4)) - 0.5)
    + cameraLift * 0.065;
}

vec3 skyColor(vec2 uv, float day, float twilight) {
  vec3 dayTop = vec3(0.16, 0.42, 0.68);
  vec3 dayHorizon = vec3(0.96, 0.81, 0.60);
  vec3 duskTop = vec3(0.16, 0.12, 0.36);
  vec3 duskHorizon = vec3(0.93, 0.46, 0.25);
  vec3 nightTop = vec3(0.012, 0.028, 0.090);
  vec3 nightHorizon = vec3(0.095, 0.125, 0.245);

  vec3 top = mix(nightTop, duskTop, twilight);
  top = mix(top, dayTop, day);
  vec3 horizon = mix(nightHorizon, duskHorizon, twilight);
  horizon = mix(horizon, dayHorizon, day);

  vec3 color = mix(horizon, top, smoothstep(0.30, 1.0, uv.y));
  color += vec3(0.05, 0.03, 0.02)
    * twilight
    * exp(-abs(uv.y - 0.48) * 5.0);
  return color;
}

vec3 shadeDune(
  vec3 nightColor,
  vec3 dayColor,
  float x,
  float height,
  float leftHeight,
  float rightHeight,
  vec2 lightPosition,
  float day,
  float twilight
) {
  float slope = (rightHeight - leftHeight) / 0.008;
  vec2 normal = normalize(vec2(-slope, 1.0));
  vec2 lightDirection = normalize(lightPosition - vec2(x, height));
  float directional = dot(normal, lightDirection) * 0.5 + 0.5;
  float brightness = mix(
    0.26 + directional * 0.28,
    0.54 + directional * 0.60,
    day
  );
  brightness += twilight * directional * 0.15;
  return mix(nightColor, dayColor, sat(day + twilight * 0.38)) * brightness;
}

WorldSample tidalDune(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  float solarAngle = (u_phase - 0.25) * TAU;
  float solarAltitude = sin(solarAngle);
  float day = smoothstep(-0.10, 0.30, solarAltitude);
  float night = 1.0 - smoothstep(-0.48, 0.08, solarAltitude);
  float twilight = exp(-abs(solarAltitude) * 4.2) * (1.0 - day * 0.22);
  float observerMotion = sat(length(u_motion));
  float cameraShift = (u_pointer.x - 0.5) * 0.060;
  float cameraLift = (u_pointer.y - 0.5) * 0.050;

  vec2 sunPosition = vec2(
    0.5 - 0.58 * cos(solarAngle) + cameraShift * 0.20,
    0.51 + 0.35 * sin(solarAngle)
  );
  vec2 moonPosition = vec2(
    0.5 - 0.58 * cos(solarAngle + PI) + cameraShift * 0.14,
    0.51 + 0.33 * sin(solarAngle + PI)
  );
  vec2 activeLight = mix(moonPosition, sunPosition, day);
  vec3 color = skyColor(uv, day, twilight);

  float windVelocity = 0.22
    + u_motion.x * 1.45
    + (1.0 - u_stillness) * 0.28;
  float clouds = fbm(vec2(
    uv.x * 3.2 + time * (0.010 + windVelocity * 0.020),
    uv.y * 7.6
  ));
  float cloudBand = exp(-pow((uv.y - 0.72) / 0.17, 2.0))
    * smoothstep(0.50, 0.72, clouds);
  vec3 cloudColor = mix(
    vec3(0.30, 0.34, 0.46),
    vec3(0.96, 0.86, 0.72),
    day
  );
  cloudColor = mix(cloudColor, vec3(0.73, 0.45, 0.42), twilight * 0.42);
  color = mix(color, cloudColor, cloudBand * (0.12 + twilight * 0.18));

  float sunDistance = length((uv - sunPosition) * vec2(aspect, 1.0));
  float sunVisible = smoothstep(-0.16, 0.06, solarAltitude);
  float sunDisc = 1.0 - smoothstep(0.050, 0.064, sunDistance);
  float sunHalo = exp(-sunDistance * 8.2) * sunVisible;
  color += vec3(1.00, 0.55, 0.18)
    * sunHalo
    * (0.18 + day * 0.26 + twilight * 0.24);
  color = mix(color, vec3(1.0, 0.94, 0.75), sunDisc * sunVisible);

  float moonDistance = length((uv - moonPosition) * vec2(aspect, 1.0));
  float moonVisible = smoothstep(-0.16, 0.06, -solarAltitude);
  float moonDisc = 1.0 - smoothstep(0.044, 0.057, moonDistance);
  float moonHalo = exp(-moonDistance * 10.5) * moonVisible;
  color += vec3(0.34, 0.58, 0.94)
    * moonHalo
    * (0.18 + night * 0.58);
  color = mix(color, vec3(0.91, 0.95, 0.97), moonDisc * moonVisible);

  vec2 starCell = floor(uv * vec2(170.0, 102.0));
  float starHash = hash21(starCell);
  float stars = step(0.984, starHash)
    * smoothstep(0.42, 1.0, uv.y)
    * night
    * mix(0.58, 1.0, u_stillness);
  stars *= 0.62 + 0.38 * sin(time * 1.4 + starHash * 24.0);
  color += vec3(0.72, 0.83, 0.98) * stars * 0.86;

  float meteorCycle = fract(time * 0.020 + 0.37);
  float meteorWindow = (1.0 - smoothstep(0.09, 0.13, meteorCycle))
    * smoothstep(0.0, 0.018, meteorCycle);
  vec2 meteorHead = vec2(
    0.88 - meteorCycle * 2.7,
    0.86 - meteorCycle * 0.62
  );
  vec2 meteorPoint = (uv - meteorHead) * vec2(aspect, 1.0);
  float meteor = 1.0 - smoothstep(
    0.002,
    0.006,
    segmentDistance(meteorPoint, vec2(0.0), vec2(0.12, 0.028))
  );
  color += vec3(0.75, 0.89, 1.0)
    * meteor
    * meteorWindow
    * night
    * u_stillness
    * 0.85;

  float duneX = uv.x + cameraShift;
  float farHeight = farDuneHeight(duneX);
  float middleHeight = middleDuneHeight(duneX);
  float foregroundHeight = nearDuneHeight(duneX, cameraLift);
  float farMask = belowMask(uv.y, farHeight, 0.010);
  float middleMask = belowMask(uv.y, middleHeight, 0.012);
  float foregroundMask = belowMask(uv.y, foregroundHeight, 0.014);

  vec3 farColor = shadeDune(
    vec3(0.100, 0.130, 0.205),
    vec3(0.54, 0.39, 0.27),
    duneX,
    farHeight,
    farDuneHeight(duneX - 0.004),
    farDuneHeight(duneX + 0.004),
    activeLight,
    day,
    twilight
  );
  vec3 middleColor = shadeDune(
    vec3(0.060, 0.082, 0.135),
    vec3(0.76, 0.52, 0.31),
    duneX,
    middleHeight,
    middleDuneHeight(duneX - 0.004),
    middleDuneHeight(duneX + 0.004),
    activeLight,
    day,
    twilight
  );
  vec3 foregroundColor = shadeDune(
    vec3(0.035, 0.050, 0.082),
    vec3(0.88, 0.64, 0.39),
    duneX,
    foregroundHeight,
    nearDuneHeight(duneX - 0.004, cameraLift),
    nearDuneHeight(duneX + 0.004, cameraLift),
    activeLight,
    day,
    twilight
  );

  color = mix(color, farColor, farMask * 0.88);
  color = mix(color, middleColor, middleMask * 0.96);

  float middleRidges = lineMask(
    uv.y - (middleHeight - 0.011 * sin(duneX * 22.0 + time * 0.10)),
    0.0055
  ) * middleMask;
  color = mix(
    color,
    mix(
      vec3(0.22, 0.28, 0.38),
      vec3(0.98, 0.78, 0.51),
      day + twilight * 0.45
    ),
    middleRidges * (0.12 + day * 0.12)
  );

  float shore = shorelineHeight(duneX, cameraLift, time);
  float waterMask = smoothstep(shore + 0.008, shore - 0.012, uv.y);
  float waterDepth = sat((shore - uv.y) / max(shore, 0.08));
  float roughness = mix(0.24, 1.0, 1.0 - u_stillness)
    + observerMotion * 0.65;
  float waveA = sin(
    uv.x * (52.0 + roughness * 12.0)
    - time * (1.15 + windVelocity * 0.42)
    + sin(uv.y * 31.0 + time * 0.62) * (1.4 + roughness)
  );
  float waveB = sin(
    uv.x * 97.0
    - time * (0.70 + windVelocity * 0.24)
    + uv.y * 76.0
  );
  float wave = waveA + waveB * 0.45;

  vec2 reflectedUv = vec2(
    uv.x + cameraShift * 0.16 + wave * 0.0018 * roughness,
    shore + (shore - uv.y)
  );
  vec3 reflectedSky = skyColor(reflectedUv, day, twilight);
  vec3 waterBase = mix(
    vec3(0.016, 0.052, 0.115),
    vec3(0.035, 0.185, 0.285),
    day
  );
  waterBase = mix(waterBase, vec3(0.020, 0.080, 0.150), twilight * 0.35);
  vec3 water = mix(waterBase, reflectedSky, 0.42);
  water -= vec3(0.00, 0.010, 0.018) * waterDepth;
  water += vec3(0.018, 0.085, 0.125) * wave * 0.13 * roughness;

  float reflectionSharpness = mix(13.0, 29.0, u_stillness);
  float sunReflection = exp(
    -abs(uv.x - sunPosition.x) * (reflectionSharpness + waterDepth * 16.0)
  );
  sunReflection *= smoothstep(0.01, shore, uv.y) * sunVisible;
  sunReflection *= 0.50
    + 0.50 * step(0.08, fract(uv.y * 91.0 + wave * 0.11));
  water = mix(
    water,
    vec3(0.98, 0.70, 0.36),
    sunReflection * (0.10 + day * 0.48 + twilight * 0.26)
  );

  float moonReflection = exp(
    -abs(uv.x - moonPosition.x) * (reflectionSharpness + waterDepth * 13.0)
  );
  moonReflection *= smoothstep(0.01, shore, uv.y) * moonVisible;
  moonReflection *= 0.48
    + 0.52 * step(0.10, fract(uv.y * 83.0 - wave * 0.10));
  water = mix(
    water,
    vec3(0.70, 0.84, 0.93),
    moonReflection * (0.12 + night * 0.66)
  );

  float impulseAge = u_impulse.z;
  float impulseShore = shorelineHeight(
    u_impulse.x + cameraShift,
    cameraLift,
    time
  );
  float waterImpulse = 1.0 - step(impulseShore, u_impulse.y);
  float rippleField = 0.0;
  if (impulseAge >= 0.0 && impulseAge < 6.0) {
    vec2 impulsePoint = (uv - u_impulse.xy) * vec2(aspect, 1.0);
    float rippleRadius = length(impulsePoint);
    float ripple = sin(rippleRadius * 92.0 - impulseAge * 7.6)
      * exp(-impulseAge * 0.62)
      * exp(-rippleRadius * 4.0);
    water += vec3(0.23, 0.58, 0.74)
      * max(ripple, 0.0)
      * waterImpulse
      * 0.55;
    rippleField = abs(ripple) * waterImpulse;
  }
  color = mix(color, water, waterMask);

  float leftBank = 1.0 - smoothstep(0.20, 0.50, uv.x);
  float rightBank = smoothstep(0.72, 0.94, uv.x);
  float sandbar = exp(-pow((uv.x - 0.78) / 0.13, 2.0))
    * belowMask(uv.y, foregroundHeight + 0.025, 0.012);
  float bankMask = foregroundMask
    * sat(max(leftBank, rightBank) + sandbar * 0.78);
  color = mix(color, foregroundColor, bankMask);

  float bankRidges = lineMask(
    uv.y - (foregroundHeight - 0.010 * sin(duneX * 29.0 - time * 0.12)),
    0.0045
  ) * bankMask;
  color = mix(
    color,
    mix(
      vec3(0.15, 0.20, 0.30),
      vec3(1.0, 0.80, 0.54),
      day + twilight * 0.38
    ),
    bankRidges * 0.17
  );

  float foam = lineMask(uv.y - shore, 0.0048)
    * (0.46 + 0.54 * sin(uv.x * 24.0 - time * 0.95));
  color = mix(color, vec3(0.91, 0.92, 0.87), foam * 0.17);

  float windStreak = sin(
    uv.x * (33.0 + observerMotion * 18.0)
    + uv.y * 11.0
    - time * (0.55 + abs(windVelocity) * 0.82)
    + fbm(uv * 6.0) * 3.1
  );
  windStreak = smoothstep(0.83, 1.0, windStreak)
    * exp(-pow((uv.y - 0.48) / 0.16, 2.0))
    * (0.25 + (1.0 - u_stillness) * 0.75);
  color = mix(
    color,
    mix(
      vec3(0.38, 0.46, 0.60),
      vec3(0.98, 0.82, 0.61),
      day + twilight * 0.42
    ),
    windStreak * 0.17
  );

  float sandImpulse = 1.0 - waterImpulse;
  float gustField = 0.0;
  if (impulseAge >= 0.0 && impulseAge < 5.0) {
    float direction = abs(u_motion.x) > 0.08 ? sign(u_motion.x) : 1.0;
    float gustX = u_impulse.x + direction * impulseAge * 0.11;
    float gust = exp(-abs(uv.x - gustX) * 13.0)
      * exp(-abs(uv.y - u_impulse.y) * 22.0)
      * exp(-impulseAge * 0.54)
      * sandImpulse;
    color += mix(
      vec3(0.18, 0.26, 0.38),
      vec3(0.96, 0.65, 0.34),
      day + twilight * 0.42
    ) * gust * 0.46;
    gustField = gust;
  }

  float horizonMist = exp(-pow((uv.y - 0.30) / 0.060, 2.0))
    * (0.32 + 0.68 * fbm(vec2(
      uv.x * 4.0 - time * 0.015,
      uv.y * 9.0
    )));
  color = mix(
    color,
    mix(
      vec3(0.19, 0.25, 0.34),
      vec3(0.70, 0.66, 0.58),
      day + twilight * 0.35
    ),
    horizonMist * (0.08 + twilight * 0.16 + night * 0.08)
  );

  float terrainFlow = 0.68 + 0.32 * (
    0.5
    + 0.5 * sin(
      uv.x * 7.2
      + uv.y * 5.0
      + fbm(uv * vec2(3.2, 3.6)) * 4.2
      - time * 0.10
    )
  );
  float landField = max(
    farMask * 0.28,
    max(
      middleMask * (0.48 + middleRidges * 0.40),
      bankMask * (0.80 + bankRidges * 0.22)
    )
  ) * terrainFlow;

  float waterTexture = 0.5
    + 0.5 * sin(uv.x * 12.0 + uv.y * 17.0 - time * 0.28);
  float waterField = waterMask * (
    0.28
    + 0.25 * sat(0.5 + 0.5 * wave)
    + 0.16 * waterTexture
    + 0.42 * max(sunReflection, moonReflection)
    + rippleField * 0.42
  );

  float windCenter = 0.67
    + 0.105 * sin(
      (uv.x - 0.18 + cameraShift * 0.50) * 4.6
      + time * (0.055 + u_motion.x * 0.05)
    )
    + 0.035 * sin(uv.x * 13.0 - time * 0.10);
  float windRibbon = exp(-pow((uv.y - windCenter) / 0.044, 2.0));
  windRibbon += 0.62 * exp(-pow(
    (uv.y - (windCenter - 0.084)) / 0.028,
    2.0
  ));
  windRibbon *= smoothstep(0.03, 0.97, uv.x)
    * mix(0.72, 1.0, smoothstep(
      0.34,
      0.70,
      fbm(vec2(uv.x * 4.0 + time * 0.012, uv.y * 9.0))
    ));

  vec2 arcPoint = vec2(
    (uv.x - (0.55 + cameraShift * 0.18)) * aspect,
    uv.y - (0.52 + cameraLift * 0.10)
  );
  float arcRadius = length(arcPoint);
  float windArc = exp(-pow((arcRadius - 0.34) / 0.032, 2.0));
  windArc += 0.52 * exp(-pow((arcRadius - 0.255) / 0.022, 2.0));
  windArc *= smoothstep(-0.02, 0.10, arcPoint.y)
    * smoothstep(0.08, 0.95, uv.x);

  float leftWindCenter = 0.84
    + 0.055 * sin((uv.x + 0.08) * 6.0 - time * 0.05);
  float leftWind = exp(-pow((uv.y - leftWindCenter) / 0.026, 2.0))
    * (1.0 - smoothstep(0.35, 0.60, uv.x));

  float tideRibbon = exp(-pow(
    (
      uv.y
      - (
        shore
        + 0.025
        + 0.020 * sin(uv.x * 11.0 - time * 0.16)
      )
    ) / 0.030,
    2.0
  ));

  float celestialField = max(
    max(sunDisc * sunVisible, moonDisc * moonVisible),
    max(sunHalo * 0.42, moonHalo * 0.48)
  );
  float cloudField = cloudBand * mix(0.20, 0.44, night);
  float starField = stars * 0.72;

  float field = max(
    max(landField, waterField),
    max(windRibbon * 0.90, windArc * 0.88)
  );
  field = max(field, leftWind * 0.52);
  field = max(field, tideRibbon * 0.78);
  field = max(field, cloudField);
  field = max(field, celestialField);
  field = max(field, starField);
  field = max(field, gustField * 0.72);

  float material = 0.10;
  material = mix(material, 0.26, middleMask);
  material = mix(material, 0.48, waterMask);
  material = mix(material, 0.34, bankMask);
  material = mix(material, 0.76, max(sunDisc, moonDisc));

  WorldSample result;
  result.color = clamp(color, 0.0, 1.0);
  result.field = sat(field);
  result.material = material;
  return result;
}

vec4 sampleGlyph(int index, int offset, int count, vec2 cellUv) {
  index = clamp(index, 0, count - 1) + offset;
  int column = index % u_atlasCols;
  int row = index / u_atlasCols;
  vec2 atlasUv = vec2(
    (float(column) + cellUv.x) / float(u_atlasCols),
    (float(row) + cellUv.y) / float(u_atlasRows)
  );
  return texture(u_atlas, atlasUv);
}

float introReveal(vec2 coordinate) {
  float coarse = hash21(floor(coordinate / 86.0));
  float medium = hash21(floor(coordinate / 24.0) + vec2(31.7, 14.2));
  float fine = hash21(floor(coordinate / 7.0) + vec2(79.1, 47.6));
  float threshold = (coarse * 0.46 + medium * 0.34 + fine * 0.20) * 0.90;
  return smoothstep(threshold - 0.06, threshold + 0.06, u_intro);
}

void main() {
  float cellHeight = u_cellSize * 1.5;
  vec2 cellCount = max(
    floor(u_res / vec2(u_cellSize, cellHeight)),
    vec2(1.0)
  );
  vec2 cellId = floor(v_uv * cellCount);
  vec2 cellUv = fract(v_uv * cellCount);
  vec2 cellCenter = (cellId + 0.5) / cellCount;
  WorldSample scene = tidalDune(cellCenter, u_time);
  float sceneLight = sat(luminance(scene.color));
  float reveal = introReveal(gl_FragCoord.xy);
  float vignette = 1.0 - 0.12 * pow(length(v_uv - 0.5), 2.0);

  if (u_passMix > 0.5) {
    vec3 lightNatural = mix(
      scene.color,
      vec3(1.0, 0.985, 0.965),
      0.055 + (1.0 - sceneLight) * 0.035
    );
    lightNatural = pow(max(lightNatural, vec3(0.0)), vec3(0.95));
    vec3 darkNatural = mix(
      vec3(0.004, 0.008, 0.018),
      scene.color * (0.50 + sceneLight * 0.42),
      0.90
    );
    vec3 naturalBackground = mix(lightNatural, darkNatural, u_themeMix);

    float washLight = 0.022 + scene.field * 0.030;
    float washDark = 0.070 + scene.field * 0.055;
    vec3 quietWorld = mix(
      vec3(luminance(scene.color)),
      scene.color,
      0.18
    );
    vec3 lightClassic = mix(vec3(1.0), quietWorld, washLight);
    vec3 darkClassic = mix(
      vec3(0.010, 0.010, 0.024),
      quietWorld * (0.38 + sceneLight * 0.30),
      washDark
    );
    vec3 classicBackground = mix(lightClassic, darkClassic, u_themeMix);

    vec3 backgroundColor = mix(
      naturalBackground,
      classicBackground,
      u_paletteMix
    );
    backgroundColor *= 0.99 + vignette * 0.01;

    vec3 themeBase = mix(
      vec3(1.0),
      vec3(0.010, 0.010, 0.024),
      u_themeMix
    );
    backgroundColor = mix(themeBase, backgroundColor, reveal);
    fragColor = vec4(clamp(backgroundColor, 0.0, 1.0), 1.0);
    return;
  }

  float naturalDensity = mix(1.0 - sceneLight, sceneLight, u_themeMix);
  float naturalValue = clamp(
    pow(naturalDensity, 0.84) * float(u_naturalCharCount - 1)
      + (hash21(cellId + vec2(17.0, 41.0)) - 0.5) * 0.24,
    0.0,
    float(u_naturalCharCount - 1)
  );
  int naturalA = int(floor(naturalValue));
  int naturalB = min(naturalA + 1, u_naturalCharCount - 1);
  float naturalAlpha = mix(
    sampleGlyph(naturalA, 0, u_naturalCharCount, cellUv).r,
    sampleGlyph(naturalB, 0, u_naturalCharCount, cellUv).r,
    fract(naturalValue)
  );

  vec2 epsilon = 1.0 / cellCount;
  float fieldRight = tidalDune(
    cellCenter + vec2(epsilon.x, 0.0),
    u_time
  ).field;
  float fieldUp = tidalDune(
    cellCenter + vec2(0.0, epsilon.y),
    u_time
  ).field;
  vec2 fieldGradient = vec2(
    fieldRight - scene.field,
    fieldUp - scene.field
  );
  float flow = min(
    length(fieldGradient) * 13.0
      + sat(length(u_motion)) * 0.80
      + (1.0 - u_stillness) * 0.18,
    2.0
  );
  float shimmer = (
    sin(cellId.x * 0.4 + cellId.y * 0.3 + u_time * 1.2) * 0.50
    + sin(
      cellId.x * 0.8
      - cellId.y * 0.6
      + u_time * 0.7
      + flow * 2.0
    ) * 0.35
    + sin((cellId.x + cellId.y) * 0.2 + u_time * 1.8) * 0.15
  ) * smoothstep(0.0, 0.28, flow);

  float classicDensity = sat((scene.field - 0.29) * 3.35 + 0.50);
  float classicValue = clamp(
    classicDensity * float(u_classicCharCount - 1) + shimmer,
    0.0,
    float(u_classicCharCount - 1)
  );
  int classicA = int(floor(classicValue));
  int classicB = min(classicA + 1, u_classicCharCount - 1);
  vec2 classicCellUv = clamp(
    cellUv
      + fieldGradient * 3.5
        * sin(
          u_time * 1.5
          + cellId.x * 0.4
          + cellId.y * 0.3
        )
        * 0.15,
    vec2(0.02),
    vec2(0.98)
  );
  float classicAlpha = mix(
    sampleGlyph(
      classicA,
      u_classicCharOffset,
      u_classicCharCount,
      classicCellUv
    ).r,
    sampleGlyph(
      classicB,
      u_classicCharOffset,
      u_classicCharCount,
      classicCellUv
    ).r,
    fract(classicValue)
  );
  classicAlpha = pow(classicAlpha, 0.62);

  ivec2 bayerCell = ivec2(mod(floor(gl_FragCoord.xy / 2.0), 4.0));
  const int bayer4[16] = int[16](
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  );
  float dither = float(bayer4[bayerCell.y * 4 + bayerCell.x]) / 16.0;
  naturalAlpha *= step(dither * 0.34 + 0.11, naturalAlpha);
  classicAlpha *= step(dither * 0.34 + 0.12, classicAlpha);

  vec3 lightInk = mix(
    vec3(0.050, 0.064, 0.090),
    scene.color * 0.52,
    0.34
  );
  vec3 darkInk = scene.color * (1.02 + 0.28 * sceneLight);
  vec3 naturalInk = mix(lightInk, darkInk, u_themeMix);
  naturalInk += scene.color * mix(0.010, 0.032, u_themeMix);

  vec3 classicInk = classicRainbow(
    classicDensity,
    fieldGradient,
    scene.material
  );
  float classicGlow = smoothstep(0.12, 0.52, classicDensity)
    * classicAlpha
    * 0.12;
  classicInk += classicRainbow(
    1.0,
    fieldGradient,
    scene.material
  ) * classicGlow;
  classicInk = clamp(classicInk, 0.0, 1.0);

  float naturalCanvasAlpha = naturalAlpha * mix(0.44, 0.62, u_themeMix);
  float classicCanvasAlpha = min(1.0, classicAlpha * 1.08);
  vec3 naturalPremultiplied = naturalInk * naturalCanvasAlpha;
  vec3 classicPremultiplied = classicInk * classicCanvasAlpha;

  vec3 premultiplied = mix(
    naturalPremultiplied,
    classicPremultiplied,
    u_paletteMix
  );
  float outputAlpha = mix(
    naturalCanvasAlpha,
    classicCanvasAlpha,
    u_paletteMix
  );
  outputAlpha *= reveal;
  premultiplied *= reveal * vignette;

  fragColor = vec4(
    clamp(premultiplied, 0.0, 1.0),
    sat(outputAlpha)
  );
}`;
