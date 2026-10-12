// Two projected helicoid families, not a physical simulation. Spatial reflection
// changes their handedness; the shared clock, seed, and ribbon identities survive.
export const CHIRAL_WEAVE_SHADER = `
uniform float u_chiralHandedness;

vec2 chiralReflect(vec2 point, float handedness) {
  return vec2(point.x * handedness, point.y);
}

vec4 sceneChiralWeave(vec2 uv, float time) {
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
