const { createHash, randomBytes } = require('node:crypto');
const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');
const { isMetabloomThreadId } = require('../src/components/metabloomThreadProtocol');
const { INVOICE_FIELDS, INVOICE_LINE_FIELDS, MAX_CHAT_INVOICE_LINES, exact, normalizeInvoiceChatValue,
  emptyInvoiceChatFields, emptyInvoiceChatLine, parseMetabloomInvoiceDraft } = require('../src/components/metabloomInvoiceDraft');
const READ = "return redis.call('GET',KEYS[1])";
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
const fail = (code = 'invoice_draft_unavailable') => Object.assign(new Error(code), { code });
const excerpt = (text, message) => typeof text === 'string' && Boolean(text.trim()) && text.length <= 1600 && message.includes(text);
function evidence(change, message) {
  if (!excerpt(change.sourceText, message)) return false;
  const { field, value, sourceText } = change;
  if (value === null || value === '') return /\b(?:clear|remove|unknown|not sure|none|no due date)\b/i.test(sourceText);
  if (typeof value === 'boolean') {
    const negative = /\b(?:no|without) tax(?:es)?\b|\buntaxed\b/i.test(sourceText)
      || new RegExp(`\\b(?:no|without|exclude) ${field}\\b|\\b${field}\\s*[:=]?\\s*(?:no|false|off)\\b`, 'i').test(sourceText);
    return value ? new RegExp(`\\b${field}\\b`, 'i').test(sourceText) && !negative : negative;
  }
  if (['qty', 'cost', 'discount', 'gstRate', 'pstRate'].includes(field)) {
    // Compare explicit decimal tokens, so 65 and 65.00 refer to the same input.
    // No expressions, implicit rates, tax inference, or model-computed totals.
    const numbers = sourceText.match(/\d+(?:\.\d+)?/g) || [];
    return numbers.some(number => Number(number) === Number(value));
  }
  return sourceText.toLowerCase().includes(value.toLowerCase());
}
function validateChanges(changes, message, line = false) {
  const fields = line ? INVOICE_LINE_FIELDS : INVOICE_FIELDS;
  if (!Array.isArray(changes) || changes.length > Object.keys(fields).length
    || new Set(changes.map(change => change?.field)).size !== changes.length) throw fail('invoice_draft_invalid');
  for (const change of changes) {
    if (!exact(change, ['field', 'value', 'sourceText']) || !Object.hasOwn(fields, change.field)) throw fail('invoice_draft_invalid');
    try { normalizeInvoiceChatValue(change.field, change.value, line); } catch { throw fail('invoice_draft_invalid'); }
    if (!evidence(change, message)) throw fail('invoice_draft_evidence_required');
  }
}
function createMetabloomInvoiceStore(database = getMetabloomSavedWorkDatabase(), { now = Date.now } = {}) {
  const keyFor = (identity, conversationId) => {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope) || !isMetabloomThreadId(conversationId)) throw fail('invoice_draft_invalid');
    return `metabloom:invoice-draft:v1:${database.config.scope}:${identity.accountKey}:${conversationId}`;
  };
  const command = async (args, options) => { options?.signal?.throwIfAborted();
    try { return await database.command(args, options); } catch { options?.signal?.throwIfAborted(); throw fail(); } };
  const decode = raw => { try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 48000) throw fail();
    const draft = parseMetabloomInvoiceDraft(JSON.parse(raw)); if (!draft) throw fail(); return draft;
  } catch { throw fail(); } };
  return {
    async read(identity, conversationId, options) {
      const raw = await command(['EVAL', READ, '1', keyFor(identity, conversationId)], options);
      return raw === null ? null : decode(raw);
    },
    async update(identity, conversationId, { expectedRevision, requestId, changes, lineChanges }, { message, signal } = {}) {
      const key = keyFor(identity, conversationId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER - 1
        || !/^[a-f0-9]{64}$/.test(requestId) || typeof message !== 'string' || message.length > 1600
        || !Array.isArray(lineChanges) || lineChanges.length > 20 || Buffer.byteLength(JSON.stringify({ changes, lineChanges })) > 32000) throw fail('invoice_draft_invalid');
      validateChanges(changes, message);
      if (!changes.length && !lineChanges.length) throw fail('invoice_draft_invalid');
      const touched = new Set();
      for (const operation of lineChanges) {
        if (!exact(operation, ['action', 'id', 'changes', 'sourceText']) || !['add', 'update', 'remove'].includes(operation.action)
          || !excerpt(operation.sourceText, message) || (operation.action === 'add' ? operation.id !== '' : !/^[a-f0-9]{16}$/.test(operation.id))) throw fail('invoice_draft_invalid');
        if (operation.id && touched.has(operation.id)) throw fail('invoice_draft_invalid');
        touched.add(operation.id);
        validateChanges(operation.changes, message, true);
        if (operation.action === 'remove' ? operation.changes.length !== 0 : !operation.changes.length) throw fail('invoice_draft_invalid');
      }
      const digest = createHash('sha256').update(JSON.stringify({ expectedRevision, changes, lineChanges, message })).digest('hex');
      const receiptKey = `${key}:update:${requestId}`;
      const readReceipt = async () => {
        const prior = await command(['EVAL', READ, '1', receiptKey], { signal });
        if (prior === null) return null;
        let receipt; try { if (typeof prior !== 'string' || Buffer.byteLength(prior) > 96000) throw fail(); receipt = JSON.parse(prior); } catch { throw fail(); }
        if (!exact(receipt, ['hash', 'result']) || !/^[a-f0-9]{64}$/.test(receipt.hash)) throw fail();
        if (receipt.hash !== digest) throw fail('invoice_draft_conflict');
        return decode(receipt.result);
      };
      const prior = await readReceipt(); if (prior) return prior;
      const current = await this.read(identity, conversationId, { signal });
      if ((current?.revision || 0) !== expectedRevision) {
        // A matching concurrent request may have committed between the receipt
        // lookup and draft read. Its receipt and draft were written atomically.
        const concurrent = await readReceipt(); if (concurrent) return concurrent;
        throw fail('invoice_draft_conflict');
      }
      const timestamp = now();
      const draft = current ? JSON.parse(JSON.stringify(current)) : { version: 1, id: randomBytes(16).toString('hex'), revision: 0, updatedAt: timestamp,
        fields: { ...emptyInvoiceChatFields(), invoiceNumber: `INV-${new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(6).toString('hex').toUpperCase()}` }, items: [] };
      for (const change of changes) draft.fields[change.field] = change.value;
      for (const operation of lineChanges) {
        let item = draft.items.find(candidate => candidate.id === operation.id);
        if (operation.action === 'add') {
          if (draft.items.length >= MAX_CHAT_INVOICE_LINES) throw fail('invoice_draft_invalid');
          item = emptyInvoiceChatLine(randomBytes(8).toString('hex')); draft.items.push(item);
        } else if (!item) throw fail('invoice_draft_conflict');
        if (operation.action === 'remove') {
          const originalIndex = current?.items.findIndex(candidate => candidate.id === item.id) ?? -1;
          const namesLine = new RegExp(`\\b(?:item|line) ${originalIndex + 1}\\b`, 'i').test(operation.sourceText)
            || (item.description && operation.sourceText.includes(item.description));
          if (!/\b(?:remove|delete|drop)\b/i.test(operation.sourceText) || !namesLine) throw fail('invoice_draft_evidence_required');
          draft.items = draft.items.filter(candidate => candidate.id !== item.id);
        } else for (const change of operation.changes) item[change.field] = change.value;
      }
      draft.revision++; draft.updatedAt = timestamp;
      const serialized = JSON.stringify(draft); decode(serialized);
      const result = await command(['EVAL', UPDATE, '2', key, receiptKey, digest, String(expectedRevision), serialized], { signal });
      if (Array.isArray(result) && result[0] === 'conflict') throw fail('invoice_draft_conflict');
      if (!Array.isArray(result) || result[0] !== 'ok') throw fail();
      return decode(result[1]);
    },
  };
}
const changeSchema = (fields, line) => ({ type: 'object', additionalProperties: false, required: ['field', 'value', 'sourceText'], properties: {
  field: { type: 'string', enum: Object.keys(fields) }, value: { anyOf: [{ type: 'string', maxLength: line ? 500 : 1500 }, { type: 'null' }, ...(line ? [{ type: 'boolean' }] : [])] },
  sourceText: { type: 'string', minLength: 1, maxLength: 1600 },
} });
const METABLOOM_INVOICE_TOOLS = Object.freeze([
  { type: 'function', name: 'get_invoice_draft', strict: true, description: 'Start, resume or review the invoice draft for this chat. No access to local invoices. The host asks for missing details and builds a review card.',
    parameters: { type: 'object', additionalProperties: false, required: [], properties: {} } },
  { type: 'function', name: 'create_invoice_draft', strict: true,
    description: 'Create or revise the current chat invoice using ONLY values explicitly supplied in the current user message. One operation for all header/line changes. Preserve missing values. Host calculates money. Cannot send, issue, pay, print or overwrite a local invoice.',
    parameters: { type: 'object', additionalProperties: false, required: ['expectedRevision', 'changes', 'lineChanges'], properties: {
      expectedRevision: { type: 'integer', minimum: 0 }, changes: { type: 'array', maxItems: 17, items: changeSchema(INVOICE_FIELDS, false) },
      lineChanges: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['action', 'id', 'changes', 'sourceText'], properties: {
        action: { type: 'string', enum: ['add', 'update', 'remove'] }, id: { type: 'string', maxLength: 16 },
        changes: { type: 'array', maxItems: 7, items: changeSchema(INVOICE_LINE_FIELDS, true) }, sourceText: { type: 'string', minLength: 1, maxLength: 1600 },
      } } },
    } } },
]);
const METABLOOM_INVOICE_PROMPT = 'Invoices use get_invoice_draft and create_invoice_draft, not price books, boom requests, calculate or create_visual. '
  + 'Use get_invoice_draft to begin/resume/review; use create_invoice_draft directly for supplied details, with the saved revision. Combine changes into one tool call; never batch with other workflows. '
  + 'Only use exact current-message source excerpts and values supported by them. Preserve verbatim descriptions. Decimal quantities/prices/percentages are strings, not cents. Dates must be supplied as YYYY-MM-DD; ask for an exact date instead of guessing. Currency must be explicit CAD or USD. '
  + 'For new items use action=add and id=""; for corrections use action=update with the saved item ID. Never re-add an existing item merely to change one field. Removal requires the user to name the item number or description. '
  + 'Sender and client names, invoice date, currency, and at least one complete item are required. Each item needs description, service date, quantity, unit price, and explicit gst/pst booleans. No tax means both false; tax applies only with explicit rates and applicability. Never infer taxes from location. New items have no discount unless specified (discount defaults to "0"). Invoice numbers are generated once by the host and remain stable unless explicitly edited. '
  + 'Optional sender/contact/address/payment details can be left empty. Do not access local profiles, banking information, logos or saved local invoices. Use New chat for a separate invoice. No automatic conversion of unpriced boom requests into priced invoices. '
  + 'The host validates fields, calculates totals with the existing invoice engine and queues a review card. Do not repeat or invent totals in prose. The user explicitly clicks Open in invoice generator to load a complete draft; existing invoices require replacement approval. '
  + 'Chat details are processed by the selected provider and retained in chat; the structured intake expires after seven days without an update. The private editor keeps subsequent edits in the browser. Opening or preparing a draft never sends, issues, saves to device, marks paid or exports a PDF. Print/save PDF remains an explicit browser dialog. At most 20 items through chat; the editor supports 100.';
module.exports = { createMetabloomInvoiceStore, METABLOOM_INVOICE_TOOLS, METABLOOM_INVOICE_PROMPT };
