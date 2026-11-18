const { createHash } = require('node:crypto');
const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');
const { isMetabloomThreadId } = require('../src/components/metabloomThreadProtocol');
const { METABLOOM_BOOM_FIELDS, normalizeBoomValue, emptyBoomFields, parseMetabloomBoomDraft } = require('../src/components/metabloomBoomRequest');
const READ = "return redis.call('GET',KEYS[1])";
// Drafts are isolated by account AND conversation. Expire unused demo contact
// details after seven days. Chat snapshots/artifacts follow normal chat retention.
const UPDATE = `
local receipt=redis.call('GET',KEYS[2])
if receipt then local saved=cjson.decode(receipt); if saved.hash~=ARGV[1] then return {'conflict'} end; return {'ok',saved.result} end
local current=redis.call('GET',KEYS[1])
local revision=0
if current then revision=cjson.decode(current).revision end
if revision~=tonumber(ARGV[2]) then return {'conflict'} end
redis.call('SET',KEYS[1],ARGV[3],'EX',604800)
redis.call('SET',KEYS[2],cjson.encode({hash=ARGV[1],result=ARGV[3]}),'EX',86400)
return {'ok',ARGV[3]}`;
const fail = (code = 'boom_request_unavailable') => Object.assign(new Error(code), { code });
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const aliases = { market: { US: ['us', 'usa', 'united states'], CA: ['ca', 'canada', 'canadian'] },
  hardness: { 'Single Wall': ['single wall', 'single-wall'], 'Twin Wall': ['twin wall', 'twin-wall'] },
  backEnd: { Yes: ['yes', 'include the back end', 'include back end'], No: ['no', 'exclude the back end', 'exclude back end'] } };
function hasEvidence(change, message) {
  if (typeof change.sourceText !== 'string' || !change.sourceText.trim() || change.sourceText.length > 1600 || !message.includes(change.sourceText)) return false;
  // Clearing a field is an explicit user action, not the model filling a gap.
  if (change.value === null) return /\b(?:clear|remove|unknown|unsure|not known|not sure)\b/i.test(change.sourceText)
    && change.sourceText.toLowerCase().includes(METABLOOM_BOOM_FIELDS[change.field].label.toLowerCase());
  const evidence = change.sourceText.toLowerCase();
  const choices = aliases[change.field]?.[change.value];
  if (!choices) return evidence.includes(change.value.toLowerCase());
  return choices.some(choice => new RegExp(`\\b${choice}\\b`, 'i').test(evidence));
}
function createMetabloomBoomRequestStore(database = getMetabloomSavedWorkDatabase(), { now = Date.now } = {}) {
  const keyFor = (identity, conversationId) => {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope)
      || !isMetabloomThreadId(conversationId)) throw fail('boom_request_invalid');
    return `metabloom:boom-request:v1:${database.config.scope}:${identity.accountKey}:${conversationId}`;
  };
  const command = async (args, options) => { options?.signal?.throwIfAborted();
    try { return await database.command(args, options); } catch { options?.signal?.throwIfAborted(); throw fail(); } };
  const decode = raw => { try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16000) throw fail();
    const draft = parseMetabloomBoomDraft(JSON.parse(raw)); if (!draft) throw fail(); return draft;
  } catch { throw fail(); } };
  return {
    async read(identity, conversationId, options) {
      const raw = await command(['EVAL', READ, '1', keyFor(identity, conversationId)], options);
      return raw === null ? null : decode(raw);
    },
    async update(identity, conversationId, { expectedRevision, requestId, changes }, { message, signal } = {}) {
      const key = keyFor(identity, conversationId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1
        || typeof requestId !== 'string' || !/^[a-f0-9]{64}$/.test(requestId) || typeof message !== 'string' || message.length > 1600
        || !Array.isArray(changes) || !changes.length || changes.length > 13
        || Buffer.byteLength(JSON.stringify(changes)) > 24000
        || new Set(changes.map(change => change?.field)).size !== changes.length) throw fail('boom_request_invalid');
      for (const change of changes) {
        if (!exact(change, ['field', 'value', 'sourceText']) || !Object.hasOwn(METABLOOM_BOOM_FIELDS, change.field)) throw fail('boom_request_invalid');
        try { normalizeBoomValue(change.field, change.value); } catch { throw fail('boom_request_invalid'); }
        if (!hasEvidence(change, message)) throw fail('boom_request_evidence_required');
      }
      const digest = createHash('sha256').update(JSON.stringify({ expectedRevision, changes, message })).digest('hex');
      const receiptKey = `${key}:update:${requestId}`;
      const prior = await command(['EVAL', READ, '1', receiptKey], { signal });
      if (prior !== null) {
        let receipt; try { if (typeof prior !== 'string' || Buffer.byteLength(prior) > 24000) throw fail(); receipt = JSON.parse(prior); } catch { throw fail(); }
        if (!exact(receipt, ['hash', 'result']) || !/^[a-f0-9]{64}$/.test(receipt.hash)) throw fail();
        if (receipt.hash !== digest) throw fail('boom_request_conflict');
        return decode(receipt.result);
      }
      const current = await this.read(identity, conversationId, { signal });
      if ((current?.revision || 0) !== expectedRevision) throw fail('boom_request_conflict');
      const fields = { ...(current?.fields || emptyBoomFields()) };
      for (const change of changes) fields[change.field] = change.value;
      const next = { version: 1, revision: expectedRevision + 1, updatedAt: now(), fields };
      const serialized = JSON.stringify(next); decode(serialized);
      const result = await command(['EVAL', UPDATE, '2', key, receiptKey, digest, String(expectedRevision), serialized], { signal });
      if (Array.isArray(result) && result[0] === 'conflict') throw fail('boom_request_conflict');
      if (!Array.isArray(result) || result[0] !== 'ok') throw fail();
      return decode(result[1]);
    },
  };
}
const METABLOOM_BOOM_TOOLS = Object.freeze([
  { type: 'function', name: 'get_boom_quote_request', strict: true,
    description: 'Start, resume or review the boom-system quote-request DEMO in this chat. Returns the next required intake question and a review card when details exist. No prices or submission.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
  { type: 'function', name: 'update_boom_quote_request', strict: true,
    description: 'Save customer-supplied boom-system intake details for this chat only. Values must appear in exact source excerpts from the CURRENT user message. No inferred defaults, prices, attachments or submission. All changes validate atomically.',
    parameters: { type: 'object', additionalProperties: false, required: ['expectedRevision', 'changes'], properties: {
      expectedRevision: { type: 'integer', minimum: 0 }, changes: { type: 'array', minItems: 1, maxItems: 13, items: {
        type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceText'], properties: {
          field: { type: 'string', enum: Object.keys(METABLOOM_BOOM_FIELDS) },
          value: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] }, sourceText: { type: 'string', minLength: 1, maxLength: 1600 },
        },
      } },
    } } },
]);
const METABLOOM_BOOM_PROMPT = 'Boom-system quotes are a separate product demo for collecting a DY quote REQUEST, not the service-price-book estimate tool. '
  + 'For a boom-system request, use get_boom_quote_request to begin/resume/review or update_boom_quote_request when the user supplies details. '
  + 'Use the saved revision and fields below, never reconstruct missing data from history. Save only explicitly supplied values from the current user message with exact sourceText excerpts containing those values. '
  + 'Market is US or CA, hardness is Single Wall or Twin Wall, backEnd is Yes or No. Do not infer a market, contact details, pipe type or back end. Unknown required fields stay null. '
  + 'Use exactly one boom tool per turn and combine all supplied field changes into one update; do not batch reads, pricing tools or generic visuals with it. '
  + 'The host supplies the next question and review card; never use create_visual, get_quote or calculate as a replacement. Do not estimate prices, certify equipment compatibility or submit/send a request. '
  + 'One draft belongs to this chat. For a separate customer/request, ask the user to select New chat; never mix customers or import account-wide pricing. '
  + 'Boom and deck pipe details are optional. Chat does not accept schematic uploads: never claim a filename is an attached file. The real DY form accepts one optional PDF, PNG, JPG or JPEG up to 5 MB. '
  + 'Unused structured demo drafts expire seven days after their last update; chat messages and generated cards follow normal chat retention. If unavailable or expired, state that clearly and re-collect required fields. '
  + 'When asked what is needed, explain the actual required contact/company, market, pump make/model/serial, pipe wall and back-end choice, plus optional pipe details and schematic. Fictional details are welcome for this demo.';
module.exports = { createMetabloomBoomRequestStore, METABLOOM_BOOM_TOOLS, METABLOOM_BOOM_PROMPT };
