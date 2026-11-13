const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const auth = require('../server/metabloomAuth');
const handler = require('../api/metabloom');
const sourceMedia = require('../server/metabloomSourceMedia');
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

const citedSearch = (reply) => {
  let call = 0;
  return async () => {
    call++;
    if (call === 1) return Response.json({ status: 'completed', output: [
      { type: 'function_call', name: 'search_web', call_id: 'web_1', arguments: JSON.stringify({ query: 'Harbor bridge reopening' }) }] });
    if (call === 2) return searchResponse({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search' } },
      { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'The agency confirmed it. Reporters described the ceremony.',
        annotations: [
          { type: 'url_citation', title: 'Agency notice', url: 'https://agency.example.com/notice', start_index: 0, end_index: 25 },
          { type: 'url_citation', title: 'Ceremony report', url: 'https://news.example.com/ceremony', start_index: 26, end_index: 58 }] }] }] });
    return Response.json({ status: 'completed', output: [answer(reply)] });
  };
};

test('opted-in search answers receive preview capabilities for cited sources in first-citation order', async () => {
  const minted = [];
  mock.method(sourceMedia, 'createSourceMediaToken', async (identity, url) => {
    assert.equal(identity.owner, 'a'.repeat(64)); minted.push(url); return `m1.capability-${minted.length}-${'x'.repeat(60)}`;
  });
  global.fetch = citedSearch('The ceremony drew a crowd [2], after the agency confirmed the date [1]. Again [2].');
  const req = request('Did the harbor bridge reopen?'); req.body.streamToolMedia = true;
  const res = response(); await handler(req, res);
  const stream = events(res);
  const sourcesAt = stream.findIndex(event => event.type === 'tool_sources');
  const mediaAt = stream.findIndex(event => event.type === 'tool_media');
  assert(sourcesAt >= 0 && mediaAt === sourcesAt + 1, 'Media directly follows the validated source catalog');
  assert(mediaAt < stream.findIndex(event => event.type === 'text_delta'));
  const sources = stream[sourcesAt].sources;
  assert.deepEqual(stream[mediaAt].media.map(entry => entry.sourceId), [2, 1]);
  assert.deepEqual(minted, [sources[1].url, sources[0].url]);
  assert.equal(JSON.stringify(stream[mediaAt]).includes('example.com'), false, 'No publisher URL is sent as media');
  let received = null;
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolMedia: true, onSourceMedia: media => { received = media; } });
  assert(decoder.push(res.body)); assert(decoder.finish().ok);
  assert.deepEqual(received.map(entry => entry.sourceId), [2, 1]);
  const cached = createMetabloomSegmentStreamDecoder({ allowTools: true });
  assert.equal(cached.push(res.body), false, 'A client that did not opt in would reject the record');
});

test('search answers without the opt-in, or with unavailable capabilities, keep the complete cited answer', async () => {
  let mints = 0;
  mock.method(sourceMedia, 'createSourceMediaToken', async () => { mints++; return null; });
  for (const streamToolMedia of [undefined, false, true]) {
    global.fetch = citedSearch('The agency confirmed the date [1].');
    const req = request('Did the harbor bridge reopen?');
    if (streamToolMedia !== undefined) req.body.streamToolMedia = streamToolMedia;
    const res = response(); await handler(req, res);
    const stream = events(res);
    assert(!stream.some(event => event.type === 'tool_media'));
    assert(stream.some(event => event.type === 'tool_sources'));
    assert.equal(stream.at(-1).type, 'done');
    const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true });
    assert(decoder.push(res.body)); assert(decoder.finish().ok);
  }
  assert.equal(mints, 1, 'Only the opted-in request mints, and only for its one cited source');
  mock.method(sourceMedia, 'createSourceMediaToken', async () => { throw new Error('Configuration unavailable'); });
  global.fetch = citedSearch('The agency confirmed the date [1].');
  const req = request('Did the harbor bridge reopen?'); req.body.streamToolMedia = true;
  const res = response(); await handler(req, res);
  assert(!events(res).some(event => event.type === 'tool_media'));
  assert.equal(events(res).at(-1).type, 'done');
  for (const streamToolMedia of [null, 1, 'true', {}]) {
    const invalid = request('Did the harbor bridge reopen?'); invalid.body.streamToolMedia = streamToolMedia;
    const rejected = response(); await handler(invalid, rejected);
    assert.equal(rejected.statusCode, 400);
  }
});

test('tool media is limited to four cited sources and ignores uncited catalog entries', async () => {
  const sources = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, title: `Source ${index + 1}`, url: `https://site${index + 1}.example.com/a` }));
  mock.method(sourceMedia, 'createSourceMediaToken', async (_identity, url) => `token-for-${url}`);
  const media = await handler._internals.attachToolMedia({ segments: [{ response: 'A [6] B [3] [3] C [9] D [1] E [2] F [5]' }] },
    sources, { owner: 'a'.repeat(64), scope: 'c'.repeat(64) });
  assert.deepEqual(media.map(entry => entry.sourceId), [6, 3, 1, 2]);
  assert.deepEqual(await handler._internals.attachToolMedia({ segments: [{ response: 'Uncited.' }] }, sources, { owner: 'a' }), []);
  assert.deepEqual(await handler._internals.attachToolMedia({ segments: [{ response: '[1]' }] }, sources, null), []);
});

const wikipedia = url => {
  const parsed = new URL(url);
  if (parsed.searchParams.get('generator') === 'search') return Response.json({ query: { pages: [{ index: 1, title: 'Fictional Singer',
    fullurl: 'https://en.wikipedia.org/wiki/Fictional_Singer', pageimage: 'Singer.jpg', thumbnail: { source: 'x', width: 640, height: 960 } }] } });
  return Response.json({ query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Singer.jpg/640px-Singer.jpg',
    thumbwidth: 640, thumbheight: 960, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Singer.jpg',
    extmetadata: { LicenseShortName: { value: 'CC BY 2.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/2.0' },
      Artist: { value: 'Example Photographer' }, ImageDescription: { value: 'Fictional Singer on stage' } } }] }] } });
};
const imageTurn = () => {
  const model = [];
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://en.wikipedia.org/')) return wikipedia(url);
    const body = JSON.parse(options.body); model.push(body);
    if (model.length === 1) return Response.json({ status: 'completed', output: [
      { type: 'function_call', name: 'find_image', call_id: 'image_1', arguments: JSON.stringify({ subject: 'Fictional Singer' }) }] });
    return Response.json({ status: 'completed', output: [answer('Here is Fictional Singer, a fictional pop performer.')] });
  };
  return model;
};

test('opted-in browsers receive a found photo as an image capability with attribution, before the answer text', async () => {
  const minted = [];
  mock.method(sourceMedia, 'createSourceMediaToken', async (identity, pageUrl, options) => {
    minted.push({ owner: identity.owner, pageUrl, options }); return 'm1.image-capability-fixture';
  });
  const model = imageTurn();
  const req = request('Can you show me who Fictional Singer is?'); req.body.streamToolMedia = true;
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert(model[0].tools.some(tool => tool.name === 'find_image'));
  assert.deepEqual(minted, [{ owner: 'a'.repeat(64), pageUrl: 'https://en.wikipedia.org/wiki/Fictional_Singer',
    options: { image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Singer.jpg/640px-Singer.jpg' } }]);
  const stream = events(res);
  const imagesAt = stream.findIndex(event => event.type === 'tool_images');
  assert(imagesAt > stream.findIndex(event => event.type === 'tool_activity' && event.state === 'complete'));
  assert(imagesAt < stream.findIndex(event => event.type === 'text_delta'));
  assert.deepEqual(stream[imagesAt].images, [{ token: 'm1.image-capability-fixture', width: 640, height: 960,
    alt: 'Fictional Singer on stage', title: 'Fictional Singer', pageUrl: 'https://en.wikipedia.org/wiki/Fictional_Singer',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Singer.jpg', artist: 'Example Photographer', license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0' }]);
  assert.equal(JSON.stringify(stream).includes('upload.wikimedia.org'), false, 'The raster URL never reaches the browser');
  let received = null;
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolMedia: true, onToolImages: images => { received = images; } });
  assert(decoder.push(res.body)); assert(decoder.finish().ok);
  assert.equal(received[0].token, 'm1.image-capability-fixture');
});

test('the photo tool is not offered without the opt-in or when disabled, and a minting failure leaves the answer intact', async () => {
  for (const [streamToolMedia, enabled] of [[undefined, true], [true, false]]) {
    const model = imageTurn();
    if (!enabled) process.env.METABLOOM_IMAGE_SEARCH_ENABLED = 'false';
    try {
      const req = request('Can you show me who Fictional Singer is?');
      if (streamToolMedia !== undefined) req.body.streamToolMedia = streamToolMedia;
      const res = response(); await handler(req, res);
      assert.equal(model[0].tools.some(tool => tool.name === 'find_image'), false);
    } finally { delete process.env.METABLOOM_IMAGE_SEARCH_ENABLED; }
  }
  mock.method(sourceMedia, 'createSourceMediaToken', async () => { throw new Error('Configuration unavailable'); });
  imageTurn();
  const req = request('Can you show me who Fictional Singer is?'); req.body.streamToolMedia = true;
  const res = response(); await handler(req, res);
  assert(!events(res).some(event => event.type === 'tool_images'));
  assert.equal(events(res).at(-1).type, 'done');
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
