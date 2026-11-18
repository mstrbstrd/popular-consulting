const test = require('node:test');
const assert = require('node:assert/strict');
const { serviceRules, ruleChanges, priceBookMemoryDatabase } = require('./fixtures/metabloom-price-book-workflow.cjs');
const { compileMetabloomPriceBook: compile, normalizeMetabloomPriceRule: normalize, getMetabloomPriceRuleState: state,
  emptyMetabloomPriceRules, parseMetabloomPriceBookDraft, buildMetabloomPriceBookDraftVisual } = require('../src/components/metabloomPriceBookRules');
const { quoteMetabloomPriceBook: quote } = require('../src/components/metabloomPriceBook');
const { parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const { createMetabloomPriceBookWorkflowStore: createStore, priceBookDraftView } = require('../server/metabloomPriceBookWorkflow');
const { createMetabloomPriceBookStore } = require('../server/metabloomPriceBookStore');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../server/metabloomSavedWorkDatabase');
const identity = { accountKey: 'a'.repeat(64) };
const setup = () => { const database = priceBookMemoryDatabase(); return { database, store: createStore(database, { now: () => 1000 }) }; };
const complete = store => store.update(identity, { expectedRevision: 0, requestId: 'initial-draft', changes: ruleChanges(serviceRules()) });
const publish = draft => ({ draftId: draft.id, draftRevision: draft.revision, compiler: 'service-rates-1', expectedVersion: 0, requestId: 'publish-draft' });

test('draft loading, updates and publication receipts pass through the production Redis adapter', async () => {
  const config = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: 'production', AUTH_APP_ORIGIN: 'https://pricing.example.test',
    AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fictional-test-token' });
  const memory = priceBookMemoryDatabase(config.scope);
  const command = createMetabloomSavedWorkTransport(config, { fetchImpl: async (url, options) => {
    assert.equal(url, config.redisUrl);
    return new Response(JSON.stringify({ result: await memory.command(JSON.parse(options.body)) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } });
  const database = { config, command }, store = createStore(database, { now: () => 1000 });
  assert.equal(await store.read(identity), null);
  assert.equal(memory.calls.length, 1, 'The empty-draft read must reach Redis through the production adapter');
  const draft = await complete(store);
  assert.deepEqual(await complete(store), draft, 'Duplicate updates must resolve their stored receipt');
  assert.deepEqual(await createStore(database).read(identity), draft);
  const active = await store.publish(identity, publish(draft));
  assert.deepEqual(await store.publish(identity, publish(draft)), active, 'Duplicate publications must resolve their stored receipt');
  assert.deepEqual(await createMetabloomPriceBookStore(database).read(identity), active);
  assert.equal(quote(active.book, { hours: 3, distance: 30, weekend: true }).totalCents, 55388);
});

test('missing business values remain unknown; no model or location can supply implicit rates', () => {
  const empty = emptyMetabloomPriceRules();
  assert.equal(state(empty).status, 'collecting'); assert.equal(state(empty).missing[0], 'currency');
  assert.throws(() => compile(empty), { code: 'price_book_incomplete' });
  for (const [field, value] of [['tax_mode', 'inclusive'], ['other_premiums', 'after hours 2x'], ['minimum_timing', 'after_tax'],
    ['labour_rate', '1e2'], ['labour_rate', 95], ['labour_rate', '-1'], ['billing_minutes', '0.001'], ['formula', ['eval']]])
    assert.throws(() => normalize(field, value), { code: 'price_book_rule_invalid' });
  assert.equal(normalize('labour_rate', '095.00'), '95');
});

test('host compiler reproduces the independently agreed boundary quotes and serializes deterministically', () => {
  const book = compile(serviceRules());
  assert.equal(JSON.stringify(book), JSON.stringify(compile(serviceRules())));
  for (const [hours, distance, weekend, total] of [[1, 0, false, 21000], [2, 25, false, 25200],
    [2, 25.000001, false, 30450], [2.01, 0, false, 22444], [4, 0, false, 39900], [3, 30, true, 55388]])
    assert.equal(quote(book, { hours, distance, weekend }).totalCents, total);
  assert(book.examples.some(example => example.inputs.weekend));
});

test('generated jobs agree with an independent integer-cents oracle and never drop below the minimum', () => {
  const book = compile(serviceRules());
  for (let i = 0; i < 1200; i++) {
    const hundredths = (i * 83) % 2100, millionthsKm = (i * 791923) % 150000000, weekend = i % 3 === 0;
    const quarters = Math.max(8, Math.ceil(hundredths / 25));
    // Half-up to cents, then tax each rounded line independently.
    const labour = Math.floor((quarters * 2375 * (weekend ? 3 : 2) + 1) / 2);
    const travel = Math.ceil(millionthsKm / 25000000) * 5000;
    const topup = Math.max(0, 20000 - labour - travel);
    const expected = [labour, travel, topup].reduce((sum, cents) => sum + cents + Math.floor((cents * 5 + 50) / 100), 0);
    const result = quote(book, { hours: hundredths / 100, distance: millionthsKm / 1000000, weekend });
    assert.equal(result.totalCents, expected, `Job ${i}`); assert(result.subtotalCents >= 20000);
  }
});

test('minimum covers rounded components, with explicit fee/tax scopes and no floating-point top-up drift', () => {
  const book = compile(serviceRules({ labour_rate: '0.01', minimum_hours: '0', billing_minutes: '0', travel_mode: 'per_km', travel_rate: '0.01',
    weekend_multiplier: '1', minimum_charge: '0.03', callout_fee: '0.01', minimum_scope: 'labour_travel_callout', tax_mode: 'none' }));
  const result = quote(book, { hours: 0.5, distance: 0.5 });
  assert.equal(result.subtotalCents, 3); assert.equal(result.lines.at(-1).subtotalCents, 0);
  const fixed = compile(serviceRules({ labour_mode: 'fixed', labour_rate: '100', travel_mode: 'none', weekend_multiplier: '1',
    minimum_charge: '0', callout_fee: '10', taxes: [{ label: 'Tax', rate: '10', appliesTo: ['callout'] }] }));
  assert.equal(quote(fixed, { job: true }).totalCents, 11100); assert.equal(quote(fixed, { job: false }).totalCents, 0);
});

test('flat, per-kilometre and block travel honor zero, allowance, scope and distance-basis boundaries', () => {
  for (const mode of ['flat', 'per_km', 'started_blocks']) {
    const book = compile(serviceRules({ labour_mode: 'fixed', labour_rate: '0', minimum_charge: '0', tax_mode: 'none',
      travel_mode: mode, travel_rate: '10', travel_free_km: '5', travel_block_km: '5', flat_travel_applies: 'positive_distance',
      travel_distance_basis: 'round_trip', weekend_scope: 'travel', weekend_multiplier: '2' }));
    assert.match(book.inputs[0].label, /round-trip/);
    for (const [distance, units] of mode === 'flat' ? [[0, 0], [0.000001, 1], [5, 1]]
      : mode === 'per_km' ? [[0, 0], [5, 0], [5.5, 0.5]] : [[0, 0], [5, 0], [5.000001, 1], [10, 1], [10.000001, 2]])
      assert.equal(quote(book, { distance, weekend: true }).totalCents, units * 2000);
  }
});

test('rates that overflow at supported quote boundaries are rejected before publication', () => {
  assert.throws(() => compile(serviceRules({ travel_block_km: '0.000001', travel_rate: '100000' })),
    { code: 'price_book_unsupported_combination' });
});

test('saved drafts survive new store instances, partial inputs and history loss; source excerpts must match the current message', async () => {
  const { store, database } = setup();
  await assert.rejects(store.update(identity, { expectedRevision: 0, requestId: 'bad-evidence', changes: [{ field: 'currency', value: 'CAD', sourceText: 'CAD' }] },
    { source: 'chat', message: 'We are in Canada.' }), { code: 'price_book_evidence_required' });
  assert.equal(database.data.size, 0);
  const draft = await store.update(identity, { expectedRevision: 0, requestId: 'good-evidence', changes: [{ field: 'currency', value: 'CAD', sourceText: 'CAD' }] },
    { source: 'chat', message: 'Use CAD please.' });
  assert.equal(draft.rules.labour_rate, null); assert.deepEqual(draft.sources.currency, { kind: 'chat', text: 'CAD' });
  assert.deepEqual(await createStore(database).read(identity), draft);
  assert.equal(priceBookDraftView(draft).nextQuestion, 'Is labour charged hourly or as a fixed amount per job?');
  assert.equal(await store.read({ accountKey: 'b'.repeat(64) }), null);
});

test('unsupported proposals stay blocked until corrected; no publication or formula substitution is possible', async () => {
  const { store, database } = setup(); let draft = await complete(store);
  draft = await store.update(identity, { expectedRevision: 1, requestId: 'unsupported-tax', changes: [{ field: 'tax_mode', value: 'inclusive' }] });
  assert.equal(draft.rules.tax_mode, 'exclusive'); assert.equal(priceBookDraftView(draft).status, 'needs_clarification');
  await assert.rejects(store.publish(identity, publish(draft)), { code: 'price_book_incomplete' });
  assert.equal(await createMetabloomPriceBookStore(database).read(identity), null);
  draft = await store.update(identity, { expectedRevision: 2, requestId: 'correct-tax', changes: [{ field: 'tax_mode', value: 'none' }] });
  assert.equal(priceBookDraftView(draft).status, 'ready_for_review');
  assert.equal(draft.issues.length, 0);
});

test('revision CAS, idempotent receipts and publication bind the reviewed server draft, never client formulas', async () => {
  const { store, database } = setup(); const draft = await complete(store);
  await assert.rejects(store.publish(identity, { ...publish(draft), compiler: 'old-compiler' }), { code: 'price_book_invalid' });
  assert.deepEqual(await complete(store), draft);
  await assert.rejects(store.update(identity, { expectedRevision: 0, requestId: 'another-draft', changes: ruleChanges(serviceRules()) }), { code: 'price_book_conflict' });
  const changed = await store.update(identity, { expectedRevision: 1, requestId: 'change-rate', changes: [{ field: 'labour_rate', value: '100' }] });
  await assert.rejects(store.publish(identity, publish(draft)), { code: 'price_book_conflict' });
  const active = await store.publish(identity, publish(changed));
  assert.deepEqual(await store.publish(identity, publish(changed)), active);
  await assert.rejects(store.publish(identity, { ...publish(changed), expectedVersion: 1 }), { code: 'price_book_conflict' });
  assert.deepEqual(active.book, compile(changed.rules));
  const audit = JSON.parse([...database.data.entries()].find(([key]) => key.endsWith(':history:1'))[1]);
  assert.deepEqual(audit.draft, changed); assert.equal(audit.compiler, 'service-rates-1');
  assert(parseMetabloomVisual(buildMetabloomPriceBookDraftVisual(changed)));
});

test('malformed drafts, changes, clocks and receipts fail closed without publishing', async () => {
  const { store, database } = setup(); const draft = await complete(store);
  for (const changes of [[null], [{ field: '__proto__', value: 'x' }], [{ field: 'currency', value: 'CAD', accountKey: 'other' }]])
    await assert.rejects(store.update(identity, { expectedRevision: 1, requestId: 'invalid-change', changes }), { code: 'price_book_invalid' });
  assert.equal(parseMetabloomPriceBookDraft({ ...draft, issues: [null] }), null);
  await assert.rejects(createStore(database, { now: () => NaN }).publish(identity, publish(draft)), { code: 'price_book_unavailable' });
  const activeKey = `metabloom:price-book:v1:${database.config.scope}:${identity.accountKey}`;
  assert.equal(database.data.has(activeKey), false);
  await store.publish(identity, publish(draft));
  const key = [...database.data.keys()].find(key => key.endsWith(':publish:publish-draft'));
  const receipt = JSON.parse(database.data.get(key)); receipt.result = JSON.stringify({ version: 1 }); database.data.set(key, JSON.stringify(receipt));
  await assert.rejects(store.publish(identity, publish(draft)), { code: 'price_book_unavailable' });
});
