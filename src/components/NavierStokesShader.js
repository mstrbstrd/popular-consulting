// Schematic of the smooth-forcing construction, not a Navier-Stokes solver.
// Geometry exaggerates slenderness; neither extent grows. The replay stops at
// a positive scale and fades before restarting, never integrating through T.
export const NAVIER_STOKES_SHADER = `
uniform float u_navierProgress;

void navierOver(inout vec3 color, inout float alpha, vec3 tint, float mask) {
  mask = clamp(mask, 0.0, 1.0);
  color = tint * mask + color * (1.0 - mask);
  alpha = mask + alpha * (1.0 - mask);
}

vec4 sceneNavierStokes(vec2 uv, float time) {
  float cycle = mod(max(time, 0.0), 28.0) / 28.0;
  float progress = u_navierProgress < 0.0
    ? smoothstep(0.04, 0.92, cycle) : clamp(u_navierProgress, 0.0, 1.0);
  float replay = u_navierProgress < 0.0
    ? smoothstep(0.0, 0.04, cycle) * (1.0 - smoothstep(0.94, 1.0, cycle)) : 1.0;
  // Positive floors are display bounds, not a regularized physical solution.
  float coreRadius = mix(0.38, 0.095, progress);
  float coreLength = mix(0.86, 0.62, progress);
  float reach = mix(1.20, 0.86, progress);
  float horizontal = clamp(aspectScale().x * 0.88, 0.30, 1.0);
  vec2 p = centeredUv(uv);
  p.x -= max(aspectScale().x - 1.0, 0.0) * 0.13;
  p.x /= horizontal;
  p.y += 0.10;
  vec2 pointer = centeredUv(u_pointer);
  p.x -= sin(p.y * 2.0) * pointer.x * u_energy * 0.055;
  float pixel = max(2.0 / max(u_res.y, 1.0), 2.0 / max(u_res.x, 1.0));
  float pulse = pulseField(uv);
  p.x += sin(p.y * 5.0) * pulse * 0.026;
  // The visual clock remains finite and shared with pause/reduced-motion.
  float clock = time * 0.75 + 9.0 * progress * progress + u_seed * TAU;
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  // A flattened inward-spiraling sheet. Rear currents pass behind the column;
  // front currents pass in front. No particles, feedback textures or ray march.
  vec2 q = vec2(p.x, p.y / 0.27);
  float r = max(length(q), 0.0001);
  float angle = atan(q.y, q.x + 0.00001);
  float phase = 6.0 * angle + 13.0 * log(r + 0.16) + clock;
  float wave = sin(phase);
  float aa = max(fwidth(phase) * 0.70, 0.025);
  float ribbon = 1.0 - smoothstep(0.16, 0.16 + aa, abs(wave));
  float sheet = exp(-pow(wave * 2.8, 2.0)) * 0.30;
  float envelope = smoothstep(coreRadius * 0.55, coreRadius * 1.5, r)
    * (1.0 - smoothstep(reach * 0.74, reach, r));
  float tracer = pow(0.5 + 0.5 * cos(14.0 * r + clock * 2.0 + angle * 2.0), 8.0);
  vec3 cool = mix(vec3(0.03, 0.44, 0.61), vec3(0.22, 0.97, 0.86), tracer);
  cool = mix(cool, spectral(0.40 + r * 0.19 + angle * 0.055), ribbon * 0.22);
  cool += vec3(0.40, 0.55, 0.52) * tracer * ribbon;
  cool *= mix(1.0, 0.55, u_light);
  float diskMask = envelope * (ribbon * 0.74 + sheet + pulse * 0.08);
  if (p.y >= 0.0) navierOver(color, alpha, cool, diskMask * 0.70);

  // Two analytic cylinder roots, with periodic angular stripes standing in for
  // many helical trajectories. Constant work, independent of apparent density.
  float y = p.y / coreLength;
  float endMask = 1.0 - smoothstep(0.79, 1.0, abs(y));
  float radius = max(coreRadius * (0.43 + 0.57 * exp(-y * y * 4.0)), 0.035);
  float across = p.x / radius;
  if (abs(across) < 1.0 + pixel / radius && abs(y) < 1.0) {
    float x = clamp(across, -0.9999, 0.9999);
    float root = sqrt(max(1.0 - x * x, 0.0001));
    float sideMask = 1.0 - smoothstep(radius - pixel, radius + pixel, abs(p.x));
    for (int side = 0; side < 2; side++) {
      float depth = side == 0 ? -root : root;
      float theta = atan(x, depth);
      float winding = theta * 9.0 - y * (12.0 + progress * 12.0)
        - y * y * y * 7.0 - clock * 1.7;
      float strand = abs(sin(winding));
      float edge = clamp(pixel * (9.0 / (radius * max(root, 0.14))
        + (12.0 + progress * 12.0 + 21.0 * y * y) / coreLength) * 0.40, 0.035, 0.55);
      float filament = 1.0 - smoothstep(0.16, 0.16 + edge, strand);
      float sheath = exp(-strand * strand * 7.0) * 0.27;
      float axial = pow(0.5 + 0.5 * cos(abs(y) * 18.0 - clock * 2.3), 6.0);
      float sheen = pow(max(depth, 0.0), 5.0);
      vec3 hot = mix(vec3(0.93, 0.20, 0.08), vec3(1.0, 0.72, 0.27), axial);
      hot = mix(hot, vec3(0.92, 0.96, 1.0), sheen * filament * 0.75);
      hot = mix(hot, spectral(0.72 + y * 0.16), pow(abs(x), 8.0) * 0.80);
      hot *= mix(1.0, 0.59, u_light) * (side == 0 ? 0.56 : 1.0);
      float mask = (filament * 0.82 + sheath + 0.04) * endMask * sideMask;
      navierOver(color, alpha, hot, mask);
    }
  }

  // Opposing oscillatory pulse families mark the corrective annulus. They are
  // internal transport, not an infinite external force or a proof diagnostic.
  vec2 annular = vec2(p.x, p.y / 0.38);
  float annularR = length(annular);
  float annularAngle = atan(annular.y, annular.x + 0.00001);
  float bandRadius = radius * 1.75 + 0.055;
  float band = exp(-pow((annularR - bandRadius) / max(pixel * 1.5, 0.026), 2.0));
  float familyA = pow(0.5 + 0.5 * sin(annularAngle * 14.0 + clock * 2.0), 5.0);
  float familyB = pow(0.5 + 0.5 * sin(annularAngle * 11.0 - clock * 1.7), 5.0);
  vec3 annulus = mix(vec3(0.46, 0.30, 1.0), vec3(1.0, 0.24, 0.65), familyB);
  navierOver(color, alpha, annulus * mix(1.0, 0.64, u_light), band * (0.20 + 0.60 * max(familyA, familyB)));
  if (p.y < 0.0) navierOver(color, alpha, cool, diskMask);
  float intro = smoothstep(0.0, 1.0, u_intro);
  return vec4(color / max(alpha, 0.0001), alpha * intro * replay);
}`;
