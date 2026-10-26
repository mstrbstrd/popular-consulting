const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const protocol = require('../src/components/metabloomVisualProtocol');
const { createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { generateMetabloomVisual, visualSchema } = require('../server/metabloomVisualGenerator');
const { createMetabloomVisualHandler } = require('../api/metabloom-visual');
const { createMetabloomVisualStreamBridge, requestMetabloomVisual } = require('../src/components/metabloomVisualApiClient');
const { beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply } = require('../src/components/metabloomVisualSession');
const clone = value => JSON.parse(JSON.stringify(value));
const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const offer = () => ({ version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'table', expiresAt: Date.now() + 600000 });
const spec = (kind = 'table') => {
  const common = { version: '1', designVersion: 'aetheris-1', kind, title: 'A useful comparison', summary: 'Values supplied by the user.', provenance: { type: 'user', label: 'User-provided values, not live data.', sourceIds: [] } };
  if (kind === 'table') return { ...common, columns: ['Option', 'Value'], rows: [['A', '10'], ['B', '20']] };
  if (kind === 'calculator') return { ...common, controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 1, initial: 120 }, { id: 'people', label: 'People', unit: '', min: 0, max: 20, step: 1, initial: 3 }], formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
  if (kind === 'flowchart') return { ...common, nodes: [{ id: 'a', label: 'Begin' }, { id: 'b', label: 'Finish' }], edges: [{ from: 'a', to: 'b', label: 'Continue' }] };
  if (kind === 'pie-chart') return { ...common, points: [{ label: 'Apples', value: 700 }, { label: 'Flour', value: 200 }, { label: 'Butter', value: 100 }], unit: 'g' };
  return { ...common, points: [{ label: 'First', value: -10 }, { label: 'Second', value: 20 }], unit: 'units' };
};
const record = kind => ({ owner: identity.owner, status: 'offered', offer: { ...offer(), kind: kind || 'table' }, context: { message: 'Compare A and B.', answer: 'A is 10. B is 20.', evidence: '', sources: [], recentConversation: [] } });
function loadWithMocks(relativePath, mocks) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : original(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
function response() {
  const res = new EventEmitter();
  res.headers = {}; res.body = ''; res.destroyed = false; res.writableEnded = false;
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.write = value => { res.body += value; return true; };
  res.end = value => { res.body += value || ''; res.writableEnded = true; };
  res.flushHeaders = () => {};
  return res;
}
const request = body => ({ method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, body, socket: { remoteAddress: '127.0.0.1' }, aborted: false });
const authenticate = async (_request, options) => { options.onIdentity?.(identity); return null; };
const envNames = ['METABLOOM_VISUALS_ENABLED', 'METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR',
  'METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL', 'VERCEL_ENV', 'NODE_ENV'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
process.env.METABLOOM_VISUALS_ENABLED = 'true'; process.env.OPENAI_API_KEY = 'fixture-only'; process.env.TYPESAFE_API_KEY = 'fixture-only';
delete process.env.METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR; delete process.env.METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY;
delete process.env.VERCEL; delete process.env.VERCEL_ENV; process.env.NODE_ENV = 'test';
test.after(() => { for (const [name, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

for (const kind of protocol.METABLOOM_VISUAL_KINDS) test(`accepts bounded ${kind} data with the Aetheris contract`, () => {
  assert.deepEqual(protocol.parseMetabloomVisual(spec(kind), { kind, sources: [] }), spec(kind));
  assert.equal(visualSchema(kind).properties.result.anyOf[0].additionalProperties, false);
});
test('rejects unknown versions, kinds, properties and model-authored styling/code', () => {
  for (const change of [{ version: '2' }, { designVersion: 'foreign' }, { kind: 'html' }, { css: 'body{}' }, { html: '<script>1</script>' }, { onClick: 'fetch()' }, { title: '' }]) assert.equal(protocol.parseMetabloomVisual({ ...spec(), ...change }), null);
});
test('bounds strings, byte size, tables, row widths and chart numbers', () => {
  for (const change of [{ title: 'x'.repeat(101) }, { rows: [['one']] }, { rows: Array(101).fill(['a', 'b']) }, { columns: [] }]) assert.equal(protocol.parseMetabloomVisual({ ...spec(), ...change }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...spec(), rows: Array(100).fill(['文'.repeat(400), '文'.repeat(400)]) }), null);
  for (const value of [NaN, Infinity, -Infinity, 1e13, '20', null]) assert.equal(protocol.parseMetabloomVisual({ ...spec('bar-chart'), points: [{ label: 'A', value }] }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...spec('line-chart'), points: [{ label: 'A', value: 1 }] }), null);
});
test('references must exist in the supplied evidence set', () => {
  const value = { ...spec(), provenance: { type: 'sources', label: 'Retrieved evidence.', sourceIds: [7] } };
  assert.equal(protocol.parseMetabloomVisual(value, { sources: [] }), null);
  assert.ok(protocol.parseMetabloomVisual(value, { sources: [{ id: 7 }] }));
  assert.equal(protocol.parseMetabloomVisual({ ...value, provenance: { ...value.provenance, sourceIds: [7, 7] } }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...value, provenance: { ...value.provenance, sourceIds: [] } }), null);
});
test('pie charts preserve a bounded nonnegative whole, including zero and tiny parts', () => {
  for (const points of [
    [{ label: 'Only part', value: 1 }],
    [{ label: 'Present', value: 1 }, { label: 'Absent', value: 0 }],
    [{ label: 'Tiny A', value: Number.MIN_VALUE }, { label: 'Tiny B', value: Number.MIN_VALUE }],
    Array.from({ length: 12 }, (_, index) => ({ label: `Part ${index + 1}`, value: 1e12 })),
  ]) {
    const value = { ...spec('pie-chart'), points };
    assert.deepEqual(protocol.parseMetabloomVisual(value, { kind: 'pie-chart' }), value);
  }
});
test('pie charts reject misleading values, duplicate categories and separate series', () => {
  const value = spec('pie-chart');
  for (const points of [[], [{ label: 'Empty', value: 0 }], [{ label: 'Negative', value: -1 }],
    [{ label: 'Unsafe', value: Infinity }], [{ label: 'Too large', value: 1e13 }],
    [{ label: 'Apples', value: 1 }, { label: ' apples ', value: 2 }],
    Array.from({ length: 13 }, (_, index) => ({ label: `Part ${index}`, value: 1 }))]) {
    assert.equal(protocol.parseMetabloomVisual({ ...value, points }), null);
  }
  assert.equal(protocol.parseMetabloomVisual({ ...value, series: [] }), null);
  assert.equal(protocol.parseMetabloomVisual(value, { kind: 'bar-chart' }), null);
  const fields = visualSchema('pie-chart').properties.result.anyOf[0].properties;
  assert.equal(fields.points.maxItems, 12);
  assert.equal(fields.points.items.properties.value.minimum, 0);
});
test('diagram edges cannot reference missing nodes or duplicate IDs', () => {
  const value = spec('flowchart'); value.edges[0].to = 'missing'; assert.equal(protocol.parseMetabloomVisual(value), null);
  value.edges[0].to = 'a'; value.nodes[1].id = 'a'; assert.equal(protocol.parseMetabloomVisual(value), null);
});
test('calculators compute locally and reject unsafe formulas or invalid input', () => {
  const value = spec('calculator');
  assert.equal(protocol.evaluateMetabloomVisualFormula(value.formula, value.controls, { total: 120, people: 3 }), 40);
  for (const people of [0, NaN, Infinity, -1, 21, '3']) assert.equal(protocol.evaluateMetabloomVisualFormula(value.formula, value.controls, { total: 120, people }), null);
  for (const formula of [['eval'], ['total', 'window'], ['total', 'add'], ['total', 'people'], Array(33).fill('total')]) assert.equal(protocol.parseMetabloomVisual({ ...value, formula }), null);
});
test('offers require exact IDs, supported versions and bounded ownership metadata', () => {
  assert.ok(protocol.parseMetabloomVisualOffer(offer()));
  for (const change of [{ id: 'x' }, { id: 123 }, { kind: 'script' }, { expiresAt: Infinity }, { extra: true }]) assert.equal(protocol.parseMetabloomVisualOffer({ ...offer(), ...change }), null);
});

test('offer context is short-lived, bounded and created with NX', async () => {
  const commands = [];
  const store = createMetabloomVisualStore({ command: async args => { commands.push(args); return 'OK'; } });
  const result = await store.offer(identity, 'table', record().context);
  assert.equal(result.id.length, 48); assert.equal(commands[0][0], 'SET');
  assert.deepEqual(commands[0].slice(-3), ['EX', '600', 'NX']);
  assert.equal(JSON.parse(commands[0][2]).owner, identity.owner);
  assert.equal(await store.offer(identity, 'table', { text: 'x'.repeat(65536) }), null);
  assert.equal(commands.length, 1);
});
test('claims carry session ownership and both quotas in one atomic script', async () => {
  const commands = []; const value = record();
  const store = createMetabloomVisualStore({ command: async args => { commands.push(args); return JSON.stringify(value); } });
  assert.equal((await store.claim(identity, value.offer.id)).context.answer, value.context.answer);
  const args = commands[0]; assert.equal(args[0], 'EVAL'); assert.equal(args[2], '3'); assert.equal(args[6], identity.owner);
  assert.ok(args[4].endsWith(identity.subject)); assert.ok(args[5].endsWith(':daily'));
  assert.match(args[1], /record\.owner~=ARGV\[1\]/); assert.match(args[1], /quotaState\(KEYS\[2\],KEYS\[3\]/); assert.match(args[1], /KEEPTTL/);
  assert.deepEqual(args.slice(-2), ['30', '200']);
});
for (const result of ['expired', 'claimed']) test(`claim ${result} cannot return generation context`, async () => {
  const store = createMetabloomVisualStore({ command: async () => result });
  await assert.rejects(store.claim(identity, offer().id), { code: `visual_${result}` });
});
test('a mismatched session or expired returned context is rejected again', async () => {
  for (const value of [{ ...record(), owner: 'f'.repeat(64) }, { ...record(), offer: { ...offer(), expiresAt: 1 } }]) {
    const store = createMetabloomVisualStore({ command: async () => JSON.stringify(value) });
    await assert.rejects(store.claim(identity, value.offer.id), { code: 'visual_expired' });
  }
});
function providerEnvelope(value, status = 'completed') { return { status, output: [{ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ result: value }) }] }], usage: { input_tokens: 12, output_tokens: 24 } }; }
test('builder makes one bounded request using the approved kind and completed answer', async () => {
  const calls = []; const value = record();
  const result = await generateMetabloomVisual(value, { fetchImpl: async (url, options) => { calls.push({ url, ...options }); return Response.json(providerEnvelope(spec())); } });
  assert.deepEqual(result, spec()); assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].body); assert.equal(body.store, false); assert.equal(body.stream, false); assert.equal(body.max_output_tokens, 6000); assert.equal(body.tools, undefined);
  assert.equal(JSON.parse(body.input[0].content).answer, value.context.answer); assert.equal(calls[0].redirect, 'error');
});
test('builder rejects truncated output, wrong kind and unsupported source claims without retry', async () => {
  for (const envelope of [providerEnvelope(spec(), 'incomplete'), providerEnvelope(spec('calculator')), providerEnvelope({ ...spec(), provenance: { type: 'sources', label: 'Missing.', sourceIds: [2] } })]) {
    let calls = 0;
    await assert.rejects(generateMetabloomVisual(record(), { fetchImpl: async () => { calls++; return Response.json(envelope); } }));
    assert.equal(calls, 1);
  }
});
test('unavailable data is a fixed error, never a fabricated chart or raw model message', async () => {
  await assert.rejects(generateMetabloomVisual(record(), { fetchImpl: async () => Response.json(providerEnvelope({ kind: 'unavailable', reason: 'private provider text' })) }), { code: 'visual_unavailable', message: 'visual_unavailable' });
});
test('visual endpoint denies unauthenticated calls before touching storage or models', async () => {
  let touched = false;
  const handler = createMetabloomVisualHandler({ authenticate: async () => ({ status: 401 }), store: { claim: async () => { touched = true; } }, generate: async () => { touched = true; } });
  const res = response(); await handler(request({}), res); assert.equal(res.statusCode, 401); assert.equal(touched, false); assert.match(res.headers['cache-control'], /no-store/);
});
test('default-off gate fails closed before generating', async () => {
  delete process.env.METABLOOM_VISUALS_ENABLED;
  try {
    const handler = createMetabloomVisualHandler({ authenticate, store: { claim: async () => assert.fail('must not claim') } });
    const res = response(); await handler(request({}), res); assert.equal(res.statusCode, 503); assert.equal(JSON.parse(res.body).code, 'visual_disabled');
  } finally { process.env.METABLOOM_VISUALS_ENABLED = 'true'; }
});
test('visual endpoint rejects arbitrary context, malformed IDs and oversized bodies', async () => {
  const handler = createMetabloomVisualHandler({ authenticate, store: { claim: async () => assert.fail('must not claim') } });
  for (const body of [{ ...offer(), context: 'override' }, { id: '../other', version: '1', designVersion: 'aetheris-1' }, 'x'.repeat(1025)]) {
    const res = response(); await handler(request(body), res); assert.equal(res.statusCode, 400);
  }
});
test('duplicate generation reaches the provider at most once', async () => {
  let claimed = false, calls = 0;
  const handler = createMetabloomVisualHandler({ authenticate, store: { claim: async () => {
    if (claimed) throw Object.assign(new Error(), { code: 'visual_claimed' }); claimed = true; return record();
  }, complete: async () => {} }, generate: async () => { calls++; return spec(); } });
  const value = { id: offer().id, version: '1', designVersion: 'aetheris-1' }; const a = response(), b = response();
  await Promise.all([handler(request(value), a), handler(request(value), b)]);
  assert.equal(calls, 1); assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
});
test('failed visuals return safe codes and do not retry or expose provider content', async () => {
  let calls = 0; const handler = createMetabloomVisualHandler({ authenticate, store: { claim: async () => record(), complete: async () => {} }, generate: async () => { calls++; throw new Error('secret upstream content'); } });
  const res = response(); await handler(request({ id: offer().id, version: '1', designVersion: 'aetheris-1' }), res);
  assert.equal(calls, 1); assert.equal(res.statusCode, 502); assert.equal(JSON.parse(res.body).code, 'visual_unavailable'); assert.ok(!res.body.includes('secret'));
});
test('provider completion after cancellation cannot return a ready visual', async () => {
  const handler = createMetabloomVisualHandler({ authenticate, store: { claim: async () => record() }, generate: async () => { res.emit('close'); return spec(); } });
  const res = response(); await handler(request({ id: offer().id, version: '1', designVersion: 'aetheris-1' }), res);
  assert.equal(JSON.parse(res.body).code, 'visual_cancelled');
});

const choice = (value, confidence = 0.9) => ({ type: 'choice', choice: value, confidence, probabilities: { [value]: confidence } });
const decisionMapping = { METABLOOM_INPUT_REACTION_QUESTION: { type: 'choice' }, METABLOOM_REACTION_QUESTION: { type: 'choice' }, METABLOOM_ACTION_IDS: ['none', 'deep-research'], METABLOOM_ACTION_QUESTION: { type: 'choice' }, resolveMetabloomDecision: answer => answer.choice === 'warm' ? 'warm' : 'neutral', resolveMetabloomActionDecision: answer => answer.choice };
const jev = loadWithMocks('server/jevReactionService.js', { '../src/components/metabloomDecisionMapping': decisionMapping });
test('post-answer emotion and visualization use one Jev request', async () => {
  const calls = []; const state = { latestUserMessage: 'Compare.', assistantResponse: 'A is 10, B is 20.' };
  const result = await jev.decideMetabloomResponse({ state, visualKinds: ['table'], fetchImpl: async (_url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ answers: { reaction: choice('warm'), visualization: choice('table') } }); } });
  assert.deepEqual(result, { emote: 'warm', visualization: 'table' }); assert.equal(calls.length, 1); assert.deepEqual(calls[0].state, state); assert.deepEqual(Object.keys(calls[0].questions).sort(), ['reaction', 'visualization']);
});
test('visual validation is independent of emotion and cannot invent a renderer', async () => {
  for (const answer of [choice('html'), choice('table', 0.4), { ...choice('table'), probabilities: { table: Infinity } }]) {
    const result = await jev.decideMetabloomResponse({ state: {}, visualKinds: ['table'], fetchImpl: async () => Response.json({ answers: { reaction: choice('warm'), visualization: answer } }) });
    assert.deepEqual(result, { emote: 'warm', visualization: 'none' });
  }
  assert.deepEqual(await jev.decideMetabloomResponse({ state: {}, visualKinds: ['table'], fetchImpl: async () => Response.json({ answers: { reaction: {}, visualization: choice('table') } }) }), { emote: 'neutral', visualization: 'table' });
});
test('Jev timeout or abort yields no visual and makes no second request', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  const result = await jev.decideMetabloomResponse({ state: {}, visualKinds: ['table'], signal: controller.signal, fetchImpl: async () => { calls++; throw new Error(); } });
  assert.deepEqual(result, { emote: 'neutral', visualization: 'none' }); assert.equal(calls, 0);
});
test('legacy reaction callers remain reaction-only even with unwanted visual options', async () => {
  let body; const result = await jev.decideMetabloomReaction({ phase: 'response', state: {}, visualKinds: ['table'], fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return Response.json({ answers: { reaction: choice('warm') } }); } });
  assert.equal(result, 'warm'); assert.deepEqual(Object.keys(body.questions), ['reaction']);
});

// A deliberately small strict text-decoder fixture exercises the side-channel
// adapter without pretending to replace the repository's full protocol tests.
function strictDecoder() {
  const state = { textComplete: false, responseEmote: null, completed: false }; let failed = false;
  return { getState: () => state, push: chunk => {
    try { const value = JSON.parse(chunk); if (state.completed) throw new Error();
      if (value.type === 'text_complete') state.textComplete = true;
      else if (value.type === 'emote' && value.phase === 'response' && state.textComplete) state.responseEmote = value.emote;
      else if (value.type === 'done' && state.responseEmote) state.completed = true;
      else throw new Error(); return true;
    } catch { failed = true; return false; }
  }, finish: () => ({ ok: !failed && state.completed }) };
}
const textPrefix = '{"type":"text_complete"}\n{"type":"emote","phase":"response","emote":"warm"}\n';
test('offer side channel preserves strict text framing across character-sized chunks', () => {
  const bridge = createMetabloomVisualStreamBridge(strictDecoder()); const value = offer();
  for (const char of textPrefix + JSON.stringify({ type: 'visual_offer', offer: value }) + '\n{"type":"done"}\n') assert.equal(bridge.push(char), true);
  assert.equal(bridge.finish().ok, true); assert.deepEqual(bridge.offer, value);
});
test('invalid or duplicated offers do not destroy a valid completed answer', () => {
  for (const lines of [[{ type: 'visual_offer', offer: { bad: true } }], [{ type: 'visual_offer', offer: offer() }, { type: 'visual_offer', offer: offer() }]]) {
    const bridge = createMetabloomVisualStreamBridge(strictDecoder()); assert.equal(bridge.push(textPrefix + lines.map(JSON.stringify).join('\n') + '\n{"type":"done"}\n'), true); assert.equal(bridge.finish().ok, true); assert.equal(bridge.offer, null);
  }
});
test('unknown text records, oversized lines and records after done still fail', () => {
  for (const value of [textPrefix + '{"type":"surprise"}\n', textPrefix + '{"type":"done"}\n' + JSON.stringify({ type: 'visual_offer', offer: offer() }) + '\n', 'x'.repeat(24001)]) {
    const bridge = createMetabloomVisualStreamBridge(strictDecoder()); assert.equal(bridge.push(value), false); assert.equal(bridge.finish().ok, false);
  }
});
test('client validates the independent response and never sends answer context from the browser', async () => {
  let sent; const value = offer(); const result = await requestMetabloomVisual(value, { fetchImpl: async (_url, options) => { sent = options; return Response.json({ id: value.id, version: '1', designVersion: 'aetheris-1', spec: spec(), sources: [] }); } });
  assert.deepEqual(result.spec, spec()); assert.deepEqual(Object.keys(JSON.parse(sent.body)).sort(), ['designVersion', 'id', 'version']); assert.equal(sent.credentials, 'same-origin'); assert.equal(sent.redirect, 'error');
});
test('client rejects cross-artifact payloads and unsafe source URLs', async () => {
  for (const change of [{ id: 'a'.repeat(48) }, { sources: [{ id: 1, title: 'Bad', url: 'javascript:alert(1)' }] }]) {
    const value = offer(); await assert.rejects(requestMetabloomVisual(value, { fetchImpl: async () => Response.json({ id: value.id, version: '1', designVersion: 'aetheris-1', spec: spec(), sources: [], ...change }) }));
  }
});
test('expired or already-cancelled clients make no provider request', async () => {
  let calls = 0; const fetchImpl = async () => { calls++; assert.fail('no request'); };
  await assert.rejects(requestMetabloomVisual({ ...offer(), expiresAt: 1 }, { fetchImpl }), { code: 'visual_expired' });
  const controller = new AbortController(); controller.abort(); await assert.rejects(requestMetabloomVisual(offer(), { signal: controller.signal, fetchImpl }), { code: 'visual_cancelled' }); assert.equal(calls, 0);
});
test('artifact correlation requires request ID, original signal, user adjacency and exact complete text', () => {
  const controller = new AbortController(); const messages = [{ role: 'user', id: 'user-1', content: 'Compare.' }];
  const turn = beginMetabloomVisualTurn({ requestId: 'mount-1', signal: controller.signal, message: 'Compare.' }, messages);
  const detail = { requestId: 'mount-1', signal: controller.signal, offer: offer(), reply: { segments: [{ response: 'The completed answer.' }] } };
  assert.equal(acceptMetabloomVisualOffer(turn, { ...detail, signal: new AbortController().signal }), false);
  assert.equal(acceptMetabloomVisualOffer(turn, { ...detail, requestId: 'mount-2' }), false);
  assert.equal(acceptMetabloomVisualOffer(turn, detail), true); assert.equal(acceptMetabloomVisualOffer(turn, detail), false);
  const answer = { role: 'assistant', id: 'assistant-2', content: 'The completed answer.', status: 'complete' };
  assert.equal(findMetabloomVisualReply(turn, [...messages, { ...answer, status: 'streaming' }]), null);
  assert.equal(findMetabloomVisualReply(turn, [...messages, { ...answer, content: 'Different.' }]), null);
  assert.equal(findMetabloomVisualReply(turn, [...messages, { role: 'user', id: 'user-3' }, answer]), null);
  assert.deepEqual(findMetabloomVisualReply(turn, [...messages, answer]), answer);
  controller.abort(); assert.equal(findMetabloomVisualReply(turn, [...messages, answer]), null);
});
test('Aetheris resources keep gradients at the edge and use existing tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/components/MetabloomVisual.css'), 'utf8');
  for (const token of ['--aetheris-spectral-border-soft', '--aetheris-glass-panel-raised', '--aetheris-glass-specular', '--aetheris-font-sans', '--aetheris-font-mono']) assert.ok(css.includes(token));
  const { METABLOOM_VISUAL_TOKENS } = require('../src/components/metabloomVisualDesign');
  for (const match of css.matchAll(/var\((--aetheris-[a-z0-9-]+)/g)) assert.ok(METABLOOM_VISUAL_TOKENS.includes(match[1]), `Unapproved token ${match[1]}`);
  assert.match(css, /mask-composite:\s*exclude/); assert.match(css, /prefers-reduced-transparency/); assert.match(css, /forced-colors/);
  assert.ok(!/#(?:[0-9a-f]{3}){1,2}\b/i.test(css.replace(/linear-gradient\(#000 0 0\)/g, '')));
  const frame = fs.readFileSync(path.join(__dirname, '../src/components/MetabloomVisualFrame.js'), 'utf8');
  for (const forbidden of ['dangerouslySetInnerHTML', 'new Function', 'eval(', '<iframe', '<canvas']) assert.ok(!frame.includes(forbidden));
});

function chatFixture({ visual = true, selection = 'table', offerFails = false } = {}) {
  const events = []; const reply = { version: '2', segments: [{ response: 'A is 10. B is 20.' }] };
  const handler = loadWithMocks('api/metabloom.js', {
    '../server/metabloomAuth': { requireMetabloomSession: authenticate },
    '../src/components/metabloomEmoteLibrary': { METABLOOM_CHAT_PROTOCOL_VERSION: '2', METABLOOM_EMOTE_IDS: ['neutral'], METABLOOM_CHAT_RESPONSE_SCHEMA: { properties: { segments: {} } }, buildMetabloomChatSystemPrompt: () => 'Fixture instructions.' },
    '../src/components/metabloomDecisionMapping': { METABLOOM_ACTION_MODES: ['auto', 'none'] },
    '../server/jevReactionService': { decideMetabloomInput: async () => ({ emote: 'neutral', action: 'none' }), decideMetabloomReaction: async () => { events.push('reaction'); return 'neutral'; }, decideMetabloomResponse: async options => { events.push(['decision', options.state.assistantResponse]); return { emote: 'neutral', visualization: selection }; } },
    '../server/metabloomProviderStream': { streamMetabloomProvider: async (_response, options) => { await options.onTextDelta?.(reply.segments[0].response, 0); await options.onSegment(reply.segments[0], 0); events.push('validated'); return reply; } },
    '../server/metabloomResearch': { conductMetabloomResearch: async () => assert.fail('No repeated research'), validateMetabloomResearchCitations: () => {} },
    '../server/metabloomProviderErrors': { providerRequestId: () => null, readMetabloomProviderError: async () => new Error(), createMetabloomProviderError: code => ({ code }) },
    '../src/components/metabloomRequestErrors': { METABLOOM_STREAM_ERROR_CODES: [] },
    '../src/components/metabloomResearchSources': { MAX_METABLOOM_RESEARCH_SOURCES: 8 },
    '../src/components/metabloomResearchReport': { MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS: 6000 },
    '../server/metabloomVisualStore': { enabled: () => visual, createMetabloomVisualStore: () => ({ offer: async (_identity, _kind, context) => { events.push(['offer', context.answer]); if (offerFails) throw new Error('Store unavailable'); return offer(); } }) },
  });
  return { events, handler };
}
test('chat prepares visuals only after answer validation and final Jev choice', async () => {
  const originalFetch = global.fetch; global.fetch = async () => ({ ok: true });
  try {
    const { handler, events } = chatFixture(); const req = request({ message: 'Compare.', requestId: 'mount-1', streamText: true, actionMode: 'auto' }); req.headers['x-metabloom-visuals'] = '1'; const res = response(); await handler(req, res);
    const records = res.body.trim().split('\n').map(JSON.parse); assert.equal(records.at(-1).type, 'done');
    assert.deepEqual(events, ['validated', ['decision', 'A is 10. B is 20.'], ['offer', 'A is 10. B is 20.']]);
    assert.ok(records.findIndex(record => record.type === 'visual_offer') > records.findIndex(record => record.type === 'text_complete'));
  } finally { global.fetch = originalFetch; }
});
test('old clients and disabled/native-none turns get no visual offer or extra builder', async () => {
  const originalFetch = global.fetch; global.fetch = async () => ({ ok: true });
  try {
    for (const options of [{}, { visual: false }, { selection: 'none' }]) {
      const { handler, events } = chatFixture(options); const req = request({ message: 'Compare.', requestId: 'mount-1', streamText: true, actionMode: 'auto' }); if (Object.keys(options).length) req.headers['x-metabloom-visuals'] = '1';
      const res = response(); await handler(req, res); const records = res.body.trim().split('\n').map(JSON.parse);
      assert.equal(records.at(-1).type, 'done'); assert.ok(!records.some(record => record.type === 'visual_offer')); assert.ok(!events.some(event => Array.isArray(event) && event[0] === 'offer'));
    }
  } finally { global.fetch = originalFetch; }
});
test('handoff-storage failure still completes the original answer and reaction', async () => {
  const originalFetch = global.fetch; global.fetch = async () => ({ ok: true });
  try {
    const { handler } = chatFixture({ offerFails: true }); const req = request({ message: 'Compare.', requestId: 'mount-1', streamText: true, actionMode: 'auto' }); req.headers['x-metabloom-visuals'] = '1';
    const res = response(); await handler(req, res); const records = res.body.trim().split('\n').map(JSON.parse);
    assert.equal(records.at(-1).type, 'done'); assert.equal(records.filter(record => record.type === 'segment').length, 1); assert.ok(!records.some(record => record.type === 'error'));
  } finally { global.fetch = originalFetch; }
});

const { classifyMetabloomVisualIntent, extractMetabloomVisualData } = require('../src/components/metabloomVisualIntent');
const businessPrompt = 'Compare monthly revenue over six months and visualize the comparison. Business A: 20, 24, 28, 31, 36, 42. Business B: 30, 29, 33, 35, 34, 38. Business C: 15, 19, 23, 27, 32, 40. Values are in thousands of dollars.';
test('input intent preserves user series without another model call', () => {
  const result = classifyMetabloomVisualIntent(businessPrompt);
  assert.equal(result.mode, 'requested');
  assert.deepEqual(result.preferredKinds, ['line-chart']);
  assert.deepEqual(result.dataHints.labels, ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
  assert.deepEqual(result.dataHints.series.map(series => series.values), [[20, 24, 28, 31, 36, 42], [30, 29, 33, 35, 34, 38], [15, 19, 23, 27, 32, 40]]);
  assert.deepEqual(result.dataHints.series.map(series => series.label), ['Business A', 'Business B', 'Business C']);
  assert.equal(classifyMetabloomVisualIntent('Just text only, no charts. Explain this.').mode, 'text_only');
  assert.equal(classifyMetabloomVisualIntent('Explain curiosity.').mode, 'optional');
  assert.equal(classifyMetabloomVisualIntent('Explain the SQL table schema.').mode, 'optional');
  assert.equal(classifyMetabloomVisualIntent('Build an interactive calculator for these values.').mode, 'requested');
  assert.equal(classifyMetabloomVisualIntent('Make a line chart of the figures.').requiredKind, 'line-chart');
  assert.equal(extractMetabloomVisualData('A: 1, 2. B: 3, 4, 5.'), null);
});
test('explicit pie requests preserve the requested format and code-only requests remain text', () => {
  for (const message of [
    'can you create a pie chart the represents the ingredients in an apple pie?',
    'Please draw a pie-chart of these values.',
    'I would like a pie chart of monthly expenses.',
  ]) {
    const intent = classifyMetabloomVisualIntent(message);
    assert.equal(intent.mode, 'requested');
    assert.equal(intent.requiredKind, 'pie-chart');
    assert.deepEqual(intent.preferredKinds, ['pie-chart']);
  }
  assert.equal(classifyMetabloomVisualIntent('Create HTML for a pie chart.').mode, 'optional');
  assert.equal(classifyMetabloomVisualIntent('Text-only: explain a pie chart.').mode, 'text_only');
});
test('the pie builder retains explicit illustrative provenance and exact ingredient amounts', async () => {
  const value = { ...record('pie-chart'), context: { ...record().context,
    message: 'can you create a pie chart the represents the ingredients in an apple pie?', answer: '', visualIntent: 'requested' } };
  const chart = { ...spec('pie-chart'), title: 'Example apple-pie ingredients by mass',
    summary: 'An illustrative recipe example, not quantities supplied by the user.',
    provenance: { type: 'illustrative', label: 'Assumed example quantities in grams; actual recipes vary.', sourceIds: [] } };
  const result = await generateMetabloomVisual(value, { fetchImpl: async () => Response.json(providerEnvelope(chart)) });
  assert.deepEqual(result, chart);
  assert.equal(result.provenance.type, 'illustrative');
  await assert.rejects(generateMetabloomVisual(value, {
    fetchImpl: async () => Response.json(providerEnvelope({ ...chart, kind: 'bar-chart' })),
  }), { code: 'visual_invalid' });
});
const multiChart = () => {
  const { points, ...base } = spec('line-chart');
  return { ...base, unit: 'thousands of dollars', labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
    series: [{ id: 'series_1', label: 'Business A', values: [20, 24, 28, 31, 36, 42] },
      { id: 'series_2', label: 'Business B', values: [30, 29, 33, 35, 34, 38] },
      { id: 'series_3', label: 'Business C', values: [15, 19, 23, 27, 32, 40] }] };
};
test('multi-series contract preserves categories and rejects inconsistent or executable data', () => {
  const value = multiChart();
  assert.deepEqual(protocol.parseMetabloomVisual(value), value);
  assert.equal(visualSchema('line-chart').properties.result.anyOf.length, 3);
  assert.equal(visualSchema('line-chart', { multiSeriesOnly: true }).properties.result.anyOf.length, 2);
  assert.equal(protocol.parseMetabloomVisual({ ...value, series: [{ ...value.series[0], values: [1] }, ...value.series.slice(1)] }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...value, labels: ['M1', 'M1', 'M3', 'M4', 'M5', 'M6'] }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...value, series: [...value.series, { ...value.series[0] }] }), null);
  assert.equal(protocol.parseMetabloomVisual({ ...value, series: [...value.series, { id: 'unsafe', label: '<script>', values: value.series[0].values }], js: 'alert(1)' }), null);
});
test('builder preserves original user series and rejects invented chart numbers', async () => {
  const dataHints = extractMetabloomVisualData(businessPrompt);
  const value = { ...record('line-chart'), context: { ...record().context, dataHints, visualIntent: 'requested' } };
  const result = await generateMetabloomVisual(value, { fetchImpl: async () => Response.json(providerEnvelope(multiChart())) });
  assert.deepEqual(result, multiChart());
  const modified = multiChart(); modified.series[0].values[0] = 999;
  await assert.rejects(generateMetabloomVisual(value, { fetchImpl: async () => Response.json(providerEnvelope(modified)) }), { code: 'visual_invalid' });
});
test('explicit visuals survive low-confidence or none Jev choices, while optional requests do not', async () => {
  const opts = { state: { visualIntent: 'requested' }, visualKinds: ['line-chart', 'table'],
    visualIntent: 'requested', preferredKinds: ['line-chart'],
    fetchImpl: async () => Response.json({ answers: { reaction: choice('warm'), visualization: choice('none', 0.98) } }) };
  assert.deepEqual(await jev.decideMetabloomResponse(opts), { emote: 'warm', visualization: 'line-chart' });
  assert.deepEqual(await jev.decideMetabloomResponse({ ...opts, visualIntent: 'optional' }), { emote: 'warm', visualization: 'none' });
  assert.deepEqual(await jev.decideMetabloomResponse({ ...opts, requiredKind: 'line-chart',
    fetchImpl: async () => Response.json({ answers: { reaction: choice('warm'), visualization: choice('table') } }) }),
    { emote: 'warm', visualization: 'line-chart' });
  const abort = new AbortController(); abort.abort();
  assert.deepEqual(await jev.decideMetabloomResponse({ ...opts, signal: abort.signal }), { emote: 'neutral', visualization: 'none' });
});
