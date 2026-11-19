const { parseInvoiceDecimal, calculateInvoice, validateInvoice, normalizeInvoiceDraft, validDate } = require('../utils/invoiceCore');
const INVOICE_CHAT_NOTICE = 'Invoice draft only. Nothing has been sent, issued or marked paid. Details supplied in chat are processed by the selected provider and saved with your chat; existing local invoices are not read.';
const INVOICE_FIELDS = Object.freeze({
  companyName: { label: 'Sender company name', max: 120, required: true }, companyEmail: { label: 'Sender email', max: 160 },
  companyAddress: { label: 'Sender address', max: 400 }, companyWebsite: { label: 'Sender website', max: 160 },
  companyPhone: { label: 'Sender phone', max: 60 }, businessNumber: { label: 'Business number', max: 80 }, taxNumber: { label: 'Tax registration number', max: 80 },
  clientName: { label: 'Client name', max: 120, required: true }, clientAddress: { label: 'Client address', max: 400 },
  invoiceNumber: { label: 'Invoice number', max: 80, required: true }, invoiceDate: { label: 'Invoice date (YYYY-MM-DD)', max: 10, required: true },
  dueDate: { label: 'Due date (YYYY-MM-DD)', max: 10 }, currency: { label: 'Currency (CAD or USD)', max: 3, required: true },
  description: { label: 'Invoice description', max: 1000 }, notes: { label: 'Payment notes', max: 1500 },
  gstRate: { label: 'GST percentage', max: 24 }, pstRate: { label: 'PST percentage', max: 24 },
});
const INVOICE_LINE_FIELDS = Object.freeze({ date: { label: 'Service date (YYYY-MM-DD)', max: 10 },
  description: { label: 'Description', max: 500 }, qty: { label: 'Quantity', max: 24 }, cost: { label: 'Unit price', max: 24 },
  discount: { label: 'Discount percentage', max: 24 }, gst: { label: 'Apply GST', boolean: true }, pst: { label: 'Apply PST', boolean: true } });
const MAX_CHAT_INVOICE_LINES = 20;
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
function normalizeInvoiceChatValue(field, value, line = false) {
  const rule = (line ? INVOICE_LINE_FIELDS : INVOICE_FIELDS)[field];
  if (!rule) throw new Error('invoice_draft_invalid');
  if (value === null) return null;
  if (rule.boolean) { if (typeof value !== 'boolean') throw new Error('invoice_draft_invalid'); return value; }
  if (typeof value !== 'string' || value.length > rule.max || value !== value.trim()
    || Array.from(value).some(char => { const code = char.codePointAt(0); return code === 127 || (code < 32 && code !== 10); })) throw new Error('invoice_draft_invalid');
  if ((rule.required || line) && !value) throw new Error('invoice_draft_invalid');
  if (value && ['date', 'invoiceDate', 'dueDate'].includes(field) && !validDate(value)) throw new Error('invoice_draft_invalid');
  if (field === 'currency' && !['CAD', 'USD'].includes(value)) throw new Error('invoice_draft_invalid');
  if (field === 'companyEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('invoice_draft_invalid');
  if (['gstRate', 'pstRate', 'discount', 'qty', 'cost'].includes(field)) {
    const amount = parseInvoiceDecimal(value, field === 'qty' ? 3 : 2,
      ['gstRate', 'pstRate', 'discount'].includes(field) ? 10000 : field === 'qty' ? 1000000000 : 100000000000);
    if (field === 'qty' && amount === 0n) throw new Error('invoice_draft_invalid');
  }
  return value;
}
const emptyInvoiceChatFields = () => Object.fromEntries(Object.entries(INVOICE_FIELDS)
  .map(([key, rule]) => [key, rule.required || ['gstRate', 'pstRate'].includes(key) ? null : '']));
const emptyInvoiceChatLine = id => ({ id, date: null, description: null, qty: null, cost: null, discount: '0', gst: null, pst: null });
function parseMetabloomInvoiceDraft(value) {
  if (!exact(value, ['version', 'id', 'revision', 'updatedAt', 'fields', 'items']) || value.version !== 1
    || !/^[a-f0-9]{32}$/.test(value.id) || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision >= Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1 || !exact(value.fields, Object.keys(INVOICE_FIELDS))
    || !Array.isArray(value.items) || value.items.length > MAX_CHAT_INVOICE_LINES
    || new Set(value.items.map(item => item?.id)).size !== value.items.length) return null;
  try {
    for (const [field, text] of Object.entries(value.fields)) normalizeInvoiceChatValue(field, text);
    for (const item of value.items) {
      if (!exact(item, ['id', ...Object.keys(INVOICE_LINE_FIELDS)]) || !/^[a-f0-9]{16}$/.test(item.id)) return null;
      for (const field of Object.keys(INVOICE_LINE_FIELDS)) normalizeInvoiceChatValue(field, item[field], true);
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 48000) return null;
  } catch { return null; }
  return JSON.parse(JSON.stringify(value));
}
// This is the only mapping into the existing editor schema. No sender/client
// presets, imported totals, local saved drafts, or logos cross this boundary.
function materializeInvoiceDraft(draft) {
  return normalizeInvoiceDraft({ version: 1, ...Object.fromEntries(Object.entries(draft.fields).map(([key, value]) =>
    [key, value === null ? (['gstRate', 'pstRate'].includes(key) ? '0' : '') : value])), logoDataUrl: '',
  items: draft.items.map(({ id, ...item }) => ({ ...item })) });
}
function invoiceDraftView(draft) {
  const fields = draft?.fields || emptyInvoiceChatFields(), items = draft?.items || [], missing = [];
  for (const [field, rule] of Object.entries(INVOICE_FIELDS)) if (rule.required && field !== 'invoiceNumber' && fields[field] === null) missing.push(rule.label);
  if (!items.length) missing.push('At least one line item with description, service date, quantity and unit price');
  items.forEach((item, index) => { for (const [field, rule] of Object.entries(INVOICE_LINE_FIELDS))
    if (item[field] === null) missing.push(`Item ${index + 1}: ${rule.label}${rule.boolean ? ' (yes or no)' : ''}`); });
  for (const tax of ['gst', 'pst']) if (items.some(item => item[tax] === true) && fields[`${tax}Rate`] === null) missing.push(INVOICE_FIELDS[`${tax}Rate`].label);
  let invoice = null, calculation = null;
  if (draft && !missing.length) {
    try { invoice = materializeInvoiceDraft(draft); missing.push(...validateInvoice(invoice)); if (!missing.length) calculation = calculateInvoice(invoice); }
    catch { missing.push('The combined invoice exceeds the supported calculation limits. Review its amounts.'); }
  }
  return { revision: draft?.revision || 0, fields, items, missing, ready: Boolean(draft && !missing.length),
    nextQuestion: missing.length ? `Please provide ${missing[0]}.` : null, invoice: missing.length ? null : invoice, calculation };
}
function invoiceForHandoff(draft) {
  if (!parseMetabloomInvoiceDraft(draft)) throw new Error('The chat invoice is invalid.');
  const view = invoiceDraftView(draft); if (!view.ready) throw new Error('Complete the missing invoice details in chat first.');
  return view.invoice;
}
function buildInvoiceDraftVisual(draft) {
  if (!parseMetabloomInvoiceDraft(draft)) throw new Error('invoice_draft_invalid');
  return { version: '1', designVersion: 'aetheris-1', kind: 'invoice-draft', title: 'Invoice draft', summary: INVOICE_CHAT_NOTICE,
    provenance: { type: 'user', label: 'Your supplied invoice details. Totals calculated by the invoice engine.', sourceIds: [] }, invoiceDraft: draft };
}
module.exports = { INVOICE_CHAT_NOTICE, INVOICE_FIELDS, INVOICE_LINE_FIELDS, MAX_CHAT_INVOICE_LINES, exact,
  normalizeInvoiceChatValue, emptyInvoiceChatFields, emptyInvoiceChatLine, parseMetabloomInvoiceDraft, invoiceDraftView, invoiceForHandoff, buildInvoiceDraftVisual };
