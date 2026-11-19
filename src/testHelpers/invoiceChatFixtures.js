const { emptyInvoiceChatFields } = require('../components/metabloomInvoiceDraft');
const invoiceChatDraft = () => ({ version: 1, id: 'd'.repeat(32), revision: 1, updatedAt: 1000,
  fields: { ...emptyInvoiceChatFields(), companyName: 'Demo Studio', clientName: 'Fictional Client', invoiceNumber: 'DEMO-001',
    invoiceDate: '2026-11-19', currency: 'CAD', gstRate: '5' },
  items: [{ id: 'e'.repeat(16), date: '2026-11-19', description: 'Development work', qty: '12', cost: '65', discount: '0', gst: true, pst: false }] });
const change = (field, value, sourceText = String(value)) => ({ field, value, sourceText });
const invoiceChatUpdate = () => ({ expectedRevision: 0,
  changes: Object.entries(invoiceChatDraft().fields).filter(([key, value]) => value && key !== 'invoiceNumber').map(([key, value]) => change(key, value)),
  lineChanges: [{ action: 'add', id: '', sourceText: 'Development work', changes: [
    change('description', 'Development work'), change('date', '2026-11-19'), change('qty', '12'), change('cost', '65'),
    change('gst', true, 'GST 5%'), change('pst', false, 'no PST'),
  ] }],
});
const invoiceChatMessage = 'Create an invoice from Demo Studio to Fictional Client, invoice date 2026-11-19, CAD. Development work on 2026-11-19: 12 hours at 65, GST 5%, no PST.';
module.exports = { invoiceChatDraft, invoiceChatUpdate, invoiceChatMessage, change };
