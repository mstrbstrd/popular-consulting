import { METABLOOM_NOVA_SHADER } from './MetabloomNovaShader';

const prism = METABLOOM_NOVA_SHADER.split('vec4 novaPrismaticEdges')[1].split('vec4 novaMetalFinish')[0];
const metal = METABLOOM_NOVA_SHADER.split('vec4 novaMetalFinish')[1].split('vec4 blendNovaFire')[0];
const fire = METABLOOM_NOVA_SHADER.split('vec4 novaFireMaterial')[1].split('vec4 novaPrismaticEdges')[0];
const smooth = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

describe('Soft Nova and MetalNova spectrum', () => {
  test('halves the previous crest extent and colour strength for both finishes', () => {
    const [, low, high] = prism.match(/rainbowCrest = smoothstep\(([\d.]+), ([\d.]+),/);
    expect(Number(low)).toBeCloseTo(1 - (1 - 0.34) / 2);
    expect(Number(high)).toBeCloseTo(1 - (1 - 0.58) / 2);
    expect(prism).toContain('mix(0.46, 0.45, u_light)');
    expect(0.46).toBe(0.92 / 2);
    expect(0.45).toBe(0.90 / 2);
    expect(prism).not.toContain('u_metabloomPaletteMix');
    expect(smooth(Number(low), Number(high), 0.62)).toBe(0);
    expect(smooth(Number(low), Number(high), 0.85)).toBe(1);
  });

  test('keeps rainbow out of the body and shoulders without losing the wisps', () => {
    expect(prism).toContain('1.0 - smoothstep(0.72, 1.20, flameSurface.w)');
    expect(prism).toContain('smoothstep(0.67, 0.82, flameSurface.x)');
    expect(prism).toContain('max(outline, wisps)');
    expect(prism).not.toMatch(/abs\(fire\.a|fire\.a\s*[-+*/]?=/);
    expect(METABLOOM_NOVA_SHADER).toContain('NOVA_VERTICAL_OFFSET = 0.10;');
    expect(METABLOOM_NOVA_SHADER).toContain('NOVA_FIRE_BALANCE = 0.5;');
  });

  test('softens only the material seam where both body and flame are present', () => {
    expect(fire).toContain('smoothstep(0.0, 0.20, flame)');
    expect(fire).toContain('smoothstep(0.0, 0.30, nativeMaterial.a)');
    expect(fire).toContain('color = mix(color, seamColor, seam)');
    expect(fire).toContain('fireColor = mix(fireColor, seamColor, seam)');
    expect(metal).toContain('smoothstep(0.0, 0.30, nativeAlpha)');
    expect(metal).toContain('bodyColor = mix(bodyColor, seamColor, seam)');
    expect(metal).toContain('silverFlame = mix(silverFlame, seamColor, seam)');
    expect(metal).not.toContain('mercuryShadow');
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
  });

  test('seam weighting cannot introduce black or affect isolated layers or tips', () => {
    const seam = (flame, body, progress) => smooth(0, 0.20, flame)
      * smooth(0, 0.30, body) * (1 - smooth(0.15, 0.50, progress));
    expect(seam(0, 1, 0)).toBe(0);
    expect(seam(1, 0, 0)).toBe(0);
    expect(seam(1, 1, 0.50)).toBe(0);
    const amount = seam(0.3, 0.8, 0.2);
    for (const [body, flame] of [[0.48, 1.52], [0.85, 0.6], [0.07, 0.4]]) {
      const middle = (body + flame) / 2;
      const softBody = body + (middle - body) * amount;
      const softFlame = flame + (middle - flame) * amount;
      expect(Math.abs(softBody - softFlame)).toBeLessThan(Math.abs(body - flame));
      expect(Math.min(softBody, softFlame)).toBeGreaterThanOrEqual(Math.min(body, flame));
    }
  });
});
