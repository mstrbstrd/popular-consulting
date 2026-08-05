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
uniform int u_sceneA;
uniform int u_sceneB;
uniform float u_sceneMix;
uniform float u_intro;
uniform vec2 u_pointer;
uniform vec4 u_impulse;
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_charCount;
uniform int u_atlasCols;
uniform int u_atlasRows;

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
    p = p * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

float sdRoundBox(vec2 p, vec2 bounds, float radius) {
  vec2 q = abs(p) - bounds + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float softMask(float y, float ridge) {
  return 1.0 - smoothstep(ridge - 0.008, ridge + 0.008, y);
}

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 grade(vec3 color, float amount) {
  float light = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(vec3(light), color, amount);
}

vec4 alpineDawn(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  float pointerShift = (u_pointer.x - 0.5) * 0.035;
  vec3 top = vec3(0.025, 0.055, 0.095);
  vec3 horizon = vec3(0.78, 0.64, 0.46);
  vec3 color = mix(horizon, top, smoothstep(0.40, 1.0, uv.y));

  float cloud = fbm(vec2(uv.x * 3.2 + time * 0.012, uv.y * 8.0));
  float cloudBand = exp(-pow((uv.y - 0.63) / 0.15, 2.0)) * smoothstep(0.52, 0.72, cloud);
  color = mix(color, vec3(0.82, 0.77, 0.68), cloudBand * 0.18);

  vec2 sunCenter = vec2(0.72 + pointerShift, 0.69);
  float sunDistance = length((uv - sunCenter) * vec2(aspect, 1.0));
  float halo = exp(-sunDistance * 9.0);
  float sun = 1.0 - smoothstep(0.055, 0.066, sunDistance);
  color += vec3(0.95, 0.65, 0.30) * halo * 0.34;
  color = mix(color, vec3(1.0, 0.93, 0.72), sun);

  float x = uv.x + pointerShift;
  float farRidge = 0.385 + 0.035 * sin(x * 6.3 + 1.2)
    + 0.055 * (fbm(vec2(x * 4.2, 2.1)) - 0.5);
  float farMask = softMask(uv.y, farRidge);
  color = mix(color, vec3(0.24, 0.32, 0.39), farMask * 0.90);

  float middleRidge = 0.315 + 0.055 * sin(x * 5.1 - 1.4)
    + 0.095 * (fbm(vec2(x * 3.1, 8.7)) - 0.48);
  float middleMask = softMask(uv.y, middleRidge);
  color = mix(color, vec3(0.10, 0.16, 0.21), middleMask * 0.97);

  float nearRidge = 0.22 + 0.06 * sin(x * 7.4 + 0.8)
    + 0.075 * (fbm(vec2(x * 5.2, 15.4)) - 0.42);
  float nearMask = softMask(uv.y, nearRidge);
  color = mix(color, vec3(0.025, 0.055, 0.07), nearMask);

  float mist = exp(-pow((uv.y - 0.36) / 0.055, 2.0))
    * (0.35 + 0.65 * fbm(vec2(uv.x * 4.0 - time * 0.018, uv.y * 13.0)));
  color = mix(color, vec3(0.63, 0.67, 0.66), mist * 0.22 * (1.0 - nearMask));

  vec2 birdPoint = (uv - vec2(0.28, 0.73)) * vec2(aspect, 1.0);
  float bird = min(
    segmentDistance(birdPoint, vec2(-0.018, 0.0), vec2(0.0, 0.008)),
    segmentDistance(birdPoint, vec2(0.0, 0.008), vec2(0.018, 0.0))
  );
  color = mix(color, vec3(0.03, 0.04, 0.05), 1.0 - smoothstep(0.003, 0.006, bird));

  float impulseAge = u_impulse.z;
  if (impulseAge >= 0.0 && impulseAge < 4.0) {
    vec2 impulsePoint = (uv - u_impulse.xy) * vec2(aspect, 1.0);
    float flare = exp(-length(impulsePoint) * 18.0) * exp(-impulseAge * 1.4);
    color += vec3(0.95, 0.66, 0.31) * flare * 0.32;
  }

  return vec4(clamp(color, 0.0, 1.0), 1.0);
}

vec4 moonWater(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  float pointerShift = (u_pointer.x - 0.5) * 0.025;
  vec3 color = mix(
    vec3(0.11, 0.20, 0.29),
    vec3(0.012, 0.022, 0.055),
    smoothstep(0.44, 1.0, uv.y)
  );

  float starGrid = hash21(floor(uv * vec2(150.0, 90.0)));
  float stars = step(0.987, starGrid) * smoothstep(0.48, 1.0, uv.y);
  stars *= 0.55 + 0.45 * sin(time * 1.7 + starGrid * 20.0);
  color += vec3(0.72, 0.82, 0.90) * stars * 0.75;

  vec2 moonCenter = vec2(0.70 + pointerShift, 0.72);
  float moonDistance = length((uv - moonCenter) * vec2(aspect, 1.0));
  float halo = exp(-moonDistance * 11.0);
  float moon = 1.0 - smoothstep(0.064, 0.073, moonDistance);
  color += vec3(0.38, 0.56, 0.72) * halo * 0.28;
  color = mix(color, vec3(0.90, 0.94, 0.91), moon);

  float horizon = 0.435;
  if (uv.y < horizon) {
    float depth = clamp((horizon - uv.y) / horizon, 0.0, 1.0);
    float wave = sin(uv.x * 58.0 + time * 0.75 + sin(uv.y * 36.0 - time * 0.28) * 1.8);
    wave += 0.55 * sin(uv.x * 103.0 - time * 0.42 + uv.y * 71.0);
    vec3 water = mix(vec3(0.02, 0.055, 0.085), vec3(0.055, 0.16, 0.22), 1.0 - depth);
    water += vec3(0.02, 0.08, 0.12) * wave * 0.15;

    float reflection = exp(-abs(uv.x - moonCenter.x) * (17.0 + depth * 16.0));
    reflection *= 0.45 + 0.55 * step(0.05, fract(uv.y * 84.0 + wave * 0.12));
    reflection *= smoothstep(0.02, 0.41, uv.y);
    water = mix(water, vec3(0.67, 0.78, 0.76), reflection * 0.70);

    float impulseAge = u_impulse.z;
    if (impulseAge >= 0.0 && impulseAge < 5.0) {
      vec2 ripplePoint = (uv - u_impulse.xy) * vec2(aspect, 1.0);
      float rippleRadius = length(ripplePoint);
      float ring = sin(rippleRadius * 95.0 - impulseAge * 8.0)
        * exp(-impulseAge * 0.75)
        * exp(-rippleRadius * 5.0);
      water += vec3(0.25, 0.55, 0.65) * max(ring, 0.0) * 0.48;
    }
    color = water;
  }

  float horizonGlow = exp(-abs(uv.y - horizon) * 90.0);
  color += vec3(0.18, 0.35, 0.42) * horizonGlow * 0.20;

  float rock = softMask(
    uv.y,
    0.17 + 0.025 * sin(uv.x * 9.0) + 0.035 * fbm(vec2(uv.x * 7.0, 2.0))
  );
  rock *= smoothstep(0.32, 0.0, uv.x);
  color = mix(color, vec3(0.006, 0.015, 0.02), rock);

  return vec4(clamp(color, 0.0, 1.0), 1.0);
}

vec4 desertWind(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  float pointerShift = (u_pointer.x - 0.5) * 0.05;
  vec3 color = mix(
    vec3(0.90, 0.68, 0.45),
    vec3(0.16, 0.22, 0.25),
    smoothstep(0.48, 1.0, uv.y)
  );

  vec2 sunCenter = vec2(0.25 + pointerShift * 0.25, 0.66);
  float sunDistance = length((uv - sunCenter) * vec2(aspect, 1.0));
  float sun = 1.0 - smoothstep(0.060, 0.071, sunDistance);
  float halo = exp(-sunDistance * 10.0);
  color += vec3(0.75, 0.31, 0.15) * halo * 0.20;
  color = mix(color, vec3(0.98, 0.83, 0.59), sun);

  float x = uv.x + pointerShift;
  float backDune = 0.36 + 0.055 * sin(x * 4.3 + 1.7) + 0.05 * fbm(vec2(x * 3.4, 4.0));
  float backMask = softMask(uv.y, backDune);
  color = mix(color, vec3(0.55, 0.31, 0.23), backMask * 0.82);

  float middleDune = 0.27 + 0.07 * sin(x * 5.1 - 0.7) + 0.07 * fbm(vec2(x * 4.2, 9.0));
  float middleMask = softMask(uv.y, middleDune);
  color = mix(color, vec3(0.32, 0.18, 0.16), middleMask * 0.93);

  float nearDune = 0.15 + 0.06 * sin(x * 6.5 + 2.0) + 0.055 * fbm(vec2(x * 6.0, 14.0));
  float nearMask = softMask(uv.y, nearDune);
  color = mix(color, vec3(0.075, 0.055, 0.052), nearMask);

  float windBand = exp(-pow((uv.y - 0.54) / 0.14, 2.0));
  float wind = sin(uv.x * 34.0 + uv.y * 9.0 + time * 0.65 + fbm(uv * 6.0) * 3.0);
  wind = smoothstep(0.82, 1.0, wind) * windBand;
  color = mix(color, vec3(0.96, 0.82, 0.64), wind * 0.16);

  float impulseAge = u_impulse.z;
  if (impulseAge >= 0.0 && impulseAge < 4.0) {
    vec2 impulsePoint = (uv - u_impulse.xy) * vec2(aspect, 1.0);
    float sweep = exp(-abs(impulsePoint.y) * 18.0)
      * exp(-abs(impulsePoint.x - impulseAge * 0.12) * 5.0)
      * exp(-impulseAge * 0.5);
    color += vec3(0.92, 0.58, 0.32) * sweep * 0.28;
  }

  return vec4(clamp(color, 0.0, 1.0), 1.0);
}

vec4 luminousGate(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  vec3 color = mix(
    vec3(0.075, 0.12, 0.14),
    vec3(0.006, 0.015, 0.025),
    smoothstep(0.30, 1.0, uv.y)
  );

  float stars = step(0.992, hash21(floor(uv * vec2(125.0, 78.0))))
    * smoothstep(0.46, 1.0, uv.y);
  color += vec3(0.48, 0.64, 0.66) * stars * 0.38;

  float ridge = 0.31 + 0.05 * sin(uv.x * 4.8)
    + 0.065 * (fbm(vec2(uv.x * 3.4, 7.0)) - 0.5);
  float ground = softMask(uv.y, ridge);
  color = mix(color, vec3(0.012, 0.035, 0.038), ground);

  vec2 gatePoint = vec2((uv.x - 0.61) * aspect, uv.y - 0.48);
  float outer = sdRoundBox(gatePoint, vec2(0.105, 0.255), 0.018);
  float inner = sdRoundBox(gatePoint - vec2(0.0, 0.012), vec2(0.058, 0.205), 0.014);
  float outerMask = 1.0 - smoothstep(-0.004, 0.008, outer);
  float innerMask = 1.0 - smoothstep(-0.004, 0.008, inner);
  float frame = outerMask * (1.0 - innerMask);
  float halo = exp(-abs(outer) * 24.0);

  float pulse = 0.78 + 0.22 * sin(time * 0.62);
  float impulseAge = u_impulse.z;
  if (impulseAge >= 0.0 && impulseAge < 4.0) {
    pulse += exp(-impulseAge * 1.3) * 0.8;
  }

  color += vec3(0.35, 0.78, 0.68) * halo * 0.24 * pulse;
  color = mix(color, vec3(0.76, 0.96, 0.80), frame);
  color = mix(color, vec3(0.005, 0.016, 0.018), innerMask);

  float beam = exp(-abs(uv.x - 0.61) * 18.0)
    * smoothstep(0.18, 0.43, uv.y)
    * (1.0 - smoothstep(0.43, 0.67, uv.y));
  color += vec3(0.20, 0.55, 0.47) * beam * 0.12 * pulse;

  float reflection = exp(-abs(uv.x - 0.61) * 24.0)
    * smoothstep(0.02, 0.29, uv.y)
    * (1.0 - uv.y / 0.31);
  reflection *= 0.45 + 0.55 * sin(uv.y * 90.0 - time * 0.55) * 0.5 + 0.25;
  color += vec3(0.35, 0.78, 0.65) * reflection * 0.27;

  float fog = exp(-pow((uv.y - 0.32) / 0.06, 2.0))
    * (0.35 + 0.65 * fbm(vec2(uv.x * 4.0 - time * 0.02, uv.y * 18.0)));
  color = mix(color, vec3(0.19, 0.30, 0.28), fog * 0.17);

  return vec4(clamp(color, 0.0, 1.0), 1.0);
}

vec4 nightBloom(vec2 uv, float time) {
  float aspect = u_res.x / u_res.y;
  vec3 color = mix(
    vec3(0.035, 0.07, 0.065),
    vec3(0.012, 0.015, 0.035),
    smoothstep(0.15, 1.0, uv.y)
  );

  float motes = step(
    0.987,
    hash21(floor((uv + vec2(time * 0.006, -time * 0.009)) * vec2(105.0, 72.0)))
  );
  color += vec3(0.55, 0.74, 0.60) * motes * 0.30;

  vec2 center = vec2(
    0.59 + (u_pointer.x - 0.5) * 0.035,
    0.53 + (u_pointer.y - 0.5) * 0.025
  );
  vec2 point = (uv - center) * vec2(aspect, 1.0);
  float radiusFromCenter = length(point);
  float angle = atan(point.y, point.x);

  float impulseAge = u_impulse.z;
  float openAmount = 0.0;
  if (impulseAge >= 0.0 && impulseAge < 4.0) {
    openAmount = exp(-impulseAge * 0.8) * 0.045;
  }

  float petalWave = 0.5 + 0.5 * cos(angle * 7.0 + sin(time * 0.22) * 0.7);
  float petalRadius = 0.16 + openAmount + 0.085 * pow(petalWave, 1.65);
  float flower = 1.0 - smoothstep(petalRadius - 0.012, petalRadius + 0.014, radiusFromCenter);

  float innerWave = 0.5 + 0.5 * cos(angle * 7.0 + 3.14159 / 7.0 - time * 0.08);
  float innerRadius = 0.105 + 0.052 * pow(innerWave, 1.7);
  float innerFlower = 1.0 - smoothstep(
    innerRadius - 0.010,
    innerRadius + 0.012,
    radiusFromCenter
  );

  float veins = 0.5 + 0.5 * cos(angle * 14.0 + radiusFromCenter * 40.0 - time * 0.12);
  veins *= flower * smoothstep(0.04, 0.20, radiusFromCenter);

  vec3 petal = mix(
    vec3(0.36, 0.56, 0.49),
    vec3(0.88, 0.91, 0.72),
    smoothstep(0.03, 0.21, radiusFromCenter)
  );
  petal = mix(petal, vec3(0.72, 0.38, 0.39), innerFlower * 0.38);
  color = mix(color, petal, flower * 0.92);
  color += vec3(0.82, 0.88, 0.65) * veins * 0.10;

  float core = 1.0 - smoothstep(0.032, 0.060, radiusFromCenter);
  color = mix(color, vec3(0.95, 0.68, 0.30), core);

  float aura = exp(-radiusFromCenter * 9.0) * (1.0 - flower);
  color += vec3(0.17, 0.50, 0.40) * aura * 0.22;

  float stem = 1.0 - smoothstep(
    0.004,
    0.009,
    abs(point.x + 0.035 * sin((point.y + 0.20) * 8.0))
  );
  stem *= smoothstep(-0.30, -0.02, point.y) * (1.0 - smoothstep(-0.02, 0.06, point.y));
  color = mix(color, vec3(0.18, 0.42, 0.29), stem * 0.65);

  return vec4(clamp(color, 0.0, 1.0), 1.0);
}

vec4 world(int scene, vec2 uv, float time) {
  if (scene == 0) return alpineDawn(uv, time);
  if (scene == 1) return moonWater(uv, time);
  if (scene == 2) return desertWind(uv, time);
  if (scene == 3) return luminousGate(uv, time);
  return nightBloom(uv, time);
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

void main() {
  float cellWidth = u_cellSize;
  float cellHeight = u_cellSize * 1.48;
  vec2 cellCount = max(floor(u_res / vec2(cellWidth, cellHeight)), vec2(1.0));
  vec2 cellId = floor(v_uv * cellCount);
  vec2 cellUv = fract(v_uv * cellCount);
  vec2 cellCenter = (cellId + 0.5) / cellCount;

  vec4 worldA = world(u_sceneA, cellCenter, u_time);
  vec4 worldB = world(u_sceneB, cellCenter, u_time);
  float dissolveNoise = hash21(cellId * 0.731 + vec2(float(u_sceneA), float(u_sceneB)) * 19.7);
  float dissolve = smoothstep(
    dissolveNoise - 0.16,
    dissolveNoise + 0.16,
    u_sceneMix
  );
  vec4 scene = mix(worldA, worldB, dissolve);

  float light = clamp(luminance(scene.rgb), 0.0, 1.0);
  float staticGrain = (hash21(cellId + float(u_sceneA) * 31.0) - 0.5) * 0.32;
  float characterFloat = clamp(
    pow(light, 0.82) * float(u_charCount - 1) + staticGrain,
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
  glyphAlpha *= step(dither * 0.35 + 0.12, glyphAlpha);

  vec3 paper = mix(vec3(0.004, 0.006, 0.009), scene.rgb * 0.18, 0.72);
  vec3 ink = grade(scene.rgb, 1.06) * (1.04 + 0.18 * light);
  vec3 color = mix(paper, ink, glyphAlpha);

  color *= 1.0 - 0.16 * pow(length(v_uv - 0.5), 2.0);
  color += ((hash21(gl_FragCoord.xy) - 0.5) / 255.0) * 3.0;

  float introNoise = hash21(floor(gl_FragCoord.xy / 18.0));
  float introMask = smoothstep(introNoise - 0.20, introNoise + 0.06, u_intro);
  color *= introMask;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
