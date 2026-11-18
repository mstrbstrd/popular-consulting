const { test, beforeEach, afterEach } = require('node:test');
const previousKey = process.env.OPENAI_API_KEY;
beforeEach(() => { process.env.OPENAI_API_KEY = 'fictional-price-book-test'; });
afterEach(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
const assert = require('node:assert/strict');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
const { serviceRules, ruleChanges, priceBookMemoryDatabase } = require('./fixtures/metabloom-price-book-workflow.cjs');
const { createMetabloomPriceBookWorkflowStore } = require('../server/metabloomPriceBookWorkflow');
const book = { version: 1, currency: 'CAD',
  inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }],
  lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null }],
  examples: [{ label: 'Three hours', inputs: { hours: 3 } }] };
const record = { version: 7, publishedAt: 1, book };
const answer = { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: 'Review your estimate card.' }] }) }] };
const call = (name, args) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'quote_1', status: 'completed' });
const provider = (outputs, seen) => async (_url, options) => { seen.push(JSON.parse(options.body)); return Response.json({ status: 'completed', output: outputs.shift() }); };
const base = { message: 'Quote three hours.', history: [], visualsAvailable: true, priceBookEnabled: true,
  identity: { owner: 'session' }, accountIdentity: { accountKey: 'account' }, requestId: 'quote-test' };

test('quote uses the published rules, queues host-built cents, and exposes no publish tool', async () => {
  const seen = [], events = [], lifecycle = createMetabloomAgentLifecycle({ requireStatus: true }); let context;
  const result = await runMetabloomAgent({ ...base,
    priceBookStore: { read: async identity => { assert.equal(identity, base.accountIdentity); return record; } },
    visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_identity, kind, value) => {
      assert.equal(kind, 'table'); context = value; return { kind: 'table', id: 'fixture' }; } },
    fetchImpl: provider([[call('get_quote', { hours: 3 })], [answer]], seen),
    onTool: event => { events.push(event); assert(lifecycle.accept(event)); }, onStatus: event => assert(lifecycle.accept(event)) });
  const tool = seen[0].tools.find(tool => tool.name === 'get_quote');
  assert.deepEqual(tool.parameters.required, ['hours']);
  assert.equal(tool.parameters.additionalProperties, false);
  assert(!seen[0].tools.some(tool => /publish/.test(tool.name)));
  assert.equal(context.priceBookVersion, 7);
  assert(context.hostQuote.rows.some(row => row[0] === 'Estimated total' && row[1] === '299.25'));
  assert(context.hostQuote.rows.some(row => row[0] === 'Input: Hours' && row[1] === '3'));
  assert.match(context.hostQuote.title, /v7/);
  assert(!seen[1].input.at(-1).output.includes('299.25'));
  assert.equal(result.offer.kind, 'table');
  assert.deepEqual(events.map(event => event.state), ['running', 'complete']);
});

test('disabled, legacy and missing-account requests never read a price book or expose quoting', async () => {
  for (const override of [{ priceBookEnabled: false }, { visualsAvailable: false }, { accountIdentity: undefined }]) {
    const seen = [];
    await runMetabloomAgent({ ...base, ...override, priceBookStore: { read: () => assert.fail('No private lookup') },
      fetchImpl: provider([[answer]], seen) });
    assert(!seen[0].tools.some(tool => tool.name === 'get_quote'));
    if (override.priceBookEnabled === false) assert(!seen[0].tools.find(tool => tool.name === 'create_visual').parameters.properties.kind.enum.includes('price-book'));
  }
});

test('store failure preserves ordinary chat without exposing an invented quote', async () => {
  const seen = [];
  const result = await runMetabloomAgent({ ...base, priceBookStore: { read: async () => { throw new Error('Offline'); } }, fetchImpl: provider([[answer]], seen) });
  assert.equal(result.reply.segments.length, 1);
  assert(!seen[0].tools.some(tool => tool.name === 'get_quote'));
});

test('pricing uses saved state beyond chat history and ends with a host-confirmed answer, without a second model call', async () => {
  const database = priceBookMemoryDatabase(), workflow = createMetabloomPriceBookWorkflowStore(database);
  const accountIdentity = { accountKey: 'a'.repeat(64) };
  await workflow.update(accountIdentity, { expectedRevision: 0, requestId: 'previous-chat', changes: ruleChanges(serviceRules()) });
  const message = 'Change my hourly rate to 100.', seen = [], events = []; let context;
  const lifecycle = createMetabloomAgentLifecycle({ requireStatus: true });
  const result = await runMetabloomAgent({ ...base, accountIdentity, priceBookWorkflowEnabled: true, visualsAvailable: false, priceBookVisualsAvailable: true,
    message, history: [], priceBookWorkflowStore: workflow, priceBookStore: { read: async () => null },
    visualStore: { claimStart: async () => {}, checkQuota: async () => {}, offer: async (_owner, kind, value) => {
      assert.equal(kind, 'price-book'); context = value; return { id: 'fixture', kind };
    } }, fetchImpl: provider([[call('propose_price_book_changes', { expectedRevision: 1,
      changes: [{ field: 'labour_rate', value: '100', sourceText: 'hourly rate to 100' }] })]], seen),
    onTool: event => { events.push(event); assert(lifecycle.accept(event)); }, onStatus: event => assert(lifecycle.accept(event)) });
  assert.equal(seen.length, 1); assert.match(seen[0].instructions, /"revision":1/); assert.match(seen[0].instructions, /"labour_rate":"95"/);
  assert(!seen[0].tools.some(tool => /publish/.test(tool.name)));
  assert.deepEqual(events.map(event => event.state), ['running', 'complete']);
  assert.match(result.reply.segments[0].response, /has been saved/);
  assert.equal(context.hostPriceBook.priceBookDraft.revision, 2);
  assert.equal((await workflow.read(accountIdentity)).rules.labour_rate, '100');
  assert.equal((await workflow.read(accountIdentity)).rules.minimum_charge, '200');
});

test('unsupported or missing pricing values receive fixed questions and cannot produce a preview', async () => {
  const accountIdentity = { accountKey: 'a'.repeat(64) };
  for (const [message, field, value] of [['Use CAD', 'currency', 'CAD'], ['Tax included', 'tax_mode', 'inclusive']]) {
    const workflow = createMetabloomPriceBookWorkflowStore(priceBookMemoryDatabase()); const seen = [];
    const result = await runMetabloomAgent({ ...base, accountIdentity, message, priceBookWorkflowEnabled: true,
      priceBookStore: { read: async () => null }, priceBookWorkflowStore: workflow,
      visualStore: { claimStart: () => assert.fail('No preview before all rules are supported and complete') },
      fetchImpl: provider([[call('propose_price_book_changes', { expectedRevision: 0, changes: [{ field, value, sourceText: message }] })]], seen) });
    assert.equal(seen.length, 1); assert.equal(result.offer, null);
    assert.match(result.reply.segments[0].response, field === 'currency' ? /charged hourly/ : /needs clarification/);
  }
});

test('provider extraction failures cannot assert a save; a failed display preserves the confirmed saved draft', async () => {
  const accountIdentity = { accountKey: 'a'.repeat(64) }, workflow = createMetabloomPriceBookWorkflowStore(priceBookMemoryDatabase());
  const seen = [];
  const bad = await runMetabloomAgent({ ...base, accountIdentity, message: 'Use USD', priceBookWorkflowEnabled: true,
    priceBookStore: { read: async () => null }, priceBookWorkflowStore: workflow,
    fetchImpl: provider([[call('propose_price_book_changes', { expectedRevision: 0,
      changes: [{ field: 'currency', value: 'CAD', sourceText: 'Use CAD' }] })]], seen) });
  assert.match(bad.reply.segments[0].response, /were not changed/); assert.equal(await workflow.read(accountIdentity), null);
  await workflow.update(accountIdentity, { expectedRevision: 0, requestId: 'previous-chat', changes: ruleChanges(serviceRules()) });
  const result = await runMetabloomAgent({ ...base, accountIdentity, message: 'Resume my setup', priceBookWorkflowEnabled: true,
    priceBookStore: { read: async () => null }, priceBookWorkflowStore: workflow,
    visualStore: { claimStart: async () => { throw new Error('Display storage failed'); } },
    fetchImpl: provider([[call('get_price_book_draft', {})]], []) });
  assert.equal(result.offer, null); assert.match(result.reply.segments[0].response, /Price book setup/);
  assert.equal((await workflow.read(accountIdentity)).revision, 1);
});

test('old clients never receive workflow events, and no generic visual tool can generate pricing formulas', async () => {
  const seen = [];
  await runMetabloomAgent({ ...base, priceBookStore: { read: async () => null },
    priceBookWorkflowStore: { read: () => assert.fail('No workflow without negotiation') }, fetchImpl: provider([[answer]], seen) });
  assert(!seen[0].tools.some(tool => ['get_price_book_draft', 'propose_price_book_changes'].includes(tool.name)));
  assert(!seen[0].tools.find(tool => tool.name === 'create_visual').parameters.properties.kind.enum.includes('price-book'));
});

test('all three provider adapters save the same typed inputs and share the host-owned next question', async () => {
  const savedEnv = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  process.env.DEEPSEEK_API_KEY = 'fictional-deepseek'; process.env.ANTHROPIC_API_KEY = 'fictional-claude';
  try {
    const replies = [];
    for (const provider of ['openai', 'deepseek', 'anthropic']) {
      const accountIdentity = { accountKey: 'a'.repeat(64) }, workflow = createMetabloomPriceBookWorkflowStore(priceBookMemoryDatabase());
      let calls = 0;
      const args = { expectedRevision: 0, changes: [{ field: 'currency', value: 'CAD', sourceText: 'CAD' }] };
      const result = await runMetabloomAgent({ ...base, accountIdentity, message: 'Use CAD for my price book.',
        priceBookWorkflowEnabled: true, modelSelection: { provider, model: 'fixture-model' },
        priceBookStore: { read: async () => null }, priceBookWorkflowStore: workflow,
        fetchImpl: async (_url, options) => {
          calls++; const payload = JSON.parse(options.body);
          assert(payload.tools.some(tool => tool.name === 'propose_price_book_changes'));
          assert(!payload.tools.some(tool => /publish/.test(tool.name)));
          return Response.json(provider === 'anthropic' ? { type: 'message', role: 'assistant', stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'fixture_change', name: 'propose_price_book_changes', input: args }] }
            : { status: 'completed', output: [call('propose_price_book_changes', args)] });
        } });
      assert.equal(calls, 1); assert.equal((await workflow.read(accountIdentity)).rules.currency, 'CAD');
      replies.push(result.reply);
    }
    assert.deepEqual(replies[0], replies[1]); assert.deepEqual(replies[1], replies[2]);
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('pricing remains editable in text-only mode without queuing cards or exposing card-only quoting', async () => {
  const accountIdentity = { accountKey: 'a'.repeat(64) }, workflow = createMetabloomPriceBookWorkflowStore(priceBookMemoryDatabase());
  await workflow.update(accountIdentity, { expectedRevision: 0, requestId: 'existing-draft', changes: ruleChanges(serviceRules()) });
  const seen = [];
  const result = await runMetabloomAgent({ ...base, accountIdentity, priceBookWorkflowEnabled: true, priceBookVisualsAvailable: false,
    priceBookStore: { read: async () => record }, priceBookWorkflowStore: workflow,
    visualStore: { claimStart: () => assert.fail('No display requested') }, fetchImpl: provider([[call('get_price_book_draft', {})]], seen) });
  assert.equal(result.offer, null); assert(!seen[0].tools.some(tool => tool.name === 'get_quote'));
  assert.match(result.reply.segments[0].response, /Price book setup/);
  assert.match(seen[0].instructions, /published price book exists/);
});

test('changed published version and invalid job inputs fail before creating an estimate', async () => {
  for (const stale of [true, false]) {
    let reads = 0; const seen = [];
    const result = await runMetabloomAgent({ ...base,
      priceBookStore: { read: async () => ++reads > 1 && stale ? { ...record, version: 8 } : record },
      visualStore: { claimStart: () => assert.fail('No offer claim') },
      fetchImpl: provider([[call('get_quote', stale ? { hours: 3 } : { hours: 0, price: 1 })], [answer]], seen) });
    assert.equal(result.offer, null);
    assert.equal(JSON.parse(seen[1].input.at(-1).output).status, 'failed');
  }
});
