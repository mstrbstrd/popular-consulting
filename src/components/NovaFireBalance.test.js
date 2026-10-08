import { METABLOOM_NOVA_SHADER } from './MetabloomNovaShader';
import { CREATOROS_FIELD_FRAGMENT_SHADER } from './CreatorOSFieldShader';

const balance = Number(METABLOOM_NOVA_SHADER.match(/const float NOVA_FIRE_BALANCE = ([\d.]+);/)[1]);

describe('Nova balanced fire', () => {
  test('keeps the material blend at its authored halfway point', () => {
    expect(balance).toBe(0.5);
    expect(METABLOOM_NOVA_SHADER).toContain('mix(liquidHeat, flameHeat, NOVA_FIRE_BALANCE)');
    expect(METABLOOM_NOVA_SHADER).toContain('u_novaTime * flowSpeed');
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/u_novaTime\s*\*\s*(flare|u_energy)/);
  });

  test('cannot reintroduce a low fuel anchor or deform the shared floating body', () => {
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/aboveFuel|flameHeight|poseScale|sceneNovaFire/);
    expect(METABLOOM_NOVA_SHADER).toContain('float alpha = nativeMaterial.a');
    expect(METABLOOM_NOVA_SHADER).toContain('tongues * outside * flameOpacity');
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain('vec2 fireDelta = delta - novaFlow.xy');
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
  });
});
