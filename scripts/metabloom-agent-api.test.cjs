const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const { createMetabloomSegmentStreamDecoder } = require('../src/components/metabloomEmoteProtocol');
const env = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => {
  mock.method(auth, 'requireMetabloomSession', async (_request, options) => {
    options.onIdentity({ owner: 'a'.repeat(64), subject: 'b'.repeat(64) }); return null;
  });
  process.env.VERCEL_ENV = 'development'; process.env.OPENAI_API_KEY = 'fictional-fixture';
  delete process.env.TYPESAFE_API_KEY; delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  handler._internals.localBuckets.clear();
});
afterEach(() => { mock.restoreAll(); global.fetch = originalFetch;
  for (const key of ['VERCEL_ENV', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
});
const request = message => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
  'content-type': 'application/json', 'x-metabloom-toolset': '1', 'x-metabloom-visuals': '1', 'x-metabloom-ui-tools': '1' },
  socket: { remoteAddress: '127.0.0.1' }, body: { message, history: [], actionMode: 'auto', streamText: true,
    requestId: 'turn-1', timeZone: 'America/Vancouver' } });
const response = () => Object.assign(new EventEmitter(), { headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; },
  write(value) { this.body += value; return true; }, end(value = '') { this.body += value; this.writableEnded = true; } });
const answer = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
  text: JSON.stringify({ version: '2.0.0', segments: [{ response: text }] }) }] });
const events = res => res.body.trim().split('\n').map(line => JSON.parse(line));
const searchResponse = value => new Response(`data: ${JSON.stringify({ type: 'response.completed', response: value })}\n\n`,
  { headers: { 'content-type': 'text/event-stream' } });

test('Nvidia news follow-up reaches search_web directly and returns a cited ordinary answer', async () => {
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (calls.length === 1) return Response.json({ status: 'completed', output: [
      { type: 'function_call', name: 'search_web', call_id: 'web_1', arguments: JSON.stringify({ query: 'Nvidia latest announcement' }) },
    ] });
    if (calls.length === 2) {
      assert.equal(body.tools[0].type, 'web_search');
      return searchResponse({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search' } },
        { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'The announcement is current.',
          annotations: [{ type: 'url_citation', title: 'Official announcement', url: 'https://example.com/announcement', start_index: 0, end_index: 28 }] }] }] });
    }
    return Response.json({ status: 'completed', output: [answer('Here is the announcement I found. [1]')] });
  };
  const req = request('How did you miss the Nvidia news?'), res = response();
  req.body.history = [{ role: 'assistant', content: 'I do not have live web access.' }];
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].tool_choice, 'auto');
  assert.equal(calls[2].input.at(-1).type, 'function_call_output');
  const stream = events(res);
  assert.equal(stream.find(event => event.type === 'action').action, 'none');
  assert(!stream.some(event => event.type.startsWith('research')));
  assert(!stream.some(event => ['tool_progress', 'agent_status'].includes(event.type)), 'Cached v1 clients receive no new record types');
  assert.deepEqual(stream.filter(event => event.type === 'tool_activity').map(event => event.state), ['running', 'complete']);
  assert(stream.findIndex(event => event.type === 'tool_sources') < stream.findIndex(event => event.type === 'text_delta'));
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true });
  assert(decoder.push(res.body)); assert(decoder.finish().ok);
});

test('capability questions reach the supplied tools and do not trigger a forced search', async () => {
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++; assert(JSON.parse(options.body).tools.some(tool => tool.name === 'search_web'));
    return Response.json({ status: 'completed', output: [answer('Yes, I can search the web when needed.')] });
  };
  const res = response(); await handler(request('You should have web access no?'), res);
  assert.equal(calls, 1);
  assert(!events(res).some(event => event.type === 'tool_activity'));
  assert.equal(events(res).at(-1).type, 'done');
});

test('explicit visual requests no longer get intercepted by the legacy 409 guard', async () => {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert(body.tools.some(tool => tool.name === 'calculate'));
    assert(!body.tools.some(tool => tool.name === 'create_visual'), 'Unavailable Redis means no visual tool');
    return Response.json({ status: 'completed', output: [answer('Visual creation is unavailable for this request.')] });
  };
  const res = response(); await handler(request('Create a calculator for 12 times 3.'), res);
  assert.equal(res.statusCode, 200); assert.equal(events(res).at(-1).type, 'done');
});

test('authentication, origin, validation and quota still precede agent work', async () => {
  let calls = 0; global.fetch = async () => { calls++; assert.fail('No provider work'); };
  mock.method(auth, 'requireMetabloomSession', async () => ({ status: 401, code: 'authentication_required' }));
  let res = response(); await handler(request('Hi'), res); assert.equal(res.statusCode, 401);
  mock.restoreAll(); mock.method(auth, 'requireMetabloomSession', async () => null);
  const crossOrigin = request('Hi'); crossOrigin.headers.origin = 'https://evil.example';
  res = response(); await handler(crossOrigin, res); assert.equal(res.statusCode, 403);
  const invalid = request('Hi'); invalid.body.timeZone = 'Not/AZone';
  res = response(); await handler(invalid, res); assert.equal(res.statusCode, 400);
  const req = request('Hi');
  for (let i = 0; i < 12; i++) assert(await handler._internals.consumeRateLimit(req));
  res = response(); await handler(req, res); assert.equal(res.statusCode, 429);
  assert.equal(calls, 0);
});

test('bad citations cause a typed failure before any answer text is released', async () => {
  global.fetch = async () => Response.json({ status: 'completed', output: [answer('Invented claim [9].')] });
  const res = response(); await handler(request('Hello'), res);
  const stream = events(res);
  assert.equal(stream.at(-1).type, 'error'); assert.equal(stream.at(-1).code, 'answer_invalid');
  assert(!stream.some(event => ['done', 'segment', 'text_delta'].includes(event.type)));
});

test('disconnect aborts provider work and does not report completion', async () => {
  const res = response();
  global.fetch = async (_url, options) => {
    res.destroyed = true; res.emit('close');
    assert(options.signal.aborted); options.signal.throwIfAborted();
  };
  await handler(request('Hello'), res);
  assert(!events(res).some(event => event.type === 'done'));
});

test('v2 sends observed search progress before the provider completes, then validates before text', { timeout: 3000 }, async () => {
  const req = request('Search for the latest announcement'), res = response();
  req.headers['x-metabloom-toolset'] = '2';
  let stream, release;
  const observed = new Promise(resolve => { release = resolve; });
  const write = res.write;
  res.write = function (line) {
    const result = write.call(this, line), event = JSON.parse(line);
    if (event.type === 'tool_progress' && event.summary === 'Reading: example.com') release();
    return result;
  };
  let calls = 0;
  const encode = event => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls++;
    if (calls === 1) {
      assert(events(res).some(event => event.type === 'agent_status' && event.state === 'working'));
      return Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'search_web', call_id: 'web_live',
        arguments: JSON.stringify({ query: 'latest announcement' }) }] });
    }
    if (calls === 2) {
      assert.equal(body.stream, true);
      assert(events(res).some(event => event.type === 'tool_activity' && event.state === 'running'));
      return new Response(new ReadableStream({ start(controller) {
        stream = controller;
        controller.enqueue(encode({ type: 'response.output_item.added', item: { type: 'reasoning', summary: [{ text: 'private-reasoning' }] } }));
        controller.enqueue(encode({ type: 'response.output_item.added', item: { type: 'web_search_call', status: 'in_progress',
          action: { type: 'search', query: 'latest announcement' } } }));
        controller.enqueue(encode({ type: 'response.output_item.added', item: { type: 'web_search_call', status: 'in_progress',
          action: { type: 'open_page', url: 'https://example.com/news' } } }));
      } }), { headers: { 'content-type': 'text/event-stream' } });
    }
    assert(events(res).some(event => event.type === 'agent_status' && event.state === 'reviewing'));
    return Response.json({ status: 'completed', output: [answer('Verified announcement. [1]')] });
  };
  const running = handler(req, res);
  try {
    await observed;
    assert.equal(calls, 2);
    assert(!res.writableEnded);
    assert(!events(res).some(event => ['segment', 'text_delta', 'done'].includes(event.type)));
    assert(!res.body.includes('private-reasoning'));
    const text = 'Verified announcement.';
    stream.enqueue(encode({ type: 'response.completed', response: { status: 'completed', output: [
      { type: 'web_search_call', status: 'completed', action: { type: 'search' } },
      { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [
        { type: 'url_citation', title: 'Announcement', url: 'https://example.com/news', start_index: 0, end_index: text.length },
      ] }] },
    ] } }));
    stream.close();
    await running;
    const records = events(res);
    assert.deepEqual(records.filter(event => event.type === 'agent_status').map(event => event.state), ['working', 'reviewing', 'validating']);
    assert.deepEqual(records.filter(event => event.type === 'tool_progress').map(event => event.sequence), [1, 2]);
    assert(records.findIndex(event => event.type === 'agent_status' && event.state === 'validating')
      < records.findIndex(event => event.type === 'text_delta'));
    const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true });
    assert(decoder.push(res.body)); assert(decoder.finish().ok);
  } finally { res.destroyed = true; res.emit('close'); await running; }
});
