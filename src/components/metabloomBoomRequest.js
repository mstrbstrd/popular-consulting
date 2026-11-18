// Product-owned intake contract, mirrored from DY's BoomSystemQuoteClientDTO.
// A quote request is not a price, engineering approval, or external submission.
const METABLOOM_BOOM_REQUEST_URL = 'https://shop.dyconcretepumps.com/boom-system-request';
const METABLOOM_BOOM_REQUEST_NOTICE = 'Product demo only. Not submitted to DY. Pricing, availability and equipment compatibility require review by DY’s team.';
const METABLOOM_BOOM_FIELDS = Object.freeze({
  market: { label: 'Market', required: true, max: 2, options: ['US', 'CA'], question: 'Is this request for the US or Canada?' },
  firstName: { label: 'First name', required: true, max: 60, question: 'What is the contact’s first name? You can use fictional contact details for this demo.' },
  lastName: { label: 'Last name', required: true, max: 60, question: 'What is the contact’s last name?' },
  companyName: { label: 'Company', required: true, max: 120, question: 'What company is this request for?' },
  email: { label: 'Email', required: true, max: 254, question: 'What email should be listed on the request? Use a fictional address for a demo customer.' },
  phoneNumber: { label: 'Phone', required: true, max: 30, question: 'What phone number should be listed on the request?' },
  pumpMake: { label: 'Pump make', required: true, max: 80, question: 'What is the pump make?' },
  pumpModel: { label: 'Pump model', required: true, max: 80, question: 'What is the pump model?' },
  serialNumber: { label: 'Serial number', required: true, max: 100, question: 'What is the pump’s serial number? It is required to complete the request; unknown stays unresolved.' },
  hardness: { label: 'Pipe wall', required: true, max: 11, options: ['Single Wall', 'Twin Wall'], question: 'Do you need Single Wall or Twin Wall pipe?' },
  backEnd: { label: 'Back end', required: true, max: 3, options: ['Yes', 'No'], question: 'Should the request include the back end: Yes or No?' },
  boomPipe: { label: 'Boom pipe details', required: false, max: 2000, question: 'Optionally add boom pipe lengths and quantities.' },
  deckPipe: { label: 'Deck pipe details', required: false, max: 2000, question: 'Optionally add deck pipe lengths, quantities and connection details.' },
});
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const cleanText = (text, max) => typeof text === 'string' && text.trim() === text && text.length > 0 && text.length <= max
  && Array.from(text).every(char => { const code = char.codePointAt(0); return code !== 127 && (code > 31 || code === 10); });
const normalizeBoomValue = (field, value) => {
  const rule = METABLOOM_BOOM_FIELDS[field];
  if (!rule || (value !== null && !cleanText(value, rule.max))) throw new Error('boom_request_invalid');
  if (value === null) return null;
  if (rule.options && !rule.options.includes(value)) throw new Error('boom_request_invalid');
  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('boom_request_invalid');
  if (field === 'phoneNumber' && (!/^[+\d() .-]+$/.test(value) || value.replace(/\D/g, '').length < 7
    || value.replace(/\D/g, '').length > 15)) throw new Error('boom_request_invalid');
  if (rule.required && /^(?:unknown|unsure|tbd|n\/?a|not sure|not known|not provided|not available|pending|none)$/i.test(value)) throw new Error('boom_request_invalid');
  return value;
};
const emptyBoomFields = () => Object.fromEntries(Object.keys(METABLOOM_BOOM_FIELDS).map(field => [field, null]));
function parseMetabloomBoomDraft(value) {
  if (!exact(value, ['version', 'revision', 'updatedAt', 'fields']) || value.version !== 1
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision >= Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1
    || !exact(value.fields, Object.keys(METABLOOM_BOOM_FIELDS))) return null;
  try { for (const [field, text] of Object.entries(value.fields)) normalizeBoomValue(field, text); }
  catch { return null; }
  return JSON.parse(JSON.stringify(value));
}
function boomRequestView(draft) {
  const fields = draft?.fields || emptyBoomFields();
  const missing = Object.keys(METABLOOM_BOOM_FIELDS).filter(field => METABLOOM_BOOM_FIELDS[field].required && fields[field] === null);
  return { revision: draft?.revision || 0, fields, missing, ready: missing.length === 0,
    nextQuestion: missing.length ? METABLOOM_BOOM_FIELDS[missing[0]].question : null };
}
function buildBoomRequestVisual(draft) {
  if (!parseMetabloomBoomDraft(draft)) throw new Error('boom_request_invalid');
  return { version: '1', designVersion: 'aetheris-1', kind: 'boom-request', title: 'Boom system quote request',
    summary: METABLOOM_BOOM_REQUEST_NOTICE, provenance: { type: 'user', label: 'Customer-supplied intake details. No prices or compatibility checks.', sourceIds: [] },
    boomRequest: draft };
}
function boomRequestDownload(draft) {
  if (!parseMetabloomBoomDraft(draft) || !boomRequestView(draft).ready) throw new Error('boom_request_incomplete');
  return ['BOOM SYSTEM QUOTE REQUEST | PRODUCT DEMO', METABLOOM_BOOM_REQUEST_NOTICE, `Draft revision: ${draft.revision}`, '',
    ...Object.entries(METABLOOM_BOOM_FIELDS).map(([field, rule]) => `${rule.label}: ${draft.fields[field] ?? 'Not provided (optional)'}`), '',
    'Schematic: No file attached in this chat demo. The DY form accepts one optional PDF, PNG, JPG or JPEG up to 5 MB.',
    `To make a real request, review and submit through: ${METABLOOM_BOOM_REQUEST_URL}`].join('\n');
}
module.exports = { METABLOOM_BOOM_FIELDS, METABLOOM_BOOM_REQUEST_URL, METABLOOM_BOOM_REQUEST_NOTICE,
  normalizeBoomValue, emptyBoomFields, parseMetabloomBoomDraft, boomRequestView, buildBoomRequestVisual, boomRequestDownload };
