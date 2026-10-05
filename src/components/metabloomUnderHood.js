// Local presentation only. Forward Pass is an authored network visualization.
export const METABLOOM_HOOD_SEQUENCE = Object.freeze([
  { phase: "seam", duration: 700 },
  { phase: "open", duration: 5100 },
  { phase: "closing", duration: 1600 },
]);

export const createMetabloomHoodTransition = () => {
  let phase = null;
  let elapsed = 0;
  let origin = 0;
  let opening = 0;
  let seam = 0;
  return {
    sample(nextPhase, delta = 0, immediate = false) {
      if (nextPhase !== phase) {
        phase = nextPhase;
        origin = opening;
        elapsed = 0;
      }
      if (!phase) {
        opening = 0;
        seam = 0;
        return [0, 0];
      }
      const duration = phase === "seam" ? 0.7 : phase === "open" ? 1.7 : 1.6;
      elapsed = immediate ? duration : Math.min(duration, elapsed + Math.max(0, delta));
      const t = elapsed / duration;
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      opening = origin + ((phase === "open" ? 1 : 0) - origin) * eased;
      seam = phase === "seam" ? eased : phase === "open" ? 1 : 1 - Math.max(0, (t - 0.8) / 0.2);
      return [opening, seam];
    },
  };
};

// Adapt Second Surface's continuous fault, asymmetric lip and spectral spill
// into the existing field pass. The standalone Rupture renderer stays isolated.
export const METABLOOM_HOOD_SHADER = `
uniform vec2 u_underHood;

vec4 sceneMetabloomUnderHood(vec2 uv, float time) {
  if (u_underHood.y <= 0.0) return sceneMetabloom(uv, time);
  float progress = clamp(u_underHood.x, 0.0, 1.0);
  float faultY = 0.27 + uv.x * 0.43
    + sin(uv.x * 5.1 + 0.6) * 0.055
    + sin(uv.x * 11.7 - 0.4) * 0.018;
  float signedDistance = uv.y - faultY;
  float side = step(0.0, signedDistance);
  float envelope = 0.72 + 0.92 * exp(-pow((uv.x - 0.57) / 0.19, 2.0));
  float width = (progress * 0.36 + pow(progress, 6.0) * 1.8)
    * envelope * mix(0.66, 1.28, side);
  float distanceToLip = abs(signedDistance) - width;
  float feather = max(fwidth(signedDistance) * 1.5, 0.002);
  float inside = (1.0 - smoothstep(-feather, feather, distanceToLip))
    * smoothstep(0.0, 0.025, progress);
  float fullOpen = smoothstep(0.94, 1.0, progress);
  inside = mix(inside, 1.0, fullOpen);
  vec2 surfaceUv = uv - vec2(-0.18, 1.0) * sign(signedDistance) * width * 0.65;
  vec4 surface = vec4(0.0);
  if (inside < 1.0) surface = sceneMetabloom(surfaceUv, time);
  vec3 spectrum = spectral(uv.x * 0.22 + time * 0.03);
  float trace = smoothstep(uv.x - 0.08, uv.x + 0.08, u_underHood.y * 1.16 - 0.08);
  float edge = exp(-abs(distanceToLip) * 185.0) * trace * (1.0 - fullOpen);
  float spill = exp(-abs(distanceToLip) * 27.0) * progress * (1.0 - fullOpen);
  float lipShadow = exp(-max(distanceToLip, 0.0) * 92.0) * progress;
  surface.rgb *= 1.0 - lipShadow * 0.38;
  surface.rgb += spectrum * spill * 0.34;

  vec4 network = vec4(0.0);
  if (inside > 0.0) {
    network = sceneForwardPass(uv, time);
    vec3 depth = mix(vec3(0.009, 0.014, 0.032), vec3(0.94, 0.95, 0.98), u_light);
    network = vec4(mix(depth, network.rgb, network.a), 1.0);
  }
  vec4 blended = mix(vec4(surface.rgb * surface.a, surface.a), network, inside);
  float rim = clamp(edge * 0.92, 0.0, 1.0);
  vec3 rimColor = mix(spectrum, vec3(1.0), side * 0.42);
  blended.rgb = blended.rgb * (1.0 - rim) + rimColor * rim;
  blended.a = blended.a + rim * (1.0 - blended.a);
  return vec4(blended.rgb / max(blended.a, 0.00001), blended.a);
}
`;
