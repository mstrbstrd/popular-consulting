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
uniform int u_charCount;
uniform int u_atlasCols;
uniform int u_atlasRows;
uniform float u_intro;
uniform float u_passMix;

#define PI 3.14159265359
#define TAU 6.28318530718

float saturate(float value) {
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

float lineMask(float value, float width) {
  return 1.0 - smoothstep(width, width * 1.85, abs(value));
}

float ringMask(vec2 point, float radius, float width) {
  return 1.0 - smoothstep(width, width * 1.8, abs(length(point) - radius));
}

float segmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 pointOffset = point - start;
  vec2 segment = end - start;
  float amount = clamp(dot(pointOffset, segment) / dot(segment, segment), 0.0, 1.0);
  return length(pointOffset - segment * amount);
}

vec3 classicPalette(float value) {
  vec3 a = vec3(0.50);
  vec3 b = vec3(0.56);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.00, 0.12, 0.32);
  return a + b * cos(TAU * (c * value + d));
}

vec3 spectralGrade(vec3 naturalColor, vec2 uv, float material, float phase) {
  float light = saturate(luminance(naturalColor));
  float hue = material * 0.21
    + light * 0.48
    + uv.x * 0.18
    - uv.y * 0.11
    + phase * 0.13;
  vec3 spectral = classicPalette(hue);
  vec3 secondary = classicPalette(hue + 0.22 + material * 0.08);
  spectral = mix(spectral, secondary, smoothstep(0.30, 0.92, light));

  float spectralLight = max(luminance(spectral), 0.08);
  float targetLight = mix(0.20, 0.92, pow(light, 0.74));
  spectral *= targetLight / spectralLight;
  return clamp(spectral, 0.0, 1.25);
}

float farDuneHeight(float x) {
  return 0.43
    + 0.030 * sin(x * 5.3 + 0.7)
    + 0.052 * (fbm(vec2(x * 3.0, 2.0)) - 0.5);
}

float middleDuneHeight(float x) {
  return 0.315
    + 0.055 * sin(x * 4.7 - 1.1)
    + 0.086 * (fbm(vec2(x * 3.8, 8.2)) - 0.48);
}

float foregroundDuneHeight(float x, float cameraLift) {
  return 0.185
    + 0.046 * sin(x * 6.0 + 2.0)
    + 0.070 * (fbm(vec2(x * 5.4, 12.8)) - 0.42)
    + cameraLift * 0.18;
}

float shorelineHeight(float x, float cameraLift, float time) {
  return 0.235
    + 0.018 * sin(x * 8.5 + time * 0.10)
    + 0.024 * (fbm(vec2(x * 5.0 - time * 0.028, 5.4)) - 0.5)
    + cameraLift * 0.065;
}

float belowMask(float y, float height, float softness) {
  return 1.0 - smoothstep(height - softness, height + softness, y);
}

vec3 skyColor(vec2 uv, float day, float night, float twilight) {
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

  float vertical = smoothstep(0.30, 1.0, uv.y);
  vec3 color = mix(horizon, top, vertical);
  color += vec3(0.05, 0.03, 0.02) * twilight * exp(-abs(uv.y - 0.48) * 5.0);
  color -= vec3(0.012, 0.008, 0.0) * night * vertical;
  return color;
}

vec3 shadeDune(
  vec3 nightColor,
  vec3 dayColor,
  float x,
  float height,
  float sampledHeightLeft,
  float sampledHeightRight,
  vec2 lightPosition,
  float day,
  float twilight,
  float night
) {
  float slope = (sampledHeightRight - sampledHeightLeft) / 0.008;
  vec2 normal = normalize(vec2(-slope, 1.0));
  vec2 lightDirection = normalize(lightPosition - vec2(x, height));
  float directional = dot(normal, lightDirection) * 0.5 + 0.5;
  float lightAmount = mix(0.24 + directional * 0.30, 0.56 + directional * 0.58, day);
  lightAmount += twilight * directional * 0.16;
  lightAmount += night * max(directional - 0.40, 0.0) * 0.18;
  return mix(nightColor, dayColor, saturate(day + twilight * 0.38)) * lightAmount;
}

vec4 tidalDune(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  float solarAngle = (u_phase - 0.25) * TAU;
  float solarAltitude = sin(solarAngle);
  float day = smoothstep(-0.10, 0.30, solarAltitude);
  float night = 1.0 - smoothstep(-0.48, 0.08, solarAltitude);
  float twilight = exp(-abs(solarAltitude) * 4.2) * (1.0 - day * 0.22);
  float observerMotion = saturate(length(u_motion));
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

  vec3 color = skyColor(uv, day, night, twilight);
  float windVelocity = 0.22 + u_motion.x * 1.45 + (1.0 - u_stillness) * 0.28;

  float highCloud = fbm(vec2(
    uv.x * 3.2 + time * (0.010 + windVelocity * 0.020),
    uv.y * 7.6
  ));
  float cloudBand = exp(-pow((uv.y - 0.72) / 0.17, 2.0))
    * smoothstep(0.50, 0.72, highCloud);
  vec3 cloudColor = mix(vec3(0.30, 0.34, 0.46), vec3(0.96, 0.86, 0.72), day);
  cloudColor = mix(cloudColor, vec3(0.73, 0.45, 0.42), twilight * 0.42);
  color = mix(color, cloudColor, cloudBand * (0.12 + twilight * 0.18));

  float sunDistance = length((uv - sunPosition) * vec2(aspect, 1.0));
  float sunVisibility = smoothstep(-0.16, 0.06, solarAltitude);
  float sunDisc = 1.0 - smoothstep(0.050, 0.064, sunDistance);
  float sunHalo = exp(-sunDistance * 8.2) * sunVisibility;
  color += vec3(1.00, 0.55, 0.18) * sunHalo * (0.18 + day * 0.26 + twilight * 0.24);
  color = mix(color, vec3(1.0, 0.94, 0.75), sunDisc * sunVisibility);

  float moonDistance = length((uv - moonPosition) * vec2(aspect, 1.0));
  float moonVisibility = smoothstep(-0.16, 0.06, -solarAltitude);
  float moonDisc = 1.0 - smoothstep(0.044, 0.057, moonDistance);
  float moonHalo = exp(-moonDistance * 10.5) * moonVisibility;
  color += vec3(0.34, 0.58, 0.94) * moonHalo * (0.18 + night * 0.58);
  color = mix(color, vec3(0.91, 0.95, 0.97), moonDisc * moonVisibility);

  vec2 starCell = floor(uv * vec2(170.0, 102.0));
  float starHash = hash21(starCell);
  float stars = step(0.984, starHash) * smoothstep(0.42, 1.0, uv.y);
  stars *= night * mix(0.58, 1.0, u_stillness);
  stars *= 0.62 + 0.38 * sin(time * 1.4 + starHash * 24.0);
  color += vec3(0.72, 0.83, 0.98) * stars * 0.86;

  float meteorCycle = fract(time * 0.020 + 0.37);
  float meteorWindow = (1.0 - smoothstep(0.09, 0.13, meteorCycle))
    * smoothstep(0.0, 0.018, meteorCycle);
  vec2 meteorHead = vec2(0.88 - meteorCycle * 2.7, 0.86 - meteorCycle * 0.62);
  vec2 meteorPoint = (uv - meteorHead) * vec2(aspect, 1.0);
  float meteor = 1.0 - smoothstep(
    0.002,
    0.006,
    segmentDistance(meteorPoint, vec2(0.0), vec2(0.12, 0.028))
  );
  color += vec3(0.75, 0.89, 1.0) * meteor * meteorWindow * night * u_stillness * 0.85;

  float duneX = uv.x + cameraShift;
  float farHeight = farDuneHeight(duneX);
  float middleHeight = middleDuneHeight(duneX);
  float foregroundHeight = foregroundDuneHeight(duneX, cameraLift);
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
    twilight,
    night
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
    twilight,
    night
  );
  vec3 foregroundColor = shadeDune(
    vec3(0.035, 0.050, 0.082),
    vec3(0.88, 0.64, 0.39),
    duneX,
    foregroundHeight,
    foregroundDuneHeight(duneX - 0.004, cameraLift),
    foregroundDuneHeight(duneX + 0.004, cameraLift),
    activeLight,
    day,
    twilight,
    night
  );

  color = mix(color, farColor, farMask * 0.88);
  color = mix(color, middleColor, middleMask * 0.96);

  float middleRidges = lineMask(
    uv.y - (middleHeight - 0.011 * sin(duneX * 22.0 + time * 0.10)),
    0.0055
  ) * middleMask;
  color = mix(
    color,
    mix(vec3(0.22, 0.28, 0.38), vec3(0.98, 0.78, 0.51), day + twilight * 0.45),
    middleRidges * (0.12 + day * 0.12)
  );

  float shoreHeight = shorelineHeight(duneX, cameraLift, time);
  float waterMask = smoothstep(shoreHeight + 0.008, shoreHeight - 0.012, uv.y);
  float waterDepth = saturate((shoreHeight - uv.y) / max(shoreHeight, 0.08));
  float roughness = mix(0.24, 1.0, 1.0 - u_stillness) + observerMotion * 0.65;
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
    shoreHeight + (shoreHeight - uv.y)
  );
  vec3 reflectedSky = skyColor(reflectedUv, day, night, twilight);
  vec3 waterBase = mix(vec3(0.016, 0.052, 0.115), vec3(0.035, 0.185, 0.285), day);
  waterBase = mix(waterBase, vec3(0.020, 0.080, 0.150), twilight * 0.35);
  vec3 water = mix(waterBase, reflectedSky, 0.42);
  water -= vec3(0.00, 0.010, 0.018) * waterDepth;
  water += vec3(0.018, 0.085, 0.125) * wave * 0.13 * roughness;

  float reflectionSharpness = mix(13.0, 29.0, u_stillness);
  float sunReflection = exp(-abs(uv.x - sunPosition.x) * (reflectionSharpness + waterDepth * 16.0));
  sunReflection *= smoothstep(0.01, shoreHeight, uv.y) * sunVisibility;
  sunReflection *= 0.50 + 0.50 * step(0.08, fract(uv.y * 91.0 + wave * 0.11));
  water = mix(
    water,
    vec3(0.98, 0.70, 0.36),
    sunReflection * (0.10 + day * 0.48 + twilight * 0.26)
  );

  float moonReflection = exp(-abs(uv.x - moonPosition.x) * (reflectionSharpness + waterDepth * 13.0));
  moonReflection *= smoothstep(0.01, shoreHeight, uv.y) * moonVisibility;
  moonReflection *= 0.48 + 0.52 * step(0.10, fract(uv.y * 83.0 - wave * 0.10));
  water = mix(
    water,
    vec3(0.70, 0.84, 0.93),
    moonReflection * (0.12 + night * 0.66)
  );

  float impulseAge = u_impulse.z;
  float impulseShore = shorelineHeight(u_impulse.x + cameraShift, cameraLift, time);
  float waterImpulse = 1.0 - step(impulseShore, u_impulse.y);
  if (impulseAge >= 0.0 && impulseAge < 6.0) {
    vec2 impulsePoint = (uv - u_impulse.xy) * vec2(aspect, 1.0);
    float rippleRadius = length(impulsePoint);
    float ripple = sin(rippleRadius * 92.0 - impulseAge * 7.6)
      * exp(-impulseAge * 0.62)
      * exp(-rippleRadius * 4.0);
    water += vec3(0.23, 0.58, 0.74) * max(ripple, 0.0) * waterImpulse * 0.55;
    water -= vec3(0.03, 0.06, 0.07) * max(-ripple, 0.0) * waterImpulse * 0.22;
  }

  color = mix(color, water, waterMask);

  float leftBank = 1.0 - smoothstep(0.20, 0.50, uv.x);
  float rightBank = smoothstep(0.72, 0.94, uv.x);
  float sandbar = exp(-pow((uv.x - 0.78) / 0.13, 2.0))
    * belowMask(uv.y, foregroundHeight + 0.025, 0.012);
  float bankMask = foregroundMask * saturate(max(leftBank, rightBank) + sandbar * 0.78);
  color = mix(color, foregroundColor, bankMask);

  float bankRipples = lineMask(
    uv.y - (foregroundHeight - 0.010 * sin(duneX * 29.0 - time * 0.12)),
    0.0045
  ) * bankMask;
  color = mix(
    color,
    mix(vec3(0.15, 0.20, 0.30), vec3(1.0, 0.80, 0.54), day + twilight * 0.38),
    bankRipples * 0.17
  );

  float foam = lineMask(uv.y - shoreHeight, 0.0048)
    * (0.46 + 0.54 * sin(uv.x * 24.0 - time * 0.95));
  color = mix(color, vec3(0.91, 0.92, 0.87), foam * 0.17);

  float windFrequency = 33.0 + observerMotion * 18.0;
  float windStreak = sin(
    uv.x * windFrequency
    + uv.y * 11.0
    - time * (0.55 + abs(windVelocity) * 0.82)
    + fbm(uv * 6.0) * 3.1
  );
  windStreak = smoothstep(0.83, 1.0, windStreak);
  windStreak *= exp(-pow((uv.y - 0.48) / 0.16, 2.0));
  windStreak *= 0.25 + (1.0 - u_stillness) * 0.75;
  color = mix(
    color,
    mix(vec3(0.38, 0.46, 0.60), vec3(0.98, 0.82, 0.61), day + twilight * 0.42),
    windStreak * 0.17
  );

  float sandImpulse = 1.0 - waterImpulse;
  if (impulseAge >= 0.0 && impulseAge < 5.0) {
    float gustDirection = abs(u_motion.x) > 0.08 ? sign(u_motion.x) : 1.0;
    float gustX = u_impulse.x + gustDirection * impulseAge * 0.11;
    float gust = exp(-abs(uv.x - gustX) * 13.0)
      * exp(-abs(uv.y - u_impulse.y) * 22.0)
      * exp(-impulseAge * 0.54)
      * sandImpulse;
    color += mix(vec3(0.18, 0.26, 0.38), vec3(0.96, 0.65, 0.34), day + twilight * 0.42) * gust * 0.46;
  }

  float horizonMist = exp(-pow((uv.y - 0.30) / 0.060, 2.0))
    * (0.32 + 0.68 * fbm(vec2(uv.x * 4.0 - time * 0.015, uv.y * 9.0)));
  color = mix(
    color,
    mix(vec3(0.19, 0.25, 0.34), vec3(0.70, 0.66, 0.58), day + twilight * 0.35),
    horizonMist * (0.08 + twilight * 0.16 + night * 0.08)
  );

  float material = 0.10;
  material = mix(material, 0.26, middleMask);
  material = mix(material, 0.48, waterMask);
  material = mix(material, 0.34, bankMask);
  material = mix(material, 0.76, max(sunDisc, moonDisc));

  vec3 spectral = spectralGrade(color, uv, material, u_phase + time * 0.004);
  color = mix(color, spectral, u_paletteMix);
  return vec4(clamp(color, 0.0, 1.0), material);
}

vec4 sampleCharacter(int characterIndex, vec2 cellUv) {
  characterIndex = clamp(characterIndex, 0, u_charCount - 1);
  int column = characterIndex % u_atlasCols;
  int row = characterIndex / u_atlasCols;
  vec2 atlasUv = vec2(
    (float(column) + cellUv.x) / float(u_atlasCols),
    (float(row) + cellUv.y) / float(u_atlasRows)
  );
  return texture(u_atlas, atlasUv);
}

float introReveal(vec2 fragCoord) {
  float coarse = hash21(floor(fragCoord / 86.0));
  float medium = hash21(floor(fragCoord / 24.0) + vec2(31.7, 14.2));
  float fine = hash21(floor(fragCoord / 7.0) + vec2(79.1, 47.6));
  float threshold = (coarse * 0.46 + medium * 0.34 + fine * 0.20) * 0.90;
  return smoothstep(threshold - 0.06, threshold + 0.06, u_intro);
}

void main() {
  float cellWidth = u_cellSize;
  float cellHeight = u_cellSize * 1.48;
  vec2 cellCount = max(floor(u_res / vec2(cellWidth, cellHeight)), vec2(1.0));
  vec2 cellId = floor(v_uv * cellCount);
  vec2 cellUv = fract(v_uv * cellCount);
  vec2 cellCenter = (cellId + 0.5) / cellCount;
  vec4 scene = tidalDune(cellCenter, u_time);

  float reveal = introReveal(gl_FragCoord.xy);
  float vignette = 1.0 - 0.15 * pow(length(v_uv - 0.5), 2.0);

  if (u_passMix > 0.5) {
    vec3 glowColor = scene.rgb * (0.92 + 0.18 * luminance(scene.rgb));
    glowColor *= mix(1.06, 0.92, u_themeMix);
    fragColor = vec4(clamp(glowColor * vignette, 0.0, 1.0), reveal * 0.96);
    return;
  }

  float sceneLight = saturate(luminance(scene.rgb));
  float densityLight = mix(1.0 - sceneLight, sceneLight, u_themeMix);
  float grain = (hash21(cellId + vec2(17.0, 41.0)) - 0.5) * 0.24;
  float characterFloat = clamp(
    pow(densityLight, 0.84) * float(u_charCount - 1) + grain,
    0.0,
    float(u_charCount - 1)
  );
  int characterA = int(floor(characterFloat));
  int characterB = min(characterA + 1, u_charCount - 1);
  float glyphAlpha = mix(
    sampleCharacter(characterA, cellUv).r,
    sampleCharacter(characterB, cellUv).r,
    fract(characterFloat)
  );

  ivec2 bayerCell = ivec2(mod(floor(gl_FragCoord.xy / 2.0), 4.0));
  const int bayer4[16] = int[16](
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  );
  float dither = float(bayer4[bayerCell.y * 4 + bayerCell.x]) / 16.0;
  glyphAlpha *= step(dither * 0.34 + 0.11, glyphAlpha);

  vec3 lightPaper = vec3(0.986, 0.973, 0.949);
  vec3 darkPaper = vec3(0.004, 0.007, 0.014);
  vec3 paper = mix(lightPaper, darkPaper, u_themeMix);

  vec3 lightInk = mix(vec3(0.075, 0.090, 0.120), scene.rgb * 0.76, 0.48 + u_paletteMix * 0.34);
  vec3 darkInk = scene.rgb * (1.02 + 0.24 * sceneLight);
  vec3 ink = mix(lightInk, darkInk, u_themeMix);

  vec3 color = mix(paper, ink, glyphAlpha);
  color += scene.rgb * mix(0.020, 0.050, u_themeMix);
  color *= vignette;
  color += ((hash21(gl_FragCoord.xy) - 0.5) / 255.0) * 2.2;

  float fieldAlpha = mix(0.18, 0.12, u_themeMix);
  float glyphOpacity = mix(0.76, 0.86, u_themeMix);
  float canvasAlpha = saturate(fieldAlpha + glyphAlpha * glyphOpacity);
  fragColor = vec4(clamp(color, 0.0, 1.0), reveal * canvasAlpha);
}`;
