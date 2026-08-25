import {
  BLACK_HOLE_CAPTURE_ZOOMS,
  readVisualCaptureRequest,
  resolveVisualCaptureState,
} from './visualCapturePolicy';
import { VISUAL_RUNTIME_MODES } from './visualRuntimePolicy';

const referenceRuntime = Object.freeze({
  requested: VISUAL_RUNTIME_MODES.REFERENCE,
  resolved: VISUAL_RUNTIME_MODES.REFERENCE,
  optimizedAvailable: false,
  fallbackReason: null,
});

describe('visual capture policy', () => {
  test('requires an explicit reference capture request', () => {
    expect(readVisualCaptureRequest('')).toBeNull();
    expect(
      resolveVisualCaptureState({
        search: '',
        runtimePolicy: referenceRuntime,
      }).active,
    ).toBe(false);
    expect(
      resolveVisualCaptureState({
        search: '?visual-capture=reference',
        runtimePolicy: referenceRuntime,
      }).active,
    ).toBe(true);
  });

  test('parses and bounds the deterministic capture contract', () => {
    const state = resolveVisualCaptureState({
      search:
        '?visual-capture=reference' +
        '&capture-id=Dark%20Services' +
        '&capture-theme=dark' +
        '&capture-section=2' +
        '&capture-time=12.5' +
        '&capture-pointer=1.4,-0.2' +
        '&capture-reveal=0.45' +
        '&capture-ripple-age=0.8' +
        '&capture-expression=happy' +
        '&capture-expression-blend=1' +
        '&capture-pop-phase=0.55' +
        '&capture-reanimation=2' +
        '&capture-cd-blend=0.75' +
        '&capture-cd-spin=true' +
        '&capture-cd-angle=1.25' +
        '&capture-seed=42' +
        '&capture-settle-frames=80' +
        '&capture-frame-step=45',
      runtimePolicy: referenceRuntime,
    });

    expect(state).toEqual(
      expect.objectContaining({
        active: true,
        captureId: 'dark-services',
        theme: 'dark',
        section: 2,
        timeSeconds: 12.5,
        pointer: { x: 1, y: 0 },
        reveal: 0.45,
        rippleAgeSeconds: 0.8,
        blackHoleZoom: BLACK_HOLE_CAPTURE_ZOOMS[2],
        seed: 42,
        settleFrames: 80,
        frameStepMs: 45,
      }),
    );
    expect(state.orb).toEqual({
      expression: 'happy',
      expressionBlend: 1,
      popPhase: 0.55,
      reanimation: 2,
      cdBlend: 0.75,
      cdSpin: true,
      cdSpinAngle: 1.25,
    });
  });

  test('fails closed when the resolved runtime is not the oracle', () => {
    const state = resolveVisualCaptureState({
      search: '?visual-capture=reference',
      runtimePolicy: {
        requested: VISUAL_RUNTIME_MODES.OPTIMIZED,
        resolved: VISUAL_RUNTIME_MODES.OPTIMIZED,
        optimizedAvailable: true,
        fallbackReason: null,
      },
    });

    expect(state.active).toBe(false);
    expect(state.disabledReason).toBe(
      'reference-runtime-required',
    );
  });

  test('uses the section choreography zoom unless explicitly overridden', () => {
    expect(
      resolveVisualCaptureState({
        search:
          '?visual-capture=reference&capture-section=3',
        runtimePolicy: referenceRuntime,
      }).blackHoleZoom,
    ).toBe(62);

    expect(
      resolveVisualCaptureState({
        search:
          '?visual-capture=reference' +
          '&capture-section=3' +
          '&capture-black-hole-zoom=37',
        runtimePolicy: referenceRuntime,
      }).blackHoleZoom,
    ).toBe(37);
  });
});
