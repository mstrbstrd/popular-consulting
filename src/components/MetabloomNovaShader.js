// Nova is a material on the native seven-lobe Metabloom field, not a separate
// flame-shaped body. Its bounded edge flow is visual, not a combustion solver.
export const METABLOOM_NOVA_SHADER = `
uniform float u_metabloomNovaMix;
uniform float u_novaTime;

vec3 novaTemperatureColor(float heat) {
  heat = sat(heat);
  vec3 color = mix(vec3(0.30, 0.009, 0.001), vec3(1.0, 0.12, 0.006),
    smoothstep(0.0, 0.32, heat));
  color = mix(color, vec3(1.0, 0.48, 0.018), smoothstep(0.25, 0.62, heat));
  color = mix(color, vec3(1.0, 0.86, 0.25), smoothstep(0.54, 0.85, heat));
  return mix(color, vec3(1.0, 0.97, 0.78), smoothstep(0.82, 1.0, heat));
}

// Backtrace a short distance from the actual moving surface. Only the fringe
// uses this coordinate; the native body, anchor, scale and pose never move.
vec3 novaEdgeFlow(vec2 p, vec2 up) {
  vec2 side = vec2(up.y, -up.x);
  vec2 q = vec2(dot(p, side), dot(p, up));
  vec2 travel = q * vec2(8.0, 6.0)
    + vec2(u_seed * 19.1, 3.7 - u_novaTime * 1.1);
  float eddy = fbm(travel);
  float curl = fbm(travel * vec2(1.18, 0.86) + vec2(8.3, -u_novaTime * 0.06));
  float enabled = step(0.5, u_avatarEnabled);
  float flare = sat(exp(-max(u_pulseAge, 0.0) * 3.8) * 0.62
    + enabled * (sat(u_avatarTalking) * 0.18
      + sat(u_avatarExpression) * sat(u_avatarIntensity) * 0.18
      + clamp(u_avatarBurst, 0.0, 0.52)));
  float lift = 0.012 + smoothstep(0.22, 0.76, eddy) * (0.085 + flare * 0.025);
  float wind = clamp(u_pointer.x - 0.5, -0.5, 0.5) * sat(u_energy);
  vec2 displacement = up * lift
    + side * ((curl - 0.47) * 0.052 + wind * lift * 0.35);
  return vec3(displacement, eddy);
}

// Each spark is attached to a native lobe, with a fixed seven-spark budget.
// Zero opacity at both ends of life makes recycling continuous.
float novaSurfaceEmber(vec2 delta, float radius, float layer, vec2 up) {
  float random = hash(vec2(layer + 2.0, u_seed * 31.0));
  float life = fract(u_novaTime * (0.18 + random * 0.10) + layer * 0.618 + u_seed);
  vec2 side = vec2(up.y, -up.x);
  vec2 origin = up * (radius * 0.72 + life * 0.17 + life * life * 0.08)
    + side * ((random - 0.5) * radius + sin(life * 4.0 + layer) * life * 0.018);
  vec2 distance = delta - origin;
  vec2 spark = vec2(dot(distance, side), dot(distance, up)) / vec2(0.0028, 0.0055);
  return exp(-dot(spark, spark)) * smoothstep(0.0, 0.12, life)
    * (1.0 - smoothstep(0.45, 0.95, life)) * 0.62;
}

vec4 novaFireMaterial(vec4 nativeMaterial, vec3 field, vec3 flow, float liftedPotential, float embers) {
  float potential = field.x;
  float membrane = field.y;
  float edge = field.z;
  float core = smoothstep(1.0, 3.0, potential);
  float heat = sat(0.30 + core * 0.42 + membrane * 0.16 + flow.z * 0.10);
  vec3 color = novaTemperatureColor(heat) * (0.72 + core * 0.38);
  color += novaTemperatureColor(0.88) * edge * (0.14 + membrane * 0.09);
  color *= mix(1.0, 0.88, u_light);

  // Use the original body's alpha verbatim. Flames cannot hollow it out,
  // detach it from the native field, or shift its centre toward a fuel base.
  float alpha = nativeMaterial.a;
  vec3 premultiplied = color * alpha;
  float materialField = potential * (1.12 + membrane * 0.18) + edge * 0.24;
  float outside = 1.0 - smoothstep(0.72, 1.20, materialField);
  float tongues = smoothstep(0.74, 1.16, liftedPotential * (1.10 + flow.z * 0.18));
  float flame = tongues * outside * mix(0.78, 0.86, u_light);
  vec3 fireColor = novaTemperatureColor(sat(0.30 + tongues * 0.38 + flow.z * 0.15));
  premultiplied += fireColor * flame * (1.0 - alpha);
  alpha += flame * (1.0 - alpha);
  float ember = sat(embers);
  premultiplied += novaTemperatureColor(0.78) * ember * (1.0 - alpha);
  alpha += ember * (1.0 - alpha);
  return vec4(premultiplied / max(alpha, 0.00001), sat(alpha));
}

vec4 blendNovaFire(vec4 material, vec4 fire) {
  float amount = smoothstep(0.0, 1.0, sat(u_metabloomNovaMix));
  if (amount <= 0.001) return material;
  float alpha = mix(material.a, fire.a, amount);
  vec3 premultiplied = mix(material.rgb * material.a, fire.rgb * fire.a, amount);
  return vec4(premultiplied / max(alpha, 0.00001), alpha);
}
`;
