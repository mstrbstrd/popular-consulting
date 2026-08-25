import {
  initVisualRuntimePolicy,
  readVisualRuntimeRequest,
  resolveVisualRuntimePolicy,
  VISUAL_RUNTIME_MODES,
} from './visualRuntimePolicy';

describe('visual runtime policy', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(
      'data-visual-runtime-requested',
    );
    document.documentElement.removeAttribute('data-visual-runtime');
    document.documentElement.removeAttribute(
      'data-visual-runtime-fallback',
    );
    document.documentElement.removeAttribute(
      'data-live-background-renderer',
    );
    delete window.__visualRuntimeReport;
    jest.restoreAllMocks();
  });

  test('defaults unknown and missing requests to auto', () => {
    expect(readVisualRuntimeRequest('')).toBe(
      VISUAL_RUNTIME_MODES.AUTO,
    );
    expect(
      readVisualRuntimeRequest('?visual-runtime=unknown'),
    ).toBe(VISUAL_RUNTIME_MODES.AUTO);
  });

  test('keeps the reference renderer explicitly selectable', () => {
    expect(
      resolveVisualRuntimePolicy({
        search: '?visual-runtime=reference',
        optimizedAvailable: true,
      }),
    ).toEqual({
      requested: VISUAL_RUNTIME_MODES.REFERENCE,
      resolved: VISUAL_RUNTIME_MODES.REFERENCE,
      optimizedAvailable: true,
      fallbackReason: null,
    });
  });

  test('fails closed to the reference renderer before optimized is available', () => {
    expect(
      resolveVisualRuntimePolicy({
        search: '?visual-runtime=optimized',
        optimizedAvailable: false,
      }),
    ).toEqual({
      requested: VISUAL_RUNTIME_MODES.OPTIMIZED,
      resolved: VISUAL_RUNTIME_MODES.REFERENCE,
      optimizedAvailable: false,
      fallbackReason: 'optimized-runtime-unavailable',
    });
  });

  test('allows auto and explicit optimized selection only when available', () => {
    expect(
      resolveVisualRuntimePolicy({
        search: '',
        optimizedAvailable: true,
      }).resolved,
    ).toBe(VISUAL_RUNTIME_MODES.OPTIMIZED);
    expect(
      resolveVisualRuntimePolicy({
        search: '?visual-runtime=optimized',
        optimizedAvailable: true,
      }).resolved,
    ).toBe(VISUAL_RUNTIME_MODES.OPTIMIZED);
  });

  test('installs a diagnostic report without changing renderer ownership', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    canvas.dataset.rendererId = 'reference-probe';
    document.body.appendChild(canvas);
    document.documentElement.setAttribute(
      'data-live-background-renderer',
      'reference-probe',
    );

    jest.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
    jest.spyOn(console, 'table').mockImplementation(() => {});

    const cleanup = initVisualRuntimePolicy();
    const report = window.__visualRuntimeReport();

    expect(document.documentElement).toHaveAttribute(
      'data-visual-runtime',
      VISUAL_RUNTIME_MODES.REFERENCE,
    );
    expect(report).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        requested: VISUAL_RUNTIME_MODES.AUTO,
        resolved: VISUAL_RUNTIME_MODES.REFERENCE,
        liveBackgroundRenderers: ['reference-probe'],
      }),
    );
    expect(report.canvases).toEqual([
      expect.objectContaining({
        rendererId: 'reference-probe',
        width: 640,
        height: 360,
      }),
    ]);

    cleanup();
    expect(window.__visualRuntimeReport).toBeUndefined();
  });
});
