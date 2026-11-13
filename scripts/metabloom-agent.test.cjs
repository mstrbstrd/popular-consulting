const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runMetabloomAgent, searchMetabloomWeb, retainSearchEvidence } = require('../server/metabloomAgent');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const source = { id: 1, title: 'Official announcement', url: 'https://example.com/announcement' };
const report = { notes: 'The announcement was published today. [1]', sources: [source] };
const call = (name, args, id = 'call_1') => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id, status: 'completed' });
const answer = (text = 'Hello.') => ({ type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const provider = (outputs, seen = []) => async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const payload = JSON.parse(options.body);
  seen.push(payload);
  assert(outputs.length, 'Unexpected provider call');
  const result = { status: 'completed', output: outputs.shift() };
  return payload.stream ? new Response(`data: ${JSON.stringify({ type: 'response.completed', response: result })}\n\n`,
    { headers: { 'content-type': 'text/event-stream' } }) : Response.json(result);
};
const run = options => runMetabloomAgent({ message: 'Help with this question', history: [], ...options });

test('ordinary conversation has automatic tools and needs no forced call', async () => {
  const seen = [];
  const result = await run({ message: 'Hello', fetchImpl: provider([[answer()]], seen) });
  assert.equal(result.reply.segments[0].response, 'Hello.');
  assert.deepEqual(result.sources, []);
  assert.equal(result.offer, null);
  assert.deepEqual(seen[0].tools.map(tool => tool.name), ['search_web', 'calculate', 'get_current_time']);
  assert.equal(seen[0].tool_choice, 'auto');
  assert.equal(seen[0].parallel_tool_calls, false);
  assert.equal(seen[0].store, false);
  assert.match(seen[0].instructions, /ordinary live lookups do not require switching modes/);
  assert.doesNotMatch(seen[0].instructions, /No new web research pass ran/);
});

test('search then calculation preserves private reasoning and cites real tool evidence', async () => {
  const seen = [], events = [], searches = [];
  const reasoning = { type: 'reasoning', id: 'reason_1', summary: [], encrypted_content: 'private-fixture' };
  const result = await run({ message: 'How did you miss the Nvidia news?',
    fetchImpl: provider([[reasoning, call('search_web', { query: 'Nvidia announcement today' })],
      [call('calculate', { tokens: ['12', '3', 'multiply'] }, 'call_2')], [answer('The announcement is current. [1] Twelve times three is 36.')]], seen),
    search: async query => { searches.push(query); return { report, asOf: '2026-11-12' }; },
    onTool: event => events.push(event) });
  assert.deepEqual(searches, ['Nvidia announcement today']);
  assert.deepEqual(result.sources, [source]);
  assert.deepEqual(seen[1].input[1], reasoning);
  assert.equal(JSON.parse(seen[2].input.at(-1).output).value, 36);
  assert.deepEqual(events.map(event => `${event.name}:${event.state}`), [
    'search_web:running', 'search_web:complete', 'calculate:running', 'calculate:complete']);
  assert(!JSON.stringify(events).includes('private-fixture'));
  assert(!JSON.stringify(events).includes('Nvidia'));
});

test('web adapter runs real builtin web_search and only sends the focused query', async () => {
  const seen = [];
  const output = [{ type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'announcement' } },
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'An announcement.',
      annotations: [{ type: 'url_citation', title: source.title, url: source.url, start_index: 0, end_index: 16 }] }] }];
  const found = await searchMetabloomWeb('announcement today', { timeZone: 'America/Vancouver', fetchImpl: provider([output], seen) });
  assert.equal(seen[0].tools[0].type, 'web_search');
  assert.equal(seen[0].tool_choice, 'required');
  assert.equal(seen[0].max_tool_calls, 3);
  assert.deepEqual(seen[0].input, [{ role: 'user', content: 'announcement today' }]);
  assert.deepEqual(found.report.sources, [source]);
  assert.match(found.report.notes, /\[1\]/);
});

test('source-limited requests remove search from the supplied toolset', async () => {
  const seen = [];
  await run({ message: 'Without searching, summarize this.', fetchImpl: provider([[answer()]], seen) });
  assert(!seen[0].tools.some(tool => tool.name === 'search_web'));
  await assert.rejects(run({ message: 'Without searching, summarize this.',
    fetchImpl: provider([[call('search_web', { query: 'secret' })]]) }), { reason: 'agent_tool_call' });
});

test('invalid arithmetic fails without eval; the model can explain the failure', async () => {
  for (const tokens of [['1', '0', 'divide'], ['process.exit()'], ['1', '2'], ['Infinity'], []]) {
    const seen = [], events = [];
    await run({ fetchImpl: provider([[call('calculate', { tokens })], [answer('That calculation is invalid.')]], seen), onTool: event => events.push(event) });
    assert.equal(JSON.parse(seen[1].input.at(-1).output).status, 'failed');
    assert.equal(events.at(-1).state, 'failed');
  }
});

test('clock result is the real clock in the validated user timezone', async () => {
  const seen = [], start = Date.now();
  await run({ timeZone: 'America/Vancouver', fetchImpl: provider([[call('get_current_time', {})], [answer()]], seen) });
  const result = JSON.parse(seen[1].input.at(-1).output);
  assert.equal(result.timeZone, 'America/Vancouver');
  assert(Date.parse(result.utc) >= start && Date.parse(result.utc) <= Date.now());
  assert.equal(result.status, 'complete');
});

test('visual call checks identity-scoped claims and quota, then reports only queued', async () => {
  const seen = [], operations = [], identity = { owner: 'fixture' };
  const offer = { kind: 'table', id: 'fixture-offer' };
  const result = await run({ identity, requestId: 'turn-1', visualsAvailable: true,
    visualStore: {
      claimStart: async (owner, id) => { assert.equal(owner, identity); assert.equal(id, 'turn-1'); operations.push('claim'); },
      checkQuota: async () => operations.push('quota'),
      offer: async (owner, kind, context) => { assert.equal(owner, identity); assert.equal(kind, 'table');
        assert.equal(context.toolBrief, 'Compare the supplied costs'); operations.push('offer'); return offer; },
    }, fetchImpl: provider([[call('create_visual', { kind: 'table', brief: 'Compare the supplied costs' })],
      [answer('I have requested the table.')]], seen) });
  assert.deepEqual(operations, ['claim', 'quota', 'offer']);
  assert.deepEqual(JSON.parse(seen[1].input.at(-1).output), { status: 'queued', kind: 'table', display: 'unconfirmed' });
  assert.equal(result.offer, offer);
  assert.match(seen[0].instructions, /Queued means requested for browser generation, not generated or displayed/);
});

test('visual quota failure does not create an offer or claim generation', async () => {
  const seen = [];
  const result = await run({ visualsAvailable: true, visualStore: {
    claimStart: async () => {}, checkQuota: async () => { throw Object.assign(new Error(), { code: 'visual_quota' }); },
    offer: () => assert.fail('No offer after quota denial'),
  }, fetchImpl: provider([[call('create_visual', { kind: 'table', brief: 'Costs' })], [answer('The visual quota is exhausted.')]], seen) });
  assert.equal(result.offer, null);
  assert.deepEqual(JSON.parse(seen[1].input.at(-1).output), { status: 'failed', code: 'quota_exceeded' });
});

test('source namespaces merge by URL and retain only complete cited passages', () => {
  const result = retainSearchEvidence({ notes: 'Same source. [2]\n\nNew source. [1]', sources: [
    { ...source, url: 'https://example.com/new' }, { ...source, id: 2 },
  ] }, [source]);
  assert.equal(result.notes, 'Same source. [1]\n\nNew source. [2]');
  assert.equal(result.sources.length, 2);
  const full = Array.from({ length: 8 }, (_, i) => ({ ...source, id: i + 1, url: `https://example.com/${i}` }));
  assert.throws(() => retainSearchEvidence(report, full), { reason: 'agent_search_evidence' });
});

test('search evidence cannot become an uncited answer or invented citation', async () => {
  for (const text of ['No citation.', 'Unknown source [2].']) await assert.rejects(run({
    search: async () => ({ report }), fetchImpl: provider([[call('search_web', { query: 'news' })], [answer(text)]]),
  }), { code: 'research_invalid_citations' });
  await assert.rejects(run({ fetchImpl: provider([[answer('Invented [1].')]]) }), { reason: 'agent_unsourced_citation' });
});

test('failed search returns an honest failure result and can finish without sources', async () => {
  const seen = [];
  const result = await run({ search: async () => { throw new Error('Private provider diagnostic'); },
    fetchImpl: provider([[call('search_web', { query: 'news' })], [answer('The search failed; I could not verify current coverage.')]], seen) });
  assert.deepEqual(result.sources, []);
  assert(!seen[1].input.at(-1).output.includes('Private'));
  assert.equal(JSON.parse(seen[1].input.at(-1).output).status, 'failed');
});

test('unknown, duplicate, parallel, and malformed calls fail closed', async () => {
  for (const output of [[call('deploy', {})], [call('calculate', {}), call('calculate', {}, 'call_2')],
    [{ ...call('calculate', {}), arguments: '{broken' }], [{ type: 'web_search_call', status: 'completed' }, answer()]]) {
    await assert.rejects(run({ fetchImpl: provider([output]) }), { code: 'answer_invalid' });
  }
  await assert.rejects(run({ fetchImpl: provider([[call('get_current_time', {})], [call('get_current_time', {})]]) }), { reason: 'agent_tool_call' });
});

test('four calls exhaust the budget and the last model step has no tools', async () => {
  const seen = [];
  await run({ fetchImpl: provider([...Array.from({ length: 4 }, (_, i) => [call('get_current_time', {}, `call_${i}`)]), [answer()]], seen) });
  assert.equal(seen.length, 5);
  assert.deepEqual(seen[4].tools, []);
  assert.equal(seen[4].tool_choice, 'none');
  await assert.rejects(run({ fetchImpl: provider(Array.from({ length: 5 }, (_, i) => [call('get_current_time', {}, `call_${i}`)])) }), { reason: 'agent_tool_call' });
});

test('cancellation stops between tool and model continuation', async () => {
  const controller = new AbortController(), seen = [];
  await assert.rejects(run({ signal: controller.signal, fetchImpl: provider([[call('search_web', { query: 'news' })]], seen),
    search: async () => { controller.abort(); return { report }; } }), { name: 'AbortError' });
  assert.equal(seen.length, 1);
});

test('web execution is capped at two searches even if the model asks again', async () => {
  let searches = 0;
  const seen = [];
  await run({ search: async () => { searches++; return { report }; }, fetchImpl: provider([
    ...Array.from({ length: 3 }, (_, i) => [call('search_web', { query: 'news' }, `search_${i}`)]), [answer('Verified. [1]')],
  ], seen) });
  assert.equal(searches, 2);
  assert.equal(JSON.parse(seen[3].input.at(-1).output).status, 'failed');
});

test('only one visual can be queued and unsupported kinds cannot reach storage', async () => {
  let offers = 0;
  const seen = [], store = { claimStart: async () => {}, checkQuota: async () => {},
    offer: async () => { offers++; return { kind: 'table', id: 'fixture' }; } };
  await run({ visualsAvailable: true, visualStore: store, fetchImpl: provider([
    [call('create_visual', { kind: 'map', brief: 'Map' })],
    [call('create_visual', { kind: 'table', brief: 'Costs' }, 'visual_2')],
    [call('create_visual', { kind: 'table', brief: 'Costs again' }, 'visual_3')], [answer('I requested a table.')],
  ], seen) });
  assert.equal(offers, 1);
  assert.equal(JSON.parse(seen[1].input.at(-1).output).status, 'failed');
  assert.equal(JSON.parse(seen[3].input.at(-1).output).status, 'failed');
});

test('oversized, incomplete, and malformed provider envelopes never complete', async () => {
  for (const response of [Response.json({ status: 'incomplete', output: [answer()] }),
    new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    Response.json({ status: 'completed', output: [], padding: 'x'.repeat(131072) })]) {
    await assert.rejects(run({ fetchImpl: async () => response }));
  }
});

const initial = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' }];
const activity = state => ({ type: 'tool_activity', name: 'search_web', callId: 'call_1', state });
const finish = [{ type: 'segment', index: 0, response: 'Verified. [1]' }, { type: 'text_complete' },
  { type: 'emote', phase: 'response', emote: 'neutral' }, { type: 'done', version: '2.0.0' }];
const decode = (events, options = {}) => { const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, ...options });
  decoder.push(events.map(event => JSON.stringify(event)).join('\n') + '\n'); return decoder.finish(); };
test('ordinary tool streams validate activity and attach citations without Deep Research', () => {
  const events = [], sources = [];
  assert(decode([...initial, activity('running'), activity('complete'), { type: 'tool_sources', sources: [source] }, ...finish],
    { onToolActivity: event => events.push(event), onSources: value => sources.push(value) }).ok);
  assert.equal(events.length, 2); assert.deepEqual(sources, [[source]]);
});
test('tool streams reject unnegotiated, orphaned, reordered, and fabricated records', () => {
  for (const tail of [[activity('complete')], [activity('running'), ...finish],
    [activity('running'), activity('complete'), ...finish], [{ type: 'tool_sources', sources: [source] }, ...finish],
    [activity('running'), { ...activity('complete'), name: 'calculate' }],
    [activity('running'), activity('failed'), { type: 'tool_sources', sources: [source] }],
    [activity('running'), { ...activity('complete'), private: 'reasoning' }],
    [activity('running'), activity('complete'), activity('running')]]) assert(!decode([...initial, ...tail]).ok);
  assert(!decode([...initial, activity('running')], { allowTools: false }).ok);
});
