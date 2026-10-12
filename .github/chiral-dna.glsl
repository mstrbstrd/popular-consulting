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
      float crown = sqrt(max(0.0, 1.0 - pow(across / width, 2.0)));
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

