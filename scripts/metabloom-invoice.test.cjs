const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMetabloomInvoiceStore } = require('../server/metabloomInvoiceWorkflow');
const { invoiceDraftView, invoiceForHandoff, parseMetabloomInvoiceDraft, buildInvoiceDraftVisual } = require('../src/components/metabloomInvoiceDraft');
const { calculateInvoice } = require('../src/utils/invoiceCore');
const { invoiceChatDraft, invoiceChatUpdate, invoiceChatMessage, change } = require('../src/testHelpers/invoiceChatFixtures');
const { identity, conversationId, otherConversationId, boomDatabase } = require('./fixtures/metabloom-boom-request.cjs');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
const { parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const env = { ...process.env };
beforeEach(() => { for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']) process.env[key] = 'fictional'; process.env.METABLOOM_VISUALS_ENABLED = 'true'; });
afterEach(() => { for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'METABLOOM_VISUALS_ENABLED', 'METABLOOM_INVOICE_ENABLED']) {
  if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
} });
const update = (changes = {}, revision = 0, id = 'a'.repeat(64)) => ({ ...invoiceChatUpdate(), ...changes, expectedRevision: revision, requestId: id });
const save = store => store.update(identity, conversationId, update(), { message: invoiceChatMessage });
const base = { message: invoiceChatMessage, history: [], accountIdentity: identity, identity: { owner: 'test' }, conversationId,
  requestId: 'invoice-test', invoiceDraftsEnabled: true, visualsAvailable: true };
const call = (name, args, id = 'invoice_1') => ({ type: 'function_call', name, call_id: id, arguments: JSON.stringify(args), status: 'completed' });
const provider = (name, args) => async () => Response.json({ status: 'completed', output: [call(name, args)] });

test('shared engine produces identical editor and chat totals; unknown taxes and prices block handoff', () => {
  const draft = invoiceChatDraft(), view = invoiceDraftView(draft);
  assert.equal(view.ready, true); assert.equal(view.calculation.total, 81900);
  assert.deepEqual(view.calculation, calculateInvoice(invoiceForHandoff(draft)));
  for (const field of ['qty', 'cost', 'date', 'gst', 'pst', 'description']) {
    const partial = invoiceChatDraft(); partial.items[0][field] = null;
    assert.equal(invoiceDraftView(partial).ready, false); assert.throws(() => invoiceForHandoff(partial), /Complete/);
  }
  draft.fields.gstRate = null; assert.equal(invoiceDraftView(draft).ready, false);
});
test('intake uses production Redis transport, isolates account/chat and preserves number/id on revisions and retries', async () => {
  const database = boomDatabase(), store = createMetabloomInvoiceStore(database);
  const first = await save(store), retry = await save(store);
  assert.deepEqual(first, retry); assert.equal(first.items.length, 1);
  assert.equal(await store.read(identity, otherConversationId), null);
  assert.equal(await store.read({ accountKey: 'b'.repeat(64) }, conversationId), null);
  const next = await store.update(identity, conversationId, update({ changes: [], lineChanges: [{ action: 'update', id: first.items[0].id,
    sourceText: '14 hours', changes: [change('qty', '14', '14 hours')] }] }, 1, 'b'.repeat(64)), { message: 'Change item 1 to 14 hours' });
  assert.equal(next.id, first.id); assert.equal(next.fields.invoiceNumber, first.fields.invoiceNumber);
  assert.equal(next.items[0].id, first.items[0].id); assert.equal(next.items[0].qty, '14'); assert.equal(next.items.length, 1);
  assert(database.calls.every(args => args[0] === 'EVAL'));
  await assert.rejects(store.update(identity, conversationId, update({}, 0, 'c'.repeat(64)), { message: invoiceChatMessage }), { code: 'invoice_draft_conflict' });
});
test('invalid or invented changes fail atomically, without saving partial invoices', async () => {
  for (const bad of [change('currency', 'USD', 'CAD'), change('gstRate', '7', 'GST 5%'), change('total', '10'),
    change('invoiceDate', '2026-02-30'), change('companyEmail', 'not-an-email')]) {
    const store = createMetabloomInvoiceStore(boomDatabase());
    await assert.rejects(store.update(identity, conversationId, update({ changes: [change('companyName', 'Demo Studio'), bad] }),
      { message: invoiceChatMessage + ' ' + bad.sourceText }), error => ['invoice_draft_invalid', 'invoice_draft_evidence_required'].includes(error.code));
    assert.equal(await store.read(identity, conversationId), null);
  }
});
test('line removal requires an explicit matching instruction and never changes other items', async () => {
  const store = createMetabloomInvoiceStore(boomDatabase()), first = await save(store);
  const operation = { action: 'remove', id: first.items[0].id, changes: [], sourceText: 'Remove item 2' };
  await assert.rejects(store.update(identity, conversationId, update({ changes: [], lineChanges: [operation] }, 1, 'b'.repeat(64)),
    { message: 'Remove item 2' }), { code: 'invoice_draft_evidence_required' });
  const next = await store.update(identity, conversationId, update({ changes: [], lineChanges: [{ ...operation, sourceText: 'Remove item 1' }] }, 1, 'c'.repeat(64)), { message: 'Remove item 1' });
  assert.equal(next.items.length, 0); assert.equal(invoiceDraftView(next).ready, false);
});
test('draft and card schemas reject totals, local logos, unsupported currency and arithmetic overflow', () => {
  assert(parseMetabloomVisual(buildInvoiceDraftVisual(invoiceChatDraft())));
  for (const mutate of [value => { value.total = 0; }, value => { value.fields.logoDataUrl = 'secret'; }, value => { value.fields.currency = 'EUR'; }]) {
    const value = invoiceChatDraft(); mutate(value); assert.equal(parseMetabloomInvoiceDraft(value), null);
  }
  const overflow = invoiceChatDraft(); overflow.items[0].qty = '1000000'; overflow.items[0].cost = '1000000';
  assert.equal(invoiceDraftView(overflow).ready, false); assert.throws(() => invoiceForHandoff(overflow));
});
test('all providers use one typed operation, host calculations and the shared progress lifecycle', async () => {
  const replies = [];
  for (const selected of ['openai', 'deepseek', 'anthropic']) {
    const store = createMetabloomInvoiceStore(boomDatabase()), lifecycle = createMetabloomAgentLifecycle({ requireStatus: true });
    let count = 0, spec; const states = [];
    const result = await runMetabloomAgent({ ...base, invoiceStore: store, modelSelection: { provider: selected, model: 'fixture' },
      visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind, context) => {
        assert.equal(kind, 'invoice-draft'); spec = context.hostInvoiceDraft; return { kind, id: 'fixture' };
      } }, onTool: event => { states.push(event.state); assert(lifecycle.accept(event)); }, onStatus: event => assert(lifecycle.accept(event)),
      fetchImpl: async (_url, options) => {
        count++; const payload = JSON.parse(options.body); assert(payload.tools.some(tool => tool.name === 'create_invoice_draft'));
        assert(!payload.tools.some(tool => /send|print|publish|pay/.test(tool.name)));
        return Response.json(selected === 'anthropic' ? { type: 'message', role: 'assistant', stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'invoice_1', name: 'create_invoice_draft', input: invoiceChatUpdate() }] }
          : { status: 'completed', output: [call('create_invoice_draft', invoiceChatUpdate())] });
      } });
    assert.equal(count, 1); assert.deepEqual(states, ['running', 'complete']);
    assert.equal(invoiceDraftView(spec.invoiceDraft).calculation.total, 81900); assert.match(result.reply.segments[0].response, /ready for review/);
    assert(!result.reply.segments[0].response.includes('819')); replies.push(result.reply);
  }
  assert.deepEqual(replies[0], replies[1]); assert.deepEqual(replies[1], replies[2]);
});
test('documented entry is host-routed, partial intake asks fixed questions, and mixed batches cannot replace the invoice card', async () => {
  const store = createMetabloomInvoiceStore(boomDatabase());
  const start = await runMetabloomAgent({ ...base, message: 'Start an invoice draft.', invoiceStore: store, fetchImpl: () => assert.fail('Host entry') });
  assert.match(start.reply.segments[0].response, /Sender company name/);
  const result = await runMetabloomAgent({ ...base, invoiceStore: store,
    visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind) => ({ kind, id: 'fixture' }) },
    fetchImpl: async () => Response.json({ status: 'completed', output: [call('get_invoice_draft', {}, 'read'),
      call('create_visual', { kind: 'table', brief: 'Fake totals' }, 'visual'), call('create_invoice_draft', invoiceChatUpdate())] }) });
  assert.equal(result.offer.kind, 'invoice-draft'); assert.equal((await store.read(identity, conversationId)).revision, 1);
});
test('missing negotiation, identity or conversation never exposes invoice tools or reads drafts', async () => {
  for (const override of [{ invoiceDraftsEnabled: false }, { accountIdentity: undefined }, { conversationId: undefined }]) {
    await runMetabloomAgent({ ...base, ...override, invoiceStore: { read: () => assert.fail('No lookup') }, fetchImpl: async (_url, options) => {
      assert(!JSON.parse(options.body).tools.some(tool => tool.name.includes('invoice')));
      return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
        text: JSON.stringify({ version: '2.0.0', segments: [{ response: 'Hello.' }] }) }] }] });
    } });
  }
});
test('expanded history is not evidence; lost storage confirmation cannot claim success; cancellation emits no late result', async () => {
  const store = createMetabloomInvoiceStore(boomDatabase());
  const result = await runMetabloomAgent({ ...base, submittedMessage: 'Try again', invoiceStore: store, fetchImpl: provider('create_invoice_draft', invoiceChatUpdate()) });
  assert.match(result.reply.segments[0].response, /None of these changes were saved/); assert.equal(await store.read(identity, conversationId), null);
  const offline = await runMetabloomAgent({ ...base, invoiceStore: { read: async () => { throw new Error('private'); }, update: async () => { throw new Error('private'); } },
    fetchImpl: provider('create_invoice_draft', invoiceChatUpdate()) });
  assert.match(offline.reply.segments[0].response, /could not be confirmed/); assert(!offline.reply.segments[0].response.includes('private'));
  const controller = new AbortController(), events = [];
  await assert.rejects(runMetabloomAgent({ ...base, invoiceStore: store, signal: controller.signal, fetchImpl: provider('get_invoice_draft', {}),
    onTool: event => { events.push(event.state); controller.abort(); } }), { name: 'AbortError' }); assert.deepEqual(events, ['running']);
});
test('native invoice cards bypass the model builder and require feature and client negotiation', async () => {
  for (const variant of ['ready', 'legacy', 'missing', 'wrong-kind', 'disabled']) {
    process.env.METABLOOM_INVOICE_ENABLED = variant === 'disabled' ? 'false' : 'true';
    const handler = createMetabloomVisualHandler({ authenticate: async (_request, options) => { options.onIdentity({ owner: 'test' }); },
      generate: () => assert.fail('No rewriting by a model'), store: { claim: async () => ({ offer: { kind: variant === 'wrong-kind' ? 'table' : 'invoice-draft' },
        context: { sources: [], ...(variant === 'missing' ? {} : { hostInvoiceDraft: buildInvoiceDraftVisual(invoiceChatDraft()) }) } }), complete: async () => {} } });
    const response = Object.assign(new EventEmitter(), { setHeader() {}, end(text) { this.body = JSON.parse(text); this.writableEnded = true; } });
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', ...(variant === 'legacy' ? {} : { 'x-metabloom-invoice': '1' }) },
      body: { id: 'a'.repeat(48), version: '1', designVersion: 'aetheris-1' } }, response);
    assert.equal(response.statusCode, variant === 'ready' ? 200 : ['legacy', 'disabled'].includes(variant) ? 503 : 502);
  }
});


test('matching retries racing between receipt and draft reads return the original invoice', async () => {
  const database = boomDatabase(), store = createMetabloomInvoiceStore(database);
  const first = await save(store); let hidden = false;
  const racing = createMetabloomInvoiceStore({ ...database, command: async (args, options) => {
    if (!hidden && args[2] === '1' && args[3].includes(':update:')) { hidden = true; return null; }
    return database.command(args, options);
  } });
  assert.deepEqual(await save(racing), first);
  assert.equal((await store.read(identity, conversationId)).revision, 1);
});
test('a repeated request cannot append duplicate lines when the provider changes its arguments', async () => {
  const store = createMetabloomInvoiceStore(boomDatabase());
  const visualStore = { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind) => ({ kind, id: 'fixture' }) };
  await runMetabloomAgent({ ...base, invoiceStore: store, visualStore, fetchImpl: provider('create_invoice_draft', invoiceChatUpdate()) });
  const retry = await runMetabloomAgent({ ...base, invoiceStore: store, visualStore,
    fetchImpl: provider('create_invoice_draft', { ...invoiceChatUpdate(), expectedRevision: 1 }) });
  assert.match(retry.reply.segments[0].response, /changed in another turn/);
  const draft = await store.read(identity, conversationId); assert.equal(draft.revision, 1); assert.equal(draft.items.length, 1);
});
