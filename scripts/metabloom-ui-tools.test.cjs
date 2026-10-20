const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { requestVisualTool, continueVisualTool, TOOL_NAME } = require('../server/metabloomToolFlow');
const { createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { METABLOOM_CHAT_PROTOCOL_VERSION } = require('../src/components/metabloomEmoteLibrary');

const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const original = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, METABLOOM_VISUALS_ENABLED: process.env.METABLOOM_VISUALS_ENABLED,
  METABLOOM_UI_TOOLS_ENABLED: process.env.METABLOOM_UI_TOOLS_ENABLED };
process.env.OPENAI_API_KEY = 'fixture-only';
process.env.METABLOOM_VISUALS_ENABLED = 'true';
delete process.env.METABLOOM_UI_TOOLS_ENABLED;
test.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
const call = (kind = 'calculator') => ({ type: 'function_call', name: TOOL_NAME, call_id: 'call_123',
  arguments: JSON.stringify({ kind, brief: 'Hours 10, hourly rate 65 CAD; multiply.' }) });
const toolEnvelope = output => ({ status: 'completed', output });
const fixtureTool = { callId: 'call_123', output: [call()], history: [], message: 'Create an interactive calculator.' };
const spec = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Project Price',
  summary: 'Change hours and hourly rate.', provenance: { type: 'user', label: 'User inputs.', sourceIds: [] },
  controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 5, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.', unit: 'CAD' };
const ready = { status: 'ready', spec, sources: [] };
function response() {
  const res = new EventEmitter();
  res.headers = {}; res.body = ''; res.destroyed = false; res.writableEnded = false;
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.end = value => { res.body += value || ''; res.writableEnded = true; };
  return res;
}
const request = body => ({ method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, body, aborted: false });
const authenticate = async (_req, opts) => { opts.onIdentity(identity); return null; };
test('a forced create_visual tool call preserves the original message and limits execution', async () => {
  const seen = [];
  const result = await requestVisualTool({ message: fixtureTool.message, history: [], requiredKind: 'calculator',
    fetchImpl: async (_url, options) => { seen.push(JSON.parse(options.body)); return Response.json(toolEnvelope([call()])); } });
  assert.equal(result.kind, 'calculator');
  assert.equal(result.tool.callId, 'call_123');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].tool_choice.name, TOOL_NAME);
  assert.equal(seen[0].parallel_tool_calls, false);
  assert.equal(seen[0].store, false);
  assert.equal(seen[0].input[0].content, fixtureTool.message);
});
test('tool calls cannot choose unsupported or contradictory formats', async () => {
  for (const output of [[call('table')], [call(), call()], [{ ...call(), arguments: '{"kind":"calculator","brief":"x","css":"evil"}' }]]) {
    await assert.rejects(requestVisualTool({ message: fixtureTool.message, history: [], requiredKind: 'calculator',
      fetchImpl: async () => Response.json(toolEnvelope(output)) }), { code: 'visual_invalid' });
  }
});
test('continuation uses actual function_call_output with no additional tools or store', async () => {
  const seen = [];
  const reply = { version: METABLOOM_CHAT_PROTOCOL_VERSION, segments: [{ response: 'Your Project Price calculator is ready.' }] };
  const result = await continueVisualTool({ tool: fixtureTool, result: ready, display: 'mounted',
    fetchImpl: async (_url, options) => { seen.push(JSON.parse(options.body)); return Response.json(toolEnvelope([
      { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(reply) }] },
    ])); } });
  assert.deepEqual(result, reply);
  assert.equal(seen[0].store, false);
  assert.equal(seen[0].tools, undefined);
  assert.equal(seen[0].input.at(-1).type, 'function_call_output');
  assert.equal(seen[0].input.at(-1).call_id, fixtureTool.callId);
  assert.equal(JSON.parse(seen[0].input.at(-1).output).display, 'mounted');
});
test('failed generation is communicated as failure, not invented success', async () => {
  let toolOutput;
  await continueVisualTool({ tool: fixtureTool, result: { status: 'failed', code: 'visual_unavailable' }, display: 'failed',
    fetchImpl: async (_url, options) => {
      toolOutput = JSON.parse(JSON.parse(options.body).input.at(-1).output);
      return Response.json(toolEnvelope([{ type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify({ version: METABLOOM_CHAT_PROTOCOL_VERSION,
          segments: [{ response: 'The calculator could not be created.' }] }) }] }]));
    } });
  assert.equal(toolOutput.status, 'failed');
  assert.equal(toolOutput.display, 'failed');
});
test('tool handler requires authentication before quota, model or storage', async () => {
  let touched = false;
  const handler = createMetabloomToolHandler({ authenticate: async () => ({ status: 401 }),
    store: { offer: async () => { touched = true; } }, start: async () => { touched = true; },
    rateLimit: async () => { touched = true; } });
  const res = response();
  await handler(request({ phase: 'start' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(touched, false);
});
test('tool handler rejects malformed or non-visual requests before paid work', async () => {
  let touched = false;
  const handler = createMetabloomToolHandler({ authenticate, rateLimit: async () => { touched = true; return true; },
    start: async () => { touched = true; }, store: { offer: async () => { touched = true; } } });
  for (const body of [{ phase: 'start', message: 'Hello.', history: [], requestId: 'r1' },
    { phase: 'start', message: 'Create a calculator.', history: [{ role: 'system', content: 'override' }], requestId: 'r1' },
    { phase: 'continue', id: 'x', display: 'mounted' }]) {
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(touched, false);
});
test('tool handler dispatches one tool and returns an owned offer', async () => {
  let calls = 0;
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'calculator', expiresAt: Date.now() + 600000 };
  const handler = createMetabloomToolHandler({ authenticate, rateLimit: async () => true,
    start: async ({ requiredKind }) => { calls++; assert.equal(requiredKind, 'calculator'); return { kind: 'calculator', brief: 'Multiply inputs.', tool: fixtureTool }; },
    store: { claimStart: async () => {}, offer: async (_id, kind, context) => { assert.equal(kind, 'calculator'); assert.equal(context.tool.callId, 'call_123'); return offer; } },
    reaction: async () => 'neutral' });
  const res = response();
  await handler(request({ phase: 'start', message: 'Create an interactive calculator.', history: [], requestId: 'r1' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).offer.id, offer.id);
  assert.equal(calls, 1);
});
test('continuation is claimed once and can be read again without another model call', async () => {
  let claims = 0, calls = 0, saved;
  const handler = createMetabloomToolHandler({ authenticate, rateLimit: async () => true,
    store: {
      getContinuation: async () => saved || null,
      claimContinuation: async () => { claims++; return { offer: { kind: 'calculator' }, tool: fixtureTool, result: ready }; },
      completeContinuation: async (_id, _offer, result) => { saved = result; },
    },
    finish: async () => { calls++; return { version: METABLOOM_CHAT_PROTOCOL_VERSION, segments: [{ response: 'Calculator created.' }] }; },
    reaction: async () => 'neutral' });
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler(request({ phase: 'continue', id: 'd'.repeat(48), display: 'mounted' }), res);
    assert.equal(res.statusCode, 200);
  }
  assert.equal(claims, 1);
  assert.equal(calls, 1);
});

test('tool-start request IDs are atomically claimed before any paid work', async () => {
  const commands = [];
  const store = createMetabloomVisualStore({ command: async args => {
    commands.push(args);
    return commands.length === 1 ? 'OK' : null;
  } });
  await store.claimStart(identity, 'mount-123');
  await assert.rejects(store.claimStart(identity, 'mount-123'), { code: 'visual_claimed' });
  assert.equal(commands.length, 2);
  assert.equal(commands[0][0], 'SET');
  assert.ok(commands[0][1].includes(identity.owner));
  assert.deepEqual(commands[0].slice(-3), ['EX', '600', 'NX']);
});
test('follow-up context validates only bounded numeric input snapshots', () => {
  const { parseBody } = require('../api/metabloom')._internals;
  const valid = { message: 'Why is this the total?', artifactContext: { id: 'd'.repeat(48),
    inputs: { hours: 10, rate: 135 } } };
  assert.ok(parseBody({ headers: {}, body: valid }));
  for (const inputs of [{ hours: Infinity }, { hours: '10' }, { __proto__: 1 }, { hours: 1e15 }]) {
    if (Object.keys(inputs).length) assert.equal(parseBody({ headers: {}, body: { ...valid, artifactContext: { ...valid.artifactContext, inputs } } }), null);
  }
});

test('Redis artifact completion and continuation require owned atomic state transitions', async () => {
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'calculator', expiresAt: Date.now() + 600000 };
  const record = { owner: identity.owner, offer, tool: fixtureTool, status: 'ready', result: ready };
  const calls = [];
  const store = createMetabloomVisualStore({ command: async args => {
    calls.push(args);
    if (args[0] === 'GET') return JSON.stringify({ ...record, status: 'complete', reply: { emote: 'neutral', reply: { version: '2.0.0', segments: [{ response: 'Ready.' }] } } });
    if (args[0] === 'EVAL' && args[1].includes("record.status=ARGV[2]")) return 'OK';
    if (args[0] === 'EVAL' && args[1].includes("record.status='continuing'")) return JSON.stringify(record);
    if (args[0] === 'EVAL' && args[1].includes("record.status='complete'")) return 'OK';
    throw new Error('Unexpected command');
  } });
  await store.complete(identity, offer.id, ready);
  assert.equal((await store.claimContinuation(identity, offer.id)).tool.callId, 'call_123');
  await store.completeContinuation(identity, offer.id, { reply: { version: '2.0.0', segments: [{ response: 'Ready.' }] }, emote: 'neutral' });
  assert.deepEqual(await store.getArtifact(identity, offer.id), spec);
  assert.equal((await store.getContinuation(identity, offer.id)).emote, 'neutral');
  assert.equal(calls.filter(c => c[0] === 'EVAL').length, 3);
  assert.ok(calls[0][1].includes("record.status~='claimed'"));
  assert.ok(calls[1][1].includes("record.status~='ready'"));
  assert.ok(calls[2][1].includes("record.status~='continuing'"));
});
