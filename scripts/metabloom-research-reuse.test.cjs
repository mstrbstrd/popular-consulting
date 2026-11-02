const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMetabloomResearchStore, researchCommand, MAX_REDIS_RESPONSE_BYTES } = require('../server/metabloomResearchStore');
const { buildMetabloomResearchTemporalContext } = require('../server/metabloomResearchBrief');
const { parseMetabloomResearchReferenceMetadata } = require('../src/components/metabloomResearchReference');
const { resolveMetabloomResearchContext, selectMetabloomReusedEvidence, buildMetabloomResearchVisualContext,
  matchesMetabloomResearchConversion } = require('../server/metabloomResearchContext');
const { identity, asOf, message, temporalContext, report, brief, memoryStore } = require('./fixtures/metabloom-research-reuse.cjs');

const save = fixture => fixture.store.saveReport(identity, { message, report: report(), temporalContext: temporalContext() });
const resolve = (fixture, reference, extra = {}) => resolveMetabloomResearchContext({ store: fixture.store, identity, reference, ...extra });

test('immutable report storage preserves exact text and sources while using a session-owned separate namespace', async () => {
  const fixture = memoryStore(), original = report();
  original.notes += '\n\nExact figure: 12.3456789012345; Unicode: Montréal 漢字. [10]';
  const metadata = await fixture.store.saveReport(identity, { message, report: original, temporalContext: temporalContext() });
  const expected = structuredClone(original);
  original.notes = 'caller mutation'; original.sources[9].url = 'https://wrong.example/';
  assert.deepEqual((await fixture.store.getReport(identity, metadata.researchId)).report, expected);
  assert.equal(metadata.asOf, asOf);
  assert.equal(Date.parse(metadata.expiresAt), fixture.clock.value + 3600000);
  assert.match(fixture.commands[0][1], /^metabloom:\{research-[a-f0-9]{64}\}:report:[a-f0-9]{48}$/);
  assert.deepEqual(fixture.commands[0].slice(3), ['EX', '3600', 'NX']);
  assert.equal(await fixture.store.getReport({ ...identity, owner: 'f'.repeat(64) }, metadata.researchId), null);
  const first = await fixture.store.getReport(identity, metadata.researchId); first.report.sources[0].title = 'mutated';
  assert.notEqual((await fixture.store.getReport(identity, metadata.researchId)).report.sources[0].title, 'mutated');
});

test('brief records are immutable children with the original absolute expiration and original coverage', async () => {
  const fixture = memoryStore(), metadata = await save(fixture), original = brief();
  fixture.clock.value += 4000;
  const updated = await fixture.store.saveBrief(identity, metadata.researchId, original);
  assert.deepEqual(updated, { ...metadata, briefId: updated.briefId });
  assert.deepEqual(fixture.commands.at(-1).slice(3), ['PXAT', String(Date.parse(metadata.expiresAt)), 'NX']);
  assert.deepEqual(await fixture.store.getBrief(identity, metadata.researchId, updated.briefId), original);
  assert.equal(await fixture.store.getBrief(identity, 'f'.repeat(48), updated.briefId), null);
  const child = [...fixture.values.entries()].find(([key]) => key.includes(':brief:'))[1];
  assert.equal(child.expiresAt, Date.parse(metadata.expiresAt));
  const base = [...fixture.values.entries()].find(([key]) => key.includes(':report:'))[1];
  assert.equal(base.expiresAt, child.expiresAt);
  fixture.clock.value = child.expiresAt;
  assert.equal(await fixture.store.getBrief(identity, metadata.researchId, updated.briefId), null);
});

test('tampered temporal metadata, owner, expired record and corrupt JSON fail closed', async () => {
  for (const mutate of [record => { record.temporalContext.asOf = '2026-11-02T14:00:00.000Z'; },
    record => { record.research.expiresAt = '2026-11-02T15:00:00.000Z'; },
    record => { record.research.localDate = '2026-11-03'; },
    record => { record.temporalContext.localDate = '2026-11-03'; },
    record => { record.owner = 'f'.repeat(64); }, record => { record.report.sources[8].id = 1; }]) {
    const fixture = memoryStore(), metadata = await save(fixture);
    const value = [...fixture.values.values()][0], record = JSON.parse(value.raw);
    mutate(record); value.raw = JSON.stringify(record);
    assert.equal(await fixture.store.getReport(identity, metadata.researchId), null);
  }
  const fixture = memoryStore(), metadata = await save(fixture);
  fixture.clock.value = Date.parse(metadata.expiresAt);
  await assert.rejects(resolve(fixture, { researchId: metadata.researchId, selector: { type: 'report' } }), { code: 'research_reference_unavailable', status: 410 });
});

test('portable client dates cannot weaken authoritative server report and brief date checks at a timezone boundary', async () => {
  const instant = Date.parse('2026-11-03T07:50:00.000Z'), fixture = memoryStore({ now: instant + 1000 });
  const temporal = buildMetabloomResearchTemporalContext({ message, timeZone: 'America/Vancouver', now: instant });
  const metadata = await fixture.store.saveReport(identity, { message, report: report(), temporalContext: temporal });
  const alternativeDate = temporal.localDate === '2026-11-03' ? '2026-11-02' : '2026-11-03';
  // Both dates can be plausible to a browser with a different timezone database.
  // The portable display parser accepts the shape, but it is not server evidence.
  assert(parseMetabloomResearchReferenceMetadata({ ...metadata, localDate: alternativeDate }));
  const stored = [...fixture.values.entries()].find(([key]) => key.includes(':report:'))[1], original = stored.raw;
  for (const coordinateTemporal of [false, true]) {
    const record = JSON.parse(original); record.research.localDate = alternativeDate;
    if (coordinateTemporal) record.temporalContext.localDate = alternativeDate;
    stored.raw = JSON.stringify(record);
    assert.equal(await fixture.store.getReport(identity, metadata.researchId), null);
  }
  stored.raw = original;
  await assert.rejects(fixture.store.saveReport(identity, { message, report: report(),
    temporalContext: { ...temporal, localDate: alternativeDate } }), { code: 'research_reference_invalid', status: 400 });
  const authoritativeBrief = { ...brief(), asOf: temporal.asOf, timeZone: temporal.timeZone, localDate: temporal.localDate };
  const saved = await fixture.store.saveBrief(identity, metadata.researchId, authoritativeBrief);
  await assert.rejects(fixture.store.saveBrief(identity, metadata.researchId, { ...authoritativeBrief, localDate: alternativeDate }),
    { code: 'research_reference_invalid', status: 400 });
  const child = [...fixture.values.entries()].find(([key]) => key.includes(`:brief:${saved.briefId}`))[1];
  const forged = JSON.parse(child.raw); forged.brief.localDate = alternativeDate; child.raw = JSON.stringify(forged);
  assert.equal(await fixture.store.getBrief(identity, metadata.researchId, saved.briefId), null);
});

test('research reference resolution preserves exact selected finding, dates, coverage and sparse source IDs', async () => {
  const fixture = memoryStore(), metadata = await save(fixture);
  const updated = await fixture.store.saveBrief(identity, metadata.researchId, brief());
  for (const selector of [{ type: 'brief', briefId: updated.briefId }, { type: 'finding', briefId: updated.briefId, index: 1 }]) {
    const context = await resolve(fixture, { researchId: metadata.researchId, selector });
    assert.deepEqual(context.coverage, brief().coverage);
    assert.deepEqual(context.temporalContext, temporalContext());
    assert.deepEqual(context.evidence.sources.map(source => source.id), selector.type === 'finding' ? [10] : [9, 10]);
    assert.deepEqual(context.report, report());
    if (selector.type === 'finding') assert.deepEqual(context.finding, brief().items[1]);
    else assert.deepEqual(context.brief, brief());
  }
  await assert.rejects(resolve(fixture, { researchId: metadata.researchId, selector: { type: 'finding', briefId: updated.briefId, index: 9 } }),
    { code: 'research_reference_invalid', status: 400 });
  const other = await save(fixture);
  await assert.rejects(resolve(fixture, { researchId: other.researchId, selector: { type: 'brief', briefId: updated.briefId } }),
    { code: 'research_reference_unavailable', status: 410 });
});

test('whole-passage evidence ranking reaches later sources without renumbering or splitting passages', () => {
  const original = report();
  original.notes = `${'Early detail '.repeat(300)} [1]\n\nA zirconium experiment is relevant to the follow-up. [10]\n\nUnknown source. [999]`;
  const selected = selectMetabloomReusedEvidence(original, { message: 'Explain the zirconium experiment', maxChars: 100 });
  assert.equal(selected.notes, 'A zirconium experiment is relevant to the follow-up. [10]');
  assert.deepEqual(selected.sources, [original.sources[9]]);
  assert.equal(selected.limited, true);
});

test('qualitative finding tables preserve source IDs and factual text; numeric prose is not a chart dataset', async () => {
  const fixture = memoryStore(), metadata = await save(fixture);
  const updated = await fixture.store.saveBrief(identity, metadata.researchId, brief());
  const context = await resolve(fixture, { researchId: metadata.researchId, selector: { type: 'finding', briefId: updated.briefId, index: 1 } });
  const visual = buildMetabloomResearchVisualContext(context, 'table');
  assert.deepEqual(visual.sources, [report().sources[9]]);
  assert.deepEqual(visual.researchContext.projection.rows, [[brief().items[1].headline, brief().items[1].summary, 'Not established', '[10]']]);
  assert.deepEqual(visual.researchContext.coverage, brief().coverage);
  assert.match(visual.researchContext.provenance.label, /2026-11-02T13:00:00\.000Z/);
  for (const kind of ['bar-chart', 'line-chart', 'pie-chart', 'calculator', 'flowchart']) {
    assert.throws(() => buildMetabloomResearchVisualContext(context, kind), { code: 'research_conversion_unavailable' });
  }
});

test('cited numeric Markdown tables permit exact chart conversions and reject altered numbers, labels or units', async () => {
  const fixture = memoryStore(), original = report();
  original.notes = '| Program | Budget (CAD) |\n| --- | --- |\n| Alpha | 12.75 |\n| Beta | 20.5 |\n[9]';
  const metadata = await fixture.store.saveReport(identity, { message, report: original, temporalContext: temporalContext() });
  const context = await resolve(fixture, { researchId: metadata.researchId, selector: { type: 'report' } });
  for (const kind of ['bar-chart', 'line-chart', 'pie-chart']) {
    const visual = buildMetabloomResearchVisualContext(context, kind);
    const expected = { kind, unit: 'Budget (CAD)', points: [{ label: 'Alpha', value: 12.75 }, { label: 'Beta', value: 20.5 }] };
    assert.deepEqual(visual.researchContext.projection, expected);
    assert.deepEqual(visual.sources.map(source => source.id), [9]);
    assert.equal(matchesMetabloomResearchConversion(expected, expected), true);
    for (const changed of [{ ...expected, unit: 'USD' }, { ...expected, points: [{ label: 'Alpha', value: 999 }, expected.points[1]] },
      { ...expected, points: [expected.points[1], expected.points[0]] }]) assert.equal(matchesMetabloomResearchConversion(changed, expected), false);
  }
  for (const notes of [original.notes.replace('[9]', ''),
    original.notes.replace('| Beta | 20.5 |', '| Beta | 20.5'),
    original.notes.replace('| Beta | 20.5 |', '| Beta | not established |')]) {
    assert.throws(() => buildMetabloomResearchVisualContext({ ...context, evidence: { ...context.evidence, notes } }, 'bar-chart'),
      { code: 'research_conversion_unavailable' });
  }
});

test('storage failure and aborted lookup remain explicit and do not become empty evidence', async () => {
  const failed = createMetabloomResearchStore({ command: async () => { throw new Error('secret provider detail'); } });
  await assert.rejects(failed.getReport(identity, 'd'.repeat(48)), { code: 'research_reference_unavailable', status: 503 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(failed.getReport(identity, 'd'.repeat(48), { signal: controller.signal }), { name: 'AbortError' });
});

test('research Redis transport bounds response data and never follows redirect or exposes error text', async () => {
  const before = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fictional-test-token';
  try {
    assert.equal(await researchCommand(['GET', 'fictional'], { fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error'); return Response.json({ result: null });
    } }), null);
    await assert.rejects(researchCommand(['GET', 'fictional'], { fetchImpl: async () =>
      new Response('x'.repeat(MAX_REDIS_RESPONSE_BYTES + 1)) }), { code: 'research_reference_unavailable' });
    await assert.rejects(researchCommand(['GET', 'fictional'], { fetchImpl: async () => Response.json({ error: 'private detail' }) }),
      error => error.code === 'research_reference_unavailable' && !error.message.includes('private'));
  } finally {
    if (before.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = before.url;
    if (before.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = before.token;
  }
});
