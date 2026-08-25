import fs from 'fs';
import path from 'path';
import {
  createSeededRandom,
  expectedRendererForCapture,
  initVisualCaptureHarness,
  popPhaseToElapsedMs,
  summarizeSamples,
} from './visualCaptureHarness';

describe('visual capture harness', () => {
  test('uses a reproducible seeded random stream', () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);
    const third = createSeededRandom(43);

    const firstValues = Array.from({ length: 6 }, () => first());
    const secondValues = Array.from({ length: 6 }, () => second());
    const thirdValues = Array.from({ length: 6 }, () => third());

    expect(firstValues).toEqual(secondValues);
    expect(firstValues).not.toEqual(thirdValues);
  });

  test('summarizes bounded timing samples for baseline reports', () => {
    expect(summarizeSamples([])).toEqual({
      count: 0,
      min: null,
      median: null,
      p95: null,
      max: null,
      mean: null,
    });

    expect(summarizeSamples([5, 1, 3, 2, 4])).toEqual({
      count: 5,
      min: 1,
      median: 3,
      p95: 5,
      max: 5,
      mean: 3,
    });
  });

  test('maps routes and themes to the renderer that must be captured', () => {
    expect(
      expectedRendererForCapture({ theme: 'light' }, '/'),
    ).toBe('dither-background');
    expect(
      expectedRendererForCapture({ theme: 'dark' }, '/engineering'),
    ).toBe('black-hole-background');
    expect(
      expectedRendererForCapture({ theme: 'dark' }, '/orb'),
    ).toBe('orb-dither');
  });

  test('maps authored Orb phases to deterministic wall-clock offsets', () => {
    expect(popPhaseToElapsedMs(-1)).toBe(0);
    expect(popPhaseToElapsedMs(0.5)).toBe(190);
    expect(popPhaseToElapsedMs(1)).toBe(380);
    expect(popPhaseToElapsedMs(1.6)).toBeCloseTo(1940);
    expect(popPhaseToElapsedMs(3)).toBeCloseTo(4740);
  });

  test('is a complete no-op outside explicit capture mode', () => {
    const originalRaf = window.requestAnimationFrame;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const cleanup = initVisualCaptureHarness({
      state: { active: false },
      windowObject: window,
      documentObject: document,
    });

    expect(window.requestAnimationFrame).toBe(originalRaf);
    expect(HTMLCanvasElement.prototype.getContext).toBe(
      originalGetContext,
    );

    cleanup();
  });

  test('instruments the reference renderer externally instead of importing it', () => {
    const harnessSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/utils/visualCaptureHarness.js',
      ),
      'utf8',
    );
    const instrumentationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/utils/visualCaptureInstrumentation.js',
      ),
      'utf8',
    );
    const indexSource = fs.readFileSync(
      path.join(process.cwd(), 'src/index.js'),
      'utf8',
    );

    expect(instrumentationSource).toContain('getUniformLocation');
    expect(instrumentationSource).toContain(
      'resolveVisualCaptureUniform',
    );
    expect(harnessSource).not.toContain(
      "from '../components/DitherBackground'",
    );
    expect(harnessSource).not.toContain(
      "from '../components/blackHoleShader'",
    );
    expect(indexSource.indexOf('initGraphicsContextGovernor();')).toBeLessThan(
      indexSource.indexOf('initVisualCaptureHarness();'),
    );
    expect(indexSource.indexOf('initVisualCaptureHarness();')).toBeLessThan(
      indexSource.indexOf('ReactDOM.createRoot'),
    );
  });
});
