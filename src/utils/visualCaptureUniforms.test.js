import {
  resolveVisualCaptureUniform,
  talkingMouthOpen,
} from './visualCaptureUniforms';
import { resolveVisualCaptureState } from './visualCapturePolicy';
import { VISUAL_RUNTIME_MODES } from './visualRuntimePolicy';

const referenceRuntime = Object.freeze({
  requested: VISUAL_RUNTIME_MODES.REFERENCE,
  resolved: VISUAL_RUNTIME_MODES.REFERENCE,
  optimizedAvailable: false,
  fallbackReason: null,
});

const captureState = (search) =>
  resolveVisualCaptureState({
    search: `?visual-capture=reference&${search}`,
    runtimePolicy: referenceRuntime,
  });

describe('visual capture uniform overrides', () => {
  test('pins the light field to the authored section preset', () => {
    const state = captureState(
      'capture-section=2&capture-time=12&capture-reveal=0.5',
    );
    const resolve = (uniformName) =>
      resolveVisualCaptureUniform({
        state,
        rendererId: 'dither-background',
        uniformName,
      });

    expect(resolve('u_shapeA')).toEqual([4]);
    expect(resolve('u_shapeB')).toEqual([4]);
    expect(resolve('u_shapeMix')).toEqual([0]);
    expect(resolve('u_contrast')).toEqual([2.5]);
    expect(resolve('u_warp')).toEqual([0.42]);
    expect(resolve('u_rainbowSpeed')).toEqual([0.75]);
    expect(resolve('u_time')).toEqual([12]);
    expect(resolve('u_reveal')).toEqual([0.5]);
  });

  test('pins Orb expression, pop, reanimation, CD, and ripple inputs', () => {
    const state = captureState(
      'capture-section=4' +
        '&capture-time=9' +
        '&capture-pointer=0.7,0.4' +
        '&capture-ripple-age=0.75' +
        '&capture-expression=angry' +
        '&capture-expression-blend=1' +
        '&capture-pop-phase=2.1' +
        '&capture-reanimation=2' +
        '&capture-cd-blend=0.6' +
        '&capture-cd-spin=true' +
        '&capture-cd-angle=1.2',
    );
    const resolve = (uniformName) =>
      resolveVisualCaptureUniform({
        state,
        rendererId: 'orb-dither',
        uniformName,
      });

    expect(resolve('u_expressionId')).toEqual([7]);
    expect(resolve('u_expressionBlend')).toEqual([1]);
    expect(resolve('u_popPhase')).toEqual([2.1]);
    expect(resolve('u_reanimIdx')).toEqual([2]);
    expect(resolve('u_cdBlend')).toEqual([0.6]);
    expect(resolve('u_cdSpinSpeed')).toEqual([4]);
    expect(resolve('u_cdSpinAngle')).toEqual([1.2]);
    expect(resolve('u_rippleCount')).toEqual([1]);
    expect(resolve('u_ripples[0]')).toEqual([0.7, 0.4, 8.25]);
  });

  test('pins black-hole time, pointer, zoom, and theme inversion', () => {
    const state = captureState(
      'capture-theme=dark' +
        '&capture-time=16' +
        '&capture-pointer=0.25,0.8' +
        '&capture-black-hole-zoom=31',
    );
    const resolve = (uniformName) =>
      resolveVisualCaptureUniform({
        state,
        rendererId: 'black-hole-background',
        uniformName,
      });

    expect(resolve('u_time')).toEqual([16]);
    expect(resolve('u_mouse')).toEqual([0.25, 0.8]);
    expect(resolve('u_zoom')).toEqual([31]);
    expect(resolve('u_lightMode')).toEqual([0]);
  });

  test('does not touch unrelated renderers or uniforms', () => {
    const state = captureState('capture-time=5');

    expect(
      resolveVisualCaptureUniform({
        state,
        rendererId: 'spectral-bloom',
        uniformName: 'u_time',
      }),
    ).toBeNull();
    expect(
      resolveVisualCaptureUniform({
        state,
        rendererId: 'dither-background',
        uniformName: 'u_unknown',
      }),
    ).toBeNull();
  });

  test('keeps the talking mouth deterministic at a fixed shader time', () => {
    expect(talkingMouthOpen(7.5)).toBe(
      talkingMouthOpen(7.5),
    );
    expect(talkingMouthOpen(7.5)).toBeGreaterThanOrEqual(0);
    expect(talkingMouthOpen(7.5)).toBeLessThanOrEqual(1);
  });
});
