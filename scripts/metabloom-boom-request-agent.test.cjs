const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { createMetabloomBoomRequestStore } = require('../server/metabloomBoomRequestWorkflow');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
const { buildBoomRequestVisual } = require('../src/components/metabloomBoomRequest');
const { identity, conversationId, fields, changesFor, messageFor, draft, boomDatabase } = require('./fixtures/metabloom-boom-request.cjs');
const env = { ...process.env };
beforeEach(() => { process.env.OPENAI_API_KEY = 'fictional'; process.env.DEEPSEEK_API_KEY = 'fictional'; process.env.ANTHROPIC_API_KEY = 'fictional'; process.env.METABLOOM_VISUALS_ENABLED = 'true'; });
afterEach(() => { for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'METABLOOM_VISUALS_ENABLED', 'METABLOOM_BOOM_REQUEST_ENABLED']) {
  if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
} });
const call = (name, args) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'boom_1', status: 'completed' });
const base = { message: 'Start a boom system quote demo.', history: [], identity: { owner: 'session' }, accountIdentity: identity,
  conversationId, requestId: 'boom-test', boomRequestsEnabled: true, visualsAvailable: true };
const provider = (name, args, inspect = () => {}) => async (_url, options) => { inspect(JSON.parse(options.body)); return Response.json({ status: 'completed', output: [call(name, args)] }); };

test('three providers produce identical saved intake and host review cards without a second model call', async () => {
  const replies = [];
  for (const selected of ['openai', 'deepseek', 'anthropic']) {
    const store = createMetabloomBoomRequestStore(boomDatabase(), { now: () => 1000 });
    const lifecycle = createMetabloomAgentLifecycle({ requireStatus: true }), events = []; let context, count = 0;
    const args = { expectedRevision: 0, changes: changesFor(fields()) };
    const result = await runMetabloomAgent({ ...base, message: messageFor(fields()), boomRequestStore: store,
      modelSelection: { provider: selected, model: 'fixture-model' },
      visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind, value) => {
        assert.equal(kind, 'boom-request'); context = value; return { kind, id: 'fixture' };
      } }, onTool: event => { events.push(event.state); assert(lifecycle.accept(event)); }, onStatus: event => assert(lifecycle.accept(event)),
      fetchImpl: async (_url, options) => {
        count++; const payload = JSON.parse(options.body); assert(payload.tools.some(tool => tool.name === 'update_boom_quote_request'));
        assert(!payload.tools.some(tool => /submit|send|publish/.test(tool.name)));
        return Response.json(selected === 'anthropic' ? { type: 'message', role: 'assistant', stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'boom_1', name: 'update_boom_quote_request', input: args }] }
          : { status: 'completed', output: [call('update_boom_quote_request', args)] });
      } });
    assert.equal(count, 1); assert.deepEqual(events, ['running', 'complete']);
    assert.deepEqual(context.hostBoomRequest.boomRequest, draft());
    assert.match(result.reply.segments[0].response, /required intake is complete/); replies.push(result.reply);
  }
  assert.deepEqual(replies[0], replies[1]); assert.deepEqual(replies[1], replies[2]);
});
test('partial intake asks the next fixed question without spending visual quota', async () => {
  const result = await runMetabloomAgent({ ...base, message: 'Canada', boomRequestStore: createMetabloomBoomRequestStore(boomDatabase()),
    visualStore: { claimStart: () => assert.fail('Partial updates do not generate cards') },
    fetchImpl: provider('update_boom_quote_request', { expectedRevision: 0, changes: [{ field: 'market', value: 'CA', sourceText: 'Canada' }] }) });
  assert.equal(result.offer, null); assert.match(result.reply.segments[0].response, /first name/);
  assert(!result.reply.segments[0].response.includes('could not be queued'));
});
test('a fresh turn resumes stored values without trusting truncated history', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase());
  await store.update(identity, conversationId, { expectedRevision: 0, requestId: 'a'.repeat(64), changes: changesFor({ market: 'CA' }) }, { message: 'CA' });
  const result = await runMetabloomAgent({ ...base, visualsAvailable: false, boomRequestStore: store, history: [],
    fetchImpl: provider('get_boom_quote_request', {}, payload => assert.match(payload.instructions, /"market":"CA"/)) });
  assert.match(result.reply.segments[0].response, /first name/); assert.match(result.reply.segments[0].response, /saved draft is still available/);
});
test('failed validation and storage emit failure and never claim a save', async () => {
  for (const offline of [false, true]) {
    const events = [];
    const result = await runMetabloomAgent({ ...base, message: 'Canada',
      boomRequestStore: offline ? { read: async () => { throw new Error('Private detail'); }, update: async () => { throw new Error('Private detail'); } }
        : createMetabloomBoomRequestStore(boomDatabase()),
      fetchImpl: provider('update_boom_quote_request', { expectedRevision: 0, changes: [{ field: 'market', value: 'US', sourceText: 'Canada' }] }),
      onTool: event => events.push(event.state) });
    assert.deepEqual(events, ['running', 'failed']); assert.equal(result.offer, null);
    assert(!result.reply.segments[0].response.includes('have been saved')); assert(!result.reply.segments[0].response.includes('Private detail'));
  }
});
test('legacy, disabled and missing-conversation clients have no intake tools or lookup', async () => {
  for (const override of [{ boomRequestsEnabled: false }, { accountIdentity: undefined }, { conversationId: undefined }]) {
    await runMetabloomAgent({ ...base, ...override, boomRequestStore: { read: () => assert.fail('No lookup') },
      fetchImpl: async (_url, options) => {
        assert(!JSON.parse(options.body).tools.some(tool => /boom_quote/.test(tool.name)));
        return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify({ version: '2.0.0', segments: [{ response: 'Hello.' }] }) }] }] });
      } });
  }
});
test('cancellation during intake never emits completion or a late answer', async () => {
  const controller = new AbortController(), events = [];
  await assert.rejects(runMetabloomAgent({ ...base, signal: controller.signal, boomRequestStore: createMetabloomBoomRequestStore(boomDatabase()),
    fetchImpl: provider('get_boom_quote_request', {}), onTool: event => { events.push(event.state); controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(events, ['running']);
});
test('visual endpoint uses only the server-built request and rejects legacy or mismatched cards', async () => {
  for (const variant of ['ready', 'legacy', 'wrong-kind', 'no-host-data', 'disabled']) {
    process.env.METABLOOM_BOOM_REQUEST_ENABLED = variant === 'disabled' ? 'false' : 'true';
    let completed;
    const handler = createMetabloomVisualHandler({ authenticate: async (_req, options) => { options.onIdentity({ owner: 'test' }); },
      generate: () => assert.fail('A model must never rewrite request details'), store: {
        claim: async () => ({ offer: { kind: variant === 'wrong-kind' ? 'table' : 'boom-request' }, context: {
          ...(variant === 'no-host-data' ? {} : { hostBoomRequest: buildBoomRequestVisual(draft()) }), sources: [] } }),
        complete: async (_owner, _id, value) => { completed = value; },
      } });
    const res = Object.assign(new EventEmitter(), { setHeader() {}, end(value) { this.body = JSON.parse(value); this.writableEnded = true; } });
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', ...(variant === 'legacy' ? {} : { 'x-metabloom-boom-request': '1' }) },
      body: { id: 'a'.repeat(48), version: '1', designVersion: 'aetheris-1' } }, res);
    assert.equal(res.statusCode, variant === 'ready' ? 200 : ['legacy', 'disabled'].includes(variant) ? 503 : 502);
    assert.equal(completed.status, variant === 'ready' ? 'ready' : 'failed');
    if (variant === 'ready') assert.deepEqual(res.body.spec.boomRequest, draft());
  }
});


test('the documented entry phrase starts intake without relying on model tool choice', async () => {
  const result = await runMetabloomAgent({ ...base, boomRequestStore: createMetabloomBoomRequestStore(boomDatabase()),
    fetchImpl: () => assert.fail('The host owns the entry point') });
  assert.match(result.reply.segments[0].response, /US or Canada/);
  assert.match(result.reply.segments[0].response, /Not submitted to DY/);
});

test('conversation identity is accepted only with the negotiated boom contract', () => {
  const { parseBody } = require('../api/metabloom')._internals;
  const request = { headers: { 'x-metabloom-boom-request': '1' }, body: { message: 'Start a boom-system quote demo.', conversationId } };
  assert.equal(parseBody(request).conversationId, conversationId);
  assert.equal(parseBody({ ...request, headers: {} }), null);
  assert.equal(parseBody({ ...request, body: { ...request.body, conversationId: '../other' } }), null);
});


test('a provider batch prefers the typed update and cannot replace its card with a generic visual', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase()); let offers = 0;
  const result = await runMetabloomAgent({ ...base, message: messageFor(fields()), boomRequestStore: store,
    visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind) => {
      offers++; assert.equal(kind, 'boom-request'); return { kind, id: 'fixture' };
    } }, fetchImpl: async () => Response.json({ status: 'completed', output: [
      { ...call('get_boom_quote_request', {}), call_id: 'read' },
      { ...call('create_visual', { kind: 'table', brief: 'Invent an equipment price' }), call_id: 'visual' },
      call('update_boom_quote_request', { expectedRevision: 0, changes: changesFor(fields()) }),
    ] }) });
  assert.equal(offers, 1); assert.equal(result.offer.kind, 'boom-request');
  assert.equal((await store.read(identity, conversationId)).revision, 1);
});


test('expanded visual context cannot act as current-message evidence for intake', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase());
  const result = await runMetabloomAgent({ ...base, message: 'Use CA from the earlier visual', submittedMessage: 'Try that again', boomRequestStore: store,
    fetchImpl: provider('update_boom_quote_request', { expectedRevision: 0, changes: [{ field: 'market', value: 'CA', sourceText: 'CA' }] }) });
  assert.equal(await store.read(identity, conversationId), null);
  assert.match(result.reply.segments[0].response, /None of these changes were saved/);
});
