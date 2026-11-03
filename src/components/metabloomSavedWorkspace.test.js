import { TextEncoder } from 'util';
import { getMetabloomVisualSaveSource, prepareMetabloomSavedOpen } from './metabloomSavedWorkspace';
import { METABLOOM_VISUAL_KINDS } from './metabloomVisualProtocol';

const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });

const sources = [{ id: 9, title: 'Fictional evidence', url: 'https://example.org/evidence' }];
const visualSpec = (kind = 'calculator') => {
  const common = { version: '1', designVersion: 'aetheris-1', kind, title: 'Fictional project',
    summary: 'Recorded fictional values.', provenance: { type: 'sources', label: 'Fictional evidence.', sourceIds: [9] } };
  if (kind === 'calculator') return { ...common, unit: 'CAD',
    controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
      { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 1, initial: 65 }],
    formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' };
  if (kind === 'table') return { ...common, columns: ['Item', 'Value'], rows: [['One', '10'], ['Two', '20']] };
  if (kind === 'flowchart') return { ...common, nodes: [{ id: 'start', label: 'Start' }, { id: 'end', label: 'End' }],
    edges: [{ from: 'start', to: 'end', label: 'Continue' }] };
  return { ...common, unit: 'units', points: [{ label: 'One', value: 10 }, { label: 'Two', value: 20 }] };
};
const recordFor = (kind = 'calculator') => ({ id: 'd'.repeat(48), artifactVersion: 'e'.repeat(32),
  kind, status: 'ready', spec: visualSpec(kind), sources: sources.map(source => ({ ...source })),
  mode: 'tool', userId: 'user-1', replyId: 'assistant-2', expiresAt: 1 });
const artifact = kind => ({ artifactId: '11111111-1111-4111-8111-111111111111', title: 'Saved project', kind,
  version: 1, revision: 1, headRevision: 1, createdAt: '2026-11-03T12:00:00.000Z', updatedAt: '2026-11-03T12:00:00.000Z' });
const visualOpen = (kind = 'calculator', scenario) => ({ artifact: artifact('visual'),
  content: { schemaVersion: 1, kind: 'visual', spec: visualSpec(kind), sources,
    ...(scenario ? { scenario: { inputs: scenario } } : {}) },
  reference: { kind: 'visual', offer: { version: '1', designVersion: 'aetheris-1',
    id: 'a'.repeat(48), kind, expiresAt: 1793700000000 }, artifactVersion: 'b'.repeat(32) } });
const researchOpen = (withBrief = true) => {
  const date = { asOf: '2026-11-02T13:00:00.000Z', timeZone: 'UTC', localDate: '2026-11-02' };
  const report = { notes: 'The complete original evidence [1].\n\nThe second finding remains qualified [2].',
    sources: [1, 2].map(id => ({ id, title: 'Fictional source ' + id, url: 'https://example.org/evidence-' + id })) };
  const brief = { version: 'metabloom-research-brief-v1', kind: 'research', title: 'Original research',
    scope: 'Fictional scope', ...date, windowStart: null, windowEnd: null,
    coverage: { requestedCount: 2, returnedCount: 1, status: 'partial', limitations: ['Only one finding was established.'] },
    items: [{ headline: 'Qualified finding', summary: 'The finding is qualified.', sourceIds: [2],
      background: [{ text: 'Original background.', sourceIds: [2] }], whyItMatters: 'An open question.',
      uncertainty: ['The result remains uncertain.'], watchNext: ['Await the evaluation.'],
      developmentDate: null, scheduledDate: null, dateEvidence: null, evidenceStatus: 'reported' }],
    sourceDetails: [{ sourceId: 2, publisher: '', publishedDate: null, dateEvidence: '', sourceType: 'unknown' }] };
  return { artifact: artifact('research'), content: { schemaVersion: 1, kind: 'research',
    question: 'Research the fictional question.', ...date, report, ...(withBrief ? { brief } : {}) },
  reference: { kind: 'research', research: { researchId: 'f'.repeat(48), title: 'Original question', ...date,
    expiresAt: '2026-11-04T13:00:00.000Z', ...(withBrief ? { briefId: 'c'.repeat(32) } : {}) } } };
};

test('a completed visual remains saveable after its old offer deadline and returns only a locator', () => {
  const record = recordFor('table');
  record.viewState = { sort: { column: 1, direction: 'desc' }, filter: 'One' };
  record.slot = document.createElement('div');
  const source = getMetabloomVisualSaveSource(record);
  expect(source).toEqual({ title: 'Fictional project',
    source: { kind: 'visual', id: record.id, artifactVersion: record.artifactVersion } });
  expect(source).not.toHaveProperty('spec');
  expect(source).not.toHaveProperty('sources');
  expect(source).not.toHaveProperty('owner');
  expect(source).not.toHaveProperty('expiresAt');
});

test.each(METABLOOM_VISUAL_KINDS)('accepts the existing native %s format without changing its content', kind => {
  const record = recordFor(kind), before = JSON.stringify(record);
  const source = getMetabloomVisualSaveSource(record);
  expect(source.source.id).toBe(record.id);
  expect(JSON.stringify(record)).toBe(before);
  if (kind !== 'calculator') expect(source).not.toHaveProperty('scenario');
});

test('live calculator drafts win over stale cached numeric values and remain independent copies', () => {
  const record = recordFor();
  record.inputs = { hours: 10, rate: 65 };
  record.viewState = { inputs: { hours: '17', rate: '85.5' } };
  const source = getMetabloomVisualSaveSource(record);
  expect(source.scenario).toEqual({ inputs: { hours: 17, rate: 85.5 } });
  record.viewState.inputs.hours = '20';
  expect(source.scenario.inputs.hours).toBe(17);
  expect(source.scenario).not.toHaveProperty('result');
});

test.each(['', ' ', '-', '.', '1e', 'NaN', 'Infinity', '0x11', '1_000', '1,000', '17 CAD', ' 17 ', '81', '0'])(
  'invalid live draft %p cannot silently become an initial or cached value', draft => {
    const record = recordFor();
    record.inputs = { hours: 10, rate: 65 };
    record.viewState = { inputs: { hours: draft, rate: '85' } };
    expect(getMetabloomVisualSaveSource(record)).toBeNull();
  },
);

test('missing, extra, null and non-string live fields are rejected without filling defaults', () => {
  for (const viewState of [null, {}, { inputs: null }, { inputs: { hours: '17' } },
    { inputs: { hours: '17', rate: '85', invented: '1' } }, { inputs: { hours: 17, rate: '85' } }]) {
    expect(getMetabloomVisualSaveSource({ ...recordFor(), inputs: { hours: 10, rate: 65 }, viewState })).toBeNull();
  }
});

test('untouched calculators use their real initials and legacy numeric inputs are validated', () => {
  expect(getMetabloomVisualSaveSource(recordFor()).scenario).toEqual({ inputs: { hours: 10, rate: 65 } });
  expect(getMetabloomVisualSaveSource({ ...recordFor(), inputs: { hours: 17, rate: 85 } }).scenario)
    .toEqual({ inputs: { hours: 17, rate: 85 } });
  for (const inputs of [null, { hours: 17 }, { hours: 17, rate: NaN }, { hours: 17, rate: Infinity },
    { hours: '17', rate: 85 }, { hours: 17, rate: 201 }])
    expect(getMetabloomVisualSaveSource({ ...recordFor(), inputs })).toBeNull();
});

test('valid zero and decimal/exponent drafts are retained, while undefined formula results cannot be saved', () => {
  const record = recordFor();
  record.spec.controls[0].min = 0;
  record.viewState = { inputs: { hours: '0', rate: '8.5e1' } };
  expect(getMetabloomVisualSaveSource(record).scenario).toEqual({ inputs: { hours: 0, rate: 85 } });
  record.viewState.inputs.hours = '17.5';
  expect(getMetabloomVisualSaveSource(record).scenario.inputs.hours).toBe(17.5);
  record.spec.controls[1].min = 0;
  record.spec.formula = ['hours', 'rate', 'divide'];
  record.viewState.inputs.rate = '0';
  expect(getMetabloomVisualSaveSource(record)).toBeNull();
});

test('nonready records, invalid versions, malformed specs and missing evidence cannot produce Save input', () => {
  for (const change of [{ status: 'generating' }, { status: 'cancelled' }, { id: 'other' },
    { artifactVersion: 'old' }, { kind: 'table' }, { sources: [] },
    { spec: { ...visualSpec(), html: '<script>1</script>' } }])
    expect(getMetabloomVisualSaveSource({ ...recordFor(), ...change })).toBeNull();
  expect(getMetabloomVisualSaveSource(null)).toBeNull();
});

test('multiline native titles become a valid single-line saved title', () => {
  const record = recordFor('table');
  record.spec.title = 'Fictional\n project';
  expect(getMetabloomVisualSaveSource(record).title).toBe('Fictional project');
  expect(record.spec.title).toBe('Fictional\n project');
});

test('Open prepares a ready optional visual with saved numeric inputs converted to strings', () => {
  const result = visualOpen('calculator', { hours: 17, rate: 85.5 });
  const prepared = prepareMetabloomSavedOpen(result);
  expect(prepared.artifact).toEqual(result.artifact);
  expect(prepared.visualRecord).toEqual({
    id: result.reference.offer.id, kind: 'calculator', mode: 'optional', userId: null, replyId: null,
    expiresAt: result.reference.offer.expiresAt, status: 'ready', spec: result.content.spec,
    sources: result.content.sources, artifactVersion: result.reference.artifactVersion, restored: true,
    viewState: { inputs: { hours: '17', rate: '85.5' } },
  });
  expect(prepared.visualRecord).not.toHaveProperty('controller');
  expect(prepared.visualRecord).not.toHaveProperty('slot');
  expect(prepared.visualRecord.spec).not.toBe(result.content.spec);
  expect(prepared.content).toEqual(result.content);
  expect(prepared.reference).toEqual(result.reference);
});

test('Open uses calculator initials only when no scenario was saved and never drops a saved zero', () => {
  expect(prepareMetabloomSavedOpen(visualOpen()).visualRecord.viewState)
    .toEqual({ inputs: { hours: '10', rate: '65' } });
  const zero = visualOpen('calculator', { hours: 0, rate: 85 });
  zero.content.spec.controls[0].min = 0;
  expect(prepareMetabloomSavedOpen(zero).visualRecord.viewState.inputs.hours).toBe('0');
  expect(prepareMetabloomSavedOpen(visualOpen('calculator', { hours: '', rate: 85 }))).toBeNull();
});

test.each(METABLOOM_VISUAL_KINDS.filter(kind => kind !== 'calculator'))(
  'Open leaves %s defaults to the existing renderer and snapshot helper', kind => {
    const prepared = prepareMetabloomSavedOpen(visualOpen(kind));
    expect(prepared.visualRecord.status).toBe('ready');
    expect(prepared.visualRecord.kind).toBe(kind);
    expect(prepared.visualRecord).not.toHaveProperty('viewState');
  },
);

test.each([true, false])('Open retains complete research and original dates with brief=%s', withBrief => {
  const result = researchOpen(withBrief);
  const prepared = prepareMetabloomSavedOpen(result);
  expect(prepared.artifact).toEqual(result.artifact);
  expect(prepared).not.toHaveProperty('visualRecord');
  expect(prepared.researchMessage).toEqual({ researchDetails: result.content.report,
    ...(withBrief ? { researchBrief: result.content.brief } : {}),
    researchReference: result.reference.research, researchReused: true });
  expect(prepared.researchMessage.researchDetails).not.toBe(result.content.report);
  expect(prepared.researchMessage.researchReference.asOf).toBe('2026-11-02T13:00:00.000Z');
  expect(prepared.researchMessage).not.toHaveProperty('id');
  expect(prepared.researchMessage).not.toHaveProperty('content');
});

test('Open rejects extra ownership, mismatched references and unsupported content instead of manufacturing a record', () => {
  const opened = visualOpen();
  for (const result of [
    null, { ...opened, owner: 'another-account' },
    { ...opened, artifact: { ...opened.artifact, workspaceId: 'private' } },
    { ...opened, artifact: { ...opened.artifact, artifactId: 'invalid' } },
    { ...opened, content: { ...opened.content, schemaVersion: 2 } },
    { ...opened, reference: { ...opened.reference, artifactVersion: 'invalid' } },
    { ...opened, reference: { ...opened.reference, offer: { ...opened.reference.offer, kind: 'table' } } },
  ]) expect(prepareMetabloomSavedOpen(result)).toBeNull();
  const research = researchOpen();
  research.reference.research.localDate = '2026-11-03';
  expect(prepareMetabloomSavedOpen(research)).toBeNull();
});
