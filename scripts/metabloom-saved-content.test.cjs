const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMetabloomSavedContent, MAX_METABLOOM_SAVED_CONTENT_BYTES,
  METABLOOM_SAVED_CONTENT_VERSION } = require('../server/metabloomSavedContent');
const { METABLOOM_VISUAL_KINDS, MAX_METABLOOM_VISUAL_BYTES,
  evaluateMetabloomVisualFormula } = require('../src/components/metabloomVisualProtocol');
const { MAX_METABLOOM_RESEARCH_REPORT_BYTES } = require('../src/components/metabloomResearchReport');
const { MAX_METABLOOM_RESEARCH_BRIEF_BYTES } = require('../src/components/metabloomResearchBriefProtocol');

const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const temporal = () => ({ asOf: '2026-11-03T07:10:00.000Z', timeZone: 'America/Vancouver', localDate: '2026-11-03' });
const sourcesFor = (count = 65) => Array.from({ length: count }, (_, index) => ({
  id: index + 1, title: `Fictional source ${index + 1}`, url: `https://example.org/evidence-${index + 1}`,
}));
const specFor = (kind = 'table') => {
  const common = { version: '1', designVersion: 'aetheris-1', kind, title: 'Fictional orchard comparison',
    summary: 'The original recorded values and qualifications.',
    provenance: { type: 'sources', label: 'Recorded fictional evidence.', sourceIds: [9, 65] } };
  if (kind === 'table') return { ...common, columns: ['Item', 'Value'], rows: [['Alpha', '10'], ['Beta', '20.5']] };
  if (kind === 'calculator') return { ...common,
    controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 0.5, initial: 120 },
      { id: 'people', label: 'People', unit: '', min: 0, max: 20, step: 1, initial: 3 }],
    formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
  if (kind === 'flowchart') return { ...common, nodes: [{ id: 'draft', label: 'Draft' }, { id: 'review', label: 'Review' }],
    edges: [{ from: 'draft', to: 'review', label: 'Submit' }] };
  if (kind === 'pie-chart') return { ...common, unit: 'units', points: [{ label: 'Alpha', value: 0 }, { label: 'Beta', value: 20.5 }] };
  return { ...common, unit: 'units', points: [{ label: 'Alpha', value: -10 }, { label: 'Beta', value: 20.5 }] };
};
const visualFor = (kind = 'table') => ({ schemaVersion: 1, kind: 'visual', spec: specFor(kind),
  sources: [sourcesFor()[8], sourcesFor()[64]] });
const reportFor = () => ({ notes: 'The first recorded finding is qualified [9].\n\nThe second remains uncertain [65].', sources: sourcesFor() });
const itemFor = id => ({ headline: `Fictional finding ${id}`, summary: `The complete overview for finding ${id}.`,
  sourceIds: [id], background: [{ text: `The recorded background for finding ${id}.`, sourceIds: [id] }],
  whyItMatters: 'The implications remain analysis.', uncertainty: ['The eventual outcome is not established.'],
  watchNext: ['Read the next published evaluation.'], developmentDate: '2026-11-02', scheduledDate: '2026-11-05',
  dateEvidence: { sourceId: id, quote: 'The fictional development was announced on November 2, 2026.' }, evidenceStatus: 'reported' });
const sourceDetailFor = sourceId => ({ sourceId, publisher: `Fictional publisher ${sourceId}`,
  publishedDate: '2026-11-02', dateEvidence: 'Published November 2, 2026.', sourceType: 'reporting' });
const briefFor = () => ({ version: 'metabloom-research-brief-v1', kind: 'news',
  title: 'Fictional orchard briefing', scope: 'The requested fictional developments.', ...temporal(),
  windowStart: '2026-11-02', windowEnd: '2026-11-03',
  coverage: { requestedCount: 3, returnedCount: 2, status: 'partial', limitations: ['Only two developments have dated evidence.'] },
  items: [9, 65].map(itemFor), sourceDetails: [9, 65].map(sourceDetailFor) });
const researchFor = (withBrief = true) => ({ schemaVersion: 1, kind: 'research',
  question: 'Investigate the fictional orchard developments.', ...temporal(), report: reportFor(),
  ...(withBrief ? { brief: briefFor() } : {}) });

for (const kind of METABLOOM_VISUAL_KINDS) test(`round-trips a complete native ${kind} with sparse original source IDs`, () => {
  const input = visualFor(kind), parsed = parseMetabloomSavedContent(input);
  assert.deepEqual(parsed, input);
  assert.deepEqual(parseMetabloomSavedContent(parsed), parsed);
  assert.notEqual(parsed.spec, input.spec);
  assert.notEqual(parsed.sources, input.sources);
  assert.notEqual(parsed.sources[0], input.sources[0]);
  assert.deepEqual(parsed.sources.map(source => source.id), [9, 65]);
  input.sources[0].url = 'https://changed.example/';
  input.spec.provenance.sourceIds.reverse();
  assert.equal(parsed.sources[0].url, 'https://example.org/evidence-9');
  assert.deepEqual(parsed.spec.provenance.sourceIds, [9, 65]);
});

for (const kind of ['bar-chart', 'line-chart']) test(`retains multiple ${kind} series without reordering observations`, () => {
  const input = visualFor(kind);
  delete input.spec.points;
  input.spec.labels = ['Later', 'Earlier'];
  input.spec.series = [{ id: 'first', label: 'First', values: [0.005, 1.23456789] },
    { id: 'second', label: 'Second', values: [1e12, -10] }];
  assert.deepEqual(parseMetabloomSavedContent(input), input);
});

test('a saved calculator scenario preserves exact inputs and recomputes without a stored result', () => {
  const input = { ...visualFor('calculator'), scenario: { inputs: { people: 4, total: 182.5 } } };
  const parsed = parseMetabloomSavedContent(input);
  assert.deepEqual(parsed.scenario, input.scenario);
  assert.equal(evaluateMetabloomVisualFormula(parsed.spec.formula, parsed.spec.controls, parsed.scenario.inputs), 45.625);
  assert.equal(Object.hasOwn(parsed.scenario, 'result'), false);
  input.scenario.inputs.total = 0;
  assert.equal(parsed.scenario.inputs.total, 182.5);
});

test('canonical numeric zero survives the same JSON representation used by durable storage', () => {
  const parsed = parseMetabloomSavedContent({ ...visualFor('calculator'), scenario: { inputs: { total: -0, people: 4 } } });
  assert.equal(parsed.scenario.inputs.total, 0);
  assert.deepEqual(parsed, clone(parsed));
});

for (const [name, scenario] of [
  ['missing control', { inputs: { total: 120 } }],
  ['unknown control', { inputs: { total: 120, people: 3, invented: 1 } }],
  ['empty draft', { inputs: { total: '', people: 3 } }],
  ['numeric draft string', { inputs: { total: '120', people: 3 } }],
  ['nonfinite number', { inputs: { total: Infinity, people: 3 } }],
  ['NaN', { inputs: { total: NaN, people: 3 } }],
  ['below minimum', { inputs: { total: -1, people: 3 } }],
  ['above maximum', { inputs: { total: 1001, people: 3 } }],
  ['undefined result', { inputs: { total: 120, people: 0 } }],
  ['caller result', { inputs: { total: 120, people: 3 }, result: 40 }],
  ['null scenario', null],
]) test(`rejects calculator ${name}`, () => {
  assert.equal(parseMetabloomSavedContent({ ...visualFor('calculator'), scenario }), null);
});

test('scenario inputs are only accepted for calculators and remain optional for the saved definition', () => {
  assert.ok(parseMetabloomSavedContent(visualFor('calculator')));
  assert.equal(parseMetabloomSavedContent({ ...visualFor(), scenario: { inputs: { total: 120, people: 3 } } }), null);
});

test('native schema, formula, provenance and size limits remain mandatory', () => {
  for (const change of [{ version: '2' }, { designVersion: 'foreign' }, { html: '<script>run()</script>' },
    { title: 'x'.repeat(101) }, { rows: [['Missing column']] }, { rows: Array.from({ length: 101 }, () => ['A', '10']) },
    { provenance: { type: 'sources', label: 'Unmapped evidence.', sourceIds: [999] } }]) {
    assert.equal(parseMetabloomSavedContent({ ...visualFor(), spec: { ...specFor(), ...change } }), null);
  }
  const oversized = visualFor();
  oversized.spec.columns = Array.from({ length: 8 }, (_, index) => `Column ${index}`);
  oversized.spec.rows = Array.from({ length: 100 }, () => Array(8).fill('x'.repeat(400)));
  assert.ok(bytes(oversized.spec) > MAX_METABLOOM_VISUAL_BYTES);
  assert.equal(parseMetabloomSavedContent(oversized), null);
  const calculator = visualFor('calculator'); calculator.spec.formula = ['fetch', 'people', 'divide'];
  assert.equal(parseMetabloomSavedContent(calculator), null);
});

test('visual source metadata rejects duplicate IDs, unknown fields and executable URLs', () => {
  for (const sources of [
    [sourcesFor()[8], sourcesFor()[8]],
    [{ ...sourcesFor()[8], owner: 'not-content' }, sourcesFor()[64]],
    // eslint-disable-next-line no-script-url -- Deliberately hostile fixture must fail validation.
    [{ ...sourcesFor()[8], url: 'javascript:alert(1)' }, sourcesFor()[64]],
  ]) assert.equal(parseMetabloomSavedContent({ ...visualFor(), sources }), null);
});

test('complete research preserves exact evidence, dates, partial coverage and qualifications as independent copies', () => {
  const input = researchFor(), expected = clone(input), parsed = parseMetabloomSavedContent(input);
  assert.deepEqual(parsed, expected);
  assert.deepEqual(parseMetabloomSavedContent(parsed), parsed);
  input.report.notes = 'Changed outside the snapshot';
  input.report.sources[64].url = 'https://changed.example/';
  input.brief.items[1].sourceIds[0] = 1;
  input.brief.coverage.limitations.length = 0;
  assert.deepEqual(parsed, expected);
  parsed.brief.items[0].background[0].text = 'Changed returned copy';
  assert.equal(input.brief.items[0].background[0].text, expected.brief.items[0].background[0].text);
});

test('report-only research remains valid when no brief or short answer could be prepared', () => {
  const input = researchFor(false), parsed = parseMetabloomSavedContent(input);
  assert.deepEqual(parsed, input);
  assert.equal(Object.hasOwn(parsed, 'brief'), false);
  assert.equal(Object.hasOwn(parsed, 'answer'), false);
  assert.equal(parseMetabloomSavedContent({ ...input, brief: null }), null);
});

test('a valid unavailable brief preserves its coverage explanation and does not invent findings', () => {
  const input = researchFor();
  input.brief.items = []; input.brief.sourceDetails = [];
  input.brief.coverage = { requestedCount: 3, returnedCount: 0, status: 'unavailable', limitations: ['No findings met the requested interval.'] };
  assert.deepEqual(parseMetabloomSavedContent(input), input);
});

test('only the known transient brief media field is stripped, leaving evidence readable', () => {
  const input = researchFor();
  input.brief.media = [{ sourceId: 9, token: 'session.signed.token', previewUrl: 'https://temporary.example/' }];
  const parsed = parseMetabloomSavedContent(input);
  assert.deepEqual(parsed, researchFor());
  assert.equal(Object.hasOwn(parsed.brief, 'media'), false);
  assert.equal(JSON.stringify(parsed).includes('session.signed.token'), false);
  assert.equal(input.brief.media[0].token, 'session.signed.token');
  input.brief.hiddenContext = 'Do not retain provider context';
  assert.equal(parseMetabloomSavedContent(input), null);
});

test('question normalization and the existing 1600-character limit match the chat input boundary', () => {
  const input = researchFor(false);
  assert.equal(parseMetabloomSavedContent({ ...input, question: '  A\nmultiline question.  ' }).question, 'A\nmultiline question.');
  assert.equal(parseMetabloomSavedContent({ ...input, question: 'x'.repeat(1600) }).question.length, 1600);
  for (const question of ['', '  \n ', 'x'.repeat(1601), null, 3]) {
    assert.equal(parseMetabloomSavedContent({ ...input, question }), null);
  }
});

test('brief citations and report source identity cannot be changed or silently renumbered', () => {
  const invalid = [
    value => { value.brief.items[0].sourceIds = [999]; },
    value => { value.brief.items[0].dateEvidence.sourceId = 65; },
    value => { value.brief.sourceDetails[0].sourceId = 1; },
    value => { value.report.sources.reverse(); },
    value => { value.report.sources[8].id = 1; },
    // eslint-disable-next-line no-script-url -- Deliberately hostile fixture must fail validation.
    value => { value.report.sources[8].url = 'javascript:alert(1)'; },
  ];
  for (const mutate of invalid) {
    const input = researchFor(); mutate(input);
    assert.equal(parseMetabloomSavedContent(input), null);
  }
  const plainMarker = researchFor(false);
  plainMarker.report.notes += '\nAn unverified literal marker [999] and <script>text</script> remain plain report text.';
  assert.equal(parseMetabloomSavedContent(plainMarker).report.notes, plainMarker.report.notes);
});

test('brief acquisition metadata must exactly match the original report context', () => {
  for (const change of [{ asOf: '2026-11-03T07:11:00.000Z' }, { timeZone: 'UTC' }, { localDate: '2026-11-02' }]) {
    const input = researchFor(); Object.assign(input.brief, change);
    assert.equal(parseMetabloomSavedContent(input), null);
  }
  const futureWindow = researchFor(); futureWindow.brief.windowEnd = '2026-11-04';
  assert.equal(parseMetabloomSavedContent(futureWindow), null);
});

test('canonical original dates survive a timezone database that places the instant on the previous day', () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = function (locale, options) {
      return new NativeDateTimeFormat(locale, options?.timeZone === 'America/Vancouver'
        ? { ...options, timeZone: 'Etc/GMT+8' } : options);
    };
    const input = researchFor();
    const day = new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone, day: '2-digit' })
      .formatToParts(new Date(input.asOf)).find(part => part.type === 'day').value;
    assert.equal(day, '02');
    assert.deepEqual(parseMetabloomSavedContent(input), input);
  } finally { Intl.DateTimeFormat = NativeDateTimeFormat; }
});

test('malformed or impossible temporal metadata is rejected without rewriting it', () => {
  for (const change of [{ asOf: '2026-11-03T07:10:00Z' }, { asOf: '2026-11-03T07:10:00.000+00:00' },
    { asOf: '2026-02-30T07:10:00.000Z' }, { timeZone: 'not/a/timezone' },
    { localDate: '2026-02-30' }, { localDate: '2026-11-05' }]) {
    assert.equal(parseMetabloomSavedContent({ ...researchFor(false), ...change }), null);
  }
});

const maximumReport = character => {
  const report = reportFor();
  const room = MAX_METABLOOM_RESEARCH_REPORT_BYTES - bytes(report);
  const charBytes = Buffer.byteLength(character, 'utf8');
  report.notes += character.repeat(Math.floor(room / charBytes)) + 'x'.repeat(room % charBytes);
  assert.equal(bytes(report), MAX_METABLOOM_RESEARCH_REPORT_BYTES);
  return report;
};

for (const character of ['x', 'é', '😀']) test(`the full 1 MiB report limit counts UTF-8 bytes for ${character}`, () => {
  const input = { ...researchFor(), report: maximumReport(character) };
  const parsed = parseMetabloomSavedContent(input);
  assert.equal(parsed.report.notes, input.report.notes);
  assert.deepEqual(parsed.report.sources, input.report.sources);
  assert.ok(parsed.report.notes.length > 16000);
  input.report.notes += 'x';
  assert.equal(parseMetabloomSavedContent(input), null);
});

const maximumBrief = () => {
  const brief = briefFor();
  brief.items = Array.from({ length: 10 }, (_, index) => itemFor(index + 1));
  brief.sourceDetails = Array.from({ length: 10 }, (_, index) => sourceDetailFor(index + 1));
  brief.coverage = { requestedCount: 10, returnedCount: 10, status: 'complete', limitations: [] };
  const fields = [];
  for (const item of brief.items) {
    item.background = Array.from({ length: 5 }, () => ({ text: 'Context', sourceIds: [...item.sourceIds] }));
    item.uncertainty = Array(4).fill('Unknown'); item.watchNext = Array(4).fill('Watch');
    fields.push([item, 'summary', 1000], [item, 'whyItMatters', 1800],
      ...item.background.map(fact => [fact, 'text', 1200]),
      ...item.uncertainty.map((_, index) => [item.uncertainty, index, 600]),
      ...item.watchNext.map((_, index) => [item.watchNext, index, 600]));
  }
  let room = MAX_METABLOOM_RESEARCH_BRIEF_BYTES - bytes(brief);
  for (const [target, key, limit] of fields) {
    const added = Math.min(room, limit - target[key].length);
    target[key] += 'x'.repeat(added); room -= added;
  }
  assert.equal(room, 0);
  assert.equal(bytes(brief), MAX_METABLOOM_RESEARCH_BRIEF_BYTES);
  return { brief, fields };
};

test('maximum-size research and brief coexist within the dedicated durable-content budget', () => {
  const { brief, fields } = maximumBrief();
  const input = { ...researchFor(), question: 'q'.repeat(1600), report: maximumReport('x'), brief };
  assert.equal(MAX_METABLOOM_SAVED_CONTENT_BYTES,
    MAX_METABLOOM_RESEARCH_REPORT_BYTES + MAX_METABLOOM_RESEARCH_BRIEF_BYTES + 16 * 1024);
  assert.ok(bytes(input) <= MAX_METABLOOM_SAVED_CONTENT_BYTES);
  assert.deepEqual(parseMetabloomSavedContent(input), input);
  const [target, key] = fields.find(([value, field, limit]) => value[field].length < limit);
  target[key] += 'x';
  assert.equal(parseMetabloomSavedContent(input), null);
});

test('the outer byte cap also bounds ignored transient media input', () => {
  const input = researchFor();
  input.brief.media = [{ token: 'x'.repeat(MAX_METABLOOM_SAVED_CONTENT_BYTES) }];
  assert.ok(bytes(input) > MAX_METABLOOM_SAVED_CONTENT_BYTES);
  assert.equal(parseMetabloomSavedContent(input), null);
});

test('exact envelopes exclude ownership, transient handles, hidden context and unsupported versions', () => {
  assert.equal(METABLOOM_SAVED_CONTENT_VERSION, 1);
  for (const input of [null, [], 'serialized content', 1,
    { ...visualFor(), schemaVersion: 2 }, { ...researchFor(), schemaVersion: '1' },
    { ...visualFor(), kind: 'html' }, ...['owner', 'workspaceId', 'artifactVersion', 'expiresAt', 'researchId',
      'userId', 'replyId', 'requestRef', 'hiddenContext', 'controller', 'viewState'].map(key => ({ ...researchFor(), [key]: 'not-content' }))]) {
    assert.equal(parseMetabloomSavedContent(input), null);
  }
});

test('non-JSON fields cannot disappear during parser cloning or invoke custom serializers', () => {
  for (const hidden of [undefined, () => {}, Symbol('hidden')]) {
    const input = visualFor(); input.spec.hiddenContext = hidden;
    assert.equal(parseMetabloomSavedContent(input), null);
  }
  const toJSON = visualFor(); let serialized = false;
  toJSON.spec.toJSON = () => { serialized = true; return specFor(); };
  assert.equal(parseMetabloomSavedContent(toJSON), null);
  assert.equal(serialized, false);
  const accessor = visualFor(); let accessed = false;
  Object.defineProperty(accessor.spec, 'title', { enumerable: true, get: () => { accessed = true; return 'A title'; } });
  assert.equal(parseMetabloomSavedContent(accessor), null);
  assert.equal(accessed, false);
  const symbol = visualFor(); symbol.spec[Symbol('hidden')] = 'secret';
  assert.equal(parseMetabloomSavedContent(symbol), null);
  const nonenumerable = visualFor(); Object.defineProperty(nonenumerable.spec, 'hidden', { value: 'secret' });
  assert.equal(parseMetabloomSavedContent(nonenumerable), null);
});

test('cyclic, nonplain and sparse input fails safely while frozen ordinary JSON remains valid', () => {
  const cyclic = researchFor(); cyclic.report.loop = cyclic;
  assert.equal(parseMetabloomSavedContent(cyclic), null);
  const nonplain = visualFor(); nonplain.spec = new Date();
  assert.equal(parseMetabloomSavedContent(nonplain), null);
  const sparse = visualFor(); delete sparse.spec.rows[0];
  assert.equal(parseMetabloomSavedContent(sparse), null);
  const extraArrayProperty = visualFor(); extraArrayProperty.spec.rows.extra = 'hidden';
  assert.equal(parseMetabloomSavedContent(extraArrayProperty), null);
  const frozen = visualFor(); Object.freeze(frozen.spec); Object.freeze(frozen.sources); Object.freeze(frozen);
  assert.deepEqual(parseMetabloomSavedContent(frozen), frozen);
});
