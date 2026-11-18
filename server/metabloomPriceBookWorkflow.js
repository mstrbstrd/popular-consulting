const { randomBytes, createHash } = require('node:crypto');
const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');
const { createMetabloomPriceBookStore } = require('./metabloomPriceBookStore');
const { validateMetabloomPriceBook, MAX_METABLOOM_PRICE_BOOK_BYTES } = require('../src/components/metabloomPriceBook');
const { METABLOOM_PRICE_BOOK_COMPILER, METABLOOM_PRICE_RULE_FIELDS, emptyMetabloomPriceRules,
  normalizeMetabloomPriceRule, getMetabloomPriceRuleState,
  compileMetabloomPriceBook, buildMetabloomPriceBookDraftVisual, parseMetabloomPriceBookDraft } = require('../src/components/metabloomPriceBookRules');

// Use the same bounded EVAL transport as published price books. Raw Redis
// commands are deliberately rejected by the production saved-work adapter.
const READ_SCRIPT = "return redis.call('GET', KEYS[1])";
const UPDATE_SCRIPT = `
local receipt=redis.call('GET',KEYS[2])
if receipt then local saved=cjson.decode(receipt); if saved.hash~=ARGV[1] then return {'conflict'} end; return {'ok',saved.result} end
local current=redis.call('GET',KEYS[1])
local revision=0
if current then revision=cjson.decode(current).revision end
if revision~=tonumber(ARGV[2]) then return {'conflict'} end
redis.call('SET',KEYS[1],ARGV[3])
redis.call('SET',KEYS[2],cjson.encode({hash=ARGV[1],result=ARGV[3]}),'EX',86400)
return {'ok',ARGV[3]}`;
const PUBLISH_SCRIPT = `
local receipt=redis.call('GET',KEYS[3])
if receipt then local saved=cjson.decode(receipt); if saved.hash~=ARGV[1] then return {'conflict'} end; return {'ok',saved.result} end
if redis.call('GET',KEYS[1])~=ARGV[2] then return {'conflict'} end
local current=redis.call('GET',KEYS[2])
local version=0
if current then version=cjson.decode(current).version end
if version~=tonumber(ARGV[3]) then return {'conflict'} end
if current then redis.call('SET',KEYS[5],current,'NX') end
if redis.call('EXISTS',KEYS[4])==1 then return {'conflict'} end
redis.call('SET',KEYS[4],ARGV[5])
redis.call('SET',KEYS[2],ARGV[4])
redis.call('SET',KEYS[3],cjson.encode({hash=ARGV[1],result=ARGV[4]}),'EX',86400)
return {'ok',ARGV[4]}`;
const error = (code = 'price_book_unavailable') => Object.assign(new Error(code), { code });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const requestIdValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
const parseDraft = value => { const checked = parseMetabloomPriceBookDraft(value); if (!checked) throw error(); return checked; };
const decodeActive = text => {
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_METABLOOM_PRICE_BOOK_BYTES + 512) throw error();
    const active = JSON.parse(text);
    if (!exact(active, ['version', 'publishedAt', 'book']) || !Number.isSafeInteger(active.version) || active.version < 1
      || !Number.isSafeInteger(active.publishedAt) || active.publishedAt < 1 || !validateMetabloomPriceBook(active.book)) throw error();
    return active;
  } catch { throw error(); }
};
function priceBookDraftView(draft) {
  const state = getMetabloomPriceRuleState(draft?.rules || emptyMetabloomPriceRules());
  const issues = draft?.issues || [];
  let status = issues.length ? 'needs_clarification' : state.status;
  let preview = null;
  if (draft && status === 'ready_for_review') {
    try { preview = buildMetabloomPriceBookDraftVisual(draft); }
    catch { status = 'unsupported_combination'; }
  }
  return { draft, status, missing: state.missing, issues,
    nextQuestion: issues.length ? `${METABLOOM_PRICE_RULE_FIELDS[issues[0].field].label} needs clarification. ${METABLOOM_PRICE_RULE_FIELDS[issues[0].field].question}`
      : status === 'unsupported_combination' ? 'These combined rules exceed the supported pricing limits. Review the rates and input ranges before continuing.' : state.nextQuestion,
    preview };
}
function createMetabloomPriceBookWorkflowStore(database = getMetabloomSavedWorkDatabase(), { now = Date.now } = {}) {
  const keysFor = identity => {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope)) throw error('price_book_invalid');
    return { draft: `metabloom:price-draft:v1:${database.config.scope}:${identity.accountKey}`,
      active: `metabloom:price-book:v1:${database.config.scope}:${identity.accountKey}` };
  };
  const command = async (args, options) => {
    options?.signal?.throwIfAborted();
    try { return await database.command(args, options); } catch { throw error(); }
  };
  const decodeDraft = text => {
    try { if (typeof text !== 'string' || Buffer.byteLength(text) > 24000) throw error(); return parseDraft(JSON.parse(text)); }
    catch { throw error(); }
  };
  const receipt = async (key, digest, options) => {
    const raw = await command(['EVAL', READ_SCRIPT, '1', key], options);
    if (raw === null) return null;
    try {
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 2 * MAX_METABLOOM_PRICE_BOOK_BYTES + 1024) throw error();
      const saved = JSON.parse(raw);
      if (!exact(saved, ['hash', 'result']) || typeof saved.result !== 'string' || !/^[a-f0-9]{64}$/.test(saved.hash)) throw error();
      if (saved.hash !== digest) throw error('price_book_conflict');
      return saved.result;
    }
    catch (failure) { throw failure.code === 'price_book_conflict' ? failure : error(); }
  };
  return {
    async read(identity, options) {
      const raw = await command(['EVAL', READ_SCRIPT, '1', keysFor(identity).draft], options);
      return raw === null ? null : decodeDraft(raw);
    },
    async update(identity, { expectedRevision, requestId, changes }, { source = 'form', message = '', ...options } = {}) {
      const keys = keysFor(identity);
      if (!revision(expectedRevision) || !requestIdValid(requestId) || !Array.isArray(changes) || !changes.length || changes.length > 20
        || changes.some(change => !change || typeof change !== 'object')
        || new Set(changes.map(change => change.field)).size !== changes.length || !['chat', 'form'].includes(source)
        || typeof message !== 'string'
        || Buffer.byteLength(JSON.stringify(changes)) > 16000) throw error('price_book_invalid');
      for (const change of changes) {
        if (!exact(change, source === 'chat' ? ['field', 'value', 'sourceText'] : ['field', 'value'])
          || !Object.hasOwn(METABLOOM_PRICE_RULE_FIELDS, change.field)) throw error('price_book_invalid');
        if (source === 'chat' && (typeof change.sourceText !== 'string' || !change.sourceText.trim()
          || change.sourceText.length > 400 || !message.includes(change.sourceText))) throw error('price_book_evidence_required');
      }
      const digest = hash({ expectedRevision, changes, source, ...(source === 'chat' ? { message } : {}) });
      const receiptKey = `${keys.draft}:update:${requestId}`;
      const prior = await receipt(receiptKey, digest, options);
      if (prior !== null) return decodeDraft(prior);
      const current = await this.read(identity, options);
      if ((current?.revision || 0) !== expectedRevision) throw error('price_book_conflict');
      const draft = current ? JSON.parse(JSON.stringify(current))
        : { id: randomBytes(16).toString('hex'), revision: 0, updatedAt: now(), rules: emptyMetabloomPriceRules(), sources: {}, issues: [] };
      for (const change of changes) {
        draft.issues = draft.issues.filter(issue => issue.field !== change.field);
        try { draft.rules[change.field] = normalizeMetabloomPriceRule(change.field, change.value); }
        catch { draft.issues.push({ field: change.field, code: 'unsupported_value' }); }
        draft.sources[change.field] = { kind: source, text: source === 'chat' ? change.sourceText : '' };
      }
      draft.revision++; draft.updatedAt = now(); parseDraft(draft);
      const result = await command(['EVAL', UPDATE_SCRIPT, '2', keys.draft, receiptKey, digest, String(expectedRevision), JSON.stringify(draft)], options);
      if (Array.isArray(result) && result[0] === 'conflict') throw error('price_book_conflict');
      if (!Array.isArray(result) || result[0] !== 'ok' || result[1] !== JSON.stringify(draft)) {
        // A concurrent duplicate returns the first confirmed receipt, not a new draft ID.
        if (Array.isArray(result) && result[0] === 'ok') return decodeDraft(result[1]);
        throw error();
      }
      return draft;
    },
    async publish(identity, { draftId, draftRevision, compiler, expectedVersion, requestId }, options) {
      const keys = keysFor(identity);
      if (!/^[a-f0-9]{32}$/.test(draftId) || !revision(draftRevision) || draftRevision < 1
        || compiler !== METABLOOM_PRICE_BOOK_COMPILER || !revision(expectedVersion) || !requestIdValid(requestId)) throw error('price_book_invalid');
      const digest = hash({ draftId, draftRevision, expectedVersion, compiler: METABLOOM_PRICE_BOOK_COMPILER });
      const receiptKey = `${keys.draft}:publish:${requestId}`;
      const prior = await receipt(receiptKey, digest, options);
      if (prior !== null) {
        try { const active = decodeActive(prior); if (active.version !== expectedVersion + 1) throw error(); return active; }
        catch { throw error(); }
      }
      const draft = await this.read(identity, options);
      if (!draft || draft.id !== draftId || draft.revision !== draftRevision) throw error('price_book_conflict');
      if (priceBookDraftView(draft).status !== 'ready_for_review') throw error('price_book_incomplete');
      const book = compileMetabloomPriceBook(draft.rules);
      const active = await createMetabloomPriceBookStore(database).read(identity, options);
      if ((active?.version || 0) !== expectedVersion) throw error('price_book_conflict');
      const next = { version: expectedVersion + 1, publishedAt: now(), book };
      decodeActive(JSON.stringify(next));
      const audit = { ...next, compiler: METABLOOM_PRICE_BOOK_COMPILER, draft };
      const result = await command(['EVAL', PUBLISH_SCRIPT, '5', keys.draft, keys.active, receiptKey,
        `${keys.active}:history:${next.version}`, `${keys.active}:history:${expectedVersion}`,
        digest, JSON.stringify(draft), String(expectedVersion), JSON.stringify(next), JSON.stringify(audit)], options);
      if (Array.isArray(result) && result[0] === 'conflict') throw error('price_book_conflict');
      if (!Array.isArray(result) || result[0] !== 'ok') throw error();
      const confirmed = decodeActive(result[1]);
      if (confirmed.version !== next.version || JSON.stringify(confirmed.book) !== JSON.stringify(book)) throw error();
      return confirmed;
    },
  };
}

const taxSchema = { type: 'object', additionalProperties: false, required: ['label', 'rate', 'appliesTo'], properties: {
  label: { type: 'string', maxLength: 40 }, rate: { type: 'string', maxLength: 6 },
  appliesTo: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: ['labour', 'travel', 'callout', 'minimum'] } },
} };
const METABLOOM_PRICE_BOOK_TOOLS = Object.freeze([
  { type: 'function', name: 'get_price_book_draft', strict: true, description: 'Read the saved service-pricing setup and the next required question. This does not create or publish a price book.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
  { type: 'function', name: 'propose_price_book_changes', strict: true,
    description: 'Save only business-rule values explicitly supplied in the current user message. Each change must include an exact sourceText excerpt from that message. Use canonical fields and string decimal values, never formulas or computed totals. No publication is possible. Unsupported values are saved as blocking clarification issues, never silently substituted.',
    parameters: { type: 'object', additionalProperties: false, required: ['expectedRevision', 'changes'], properties: {
      expectedRevision: { type: 'integer', minimum: 0 }, changes: { type: 'array', minItems: 1, maxItems: 20, items: {
        type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceText'], properties: {
          field: { type: 'string', enum: Object.keys(METABLOOM_PRICE_RULE_FIELDS) },
          value: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }, { type: 'array', minItems: 1, maxItems: 4, items: taxSchema }] },
          sourceText: { type: 'string', minLength: 1, maxLength: 400 },
        },
      } },
    } },
  },
]);
const METABLOOM_PRICE_BOOK_WORKFLOW_PROMPT = 'Service price books use a saved structured workflow. Use the supplied draft state as authoritative; do not rebuild it from conversation history or import an existing published formula into it. '
  + 'When the user supplies pricing information, propose only the changed fields from that current message with exact source excerpts and the supplied revision. A missing field stays null; do not assume a rate, currency, free allowance, rounding, tax scope or absence of fees. '
  + 'Use get_price_book_draft to start or resume setup, or propose_price_book_changes directly when values were supplied. After either tool the host supplies the next question or review result. '
  + 'The application compiles formulas, generates examples and computes money. Never use create_visual or calculate to author a price book or replacement quote. Never publish or claim publication. '
  + 'Supported rules: hourly/fixed labour, minimum hours, time rounded upward in minutes, no/flat/per-km/started-block travel, free kilometres, a weekend multiplier on labour/travel/both, a fixed call-out fee, pre-tax minimum charges, and independent tax-exclusive taxes. '
  + 'For no travel use travel_mode=none; no weekend premium is weekend_multiplier="1"; no call-out or minimum is "0"; other_premiums=none only when the user states none. No tax is tax_mode=none; otherwise taxes need explicit name, percentage and applicability. '
  + 'Unsupported after-hours premiums, tax-inclusive pricing, compound tax or other fee structures must be flagged by proposing the actual unsupported value for the relevant field, never replaced with a supported value. '
  + 'Amounts are decimal strings, not cents. Tax percentages are strings such as "5". Do not infer tax rules from a place or registration. Source excerpts show where proposed values came from; they are not user review approval. '
  + 'The user reviews the compiled draft and explicitly publishes the reviewed revision in the UI. If a provider or tool fails, the Price book setup form can resume the same saved draft.';
module.exports = { createMetabloomPriceBookWorkflowStore, priceBookDraftView, METABLOOM_PRICE_BOOK_TOOLS, METABLOOM_PRICE_BOOK_WORKFLOW_PROMPT };
