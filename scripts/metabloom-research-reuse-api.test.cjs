const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const researchStores = require('../server/metabloomResearchStore');
const { identity, asOf, message, temporalContext, sources, report, brief, memoryStore } = require('./fixtures/metabloom-research-reuse.cjs');
let fixture = memoryStore();
researchStores.createMetabloomResearchStore = () => fixture.store;
const handler = require('../api/metabloom');
const { createMetabloomToolHandler } = require('../api/metabloom-tool');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const { generateMetabloomVisual } = require('../server/metabloomVisualGenerator');
const { createMetabloomVisualStore } = require('../server/metabloomVisualStore');
const { requestVisualTool, continueVisualTool, MAX_RESEARCH_TOOL_STORED_BYTES } = require('../server/metabloomToolFlow');
const { resolveMetabloomResearchContext, buildMetabloomResearchVisualContext } = require('../server/metabloomResearchContext');

const originalFetch = global.fetch, originalEnv = { ...process.env };
const envKeys = ['OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL', 'VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN', 'METABLOOM_VISUALS_ENABLED', 'METABLOOM_UI_TOOLS_ENABLED'];
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: '', writableEnded: false, destroyed: false,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, write(value) { this.body += value; return true; },
  end(value = '') { this.body += value; this.writableEnded = true; } });
const request = changes => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' },
  socket: { remoteAddress: '127.0.0.1' }, body: { message, history: [], actionMode: 'deep-research', streamText: true,
    streamResearchDetails: true, streamResearchBrief: true, streamResearchReuse: true, timeZone: 'UTC', ...changes } });
const records = res => res.body.trim().split('\n').map(line => JSON.parse(line));
const save = async () => {
  const metadata = await fixture.store.saveReport(identity, { message, report: report(), temporalContext: temporalContext() });
  return fixture.store.saveBrief(identity, metadata.researchId, brief());
};
const envelope = value => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const writerReply = text => {
  const value = { version: '2.0.0', segments: [{ response: text }] };
  return new Response([{ type: 'response.output_text.delta', item_id: 'answer', output_index: 0, content_index: 0, delta: JSON.stringify(value) },
    { type: 'response.completed', response: envelope(value) }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
  { headers: { 'content-type': 'text/event-stream' } });
};
const researchReply = () => {
  const paragraphs = sources.map(source => `Program ${source.id} has a documented local trial. The original evidence does not establish national coverage.`);
  let offset = 0;
  const annotations = sources.map((source, index) => {
    const annotation = { type: 'url_citation', title: source.title, url: source.url, start_index: offset, end_index: offset + paragraphs[index].length };
    offset += paragraphs[index].length + 2; return annotation;
  });
  return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'Fictional public programs' } },
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: paragraphs.join('\n\n'), annotations }] },
  ] } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
};
const formatterReply = () => Response.json(envelope({ title: 'Two fictional programs', scope: 'Fictional local programs',
  limitations: ['Only two programs were established.'], items: brief().items.map(({ developmentDate, ...item }) => item), sourceDetails: [] }));
const installProvider = ({ writer = 'Program 10 has a documented local trial [10].', formatter = formatterReply } = {}) => {
  const calls = [];
  global.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses', 'No external service may be called by these local fixtures');
    const body = JSON.parse(options.body), phase = body.tools ? 'research'
      : body.text.format.name === 'metabloom_research_brief' ? 'brief' : 'writer';
    calls.push({ phase, body, signal: options.signal });
    return phase === 'research' ? researchReply() : phase === 'brief' ? formatter(body) : writerReply(writer);
  };
  return calls;
};
const decode = res => {
  const seen = { sources: [], reports: [] };
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true, allowResearchReuse: true,
    onSources: value => seen.sources.push(value), onResearchDetails: value => seen.reports.push(value) });
  for (let offset = 0; offset < res.body.length; offset += 97) assert.equal(decoder.push(res.body.slice(offset, offset + 97)), true);
  assert.equal(decoder.finish().ok, true); return seen;
};

beforeEach(() => {
  fixture = memoryStore();
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => { options.onIdentity(identity); return null; });
  mock.method(Date, 'now', () => fixture.clock.value);
  mock.method(console, 'info', () => {}); mock.method(console, 'error', () => {});
  process.env.NODE_ENV = 'test'; process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-test-key';
  process.env.METABLOOM_VISUALS_ENABLED = 'true';
  for (const key of ['TYPESAFE_API_KEY', 'VERCEL', 'METABLOOM_UI_TOOLS_ENABLED']) delete process.env[key];
  global.fetch = async () => { assert.fail('Unexpected network call'); };
});
afterEach(() => {
  mock.restoreAll(); global.fetch = originalFetch; handler._internals.localBuckets.clear();
  for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
});

test('fresh research persists a reusable base before its formatter, then adds an immutable brief handle', async () => {
  const calls = installProvider({ formatter: () => {
    assert.equal([...fixture.values.keys()].filter(key => key.includes(':report:')).length, 1);
    return formatterReply();
  } });
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200); assert.deepEqual(calls.map(call => call.phase), ['research', 'brief']);
  const wire = records(res), references = wire.filter(event => event.type === 'research_reference');
  assert.equal(references.length, 2); assert(!references[0].research.briefId); assert(references[1].research.briefId);
  assert.deepEqual({ ...references[1].research, briefId: undefined }, { ...references[0].research, briefId: undefined });
  assert(wire.findIndex(event => event.type === 'research_report_complete') < wire.indexOf(references[0]));
  assert(wire.indexOf(references[0]) < wire.findIndex(event => event.type === 'sources'));
  assert(wire.findIndex(event => event.type === 'research_brief_complete') < wire.indexOf(references[1]));
  assert.equal(decode(res).reports[0].sources.length, 10);
});

test('report, brief and finding reuse override lingering Deep Research and issue exactly one writer with no research pass', async () => {
  const metadata = await save();
  for (const selector of [{ type: 'report' }, { type: 'brief', briefId: metadata.briefId },
    { type: 'finding', briefId: metadata.briefId, index: 1 }]) {
    const beforeWrites = fixture.commands.filter(command => command[0] === 'SET').length;
    const calls = installProvider(), res = response();
    await handler(request({ message: 'Explain the scope of program 10.', researchContext: { researchId: metadata.researchId, selector } }), res);
    assert.equal(res.statusCode, 200); assert.deepEqual(calls.map(call => call.phase), ['writer']);
    assert.equal(calls[0].body.tools, undefined); assert.match(calls[0].body.instructions, /No new web search or verification occurred/);
    const contextMessage = calls[0].body.input.find(item => item.content.startsWith('Previously completed research'));
    const context = JSON.parse(contextMessage.content.slice(contextMessage.content.indexOf('\n') + 1));
    assert.equal(context.research.asOf, asOf); assert.deepEqual(context.temporalContext, temporalContext());
    if (selector.type !== 'report') assert.deepEqual(context.coverage, brief().coverage);
    if (selector.type === 'finding') assert.deepEqual(context.finding, brief().items[1]);
    const wire = records(res);
    assert.deepEqual(wire.filter(event => event.type === 'action'), [{ type: 'action', action: 'none' }]);
    assert.equal(wire.some(event => event.state === 'searching'), false);
    assert.equal(wire.findIndex(event => event.type === 'research_reuse'), 2);
    assert.equal(wire.at(-1).type, 'done');
    const seen = decode(res);
    assert.deepEqual(seen.reports[0], report());
    assert.equal(seen.sources[0].find(source => source.id === 10).url, sources[9].url);
    assert.equal(fixture.commands.filter(command => command[0] === 'SET').length, beforeWrites, 'Reuse must not extend retention');
  }
});

test('expired, foreign and unavailable references fail before quotas or provider requests', async () => {
  const metadata = await save();
  const ref = { researchId: metadata.researchId, selector: { type: 'report' } };
  for (const failure of ['expired', 'foreign', 'unavailable']) {
    const calls = installProvider();
    const oldStore = fixture.store;
    fixture.store = failure === 'expired' ? { getReport: async () => null }
      : failure === 'foreign' ? { getReport: async (...args) => oldStore.getReport({ ...identity, owner: 'f'.repeat(64) }, ...args.slice(1)) }
        : { getReport: async () => { throw new Error('private failure'); } };
    const res = response(); await handler(request({ researchContext: ref, message: 'Explain this finding.' }), res);
    assert.equal(res.statusCode, failure === 'unavailable' ? 503 : 410);
    assert.equal(JSON.parse(res.body).code, 'research_reference_unavailable');
    assert.equal(calls.length, 0); assert.equal(handler._internals.localBuckets.size, 0);
    fixture.store = oldStore;
  }
});

test('malformed negotiation, caller evidence and mixed artifact/research context fail request validation', async () => {
  const calls = installProvider(), ref = { researchId: 'd'.repeat(48), selector: { type: 'report' } };
  for (const change of [{ streamResearchReuse: 'yes' }, { streamResearchReuse: true, streamResearchDetails: false },
    { researchContext: ref, streamResearchReuse: false }, { researchContext: { ...ref, notes: 'forged evidence' } },
    { researchContext: ref, artifactContext: { id: 'e'.repeat(48), inputs: {} } }]) {
    const res = response(); await handler(request(change), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0); assert.equal(fixture.commands.length, 0);
});

test('attached research preserves fixed unsupported-format replies without Jev or providers and still resolves ownership first', async () => {
  const metadata = await save(), reference = { researchId: metadata.researchId, selector: { type: 'report' } };
  const calls = installProvider();
  process.env.TYPESAFE_API_KEY = 'fictional-jev-key-that-must-not-be-used';
  for (const configured of [true, false]) {
    if (configured) process.env.OPENAI_API_KEY = 'fictional-test-key'; else delete process.env.OPENAI_API_KEY;
    for (const prompt of ['Show me a map of Kelowna BC.', 'Refresh this research and show me a map of Kelowna BC.']) {
      const res = response(); await handler(request({ message: prompt, researchContext: reference }), res);
      assert.equal(res.statusCode, 200);
      const wire = records(res), answer = wire.find(event => event.type === 'segment').response;
      assert.match(answer, /map/i);
      assert.equal(wire.some(event => ['research_reuse', 'research', 'research_reference'].includes(event.type)), false);
      assert.deepEqual(wire.filter(event => event.type === 'action'), [{ type: 'action', action: 'none' }]);
      assert.equal(wire.at(-1).type, 'done');
      assert.equal(decode(res).reports.length, 0);
    }
  }
  assert.equal(calls.length, 0);
  handler._internals.localBuckets.clear();
  fixture.clock.value = Date.parse(metadata.expiresAt);
  const expired = response(); await handler(request({ message: 'Show me a map of Kelowna BC.', researchContext: reference }), expired);
  assert.equal(expired.statusCode, 410); assert.equal(JSON.parse(expired.body).code, 'research_reference_unavailable');
  assert.equal(calls.length, 0); assert.equal(handler._internals.localBuckets.size, 0);
});

test('reuse validates original sparse citations before making answer text visible', async () => {
  const metadata = await save(), calls = installProvider({ writer: 'This belongs to a different source [1].' }), res = response();
  await handler(request({ message: 'Explain the selected finding.', researchContext:
    { researchId: metadata.researchId, selector: { type: 'finding', briefId: metadata.briefId, index: 1 } } }), res);
  assert.deepEqual(calls.map(call => call.phase), ['writer']);
  const wire = records(res);
  assert.equal(wire.at(-1).code, 'research_invalid_citations');
  assert.equal(wire.some(event => ['text_delta', 'segment'].includes(event.type)), false);
  assert.equal(wire.some(event => event.type === 'research_report_complete'), true);
});

test('persistence or formatting failure preserves the paid report without research retries', async () => {
  for (const failure of ['persistence', 'formatter']) {
    const originalStore = fixture.store;
    if (failure === 'persistence') fixture.store = { saveReport: async () => { throw new Error('storage failed'); } };
    const calls = installProvider({ formatter: failure === 'formatter' ? () => Response.json({ error: 'fixture failure' }, { status: 503 }) : formatterReply });
    const res = response(); await handler(request(), res);
    assert.deepEqual(calls.map(call => call.phase), ['research', 'brief']);
    const wire = records(res); assert.equal(wire.at(-1).type, 'done');
    assert.equal(decode(res).reports[0].sources.length, 10);
    assert.equal(wire.some(event => event.type === 'research_reference'), failure !== 'persistence');
    fixture.store = originalStore;
  }
});

test('old clients receive neither persistence writes nor new metadata vocabulary', async () => {
  const calls = installProvider(), res = response(); await handler(request({ streamResearchReuse: undefined }), res);
  assert.deepEqual(calls.map(call => call.phase), ['research', 'brief']);
  assert.equal(fixture.commands.length, 0);
  assert.equal(records(res).some(event => ['research_reference', 'research_reuse'].includes(event.type)), false);
});

test('an explicit fresh request resolves its attachment then runs new research without the old source namespace', async () => {
  const metadata = await save(), calls = installProvider(), res = response();
  await handler(request({ message: 'Refresh this research.', actionMode: 'none', researchContext:
    { researchId: metadata.researchId, selector: { type: 'finding', briefId: metadata.briefId, index: 1 } } }), res);
  assert.deepEqual(calls.map(call => call.phase), ['research', 'brief']);
  assert(records(res).some(event => event.state === 'searching'));
  assert(!records(res).some(event => event.type === 'research_reuse'));
  const background = calls[0].body.input.find(item => item.content.startsWith('The user requested a fresh research pass'));
  assert(background); assert(!background.content.includes('https://example.org/'));
  assert(!background.content.includes('"sources"'));
  const updated = records(res).find(event => event.type === 'research_reference').research;
  assert.notEqual(updated.researchId, metadata.researchId);
});

test('a missing-news follow-up can refresh an attached report without reusing its evidence or citation IDs', async () => {
  const metadata = await save(), calls = installProvider(), res = response();
  await handler(request({ message: 'How did you miss the Nvidia news?', actionMode: 'none',
    history: [{ role: 'user', content: 'Deep research the top five global news stories today.' },
      { role: 'assistant', content: 'The research completed but its summary is unavailable.' }],
    researchContext: { researchId: metadata.researchId, selector: { type: 'report' } } }), res);
  assert.deepEqual(calls.map(call => call.phase), ['research', 'brief']);
  assert.equal(records(res).find(event => event.type === 'action').action, 'deep-research');
  assert(!records(res).some(event => event.type === 'research_reuse'));
  assert.equal(records(res).at(-1).type, 'done');
  const background = calls[0].body.input.find(item => item.content.startsWith('The user requested a fresh research pass'));
  assert(background); assert(!background.content.includes('"sources"'));
  assert.notEqual(records(res).find(event => event.type === 'research_reference').research.researchId, metadata.researchId);
  assert.equal(decode(res).reports.length, 1);
});

test('an offline refresh request keeps attached evidence and does not start a new search', async () => {
  const metadata = await save(), calls = installProvider(), res = response();
  await handler(request({ message: 'Refresh this research offline.', actionMode: 'deep-research',
    researchContext: { researchId: metadata.researchId, selector: { type: 'report' } } }), res);
  assert.deepEqual(calls.map(call => call.phase), ['writer']);
  assert.equal(records(res).find(event => event.type === 'action').action, 'none');
  assert(records(res).some(event => event.type === 'research_reuse'));
  assert.equal(records(res).at(-1).type, 'done');
});

test('Stop after report completion prevents persistence and formatter work', async () => {
  const calls = installProvider(), res = response(), write = res.write;
  res.write = function(value) { write.call(this, value); if (JSON.parse(value).type === 'research_report_complete') {
    this.destroyed = true; this.emit('close'); } return true; };
  await handler(request(), res);
  assert.deepEqual(calls.map(call => call.phase), ['research']);
  assert.equal(fixture.commands.filter(command => command[0] === 'SET').length, 0);
});

test('tool reuse resolves before claims, supplies exact qualitative projection and never adopts new message quantities', async () => {
  const metadata = await save();
  let claimed = 0, started = 0, captured;
  const toolHandler = createMetabloomToolHandler({ researchStore: fixture.store,
    authenticate: async (_request, options) => { options.onIdentity(identity); return null; },
    store: { claimStart: async () => { claimed++; }, checkQuota: async () => {},
      offer: async (_identity, kind, context) => { captured = context; return { id: 'e'.repeat(48), kind }; } },
    rateLimit: async () => true, reaction: async () => 'neutral', start: async options => {
      started++; assert(options.researchContext.projection); return { kind: options.requiredKind, brief: 'Copy exact data', tool: {} }; } });
  const req = request(); req.body = { phase: 'start', requestId: 'fictional-tool-1', message: 'Create a table from this finding. Budget 999999.', history: [],
    researchContext: { researchId: metadata.researchId, selector: { type: 'finding', briefId: metadata.briefId, index: 1 } } };
  const res = response(); await toolHandler(req, res);
  assert.equal(res.statusCode, 200); assert.equal(claimed, 1); assert.equal(started, 1);
  assert.equal(captured.dataHints, null); assert.deepEqual(captured.sources, [sources[9]]);
  assert(!JSON.stringify(captured.researchContext.projection).includes('999999'));
  for (const message of ['Create a bar chart from this finding.', 'Refresh this research and create a table.']) {
    const bad = response(); await toolHandler({ ...req, body: { ...req.body, message } }, bad);
    assert.equal(bad.statusCode, message.startsWith('Refresh') ? 400 : 422);
  }
  const missing = response(); await toolHandler({ ...req, body: { ...req.body, researchContext:
    { researchId: 'f'.repeat(48), selector: { type: 'report' } } } }, missing);
  assert.equal(missing.statusCode, 410); assert.equal(claimed, 1); assert.equal(started, 1);
  const oversized = brief(); oversized.coverage.limitations = Array.from({ length: 8 }, () => '漢'.repeat(600));
  const large = await fixture.store.saveBrief(identity, metadata.researchId, oversized);
  const tooLarge = response(); await toolHandler({ ...req, body: { ...req.body, researchContext:
    { researchId: metadata.researchId, selector: { type: 'brief', briefId: large.briefId } } } }, tooLarge);
  assert.equal(tooLarge.statusCode, 422); assert.equal(JSON.parse(tooLarge.body).code, 'research_conversion_unavailable');
  assert.equal(claimed, 1); assert.equal(started, 1, 'An impossible replay budget must fail before claims or the planner');
});

test('large Unicode research projects once while compact replay and the escaped Redis offer stay within existing bounds', async () => {
  const metadata = await save();
  const resolved = await resolveMetabloomResearchContext({ store: fixture.store, identity,
    reference: { researchId: metadata.researchId, selector: { type: 'finding', briefId: metadata.briefId, index: 1 } } });
  const visual = buildMetabloomResearchVisualContext(resolved, 'table');
  visual.researchContext.projection.rows = Array.from({ length: 12 }, () => ['漢'.repeat(400), '[10]']);
  assert(Buffer.byteLength(JSON.stringify(visual), 'utf8') <= 18000);
  const question = `Create a table. ${'漢'.repeat(1500)}`;
  const history = [{ role: 'assistant', content: '漢'.repeat(1300) }, { role: 'user', content: 'Please preserve the original data.' }];
  const output = [{ type: 'function_call', name: 'create_visual', call_id: 'call_fictional_reuse',
    arguments: JSON.stringify({ kind: 'table', brief: '漢'.repeat(1200) }) }];
  assert(Buffer.byteLength(JSON.stringify({ message: question, history, researchContext: visual.researchContext, output }), 'utf8') > 24000);
  let plannerInput;
  const call = await requestVisualTool({ message: question, history, requiredKind: 'table', researchContext: visual.researchContext,
    fetchImpl: async (_url, options) => { plannerInput = JSON.parse(options.body); return Response.json({ status: 'completed', output }); } });
  const projection = plannerInput.input.find(entry => entry.content.startsWith('Saved research projection'));
  assert(projection.content.includes('"projection"'));
  assert(!Object.hasOwn(call.tool.researchContext, 'projection'));
  assert(!Object.hasOwn(call.tool.researchContext, 'finding'));
  assert.deepEqual(call.tool.researchContext.coverage, brief().coverage);
  assert(Buffer.byteLength(JSON.stringify(call.tool.history), 'utf8') <= 4000);
  assert(Buffer.byteLength(JSON.stringify(call.tool), 'utf8') <= 24000);
  assert(Buffer.byteLength(JSON.stringify(JSON.stringify(call.tool)), 'utf8') <= MAX_RESEARCH_TOOL_STORED_BYTES);
  let savedBytes;
  const visualStore = createMetabloomVisualStore({ command: async args => {
    savedBytes = Buffer.byteLength(args[2], 'utf8'); return 'OK'; } });
  assert(await visualStore.offer(identity, 'table', { message: question, answer: '', toolBrief: call.brief,
    sources: visual.sources, researchContext: visual.researchContext, recentConversation: [],
    tool: call.tool, visualIntent: 'requested', dataHints: null }));
  assert(savedBytes <= 65536);
  await continueVisualTool({ tool: call.tool, result: { status: 'ready', spec: { kind: 'table', title: 'Fictional table', summary: 'Stored evidence.' } },
    display: 'mounted', fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      const provenance = payload.input.find(entry => entry.content?.startsWith('Saved research provenance'));
      assert(provenance); assert(!provenance.content.includes('"projection"'));
      return Response.json(envelope({ version: '2.0.0', segments: [{ response: 'Your table is ready from the saved research.' }] }));
    } });
});

test('visual generation cannot change a retained numeric projection and inherits original dated provenance', async () => {
  const original = report(); original.notes = '| Program | Cost (CAD) |\n| --- | --- |\n| Alpha | 12.5 |\n| Beta | 18.75 |\n[9]';
  const metadata = await fixture.store.saveReport(identity, { message, report: original, temporalContext: temporalContext() });
  const context = await resolveMetabloomResearchContext({ store: fixture.store, identity,
    reference: { researchId: metadata.researchId, selector: { type: 'report' } } });
  const visual = buildMetabloomResearchVisualContext(context, 'bar-chart');
  const expected = { version: '1', designVersion: 'aetheris-1', title: 'Fictional costs', summary: 'Two documented fictional costs.',
    ...visual.researchContext.projection, provenance: visual.researchContext.provenance };
  const record = { offer: { kind: 'bar-chart' }, context: { message: 'Create a bar chart.', ...visual } };
  const fetchImpl = value => async () => Response.json(envelope({ result: value }));
  assert.deepEqual(await generateMetabloomVisual(record, { fetchImpl: fetchImpl(expected) }), expected);
  const changed = { ...expected, points: [{ label: 'Alpha', value: 999 }, expected.points[1]] };
  await assert.rejects(generateMetabloomVisual(record, { fetchImpl: fetchImpl(changed) }), { code: 'visual_invalid' });
});
