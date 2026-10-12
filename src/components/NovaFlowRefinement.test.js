import { METABLOOM_NOVA_SHADER } from './MetabloomNovaShader';
import { CREATOROS_FIELD_FRAGMENT_SHADER } from './CreatorOSFieldShader';

const constant = name => Number(METABLOOM_NOVA_SHADER.match(new RegExp(`const float ${name} = ([\\d.]+);`))[1]);

describe('Nova and MetalNova gentle flame flow', () => {
  test('reduces fine turbulence and its evolution rate by 15 percent', () => {
    expect(constant('NOVA_FLOW_RATE')).toBe(0.85);
    expect(constant('NOVA_FINE_FLOW_MIX')).toBe(0.85);
    expect(METABLOOM_NOVA_SHADER).toContain('mix(1.1, 1.9, NOVA_FIRE_BALANCE) * NOVA_FLOW_RATE');
    expect(METABLOOM_NOVA_SHADER).toContain('-u_novaTime * 0.06 * NOVA_FLOW_RATE');
  });

  test('widens flare spacing without lifting or relocating the native body', () => {
    expect(METABLOOM_NOVA_SHADER).toContain('const vec2 NOVA_FLARE_DENSITY = vec2(0.72, 0.85);');
    expect(METABLOOM_NOVA_SHADER).toContain('* NOVA_FLARE_DENSITY;');
    expect(constant('NOVA_VERTICAL_OFFSET')).toBe(0.10);
    expect(constant('NOVA_FIRE_BALANCE')).toBe(0.5);
    expect(METABLOOM_NOVA_SHADER).toContain('0.215 + flare * 0.075, NOVA_FIRE_BALANCE');
    expect(METABLOOM_NOVA_SHADER).toContain('float alpha = nativeMaterial.a;');
  });

  test('preserves the noise amplitude budget without extra samples or clocks', () => {
    const noise = METABLOOM_NOVA_SHADER.split('float novaFlowNoise(vec2 p) {')[1].split('// Backtrace')[0];
    expect(noise).toContain('index < 4');
    expect(noise.match(/noise\(p\)/g)).toHaveLength(1);
    const fine = constant('NOVA_FINE_FLOW_MIX');
    const weights = [0.5 + 0.4375 * (1 - fine), 0.25 * fine, 0.125 * fine, 0.0625 * fine];
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(0.9375, 12);
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain('novaFlow = novaEdgeFlow(p, novaUp);');
  });

  test('retains soft material junctions and the shared half-strength rainbow', () => {
    expect(METABLOOM_NOVA_SHADER).toContain('color = mix(color, seamColor, seam);');
    expect(METABLOOM_NOVA_SHADER).toContain('silverFlame = mix(silverFlame, seamColor, seam);');
    expect(METABLOOM_NOVA_SHADER).toContain('smoothstep(0.67, 0.79, flameSurface.x)');
    expect(METABLOOM_NOVA_SHADER).toContain('prismMask * mix(0.46, 0.45, u_light)');
  });
});
