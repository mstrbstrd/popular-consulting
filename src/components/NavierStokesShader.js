import { NAVIER_CORE_SHADER } from "./navierStokesField";

// One connected periodic dye field. Tiny cores are a bounded artistic
// concentration cue, not numerical singularities or energy measurements.
export const NAVIER_STOKES_SHADER = `
uniform float u_navierProgress;
uniform float u_navierFluidReady;
uniform sampler2D u_navierDye;
uniform int u_navierColorway;
uniform vec3 u_navierColors[8];
${NAVIER_CORE_SHADER}

vec3 navierColor(int index, vec3 original) {
  return u_navierColorway > 0 ? u_navierColors[index] : original;
}

vec3 navierPigment(vec2 uv) {
  if (u_navierFluidReady > 0.5) {
    ivec2 size = textureSize(u_navierDye, 0);
    vec2 st = fract(uv) * vec2(size) - 0.5;
    ivec2 i = ivec2(floor(st)) + size;
    vec2 f = fract(st);
    return mix(mix(texelFetch(u_navierDye, i % size, 0).rgb,
      texelFetch(u_navierDye, (i + ivec2(1,0)) % size, 0).rgb, f.x),
      mix(texelFetch(u_navierDye, (i + ivec2(0,1)) % size, 0).rgb,
      texelFetch(u_navierDye, (i + ivec2(1)) % size, 0).rgb, f.x), f.y);
  }
  // Same full-domain composition when floating targets are unavailable.
  // This path is a stateless illustration, never advertised as a solver.
  vec2 p = uv * TAU;
  float phase = u_time * 0.13 + u_seed * TAU;
  float wave = sin(p.x * 2.0 + sin(p.y * 3.0 + phase))
    + cos(p.y * 2.0 + sin(p.x + phase));
  vec3 ink = (0.5 + 0.5 * cos(p.x + p.y + wave + vec3(0.0,2.1,4.2)))
    * (0.085 + 0.28 * pow(0.5 + 0.5 * sin(wave * 5.0 + p.y), 2.0));
  for (int i = 0; i < 4; i++) {
    if (i >= u_navierCoreCount) break;
    vec4 core = u_navierCores[i];
    vec2 d = navierDelta(uv, core.xy);
    float r = length(d);
    float a = r > 0.0001 ? atan(d.y, d.x) : 0.0;
    float spiral = 4.0 * a + log(r + 0.045) * 12.0 * sign(core.w) + phase;
    ink += exp(-r * r / 0.032) * pow(0.5 + 0.5 * sin(spiral), 3.0) * 0.55
      * (0.5 + 0.5 * cos(a * 2.0 + float(i) * 1.7 + vec3(0.0,2.1,4.2)));
  }
  return ink;
}

float navierDensity(vec3 ink) { return dot(ink, vec3(0.333333)); }

vec4 sceneNavierStokes(vec2 uv, float time) {
  // Screen and simulation use identical UVs. No tiling a cropped square,
  // camera contraction, 28-second wrap, global opacity fade or history reset.
  vec2 metric = navierMetric();
  vec2 q = uv;
  float pulse = pulseField(uv);
  vec2 pulseDelta = navierDelta(uv, u_pulseOrigin);
  q += pulseDelta / max(length(pulseDelta), 0.0001) / metric * pulse * 0.012;
  q += (u_pointer - 0.5) * u_energy * 0.006;
  vec3 ink = navierPigment(q);
  float density = navierDensity(ink);
  vec2 texel = u_navierFluidReady > 0.5
    ? 1.0 / vec2(textureSize(u_navierDye, 0)) : vec2(1.0 / 256.0);
  vec2 slope = vec2(
    navierDensity(navierPigment(q + vec2(texel.x,0.0))) - navierDensity(navierPigment(q - vec2(texel.x,0.0))),
    navierDensity(navierPigment(q + vec2(0.0,texel.y))) - navierDensity(navierPigment(q - vec2(0.0,texel.y))));
  vec3 normal = normalize(vec3(-slope * 9.0, 0.28));
  float diffuse = max(dot(normal, normalize(vec3(-0.55,0.65,1.0))), 0.0);
  float edge = min(length(slope) * 8.0, 1.0);
  float shine = pow(max(dot(normal, normalize(vec3(-0.25,0.65,1.0))), 0.0), 18.0);
  vec3 tint = (ink.r * navierColor(0, vec3(0.04,0.79,0.90)) + ink.g * navierColor(1, vec3(1.0,0.29,0.07))
    + ink.b * navierColor(2, vec3(0.40,0.09,0.86))) / max(ink.r + ink.g + ink.b, 0.0001);
  float opacity = 1.0 - exp(-density * 8.0);
  float glow = pow(max(density, 0.0), 0.6);
  vec3 dark = tint * (0.40 + diffuse * 0.85 + glow * 0.80)
    + navierColor(3, vec3(0.73,0.94,1.0)) * (edge * 0.20 + shine * 0.12);
  vec3 light = tint * (0.38 + diffuse * 0.27) + navierColor(4, vec3(0.035,0.025,0.08))
    + navierColor(5, vec3(0.62,0.78,0.9)) * edge * 0.12;
  vec3 color = mix(dark, light, u_light);
  // The mathematical display radius keeps shrinking. One drawing-pixel floor
  // retains a finite, antialiased nucleus, not an ever-brighter screen flash.
  float pixel = 1.0 / max(min(u_res.x, u_res.y), 1.0);
  for (int i = 0; i < 4; i++) {
    if (i >= u_navierCoreCount) break;
    vec4 core = u_navierCores[i];
    float progress = u_navierProgress < 0.0 ? core.z : clamp(u_navierProgress, 0.0, 1.0);
    float radius = max(navierRadius(progress), pixel * 1.15);
    float distance = length(navierDelta(uv, core.xy)) / radius;
    float nucleus = exp(-distance * distance * 2.0);
    float rimDistance = distance - 1.0;
    float rim = exp(-rimDistance * rimDistance * 14.0) * 0.024;
    float presence = clamp((nucleus * mix(0.12, 1.0, smoothstep(0.25, 0.8, progress)) + rim) * abs(core.w), 0.0, 1.0);
    vec3 coreTint = mix(navierColor(6, vec3(0.85,0.98,1.0)), navierColor(7, vec3(0.10,0.035,0.20)), u_light);
    color = mix(color, coreTint, presence * 0.88);
    opacity = max(opacity, presence);
  }
  return vec4(color, opacity * smoothstep(0.0, 1.0, u_intro));
}`;
