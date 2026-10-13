// An artistic view of the reported smooth-forcing construction, not a PDE
// solver. Four nested material sheets have two analytic intersections each.
// No ray marching, particle buffers, feedback textures or unbounded scales.
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
  float clock = time * 0.42 + exp2(progress * 4.0) + u_seed * TAU;
  float aspect = aspectScale().x;
  float portrait = 1.0 - smoothstep(0.72, 1.05, aspect);
  float compact = 1.0 - smoothstep(340.0, 410.0, u_res.y);
  float inspecting = step(0.0, u_navierProgress);
  float vertical = mix(1.0, mix(mix(0.57, 0.40, compact),
    mix(0.43, 0.24, compact), inspecting), portrait);
  float centerY = mix(-0.05, mix(-0.10, 0.06, inspecting), portrait);
  float horizontal = clamp(aspect * 0.92, 0.30, 1.0);
  vec2 p = centeredUv(uv);
  p.x -= max(aspect - 1.0, 0.0) * 0.17;
  p /= vec2(horizontal, vertical);
  p.y -= centerY / vertical;
  // A restrained camera roll and fluid bend. Neither changes the reference
  // scales. The shared clock still owns pause, reduced motion and visibility.
  p = rotate2(-0.16 + sin(clock * 0.13) * 0.045) * p;
  vec2 pointer = centeredUv(u_pointer);
  float pulse = pulseField(uv);
  p.x -= sin(p.y * 2.5) * pointer.x * u_energy * 0.07;
  p.x += sin(p.y * 5.0 - clock * 0.25) * pulse * 0.035;
  p.x -= sin(p.y * 5.0 + clock * 0.18) * (0.028 + 0.038 * (1.0 - progress))
    * (1.0 - exp(-p.y * p.y * 4.0));
  float pixel = max(2.0 / (max(u_res.y, 1.0) * vertical),
    2.0 / max(u_res.x, 1.0));
  // Display compression preserves contraction and increasing slenderness,
  // rather than attempting to put the mathematical singularity on the GPU.
  float radialScale = mix(1.0, 0.35, progress);
  float axialScale = mix(0.90, 0.69, progress);
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  // The luminous axial core is continuous, tapered and increasingly slender.
  // Brightness is a visual encoding of concentration, not an energy integral.
  float y = p.y / axialScale;
  float cap = 1.0 - smoothstep(0.73, 1.0, abs(y));
  float coreRadius = mix(0.052, 0.009, progress) * (0.48 + 0.52 * exp(-y * y * 5.0));
  float distance = abs(p.x) / max(coreRadius, pixel);
  float heart = exp(-distance * distance * 1.6) * cap;
  float wake = exp(-distance * 0.55) * cap * 0.25;
  vec3 core = mix(vec3(1.0, 0.44, 0.16), vec3(0.83, 1.0, 0.95), heart);
  core *= mix(1.6, 0.68, u_light);
  float coreOpacity = (heart * 0.7 + wake * (0.4 + progress * 0.6)) * exp(-y * y * 5.0);

  // Eight bounded analytic sheet intersections. The broad body, rolling
  // caustics and fine advected grooves all belong to the same curved surface.
  for (int side = 0; side < 2; side++) {
    for (int sheet = 0; sheet < 4; sheet++) {
      float layer = float(side == 0 ? sheet : 3 - sheet);
      float scale = 1.0 - layer * 0.175;
      float y = p.y / axialScale;
      float cap = 1.0 - smoothstep(0.83, 1.0, abs(y));
      float neck = 0.028 + 0.04 * (1.0 - progress);
      float waist = 0.19 + layer * 0.026;
      float sy = y / waist;
      float curlCenter = 0.28 * (1.0 - progress * 0.7);
      float curlY = (abs(y) - curlCenter) / waist;
      float broad = 0.73 * exp(-curlY * curlY) + 0.13 / (1.0 + sy * sy);
      float radialWave = 1.0 + 0.065 * sin(y * 12.0 + clock * 0.65 + layer * 1.9);
      float radius = max((neck + broad) * scale * radialScale * radialWave * sqrt(cap), pixel * 0.8);
      float surfaceX = p.x - radius * 0.06 * sin(y * 10.0 - clock * 0.35 + layer * 1.8);
      float x = surfaceX / radius;
      if (abs(x) > 1.0 || cap <= 0.0) continue;
      float root = sqrt(max(1.0 - x * x, 0.0001));
      float depth = side == 0 ? -root : root;
      float theta = atan(x, depth);
      float slope = -1.46 * sign(y) * curlY / waist * exp(-curlY * curlY)
        - 0.26 * y / (waist * waist * (1.0 + sy * sy) * (1.0 + sy * sy));
      slope *= scale * radialScale / axialScale;
      vec3 normal = normalize(vec3(x, -slope, depth));
      float roll = theta * 3.0 + y * (6.0 + progress * 12.0) - clock * 1.5 + layer * 2.1;
      roll += 0.65 * sin(theta * 2.0 - y * 7.0 + clock * 0.31);
      float ribbon = smoothstep(-0.72, 0.42, sin(roll));
      // A nearest-cell eddy curls the etched currents on the sheet. The lookup
      // has constant cost; no particle integration or accumulated state.
      vec2 cell = vec2(sin(theta) * 2.4, y * 3.0 - clock * 0.13 + layer * 0.31);
      vec2 local = fract(cell) - 0.5;
      float eddy = exp(-dot(local, local) * 15.0)
        * (1.0 - smoothstep(0.32, 0.5, max(abs(local.x), abs(local.y))));
      float eddyAngle = eddy * (2.2 + 0.6 * sin(floor(cell.y) * 1.9 + clock * 0.23));
      vec2 curl = rotate2(eddyAngle) * local;
      float threadPhase = roll * 9.0 + (curl.y - local.y) * 17.0;
      // Analytical pixel footprints avoid derivatives in divergent branches.
      // Subpixel threads become their mean, rather than sparkling/aliasing.
      float footprint = pixel * (3.0 / (radius * max(root, 0.16))
        + (6.0 + progress * 12.0) / axialScale);
      float fine = 0.5;
      float finer = 0.5;
      if (footprint * 9.0 < 1.8) {
        fine += sin(threadPhase) * 0.5 * (1.0 - smoothstep(0.45, 1.8, footprint * 9.0));
      }
      if (footprint * 23.0 < 1.8) {
        finer += sin(threadPhase * 2.55 - clock * 0.4) * 0.5
          * (1.0 - smoothstep(0.45, 1.8, footprint * 23.0));
      }
      float normalRoll = sin(roll) * 0.18 + (fine - 0.5) * 0.10;
      normal = normalize(normal + vec3(cos(theta) * normalRoll, normalRoll * 0.65, -sin(theta) * normalRoll));
      float facing = clamp(abs(normal.z), 0.0, 1.0);
      float rim = pow(1.0 - facing, 2.2);
      float key = pow(max(dot(normal, normalize(vec3(-0.5, 0.6, 1.0))), 0.0), 13.0);
      float caustic = pow(0.5 + 0.5 * sin(roll + facing * 5.0), 9.0);
      float heat = smoothstep(0.36, 0.92, abs(y)) * (0.35 + progress * 0.65);
      float hue = 0.78 + sin(theta) * 0.24 + y * 0.48 + layer * 0.14 + progress * 0.14;
      vec3 tint = spectral(hue);
      tint = mix(tint, vec3(1.0, 0.30, 0.09), heat * 0.75);
      vec3 material = tint * (0.12 + 0.20 * fine + 0.09 * finer + 0.78 * rim);
      material += mix(vec3(0.72, 1.0, 0.98), vec3(1.0, 0.89, 0.72), heat)
        * (key * 1.05 + caustic * 0.6);
      material = mix(material, tint * (0.40 + fine * 0.18 + rim * 0.32)
        + vec3(0.74, 0.87, 0.94) * key * 0.50 + tint * caustic * 0.32, u_light);
      float boundary = 1.0 - smoothstep(radius - pixel * 1.3, radius, abs(surfaceX));
      float opacity = (0.04 + 0.82 * ribbon) * cap * boundary;
      opacity *= side == 0 ? 0.44 : 0.62;
      navierOver(color, alpha, material, opacity);
    }
    // Internal light is occluded by the front sheets, never painted on top.
    if (side == 0) navierOver(color, alpha, core, coreOpacity);
  }

  // Planar inward spirals give the material a surrounding supply of currents,
  // not an unrelated orbit decoration. Fine moving traces converge on the core.
  vec2 disk = vec2(p.x, p.y / 0.26);
  float r = max(length(disk), 0.0001);
  float a = r > 0.0001 ? atan(disk.y, disk.x) : 0.0;
  float winding = a * 4.0 + log(r + 0.12) * 12.0 + clock * 1.7;
  winding += sin(a * 3.0 - r * 8.0 - clock * 0.33) * 0.44;
  float wave = sin(winding);
  float trace = 1.0 - smoothstep(0.025, 0.025 + max(fwidth(wave), 0.05), abs(wave));
  float envelope = smoothstep(0.14 * radialScale, 0.55 * radialScale, r)
    * (1.0 - smoothstep(0.69 * radialScale + 0.24, radialScale + 0.26, r));
  float front = disk.y < 0.0 ? 1.0 : 0.28;
  vec3 tracer = mix(vec3(0.09, 0.65, 0.79), spectral(a * 0.1 + r * 0.3 + 0.72), 0.55);
  navierOver(color, alpha, tracer * mix(1.0, 0.52, u_light), trace * envelope * front * 0.58);
  float intro = smoothstep(0.0, 1.0, u_intro);
  return vec4(color / max(alpha, 0.0001), alpha * intro * replay);
}`;
