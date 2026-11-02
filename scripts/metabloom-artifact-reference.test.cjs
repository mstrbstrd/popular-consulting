const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const ordinaryHandler = require('../api/metabloom');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { resolveMetabloomArtifactReference, artifactContextMessage, artifactNumericHints,
  MAX_ARTIFACT_CONTEXT_BYTES } = require('../server/metabloomArtifactContext');
const { requestVisualTool, continueVisualTool } = require('../server/metabloomToolFlow');
const { generateMetabloomVisual } = require('../server/metabloomVisualGenerator');
const { parseMetabloomArtifactReference } = require('../src/components/metabloomArtifactReference');

const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const id = 'd'.repeat(48), version = 'e'.repeat(32);
const sources = [{ id: 7, title: 'Fictional source ledger', url: 'https://example.com/fictional-ledger' }];
const provenance = { type: 'sources', label: 'Fictional stored source values; not a fresh lookup.', sourceIds: [7] };
const clone = value => JSON.parse(JSON.stringify(value));
const common = kind => ({ version: '1', designVersion: 'aetheris-1', kind, title: 'Fictional selection',
  summary: 'Synthetic stored data for reference tests.', provenance: clone(provenance) });
const table = () => ({ ...common('table'), columns: ['Name', 'Hours'], rows: [['Zulu', '10'], ['Alpha', '20']] });
const line = () => ({ ...common('line-chart'), unit: 'CAD', labels: ['M1', 'M2', 'M3'], series: [
  { id: 'north', label: 'North studio', values: [4, 12, 18] },
  { id: 'south', label: 'South studio', values: [6, 9, 16] },
] });
const singleLine = () => ({ ...common('line-chart'), unit: 'h', points: [{ label: 'Week 1', value: 4 }, { label: 'Week 3', value: 7 }] });
const pie = () => ({ ...common('pie-chart'), unit: 'h', points: [{ label: 'Build', value: 6 }, { label: 'Review', value: 2 }] });
const flow = () => ({ ...common('flowchart'), nodes: [{ id: 'start', label: 'Start' }, { id: 'review', label: 'Review' }, { id: 'ship', label: 'Ship' }],
  edges: [{ from: 'start', to: 'review', label: '' }, { from: 'review', to: 'ship', label: 'Approved' }] });
const calculator = () => ({ ...common('calculator'), unit: 'CAD',
  controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 1, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' });
const record = (spec = table()) => ({ owner: identity.owner, status: 'ready',
  offer: { id, version: '1', designVersion: 'aetheris-1', kind: spec.kind, expiresAt: 1 },
  result: { status: 'ready', spec, sources: clone(sources), artifactVersion: version } });
const reference = (selector = { type: 'table-row', index: 0 }, extra = {}) => ({ id, version, selector, ...extra });
const fixtureStore = value => createMetabloomVisualStore({ command: async args => {
  assert.deepEqual(args, ['GET', `metabloom:{visual-${identity.scope}}:offer:${id}`]);
  return value === null ? null : JSON.stringify(value);
} });
const resolve = (value, selected = reference()) => resolveMetabloomArtifactReference({ store: fixtureStore(value), identity, reference: selected });
const authenticate = async (_request, options) => { options.onIdentity(identity); return null; };
const response = () => Object.assign(new EventEmitter(), {
  statusCode: 0, headers: {}, body: '', writableEnded: false, destroyed: false,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  write(value) { this.body += value; return true; },
  end(value = '') { this.body += value; this.writableEnded = true; },
});
const request = body => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
  'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' }, body });
const providerEnvelope = result => ({ status: 'completed', output: [{ type: 'message', role: 'assistant',
  status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
const streamReply = () => {
  const text = JSON.stringify({ version: '2.0.0', segments: [{ response: 'The selected fictional data is explained.' }] });
  return new Response([
    { type: 'response.output_text.delta', item_id: 'm1', output_index: 0, content_index: 0, delta: text },
    { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
const originalFetch = global.fetch;
const envNames = ['OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL', 'VERCEL_ENV', 'NODE_ENV',
  'METABLOOM_VISUALS_ENABLED', 'METABLOOM_UI_TOOLS_ENABLED', 'METABLOOM_OPENAI_MODEL', 'METABLOOM_VISUAL_MODEL',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
beforeEach(() => {
  mock.method(auth, 'requireMetabloomSession', authenticate);
  process.env.OPENAI_API_KEY = 'fictional-artifact-test';
  process.env.VERCEL_ENV = 'development';
  process.env.NODE_ENV = 'test';
  process.env.METABLOOM_VISUALS_ENABLED = 'true';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fictional-artifact-store';
  for (const name of ['TYPESAFE_API_KEY', 'VERCEL', 'METABLOOM_UI_TOOLS_ENABLED', 'METABLOOM_OPENAI_MODEL', 'METABLOOM_VISUAL_MODEL']) delete process.env[name];
  global.fetch = async () => { assert.fail('This test must not make an unmocked network request'); };
});
afterEach(() => {
  mock.restoreAll();
  global.fetch = originalFetch;
  ordinaryHandler._internals.localBuckets.clear();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('ready results resolve by owned Redis record lifetime, including opaque canonical JSON', async () => {
  for (const status of ['ready', 'continuing', 'complete']) {
    for (const opaque of [false, true]) {
      const value = record(); value.status = status;
      const expected = { spec: value.result.spec, sources: value.result.sources, artifactVersion: version };
      if (opaque) value.result = JSON.stringify(value.result);
      assert.deepEqual(await fixtureStore(value).getArtifactRecord(identity, id), expected);
    }
  }
  const legacy = record(); delete legacy.result.artifactVersion;
  assert.equal(await fixtureStore(legacy).getArtifactRecord(identity, id), null);
  assert.deepEqual(await fixtureStore(legacy).getArtifact(identity, id), table());
});

test('foreign, expired, corrupt and mismatched records never yield an artifact', async () => {
  const cases = [null, { ...record(), owner: 'f'.repeat(64) }, ...['offered', 'claimed', 'failed'].map(status => ({ ...record(), status }))];
  for (const change of [{ offer: { ...record().offer, id: 'f'.repeat(48) } },
    { offer: { ...record().offer, kind: 'calculator' } }, { result: { ...record().result, status: 'failed' } },
    { result: { ...record().result, artifactVersion: '1' } },
    { result: { ...record().result, spec: { ...table(), rows: [['missing column']] } } },
    { result: { ...record().result, sources: [{ id: 7, title: 'Bad URL', url: 'javascript:alert(1)' }] } }, // eslint-disable-line no-script-url -- Deliberately rejected URL fixture.
    { result: '{broken' }]) cases.push({ ...record(), ...change });
  for (const value of cases) assert.equal(await fixtureStore(value).getArtifactRecord(identity, id), null);
});

test('table selection uses original row position and carries its immutable provenance', async () => {
  const context = await resolve(record(), reference({ type: 'table-row', index: 0 }));
  assert.deepEqual(context.data, { columns: ['Name', 'Hours'], row: ['Zulu', '10'] });
  assert.deepEqual(context.selection, { type: 'table-row', index: 0 });
  assert.deepEqual(context.sources, sources);
  assert.deepEqual(context.provenance, provenance);
});

test('one line observation retains every named series, label, unit and exact numeric hints', async () => {
  const context = await resolve(record(line()), reference({ type: 'observation', index: 1 }));
  assert.deepEqual(context.data, { label: 'M2', unit: 'CAD', series: [
    { id: 'north', label: 'North studio', value: 12 }, { id: 'south', label: 'South studio', value: 9 },
  ] });
  assert.deepEqual(artifactNumericHints(context), { type: 'user-numeric-series', labels: ['M2'], unitHint: 'CAD', series: [
    { id: 'north', label: 'North studio', values: [12] }, { id: 'south', label: 'South studio', values: [9] },
  ] });
  const single = { ...common('line-chart'), unit: 'h', points: [{ label: 'Week 1', value: 4 }, { label: 'Week 3', value: 7 }] };
  assert.deepEqual((await resolve(record(single), reference({ type: 'observation', index: 1 }))).data,
    { label: 'Week 3', unit: 'h', value: 7 });
});

test('pie and flow selectors resolve their category share and adjacent step labels', async () => {
  const pie = { ...common('pie-chart'), unit: 'h', points: [{ label: 'Build', value: 6 }, { label: 'Review', value: 2 }] };
  assert.deepEqual((await resolve(record(pie), reference({ type: 'pie-category', index: 1 }))).data,
    { label: 'Review', value: 2, unit: 'h', total: 8, share: 0.25 });
  const flow = { ...common('flowchart'), nodes: [{ id: 'start', label: 'Start' }, { id: 'review', label: 'Review' }, { id: 'ship', label: 'Ship' }],
    edges: [{ from: 'start', to: 'review', label: '' }, { from: 'review', to: 'ship', label: 'Approved' }] };
  assert.deepEqual((await resolve(record(flow), reference({ type: 'flow-node', id: 'review' }))).data,
    { node: { id: 'review', label: 'Review' }, incoming: [{ from: 'start', fromLabel: 'Start', label: '' }],
      outgoing: [{ to: 'ship', toLabel: 'Ship', label: 'Approved' }] });
});

test('calculator context recomputes the submitted scenario using the stored formula', async () => {
  const context = await resolve(record(calculator()), reference({ type: 'calculator' }, { inputs: { hours: 12, rate: 75 } }));
  assert.equal(context.data.calculatedResult, 900);
  assert.deepEqual(context.data.controls, [{ id: 'hours', label: 'Hours', unit: 'h', value: 12 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', value: 75 }]);
  assert.equal(context.data.formulaDescription, calculator().formulaDescription);
  assert.deepEqual(context.provenance, provenance);
});

test('selectors, control sets and every calculator range fail closed', async () => {
  const calc = calculator();
  calc.controls.push({ id: 'unused', label: 'Unused setting', unit: '', min: 0, max: 10, step: 1, initial: 1 });
  const cases = [
    [record(), reference({ type: 'table-row', index: 2 })],
    [record(line()), reference({ type: 'observation', index: 3 })],
    [record(), reference({ type: 'pie-category', index: 0 })],
    [record({ ...common('flowchart'), nodes: [{ id: 'start', label: 'Start' }], edges: [] }), reference({ type: 'flow-node', id: 'missing' })],
    [record(calculator()), reference({ type: 'calculator' }, { inputs: { hours: 12 } })],
    [record(calculator()), reference({ type: 'calculator' }, { inputs: { hours: 12, rate: 75, extra: 1 } })],
    [record(calculator()), reference({ type: 'calculator' }, { inputs: { hours: 81, rate: 75 } })],
    [record(calc), reference({ type: 'calculator' }, { inputs: { hours: 12, rate: 75, unused: 11 } })],
  ];
  for (const [value, selected] of cases) await assert.rejects(resolve(value, selected), { code: 'artifact_invalid', status: 400 });
  await assert.rejects(resolve(record(), { ...reference(), version: 'f'.repeat(32) }), { code: 'artifact_unavailable', status: 410 });
  await assert.rejects(resolveMetabloomArtifactReference({ store: { getArtifactRecord: async () => { throw new Error('private transport details'); } },
    identity, reference: reference() }), { code: 'artifact_unavailable', status: 503, message: 'artifact_unavailable' });
});

test('bounded derived context rejects oversized provenance catalogs without truncating them', async () => {
  const value = record();
  value.result.sources = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, title: 'Fictional source', url: `https://example.com/${'a'.repeat(1800)}${index}` }));
  assert.ok(JSON.stringify(value.result.sources).length > MAX_ARTIFACT_CONTEXT_BYTES);
  await assert.rejects(resolve(value), { code: 'artifact_invalid', status: 400 });
});

test('legacy calculator references remain ordinary-only and extra client data is rejected', async () => {
  const legacy = { id, inputs: { hours: 10, rate: 65 } };
  assert.deepEqual(ordinaryHandler._internals.parseBody(request({ message: 'Explain this.', artifactContext: legacy })).artifactContext, legacy);
  assert.equal(parseMetabloomArtifactReference({ ...reference(), row: ['Injected', '999'] }), null);
  assert.equal(ordinaryHandler._internals.parseBody(request({ message: 'Explain.', artifactContext: { ...reference(), sources } })), null);
  const handler = createMetabloomToolHandler({ authenticate, store: {}, start: async () => assert.fail('No provider') });
  const res = response();
  await handler(request({ phase: 'start', message: 'Create a table.', history: [], requestId: 'legacy', artifactContext: legacy }), res);
  assert.equal(res.statusCode, 400);
});

for (const scenario of [
  { name: 'expired record', value: null, selected: reference(), code: 'artifact_unavailable', status: 410 },
  { name: 'foreign owner', value: { ...record(), owner: 'f'.repeat(64) }, selected: reference(), code: 'artifact_unavailable', status: 410 },
  { name: 'stale version', value: record(), selected: { ...reference(), version: 'f'.repeat(32) }, code: 'artifact_unavailable', status: 410 },
  { name: 'row beyond stored data', value: record(), selected: reference({ type: 'table-row', index: 2 }), code: 'artifact_invalid', status: 400 },
  { name: 'invalid calculator scenario', value: record(calculator()), selected: reference({ type: 'calculator' }, { inputs: { hours: 90, rate: 75 } }), code: 'artifact_invalid', status: 400 },
]) test(`both endpoints reject ${scenario.name} before quota, provider, Jev or research work`, async () => {
  let reads = 0, paid = 0, mutations = 0;
  process.env.TYPESAFE_API_KEY = 'fictional-jev-must-not-be-used';
  global.fetch = async (url, options) => {
    if (String(url) === new URL(process.env.UPSTASH_REDIS_REST_URL).href) {
      const command = JSON.parse(options.body);
      assert.equal(command[0], 'GET'); reads++;
      return Response.json({ result: scenario.value === null ? null : JSON.stringify(scenario.value) });
    }
    paid++; throw new Error('Rejected references must not reach a paid endpoint');
  };
  const ordinary = response();
  await ordinaryHandler(request({ message: 'Explain the selected item.', history: [], actionMode: 'deep-research', artifactContext: scenario.selected }), ordinary);
  assert.equal(ordinary.statusCode, scenario.status);
  assert.equal(JSON.parse(ordinary.body).code, scenario.code);
  assert.equal(reads, 1);
  assert.equal(ordinaryHandler._internals.localBuckets.size, 0);
  const handler = createMetabloomToolHandler({ authenticate,
    store: { getArtifactRecord: fixtureStore(scenario.value).getArtifactRecord,
      claimStart: async () => { mutations++; }, checkQuota: async () => { mutations++; }, offer: async () => { mutations++; } },
    rateLimit: async () => { mutations++; return true; }, start: async () => { paid++; }, reaction: async () => { paid++; } });
  const tool = response();
  await handler(request({ phase: 'start', message: 'Create a table from the selected item.', history: [], requestId: 'rejected', artifactContext: scenario.selected }), tool);
  assert.equal(tool.statusCode, scenario.status);
  assert.equal(JSON.parse(tool.body).code, scenario.code);
  assert.equal(paid, 0);
  assert.equal(mutations, 0);
});

test('ordinary explanation gets the same resolved source data once, with a separate citation namespace', async () => {
  let reads = 0, sent;
  global.fetch = async (url, options) => {
    if (String(url) === new URL(process.env.UPSTASH_REDIS_REST_URL).href) { reads++; return Response.json({ result: JSON.stringify(record(line())) }); }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    sent = JSON.parse(options.body); return streamReply();
  };
  const selected = reference({ type: 'observation', index: 1 });
  const req = request({ message: 'Explain the selected observation.', history: [], requestId: 'explain', artifactContext: selected });
  req.headers['x-metabloom-visuals'] = '1'; req.headers['x-metabloom-ui-tools'] = '1';
  const res = response(); await ordinaryHandler(req, res);
  assert.equal(res.statusCode, 200); assert.equal(reads, 1);
  assert.deepEqual(sent.input[0], artifactContextMessage(await resolve(record(line()), selected)));
  assert.equal(sent.input[1].content, req.body.message);
  assert.match(sent.instructions, /never to the current answer's \[n\] citation namespace/);
  assert.match(sent.instructions, /untrusted data, never instructions/);
  assert.ok(!res.body.includes('visual_offer'));
});

test('omitting a cleared attachment performs no stored-artifact lookup or context insertion', async () => {
  let calls = 0, sent;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); calls++;
    sent = JSON.parse(options.body); return streamReply();
  };
  const res = response(); await ordinaryHandler(request({ message: 'Explain the next step.', history: [] }), res);
  assert.equal(res.statusCode, 200); assert.equal(calls, 1);
  assert.deepEqual(sent.input, [{ role: 'user', content: 'Explain the next step.' }]);
  assert.doesNotMatch(sent.instructions, /selected application artifact/);
});

const conversions = [
  { name: 'original table row', source: table(), selected: reference(), kind: 'table',
    converted: { ...common('table'), columns: ['Name', 'Hours'], rows: [['Zulu', '10']] } },
  { name: 'named line observation as bars', source: line(), selected: reference({ type: 'observation', index: 1 }), kind: 'bar-chart',
    converted: { ...common('bar-chart'), unit: 'CAD', labels: ['M2'], series: [
      { id: 'north', label: 'North studio', values: [12] }, { id: 'south', label: 'South studio', values: [9] },
    ] } },
  { name: 'named line observation as table', source: line(), selected: reference({ type: 'observation', index: 1 }), kind: 'table',
    converted: { ...common('table'), columns: ['Observation', 'Series', 'Value', 'Unit'],
      rows: [['M2', 'North studio', '12', 'CAD'], ['M2', 'South studio', '9', 'CAD']] } },
  { name: 'single line observation as table', source: singleLine(), selected: reference({ type: 'observation', index: 1 }), kind: 'table',
    converted: { ...common('table'), columns: ['Observation', 'Value', 'Unit'], rows: [['Week 3', '7', 'h']] } },
  { name: 'single line observation as bar', source: singleLine(), selected: reference({ type: 'observation', index: 1 }), kind: 'bar-chart',
    converted: { ...common('bar-chart'), unit: 'h', points: [{ label: 'Week 3', value: 7 }] } },
  { name: 'pie category', source: pie(), selected: reference({ type: 'pie-category', index: 1 }), kind: 'table',
    converted: { ...common('table'), columns: ['Category', 'Value', 'Unit', 'Total', 'Share'], rows: [['Review', '2', 'h', '8', '0.25']] } },
  { name: 'flow node', source: flow(), selected: reference({ type: 'flow-node', id: 'review' }), kind: 'table',
    converted: { ...common('table'), columns: ['Selected step', 'Connection', 'Related step', 'Branch label'],
      rows: [['Review', 'Selected', '', ''], ['Review', 'Incoming', 'Start', ''], ['Review', 'Outgoing', 'Ship', 'Approved']] } },
  { name: 'calculator scenario', source: calculator(), selected: reference({ type: 'calculator' }, { inputs: { hours: 12, rate: 75 } }), kind: 'table',
    converted: { ...common('table'), columns: ['Setting', 'Value', 'Unit'], rows: [
      ['Hours', '12', 'h'], ['Hourly rate', '75', 'CAD/h'], ['Result', '900', 'CAD'], ['Calculation', 'Hours multiplied by hourly rate.', ''],
    ] } },
];
for (const scenario of conversions) test(`conversion carries identical ${scenario.name} context through planner, builder and continuation`, async () => {
  let stored, plannerPayload, builderPayload, continuationPayload, reads = 0;
  const resolved = await resolve(record(scenario.source), scenario.selected);
  const modelSpec = { ...scenario.converted, provenance: { type: 'illustrative', label: 'Model attempted to replace attribution.', sourceIds: [] } };
  const toolStore = {
    getArtifactRecord: async (...args) => { reads++; return fixtureStore(record(scenario.source)).getArtifactRecord(...args); },
    claimStart: async () => {}, checkQuota: async () => {},
    offer: async (_identity, kind, context) => {
      stored = { offer: { ...record(scenario.source).offer, id: 'f'.repeat(48), kind, expiresAt: Date.now() + 600000 }, context };
      return stored.offer;
    },
  };
  const handler = createMetabloomToolHandler({ authenticate, store: toolStore, rateLimit: async () => true, reaction: async () => 'neutral',
    start: args => requestVisualTool({ ...args, fetchImpl: async (_url, options) => {
      plannerPayload = JSON.parse(options.body);
      return Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'create_visual', call_id: 'fixture_call',
        arguments: JSON.stringify({ kind: scenario.kind, brief: 'Convert the selected data without changing its values.' }) }] });
    } }),
  });
  const res = response();
  await handler(request({ phase: 'start', message: `Create a ${scenario.kind.replace('-', ' ')} from this selection.`,
    history: [], requestId: 'converted', artifactContext: scenario.selected }), res);
  assert.equal(res.statusCode, 200); assert.equal(reads, 1);
  assert.deepEqual(plannerPayload.input[0], artifactContextMessage(resolved));
  assert.deepEqual(stored.context.artifactContext, resolved);
  assert.deepEqual(stored.context.sources, sources);
  const converted = await generateMetabloomVisual(stored, { fetchImpl: async (_url, options) => {
    builderPayload = JSON.parse(options.body); return Response.json(providerEnvelope({ result: modelSpec }));
  } });
  assert.deepEqual(JSON.parse(builderPayload.input[0].content).artifactContext, resolved);
  assert.deepEqual(converted, scenario.converted);
  assert.deepEqual(converted.provenance, resolved.provenance);
  const expectedProjection = clone(scenario.converted);
  for (const field of ['version', 'designVersion', 'title', 'summary', 'provenance']) delete expectedProjection[field];
  assert.deepEqual(JSON.parse(builderPayload.input[0].content).artifactConversion, expectedProjection);
  assert.match(builderPayload.instructions, /Copy every field in artifactConversion exactly/);
  await continueVisualTool({ tool: stored.context.tool, result: { status: 'ready', spec: converted }, display: 'mounted',
    fetchImpl: async (_url, options) => {
      continuationPayload = JSON.parse(options.body);
      return Response.json(providerEnvelope({ version: '2.0.0', segments: [{ response: 'The converted component is ready.' }] }));
    } });
  assert.deepEqual(continuationPayload.input[0], artifactContextMessage(resolved));
});

test('selected observation conversion rejects flattened, renamed, changed or invented numeric observations', async () => {
  const context = await resolve(record(line()), reference({ type: 'observation', index: 1 }));
  const base = { ...common('bar-chart'), unit: 'CAD', labels: ['M2'], series: [
    { id: 'north', label: 'North studio', values: [12] }, { id: 'south', label: 'South studio', values: [9] },
  ] };
  const invalid = [
    { ...common('bar-chart'), unit: 'CAD', points: [{ label: 'M2', value: 21 }] },
    { ...base, unit: 'USD' }, { ...base, labels: ['M3'] },
    { ...base, series: [{ ...base.series[0], id: 'wrong_identity' }, base.series[1]] },
    { ...base, series: [{ ...base.series[0], label: 'Other studio' }, base.series[1]] },
    { ...base, series: [{ ...base.series[0], values: [999] }, base.series[1]] },
    { ...base, labels: ['M2', 'M3'], series: base.series.map(item => ({ ...item, values: [...item.values, 0] })) },
  ];
  for (const spec of invalid) await assert.rejects(generateMetabloomVisual({ offer: { kind: 'bar-chart' },
    context: { artifactContext: context, sources, dataHints: artifactNumericHints(context) } },
  { fetchImpl: async () => Response.json(providerEnvelope({ result: spec })) }), { code: 'visual_invalid' });
});

for (const scenario of conversions.filter(item => item.kind === 'table')) test(`a ${scenario.name} table rejects changed cells, headings, order or extra rows before inheriting provenance`, async () => {
  const context = await resolve(record(scenario.source), scenario.selected);
  const changedCell = clone(scenario.converted); changedCell.rows[0][1] = '999';
  const addedRow = clone(scenario.converted); addedRow.rows.push(addedRow.rows[0].map(() => 'Invented'));
  const renamedColumn = clone(scenario.converted); renamedColumn.columns[0] = 'Changed meaning';
  const reordered = clone(scenario.converted);
  if (reordered.rows.length > 1) reordered.rows.reverse();
  else { reordered.columns.reverse(); reordered.rows[0].reverse(); }
  for (const spec of [changedCell, addedRow, renamedColumn, reordered]) {
    // Inheriting the source catalog would falsely ground these changed values.
    spec.provenance = { type: 'illustrative', label: 'Unverified model changes.', sourceIds: [] };
    await assert.rejects(generateMetabloomVisual({ offer: { kind: 'table' }, context: { artifactContext: context, sources } },
      { fetchImpl: async () => Response.json(providerEnvelope({ result: spec })) }), { code: 'visual_invalid' });
  }
});

test('the original sourced-row promotion repro fails instead of attaching original sources to invented values', async () => {
  const original = { ...table(), columns: ['Project', 'CAD'], rows: [['Charlie', '650']] };
  const context = await resolve(record(original));
  const forged = { ...original, rows: [['Charlie', '999'], ['Invented', '123']],
    provenance: { type: 'illustrative', label: 'Model additions.', sourceIds: [] } };
  await assert.rejects(generateMetabloomVisual({ offer: { kind: 'table' }, context: { artifactContext: context, sources } },
    { fetchImpl: async () => Response.json(providerEnvelope({ result: forged })) }), { code: 'visual_invalid' });
});

test('single observation bars reject changed units, values, labels and extra points', async () => {
  const context = await resolve(record(singleLine()), reference({ type: 'observation', index: 1 }));
  const base = { ...common('bar-chart'), unit: 'h', points: [{ label: 'Week 3', value: 7 }] };
  for (const spec of [{ ...base, unit: 'CAD' }, { ...base, points: [{ label: 'Week 3', value: 8 }] },
    { ...base, points: [{ label: 'Week 4', value: 7 }] }, { ...base, points: [...base.points, { label: 'Invented', value: 3 }] }]) {
    await assert.rejects(generateMetabloomVisual({ offer: { kind: 'bar-chart' }, context: { artifactContext: context, sources } },
      { fetchImpl: async () => Response.json(providerEnvelope({ result: spec })) }), { code: 'visual_invalid' });
  }
});

for (const scenario of [
  { source: table(), selected: reference(), target: 'bar-chart' },
  { source: line(), selected: reference({ type: 'observation', index: 1 }), target: 'line-chart' },
  { source: pie(), selected: reference({ type: 'pie-category', index: 1 }), target: 'pie-chart' },
  { source: flow(), selected: reference({ type: 'flow-node', id: 'review' }), target: 'flowchart' },
  { source: calculator(), selected: reference({ type: 'calculator' }, { inputs: { hours: 12, rate: 75 } }), target: 'calculator' },
]) test(`unsupported ${scenario.source.kind} selection to ${scenario.target} fails before claims and providers`, async () => {
  let paid = 0, claims = 0;
  const handler = createMetabloomToolHandler({ authenticate,
    store: { getArtifactRecord: fixtureStore(record(scenario.source)).getArtifactRecord,
      claimStart: async () => { claims++; }, checkQuota: async () => { claims++; }, offer: async () => { claims++; } },
    rateLimit: async () => { claims++; return true; }, start: async () => { paid++; }, reaction: async () => { paid++; } });
  const res = response();
  await handler(request({ phase: 'start', message: `Create a ${scenario.target.replace('-', ' ')} from the selected item.`,
    history: [], requestId: 'unsupported-conversion', artifactContext: scenario.selected }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(JSON.parse(res.body).code, 'artifact_conversion_unavailable');
  const context = await resolve(record(scenario.source), scenario.selected);
  await assert.rejects(generateMetabloomVisual({ offer: { kind: scenario.target }, context: { artifactContext: context, sources } },
    { fetchImpl: async () => { paid++; } }), { code: 'visual_unavailable' });
  assert.equal(paid, 0); assert.equal(claims, 0);
});

test('illustrative and conceptual conversion provenance can never be promoted to sourced fact', async () => {
  for (const type of ['illustrative', 'conceptual']) {
    const value = record(); value.result.spec.provenance = { type, label: 'Fictional example only.', sourceIds: [] };
    value.result.sources = [];
    const context = await resolve(value);
    const modelSpec = { ...table(), rows: [['Zulu', '10']], provenance: { type: 'user', label: 'Attempted new attribution.', sourceIds: [] } };
    const output = await generateMetabloomVisual({ offer: { kind: 'table' }, context: { artifactContext: context, sources: [] } },
      { fetchImpl: async () => Response.json(providerEnvelope({ result: modelSpec })) });
    assert.deepEqual(output.provenance, value.result.spec.provenance);
  }
});
