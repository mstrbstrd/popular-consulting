const { INVOICE_FIELDS, INVOICE_LINE_FIELDS, normalizeInvoiceChatValue } = require('./metabloomInvoiceDraft');
const { isMetabloomThreadId } = require('./metabloomThreadProtocol');

const METABLOOM_WORKSPACE_VERSION = 1;
const MAX_METABLOOM_WORKSPACE_BODY_BYTES = 65536;
const MAX_METABLOOM_WORKSPACE_CONTEXT_BYTES = 32768;
const MAX_METABLOOM_WORKSPACE_EVENT_BYTES = 32768;
const privateFields = new Set(['companyEmail', 'companyAddress', 'companyWebsite', 'companyPhone',
  'businessNumber', 'taxNumber', 'clientAddress', 'notes']);
const METABLOOM_WORKSPACE_SAFE_FIELDS = Object.freeze(Object.keys(INVOICE_FIELDS).filter(field => !privateFields.has(field)));
const sections = ['company', 'client', 'details', 'items', 'taxes', 'notes'];
const statuses = ['applied', 'duplicate', 'conflict', 'rejected', 'cancelled', 'unavailable'];
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,160}$/.test(value);
const lineId = value => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && (() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value');
  })());
const exact = (value, fields) => plain(value) && Reflect.ownKeys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const text = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0)
  && !Array.from(value).some(char => { const code = char.codePointAt(0); return code === 127 || (code < 32 && ![9, 10, 13].includes(code)); });
const missingFields = value => Array.isArray(value) && value.length <= 200 && value.every(item => text(item, 500));
const withinBytes = (value, max) => {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= max; } catch { return false; }
};
const copy = value => JSON.parse(JSON.stringify(value));
const validField = (field, value, line = false) => {
  try { normalizeInvoiceChatValue(field, value, line); return true; } catch { return false; }
};

function parseMetabloomWorkspaceContext(value) {
  if (!exact(value, ['version', 'status', 'conversationId', 'workspaceInstanceId', 'bindingEpoch', 'dataRevision', 'fields', 'items', 'missing', 'ready'])
    || value.version !== 1 || !['available', 'connected'].includes(value.status) || !isMetabloomThreadId(value.conversationId)
    || !revision(value.bindingEpoch) || !revision(value.dataRevision) || !plain(value.fields)
    || Object.keys(value.fields).some(field => !Object.hasOwn(INVOICE_FIELDS, field) || !validField(field, value.fields[field]))
    || !Array.isArray(value.items) || value.items.length > 20 || !missingFields(value.missing) || typeof value.ready !== 'boolean') return null;
  if (value.status === 'available') {
    if (value.workspaceInstanceId !== null || value.bindingEpoch !== 0 || value.dataRevision !== 0 || value.ready
      || Object.keys(value.fields).length || value.items.length || value.missing.length) return null;
  } else if (!identifier(value.workspaceInstanceId)) return null;
  const ids = new Set();
  for (const item of value.items) {
    if (!exact(item, ['id', ...Object.keys(INVOICE_LINE_FIELDS)]) || !lineId(item.id) || ids.has(item.id)
      || Object.keys(INVOICE_LINE_FIELDS).some(field => !validField(field, item[field], true))) return null;
    ids.add(item.id);
  }
  return withinBytes(value, MAX_METABLOOM_WORKSPACE_CONTEXT_BYTES) ? copy(value) : null;
}

function validChanges(changes, line = false) {
  const fields = line ? INVOICE_LINE_FIELDS : INVOICE_FIELDS;
  if (!Array.isArray(changes) || changes.length > Object.keys(fields).length) return false;
  const seen = new Set();
  for (const change of changes) {
    if (!exact(change, ['field', 'value', 'sourceText']) || !Object.hasOwn(fields, change.field) || seen.has(change.field)
      || !validField(change.field, change.value, line) || !text(change.sourceText, 1600)) return false;
    seen.add(change.field);
  }
  return true;
}

function parseMetabloomWorkspaceProposal(value, expectedRequestId) {
  if (!exact(value, ['type', 'version', 'command', 'requestId', 'operationId', 'conversationId', 'workspaceInstanceId',
    'bindingEpoch', 'expectedDataRevision', 'changes', 'lineChanges', 'section', 'payloadHash'])
    || value.type !== 'invoice_workspace' || value.version !== 1 || !['open', 'update', 'focus'].includes(value.command)
    || !identifier(value.requestId) || (expectedRequestId !== undefined && value.requestId !== expectedRequestId)
    || !identifier(value.operationId) || !isMetabloomThreadId(value.conversationId) || !revision(value.bindingEpoch)
    || !revision(value.expectedDataRevision) || typeof value.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.payloadHash)
    || !validChanges(value.changes) || !Array.isArray(value.lineChanges) || value.lineChanges.length > 20) return null;
  const ids = new Set();
  for (const operation of value.lineChanges) {
    if (!exact(operation, ['op', 'id', 'changes', 'sourceText']) || !['add', 'update', 'remove'].includes(operation.op)
      || !validChanges(operation.changes, true) || !text(operation.sourceText, 1600)) return null;
    if (operation.op === 'add') { if (operation.id !== null || !operation.changes.length) return null; }
    else {
      if (!lineId(operation.id) || ids.has(operation.id)) return null;
      ids.add(operation.id);
      if (operation.op === 'remove' ? operation.changes.length !== 0 : operation.changes.length === 0) return null;
    }
  }
  if (value.command === 'open') {
    if (value.workspaceInstanceId !== null || value.bindingEpoch !== 0 || value.expectedDataRevision !== 0
      || value.changes.length || value.lineChanges.length || value.section !== null) return null;
  } else {
    if (!identifier(value.workspaceInstanceId)) return null;
    if (value.command === 'update' && (value.section !== null || (!value.changes.length && !value.lineChanges.length))) return null;
    if (value.command === 'focus' && (!sections.includes(value.section) || value.changes.length || value.lineChanges.length)) return null;
  }
  return withinBytes(value, MAX_METABLOOM_WORKSPACE_EVENT_BYTES) ? copy(value) : null;
}

function parseMetabloomWorkspaceReceipt(value) {
  if (!exact(value, ['version', 'requestId', 'operationId', 'status', 'workspaceInstanceId', 'dataRevision', 'message', 'missing', 'total', 'currency'])
    || value.version !== 1 || !identifier(value.requestId) || !identifier(value.operationId) || !statuses.includes(value.status)
    || (value.workspaceInstanceId !== null && !identifier(value.workspaceInstanceId)) || !revision(value.dataRevision)
    || !text(value.message, 500) || !missingFields(value.missing)
    || (value.total !== null && (typeof value.total !== 'string' || !/^\d{1,16}\.\d{2}$/.test(value.total)))
    || (value.currency !== null && !['CAD', 'USD'].includes(value.currency))
    || (value.total !== null && value.currency === null)) return null;
  return withinBytes(value, MAX_METABLOOM_WORKSPACE_EVENT_BYTES) ? copy(value) : null;
}

function canonicalWorkspacePayload(proposal) {
  const sorted = value => Array.isArray(value) ? value.map(sorted) : plain(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  const { payloadHash, ...payload } = proposal;
  return JSON.stringify(sorted(payload));
}

// Only an unambiguous, submitted starter is host-routed. Broader requests use
// the tool contract; quoted examples and an unsent composer never activate it.
function isInvoiceWorkspaceStart(message) {
  return typeof message === 'string' && /^(?:please\s+)?(?:(?:help me\s+)?(?:start|create|make|open))\s+(?:(?:a|an|new|blank)\s+){0,2}invoice(?:\s+(?:draft|workspace))?[.!]?$/i.test(message.trim());
}

module.exports = { METABLOOM_WORKSPACE_VERSION, MAX_METABLOOM_WORKSPACE_BODY_BYTES,
  MAX_METABLOOM_WORKSPACE_CONTEXT_BYTES, MAX_METABLOOM_WORKSPACE_EVENT_BYTES, METABLOOM_WORKSPACE_SAFE_FIELDS,
  parseMetabloomWorkspaceContext, parseMetabloomWorkspaceProposal, parseMetabloomWorkspaceReceipt,
  canonicalWorkspacePayload, isInvoiceWorkspaceStart };
