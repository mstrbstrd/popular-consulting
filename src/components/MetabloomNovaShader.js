// Nova's procedural combustion field shares the existing canvas, clock and pose.
// This is a bounded visual model of buoyant fire, not a combustion/CFD solver.
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

vec4 sceneNovaFire(vec2 uv, float time) {
  vec2 aspect = aspectScale();
  float enabled = step(0.5, u_avatarEnabled);
  float room = max(0.24, min(1.0, aspect.x / 0.82));
  vec2 offset = clamp(u_avatarOffset, vec2(-0.16), vec2(0.16)) * enabled;
  offset.x *= min(1.0, aspect.x);
  vec2 poseScale = mix(vec2(1.0), clamp(u_avatarScale, vec2(0.76), vec2(1.24)), enabled);
  vec2 p = rotate2(clamp(u_avatarRotation, -0.20, 0.20) * enabled)
    * (((uv - 0.5) * aspect - offset) / poseScale);
  p.x /= room;
  // Retain the original orb's slow viscosity beneath the upward fire flow.
  // Its existing pose clock is continuous across reactions and stops on pause.
  p = viscousWarp(p, u_time, 0.055);

  float voice = enabled * sat(u_avatarTalking);
  float expression = enabled * sat(u_avatarExpression) * sat(u_avatarIntensity);
  float burst = enabled * clamp(u_avatarBurst, 0.0, 0.52);
  float pulse = exp(-max(u_pulseAge, 0.0) * 3.8);
  float flare = sat(pulse * 0.62 + voice * 0.18 + expression * 0.18 + burst);
  float height = p.y + 0.27;
  float aboveFuel = max(height, 0.0);
  float wind = clamp((u_pointer.x - 0.5) * 0.65, -0.25, 0.25) * sat(u_energy);

  // Backtrace through an accelerating updraft. A constant phase moves upward
  // at v(h) = 0.28 * (1 + 3.6h). Broader eddies keep the lift continuous
  // without the small, rapidly tearing ripples of the first fire treatment.
  // Never multiply time by changing interaction strength: that jumps phase.
  float travel = log(1.0 + aboveFuel * 3.6) / 3.6 - time * 0.28;
  vec2 flow = vec2(p.x * 6.2, travel * 6.8) + vec2(u_seed * 19.1, 3.7);
  float eddy = fbm(flow);
  float counterEddy = fbm(flow * vec2(1.21, 0.91) + vec2(8.3, -time * 0.08));
  float curl = (eddy - 0.47) * 0.21 + (counterEddy - 0.47) * 0.10;
  float bend = curl * smoothstep(0.0, 0.45, aboveFuel)
    + wind * aboveFuel * 0.62
    + sin(aboveFuel * 6.5 - time * 1.45 + u_seed * 5.0) * aboveFuel * 0.045;
  float x = p.x - bend;
  float turbulence = fbm(vec2(x * 10.5 + eddy * 1.8, travel * 9.0) + 17.0);
  float fine = noise(vec2(x * 28.0 + counterEddy * 2.4, travel * 20.0));

  // Three bounded metaball lobes share the original orb's slow orbital phase.
  // Their potential feeds the flame itself, rather than adding a second body.
  float fluidPotential = 0.0;
  for (int index = 0; index < 3; index++) {
    float layer = float(index);
    float phase = u_time * (0.16 + layer * 0.009) + layer * 1.71 + u_seed * 7.0;
    vec2 center = vec2(
      sin(phase * 1.13 + layer * 0.91) * 0.085,
      -0.235 + cos(phase * 0.87 - layer * 1.27) * 0.032
    );
    vec2 delta = (p - center) * vec2(1.0, 1.3);
    float radius = 0.080 + 0.009 * sin(phase * 1.7 + layer);
    fluidPotential += radius * radius / (dot(delta, delta) + 0.006);
  }
  float fluidBody = smoothstep(0.34, 1.24, fluidPotential);

  // The cohesive molten base replenishes softer tongues. Cooling still narrows
  // the rising plume; fine noise lights its surface instead of shredding it.
  float flameHeight = 0.66 + flare * 0.14;
  float cooling = sat(aboveFuel / flameHeight);
  float width = mix(0.235 + flare * 0.025, 0.025, pow(cooling, 0.82));
  float fuel = exp(-pow(abs(x) / max(width, 0.025), 2.0) * 1.15);
  float base = exp(-pow(abs(p.x) / 0.19, 2.0) - pow(abs(height - 0.035) / 0.115, 2.0));
  base = mix(base, fluidBody, 0.42);
  float tongues = fuel * (1.12 - cooling * 0.93)
    - turbulence * (0.25 + cooling * 0.63)
    - fine * cooling * 0.035;
  // A smooth union removes the hard seam where liquid becomes flame.
  float junction = max(0.0, 0.10 - abs(tongues - base * 0.76)) / 0.10;
  float density = max(tongues, base * 0.76) + junction * junction * 0.025;
  float foot = smoothstep(-0.13, 0.015, height);
  float tip = 1.0 - smoothstep(flameHeight * 0.85, flameHeight + 0.06, aboveFuel);
  float flame = smoothstep(0.008, 0.20, density) * foot * tip;
  float heat = sat(density * 0.96 + base * 0.36 + flare * 0.14);
  vec3 color = novaTemperatureColor(heat);
  // Local tongues fluctuate independently; no full-screen strobe or hue cycle.
  color *= 0.97 + fine * 0.03;
  color *= mix(1.0, 0.88, u_light);
  float alpha = flame * mix(0.94, 0.98, u_light);
  vec3 premultiplied = color * alpha;

  // A fixed budget of embers follows upward trajectories and burns out before
  // recycling. There are no particle objects, textures, timers or extra passes.
  for (int index = 0; index < 10; index++) {
    float id = float(index);
    float random = hash(vec2(id + 2.0, u_seed * 31.0));
    float life = fract(time * (0.20 + random * 0.12) + id * 0.618 + u_seed);
    float emberY = -0.12 + life * 0.52 + life * life * 0.22;
    float emberX = (random - 0.5) * 0.36
      + sin(life * 5.0 + id * 2.4) * life * 0.055 + wind * life * 0.20;
    vec2 delta = (p - vec2(emberX, emberY)) / vec2(0.0025 + random * 0.0015, 0.008);
    float ember = exp(-dot(delta, delta)) * smoothstep(0.0, 0.10, life)
      * (1.0 - smoothstep(0.50, 0.97, life)) * 0.80;
    premultiplied += novaTemperatureColor(0.60 + random * 0.30) * ember * (1.0 - alpha);
    alpha += ember * (1.0 - alpha);
  }
  float intro = smoothstep(0.0, 0.72, u_intro);
  return vec4(premultiplied / max(alpha, 0.00001), sat(alpha) * intro);
}

vec4 blendNovaFire(vec4 material, vec2 uv) {
  float amount = smoothstep(0.0, 1.0, sat(u_metabloomNovaMix));
  if (amount <= 0.001) return material;
  vec4 fire = sceneNovaFire(uv, u_novaTime);
  float alpha = mix(material.a, fire.a, amount);
  vec3 premultiplied = mix(material.rgb * material.a, fire.rgb * fire.a, amount);
  return vec4(premultiplied / max(alpha, 0.00001), alpha);
}
`;
