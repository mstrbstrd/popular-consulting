const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetabloomBoomRequestStore } = require('../server/metabloomBoomRequestWorkflow');
const { boomRequestView, boomRequestDownload, parseMetabloomBoomDraft, buildBoomRequestVisual } = require('../src/components/metabloomBoomRequest');
const { parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const { getMetabloomVisualToolDefinition } = require('../server/metabloomToolFlow');
const { generateMetabloomVisual } = require('../server/metabloomVisualGenerator');
const { identity, conversationId, otherConversationId, fields, changesFor, messageFor, draft, boomDatabase } = require('./fixtures/metabloom-boom-request.cjs');
const update = (values, revision = 0, id = 'a'.repeat(64)) => ({ expectedRevision: revision, requestId: id, changes: changesFor(values) });

test('intake survives fresh store instances, isolates accounts and chats, and is independent of price books', async () => {
  const database = boomDatabase(), store = createMetabloomBoomRequestStore(database);
  assert.equal(await store.read(identity, conversationId), null);
  const first = await store.update(identity, conversationId, update({ market: 'CA' }), { message: 'CA' });
  assert.equal(first.revision, 1); assert.equal(boomRequestView(first).ready, false);
  assert.match(boomRequestView(first).nextQuestion, /first name/);
  assert.deepEqual(await createMetabloomBoomRequestStore(database).read(identity, conversationId), first);
  assert.equal(await store.read(identity, otherConversationId), null);
  assert.equal(await store.read({ accountKey: 'b'.repeat(64) }, conversationId), null);
  assert([...database.data.keys()].every(key => key.startsWith('metabloom:boom-request:')));
  assert(database.calls.every(args => args[0] === 'EVAL'));
});
test('retry is idempotent; stale and mismatched mutations cannot overwrite a saved request', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase());
  const input = update(fields()), options = { message: messageFor(fields()) };
  const first = await store.update(identity, conversationId, input, options);
  assert.deepEqual(await store.update(identity, conversationId, input, options), first);
  await assert.rejects(store.update(identity, conversationId, update({ market: 'US' }, 0, 'b'.repeat(64)), { message: 'US' }), { code: 'boom_request_conflict' });
  await assert.rejects(store.update(identity, conversationId, update({ market: 'US' }), { message: 'US' }), { code: 'boom_request_conflict' });
  assert.deepEqual(await store.read(identity, conversationId), first);
});
test('every required field gates completion and download; optional notes do not', () => {
  assert(boomRequestView(draft()).ready);
  for (const field of ['market', 'firstName', 'lastName', 'companyName', 'email', 'phoneNumber', 'pumpMake', 'pumpModel', 'serialNumber', 'hardness', 'backEnd']) {
    const partial = draft(); partial.fields[field] = null;
    assert.deepEqual(boomRequestView(partial).missing, [field]);
    assert.throws(() => boomRequestDownload(partial), /incomplete/);
  }
  const output = boomRequestDownload(draft());
  assert.match(output, /Not submitted to DY/); assert.match(output, /No file attached/);
  assert.match(output, /Serial number: DEMO-123/); assert(!output.includes('Estimated total'));
});
test('unknown serials, invalid contact details, extra fields and unsupported selections fail atomically', async () => {
  for (const [field, value] of [['email', 'bad-email'], ['phoneNumber', '123'], ['serialNumber', 'unknown'], ['hardness', 'Triple Wall'],
    ['market', 'CAD'], ['backEnd', 'maybe'], ['pumpMake', 'x'.repeat(81)], ['schematic', 'drawing.pdf'], ['price', '1000']]) {
    const store = createMetabloomBoomRequestStore(boomDatabase());
    await assert.rejects(store.update(identity, conversationId, update({ firstName: 'Alex', [field]: value }),
      { message: `Alex ${value}` }), { code: 'boom_request_invalid' });
    assert.equal(await store.read(identity, conversationId), null);
  }
});
test('evidence must contain the current value, not merely a real but unrelated excerpt or history', async () => {
  for (const change of [
    { field: 'market', value: 'US', sourceText: 'Canada' },
    { field: 'firstName', value: 'Alex', sourceText: 'Use Canada' },
    { field: 'market', value: 'CA', sourceText: 'CA from previous chat' },
    { field: 'serialNumber', value: null, sourceText: 'Canada' },
  ]) {
    const store = createMetabloomBoomRequestStore(boomDatabase());
    await assert.rejects(store.update(identity, conversationId, { expectedRevision: 0, requestId: 'a'.repeat(64), changes: [change] },
      { message: 'Use Canada' }), { code: 'boom_request_evidence_required' });
    assert.equal(await store.read(identity, conversationId), null);
  }
});
test('explicit corrections and clearing a required field reopen intake without changing other fields', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase());
  await store.update(identity, conversationId, update(fields()), { message: messageFor(fields()) });
  const next = await store.update(identity, conversationId, { expectedRevision: 1, requestId: 'b'.repeat(64),
    changes: [{ field: 'serialNumber', value: null, sourceText: 'Clear the serial number' }] }, { message: 'Clear the serial number' });
  assert.deepEqual(boomRequestView(next).missing, ['serialNumber']); assert.equal(next.fields.email, fields().email);
});
test('malformed storage, cancellation and invalid ownership fail closed', async () => {
  const database = boomDatabase(), store = createMetabloomBoomRequestStore(database);
  await assert.rejects(store.read(identity, '../other'), { code: 'boom_request_invalid' });
  await assert.rejects(store.read({ accountKey: 'bad' }, conversationId), { code: 'boom_request_invalid' });
  await assert.rejects(store.read(identity, conversationId, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  const broken = createMetabloomBoomRequestStore({ config: database.config, command: async () => '{invalid' });
  await assert.rejects(broken.read(identity, conversationId), { code: 'boom_request_unavailable' });
});
test('only typed host-built boom cards pass the visual boundary; generic generation cannot author them', async () => {
  assert(parseMetabloomVisual(buildBoomRequestVisual(draft())));
  const invalid = draft(); invalid.fields.total = '100';
  assert.equal(parseMetabloomBoomDraft(invalid), null);
  assert.equal(parseMetabloomVisual({ ...buildBoomRequestVisual(draft()), boomRequest: invalid }), null);
  assert(!getMetabloomVisualToolDefinition().parameters.properties.kind.enum.includes('boom-request'));
  await assert.rejects(generateMetabloomVisual({ offer: { kind: 'boom-request' } }), { code: 'visual_invalid' });
});


test('explicitly absent optional pipe details do not block otherwise complete intake', async () => {
  const store = createMetabloomBoomRequestStore(boomDatabase());
  const values = { ...fields(), boomPipe: 'None', deckPipe: 'None' };
  const result = await store.update(identity, conversationId, update(values), { message: messageFor(values) });
  assert.equal(boomRequestView(result).ready, true);
  assert.match(boomRequestDownload(result), /Boom pipe details: None/);
});
