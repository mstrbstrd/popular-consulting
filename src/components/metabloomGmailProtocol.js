const METABLOOM_GMAIL_VERSION = 1;
const MAX_GMAIL_LIST_RESULTS = 15;
const MAX_GMAIL_READ_PER_TURN = 3;
const MAX_GMAIL_BODY_CHARS = 4000;
const MAX_GMAIL_PROPOSAL_BYTES = 32768;

const GMAIL_COMMANDS = Object.freeze(['send', 'draft', 'organize', 'trash']);
const GMAIL_ORGANIZE_ACTIONS = Object.freeze([
  'archive',
  'mark_read',
  'mark_unread',
  'star',
  'unstar',
]);
const GMAIL_UNDO_ACTIONS = Object.freeze([
  'unarchive',
  'mark_unread',
  'mark_read',
  'unstar',
  'star',
]);
const GMAIL_RECEIPT_STATUSES = Object.freeze([
  'applied',
  'pending_confirmation',
  'duplicate',
  'rejected',
  'cancelled',
  'unavailable',
]);

const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && (() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value'));
  })());

const exact = (value, fields) => plain(value)
  && Reflect.ownKeys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));

const isDisallowedCodePoint = code => (
  code === 127
  || (code < 32 && code !== 9 && code !== 10 && code !== 13)
  || (code >= 0x80 && code <= 0x9f)
  || (code >= 0x202a && code <= 0x202e)
  || (code >= 0x2066 && code <= 0x2069)
);

const hasDisallowedControl = value => Array.from(value).some(char => isDisallowedCodePoint(char.codePointAt(0)));

const hasAnyControl = value => Array.from(value).some(char => {
  const code = char.codePointAt(0);
  return code < 32 || code === 127 || (code >= 0x80 && code <= 0x9f);
});

const safeText = (value, max, empty = false) => typeof value === 'string'
  && value.length <= max
  && (empty || value.trim().length > 0)
  && !hasDisallowedControl(value);

const safeSingleLineText = (value, max, empty = false) => typeof value === 'string'
  && value.length <= max
  && (empty || value.trim().length > 0)
  && !hasAnyControl(value)
  && !hasDisallowedControl(value);

const safeIdentifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const safeGmailId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);

const utf8ByteLength = json => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength;
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(json, 'utf8');
  return json.length * 4;
};

const withinBytes = (value, max) => {
  try { return utf8ByteLength(JSON.stringify(value)) <= max; }
  catch { return false; }
};

const deepCopy = value => JSON.parse(JSON.stringify(value));

const NAMED_HTML_ENTITIES = Object.freeze({
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
});

function decodeBasicHtmlEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (match, entity) => {
    const lower = entity.toLowerCase();
    if (Object.hasOwn(NAMED_HTML_ENTITIES, lower)) {
      return NAMED_HTML_ENTITIES[lower];
    }
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      if (Number.isSafeInteger(code) && code >= 0x20 && code <= 0x10ffff && code !== 127) {
        try { return String.fromCodePoint(code); } catch { return ''; }
      }
      return '';
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      if (Number.isSafeInteger(code) && code >= 0x20 && code <= 0x10ffff && code !== 127) {
        try { return String.fromCodePoint(code); } catch { return ''; }
      }
      return '';
    }
    return match;
  });
}

function sanitizeUntrustedEmailText(value, maxLength = MAX_GMAIL_BODY_CHARS) {
  if (typeof value !== 'string') return '';
  if (typeof maxLength === 'number' && maxLength <= 0) return '';
  const limit = Number.isSafeInteger(maxLength) && maxLength > 0 ? maxLength : MAX_GMAIL_BODY_CHARS;

  const boundedInput = value.length > Math.max(limit * 8, 65536)
    ? value.slice(0, Math.max(limit * 8, 65536))
    : value;

  let text = boundedInput
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(?:script|style)\b[\s\S]*$/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|blockquote|section|article|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeBasicHtmlEntities(text).replace(/\r\n?/g, '\n');

  let cleaned = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10)
      || (code >= 0x80 && code <= 0x9f)
      || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069)) {
      continue;
    }
    cleaned += char;
    if (cleaned.length >= limit * 2) break;
  }

  const collapsed = cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return collapsed.length > limit ? collapsed.slice(0, limit).trim() : collapsed;
}

function isValidEmailAddress(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 254) return false;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 32 || code >= 127) return false;
  }
  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (local.length < 1 || local.length > 64 || domain.length < 3 || domain.length > 253) {
    return false;
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[a-zA-Z0-9.!#$%&*+=?^_{|}~-]+$/.test(local)) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)) return false;
  }
  const tld = labels[labels.length - 1];
  return /^[a-zA-Z]{2,63}$/.test(tld);
}

function parseEmailAddressList(value, maxCount = 10) {
  if (!Number.isSafeInteger(maxCount) || maxCount < 1 || maxCount > 50) return null;

  let rawItems;
  if (typeof value === 'string') {
    if (hasAnyControl(value) || hasDisallowedControl(value)) return null;
    if (!value.trim()) return [];
    rawItems = value.split(',');
  } else if (Array.isArray(value)) {
    rawItems = value;
  } else {
    return null;
  }

  if (rawItems.length > maxCount) return null;

  const seen = new Set();
  const normalized = [];
  for (const item of rawItems) {
    if (typeof item !== 'string' || hasAnyControl(item) || hasDisallowedControl(item)) return null;
    const trimmed = item.trim();
    if (!isValidEmailAddress(trimmed)) return null;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function parseGmailProposal(value, expectedRequestId) {
  if (!exact(value, [
    'type',
    'version',
    'command',
    'requestId',
    'operationId',
    'conversationId',
    'requiresConfirmation',
    'messageId',
    'threadId',
    'inReplyTo',
    'to',
    'cc',
    'subject',
    'body',
    'sourceText',
    'payloadHash',
  ])) return null;

  if (value.type !== 'gmail_workspace'
    || value.version !== METABLOOM_GMAIL_VERSION
    || !['send', 'trash'].includes(value.command)
    || !safeIdentifier(value.requestId)
    || (expectedRequestId !== undefined && value.requestId !== expectedRequestId)
    || !safeIdentifier(value.operationId)
    || !safeIdentifier(value.conversationId)
    || value.requiresConfirmation !== true
    || (value.messageId !== null && !safeGmailId(value.messageId))
    || (value.threadId !== null && !safeGmailId(value.threadId))
    || (value.inReplyTo !== null && !safeSingleLineText(value.inReplyTo, 500))
    || !Array.isArray(value.to)
    || !Array.isArray(value.cc)
    || !safeSingleLineText(value.subject, 300, true)
    || !safeText(value.body, MAX_GMAIL_BODY_CHARS, true)
    || !safeText(value.sourceText, 1600)
    || typeof value.payloadHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.payloadHash)) {
    return null;
  }

  if (!value.to.every(isValidEmailAddress) || !value.cc.every(isValidEmailAddress)) return null;
  const to = parseEmailAddressList(value.to, 10);
  const cc = parseEmailAddressList(value.cc, 10);
  if (!to || !cc) return null;

  if (value.command === 'send') {
    if (to.length < 1 || !value.subject.trim() || !value.body.trim()) return null;
  } else if (value.command === 'trash') {
    if (!value.messageId) return null;
  }

  return withinBytes(value, MAX_GMAIL_PROPOSAL_BYTES) ? deepCopy(value) : null;
}

function parseGmailPreview(value) {
  if (value === null) return null;
  if (!plain(value)) return null;
  const allowedKeys = new Set(['to', 'cc', 'subject', 'snippet', 'from']);
  const keys = Object.keys(value);
  if (keys.some(key => !allowedKeys.has(key))) return null;

  const preview = {};
  if (Object.hasOwn(value, 'to')) {
    if (value.to === null) {
      preview.to = null;
    } else if (Array.isArray(value.to) && value.to.length <= 10
      && value.to.every(item => safeSingleLineText(item, 254))) {
      preview.to = value.to.map(item => item.trim());
    } else {
      return null;
    }
  }
  if (Object.hasOwn(value, 'cc')) {
    if (value.cc === null) {
      preview.cc = null;
    } else if (Array.isArray(value.cc) && value.cc.length <= 10
      && value.cc.every(item => safeSingleLineText(item, 254))) {
      preview.cc = value.cc.map(item => item.trim());
    } else {
      return null;
    }
  }
  if (Object.hasOwn(value, 'subject')) {
    if (value.subject !== null && !safeSingleLineText(value.subject, 300, true)) return null;
    preview.subject = value.subject;
  }
  if (Object.hasOwn(value, 'snippet')) {
    if (value.snippet !== null && !safeText(value.snippet, 600, true)) return null;
    preview.snippet = value.snippet;
  }
  if (Object.hasOwn(value, 'from')) {
    if (value.from !== null && !safeSingleLineText(value.from, 300, true)) return null;
    preview.from = value.from;
  }
  return preview;
}

function parseGmailReceipt(value) {
  if (!exact(value, [
    'version',
    'requestId',
    'operationId',
    'status',
    'command',
    'draftId',
    'messageId',
    'threadId',
    'undoAction',
    'requiresConfirmation',
    'message',
    'preview',
  ])) return null;

  if (value.version !== METABLOOM_GMAIL_VERSION
    || !safeIdentifier(value.requestId)
    || !safeIdentifier(value.operationId)
    || !GMAIL_RECEIPT_STATUSES.includes(value.status)
    || !GMAIL_COMMANDS.includes(value.command)
    || (value.draftId !== null && !safeGmailId(value.draftId))
    || (value.messageId !== null && !safeGmailId(value.messageId))
    || (value.threadId !== null && !safeGmailId(value.threadId))
    || (value.undoAction !== null && !GMAIL_UNDO_ACTIONS.includes(value.undoAction))
    || typeof value.requiresConfirmation !== 'boolean'
    || !safeText(value.message, 500)) {
    return null;
  }

  const preview = parseGmailPreview(value.preview);
  if (value.preview !== null && !preview) return null;

  return withinBytes(value, MAX_GMAIL_PROPOSAL_BYTES) ? deepCopy(value) : null;
}

function canonicalGmailPayload(proposal) {
  const sorted = value => (Array.isArray(value)
    ? value.map(sorted)
    : plain(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
      : value);
  const { payloadHash, ...payload } = proposal;
  return JSON.stringify(sorted(payload));
}

module.exports = {
  METABLOOM_GMAIL_VERSION,
  MAX_GMAIL_LIST_RESULTS,
  MAX_GMAIL_READ_PER_TURN,
  MAX_GMAIL_BODY_CHARS,
  MAX_GMAIL_PROPOSAL_BYTES,
  GMAIL_COMMANDS,
  GMAIL_ORGANIZE_ACTIONS,
  GMAIL_UNDO_ACTIONS,
  GMAIL_RECEIPT_STATUSES,
  sanitizeUntrustedEmailText,
  isValidEmailAddress,
  parseEmailAddressList,
  parseGmailProposal,
  parseGmailReceipt,
  canonicalGmailPayload,
};
