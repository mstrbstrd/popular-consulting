const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runMetabloomAgent } = require('../server/metabloomAgent');
const { modelCatalog } = require('../server/metabloomModels');
const { createMetabloomAgentLifecycle } = require('../src/components/metabloomAgentTools');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const original = { ...process.env }, originalFetch = global.fetch;
const keys = ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL_ENV',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'METABLOOM_EXPRESSIONS_ENABLED'];
const selection = { provider: 'deepseek', model: 'deepseek-flash' };
const orbContext = { version: 1, enabled: true, visible: true, backgroundEnabled: true, paused: false,
  reducedMotion: false, intensity: 0.8, emote: 'neutral', lastExpression: null };
const text = value => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: value }] });
const answer = value => text(JSON.stringify({ version: '2.0.0', segments: [{ response: value }] }));
const call = (name, args, id) => ({ type: 'function_call', name, call_id: id, arguments: JSON.stringify(args) });
const response = output => Response.json({ status: 'completed', output });
const run = options => runMetabloomAgent({ message: "Can you show me what you're made of?", history: [],
  requestId: 'turn-1', requestRef: 'abcdef123456', modelSelection: selection, ...options });
beforeEach(() => {
  for (const key of keys) delete process.env[key];
  for (const key of keys.slice(0, 3)) process.env[key] = 'fictional-' + key;
  process.env.VERCEL_ENV = 'development'; modelCatalog.clear(); handler._internals.localBuckets.clear();
});
afterEach(() => {
  mock.restoreAll(); global.fetch = originalFetch; modelCatalog.clear();
  for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
});

test('completed blank JSON after expression and visual tools recovers without replaying either action', async () => {
  const requests = [], events = [], operations = [], controller = new AbortController();
  const lifecycle = createMetabloomAgentLifecycle({ requireStatus: true });
  const observe = event => { assert(lifecycle.accept(event)); events.push(event); };
  const offer = { id: 'fixture-offer', kind: 'flowchart' }, identity = { owner: 'fixture' };
  const history = [{ role: 'assistant', content: 'I can use words, the Orb and native visuals.' }];
  const result = await run({ history, orbContext, identity, visualsAvailable: true, signal: controller.signal,
    onTool: observe, onStatus: observe, visualStore: {
      claimStart: async (owner, id) => { assert.equal(owner, identity); assert.equal(id, 'turn-1'); operations.push('claim'); },
      checkQuota: async () => operations.push('quota'),
      offer: async () => { operations.push('offer'); return offer; },
    }, fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.deepseek.com/responses'); assert.equal(options.signal, controller.signal);
      const body = JSON.parse(options.body); requests.push(body); assert.equal(body.model, selection.model);
      if (requests.length === 1) return response([
        call('express_orb', { emote: 'curious' }, 'expression_1'),
        call('create_visual', { kind: 'flowchart', brief: 'A conceptual map of the available tools, not actual model internals.' }, 'visual_1'),
      ]);
      if (requests.length === 2) return response([text('   \n   ')]);
      assert.equal(requests.length, 3, 'Only one final-answer regeneration');
      assert.deepEqual(body.input, requests[1].input, 'Preserve actual tool results without adding rejected text');
      assert.deepEqual(body.text, requests[1].text); assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, 'none');
      assert.match(body.instructions, /No tools are enabled for this response/);
      assert.doesNotMatch(body.instructions, /Use native tool calls when needed/);
      assert.deepEqual(body.input.filter(item => item.type === 'function_call_output').map(item => JSON.parse(item.output).status), ['queued', 'queued']);
      assert(lifecycle.canAnswer());
      return response([answer('I have requested a conceptual map and chosen a curious gesture.')]);
    } });
  assert.equal(requests.length, 3); assert.deepEqual(operations, ['claim', 'quota', 'offer']);
  assert.deepEqual(result.expression, { emote: 'curious' }); assert.equal(result.offer, offer);
  assert.deepEqual(events.filter(event => event.type === 'tool_activity').map(event => [event.callId, event.state]),
    [['expression_1', 'running'], ['expression_1', 'complete'], ['visual_1', 'running'], ['visual_1', 'complete']]);
  assert.equal(events.filter(event => event.state === 'validating').length, 1);
});

test('format recovery does not restart exhausted tool or model loops', async () => {
  const requests = [], events = [];
  await run({ onTool: event => events.push(event), fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    if (requests.length <= 4) return response([call('get_current_time', {}, 'clock_' + requests.length)]);
    assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, 'none');
    if (requests.length === 5) return response([text('not JSON')]);
    assert.equal(requests.length, 6); return response([answer('The clock has been checked.')]);
  } });
  assert.equal(requests.length, 6); assert.equal(events.filter(event => event.state === 'running').length, 4);
  assert.deepEqual(requests[5].input, requests[4].input);
});

test('a provider cannot execute a tool during final-answer recovery', async () => {
  let requests = 0; const events = [];
  await assert.rejects(run({ onTool: event => events.push(event), fetchImpl: async () => {
    requests++;
    return response(requests === 1 ? [text('not JSON')] : [call('get_current_time', {}, 'forbidden'), answer('Done.')]);
  } }), { reason: 'agent_message' });
  assert.equal(requests, 2); assert.deepEqual(events, []);
});

test('recovered answers still require citations from the actual search evidence', async () => {
  for (const finalText of ['Verified. [1]', 'Invented source. [2]', 'Missing citation.']) {
    let requests = 0, searches = 0;
    const options = { search: async () => { searches++; return { report: { notes: 'Verified. [1]',
      sources: [{ id: 1, title: 'Evidence', url: 'https://example.com/evidence' }] } }; },
    fetchImpl: async () => {
      if (++requests === 1) return response([call('search_web', { query: 'Current evidence' }, 'web_1')]);
      return response([requests === 2 ? text('not JSON') : answer(finalText)]);
    } };
    if (finalText === 'Verified. [1]') assert.equal((await run(options)).reply.segments[0].response, finalText);
    else await assert.rejects(run(options), { code: 'research_invalid_citations' });
    assert.equal(requests, 3); assert.equal(searches, 1);
  }
  let requests = 0;
  await assert.rejects(run({ fetchImpl: async () => {
    requests++; return response([answer('Invented source. [1]')]);
  } }), { reason: 'agent_unsourced_citation' });
  assert.equal(requests, 1, 'Citation failures do not trigger format regeneration');
});

test('transport, refusal, truncation and malformed response envelopes never trigger format recovery', async () => {
  const responses = [
    () => new Response('private provider error', { status: 429 }),
    () => new Response('private provider error', { status: 401 }),
    () => Response.json({ status: 'incomplete', output: [text('not JSON')] }),
    () => response([{ ...text(''), content: [{ type: 'refusal', refusal: 'Cannot comply.' }] }]),
    () => response([{ ...text('not JSON'), status: 'incomplete' }]),
    () => response([text('not JSON'), text('another message')]),
    () => response([text({})]),
  ];
  for (const makeResponse of responses) {
    let requests = 0;
    await assert.rejects(run({ fetchImpl: async () => { requests++; return makeResponse(); } }));
    assert.equal(requests, 1);
  }
});

test('cancellation before or during recovery prevents a late answer and does not replace the deadline signal', async () => {
  for (const when of ['validating', 'retry']) {
    const controller = new AbortController(); let requests = 0;
    await assert.rejects(run({ signal: controller.signal,
      onStatus: event => { if (when === 'validating' && event.state === 'validating') controller.abort(); },
      fetchImpl: async (_url, options) => {
        assert.equal(options.signal, controller.signal); requests++;
        if (requests === 1) return response([text('not JSON')]);
        controller.abort(); return response([answer('This late answer must never be released.')]);
      } }), { name: 'AbortError' });
    assert.equal(requests, when === 'validating' ? 1 : 2);
  }
});

test('OpenAI and Claude keep their existing single-attempt format failure behavior', async () => {
  for (const provider of ['openai', 'anthropic']) {
    let requests = 0;
    await assert.rejects(run({ modelSelection: { provider, model: provider === 'openai' ? 'gpt-5-mini' : 'claude-opus' },
      fetchImpl: async () => {
        requests++;
        return provider === 'openai' ? response([text('not JSON')]) : Response.json({ type: 'message', role: 'assistant',
          stop_reason: 'end_turn', content: [{ type: 'text', text: 'not JSON' }] });
      } }), { reason: 'agent_answer' });
    assert.equal(requests, 1);
  }
});

test('the API and browser decoder release one expression only after a recovered answer validates', async () => {
  mock.method(auth, 'requireMetabloomSession', async () => null);
  for (const succeeds of [true, false]) {
    let requests = 0; const emitted = [], reactions = [];
    global.fetch = async (url, options) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: selection.model, name: 'DeepSeek-V4.1-Flash' }] });
      assert.equal(url, 'https://api.deepseek.com/responses'); requests++;
      if (requests === 1) return response([call('express_orb', { emote: 'curious' }, 'expression_1')]);
      if (requests === 2) return response([text('    ')]);
      assert.equal(requests, 3); assert.deepEqual(JSON.parse(options.body).tools, []);
      assert(!emitted.some(event => ['orb_expression', 'segment', 'done'].includes(event.type)));
      return response([succeeds ? answer('I have chosen a curious gesture.') : text('still invalid')]);
    };
    const request = { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
      'content-type': 'application/json', 'x-metabloom-toolset': '2', 'x-metabloom-expressions': '1' },
    socket: { remoteAddress: '127.0.0.1' }, body: { message: 'Show me a gesture.', history: [], requestId: 'turn-1',
      streamText: true, actionMode: 'auto', orbContext, modelSelection: selection } };
    const res = Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(key, value) { this.headers[key] = value; },
      write(value) { this.body += value; emitted.push(JSON.parse(value)); return true; },
      end(value = '') { this.body += value; if (value) emitted.push(JSON.parse(value)); this.writableEnded = true; } });
    await handler(request, res);
    assert.equal(requests, 3);
    assert.deepEqual(emitted.filter(event => event.type === 'agent_status').map(event => event.state), ['working', 'reviewing', 'validating']);
    assert.equal(emitted.filter(event => event.type === 'tool_activity' && event.state === 'running').length, 1);
    const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true, allowExpressions: true,
      requestId: 'turn-1', onReaction: event => reactions.push(event) });
    decoder.push(res.body);
    assert.equal(decoder.finish().ok, succeeds);
    assert.equal(reactions.filter(event => event.phase === 'response').length, succeeds ? 1 : 0);
    assert.equal(emitted.at(-1).type, succeeds ? 'done' : 'error');
    if (!succeeds) assert(!emitted.some(event => ['orb_expression', 'segment', 'visual_offer', 'text_complete'].includes(event.type)));
  }
});
