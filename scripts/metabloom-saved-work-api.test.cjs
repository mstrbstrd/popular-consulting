const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMetabloomSavedWorkHandler } = require('../api/metabloom-saved-work');
const { resolveMetabloomArtifactReference } = require('../server/metabloomArtifactContext');
const { resolveMetabloomResearchContext } = require('../server/metabloomResearchContext');
const { savedWorkError } = require('../server/metabloomSavedWorkMigrations');
const { MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');
const { parseMetabloomSavedWorkRequest } = require('../src/components/metabloomSavedWorkProtocol');
const { accountIdentity, identity, visualContent, response, request, authenticate, temporaryStores,
  durableFixture, researchFixture } = require('./fixtures/metabloom-saved-work-api.cjs');
const json = res => JSON.parse(res.body);
const invoke = async (handler, body) => { const res = response(); await handler(request(body), res); return res; };
const visualSave = reference => ({ action: 'save', requestId: randomUUID(), title: 'Saved project price',
  source: { kind: 'visual', id: reference.offer.id, artifactVersion: reference.artifactVersion },
  scenario: { inputs: { hours: 17, rate: 85 } } });
function setup(options = {}) {
  const temporary = temporaryStores(), durable = durableFixture();
  const handler = createMetabloomSavedWorkHandler({ getStore: () => durable.store,
    ...temporary, authenticate: authenticate(), ...options });
  return { handler, temporary, durable };
}
afterEach(() => mock.restoreAll());

test('authentication and same-origin denials run before any store access', async () => {
  for (const status of [401, 403, 503]) {
    const handler = createMetabloomSavedWorkHandler({ authenticate: async () => ({ status }),
      getStore: () => assert.fail('Authentication must run first') });
    const res = await invoke(handler, { action: 'status' });
    assert.equal(res.statusCode, status);
    assert.match(res.headers['cache-control'], /private.*no-store/);
    assert.equal(res.headers['vercel-cdn-cache-control'], 'no-store');
    assert.equal(res.headers.vary, 'Cookie');
    assert.match(res.headers['x-robots-tag'], /noindex/);
  }
  for (const incomplete of [
    async () => null,
    async (_req, options) => { options.onIdentity(identity); return null; },
    async (_req, options) => { options.onAccountIdentity(accountIdentity); return null; },
  ]) {
    const handler = createMetabloomSavedWorkHandler({ authenticate: incomplete,
      getStore: () => assert.fail('Both server identities are required') });
    assert.equal((await invoke(handler, { action: 'list' })).statusCode, 401);
  }
});

test('the unconfigured deployed factory stays lazy and reports unavailable without network or fallback', async () => {
  const names = ['METABLOOM_SAVED_WORK_DATABASE_URL', 'METABLOOM_SAVED_WORK_ENVIRONMENT',
    'METABLOOM_SAVED_WORK_NAMESPACE'];
  const original = names.map(name => process.env[name]);
  names.forEach(name => { delete process.env[name]; });
  mock.method(globalThis, 'fetch', async () => assert.fail('Unconfigured storage cannot call another service'));
  try {
    const handler = createMetabloomSavedWorkHandler({ authenticate: authenticate() });
    const status = await invoke(handler, { action: 'status' });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(json(status), { available: false, code: 'saved_work_unavailable' });
    const list = await invoke(handler, { action: 'list' });
    assert.equal(list.statusCode, 503); assert.equal(json(list).code, 'saved_work_unavailable');
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  }
});

test('status requires a successful account-scoped read and hides schema, SQL and connection details', async () => {
  const { handler, durable } = setup();
  assert.deepEqual(json(await invoke(handler, { action: 'status' })), { available: true });
  assert.deepEqual(durable.calls[0].slice(0, 3), ['list', accountIdentity, { limit: 1 }]);
  for (const error of [new Error('postgres://private:password@database/internal SQL'),
    savedWorkError('saved_work_environment_mismatch'), savedWorkError('saved_work_migration_mismatch')]) {
    const unavailable = setup({ getStore: () => ({ list: async () => { throw error; } }) }).handler;
    assert.deepEqual(json(await invoke(unavailable, { action: 'status' })), { available: false, code: 'saved_work_unavailable' });
    const res = await invoke(unavailable, { action: 'list' });
    assert.equal(res.statusCode, 503); assert.equal(json(res).code, 'saved_work_unavailable');
    assert.doesNotMatch(res.body, /password|database\/|mismatch|SQL/);
  }
});

test('methods, content type, declared length, malformed JSON and oversize bodies are rejected before storage', async () => {
  const handler = setup({ getStore: () => assert.fail('Invalid input cannot touch storage') }).handler;
  for (const change of [
    { method: 'GET' }, { method: 'DELETE' }, { headers: { 'content-type': 'text/plain' } },
    { headers: { 'content-type': 'application/json', 'content-length': '4097' } },
    { headers: { 'content-type': 'application/json', 'content-length': 'NaN' } },
    { body: '{' }, { body: ' '.repeat(4097) },
  ]) {
    const req = { ...request({ action: 'status' }), ...change }, res = response();
    await handler(req, res);
    assert.equal(res.statusCode, ['GET', 'DELETE'].includes(req.method) ? 405 : 400);
  }
});

test('request schema rejects ownership, raw content, foreign actions, unbounded selectors and forged calculations', async () => {
  const handler = setup({ getStore: () => assert.fail('Invalid input cannot touch storage') }).handler;
  const save = visualSave({ offer: { id: 'a'.repeat(48) }, artifactVersion: 'b'.repeat(32) });
  for (const body of [
    { ...save, accountKey: accountIdentity.accountKey }, { ...save, content: visualContent() },
    { ...save, source: { ...save.source, spec: visualContent().spec } },
    { ...save, source: { ...save.source, sources: [] } },
    { ...save, scenario: { inputs: save.scenario.inputs, result: 1445 } },
    { ...save, scenario: { inputs: { hours: '17', rate: 85 } } },
    { ...save, scenario: { inputs: { hours: Infinity, rate: 85 } } },
    { ...save, requestId: 'not-uuid' }, { ...save, title: 'x'.repeat(161) },
    { action: 'open', artifactId: randomUUID(), revision: 0 },
    { action: 'open', artifactId: randomUUID(), workspaceId: randomUUID() },
    { action: 'delete', artifactId: randomUUID(), expectedVersion: 0 },
    { action: 'list', limit: 51 }, { action: 'list', after: 'x'.repeat(181) },
    { action: 'restore', artifactId: randomUUID() },
  ]) assert.equal((await invoke(handler, body)).statusCode, 400);
  let accessed = false;
  const accessor = { get action() { accessed = true; return 'status'; } };
  assert.equal(parseMetabloomSavedWorkRequest(accessor), null);
  assert.equal(accessed, false);
  assert.equal(parseMetabloomSavedWorkRequest({ ...save, scenario: { get inputs() { accessed = true; return {}; } } }), null);
  assert.equal(accessed, false);
});

test('save copies a server-owned visual and only validated scenario input values into durable storage', async () => {
  const { handler, temporary, durable } = setup();
  const content = visualContent();
  const reference = await temporary.visualStore.restoreArtifact(identity, content);
  const input = visualSave(reference), res = await invoke(handler, input);
  assert.equal(res.statusCode, 200);
  const result = json(res); assert.equal(result.artifact.title, input.title);
  assert.equal(result.artifact.kind, 'visual');
  assert.equal(Object.hasOwn(result.artifact, 'workspaceId'), false);
  const [, account, saved] = durable.calls[0];
  assert.deepEqual(account, accountIdentity);
  assert.deepEqual(saved, { requestId: input.requestId, title: input.title,
    content: { ...content, scenario: input.scenario } });
  assert.equal(Object.hasOwn(saved.content, 'result'), false);
  input.scenario.inputs.hours = 40;
  assert.equal(saved.content.scenario.inputs.hours, 17);
});

test('out-of-range or incomplete calculator state cannot be saved and does not mutate the source', async () => {
  const { handler, temporary, durable } = setup();
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const save = visualSave(reference);
  for (const inputs of [{ hours: 81, rate: 85 }, { hours: 17, rate: 9 }, { hours: 17 },
    { hours: 17, rate: 85, extra: 1 }]) {
    const res = await invoke(handler, { ...save, scenario: { inputs } });
    assert.equal(res.statusCode, 400); assert.equal(json(res).code, 'saved_work_invalid');
  }
  assert.equal(durable.calls.length, 0);
  assert.deepEqual((await temporary.visualStore.getArtifactRecord(identity, reference.offer.id)).spec, visualContent().spec);
});

test('foreign, missing, stale-version and expired visual references fail before a durable write', async () => {
  const { handler, temporary, durable } = setup();
  const foreign = await temporary.visualStore.restoreArtifact({ ...identity, owner: 'f'.repeat(64) }, visualContent());
  const owned = await temporary.visualStore.restoreArtifact(identity, visualContent());
  for (const source of [visualSave(foreign).source,
    { ...visualSave(owned).source, id: '0'.repeat(48) },
    { ...visualSave(owned).source, artifactVersion: '0'.repeat(32) }]) {
    const res = await invoke(handler, { ...visualSave(owned), source });
    assert.equal(res.statusCode, 410); assert.equal(json(res).code, 'saved_work_source_expired');
  }
  temporary.clock.value += 3600001;
  assert.equal((await invoke(handler, visualSave(owned))).statusCode, 410);
  assert.equal(durable.calls.length, 0);
});

test('full research with its original sources and dates is saved, including report-only results', async () => {
  const { handler, temporary, durable } = setup();
  const report = researchFixture.report();
  report.notes += 'x'.repeat(MAX_METABLOOM_RESEARCH_REPORT_BYTES - Buffer.byteLength(JSON.stringify(report)));
  const research = await temporary.researchStore.saveReport(identity, {
    message: researchFixture.message, report, temporalContext: researchFixture.temporalContext() });
  const withBrief = await temporary.researchStore.saveBrief(identity, research.researchId, researchFixture.brief());
  for (const source of [{ kind: 'research', researchId: research.researchId },
    { kind: 'research', researchId: research.researchId, briefId: withBrief.briefId }]) {
    const res = await invoke(handler, { action: 'save', requestId: randomUUID(), title: 'Saved evidence', source });
    assert.equal(res.statusCode, 200);
    const saved = durable.calls.at(-1)[2].content;
    assert.equal(saved.asOf, researchFixture.asOf);
    assert.equal(saved.question, researchFixture.message);
    assert.deepEqual(saved.report, report);
    assert.equal(Boolean(saved.brief), Boolean(source.briefId));
    assert.equal(Object.hasOwn(saved, 'researchId'), false);
  }
});

test('research handles cannot supply dates or caller evidence, or attach another report brief', async () => {
  const { handler, temporary, durable } = setup();
  const first = await temporary.researchStore.saveReport(identity, { message: researchFixture.message,
    report: researchFixture.report(), temporalContext: researchFixture.temporalContext() });
  const second = await temporary.researchStore.saveReport(identity, { message: researchFixture.message,
    report: researchFixture.report(), temporalContext: researchFixture.temporalContext() });
  const withBrief = await temporary.researchStore.saveBrief(identity, second.researchId, researchFixture.brief());
  const body = { action: 'save', requestId: randomUUID(), title: 'Research',
    source: { kind: 'research', researchId: first.researchId } };
  for (const extra of [{ report: researchFixture.report() }, { asOf: researchFixture.asOf }, { owner: identity.owner }])
    assert.equal((await invoke(handler, { ...body, source: { ...body.source, ...extra } })).statusCode, 400);
  assert.equal((await invoke(handler, { ...body, source: { ...body.source, briefId: withBrief.briefId } })).statusCode, 410);
  assert.equal(durable.calls.length, 0);
});

test('open after expiry and a new login restores exact visual content with fresh usable session references and no paid calls', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('Open must not call a model or external provider'));
  const { handler, temporary, durable } = setup();
  const initial = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const saved = json(await invoke(handler, visualSave(initial))).artifact;
  temporary.clock.value += 86400000;
  const newSession = { ...identity, owner: 'f'.repeat(64), scope: '9'.repeat(64), subject: '8'.repeat(64) };
  const reopened = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary,
    authenticate: authenticate(accountIdentity, newSession) });
  const res = await invoke(reopened, { action: 'open', artifactId: saved.artifactId });
  assert.equal(res.statusCode, 200);
  const opened = json(res);
  assert.deepEqual(opened.content, { ...visualContent(), scenario: { inputs: { hours: 17, rate: 85 } } });
  assert.notEqual(opened.reference.offer.id, initial.offer.id);
  assert.notEqual(opened.reference.artifactVersion, initial.artifactVersion);
  assert.equal(opened.reference.offer.expiresAt, temporary.clock.value + 3600000);
  assert.equal(await temporary.visualStore.getArtifactRecord(identity, opened.reference.offer.id), null);
  const reference = { id: opened.reference.offer.id, version: opened.reference.artifactVersion,
    selector: { type: 'calculator' }, inputs: opened.content.scenario.inputs };
  const context = await resolveMetabloomArtifactReference({ store: temporary.visualStore, identity: newSession, reference });
  assert.equal(context.data.calculatedResult, 1445);
  assert.deepEqual(context.sources, visualContent().sources);
  assert.equal(temporary.commands.some(command => command[0] === 'EVAL'), false);
});

test('open research refreshes reference retention without moving the original evidence date or running research', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('Open must not perform research or formatting'));
  const { handler, temporary, durable } = setup();
  const original = await temporary.researchStore.saveReport(identity, { message: researchFixture.message,
    report: researchFixture.report(), temporalContext: researchFixture.temporalContext() });
  const withBrief = await temporary.researchStore.saveBrief(identity, original.researchId, researchFixture.brief());
  const saved = json(await invoke(handler, { action: 'save', requestId: randomUUID(), title: 'Saved research',
    source: { kind: 'research', researchId: withBrief.researchId, briefId: withBrief.briefId } })).artifact;
  temporary.clock.value += 86400000;
  const newSession = { ...identity, owner: 'f'.repeat(64) };
  const reopened = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary,
    authenticate: authenticate(accountIdentity, newSession) });
  const res = await invoke(reopened, { action: 'open', artifactId: saved.artifactId });
  assert.equal(res.statusCode, 200);
  const opened = json(res), fresh = opened.reference.research;
  assert.notEqual(fresh.researchId, withBrief.researchId);
  assert.notEqual(fresh.briefId, withBrief.briefId);
  assert.equal(fresh.asOf, original.asOf);
  assert.equal(fresh.localDate, original.localDate);
  assert.equal(Date.parse(fresh.expiresAt), temporary.clock.value + 3600000);
  assert.deepEqual(opened.content.report, researchFixture.report());
  const context = await resolveMetabloomResearchContext({ store: temporary.researchStore, identity: newSession,
    reference: { researchId: fresh.researchId, selector: { type: 'finding', briefId: fresh.briefId, index: 1 } } });
  assert.deepEqual(context.temporalContext, researchFixture.temporalContext());
  assert.equal(context.research.asOf, researchFixture.asOf);
  assert.equal(context.finding.headline, researchFixture.brief().items[1].headline);
  assert.equal(await temporary.researchStore.getReport(identity, fresh.researchId), null);
});

test('list strips private ownership fields and open/rename/delete enforce the authenticated account', async () => {
  const { handler, temporary, durable } = setup();
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const saved = json(await invoke(handler, visualSave(reference))).artifact;
  const list = json(await invoke(handler, { action: 'list', limit: 20 }));
  assert.deepEqual(list, { items: [saved], nextCursor: null });
  assert.doesNotMatch(JSON.stringify(list), /workspaceId|accountKey|content|sources|owner/);
  const foreign = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary,
    authenticate: authenticate({ accountKey: 'f'.repeat(64) }) });
  for (const body of [{ action: 'open', artifactId: saved.artifactId },
    { action: 'rename', artifactId: saved.artifactId, expectedVersion: 1, title: 'Foreign' },
    { action: 'delete', artifactId: saved.artifactId, expectedVersion: 1 }])
    assert.equal((await invoke(foreign, body)).statusCode, 404);
  assert.deepEqual(json(await invoke(foreign, { action: 'list' })), { items: [], nextCursor: null });
});

test('rename preserves content revision, stale mutations conflict, and deleted saved items cannot be opened', async () => {
  const { handler, temporary } = setup();
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const saved = json(await invoke(handler, visualSave(reference))).artifact;
  const renamed = json(await invoke(handler, { action: 'rename', artifactId: saved.artifactId,
    expectedVersion: 1, title: 'Renamed project' })).artifact;
  assert.equal(renamed.version, 2); assert.equal(renamed.revision, 1);
  assert.equal((await invoke(handler, { action: 'delete', artifactId: saved.artifactId, expectedVersion: 1 })).statusCode, 409);
  assert.deepEqual(json(await invoke(handler, { action: 'delete', artifactId: saved.artifactId, expectedVersion: 2 })),
    { artifactId: saved.artifactId, version: 2, deleted: true });
  assert.equal((await invoke(handler, { action: 'open', artifactId: saved.artifactId })).statusCode, 404);
});

test('fresh reference storage failure does not fabricate an open result or modify durable content', async () => {
  const { handler, temporary, durable } = setup();
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const saved = json(await invoke(handler, visualSave(reference))).artifact;
  const before = structuredClone(durable.values.get(saved.artifactId));
  const failing = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary,
    visualStore: { restoreArtifact: async () => { throw new Error('private Redis connection'); } },
    authenticate: authenticate() });
  const res = await invoke(failing, { action: 'open', artifactId: saved.artifactId });
  assert.equal(res.statusCode, 503); assert.equal(json(res).code, 'saved_work_unavailable');
  assert.doesNotMatch(res.body, /private|Redis|content|reference/);
  assert.deepEqual(durable.values.get(saved.artifactId), before);
});

test('disconnect cancels work before a write, while a committed save still returns its receipt', async () => {
  const { temporary, durable } = setup();
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const res = response();
  const handler = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary,
    authenticate: authenticate(), visualStore: { getArtifactRecord: async (...args) => {
      const result = await temporary.visualStore.getArtifactRecord(...args); res.emit('close'); return result;
    } } });
  await handler(request(visualSave(reference)), res);
  assert.equal(res.statusCode, 499); assert.equal(durable.calls.length, 0);

  const committed = response(), originalCreate = durable.store.create;
  durable.store.create = async (...args) => { const result = await originalCreate(...args); committed.emit('close'); return result; };
  const afterCommit = createMetabloomSavedWorkHandler({ getStore: () => durable.store, ...temporary, authenticate: authenticate() });
  await afterCommit(request(visualSave(reference)), committed);
  assert.equal(committed.statusCode, 200); assert.equal(json(committed).artifact.version, 1);
});
