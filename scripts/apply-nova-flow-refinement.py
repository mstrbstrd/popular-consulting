# Temporary integration helper. Do not include in the final main tree.
from pathlib import Path

p = Path('src/components/MetabloomNovaShader.js')
s = p.read_text()

def replace(old, new):
    global s
    assert s.count(old) == 1, (old, s.count(old))
    s = s.replace(old, new)

replace('const float NOVA_VERTICAL_OFFSET = 0.10;', '''const float NOVA_VERTICAL_OFFSET = 0.10;
// A gentle flow refinement shared by Nova and MetalNova. Coarser eddies give
// fewer, wider flares without increasing the maximum lift or moving the body.
const float NOVA_FLOW_RATE = 0.85;
const float NOVA_FINE_FLOW_MIX = 0.85;
const vec2 NOVA_FLARE_DENSITY = vec2(0.72, 0.85);

// Shift 15% of the fine turbulence into the broadest octave. Preserve the
// original four noise samples and total weight (0.9375), so smoothing neither
// adds GPU work nor drains the fire's contrast. Other studies keep their fbm.
float novaFlowNoise(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 4; index++) {
    float weight = index == 0
      ? amplitude + 0.4375 * (1.0 - NOVA_FINE_FLOW_MIX)
      : amplitude * NOVA_FINE_FLOW_MIX;
    value += weight * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
    amplitude *= 0.5;
  }
  return value;
}''')
replace('  vec2 flowScale = mix(vec2(8.0, 6.0), vec2(6.2, 6.8), NOVA_FIRE_BALANCE);', '''  vec2 flowScale = mix(vec2(8.0, 6.0), vec2(6.2, 6.8), NOVA_FIRE_BALANCE)
    * NOVA_FLARE_DENSITY;''')
replace('  float flowSpeed = mix(1.1, 1.9, NOVA_FIRE_BALANCE);', '  float flowSpeed = mix(1.1, 1.9, NOVA_FIRE_BALANCE) * NOVA_FLOW_RATE;')
replace('  float eddy = fbm(travel);', '  float eddy = novaFlowNoise(travel);')
replace('  float curl = fbm(travel * vec2(1.18, 0.86) + vec2(8.3, -u_novaTime * 0.06));', '''  float curl = novaFlowNoise(travel * vec2(1.18, 0.86)
    + vec2(8.3, -u_novaTime * 0.06 * NOVA_FLOW_RATE));''')
p.write_text(s)
