export const VISUAL_RUNTIME_QUERY_PARAM = 'visual-runtime';

export const VISUAL_RUNTIME_MODES = Object.freeze({
  AUTO: 'auto',
  REFERENCE: 'reference',
  OPTIMIZED: 'optimized',
});

export const VISUAL_RUNTIME_SCHEMA_VERSION = 3;
export const OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false;
export const OPTIMIZED_VISUAL_RUNTIME_SHELL_AVAILABLE = true;
export const OPTIMIZED_VISUAL_RUNTIME_LIGHT_AVAILABLE = true;

const KNOWN_VISUAL_RUNTIME_MODES = new Set(
  Object.values(VISUAL_RUNTIME_MODES),
);

const normalizeSearch = (search) => {
  const value = String(search || '').trim();
  if (!value) return '';
  return value.startsWith('?') ? value : `?${value}`;
};

export const readVisualRuntimeRequest = (search = '') => {
  try {
    const requested = new URLSearchParams(normalizeSearch(search))
      .get(VISUAL_RUNTIME_QUERY_PARAM)
      ?.trim()
      .toLowerCase();

    return KNOWN_VISUAL_RUNTIME_MODES.has(requested)
      ? requested
      : VISUAL_RUNTIME_MODES.AUTO;
  } catch {
    return VISUAL_RUNTIME_MODES.AUTO;
  }
};

export const resolveVisualRuntimePolicy = ({
  search = '',
  optimizedAvailable = OPTIMIZED_VISUAL_RUNTIME_AVAILABLE,
} = {}) => {
  const requested = readVisualRuntimeRequest(search);

  if (requested === VISUAL_RUNTIME_MODES.REFERENCE) {
    return {
      requested,
      resolved: VISUAL_RUNTIME_MODES.REFERENCE,
      optimizedAvailable: Boolean(optimizedAvailable),
      fallbackReason: null,
    };
  }

  if (requested === VISUAL_RUNTIME_MODES.OPTIMIZED) {
    return optimizedAvailable
      ? {
          requested,
          resolved: VISUAL_RUNTIME_MODES.OPTIMIZED,
          optimizedAvailable: true,
          fallbackReason: null,
        }
      : {
          requested,
          resolved: VISUAL_RUNTIME_MODES.REFERENCE,
          optimizedAvailable: false,
          fallbackReason: 'optimized-runtime-unavailable',
        };
  }

  return {
    requested,
    resolved: optimizedAvailable
      ? VISUAL_RUNTIME_MODES.OPTIMIZED
      : VISUAL_RUNTIME_MODES.REFERENCE,
    optimizedAvailable: Boolean(optimizedAvailable),
    fallbackReason: null,
  };
};

const readInitialSearch = () =>
  typeof window === 'undefined' ? '' : window.location.search;

export const visualRuntimePolicy = Object.freeze(
  resolveVisualRuntimePolicy({
    search: readInitialSearch(),
  }),
);

const numberOrZero = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const readCanvasSnapshot = (canvas, index) => {
  const host = canvas.closest?.(
    '[data-renderer-id], [data-theme-renderer], [data-graphics-governor="true"]',
  );

  return {
    index,
    rendererId:
      canvas.dataset.rendererId ||
      host?.dataset.rendererId ||
      host?.dataset.themeRenderer ||
      null,
    rendererState:
      canvas.dataset.rendererState ||
      host?.dataset.rendererState ||
      null,
    runtimeShellState:
      canvas.dataset.visualRuntimeShellState ||
      host?.dataset.visualRuntimeShellState ||
      null,
    lightPipelineState:
      canvas.dataset.visualRuntimeLightPipeline ||
      host?.dataset.visualRuntimeLightPipeline ||
      null,
    contextRecovery:
      canvas.dataset.contextRecovery ||
      host?.dataset.contextRecovery ||
      null,
    renderProfile:
      canvas.dataset.renderProfile ||
      host?.dataset.renderProfile ||
      null,
    renderSchedule:
      canvas.dataset.renderSchedule ||
      host?.dataset.renderSchedule ||
      null,
    width: numberOrZero(canvas.width),
    height: numberOrZero(canvas.height),
    cssWidth: numberOrZero(canvas.getBoundingClientRect?.().width),
    cssHeight: numberOrZero(canvas.getBoundingClientRect?.().height),
  };
};

const readShellReport = () => {
  if (
    typeof window === 'undefined' ||
    typeof window.__visualRuntimeShellReport !== 'function'
  ) {
    return null;
  }

  try {
    return window.__visualRuntimeShellReport();
  } catch (error) {
    return {
      error: String(error?.message || error || 'shell report failed'),
    };
  }
};

export const getVisualRuntimeReport = () => {
  const root =
    typeof document === 'undefined' ? null : document.documentElement;
  const liveRenderers = root
    ?.getAttribute('data-live-background-renderer')
    ?.split(/\s+/)
    .filter(Boolean) || [];

  return {
    schemaVersion: VISUAL_RUNTIME_SCHEMA_VERSION,
    ...visualRuntimePolicy,
    optimizedShellAvailable:
      OPTIMIZED_VISUAL_RUNTIME_SHELL_AVAILABLE,
    optimizedLightAvailable:
      OPTIMIZED_VISUAL_RUNTIME_LIGHT_AVAILABLE,
    route:
      typeof window === 'undefined' ? null : window.location.pathname,
    theme: root?.getAttribute('data-theme') || null,
    liveBackgroundRenderers: liveRenderers,
    canvases:
      typeof document === 'undefined'
        ? []
        : Array.from(document.querySelectorAll('canvas')).map(
            readCanvasSnapshot,
          ),
    shell: readShellReport(),
    capturedAt: Date.now(),
  };
};

const logVisualRuntimeReport = (snapshot) => {
  if (typeof console === 'undefined') return;

  console.groupCollapsed?.(
    `[visual-runtime] ${snapshot.resolved} runtime`,
  );
  console.table?.([
    {
      Requested: snapshot.requested,
      Resolved: snapshot.resolved,
      'Optimized available': snapshot.optimizedAvailable,
      'Shell available': snapshot.optimizedShellAvailable,
      'Light pipeline available': snapshot.optimizedLightAvailable,
      Fallback: snapshot.fallbackReason || 'none',
      Theme: snapshot.theme || 'unset',
      Route: snapshot.route || 'unknown',
      Shell: snapshot.shell?.shell?.state || 'off',
      'Light pipeline':
        snapshot.shell?.lightPipeline?.id || 'off',
    },
  ]);

  if (snapshot.canvases.length > 0) {
    console.table?.(snapshot.canvases);
  }

  console.groupEnd?.();
};

export const initVisualRuntimePolicy = () => {
  const root =
    typeof document === 'undefined' ? null : document.documentElement;

  root?.setAttribute(
    'data-visual-runtime-requested',
    visualRuntimePolicy.requested,
  );
  root?.setAttribute(
    'data-visual-runtime',
    visualRuntimePolicy.resolved,
  );
  root?.setAttribute(
    'data-optimized-visual-runtime-shell',
    OPTIMIZED_VISUAL_RUNTIME_SHELL_AVAILABLE
      ? 'available'
      : 'unavailable',
  );
  root?.setAttribute(
    'data-optimized-visual-runtime-light',
    OPTIMIZED_VISUAL_RUNTIME_LIGHT_AVAILABLE
      ? 'available'
      : 'unavailable',
  );

  if (visualRuntimePolicy.fallbackReason) {
    root?.setAttribute(
      'data-visual-runtime-fallback',
      visualRuntimePolicy.fallbackReason,
    );
  } else {
    root?.removeAttribute('data-visual-runtime-fallback');
  }

  if (typeof window === 'undefined') return () => {};

  const previousReport = window.__visualRuntimeReport;
  const report = () => {
    const snapshot = getVisualRuntimeReport();
    logVisualRuntimeReport(snapshot);
    return snapshot;
  };

  window.__visualRuntimeReport = report;

  return () => {
    root?.removeAttribute('data-optimized-visual-runtime-shell');
    root?.removeAttribute('data-optimized-visual-runtime-light');
    if (window.__visualRuntimeReport === report) {
      if (previousReport === undefined) {
        delete window.__visualRuntimeReport;
      } else {
        window.__visualRuntimeReport = previousReport;
      }
    }
  };
};
