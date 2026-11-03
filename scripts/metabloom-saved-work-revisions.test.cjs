const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMetabloomSavedWorkHandler } = require('../api/metabloom-saved-work');
const { savedWorkError } = require('../server/metabloomSavedWorkMigrations');
const { requestMetabloomSavedWork } = require('../src/components/metabloomSavedWorkApiClient');
const { parseMetabloomSavedWorkRequest, parseMetabloomSavedWorkResponse } = require('../src/components/metabloomSavedWorkProtocol');
const { accountIdentity, identity, visualContent, response, request, authenticate,
  temporaryStores, durableFixture, researchFixture } = require('./fixtures/metabloom-saved-work-api.cjs');

const json = res => JSON.parse(res.body);
const invoke = async (handler, input) => { const res = response(); await handler(request(input), res); return res; };
async function setup() {
  const temporary = temporaryStores(), durable = durableFixture();
  const handler = createMetabloomSavedWorkHandler({ ...temporary, getStore: () => durable.store, authenticate: authenticate() });
  const reference = await temporary.visualStore.restoreArtifact(identity, visualContent());
  const source = { kind: 'visual', id: reference.offer.id, artifactVersion: reference.artifactVersion };
  const first = json(await invoke(handler, { action: 'save', requestId: randomUUID(), title: 'Estimate', source,
    scenario: { inputs: { hours: 10, rate: 65 } } })).artifact;
  const revise = (expectedVersion, hours = 17) => ({ action: 'revise', artifactId: first.artifactId,
    expectedVersion, source, scenario: { inputs: { hours, rate: 85 } } });
  return { temporary, durable, handler, first, source, revise };
}

test('revision requests reject unbounded history, raw content, invalid versions and extra ownership', async () => {
  const { first, revise } = await setup();
  for (const input of [
    { action: 'history', artifactId: first.artifactId, limit: 51 },
    { action: 'history', artifactId: first.artifactId, beforeRevision: 0 },
    { action: 'history', artifactId: first.artifactId, beforeRevision: '2' },
    { action: 'open', artifactId: first.artifactId, revision: null },
    { action: 'restore', artifactId: first.artifactId, expectedVersion: 0, revision: 1 },
    { action: 'restore', artifactId: first.artifactId, expectedVersion: 1, revision: 1.5 },
    { action: 'restore', artifactId: first.artifactId, expectedVersion: 1, revision: 1, content: visualContent() },
    { ...revise(1), title: 'Silent rename' }, { ...revise(1), accountKey: accountIdentity.accountKey },
    { ...revise(1), content: visualContent() },
  ]) assert.equal(parseMetabloomSavedWorkRequest(input), null);
});

test('revising preserves the original content and returns an Undo receipt tied to the new version', async () => {
  const { handler, durable, first, revise } = await setup();
  const original = structuredClone(durable.revisions.get(first.artifactId)[0]);
  const res = await invoke(handler, revise(1));
  assert.equal(res.statusCode, 200);
  const result = json(res);
  assert.equal(result.artifact.version, 2); assert.equal(result.artifact.revision, 2);
  assert.equal(result.artifact.title, first.title);
  assert.deepEqual(result.undo, { artifactId: first.artifactId, revision: 1, expectedVersion: 2 });
  assert.deepEqual(durable.revisions.get(first.artifactId)[0], original);
  assert.deepEqual(durable.revisions.get(first.artifactId)[1].content.scenario, { inputs: { hours: 17, rate: 85 } });
});

test('history is bounded and newest-first with metadata versions separate from content revisions', async () => {
  const { handler, first, revise } = await setup();
  await invoke(handler, revise(1));
  await invoke(handler, { action: 'rename', artifactId: first.artifactId, expectedVersion: 2, title: 'Renamed' });
  await invoke(handler, revise(3, 20));
  const page = json(await invoke(handler, { action: 'history', artifactId: first.artifactId, limit: 2 }));
  assert.equal(page.artifact.version, 4); assert.equal(page.artifact.headRevision, 3);
  assert.equal(page.artifact.title, 'Renamed');
  assert.deepEqual(page.items.map(item => item.revision), [3, 2]);
  assert.equal(page.nextBeforeRevision, 2);
  assert.doesNotMatch(JSON.stringify(page), /accountKey|workspaceId|content|payload|evidence/);
  const tail = json(await invoke(handler, { action: 'history', artifactId: first.artifactId,
    limit: 2, beforeRevision: page.nextBeforeRevision }));
  assert.deepEqual(tail.items.map(item => item.revision), [1]); assert.equal(tail.nextBeforeRevision, null);
});

test('opening an earlier revision is read-only and returns fresh references for that exact content', async () => {
  const { handler, first, durable, revise } = await setup();
  await invoke(handler, revise(1));
  const before = structuredClone(durable.values.get(first.artifactId));
  const res = await invoke(handler, { action: 'open', artifactId: first.artifactId, revision: 1 });
  assert.equal(res.statusCode, 200);
  const opened = json(res);
  assert.equal(opened.artifact.revision, 1); assert.equal(opened.artifact.headRevision, 2);
  assert.equal(opened.artifact.version, 2);
  assert.deepEqual(opened.content.scenario, { inputs: { hours: 10, rate: 65 } });
  assert.deepEqual(durable.values.get(first.artifactId), before);
});

test('restore and its Undo append new revisions without rewriting any earlier version', async () => {
  const { handler, first, durable, revise } = await setup();
  await invoke(handler, revise(1));
  const original = structuredClone(durable.revisions.get(first.artifactId));
  const restored = json(await invoke(handler, { action: 'restore', artifactId: first.artifactId,
    expectedVersion: 2, revision: 1 }));
  assert.equal(restored.artifact.headRevision, 3); assert.equal(restored.artifact.version, 3);
  assert.deepEqual(restored.undo, { artifactId: first.artifactId, revision: 2, expectedVersion: 3 });
  assert.deepEqual(durable.revisions.get(first.artifactId).slice(0, 2), original);
  assert.deepEqual(durable.values.get(first.artifactId).content, original[0].content);
  const undone = json(await invoke(handler, { action: 'restore', ...restored.undo }));
  assert.equal(undone.artifact.headRevision, 4); assert.equal(undone.artifact.version, 4);
  assert.deepEqual(durable.values.get(first.artifactId).content, original[1].content);
  assert.deepEqual(durable.revisions.get(first.artifactId).slice(0, 2), original);
});

test('restoring the current head is rejected without creating a no-op revision', async () => {
  const { handler, first, durable } = await setup();
  const count = durable.calls.length;
  const res = await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 1, revision: 1 });
  assert.equal(res.statusCode, 400); assert.equal(json(res).code, 'saved_work_invalid');
  assert.equal(durable.revisions.get(first.artifactId).length, 1);
  assert.equal(durable.calls.slice(count).some(call => call[0] === 'appendRevision'), false);
});

test('identical content cannot consume a new revision through either revise or historical restore', async () => {
  const { handler, first, durable, source, revise } = await setup();
  const identical = await invoke(handler, { action: 'revise', artifactId: first.artifactId, expectedVersion: 1,
    source, scenario: { inputs: { hours: 10, rate: 65 } } });
  assert.equal(identical.statusCode, 400);
  assert.equal(durable.revisions.get(first.artifactId).length, 1);
  await invoke(handler, revise(1));
  await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 2, revision: 1 });
  const repeated = await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 3, revision: 1 });
  assert.equal(repeated.statusCode, 400);
  assert.equal(durable.revisions.get(first.artifactId).length, 3);
});

test('foreign and nonexistent revisions never produce history, content or a restore receipt', async () => {
  const { handler, first, temporary, durable, revise } = await setup();
  await invoke(handler, revise(1));
  const foreign = createMetabloomSavedWorkHandler({ ...temporary, getStore: () => durable.store,
    authenticate: authenticate({ accountKey: 'f'.repeat(64) }) });
  for (const action of [
    { action: 'history', artifactId: first.artifactId },
    { action: 'open', artifactId: first.artifactId, revision: 1 },
    { action: 'restore', artifactId: first.artifactId, expectedVersion: 2, revision: 1 },
    revise(2),
  ]) {
    const res = await invoke(foreign, action); assert.equal(res.statusCode, 404);
    assert.equal(json(res).code, 'saved_work_not_found');
  }
  for (const action of ['open', 'restore']) {
    const res = await invoke(handler, { action, artifactId: first.artifactId, revision: 99,
      ...(action === 'restore' ? { expectedVersion: 2 } : {}) });
    assert.equal(res.statusCode, 404);
  }
  assert.equal(durable.revisions.get(first.artifactId).length, 2);
});

test('an intervening edit or rename invalidates Undo rather than overwriting newer work', async () => {
  for (const intervention of ['rename', 'revise']) {
    const { handler, first, durable, revise } = await setup();
    const change = json(await invoke(handler, revise(1)));
    await invoke(handler, intervention === 'rename' ? { action: 'rename', artifactId: first.artifactId,
      expectedVersion: 2, title: 'Other tab title' } : revise(2, 30));
    const before = structuredClone(durable.values.get(first.artifactId));
    const res = await invoke(handler, { action: 'restore', ...change.undo });
    assert.equal(res.statusCode, 409); assert.equal(json(res).code, 'saved_work_conflict');
    assert.deepEqual(durable.values.get(first.artifactId), before);
  }
});

test('concurrent revision attempts using one version commit only one change', async () => {
  const { handler, first, durable, revise } = await setup();
  const results = await Promise.all([invoke(handler, revise(1, 20)), invoke(handler, revise(1, 30))]);
  assert.deepEqual(results.map(res => res.statusCode).sort(), [200, 409]);
  assert.equal(durable.revisions.get(first.artifactId).length, 2);
  assert.equal(durable.values.get(first.artifactId).version, 2);
});

test('a lost committed response is reconciled through history and cannot duplicate a revision on retry', async () => {
  const { handler, first, durable, revise } = await setup();
  const dropped = response(), append = durable.store.appendRevision;
  durable.store.appendRevision = async (...args) => {
    const result = await append(...args); dropped.destroyed = true; return result;
  };
  const input = revise(1, 20);
  await handler(request(input), dropped);
  assert.equal(dropped.body, '');
  const retry = await invoke(handler, input);
  assert.equal(retry.statusCode, 409);
  const history = json(await invoke(handler, { action: 'history', artifactId: first.artifactId }));
  assert.equal(history.artifact.headRevision, 2);
  assert.deepEqual(history.items.map(item => item.revision), [2, 1]);
  assert.equal(durable.revisions.get(first.artifactId).length, 2);
});

test('deletion between historical read and restore cannot resurrect the item', async () => {
  const { handler, first, durable, revise } = await setup();
  await invoke(handler, revise(1));
  const get = durable.store.get;
  durable.store.get = async (...args) => {
    const selected = await get(...args);
    await durable.store.delete(args[0], { artifactId: first.artifactId, expectedVersion: 2 }, args[2]);
    return selected;
  };
  const res = await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 2, revision: 1 });
  assert.equal(res.statusCode, 404);
  assert.equal(durable.values.has(first.artifactId), false);
});

test('storage limits preserve history and return no fake restore or Undo receipt', async () => {
  const { handler, first, durable, revise } = await setup();
  await invoke(handler, revise(1));
  const before = structuredClone(durable.revisions.get(first.artifactId));
  durable.store.appendRevision = async () => { throw savedWorkError('saved_work_limit'); };
  const res = await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 2, revision: 1 });
  assert.equal(res.statusCode, 409); assert.equal(json(res).code, 'saved_work_limit');
  assert.equal(Object.hasOwn(json(res), 'undo'), false);
  assert.deepEqual(durable.revisions.get(first.artifactId), before);
});

test('restoring research preserves the original complete evidence and dates after later revisions', async () => {
  const { handler, temporary, durable } = await setup();
  const original = await temporary.researchStore.saveReport(identity, { message: researchFixture.message,
    report: researchFixture.report(), temporalContext: researchFixture.temporalContext() });
  const first = json(await invoke(handler, { action: 'save', requestId: randomUUID(), title: 'Research',
    source: { kind: 'research', researchId: original.researchId } })).artifact;
  const changedReport = researchFixture.report();
  changedReport.notes += '\n\nAdditional fictional evidence [1].';
  const newer = await temporary.researchStore.saveReport(identity, { message: researchFixture.message,
    report: changedReport, temporalContext: researchFixture.temporalContext() });
  const changed = await invoke(handler, { action: 'revise', artifactId: first.artifactId, expectedVersion: 1,
    source: { kind: 'research', researchId: newer.researchId } });
  assert.equal(changed.statusCode, 200);
  temporary.clock.value += 86400000;
  const restored = await invoke(handler, { action: 'restore', artifactId: first.artifactId, expectedVersion: 2, revision: 1 });
  assert.equal(restored.statusCode, 200);
  const current = durable.values.get(first.artifactId);
  assert.equal(current.content.asOf, researchFixture.asOf);
  assert.deepEqual(current.content.report, researchFixture.report());
  assert.deepEqual(durable.revisions.get(first.artifactId)[1].content.report, changedReport);
  const opened = json(await invoke(handler, { action: 'open', artifactId: first.artifactId }));
  assert.equal(opened.reference.research.asOf, original.asOf);
});

test('revision responses validate Undo identity/version and historical Open selection', async () => {
  const { handler, first, revise } = await setup();
  const input = revise(1), result = json(await invoke(handler, input));
  for (const undo of [
    { ...result.undo, artifactId: randomUUID() }, { ...result.undo, expectedVersion: 3 },
    { ...result.undo, revision: 2 }, { ...result.undo, content: visualContent() },
  ]) assert.equal(parseMetabloomSavedWorkResponse(input, { ...result, undo }), null);
  const opened = json(await invoke(handler, { action: 'open', artifactId: first.artifactId, revision: 1 }));
  assert.equal(parseMetabloomSavedWorkResponse({ action: 'open', artifactId: first.artifactId }, opened), null);
  assert.equal(parseMetabloomSavedWorkResponse({ action: 'open', artifactId: first.artifactId, revision: 2 }, opened), null);
  const historical = await requestMetabloomSavedWork({ action: 'open', artifactId: first.artifactId, revision: 1 },
    { fetchImpl: async () => Response.json(opened) });
  assert.equal(historical.artifact.revision, 1); assert.equal(historical.artifact.headRevision, 2);
});

test('history response validation rejects duplicate, unsorted, out-of-range and forged pagination metadata', async () => {
  const { handler, first, revise } = await setup();
  await invoke(handler, revise(1));
  const input = { action: 'history', artifactId: first.artifactId, limit: 1 };
  const result = json(await invoke(handler, input));
  for (const value of [
    { ...result, nextBeforeRevision: 1 },
    { ...result, items: [...result.items, ...result.items] },
    { ...result, items: [{ ...result.items[0], revision: 3 }] },
    { ...result, items: [{ ...result.items[0], createdAt: 'unknown' }] },
    { ...result, artifact: { ...result.artifact, workspaceId: randomUUID() } },
  ]) assert.equal(parseMetabloomSavedWorkResponse(input, value), null);
  assert.equal(parseMetabloomSavedWorkResponse({ ...input, beforeRevision: 2 }, result), null);
  const history = await requestMetabloomSavedWork(input, { fetchImpl: async () => Response.json(result) });
  assert.deepEqual(history, result);
});
