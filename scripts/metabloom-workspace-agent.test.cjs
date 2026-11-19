const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { METABLOOM_WORKSPACE_TOOLS, prepareMetabloomWorkspaceOperation } = require('../server/metabloomWorkspaceWorkflow');
const { canonicalWorkspacePayload, METABLOOM_WORKSPACE_SAFE_FIELDS } = require('../src/components/metabloomWorkspaceProtocol');
const { emptyInvoiceChatFields, emptyInvoiceChatLine } = require('../src/components/metabloomInvoiceDraft');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
const { buildMetabloomChatSystemPrompt } = require('../src/components/metabloomEmoteLibrary');
const { createMetabloomWorkspaceHandler } = require('../api/metabloom-workspace');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const env = { ...process.env }, originalFetch = global.fetch;
const envKeys = ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL_ENV', 'METABLOOM_WORKSPACE_ENABLED'];
const conversationId = '11111111-1111-4111-8111-111111111111';
const context = (extra = {}) => ({ version: 1, status: 'connected', conversationId, workspaceInstanceId: 'workspace-1',
  bindingEpoch: 3, dataRevision: 7, fields: Object.fromEntries(METABLOOM_WORKSPACE_SAFE_FIELDS.map(field => [field, emptyInvoiceChatFields()[field]])),
  items: [{ ...emptyInvoiceChatLine('a'.repeat(16)), description: 'Website development' }], missing: ['Sender company name'], ready: false, ...extra });
const available = () => context({ status: 'available', workspaceInstanceId: null, bindingEpoch: 0, dataRevision: 0, fields: {}, items: [], missing: [] });
const change = (field, value, sourceText = String(value)) => ({ field, value, sourceText });
const changes = () => ({ changes: [change('companyName', 'Demo Studio')], lineChanges: [] });
const prepare = (args = changes(), options = {}) => prepareMetabloomWorkspaceOperation({ name: 'update_invoice_workspace', args,
  context: context(), message: 'Sender Demo Studio', requestId: 'turn-1', conversationId, ...options });
const call = (name, args, id = 'workspace_1') => ({ type: 'function_call', status: 'completed', name, call_id: id, arguments: JSON.stringify(args) });
const answer = text => ({ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const base = { message: 'Sender Demo Studio', history: [], requestId: 'turn-1', conversationId, workspaceContext: context(), workspaceEnabled: true,
  identity: { owner: 'a'.repeat(64) }, accountIdentity: { accountKey: 'a'.repeat(64) } };
const response = () => Object.assign(new EventEmitter(), { body: '', headers: {}, setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const request = () => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
  'content-type': 'application/json', 'x-metabloom-toolset': '2', 'x-metabloom-workspace': '1' },
  socket: { remoteAddress: '127.0.0.1' }, body: { message: base.message, history: [], requestId: base.requestId, conversationId,
    workspaceContext: context(), actionMode: 'none', streamText: true } });
const records = res => res.body.trim().split('\n').map(JSON.parse);
beforeEach(() => {
  envKeys.slice(0, 3).forEach(key => { process.env[key] = 'fictional'; });
  process.env.VERCEL_ENV = 'development'; delete process.env.TYPESAFE_API_KEY; delete process.env.METABLOOM_WORKSPACE_ENABLED;
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity?.(base.identity); options.onAccountIdentity?.(base.accountIdentity); return null;
  });
  handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  envKeys.forEach(key => { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; });
});

test('operation identity, document binding and payload hash are host-owned and deterministic', () => {
  const operation = prepare(), retry = prepare();
  assert.deepEqual(operation, retry);
  assert.equal(operation.workspaceInstanceId, 'workspace-1'); assert.equal(operation.bindingEpoch, 3); assert.equal(operation.expectedDataRevision, 7);
  assert.equal(operation.payloadHash, createHash('sha256').update(canonicalWorkspacePayload(operation)).digest('hex'));
  assert.throws(() => prepare({ ...changes(), expectedDataRevision: 0 }), { code: 'invoice_workspace_invalid' });
  assert.throws(() => prepare(changes(), { conversationId: '22222222-2222-4222-8222-222222222222' }), { code: 'invoice_workspace_invalid' });
  assert.notEqual(prepare({ changes: [change('companyName', 'Other Studio')], lineChanges: [] }, { message: 'Other Studio' }).payloadHash, operation.payloadHash);
  assert.equal(prepare({ changes: [change('companyName', 'Other Studio')], lineChanges: [] }, { message: 'Other Studio' }).operationId, operation.operationId);
});
test('excluded fields, invented values, unsupported fields and historical evidence fail before a proposal', () => {
  for (const item of [change('notes', 'Payment canary'), change('total', '999'), change('companyName', 'Invented', 'Demo Studio'),
    change('gstRate', '5', 'PST 5%'), change('invoiceDate', '2026-02-30')])
    assert.throws(() => prepare({ changes: [item], lineChanges: [] }, { message: item.sourceText }), /invoice_workspace/);
  assert.throws(() => prepare(changes(), { message: 'Try again' }), { code: 'invoice_workspace_evidence_required' });
  const optedIn = context(); optedIn.fields.notes = '';
  assert.equal(prepare({ changes: [change('notes', 'Payment canary')], lineChanges: [] }, { context: optedIn, message: 'Payment canary' }).changes[0].field, 'notes');
});
test('line changes identify existing targets and never infer unknown prices or tax decisions', () => {
  const update = { changes: [], lineChanges: [{ op: 'update', id: 'a'.repeat(16),
    changes: [change('qty', '14', 'development 14 hours')], sourceText: 'development 14 hours' }] };
  assert.equal(prepare(update, { message: 'Make development 14 hours' }).lineChanges[0].id, 'a'.repeat(16));
  const ambiguous = context({ items: [...context().items, { ...emptyInvoiceChatLine('b'.repeat(16)), description: 'App development' }] });
  assert.throws(() => prepare(update, { message: 'Make development 14 hours', context: ambiguous }), { code: 'invoice_workspace_target_required' });
  update.lineChanges[0].sourceText = 'item 2 development 14 hours';
  assert.throws(() => prepare(update, { message: 'Change item 2 development 14 hours' }), { code: 'invoice_workspace_target_required' });
  const add = { changes: [], lineChanges: [{ op: 'add', id: null, sourceText: 'Design review', changes: [change('description', 'Design review')] }] };
  assert.deepEqual(prepare(add, { message: 'Design review' }).lineChanges[0].changes, [change('description', 'Design review')]);
  add.lineChanges[0].changes.push(change('cost', '0', 'Design review'));
  assert.throws(() => prepare(add, { message: 'Design review' }), { code: 'invoice_workspace_evidence_required' });
});
test('identical descriptions need an explicit item number for updates and removals', () => {
  const duplicate = context({ items: [...context().items, { ...context().items[0], id: 'b'.repeat(16) }] });
  const update = { changes: [], lineChanges: [{ op: 'update', id: 'a'.repeat(16),
    changes: [change('qty', '14', 'Website development 14 hours')], sourceText: 'Website development 14 hours' }] };
  assert.throws(() => prepare(update, { context: duplicate, message: 'Make Website development 14 hours' }), { code: 'invoice_workspace_target_required' });
  update.lineChanges[0].sourceText = 'item 1 Website development 14 hours';
  assert.equal(prepare(update, { context: duplicate, message: 'Make item 1 Website development 14 hours' }).lineChanges[0].id, 'a'.repeat(16));
  const remove = { changes: [], lineChanges: [{ op: 'remove', id: 'b'.repeat(16), changes: [], sourceText: 'Remove Website development' }] };
  assert.throws(() => prepare(remove, { context: duplicate, message: 'Remove Website development' }), { code: 'invoice_workspace_target_required' });
  remove.lineChanges[0].sourceText = 'Remove item 2 Website development';
  assert.equal(prepare(remove, { context: duplicate, message: 'Remove item 2 Website development' }).lineChanges[0].id, 'b'.repeat(16));
});
test('bounded ordinal line references identify targets and reject contradictory references', () => {
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
    'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
  const many = context({ items: ordinals.map((_, index) => ({ ...context().items[0], id: (index + 1).toString(16).padStart(16, '0') })) });
  const operation = (id, message) => ({ changes: [], lineChanges: [{ op: 'update', id,
    changes: [change('qty', '14', message)], sourceText: message }] });
  for (const [index, ordinal] of ordinals.entries()) {
    const number = index + 1, suffix = number === 1 ? 'st' : number === 2 ? 'nd' : number === 3 ? 'rd' : 'th';
    for (const label of [`${ordinal} line`, `${number}${suffix} item`]) {
      const message = `Set the ${label} quantity to 14.`;
      assert.equal(prepare(operation(many.items[index].id, message), { context: many, message }).lineChanges[0].id, many.items[index].id);
    }
  }
  for (const message of ['Set the first line, line 2 quantity to 14.', 'Set the first item and second line quantity to 14.',
    'Set the 21st line Website development quantity to 14.', 'Set the twenty-first line Website development quantity to 14.',
    'Set the twenty first line Website development quantity to 14.'])
    assert.throws(() => prepare(operation(many.items[0].id, message), { context: many, message }), { code: 'invoice_workspace_target_required' });
});
test('negated and quoted discussion cannot authorize edits through a shortened evidence excerpt', () => {
  const update = { changes: [change('clientName', 'Example Client')], lineChanges: [] };
  for (const message of ['Do not change the client to Example Client', "Don't update the client to Example Client",
    'Never set the client to Example Client', 'Do not automatically change the client to Example Client',
    'What happens if I say "Change the client to Example Client"?', 'Could you explain how to set the client to Example Client?',
    '"Change the client to Example Client"'])
    assert.throws(() => prepare(update, { message }), { code: 'invoice_workspace_evidence_required' });
  assert.equal(prepare(update, { message: 'Set the client to "Example Client"' }).changes[0].value, 'Example Client');
  const noTax = { changes: [], lineChanges: [{ op: 'update', id: 'a'.repeat(16),
    changes: [change('gst', false, 'no GST')], sourceText: 'item 1 has no GST' }] };
  assert.equal(prepare(noTax, { message: 'item 1 has no GST' }).lineChanges[0].changes[0].value, false);
  noTax.lineChanges[0].changes = [change('gst', false, 'no tax'), change('pst', false, 'no tax')];
  noTax.lineChanges[0].sourceText = 'item 1 has no tax';
  assert.equal(prepare(noTax, { message: 'item 1 has no tax' }).lineChanges[0].changes.length, 2);
});
test('opening and focusing require explicit current intent and never arbitrary navigation', () => {
  const open = { name: 'open_invoice_workspace', context: available(), message: 'Could you create an invoice for me?' };
  assert.equal(prepare({ sourceText: open.message }, open).command, 'open');
  assert.throws(() => prepare({ sourceText: 'open an invoice' }, { ...open, message: 'What happens if I say "open an invoice"?' }), /evidence_required/);
  assert.throws(() => prepare({ sourceText: 'open an invoice', url: 'https://example.com' }, { ...open, message: 'open an invoice' }), /evidence_required/);
  assert.equal(prepare({ section: 'taxes', sourceText: 'show me the GST fields' }, { name: 'focus_invoice_section', message: 'show me the GST fields' }).section, 'taxes');
  assert.throws(() => prepare({ section: 'notes', sourceText: 'show me the GST fields' }, { name: 'focus_invoice_section', message: 'show me the GST fields' }), /evidence_required/);
});
test('all three providers prepare the same typed operation under the shared lifecycle', async () => {
  const results = [];
  for (const provider of ['openai', 'deepseek', 'anthropic']) {
    const lifecycle = createMetabloomAgentLifecycle({ requireStatus: true }); let count = 0;
    const result = await runMetabloomAgent({ ...base, invoiceDraftsEnabled: true, modelSelection: { provider, model: 'fixture' },
      invoiceStore: { read: () => assert.fail('Connected page must not read competing Redis invoice') },
      onTool: event => assert(lifecycle.accept(event)), onStatus: event => assert(lifecycle.accept(event)),
      fetchImpl: async (_url, options) => {
        count++; const payload = JSON.parse(options.body);
        assert(payload.tools.some(tool => tool.name === 'update_invoice_workspace'));
        assert(!payload.tools.some(tool => ['create_invoice_draft', 'get_invoice_draft', 'open_invoice_workspace'].includes(tool.name)));
        const prompt = payload.instructions || payload.system;
        assert.match(prompt, /prepared result is not an applied edit/); assert.match(prompt, /actual private editor/);
        assert.doesNotMatch(prompt, /Chat invoice tools are unavailable/);
        return Response.json(provider === 'anthropic' ? { type: 'message', role: 'assistant', stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'workspace_1', name: 'update_invoice_workspace', input: changes() }] }
          : { status: 'completed', output: [call('update_invoice_workspace', changes())] });
      } });
    assert.equal(count, 1); assert.equal(lifecycle.canAnswer(), true);
    assert.match(result.reply.segments[0].response, /prepared/); assert.doesNotMatch(result.reply.segments[0].response, /updated|saved|applied successfully/i);
    results.push(result.workspaceProposal);
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
test('host starter opens only an available workspace and connected starter asks the next missing detail', async () => {
  const open = await runMetabloomAgent({ ...base, message: 'Start an invoice draft.', workspaceContext: available(), fetchImpl: () => assert.fail('No paid starter') });
  assert.equal(open.workspaceProposal.command, 'open');
  const read = await runMetabloomAgent({ ...base, message: 'Start an invoice draft.', fetchImpl: () => assert.fail('No paid starter') });
  assert.equal(read.workspaceProposal, undefined); assert.match(read.reply.segments[0].response, /Sender company name/);
});
test('missing identity, disabled capability and missing context never expose workspace tools', async () => {
  for (const override of [{ identity: undefined }, { accountIdentity: undefined }, { workspaceEnabled: false }, { workspaceContext: undefined }]) {
    const result = await runMetabloomAgent({ ...base, ...override, fetchImpl: async (_url, options) => {
      assert(!JSON.parse(options.body).tools.some(tool => /invoice_workspace/.test(tool.name)));
      return Response.json({ status: 'completed', output: [answer('Hello.')] });
    } }); assert.equal(result.workspaceProposal, undefined);
  }
});
test('failed arguments and cancellation never release a proposal or spend a repair call', async () => {
  let count = 0;
  const result = await runMetabloomAgent({ ...base, submittedMessage: 'Try again', fetchImpl: async () => {
    count++; return Response.json({ status: 'completed', output: [call('update_invoice_workspace', changes())] });
  } });
  assert.equal(count, 1); assert.equal(result.workspaceProposal, undefined); assert.match(result.reply.segments[0].response, /Nothing was applied/);
  const controller = new AbortController();
  await assert.rejects(runMetabloomAgent({ ...base, signal: controller.signal,
    fetchImpl: async () => Response.json({ status: 'completed', output: [call('update_invoice_workspace', changes())] }),
    onTool: event => { if (event.state === 'complete') controller.abort(); } }), { name: 'AbortError' });
});
test('provider batches select one invoice operation and cannot append two mutations', async () => {
  const result = await runMetabloomAgent({ ...base, fetchImpl: async () => Response.json({ status: 'completed', output: [
    call('get_invoice_workspace', {}, 'read'), call('update_invoice_workspace', changes(), 'update1'),
    call('update_invoice_workspace', { changes: [change('clientName', 'Other')], lineChanges: [] }, 'update2'),
  ] }) });
  assert.deepEqual(result.workspaceProposal.changes, changes().changes);
});
test('capability endpoint checks authentication before metadata and reflects server kill-switch', async () => {
  for (const flag of ['1', '0', 'false']) {
    process.env.METABLOOM_WORKSPACE_ENABLED = flag;
    const endpoint = createMetabloomWorkspaceHandler({ authenticate: async (_req, options) => { options.onAccountIdentity(base.accountIdentity); } });
    const res = response(); await endpoint({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200); assert.deepEqual(JSON.parse(res.body), { version: 1, enabled: flag === '1' });
    assert.match(res.headers['Cache-Control'], /no-store/);
  }
  for (const denial of [{ status: 401, code: 'authentication_required' }, { status: 403, code: 'origin_not_allowed' }]) {
    const endpoint = createMetabloomWorkspaceHandler({ authenticate: async () => denial }), res = response();
    await endpoint({ method: 'GET' }, res); assert.equal(res.statusCode, denial.status); assert(!res.body.includes('enabled'));
  }
});
test('negotiated API streams one proposal only after checked answer and successful tool', async () => {
  global.fetch = async () => Response.json({ status: 'completed', output: [call('update_invoice_workspace', changes())] });
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200); const events = records(res), proposal = events.findIndex(event => event.type === 'invoice_workspace');
  assert(proposal > events.findIndex(event => event.type === 'text_complete'));
  assert(proposal > events.findIndex(event => event.type === 'tool_activity' && event.state === 'complete'));
  assert.equal(events.filter(event => event.type === 'invoice_workspace').length, 1); assert.equal(events.at(-1).type, 'done');
});
test('legacy clients, invalid bindings and nonordinary modes reject workspace context before provider work', async () => {
  global.fetch = () => assert.fail('No paid work for invalid context');
  for (const mutate of [req => delete req.headers['x-metabloom-workspace'], req => { req.headers['x-metabloom-toolset'] = '1'; },
    req => { req.body.actionMode = 'deep-research'; }, req => { req.body.workspaceContext.conversationId = '22222222-2222-4222-8222-222222222222'; },
    req => { req.body.workspaceContext.fields.logoDataUrl = 'private'; }, req => { req.headers['content-length'] = '65537'; }]) {
    const req = request(), res = response(); mutate(req); await handler(req, res); assert.equal(res.statusCode, 400);
  }
  process.env.METABLOOM_WORKSPACE_ENABLED = '0'; const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 503); assert.equal(JSON.parse(res.body).code, 'workspace_unavailable');
});
test('larger body limit is negotiated only with a bounded workspace context', async () => {
  global.fetch = async () => Response.json({ status: 'completed', output: [call('get_invoice_workspace', {})] });
  const req = request(); req.body.history = Array.from({ length: 8 }, () => ({ role: 'assistant', content: 'x'.repeat(1900) }));
  req.body.workspaceContext.missing = Array.from({ length: 30 }, () => 'Field '.repeat(65));
  assert(Buffer.byteLength(JSON.stringify(req.body)) > 24000); assert(Buffer.byteLength(JSON.stringify(req.body)) < 65536);
  const res = response(); await handler(req, res); assert.equal(res.statusCode, 200); assert.equal(records(res).at(-1).type, 'done');
  delete req.body.workspaceContext;
  req.body.history = Array.from({ length: 12 }, () => ({ role: 'assistant', content: '界'.repeat(1000) }));
  const legacy = response(); await handler(req, legacy); assert.equal(legacy.statusCode, 400);
});
test('shared prompt never promises browser edits without applied receipts', () => {
  const prompt = buildMetabloomChatSystemPrompt({ invoiceWorkspaceEnabled: true });
  assert.match(prompt, /prepared result is not an applied edit/); assert.match(prompt, /Unknown prices and tax choices stay unknown/);
  assert.deepEqual(METABLOOM_WORKSPACE_TOOLS.map(tool => tool.name), ['open_invoice_workspace', 'get_invoice_workspace', 'update_invoice_workspace', 'focus_invoice_section']);
});
