export const RUPTURE_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const RUPTURE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_theme;
uniform float u_energy;
uniform float u_reveal;
uniform vec2 u_pointer;
uniform int u_nodeCount;
uniform vec4 u_nodes[24];
uniform vec4 u_branches[4];
uniform vec4 u_branchMeta[4];
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_charCount;
uniform int u_atlasCols;
uniform int u_atlasRows;

#define PI 3.14159265359
#define TAU 6.28318530718

struct FaultInfo {
  float dist;
  float signedDist;
  float opening;
  float scar;
  float branch;
  vec2 tangent;
  vec2 nearest;
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
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise2(p);
    p = p * 2.04 + vec2(17.2, 9.7);
    amplitude *= 0.5;
  }
  return value;
}

mat2 rotate2(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
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
  float currentLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = min(raw * (0.58 / max(currentLuminance, 0.1)), vec3(1.0));
  float normalizedLuminance = dot(raw, vec3(0.299, 0.587, 0.114));
  raw = mix(vec3(normalizedLuminance), raw, 1.24);
  return clamp(raw * brightness, 0.0, 1.0);
}

FaultInfo sampleFault(vec2 uv) {
  FaultInfo info;
  info.dist = 100.0;
  info.signedDist = 100.0;
  info.opening = 0.0;
  info.scar = 0.0;
  info.branch = 0.0;
  info.tangent = vec2(1.0, 0.0);
  info.nearest = uv;

  vec2 aspectScale = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 point = uv * aspectScale;

  // The main fault is x-monotonic and its nodes are uniformly spaced, so a
  // fragment only needs the segment directly beneath its x coordinate. The
  // previous implementation searched all 23 segments for every pixel.
  float faultPosition = clamp((uv.x + 0.06) / 1.12, 0.0, 0.99999)
    * float(max(u_nodeCount - 1, 1));
  int nodeIndex = clamp(int(floor(faultPosition)), 0, 22);
  int nextNodeIndex = min(nodeIndex + 1, max(u_nodeCount - 1, 0));
  vec4 nodeA = u_nodes[nodeIndex];
  vec4 nodeB = u_nodes[nextNodeIndex];
  vec2 a = nodeA.xy * aspectScale;
  vec2 b = nodeB.xy * aspectScale;
  vec2 segment = b - a;
  float segmentLengthSquared = max(dot(segment, segment), 0.000001);
  float amount = clamp(dot(point - a, segment) / segmentLengthSquared, 0.0, 1.0);
  vec2 nearest = a + segment * amount;
  vec2 offset = point - nearest;
  vec2 tangent = normalize(segment);
  info.dist = length(offset);
  info.signedDist = cross2(tangent, offset);
  info.opening = mix(nodeA.z, nodeB.z, amount);
  info.scar = mix(nodeA.w, nodeB.w, amount);
  info.tangent = tangent;
  info.nearest = nearest / aspectScale;

  for (int index = 0; index < 4; index++) {
    vec4 branch = u_branches[index];
    vec4 meta = u_branchMeta[index];
    if (meta.z <= 0.001) continue;

    vec2 branchA = branch.xy * aspectScale;
    vec2 branchB = branch.zw * aspectScale;
    vec2 branchSegment = branchB - branchA;
    float branchLengthSquared = max(dot(branchSegment, branchSegment), 0.000001);
    float branchAmount = clamp(
      dot(point - branchA, branchSegment) / branchLengthSquared,
      0.0,
      1.0
    );
    vec2 branchNearest = branchA + branchSegment * branchAmount;
    vec2 branchOffset = point - branchNearest;
    float distanceToBranch = length(branchOffset);
    float branchWidth = meta.x * meta.z * (1.0 - branchAmount * 0.58);

    if (distanceToBranch < info.dist) {
      vec2 branchTangent = normalize(branchSegment);
      info.dist = distanceToBranch;
      info.signedDist = cross2(branchTangent, branchOffset);
      info.opening = branchWidth * 11.0;
      info.scar = meta.z * 0.08;
      info.branch = 1.0;
      info.tangent = branchTangent;
      info.nearest = branchNearest / aspectScale;
    }
  }

  return info;
}

vec3 hiddenWorld(vec2 uv, FaultInfo fault) {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 pointer = (u_pointer - 0.5) * vec2(aspect, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 normal = vec2(-fault.tangent.y, fault.tangent.x);
  p += pointer * 0.12;
  p += normal * fault.signedDist * 0.18;

  float radius = length(p) + 0.001;
  float angle = atan(p.y, p.x);
  float spiral = angle / TAU + log(radius + 0.18) * 0.34 - u_time * 0.025;

  vec3 color = vec3(0.010, 0.014, 0.045);
  color += spectral(spiral + 0.12, 0.72) * exp(-radius * 1.2) * 0.20;
  float weightSum = 0.0;

  for (int index = 0; index < 7; index++) {
    float layer = (float(index) + 0.5) / 7.0;
    float travel = fract(layer + u_time * (0.018 + layer * 0.009));
    float depth = mix(0.22, 2.6, travel);
    vec2 q = p / depth;
    q += pointer * (1.0 - travel) * 0.25;
    q = rotate2(0.34 * float(index) + sin(u_time * 0.08 + layer * 5.0) * 0.18) * q;

    float wave = q.y
      - 0.20 * sin(q.x * (2.4 + layer * 1.8) + u_time * (0.32 + layer * 0.15))
      - 0.07 * sin(q.x * 6.0 - u_time * 0.21 + layer * 8.0);
    float sheet = exp(-abs(wave) * mix(9.0, 24.0, travel));
    float aperture = smoothstep(2.2, 0.04, length(q * vec2(0.72, 1.0)));
    float pulse = 0.70 + 0.30 * sin(u_time * 0.8 + layer * 11.0 + q.x * 2.0);
    float weight = sheet * aperture * pulse * pow(1.0 - travel, 0.35);

    float hue = spiral + layer * 0.17 + q.x * 0.045 + q.y * 0.03;
    color += spectral(hue, 0.76 + (1.0 - travel) * 0.62) * weight * 0.92;
    weightSum += weight;
  }

  float vortex = 0.5 + 0.5 * sin(
    angle * 5.0
      + log(radius + 0.08) * 12.0
      - u_time * 0.50
  );
  float core = exp(-radius * 1.55) * (0.22 + 0.78 * vortex);
  color += spectral(spiral + 0.18, 1.0) * core * 0.84;

  vec2 moteCell = floor((uv + vec2(u_time * 0.004, -u_time * 0.006)) * vec2(170.0, 105.0));
  float motes = step(0.985, hash21(moteCell));
  motes *= 0.45 + 0.55 * sin(u_time * 1.6 + hash21(moteCell + 9.0) * 20.0);
  color += spectral(hash21(moteCell) + u_time * 0.02, 1.0) * motes * 0.72;

  float depthFog = exp(-abs(fault.signedDist) * 5.0);
  color += spectral(spiral + 0.50, 0.7) * depthFog * 0.08;
  float depthLines = 0.5 + 0.5 * sin(spiral * 18.0 - u_time * 0.34);
  color += spectral(spiral + 0.46, 0.75) * depthLines * exp(-radius * 0.95) * 0.11;
  color /= 0.82 + weightSum * 0.075;
  color += spectral(spiral + 0.03, 0.82) * exp(-radius * 0.72) * 0.12;
  color = color / (0.62 + color);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.86));
  return clamp(color, 0.0, 1.0);
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
  FaultInfo fault = sampleFault(v_uv);
  float openingWidth = 0.0022
    + fault.opening * 0.094
    + fault.scar * 0.010
    + u_energy * 0.005;
  openingWidth *= 0.88 + 0.12 * sin(u_time * 0.45 + fault.nearest.x * 11.0);
  float apertureEnvelope = 0.72
    + 0.92 * exp(-pow((fault.nearest.x - 0.57) / 0.19, 2.0));
  apertureEnvelope = mix(apertureEnvelope, 0.82, fault.branch);
  openingWidth *= apertureEnvelope;
  float sideScale = mix(0.66, 1.28, step(0.0, fault.signedDist));
  sideScale = mix(sideScale, 0.82, fault.branch);
  float sideWidth = openingWidth * sideScale;

  float inside = 1.0 - smoothstep(
    sideWidth * 0.78,
    sideWidth * 1.03,
    fault.dist
  );
  float outsideDistance = max(fault.dist - sideWidth, 0.0);
  float edge = exp(-abs(fault.dist - sideWidth) * 185.0);
  float spill = exp(-outsideDistance * 27.0) * (0.22 + u_energy * 0.78);
  float lip = exp(-outsideDistance * 92.0);

  vec3 lightSurface = vec3(1.000, 0.985, 0.978);
  vec3 darkSurface = vec3(0.006, 0.007, 0.018);
  vec3 surface = mix(lightSurface, darkSurface, u_theme);

  float paper = hash21(gl_FragCoord.xy * 0.37) - 0.5;
  surface += paper * mix(0.008, 0.004, u_theme);

  float tension = sin(
    fault.signedDist * 210.0
      - u_time * 1.15
      + fault.nearest.x * 16.0
  );
  tension *= exp(-fault.dist * 24.0) * u_energy;
  surface += mix(vec3(0.018, 0.014, 0.026), vec3(0.05, 0.04, 0.12), u_theme)
    * tension * 0.22;

  float flapEnvelope = exp(-pow((fault.nearest.x - 0.57) / 0.22, 2.0))
    * sat(u_energy * 1.28)
    * (1.0 - fault.branch);
  float foldDepth = 0.018 + flapEnvelope * 0.085;
  float foldBand = smoothstep(sideWidth + foldDepth, sideWidth, fault.dist)
    * step(0.0, fault.signedDist)
    * (1.0 - inside);
  float foldAmount = sat((fault.dist - sideWidth) / max(foldDepth, 0.0001));
  vec3 foldedSurface = mix(
    mix(vec3(0.93, 0.92, 0.96), vec3(0.024, 0.022, 0.050), u_theme),
    surface,
    smoothstep(0.22, 0.92, foldAmount)
  );
  surface = mix(surface, foldedSurface, foldBand * 0.92);
  float foldCrease = exp(-abs(fault.dist - (sideWidth + foldDepth)) * 220.0)
    * flapEnvelope
    * step(0.0, fault.signedDist);
  surface -= mix(vec3(0.10), vec3(0.02), u_theme) * foldCrease * 0.16;

  vec3 world = vec3(0.010, 0.014, 0.045);
  float worldRegion = sideWidth + 0.15 + fault.scar * 0.035;
  if (fault.dist < worldRegion) {
    world = hiddenWorld(v_uv, fault);
  }
  float raisedSide = 0.5 + 0.5 * sign(fault.signedDist);
  float shadow = lip * mix(0.30, 0.48, u_theme) * mix(0.42, 1.0, raisedSide);
  surface *= 1.0 - shadow * 0.24;

  vec3 spillColor = mix(world, spectral(fault.nearest.x * 0.22 + u_time * 0.03, 1.0), 0.28);
  surface += spillColor * spill * mix(0.26, 0.42, u_theme);
  float upperLip = edge * (0.46 + 0.54 * step(0.0, fault.signedDist));
  float lowerLip = edge * (0.46 + 0.54 * step(fault.signedDist, 0.0));
  float cutLine = exp(-abs(fault.dist - sideWidth) * 320.0);
  surface += mix(vec3(1.0), spillColor, 0.28) * upperLip * mix(0.58, 0.34, u_theme);
  surface -= mix(vec3(0.10, 0.06, 0.16), spillColor, 0.16) * lowerLip * mix(0.12, 0.24, u_theme);
  surface += mix(vec3(1.0), spillColor, 0.18) * cutLine * mix(0.62, 0.30, u_theme);

  float innerRim = inside * exp(-max(sideWidth - fault.dist, 0.0) * 28.0);
  world += spectral(fault.nearest.x * 0.24 - u_time * 0.025 + 0.34, 0.88) * innerRim * 0.22;
  vec3 color = mix(surface, world, inside);

  vec2 cellCount = max(floor(u_res / max(u_cellSize, 1.0)), vec2(1.0));
  vec2 cellId = floor(v_uv * cellCount);
  vec2 cellUv = fract(v_uv * cellCount);
  float edgeField = exp(-abs(fault.dist - sideWidth) * 92.0);
  float debrisField = exp(-outsideDistance * 34.0)
    * step(0.88 - u_energy * 0.08, hash21(cellId + floor(u_time * 0.48)));
  float density = sat(edgeField * 1.10 + debrisField * u_energy * 0.34);

  float shimmer = (
    sin(cellId.x * 0.42 + cellId.y * 0.31 + u_time * 1.18) * 0.48
    + sin(cellId.x * 0.83 - cellId.y * 0.57 + u_time * 0.73) * 0.34
    + sin((cellId.x + cellId.y) * 0.21 + u_time * 1.76) * 0.18
  ) * smoothstep(0.04, 0.60, density);

  float characterValue = clamp(
    density * float(u_charCount - 1) + shimmer,
    0.0,
    float(u_charCount - 1)
  );
  int characterA = int(floor(characterValue));
  int characterB = min(characterA + 1, u_charCount - 1);

  vec2 distortion = vec2(-fault.tangent.y, fault.tangent.x)
    * sin(u_time * 1.35 + cellId.x * 0.41 + cellId.y * 0.29)
    * density
    * 0.12;
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
  glyphAlpha *= step(threshold * 0.38 + 0.18, glyphAlpha);

  float hue = atan(fault.tangent.y, fault.tangent.x) / TAU
    + fault.nearest.x * 0.28
    + u_time * 0.045
    + density * 0.22;
  vec3 glyphColor = spectral(hue, 1.12);
  float glyphPresence = glyphAlpha * density;
  color = mix(color, glyphColor, glyphPresence * 0.96);
  color += glyphColor * glyphPresence * edgeField * 0.20;

  float vignette = 1.0 - 0.13 * pow(length(v_uv - 0.5), 2.0);
  color *= vignette;

  float reveal = revealMask(gl_FragCoord.xy);
  color = mix(surface, color, reveal);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
