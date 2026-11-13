const { METABLOOM_EMOTES, METABLOOM_EMOTE_IDS, resolveMetabloomEmote } = require('./metabloomEmoteLibrary');

const METABLOOM_EXPRESSION_VERSION = 1;
const requestId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,160}$/.test(value);
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).length === names.length && names.every(name => {
    const field = Object.getOwnPropertyDescriptor(value, name);
    return field?.enumerable && Object.prototype.hasOwnProperty.call(field, 'value');
  });
const sources = ['model', 'automatic'];
const reasons = Object.freeze({
  applied: ['runtime'], finished: ['runtime'], simplified: ['reduced_motion'],
  suppressed: ['hidden', 'paused', 'disabled', 'unavailable'],
  interrupted: ['hidden', 'paused', 'disabled', 'replaced', 'stopped'],
});

function parseMetabloomExpressionReceipt(value) {
  if (!keys(value, ['requestId', 'emote', 'source', 'status', 'reason']) || !requestId(value.requestId)
    || !resolveMetabloomEmote(value.emote) || !sources.includes(value.source)
    || !Object.prototype.hasOwnProperty.call(reasons, value.status) || !reasons[value.status].includes(value.reason)) return null;
  return { ...value };
}

function parseMetabloomOrbContext(value) {
  if (!keys(value, ['version', 'enabled', 'visible', 'backgroundEnabled', 'paused', 'reducedMotion', 'intensity', 'emote', 'lastExpression'])
    || value.version !== METABLOOM_EXPRESSION_VERSION
    || ['enabled', 'visible', 'backgroundEnabled', 'paused', 'reducedMotion'].some(name => typeof value[name] !== 'boolean')
    || !Number.isFinite(value.intensity) || value.intensity < 0 || value.intensity > 1
    || !resolveMetabloomEmote(value.emote)) return null;
  const receipt = value.lastExpression === null ? null : parseMetabloomExpressionReceipt(value.lastExpression);
  if (value.lastExpression !== null && !receipt) return null;
  return { ...value, lastExpression: receipt };
}

function parseMetabloomExpressionEvent(value, expectedRequestId) {
  if (!keys(value, ['type', 'requestId', 'emote', 'source']) || value.type !== 'orb_expression'
    || !requestId(value.requestId) || value.requestId !== expectedRequestId
    || !resolveMetabloomEmote(value.emote) || !sources.includes(value.source)) return null;
  return { ...value };
}

const METABLOOM_EXPRESSION_TOOLS = Object.freeze([
  Object.freeze({ type: 'function', name: 'get_orb_state', strict: true,
    description: 'Read the browser-reported Orb snapshot captured at the start of this request: current presentation settings and the last expression receipt. This is not live DOM access or proof the user saw a gesture.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] } }),
  Object.freeze({ type: 'function', name: 'express_orb', strict: true,
    description: 'Choose one intentional Orb expression to accompany this answer. It replaces the automatic final reaction, after answer validation. Call at most once; use neutral for a deliberate settle. The browser owns timing, intensity and accessibility. Queued is not displayed. Available expressions: '
      + METABLOOM_EMOTES.map(emote => `${emote.id}: ${emote.description}`).join('; '),
    parameters: { type: 'object', additionalProperties: false, properties: {
      emote: { type: 'string', enum: [...METABLOOM_EMOTE_IDS] },
    }, required: ['emote'] } }),
]);

const parseMetabloomExpressionChoice = value => keys(value, ['emote']) && resolveMetabloomEmote(value.emote)
  ? { emote: value.emote } : null;

function getMetabloomExpressionBlock(context, source = 'model') {
  if (!context.visible) return 'hidden';
  if (context.paused) return 'paused';
  if (!context.backgroundEnabled || context.intensity === 0 || (source === 'model' && !context.enabled)) return 'disabled';
  return null;
}

const expressionStatus = Object.freeze({
  applied: 'Playing', finished: 'Sequence finished', simplified: 'Reduced-motion pose',
  suppressed: 'Not played', interrupted: 'Interrupted',
});
const expressionReason = Object.freeze({ hidden: 'page hidden', paused: 'Orb paused', disabled: 'expressions disabled',
  unavailable: 'runtime unavailable', replaced: 'another action started', stopped: 'stopped' });
function describeMetabloomExpression(receipt) {
  const value = parseMetabloomExpressionReceipt(receipt);
  if (!value) return null;
  return `${resolveMetabloomEmote(value.emote).label} · ${value.source === 'model' ? 'Model choice' : 'Automatic reaction'} · ${expressionStatus[value.status]}`
    + (expressionReason[value.reason] ? ` (${expressionReason[value.reason]})` : '');
}

module.exports = { METABLOOM_EXPRESSION_VERSION, METABLOOM_EXPRESSION_TOOLS,
  parseMetabloomOrbContext, parseMetabloomExpressionReceipt, parseMetabloomExpressionEvent,
  parseMetabloomExpressionChoice, getMetabloomExpressionBlock, describeMetabloomExpression };
