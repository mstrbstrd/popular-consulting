// Retained dye is transported by a bounded 2D solver. Camera compression
// illustrates the reported 3D result, not simulated 3D blowup or proof data.
export const NAVIER_STOKES_SHADER = `
uniform float u_navierProgress;
uniform float u_navierFluidReady;
uniform sampler2D u_navierDye;

vec3 navierPigment(vec2 uv) {
  if (u_navierFluidReady > 0.5) {
    // Manual interpolation avoids a float-linear extension requirement.
    vec2 size = vec2(textureSize(u_navierDye, 0));
    vec2 st = clamp(uv * size - 0.5, vec2(0.0), size - 1.0);
    ivec2 i = ivec2(floor(st));
    ivec2 edge = ivec2(size) - 1;
    vec2 f = fract(st);
    return mix(mix(texelFetch(u_navierDye, i, 0).rgb,
      texelFetch(u_navierDye, min(i + ivec2(1,0),edge), 0).rgb, f.x),
      mix(texelFetch(u_navierDye, min(i + ivec2(0,1),edge), 0).rgb,
      texelFetch(u_navierDye, min(i + ivec2(1),edge), 0).rgb, f.x), f.y);
  }
  // Stateless capability fallback, intentionally not called a simulation.
  vec2 p = uv - 0.5;
  float r = length(p);
  float a = r > 0.0001 ? atan(p.y,p.x) : 0.0;
  float phase = a + 10.0 * r - u_time * 0.2 + u_seed * TAU;
  phase += 0.8 * sin(a * 3.0 - r * 12.0 + sin(u_time * 0.13));
  float ringDistance = (r - 0.27) * 6.5;
  float width = exp(-ringDistance * ringDistance);
  return (0.5 + 0.5 * cos(phase * 1.2 + vec3(0.0, 2.1, 4.2)))
    * width * pow(0.5 + 0.5 * sin(phase * 5.0), 2.0);
}

float navierDensity(vec3 ink) { return dot(ink, vec3(0.333333)); }

vec4 sceneNavierStokes(vec2 uv, float time) {
  float cycle = mod(max(time, 0.0), 28.0) / 28.0;
  float progress = u_navierProgress < 0.0
    ? smoothstep(0.04, 0.92, cycle) : clamp(u_navierProgress, 0.0, 1.0);
  float replay = u_navierProgress < 0.0
    ? smoothstep(0.0, 0.04, cycle) * (1.0 - smoothstep(0.94, 1.0, cycle)) : 1.0;
  float aspect = aspectScale().x;
  float portrait = 1.0 - smoothstep(0.72, 1.05, aspect);
  float compact = 1.0 - smoothstep(340.0, 410.0, u_res.y);
  float inspecting = step(0.0, u_navierProgress);
  float vertical = mix(1.0, mix(mix(0.65, 0.43, compact),
    mix(0.45, 0.25, compact), inspecting), portrait);
  float centerY = mix(-0.04, mix(-0.12, 0.06, inspecting), portrait);
  float horizontal = clamp(aspect * 1.12, 0.36, 1.05);
  vec2 p = centeredUv(uv);
  p.x -= max(aspect - 1.0, 0.0) * 0.36;
  p /= vec2(horizontal, vertical);
  p.y -= centerY / vertical;
  p = rotate2(-0.22) * p;
  vec2 pointer = centeredUv(u_pointer);
  float pulse = pulseField(uv);
  p.x -= sin(p.y * 2.4) * pointer.x * u_energy * 0.035;
  p += p / max(length(p), 0.0001) * pulse * 0.018;
  // Positive display limits. Scrubbing reframes retained state, not history.
  vec2 scale = vec2(mix(1.48, 0.58, progress), mix(1.26, 0.96, progress));
  vec2 q = p / scale * 0.5 + 0.5;
  if (min(min(q.x, q.y), min(1.0-q.x, 1.0-q.y)) <= 0.0) return vec4(0.0);
  vec3 ink = navierPigment(q);
  float density = navierDensity(ink);
  vec2 texel = u_navierFluidReady > 0.5 ? 1.0 / vec2(textureSize(u_navierDye, 0)) : vec2(1.0/256.0);
  float left = navierDensity(navierPigment(q - vec2(texel.x,0.0)));
  float right = navierDensity(navierPigment(q + vec2(texel.x,0.0)));
  float down = navierDensity(navierPigment(q - vec2(0.0,texel.y)));
  float up = navierDensity(navierPigment(q + vec2(0.0,texel.y)));
  vec2 slope = vec2(right-left, up-down);
  vec3 normal = normalize(vec3(-slope * 10.0, 0.24));
  float diffuse = max(dot(normal, normalize(vec3(-0.55,0.65,1.0))), 0.0);
  float edge = min(length(slope) * 9.0, 1.0);
  float shine = pow(max(dot(normal, normalize(vec3(-0.25,0.65,1.0))), 0.0), 18.0);
  vec3 tint = (ink.r * vec3(0.04,0.79,0.90) + ink.g * vec3(1.0,0.29,0.07)
    + ink.b * vec3(0.40,0.09,0.86)) / max(ink.r + ink.g + ink.b, 0.0001);
  float opacity = 1.0 - exp(-density * 7.0);
  float glow = pow(max(density, 0.0), 0.6);
  vec3 dark = tint * (0.42 + diffuse * 0.85 + glow * 0.8)
    + vec3(0.73,0.94,1.0) * (edge * 0.2 + shine * 0.18);
  vec3 light = tint * (0.42 + diffuse * 0.28) + vec3(0.04,0.03,0.09)
    + vec3(0.62,0.78,0.9) * edge * 0.16;
  float crop = smoothstep(0.0, 0.10, min(min(q.x,q.y),min(1.0-q.x,1.0-q.y)));
  float intro = smoothstep(0.0,1.0,u_intro);
  return vec4(mix(dark, light, u_light), opacity * crop * intro * replay);
}`;
