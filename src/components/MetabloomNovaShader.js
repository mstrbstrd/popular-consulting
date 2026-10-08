// Nova is a material on the native seven-lobe Metabloom field, not a separate
// flame-shaped body. Its bounded edge flow is visual, not a combustion solver.
export const METABLOOM_NOVA_SHADER = `
uniform float u_metabloomNovaMix;
uniform float u_novaTime;

// Halfway between the restrained floating finish and a fuller flame treatment.
// This changes heat and fringe flow only, never the shared body's placement.
const float NOVA_FIRE_BALANCE = 0.5;

vec3 novaTemperatureColor(float heat) {
  heat = sat(heat);
  vec3 color = mix(vec3(0.30, 0.009, 0.001), vec3(1.0, 0.12, 0.006),
    smoothstep(0.0, 0.32, heat));
  color = mix(color, vec3(1.0, 0.48, 0.018), smoothstep(0.25, 0.62, heat));
  color = mix(color, vec3(1.0, 0.86, 0.25), smoothstep(0.54, 0.85, heat));
  return mix(color, vec3(1.0, 0.97, 0.78), smoothstep(0.82, 1.0, heat));
}

// Backtrace a bounded distance from the actual moving surface. Only the fringe
// uses this coordinate; the native body, anchor, scale and pose never move.
vec3 novaEdgeFlow(vec2 p, vec2 up) {
  vec2 side = vec2(up.y, -up.x);
  vec2 q = vec2(dot(p, side), dot(p, up));
  vec2 flowScale = mix(vec2(8.0, 6.0), vec2(6.2, 6.8), NOVA_FIRE_BALANCE);
  float flowSpeed = mix(1.1, 1.9, NOVA_FIRE_BALANCE);
  vec2 travel = q * flowScale
    + vec2(u_seed * 19.1, 3.7 - u_novaTime * flowSpeed);
  float eddy = fbm(travel);
  float curl = fbm(travel * vec2(1.18, 0.86) + vec2(8.3, -u_novaTime * 0.06));
  float enabled = step(0.5, u_avatarEnabled);
  float flare = sat(exp(-max(u_pulseAge, 0.0) * 3.8) * 0.62
    + enabled * (sat(u_avatarTalking) * 0.18
      + sat(u_avatarExpression) * sat(u_avatarIntensity) * 0.18
      + clamp(u_avatarBurst, 0.0, 0.52)));
  float liftRange = mix(0.085 + flare * 0.025,
    0.215 + flare * 0.075, NOVA_FIRE_BALANCE);
  float lift = mix(0.012, 0.020, NOVA_FIRE_BALANCE)
    + smoothstep(0.22, 0.76, eddy) * liftRange;
  float wind = clamp(u_pointer.x - 0.5, -0.5, 0.5) * sat(u_energy);
  vec2 displacement = up * lift
    + side * ((curl - 0.47) * mix(0.052, 0.092, NOVA_FIRE_BALANCE)
      + wind * lift * 0.35);
  return vec3(displacement, eddy);
}

// Each spark is attached to a native lobe, with a fixed seven-spark budget.
// Zero opacity at both ends of life makes recycling continuous.
float novaSurfaceEmber(vec2 delta, float radius, float layer, vec2 up) {
  float random = hash(vec2(layer + 2.0, u_seed * 31.0));
  float emberSpeed = mix(0.18 + random * 0.10,
    0.20 + random * 0.12, NOVA_FIRE_BALANCE);
  float life = fract(u_novaTime * emberSpeed + layer * 0.618 + u_seed);
  vec2 side = vec2(up.y, -up.x);
  vec2 origin = up * (radius * 0.72
    + life * mix(0.17, 0.27, NOVA_FIRE_BALANCE) + life * life * 0.08)
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
  float liquidHeat = 0.30 + core * 0.42 + membrane * 0.16 + flow.z * 0.10;
  // Advected heat rolls through the intact molten body. Reduce the fixed bright
  // rim so this reads as fire flowing from liquid, not a glowing outline.
  float flameHeat = 0.24 + core * 0.60 + membrane * 0.06
    + smoothstep(0.20, 0.78, flow.z) * 0.18;
  float heat = sat(mix(liquidHeat, flameHeat, NOVA_FIRE_BALANCE));
  vec3 color = novaTemperatureColor(heat) * (0.72 + core * 0.38);
  color += novaTemperatureColor(0.88) * edge
    * mix(0.14 + membrane * 0.09, 0.07 + flow.z * 0.10, NOVA_FIRE_BALANCE);
  color *= mix(1.0, 0.88, u_light);

  // Use the original body's alpha verbatim. Flames cannot hollow it out,
  // detach it from the native field, or shift its centre toward a fuel base.
  float alpha = nativeMaterial.a;
  vec3 premultiplied = color * alpha;
  float materialField = potential * (1.12 + membrane * 0.18) + edge * 0.24;
  float outside = 1.0 - smoothstep(0.72, 1.20, materialField);
  float tongues = smoothstep(0.74, 1.16, liftedPotential * (1.10 + flow.z * 0.18));
  float flameOpacity = mix(mix(0.78, 0.86, u_light),
    mix(0.92, 0.96, u_light), NOVA_FIRE_BALANCE);
  float flame = tongues * outside * flameOpacity;
  float fringeHeat = mix(0.30 + tongues * 0.38 + flow.z * 0.15,
    0.20 + tongues * 0.55 + flow.z * 0.10, NOVA_FIRE_BALANCE);
  vec3 fireColor = novaTemperatureColor(sat(fringeHeat));
  premultiplied += fireColor * flame * (1.0 - alpha);
  alpha += flame * (1.0 - alpha);
  float ember = sat(embers);
  premultiplied += novaTemperatureColor(0.78) * ember * (1.0 - alpha);
  alpha += ember * (1.0 - alpha);
  return vec4(premultiplied / max(alpha, 0.00001), sat(alpha));
}

// Apply Tidal Weave's pale spectrum to a narrow visible opacity contour.
// This is RGB-only: no halo, alpha expansion, displacement, or interior tint.
vec4 novaPrismaticEdges(vec4 fire, vec2 p, float baseHue) {
  float outlineWidth = clamp(fwidth(fire.a) * 0.72, 0.010, 0.045);
  float outline = 1.0 - smoothstep(
    outlineWidth, outlineWidth * 1.90, abs(fire.a - 0.46)
  );
  vec3 outlineSpectrum = spectral(
    0.47 + p.x * 0.85 + p.y * 0.32 + baseHue * 0.12 + u_novaTime * 0.012
  );
  vec3 outlineTint = max(
    mix(vec3(0.96), outlineSpectrum, mix(0.48, 0.42, u_light)),
    vec3(mix(0.70, 0.78, u_light))
  );
  return vec4(mix(fire.rgb, outlineTint, outline * mix(0.92, 0.90, u_light)), fire.a);
}

// Reuse the actual Metalbloom optical material on the core. The lifted flames
// and sparks use its same mercury ramp, with Nova's existing heat modulation.
// Palette changes cannot affect alpha, geometry, time, or the flame balance.
vec4 novaMetalFinish(vec4 fire, vec4 metalMaterial, float nativeAlpha) {
  float metalMix = sat(u_metabloomPaletteMix);
  if (metalMix <= 0.001) return fire;
  float heat = sat(dot(fire.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 mercuryShadow = mix(vec3(0.010, 0.014, 0.020), vec3(0.070, 0.078, 0.090), u_light);
  vec3 mercuryMid = mix(vec3(0.480, 0.505, 0.545), vec3(0.655, 0.675, 0.710), u_light);
  vec3 mercuryHighlight = mix(vec3(1.520, 1.560, 1.630), vec3(1.420, 1.455, 1.515), u_light);
  vec3 silverFlame = mix(mercuryShadow, mercuryMid, smoothstep(0.06, 0.54, heat));
  silverFlame = mix(silverFlame, mercuryHighlight, smoothstep(0.48, 0.98, heat));
  float exterior = 1.0 - smoothstep(0.30, 0.80, nativeAlpha);
  vec3 metalColor = mix(metalMaterial.rgb, silverFlame, exterior);
  return vec4(mix(fire.rgb, metalColor, metalMix), fire.a);
}

vec4 blendNovaFire(vec4 material, vec4 fire) {
  float amount = smoothstep(0.0, 1.0, sat(u_metabloomNovaMix));
  if (amount <= 0.001) return material;
  float alpha = mix(material.a, fire.a, amount);
  vec3 premultiplied = mix(material.rgb * material.a, fire.rgb * fire.a, amount);
  return vec4(premultiplied / max(alpha, 0.00001), alpha);
}
`;
