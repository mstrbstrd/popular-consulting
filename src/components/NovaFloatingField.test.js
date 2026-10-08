import { CREATOROS_FIELD_FRAGMENT_SHADER, CREATOROS_FIELD_PAINT_FRAGMENT_SHADER } from './CreatorOSFieldShader';
import { METABLOOM_NOVA_SHADER } from './MetabloomNovaShader';

const scene = CREATOROS_FIELD_FRAGMENT_SHADER.split('vec4 sceneMetabloom(vec2 uv, float time) {')[1]
  .split('vec4 sceneTidalWeave')[0];

describe('Nova native floating field', () => {
  test('uses the same seven centres, radii, pose and drift clock as the other finishes', () => {
    expect(scene.match(/for \(int index = 0; index < 7; index\+\+\)/g)).toHaveLength(1);
    expect(scene).toContain('time * (0.16 + layer * 0.009)');
    expect(scene).toContain('p = viscousWarp(p, time, 0.08)');
    expect(scene).toContain('radius *= avatarRadiusScale');
    expect(scene).toContain('vec2 fireDelta = delta - novaFlow.xy');
    expect(scene).toContain('novaSurfaceEmber(delta, radius, layer, novaUp) * bloom');
    expect(scene).not.toContain('sceneNovaFire');
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/aboveFuel|flameHeight|fluidPotential|poseScale/);
  });

  test('retains the native core and confines moving fire to its exterior', () => {
    expect(scene).toContain('novaFireMaterial(spectralMaterial, vec3(potential, membrane, edge)');
    expect(METABLOOM_NOVA_SHADER).toContain('float alpha = nativeMaterial.a');
    expect(METABLOOM_NOVA_SHADER).toContain('tongues * outside');
    expect(METABLOOM_NOVA_SHADER).toContain('0.085 + flare * 0.025');
    expect(METABLOOM_NOVA_SHADER).toContain('max(alpha, 0.00001)');
    expect(METABLOOM_NOVA_SHADER).not.toContain('time * flare');
  });

  test('preserves the independent paint shader and existing Bayer output', () => {
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).not.toContain('novaEdgeFlow');
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).not.toContain('u_metabloomNovaMix');
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain('fragColor = vec4(color * alpha, alpha)');
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain('#define bayer8');
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
  });
});
