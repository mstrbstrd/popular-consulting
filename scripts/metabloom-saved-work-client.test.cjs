const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requestMetabloomSavedWork } = require('../src/components/metabloomSavedWorkApiClient');
const { parseMetabloomSavedWorkResponse, MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES } = require('../src/components/metabloomSavedWorkProtocol');
const { createMetabloomSavedWorkHandler } = require('../api/metabloom-saved-work');
const { visualContent, response, request, authenticate, temporaryStores, durableFixture,
  metadata, identity } = require('./fixtures/metabloom-saved-work-api.cjs');

const publicMetadata = content => {
  const result = metadata(content);
  delete result.workspaceId;
  return result;
};
const openResponse = () => ({ artifact: publicMetadata(visualContent()), content: visualContent(),
  reference: { kind: 'visual', offer: { version: '1', designVersion: 'aetheris-1', id: 'a'.repeat(48),
    kind: 'calculator', expiresAt: Date.now() + 3600000 }, artifactVersion: 'b'.repeat(32) } });

test('client talks only to the same-origin private endpoint and validates the full save/list/open flow', async () => {
  const temporary = temporaryStores(), durable = durableFixture();
  const handler = createMetabloomSavedWorkHandler({ ...temporary, getStore: () => durable.store, authenticate: authenticate() });
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/metabloom-saved-work');
    assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Content-Type'], 'application/json');
    calls.push(JSON.parse(options.body));
    const res = response(); await handler(request(options.body), res);
    return new Response(res.body, { status: res.statusCode, headers: res.headers });
  };
  assert.deepEqual(await requestMetabloomSavedWork({ action: 'status' }, { fetchImpl }), { available: true });
  const visual = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const saved = await requestMetabloomSavedWork({ action: 'save', requestId: randomUUID(), title: 'Saved estimate',
    source: { kind: 'visual', id: visual.offer.id, artifactVersion: visual.artifactVersion },
    scenario: { inputs: { hours: 17, rate: 85 } } }, { fetchImpl });
  const list = await requestMetabloomSavedWork({ action: 'list' }, { fetchImpl });
  assert.deepEqual(list.items, [saved.artifact]);
  const opened = await requestMetabloomSavedWork({ action: 'open', artifactId: saved.artifact.artifactId }, { fetchImpl });
  assert.deepEqual(opened.content.scenario, { inputs: { hours: 17, rate: 85 } });
  assert.notEqual(opened.reference.offer.id, visual.offer.id);
  assert.equal(calls.length, 4);
});

test('request validation and an already aborted signal prevent any fetch', async () => {
  const fetchImpl = async () => assert.fail('Invalid or cancelled requests cannot fetch');
  await assert.rejects(requestMetabloomSavedWork({ action: 'save', content: visualContent() }, { fetchImpl }),
    { code: 'saved_work_invalid', status: 400 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestMetabloomSavedWork({ action: 'status' }, { fetchImpl, signal: controller.signal }),
    { code: 'saved_work_cancelled' });
});

test('availability stays explicit and malformed success responses never become saved receipts', async () => {
  const expected = { available: false, code: 'saved_work_unavailable' };
  assert.deepEqual(await requestMetabloomSavedWork({ action: 'status' },
    { fetchImpl: async () => Response.json(expected) }), expected);
  for (const value of [{ available: 'true' }, { available: false }, { available: true, url: 'postgres://private' }])
    await assert.rejects(requestMetabloomSavedWork({ action: 'status' },
      { fetchImpl: async () => Response.json(value) }), { code: 'saved_work_invalid' });
});

test('unknown error text, HTML login pages and connection failures stay sanitized', async () => {
  for (const fetchImpl of [
    async () => Response.json({ code: 'database_private_detail', message: 'private SQL credentials' }, { status: 503 }),
    async () => new Response('<html>Private login HTML</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    async () => { throw new Error('private network details'); },
  ]) await assert.rejects(requestMetabloomSavedWork({ action: 'list' }, { fetchImpl }),
    error => error.code === 'saved_work_unavailable' && !/private|SQL|credentials|HTML/.test(error.message));
  await assert.rejects(requestMetabloomSavedWork({ action: 'list' }, { fetchImpl: async () =>
    Response.json({ code: 'saved_work_authentication', requestRef: 'abcdef123456' }, { status: 401 }) }),
  { code: 'saved_work_authentication', status: 401, requestRef: 'abcdef123456' });
});

test('successes reject mismatched saved identities, private ownership, unknown content and wrong fresh references', async () => {
  const opened = openResponse(), input = { action: 'open', artifactId: opened.artifact.artifactId };
  const variants = [
    { ...opened, artifact: { ...opened.artifact, artifactId: randomUUID() } },
    { ...opened, artifact: { ...opened.artifact, workspaceId: randomUUID() } },
    { ...opened, artifact: { ...opened.artifact, headRevision: 2 } },
    { ...opened, content: { ...opened.content, schemaVersion: 2 } },
    { ...opened, content: { ...opened.content, scenario: { inputs: { hours: 81, rate: 85 } } } },
    { ...opened, reference: { ...opened.reference, offer: { ...opened.reference.offer, kind: 'table' } } },
    { ...opened, reference: { ...opened.reference, artifactVersion: 'invalid' } },
    { ...opened, reference: { ...opened.reference, owner: identity.owner } },
  ];
  for (const value of variants) {
    assert.equal(parseMetabloomSavedWorkResponse(input, value), null);
    await assert.rejects(requestMetabloomSavedWork(input, { fetchImpl: async () => Response.json(value) }),
      { code: 'saved_work_invalid' });
  }
  const parsed = parseMetabloomSavedWorkResponse(input, opened);
  assert.deepEqual(parsed, opened); assert.notEqual(parsed.content.spec, opened.content.spec);
});

test('list bounds, duplicate IDs and deletion receipts are validated against their request', () => {
  const item = publicMetadata(visualContent());
  for (const value of [{ items: [item, item], nextCursor: null }, { items: [item], nextCursor: 4 },
    { items: [{ ...item, accountKey: 'a'.repeat(64) }], nextCursor: null }])
    assert.equal(parseMetabloomSavedWorkResponse({ action: 'list' }, value), null);
  assert.equal(parseMetabloomSavedWorkResponse({ action: 'list', limit: 1 },
    { items: [item, { ...item, artifactId: randomUUID() }], nextCursor: null }), null);
  const input = { action: 'delete', artifactId: item.artifactId, expectedVersion: 2 };
  assert.equal(parseMetabloomSavedWorkResponse(input, { artifactId: item.artifactId, version: 1, deleted: true }), null);
  assert.equal(parseMetabloomSavedWorkResponse(input, { artifactId: randomUUID(), version: 2, deleted: true }), null);
  assert.deepEqual(parseMetabloomSavedWorkResponse(input, { artifactId: item.artifactId, version: 2, deleted: true }),
    { artifactId: item.artifactId, version: 2, deleted: true });
});

test('declared and streaming byte limits reject oversized payloads and cancel readers', async () => {
  for (const responseValue of [
    new Response('{}', { headers: { 'content-type': 'application/json',
      'content-length': String(MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES + 1) } }),
    new Response('x'.repeat(MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES + 1), { headers: { 'content-type': 'application/json' } }),
    new Response('x'.repeat(2049), { status: 503, headers: { 'content-type': 'application/json' } }),
  ]) await assert.rejects(requestMetabloomSavedWork({ action: 'list' },
    { fetchImpl: async () => responseValue }), { code: 'saved_work_invalid' });

  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_METABLOOM_SAVED_WORK_RESPONSE_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(requestMetabloomSavedWork({ action: 'list' },
    { fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'application/json' } }) }),
  { code: 'saved_work_invalid' });
  assert.equal(cancelled, true);
});

test('aborting a stalled response cancels its reader and cannot return a late saved receipt', async () => {
  const controller = new AbortController();
  let cancelled = false, fetched;
  const started = new Promise(resolve => { fetched = resolve; });
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = requestMetabloomSavedWork({ action: 'status' }, { signal: controller.signal,
    fetchImpl: async () => { fetched(); return new Response(stream, { headers: { 'content-type': 'application/json' } }); } });
  await started;
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { code: 'saved_work_cancelled' });
  assert.equal(cancelled, true);
});
