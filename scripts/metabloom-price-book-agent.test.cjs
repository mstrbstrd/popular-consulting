const { test, beforeEach, afterEach } = require('node:test');
const previousKey = process.env.OPENAI_API_KEY;
beforeEach(() => { process.env.OPENAI_API_KEY = 'fictional-price-book-test'; });
afterEach(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
const assert = require('node:assert/strict');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
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
