import {
  resolveVisualRuntimePolicy,
  VISUAL_RUNTIME_MODES,
  visualRuntimePolicy,
} from './visualRuntimePolicy';

export const VISUAL_CAPTURE_QUERY_PARAM = 'visual-capture';
export const VISUAL_CAPTURE_MODE = 'reference';
export const VISUAL_CAPTURE_SCHEMA_VERSION = 1;

export const DITHER_CAPTURE_PRESETS = Object.freeze([
  Object.freeze({
    speed: 0.7,
    contrast: 3.0,
    warp: 0.59,
    rainbowSpeed: 1.08,
    shape: 6,
  }),
  Object.freeze({
    speed: 0.32,
    contrast: 1.9,
    warp: 0.28,
    rainbowSpeed: 0.45,
    shape: 3,
  }),
  Object.freeze({
    speed: 0.48,
    contrast: 2.5,
    warp: 0.42,
    rainbowSpeed: 0.75,
    shape: 4,
  }),
  Object.freeze({
    speed: 0.22,
    contrast: 1.55,
    warp: 0.18,
    rainbowSpeed: 0.32,
    shape: 0,
  }),
  Object.freeze({
    speed: 0.55,
    contrast: 1.1,
    warp: 0,
    rainbowSpeed: 1.5,
    shape: 7,
  }),
  Object.freeze({
    speed: 0.32,
    contrast: 1.9,
    warp: 0.28,
    rainbowSpeed: 0.45,
    shape: 3,
  }),
]);

export const ORB_CAPTURE_EXPRESSIONS = Object.freeze({
  neutral: Object.freeze({
    id: 0,
    eyeOpen: 0.55,
    eyeY: 0.1,
    mouthCurve: 0,
    mouthOpen: 0,
  }),
  happy: Object.freeze({
    id: 1,
    eyeOpen: 0.68,
    eyeY: 0.14,
    mouthCurve: 0.75,
    mouthOpen: 0.08,
  }),
  excited: Object.freeze({
    id: 2,
    eyeOpen: 1,
    eyeY: 0.2,
    mouthCurve: 1,
    mouthOpen: 1,
  }),
  sad: Object.freeze({
    id: 3,
    eyeOpen: 0.55,
    eyeY: 0.05,
    mouthCurve: -0.9,
    mouthOpen: 0,
  }),
  surprised: Object.freeze({
    id: 4,
    eyeOpen: 1,
    eyeY: 0.22,
    mouthCurve: 0,
    mouthOpen: 1,
  }),
  thinking: Object.freeze({
    id: 5,
    eyeOpen: 0.4,
    eyeY: 0.1,
    mouthCurve: 0.2,
    mouthOpen: 0,
  }),
  sleepy: Object.freeze({
    id: 6,
    eyeOpen: 0.12,
    eyeY: 0.05,
    mouthCurve: 0.1,
    mouthOpen: 0,
  }),
  angry: Object.freeze({
    id: 7,
    eyeOpen: 0.55,
    eyeY: 0.05,
    mouthCurve: -0.75,
    mouthOpen: 0.2,
  }),
  talking: Object.freeze({
    id: 8,
    eyeOpen: 0.65,
    eyeY: 0.12,
    mouthCurve: 0.38,
    mouthOpen: 0,
  }),
});

export const BLACK_HOLE_CAPTURE_ZOOMS = Object.freeze([
  14,
  28,
  44,
  62,
  22,
  18,
]);

const DEFAULT_CAPTURE_STATE = Object.freeze({
  captureId: 'reference',
  theme: 'light',
  section: 0,
  timeSeconds: 8,
  pointer: Object.freeze({ x: 0.5, y: 0.35 }),
  reveal: 1,
  rippleAgeSeconds: null,
  expression: 'neutral',
  expressionBlend: 0,
  popPhase: -1,
  reanimation: 0,
  cdBlend: 0,
  cdSpin: false,
  cdSpinAngle: 0,
  seed: 1337,
  settleFrames: 64,
  frameStepMs: 50,
  readyTimeoutMs: 20000,
});

const normalizeSearch = (search) => {
  const value = String(search || '').trim();
  if (!value) return '';
  return value.startsWith('?') ? value : `?${value}`;
};

const readParams = (search) => {
  try {
    return new URLSearchParams(normalizeSearch(search));
  } catch {
    return new URLSearchParams();
  }
};

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const readNumber = (
  params,
  name,
  fallback,
  minimum,
  maximum,
) => {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, minimum, maximum);
};

const readInteger = (
  params,
  name,
  fallback,
  minimum,
  maximum,
) =>
  Math.round(
    readNumber(params, name, fallback, minimum, maximum),
  );

const readBoolean = (params, name, fallback) => {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const readEnum = (params, name, values, fallback) => {
  const raw = params.get(name)?.trim().toLowerCase();
  return values.includes(raw) ? raw : fallback;
};

const readNullableNumber = (
  params,
  name,
  minimum,
  maximum,
) => {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return clamp(value, minimum, maximum);
};

const readPointer = (params) => {
  const raw = params.get('capture-pointer');
  if (!raw) return DEFAULT_CAPTURE_STATE.pointer;
  const [xRaw, yRaw] = raw.split(',', 2);
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return DEFAULT_CAPTURE_STATE.pointer;
  }

  return Object.freeze({
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  });
};

const sanitizeCaptureId = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || DEFAULT_CAPTURE_STATE.captureId;
};

const readInitialSearch = () =>
  typeof window === 'undefined' ? '' : window.location.search;

export const readVisualCaptureRequest = (search = '') =>
  readParams(search)
    .get(VISUAL_CAPTURE_QUERY_PARAM)
    ?.trim()
    .toLowerCase() || null;

export const resolveVisualCaptureState = ({
  search = '',
  runtimePolicy = resolveVisualRuntimePolicy({ search }),
} = {}) => {
  const params = readParams(search);
  const requested = readVisualCaptureRequest(search);
  const supportedRequest = requested === VISUAL_CAPTURE_MODE;
  const active =
    supportedRequest &&
    runtimePolicy.resolved === VISUAL_RUNTIME_MODES.REFERENCE;

  let disabledReason = null;
  if (requested && !supportedRequest) {
    disabledReason = 'unsupported-capture-mode';
  } else if (
    supportedRequest &&
    runtimePolicy.resolved !== VISUAL_RUNTIME_MODES.REFERENCE
  ) {
    disabledReason = 'reference-runtime-required';
  }

  const theme = readEnum(
    params,
    'capture-theme',
    ['light', 'dark'],
    DEFAULT_CAPTURE_STATE.theme,
  );
  const section = readInteger(
    params,
    'capture-section',
    DEFAULT_CAPTURE_STATE.section,
    0,
    DITHER_CAPTURE_PRESETS.length - 1,
  );
  const expression = readEnum(
    params,
    'capture-expression',
    Object.keys(ORB_CAPTURE_EXPRESSIONS),
    DEFAULT_CAPTURE_STATE.expression,
  );
  const explicitBlackHoleZoom = readNullableNumber(
    params,
    'capture-black-hole-zoom',
    1,
    120,
  );

  return Object.freeze({
    schemaVersion: VISUAL_CAPTURE_SCHEMA_VERSION,
    requested,
    active,
    disabledReason,
    captureId: sanitizeCaptureId(
      params.get('capture-id') || DEFAULT_CAPTURE_STATE.captureId,
    ),
    theme,
    section,
    timeSeconds: readNumber(
      params,
      'capture-time',
      DEFAULT_CAPTURE_STATE.timeSeconds,
      0,
      1000,
    ),
    pointer: readPointer(params),
    reveal: readNumber(
      params,
      'capture-reveal',
      DEFAULT_CAPTURE_STATE.reveal,
      0,
      1,
    ),
    rippleAgeSeconds: readNullableNumber(
      params,
      'capture-ripple-age',
      0,
      10,
    ),
    orb: Object.freeze({
      expression,
      expressionBlend: readNumber(
        params,
        'capture-expression-blend',
        DEFAULT_CAPTURE_STATE.expressionBlend,
        0,
        1,
      ),
      popPhase: readNumber(
        params,
        'capture-pop-phase',
        DEFAULT_CAPTURE_STATE.popPhase,
        -1,
        3,
      ),
      reanimation: readInteger(
        params,
        'capture-reanimation',
        DEFAULT_CAPTURE_STATE.reanimation,
        0,
        2,
      ),
      cdBlend: readNumber(
        params,
        'capture-cd-blend',
        DEFAULT_CAPTURE_STATE.cdBlend,
        0,
        1,
      ),
      cdSpin: readBoolean(
        params,
        'capture-cd-spin',
        DEFAULT_CAPTURE_STATE.cdSpin,
      ),
      cdSpinAngle: readNumber(
        params,
        'capture-cd-angle',
        DEFAULT_CAPTURE_STATE.cdSpinAngle,
        -1000,
        1000,
      ),
    }),
    blackHoleZoom:
      explicitBlackHoleZoom ??
      BLACK_HOLE_CAPTURE_ZOOMS[section] ??
      BLACK_HOLE_CAPTURE_ZOOMS[0],
    seed: readInteger(
      params,
      'capture-seed',
      DEFAULT_CAPTURE_STATE.seed,
      1,
      2147483647,
    ),
    settleFrames: readInteger(
      params,
      'capture-settle-frames',
      DEFAULT_CAPTURE_STATE.settleFrames,
      1,
      240,
    ),
    frameStepMs: readNumber(
      params,
      'capture-frame-step',
      DEFAULT_CAPTURE_STATE.frameStepMs,
      1,
      1000,
    ),
    readyTimeoutMs: readInteger(
      params,
      'capture-ready-timeout',
      DEFAULT_CAPTURE_STATE.readyTimeoutMs,
      1000,
      60000,
    ),
  });
};

export const visualCaptureState = resolveVisualCaptureState({
  search: readInitialSearch(),
  runtimePolicy: visualRuntimePolicy,
});

export const isVisualCaptureActive = () =>
  Boolean(visualCaptureState.active);
