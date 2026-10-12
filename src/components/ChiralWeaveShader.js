// Two projected helicoid families, not a physical simulation. Spatial reflection
// changes their handedness; the shared clock, seed, and ribbon identities survive.
export const CHIRAL_WEAVE_SHADER = `
uniform float u_chiralHandedness;
uniform float u_chiralStructure;

vec2 chiralReflect(vec2 point, float handedness) {
  return vec2(point.x * handedness, point.y);
}

// Analytic molecular illustration, not an atomistic model. Each fragment samples
// two backbones and only its nearest base-pair row per molecule, not every atom.
float chiralDnaBond(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float along = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  return length(p - a - ab * along);
}

float chiralDnaHexagon(vec2 p, float radius) {
  p = abs(p);
  return abs(max(dot(p, vec2(0.8660254, 0.5)), p.y) - radius);
}

float chiralDnaPentagon(vec2 p, float radius) {
  p.x = abs(p.x);
  return abs(max(p.y, max(dot(p, vec2(0.9510565, 0.309017)),
    dot(p, vec2(0.5877853, -0.809017)))) - radius);
}

void chiralDnaOver(inout vec3 color, inout float alpha, vec3 tint, float mask) {
  color = tint * mask + color * (1.0 - mask);
  alpha = mask + alpha * (1.0 - mask);
}

vec4 sceneChiralDna(vec2 uv, float time) {
  float handedness = u_chiralHandedness < 0.0 ? -1.0 : 1.0;
  vec2 p = chiralReflect(centeredUv(uv), handedness);
  vec2 pointer = chiralReflect(centeredUv(u_pointer), handedness);
  vec2 origin = chiralReflect(centeredUv(u_pulseOrigin), handedness);
  float span = min(aspectScale().x, 1.45);
  float scale = max(span / 1.45, 0.18);
  float pixel = 2.0 / max(u_res.y, 1.0);
  float clock = time * 0.24 + u_seed * TAU;
  float pulse = exp(-abs(length(p - origin) - u_pulseAge * 0.42) * 24.0)
    * (1.0 - smoothstep(3.8, 6.8, u_pulseAge));
  float pull = exp(-dot(p - pointer, p - pointer) * 2.4);
  p.x -= sin(p.y * 1.4 + time * 0.09) * 0.13 * scale
    + pointer.x * pull * u_energy * 0.16;
  p.y += pulse * 0.045;
  float pitch = 5.2;
  float spacing = 0.19;
  float row = floor(p.y / spacing + 0.5);
  float rowY = row * spacing;
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  for (int molecule = 0; molecule < 2; molecule++) {
    float winding = molecule == 0 ? 1.0 : -1.0;
    float axis = winding * span * 0.47;
    float radius = span * 0.30;
    // Leave the centre open; skip molecular work outside either helix envelope.
    if (abs(p.x - axis) > radius + scale * 0.12 + pixel * 2.0) continue;
    float phase = winding * p.y * pitch + clock + float(molecule) * 0.85;
    float rowPhase = winding * rowY * pitch + clock + float(molecule) * 0.85;
    float wave = sin(phase);
    float depth = cos(phase);
    float rowWave = sin(rowPhase);
    float rowDepth = cos(rowPhase);
    vec2 a = vec2(axis - radius * rowWave, rowY);
    vec2 b = vec2(axis + radius * rowWave, rowY);
    float bondWidth = max(scale * 0.008, pixel * 0.65);
    float rungDistance = chiralDnaBond(p, a, b);
    float rungMask = (1.0 - smoothstep(bondWidth, bondWidth + pixel, rungDistance)) * 0.76;
    vec3 rungTint = mix(spectral(row * 0.073 + float(molecule) * 0.27),
      vec3(0.86, 0.94, 1.0), 0.58) * mix(0.95, 0.57, u_light);

    // Six-member rings on the bases and an occasional fused five-member ring.
    // Skip subpixel ornament with an actual branch, not invisible extra shading.
    float ringRadius = scale * 0.065;
    float projection = abs(rowWave);
    if (ringRadius * projection > pixel * 2.0 && abs(p.y - rowY) < ringRadius * 1.7) {
      vec2 q = vec2((p.x - axis) / max(projection, 0.18), p.y - rowY);
      float ringX = radius * 0.36;
      float rings = min(chiralDnaHexagon(q - vec2(-ringX, 0.0), ringRadius),
        chiralDnaHexagon(q - vec2(ringX, 0.0), ringRadius));
      if (ringRadius * projection > pixel * 3.6 && mod(row, 3.0) < 0.5) {
        rings = min(rings, chiralDnaPentagon(q - vec2(ringX + ringRadius * 1.62, 0.0), ringRadius * 0.76));
      }
      float ringMask = 1.0 - smoothstep(bondWidth * 0.65, bondWidth * 0.65 + pixel, rings);
      // Molecular bonds meet the rings rather than drawing through their centres.
      float interiors = min(length(q - vec2(-ringX, 0.0)), length(q - vec2(ringX, 0.0)));
      rungMask *= smoothstep(ringRadius * 0.74, ringRadius * 0.92, interiors);
      rungMask = max(rungMask, ringMask * 0.92);
    }

    // Draw rear strand, bonded base pair, then front strand: crossings keep depth.
    for (int strand = 0; strand < 2; strand++) {
      if (strand == 1) chiralDnaOver(color, alpha, rungTint, rungMask);
      float sign = (depth >= 0.0 ? 1.0 : -1.0) * (strand == 0 ? -1.0 : 1.0);
      float z = depth * sign;
      float centre = axis + radius * wave * sign;
      float slope = radius * pitch * depth;
      float across = (p.x - centre) / sqrt(1.0 + slope * slope);
      float width = max(scale * (0.015 + 0.006 * (z + 1.0)), pixel * 0.85);
      float tubeMask = 1.0 - smoothstep(width - pixel * 0.4, width + pixel, abs(across));
      vec2 atomDelta = p - vec2(axis + radius * rowWave * sign, rowY);
      float atomRadius = max(scale * (0.034 + 0.007 * (rowDepth * sign + 1.0)), pixel * 1.35);
      float atomMask = 1.0 - smoothstep(atomRadius - pixel, atomRadius + pixel, length(atomDelta));
      float crown = sqrt(max(0.0, 1.0 - (across / width) * (across / width)));
      float sphere = sqrt(max(0.0, 1.0 - dot(atomDelta, atomDelta) / (atomRadius * atomRadius)));
      float sheen = pow(max(crown - across / width * 0.23, 0.0), 8.0);
      vec3 pigment = spectral((sign > 0.0 ? 0.08 : 0.62) + float(molecule) * 0.17
        + p.y * 0.065 + u_seed * 0.16);
      vec3 material = pigment * (0.34 + crown * 0.52);
      material = mix(material, vec3(0.92, 0.97, 1.0), sat(sheen * 0.67));
      vec3 atomTint = mix(pigment * 0.68, vec3(0.94, 0.98, 1.0), sphere * sphere * 0.80);
      material = mix(material, atomTint, atomMask);
      material *= (0.62 + 0.38 * smoothstep(-1.0, 1.0, z)) * mix(1.12, 0.74, u_light);
      material += pigment * pulse * 0.16;
      float mask = max(tubeMask, atomMask);
      chiralDnaOver(color, alpha, material, mask);
    }
  }
  return vec4(color / max(alpha, 0.0001), alpha * smoothstep(0.0, 1.0, u_intro));
}

vec4 sceneChiralWeave(vec2 uv, float time) {
  if (u_chiralStructure > 0.5) return sceneChiralDna(uv, time);
  float handedness = u_chiralHandedness < 0.0 ? -1.0 : 1.0;
  vec2 p = chiralReflect(centeredUv(uv), handedness);
  vec2 pointer = chiralReflect(centeredUv(u_pointer), handedness);
  vec2 pulseOrigin = chiralReflect(centeredUv(u_pulseOrigin), handedness);
  float span = min(aspectScale().x, 1.45);
  float scale = max(span / 1.45, 0.18);
  float clock = time * 0.24 + u_seed * TAU;
  float intro = smoothstep(0.0, 1.0, u_intro);
  float pulseDistance = length(p - pulseOrigin);
  float pulse = exp(-abs(pulseDistance - u_pulseAge * 0.42) * 24.0)
    * (1.0 - smoothstep(3.8, 6.8, u_pulseAge));
  float pointerPull = exp(-dot(p - pointer, p - pointer) * 2.4);
  float axisBend = sin(p.y * 1.4 + time * 0.09) * 0.13 * scale
    + pointer.x * pointerPull * u_energy * 0.16;
  float y = p.y + pulse * 0.045;
  float nearestDepth = -10.0;
  vec3 surface = vec3(0.0);
  float coverage = 0.0;
  vec3 haloColor = vec3(0.0);
  float haloAlpha = 0.0;
  float pixel = 2.0 / max(u_res.y, 1.0);

  // Exactly twelve analytic strips. No ray marching, feedback buffers, or
  // device-dependent scene variants. Opposite winding is explicit, never abs().
  for (int family = 0; family < 2; family++) {
    float winding = family == 0 ? 1.0 : -1.0;
    float axis = winding * span * 0.43 + axisBend;
    float amplitude = span * (0.30 + 0.025 * sin(y * 1.8 + clock * 0.37));
    for (int ribbon = 0; ribbon < 6; ribbon++) {
      float identity = float(ribbon) / 6.0;
      float phase = winding * (y * 4.0 + 0.20 * sin(y * 1.5))
        + clock + identity * TAU + float(family) * 0.85;
      float depth = cos(phase);
      float center = axis + amplitude * sin(phase);
      float slope = winding * amplitude * 4.0 * cos(phase);
      float distanceToStrip = (p.x - center) / sqrt(1.0 + slope * slope);
      float halfWidth = scale * (0.032 + 0.029 * (0.5 + 0.5 * depth));
      halfWidth *= 0.82 + 0.18 * sin(identity * TAU + y * 1.2 + clock * 0.23);
      float edgeDistance = abs(distanceToStrip) - halfWidth;
      float mask = 1.0 - smoothstep(-pixel, pixel, edgeDistance);
      float across = clamp(distanceToStrip / max(halfWidth, pixel), -1.0, 1.0);
      float crown = sqrt(max(0.0, 1.0 - across * across));
      float edge = 1.0 - smoothstep(pixel, pixel + 0.007 * scale, abs(edgeDistance));
      float hue = identity * 0.61 + float(family) * 0.27
        + winding * y * 0.055 + across * 0.07 + u_seed * 0.2;
      vec3 pigment = spectral(hue);
      vec3 rim = spectral(hue + y * 0.12 + clock * 0.025);
      float sheen = pow(max(0.0, crown * 0.85 + across * 0.34), 12.0);
      float fold = 0.32 + 0.68 * smoothstep(-0.65, 0.85, depth);
      vec3 ink = pigment * (0.16 + 0.57 * crown) * fold;
      vec3 pearl = mix(pigment * 0.74, vec3(0.96, 0.98, 1.0), sheen * 0.88);
      vec3 material = mix(ink, pearl, 0.24 + sheen * 0.72);
      material = mix(material, rim * 1.08, edge * 0.88);
      // Fine engraved grain follows each material rather than screen-space time.
      float engraving = 0.95 + 0.05 * sin(y * 72.0 + phase * 2.0);
      material *= engraving * mix(1.14, 0.86, u_light);
      material += rim * pulse * 0.18;
      if (mask > 0.0 && depth > nearestDepth) {
        nearestDepth = depth;
        surface = material;
        coverage = mask;
      }
      float halo = exp(-max(edgeDistance, 0.0) / max(0.026 * scale, pixel))
        * (1.0 - mask) * 0.032;
      haloColor += rim * halo;
      haloAlpha += halo;
    }
  }
  haloAlpha = min(haloAlpha, 0.22);
  vec3 haloTint = haloColor / max(haloAlpha, 0.0001);
  float alpha = coverage + haloAlpha * (1.0 - coverage);
  vec3 color = (surface * coverage + haloTint * haloAlpha * (1.0 - coverage))
    / max(alpha, 0.0001);
  return vec4(color, sat(alpha * intro));
}
`;
