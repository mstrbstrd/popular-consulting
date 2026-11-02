import { TextEncoder } from 'util';
import {
  createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot,
  MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS, MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES,
} from './metabloomVisualSnapshot';

const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });

const provenance = { type: 'user', label: 'Supplied example values.', sourceIds: [] };
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Example estimates',
  summary: 'The supplied values.', provenance, columns: ['Item', 'Hours'], rows: [['Alpha', '10'], ['Beta', '20']] };
const calculator = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Share the total',
  summary: 'Calculate from your inputs.', provenance,
  controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 1, initial: 120 },
    { id: 'people', label: 'People', unit: '', min: 1, max: 20, step: 1, initial: 3 }],
  formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
const line = { ...table, kind: 'line-chart', columns: undefined, rows: undefined, unit: 'hours',
  points: [{ label: 'January', value: 10 }, { label: 'February', value: 20 }] };
delete line.columns; delete line.rows;
const pie = { ...line, kind: 'pie-chart' };
const flow = { version: '1', designVersion: 'aetheris-1', kind: 'flowchart', title: 'Review process',
  summary: 'An example process.', provenance, nodes: [{ id: 'draft', label: 'Draft' }, { id: 'review', label: 'Review' }],
  edges: [{ from: 'draft', to: 'review', label: 'Submit' }] };
const copy = value => JSON.parse(JSON.stringify(value));
const record = (index = 1, overrides = {}) => ({
  id: index.toString(16).padStart(48, '0'), kind: 'table', mode: 'optional', userId: null,
  replyId: `assistant-${index * 2}`, expiresAt: 1800000000000, status: 'ready', spec: copy(table), sources: [], ...overrides,
});
const owners = records => Array.from(new Map(records.flatMap(item => [item.userId, item.replyId]
  .filter(Boolean).map(id => [id, { id, role: id.startsWith('user-') ? 'user' : 'assistant',
    content: 'The original message.', status: 'complete' }]))).values());
const empty = () => ({ version: 1, records: [], lastInteractedId: null });
const stored = (index = 1, overrides = {}) => ({ ...record(index), viewState: { sort: { column: null, direction: 'asc' }, filter: '' }, ...overrides });

test('projects and clones validated data without serializing live request or DOM objects', () => {
  const source = { id: 9, title: 'Published example', url: 'https://example.org/evidence' };
  const live = record(1, { spec: { ...copy(table), provenance: { type: 'sources', label: 'Published example.', sourceIds: [9] } },
    sources: [source], slot: document.createElement('div'), controller: new AbortController(),
    detail: { respond: jest.fn() }, renderTimeout: 42 });
  live.controller.loop = live.controller;
  const snapshot = createMetabloomVisualSnapshot([live], owners([live]));
  expect(snapshot.records).toHaveLength(1);
  expect(Object.keys(snapshot.records[0]).sort()).toEqual([
    'id', 'kind', 'mode', 'userId', 'replyId', 'expiresAt', 'status', 'spec', 'sources', 'viewState',
  ].sort());
  expect(snapshot.records[0].sources).toEqual([source]);
  live.spec.rows[0][0] = 'Changed live value';
  source.url = 'https://changed.example/';
  expect(snapshot.records[0].spec.rows[0][0]).toBe('Alpha');
  expect(snapshot.records[0].sources[0].url).toBe('https://example.org/evidence');
  const restored = parseMetabloomVisualSnapshot(snapshot, owners([live]));
  snapshot.records[0].spec.rows[0][0] = 'Changed saved value';
  snapshot.records[0].sources[0].url = 'https://another.example/';
  expect(restored.records[0].spec.rows[0][0]).toBe('Alpha');
  expect(restored.records[0].sources[0].url).toBe('https://example.org/evidence');
});

test('unfinished and cancelled generations become stopped cards while failed records are omitted', () => {
  const records = [record(1, { status: 'generating' }), record(2, { status: 'cancelled' }), record(3, { status: 'failed' })];
  const snapshot = createMetabloomVisualSnapshot(records, owners(records), records[0].id);
  expect(snapshot.records.map(item => item.id)).toEqual(records.slice(0, 2).map(item => item.id));
  for (const item of snapshot.records) expect(item).toMatchObject({ status: 'cancelled', spec: null, sources: [], viewState: null });
  expect(snapshot.lastInteractedId).toBeNull();
});

test('uses the exact retained reply when known and only falls back to a user for an unbound explicit visual', () => {
  const records = [
    stored(1, { mode: 'tool', userId: 'user-1' }),
    stored(2, { mode: 'tool', userId: 'user-3' }),
    stored(3, { mode: 'tool', userId: 'user-5', replyId: null }),
    stored(4, { mode: 'optional', replyId: null, userId: 'user-7' }),
  ];
  const messages = owners(records).filter(message => !['user-1', 'assistant-4'].includes(message.id));
  expect(parseMetabloomVisualSnapshot({ version: 1, records, lastInteractedId: null }, messages).records.map(item => item.id))
    .toEqual([records[0].id, records[2].id]);
  const wrongRole = messages.map(message => message.id === 'assistant-2' ? { ...message, role: 'user' } : message);
  expect(parseMetabloomVisualSnapshot({ version: 1, records, lastInteractedId: null }, wrongRole).records.map(item => item.id))
    .toEqual([records[2].id]);
});

test('rejects a tool artifact attached to another user turn when its original user is retained', () => {
  const first = stored(1, { mode: 'tool', userId: 'user-1' });
  const second = stored(2, { mode: 'tool', userId: 'user-3' });
  const mismatched = { ...first, replyId: second.replyId };
  const result = parseMetabloomVisualSnapshot({ version: 1, records: [mismatched, second], lastInteractedId: null }, owners([first, second]));
  expect(result.records).toEqual([second]);
});

test('keeps the earliest valid duplicate and leaves unrelated valid records available', () => {
  const first = stored(), later = { ...stored(), spec: { ...copy(table), title: 'A duplicate must not replace the original' } };
  const neighbor = stored(2);
  const result = parseMetabloomVisualSnapshot({ version: 1, lastInteractedId: null,
    records: [{ ...first, spec: null }, first, later, neighbor] }, owners([first, neighbor]));
  expect(result.records.map(item => item.id)).toEqual([first.id, neighbor.id]);
  expect(result.records[0].spec.title).toBe(table.title);
});

test.each([
  ['missing snapshot', null], ['wrong version', { version: 2, records: [], lastInteractedId: null }],
  ['invalid records', { version: 1, records: {}, lastInteractedId: null }],
])('%s restores a fresh empty snapshot', (label, value) => {
  const result = parseMetabloomVisualSnapshot(value, []);
  expect(result).toEqual(empty());
  result.records.push({ id: 'changed' });
  expect(parseMetabloomVisualSnapshot(value, [])).toEqual(empty());
});

test.each([
  ['unsupported design', item => ({ ...item, spec: { ...item.spec, designVersion: 'unknown' } })],
  ['unknown source', item => ({ ...item, spec: { ...item.spec, provenance: { type: 'sources', label: 'Missing evidence.', sourceIds: [9] } } })],
  ['unsafe source', item => ({ ...item, sources: [{ id: 1, title: 'Unsafe', url: 'data:text/html,unsafe' }] })],
  ['kind mismatch', item => ({ ...item, kind: 'calculator' })],
  ['invalid sort', item => ({ ...item, viewState: { sort: { column: 7, direction: 'asc' }, filter: '' } })],
  ['unknown stored field', item => ({ ...item, controller: {} })],
])('%s is skipped without removing its valid neighbor', (label, change) => {
  const invalid = change(stored()), neighbor = stored(2);
  const result = parseMetabloomVisualSnapshot({ version: 1, records: [invalid, neighbor], lastInteractedId: null }, owners([invalid, neighbor]));
  expect(result.records).toEqual([neighbor]);
});

test.each([
  [table, { sort: { column: 1, direction: 'desc' }, filter: 'Alpha' }],
  [line, { active: 1, detailsOpen: true }],
  [{ ...line, kind: 'bar-chart' }, { detailsOpen: true }],
  [pie, { selectedIndex: 1, detailsOpen: true }],
  [flow, { selectedId: 'review', detailsOpen: true }],
  [calculator, { inputs: { total: '180', people: '4' } }],
].map(([spec, viewState]) => [spec.kind, spec, viewState]))('preserves the validated view state for a %s visual', (kind, spec, viewState) => {
  const live = record(1, { kind: spec.kind, spec, viewState });
  const snapshot = createMetabloomVisualSnapshot([live], owners([live]));
  expect(snapshot.records[0].viewState).toEqual(viewState);
  expect(parseMetabloomVisualSnapshot(snapshot, owners([live])).records[0].viewState).toEqual(viewState);
});

test.each(['', '99999', '1e309'])('preserves the bounded calculator draft %j without replacing it with a valid default', draft => {
  const live = record(1, { kind: 'calculator', spec: calculator, viewState: { inputs: { total: '120', people: draft } } });
  const snapshot = createMetabloomVisualSnapshot([live], owners([live]), live.id);
  expect(snapshot.records[0].viewState.inputs.people).toBe(draft);
  expect(parseMetabloomVisualSnapshot(snapshot, owners([live])).records[0].viewState.inputs.people).toBe(draft);
});

test.each([
  { total: '120', people: 'not a number' }, { total: '120', people: '3', extra: '2' },
  { total: '120', people: '1'.repeat(65) },
])('rejects malformed calculator draft fields', inputs => {
  const item = stored(1, { kind: 'calculator', spec: calculator, viewState: { inputs } });
  expect(parseMetabloomVisualSnapshot({ version: 1, records: [item], lastInteractedId: item.id }, owners([item]))).toEqual(empty());
});

test('keeps the chosen ready calculator and clears a selection that no longer exists', () => {
  const records = [1, 2].map(index => record(index, { kind: 'calculator', spec: calculator }));
  const snapshot = createMetabloomVisualSnapshot(records, owners(records), records[0].id);
  expect(snapshot.lastInteractedId).toBe(records[0].id);
  expect(snapshot.records[0].viewState).toEqual({ inputs: { total: '120', people: '3' } });
  expect(parseMetabloomVisualSnapshot(snapshot, owners([records[1]])).lastInteractedId).toBeNull();
});

test('keeps the newest records within the count cap and rejects an oversized stored record list', () => {
  const records = Array.from({ length: MAX_METABLOOM_VISUAL_SNAPSHOT_RECORDS + 1 }, (_, index) => stored(index + 1));
  const snapshot = createMetabloomVisualSnapshot(records, owners(records));
  expect(snapshot.records.map(item => item.id)).toEqual(records.slice(1).map(item => item.id));
  expect(parseMetabloomVisualSnapshot({ version: 1, records, lastInteractedId: null }, owners(records))).toEqual(empty());
});

test('bounds the complete UTF-8 snapshot and rejects stored data over the aggregate budget', () => {
  const large = { ...copy(table), rows: Array.from({ length: 100 }, (_, index) => [`${index} ${'é'.repeat(140)}`, 'é'.repeat(140)]) };
  const records = Array.from({ length: 6 }, (_, index) => stored(index + 1, { spec: large }));
  const snapshot = createMetabloomVisualSnapshot(records, owners(records));
  expect(snapshot.records.length).toBeGreaterThan(0);
  expect(snapshot.records.length).toBeLessThan(records.length);
  expect(snapshot.records.map(item => item.id)).toEqual(records.slice(-snapshot.records.length).map(item => item.id));
  expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeLessThanOrEqual(MAX_METABLOOM_VISUAL_SNAPSHOT_BYTES);
  expect(parseMetabloomVisualSnapshot({ version: 1, records, lastInteractedId: null }, owners(records))).toEqual(empty());
});

test('retains an expired completed artifact locally without extending its original expiry', () => {
  const item = stored(1, { expiresAt: 1 });
  const snapshot = createMetabloomVisualSnapshot([item], owners([item]));
  expect(snapshot.records[0].expiresAt).toBe(1);
  expect(parseMetabloomVisualSnapshot(snapshot, owners([item])).records[0]).toEqual(item);
});
