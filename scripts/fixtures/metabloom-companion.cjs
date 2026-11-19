// Fictional acceptance inputs, independent of the production editor state.
const messages = Object.freeze({
  start: 'Start an invoice draft.',
  explain: 'Explain how you will help with this invoice.',
  complete: 'Create an invoice from Demonstration Studio to Fictional Test Client dated 2026-11-19 in CAD. Website development dated 2026-11-19: 12 hours at 65, discount 0%, GST 5%, no PST. Design review dated 2026-11-19: 2 hours at 85, discount 0%, GST 5%, no PST.',
  conflict: 'Set the first line rate to 75.',
  quantity: 'Set the first line quantity to 10.',
  stop: 'Set the first line rate to 85.',
  revoked: 'Set the first line rate to 95.',
});
const privateNote = 'FICTIONAL-LOCAL-NOTE-DO-NOT-PROJECT';
const change = (field, value, sourceText = String(value)) => ({ field, value, sourceText });
function workspaceUpdate(message, context) {
  if (message === messages.complete) return {
    changes: [change('companyName', 'Demonstration Studio'), change('clientName', 'Fictional Test Client'),
      change('invoiceDate', '2026-11-19'), change('currency', 'CAD'), change('gstRate', '5', 'GST 5%')],
    lineChanges: [['Website development', '12', '65'], ['Design review', '2', '85']].map(([description, qty, cost]) => ({
      op: 'add', id: null, sourceText: description,
      changes: [change('description', description), change('date', '2026-11-19'), change('qty', qty), change('cost', cost),
        change('discount', '0', 'discount 0%'), change('gst', true, 'GST 5%'), change('pst', false, 'no PST')],
    })),
  };
  const id = context?.items[0]?.id;
  if (!id) throw new Error('Acceptance update requires an existing first invoice line');
  const values = new Map([[messages.conflict, '75'], [messages.stop, '85'], [messages.revoked, '95']]);
  const field = message === messages.quantity ? 'qty' : 'cost';
  const value = message === messages.quantity ? '10' : values.get(message);
  if (!value) throw new Error('Unexpected acceptance message');
  return { changes: [], lineChanges: [{ op: 'update', id, sourceText: 'first line', changes: [change(field, value)] }] };
}
function completedAnswer(text) {
  return { type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] };
}
function controlledReply() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
module.exports = { messages, privateNote, workspaceUpdate, completedAnswer, controlledReply };
