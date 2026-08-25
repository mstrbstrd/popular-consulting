import { getVisualRuntimeReport } from './visualRuntimePolicy';
import {
  VISUAL_CAPTURE_MODE,
  visualCaptureState,
} from './visualCapturePolicy';
import { isBlackHoleRenderer } from './visualCaptureUniforms';
import { createCaptureClock } from './visualCaptureClock';
import { createContextInstrumentation } from './visualCaptureInstrumentation';
import {
  createSeededRandom,
  expectedRendererForCapture,
  popPhaseToElapsedMs,
} from './visualCaptureHarnessUtils';

export {
  createSeededRandom,
  expectedRendererForCapture,
  popPhaseToElapsedMs,
  summarizeSamples,
} from './visualCaptureHarnessUtils';

const REPORT_ELEMENT_ID = 'visual-capture-report';

const waitFor = ({
  predicate,
  timeoutMs,
  intervalMs,
  setTimeoutFn,
}) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      let result = false;
      try {
        result = predicate();
      } catch {
        result = false;
      }

      if (result) {
        resolve(result);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('visual-capture-target-timeout'));
        return;
      }

      setTimeoutFn(check, intervalMs);
    };

    check();
  });

const navigateToCaptureSection = async ({
  state,
  windowObject,
  documentObject,
  setTimeoutFn,
}) => {
  const pathname =
    String(windowObject.location?.pathname || '/').replace(/\/+$/, '') ||
    '/';
  if (!['/', '/engineering'].includes(pathname)) return;

  const dots = await waitFor({
    predicate: () => {
      const found = documentObject.querySelectorAll('.section-dot');
      return found.length > state.section ? found : false;
    },
    timeoutMs: state.readyTimeoutMs,
    intervalMs: 20,
    setTimeoutFn,
  });
  const target = dots[state.section];
  if (!target || target.classList.contains('active')) return;

  await new Promise((resolve) => {
    let settled = false;
    let timeout = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      windowObject.removeEventListener(
        'sectionChangeEnd',
        handleEnd,
      );
      if (timeout) windowObject.clearTimeout(timeout);
      resolve();
    };

    const handleEnd = (event) => {
      if (Number(event.detail?.index) === state.section) finish();
    };

    windowObject.addEventListener('sectionChangeEnd', handleEnd);
    timeout = windowObject.setTimeout(finish, 3000);
    target.click();
  });
};

const writeReportElement = (documentObject, report) => {
  let element = documentObject.getElementById(REPORT_ELEMENT_ID);
  if (!element) {
    element = documentObject.createElement('script');
    element.id = REPORT_ELEMENT_ID;
    element.type = 'application/json';
    documentObject.body?.appendChild(element);
  }
  element.textContent = JSON.stringify(report).replace(
    /</g,
    '\\u003c',
  );
};

export const initVisualCaptureHarness = ({
  state = visualCaptureState,
  windowObject =
    typeof window === 'undefined' ? null : window,
  documentObject =
    typeof document === 'undefined' ? null : document,
} = {}) => {
  if (!state?.active || !windowObject || !documentObject) {
    return () => {};
  }

  const root = documentObject.documentElement;
  const clock = createCaptureClock(windowObject);
  const instrumentation = createContextInstrumentation({
    state,
    windowObject,
  });
  const cleanupInstrumentation = instrumentation.install();
  const originalRandom = windowObject.Math.random;
  const random = createSeededRandom(state.seed);
  windowObject.Math.random = random;

  let previousTheme = null;
  let hadPreviousTheme = false;
  let themeRestored = false;
  let status = 'initializing';
  let error = null;
  let capturedAtEpochMs = null;

  try {
    previousTheme = windowObject.localStorage.getItem('popcon-theme');
    hadPreviousTheme = previousTheme !== null;
    windowObject.localStorage.setItem('popcon-theme', state.theme);
  } catch {
    previousTheme = null;
    hadPreviousTheme = false;
  }

  const restoreThemePreference = () => {
    if (themeRestored) return;
    themeRestored = true;
    try {
      if (hadPreviousTheme) {
        windowObject.localStorage.setItem(
          'popcon-theme',
          previousTheme,
        );
      } else {
        windowObject.localStorage.removeItem('popcon-theme');
      }
    } catch {
      // Storage is optional and the mounted ThemeProvider owns its state.
    }
  };

  try {
    const pathname =
      String(windowObject.location.pathname || '/').replace(/\/+$/, '') ||
      '/';
    if (['/', '/engineering'].includes(pathname)) {
      windowObject.history.replaceState(
        windowObject.history.state,
        '',
        `${windowObject.location.pathname}${windowObject.location.search}#section-${state.section}`,
      );
    }
  } catch {
    // The section-dot bridge below remains authoritative.
  }

  root.setAttribute('data-visual-capture', VISUAL_CAPTURE_MODE);
  root.setAttribute('data-visual-capture-id', state.captureId);
  root.setAttribute('data-visual-capture-ready', 'false');
  windowObject.__visualCaptureState = state;

  const buildReport = () => ({
    schemaVersion: state.schemaVersion,
    status,
    error,
    state,
    expectedRenderer: expectedRendererForCapture(
      state,
      windowObject.location.pathname,
    ),
    clock: clock.snapshot(),
    runtime: getVisualRuntimeReport(),
    renderers: instrumentation.report(),
    capturedAtEpochMs,
  });

  const publishReport = () => {
    const report = buildReport();
    writeReportElement(documentObject, report);
    return report;
  };

  windowObject.__visualCaptureReport = publishReport;
  windowObject.__visualCaptureController = {
    state,
    report: publishReport,
    step: clock.step,
    settle: clock.stepFrames,
  };

  const run = async () => {
    try {
      await navigateToCaptureSection({
        state,
        windowObject,
        documentObject,
        setTimeoutFn: clock.nativeSetTimeout,
      });

      const expectedRenderer = expectedRendererForCapture(
        state,
        windowObject.location.pathname,
      );

      await waitFor({
        predicate: () =>
          instrumentation
            .report()
            .some(
              (renderer) =>
                renderer.rendererId === expectedRenderer &&
                renderer.drawCalls > 0,
            ),
        timeoutMs: state.readyTimeoutMs,
        intervalMs: 20,
        setTimeoutFn: clock.nativeSetTimeout,
      });

      clock.takeControl();

      if (
        state.orb.expressionBlend > 0 &&
        typeof windowObject.__orbExpress === 'function'
      ) {
        windowObject.__orbExpress(state.orb.expression, null);
      }
      if (
        state.orb.cdBlend > 0 &&
        typeof windowObject.__ditherSetCD === 'function'
      ) {
        windowObject.__ditherSetCD(state.orb.cdSpin);
      }

      await clock.stepFrames(
        state.settleFrames,
        state.frameStepMs,
      );

      if (
        state.orb.popPhase >= 0 &&
        typeof windowObject.__orbPop === 'function'
      ) {
        windowObject.__orbPop();
        await clock.advanceBy(
          popPhaseToElapsedMs(state.orb.popPhase),
          Math.min(state.frameStepMs, 1000 / 60),
        );
      }

      await clock.stepFrames(2, state.frameStepMs);

      if (isBlackHoleRenderer(expectedRenderer)) {
        await waitFor({
          predicate: () =>
            instrumentation
              .report()
              .some(
                (renderer) =>
                  renderer.rendererId === expectedRenderer &&
                  renderer.completedFrames > 0,
              ),
          timeoutMs: state.readyTimeoutMs,
          intervalMs: 20,
          setTimeoutFn: async (callback, delay) => {
            await clock.stepFrames(1, state.frameStepMs);
            return clock.nativeSetTimeout(callback, delay);
          },
        });
      }

      status = 'ready';
      capturedAtEpochMs = clock.nativeDateNow();
      root.setAttribute('data-visual-capture-ready', 'true');
      root.removeAttribute('data-visual-capture-error');
      windowObject.__visualCaptureReady = true;
      restoreThemePreference();
      publishReport();
    } catch (captureError) {
      status = 'error';
      error =
        captureError instanceof Error
          ? captureError.message
          : String(captureError || 'visual-capture-failed');
      root.setAttribute('data-visual-capture-ready', 'false');
      root.setAttribute('data-visual-capture-error', error);
      windowObject.__visualCaptureReady = false;
      restoreThemePreference();
      publishReport();
    }
  };

  clock.nativeSetTimeout(run, 0);

  return () => {
    restoreThemePreference();
    cleanupInstrumentation();
    clock.restore();
    windowObject.Math.random = originalRandom;
    root.removeAttribute('data-visual-capture');
    root.removeAttribute('data-visual-capture-id');
    root.removeAttribute('data-visual-capture-ready');
    root.removeAttribute('data-visual-capture-error');

    if (windowObject.__visualCaptureState === state) {
      delete windowObject.__visualCaptureState;
    }
    delete windowObject.__visualCaptureReady;
    delete windowObject.__visualCaptureReport;
    delete windowObject.__visualCaptureController;
    documentObject.getElementById(REPORT_ELEMENT_ID)?.remove();
  };
};
