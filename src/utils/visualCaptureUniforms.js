import {
  DITHER_CAPTURE_PRESETS,
  ORB_CAPTURE_EXPRESSIONS,
} from './visualCapturePolicy';

const normalizedModulo = (value, divisor) => {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
};

const isDitherRenderer = (rendererId) =>
  String(rendererId || '').toLowerCase().includes('dither');

const isBlackHoleRenderer = (rendererId) =>
  String(rendererId || '').toLowerCase().startsWith('black-hole');

const talkingMouthOpen = (timeSeconds) => {
  const wave =
    0.5 +
    0.3 * Math.sin(timeSeconds * 9.1) +
    0.18 * Math.sin(timeSeconds * 14.7 + 0.83) +
    0.13 * Math.sin(timeSeconds * 6.3 + 1.92) +
    0.07 * Math.cos(timeSeconds * 21.4 + 3.1);

  return Math.max(0, Math.min(1, wave));
};

const resolveDitherUniform = (state, uniformName) => {
  const preset =
    DITHER_CAPTURE_PRESETS[state.section] ||
    DITHER_CAPTURE_PRESETS[0];
  const expression =
    ORB_CAPTURE_EXPRESSIONS[state.orb.expression] ||
    ORB_CAPTURE_EXPRESSIONS.neutral;
  const mouthOpen =
    state.orb.expression === 'talking'
      ? talkingMouthOpen(state.timeSeconds)
      : expression.mouthOpen;

  switch (uniformName) {
    case 'u_time':
      return [state.timeSeconds];
    case 'u_hueOffset':
      return [
        normalizedModulo(
          state.timeSeconds * preset.rainbowSpeed * 0.15,
          1,
        ),
      ];
    case 'u_contrast':
      return [preset.contrast];
    case 'u_warp':
      return [preset.warp];
    case 'u_rainbowSpeed':
      return [preset.rainbowSpeed];
    case 'u_shapeA':
    case 'u_shapeB':
      return [preset.shape];
    case 'u_shapeMix':
      return [0];
    case 'u_reveal':
      return [state.reveal];
    case 'u_eyeOpen':
      return [expression.eyeOpen];
    case 'u_eyeY':
      return [expression.eyeY];
    case 'u_mouthCurve':
      return [expression.mouthCurve];
    case 'u_mouthOpen':
      return [mouthOpen];
    case 'u_expressionBlend':
      return [state.orb.expressionBlend];
    case 'u_expressionId':
      return [expression.id];
    case 'u_popPhase':
      return [state.orb.popPhase];
    case 'u_reanimIdx':
      return [state.orb.reanimation];
    case 'u_cdBlend':
      return [state.orb.cdBlend];
    case 'u_cdSpinSpeed':
      return [state.orb.cdSpin ? 4 : 0];
    case 'u_cdSpinAngle':
      return [state.orb.cdSpinAngle];
    case 'u_rippleCount':
      return [state.rippleAgeSeconds === null ? 0 : 1];
    case 'u_ripples[0]':
      return state.rippleAgeSeconds === null
        ? null
        : [
            state.pointer.x,
            state.pointer.y,
            state.timeSeconds - state.rippleAgeSeconds,
          ];
    default:
      return null;
  }
};

const resolveBlackHoleUniform = (state, uniformName) => {
  switch (uniformName) {
    case 'u_time':
      return [state.timeSeconds];
    case 'u_mouse':
      return [state.pointer.x, state.pointer.y];
    case 'u_zoom':
      return [state.blackHoleZoom];
    case 'u_lightMode':
      return [state.theme === 'dark' ? 0 : 1];
    default:
      return null;
  }
};

export const resolveVisualCaptureUniform = ({
  state,
  rendererId,
  uniformName,
} = {}) => {
  if (!state?.active || !uniformName) return null;

  if (isDitherRenderer(rendererId)) {
    return resolveDitherUniform(state, uniformName);
  }

  if (isBlackHoleRenderer(rendererId)) {
    return resolveBlackHoleUniform(state, uniformName);
  }

  return null;
};

export {
  isBlackHoleRenderer,
  isDitherRenderer,
  talkingMouthOpen,
};
