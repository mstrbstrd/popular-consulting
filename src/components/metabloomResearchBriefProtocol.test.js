const { parseMetabloomResearchBrief, MAX_METABLOOM_RESEARCH_BRIEF_BYTES,
  MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS } = require('./metabloomResearchBriefProtocol');
const { createMetabloomSegmentStreamDecoder } = require('./metabloomEmoteProtocol');
const { createMetabloomReplySession } = require('./metabloomReplySession');

const sources = Array.from({ length: 9 }, (_, index) => ({ id: index + 1,
  title: `Fictional source ${index + 1}`, url: `https://example.test/story-${index + 1}` }));
const fixture = () => ({
  version: 'metabloom-research-brief-v1', kind: 'news', title: 'A fictional dated briefing', scope: 'Fictional world developments.',
  asOf: '2026-10-24T00:30:00.000Z', timeZone: 'America/Vancouver', localDate: '2026-10-23',
  windowStart: '2026-10-23', windowEnd: '2026-10-23',
  coverage: { requestedCount: 5, returnedCount: 2, status: 'partial', limitations: ['Only two developments have dated support.'] },
  items: [1, 9].map(id => ({ headline: `Fictional development ${id}`, summary: `The complete supported finding for source ${id}.`,
    sourceIds: [id], background: [{ text: 'The relevant supported background.', sourceIds: [id] }],
    whyItMatters: 'This is an interpretation of the supported finding.', uncertainty: ['Implementation remains uncertain.'],
    watchNext: ['Watch for evidence of implementation.'], developmentDate: '2026-10-23', scheduledDate: id === 1 ? '2026-10-29' : null,
    dateEvidence: { sourceId: id, quote: `The fictional announcement was made on October 23, 2026, according to source ${id}.` }, evidenceStatus: 'announced' })),
  sourceDetails: [1, 9].map(sourceId => ({ sourceId, publisher: 'Fictional publication', publishedDate: '2026-10-23',
    dateEvidence: 'The publication date is October 23, 2026.', sourceType: 'reporting' })),
});
const report = { notes: 'A completed fictional research report, with both early and later sources. [1][9]', sources };
const beforeBrief = () => [
  { type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'deep-research' },
  { type: 'research', state: 'searching' },
  { type: 'research_report_sources', sources: sources.slice(0, 8) }, { type: 'research_report_sources', sources: sources.slice(8) },
  { type: 'research_report_delta', index: 0, delta: report.notes }, { type: 'research_report_complete' },
  { type: 'sources', sources: sources.slice(0, 8) }, { type: 'research', state: 'synthesizing' },
];
const briefRecords = (brief = fixture()) => {
  const serialized = JSON.stringify(brief), records = [];
  for (let offset = 0, index = 0; offset < serialized.length; offset += MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS, index++) {
    records.push({ type: 'research_brief_delta', index, delta: serialized.slice(offset, offset + MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS) });
  }
  return [...records, { type: 'research_brief_complete' }];
};
const afterBrief = () => [
  { type: 'text_delta', index: 0, delta: 'The brief covers two of five requested stories.' },
  { type: 'segment', index: 0, response: 'The brief covers two of five requested stories.' }, { type: 'text_complete' },
  { type: 'emote', phase: 'response', emote: 'neutral' }, { type: 'done', version: '2.0.0' },
];
const wire = records => records.map(record => `${JSON.stringify(record)}\n`).join('');

test('accepts original source IDs above eight and copies every nested field without renumbering', () => {
  const value = fixture();
  const parsed = parseMetabloomResearchBrief(value, { sources: [sources[0], sources[8]] });
  expect(parsed).toEqual(value);
  value.items[1].summary = 'Mutated input';
  value.items[0].background[0].sourceIds[0] = 9;
  value.coverage.limitations.push('Mutated limitation');
  expect(parsed).toEqual(fixture());
  expect(parsed.items[1].sourceIds).toEqual([9]);
});

test('accepts optional host media without changing canonical source records or legacy brief fields', () => {
  const value = fixture();
  value.media = [{ sourceId: 9, token: 'signed.ninth.source' }];
  const parsed = parseMetabloomResearchBrief(value, { sources });
  expect(parsed).toEqual(value);
  value.media[0].token = 'mutated';
  expect(parsed.media).toEqual([{ sourceId: 9, token: 'signed.ninth.source' }]);
  expect(sources[8]).toEqual({ id: 9, title: 'Fictional source 9', url: 'https://example.test/story-9' });
});

test.each([
  null,
  { sourceId: 1, token: 'not-an-array' },
  [{ sourceId: 99, token: 'unrelated.source' }],
  [{ sourceId: 1, token: 'untrusted/token' }],
  [{ sourceId: 1, token: 'x'.repeat(4097) }],
  [{ sourceId: 1, token: 'signed.source', url: 'https://attacker.test/image' }],
  Array(11).fill({ sourceId: 1, token: 'signed.source' }),
])('drops invalid optional media while retaining a valid completed brief', media => {
  expect(parseMetabloomResearchBrief({ ...fixture(), media }, { sources })).toEqual(fixture());
});

test('media cannot consume the byte budget needed by the completed brief', () => {
  const canonicalSources = [...sources, { id: 10, title: 'Fictional source 10', url: 'https://example.test/story-10' }];
  const value = fixture();
  value.coverage = { requestedCount: 10, returnedCount: 10, status: 'complete', limitations: [] };
  value.items = canonicalSources.map(source => ({ ...value.items[0], headline: `Fictional development ${source.id}`,
    sourceIds: [source.id], summary: 's'.repeat(800), whyItMatters: 'w'.repeat(1600),
    background: Array.from({ length: 5 }, () => ({ text: 'b'.repeat(1000), sourceIds: [source.id] })),
    uncertainty: Array(4).fill('u'.repeat(100)), watchNext: Array(4).fill('n'.repeat(100)),
    dateEvidence: { sourceId: source.id, quote: 'Announced on October 23, 2026.' } }));
  value.sourceDetails = canonicalSources.map(source => ({ ...value.sourceDetails[0], sourceId: source.id }));
  const base = parseMetabloomResearchBrief(value, { sources: canonicalSources });
  expect(base).not.toBeNull();
  value.media = canonicalSources.map(source => ({ sourceId: source.id, token: `${source.id}.` + 'a'.repeat(4090) }));
  expect(parseMetabloomResearchBrief(value, { sources: canonicalSources })).toEqual(base);
});

test.each([
  ['unknown source', value => { value.items[0].sourceIds = [10]; }],
  ['duplicate source IDs', value => { value.items[0].sourceIds = [1, 1]; }],
  ['wrong date source', value => { value.items[0].dateEvidence.sourceId = 9; }],
  ['missing source metadata', value => { value.sourceDetails.pop(); }],
  ['unused source metadata', value => { value.sourceDetails.push({ ...value.sourceDetails[0], sourceId: 2 }); }],
  ['invented output field', value => { value.downloadUrl = 'https://example.test/file'; }],
  ['stale development', value => { value.items[0].developmentDate = '2008-06-13'; }],
  ['future development', value => { value.items[0].developmentDate = '2026-10-29'; }],
  ['future publication', value => { value.sourceDetails[0].publishedDate = '2099-01-01'; }],
  ['missing date support', value => { value.items[0].dateEvidence = null; }],
  ['invalid calendar date', value => { value.items[0].scheduledDate = '2026-02-30'; }],
  ['wrong local date', value => { value.localDate = '2026-10-24'; }],
  ['unknown timezone', value => { value.timeZone = 'Mars/Olympus'; }],
  ['claimed count mismatch', value => { value.coverage.returnedCount = 5; }],
  ['false full coverage', value => { value.coverage.status = 'complete'; }],
  ['unexplained partial coverage', value => { value.coverage.limitations = []; }],
  ['duplicate headline', value => { value.items[1].headline = `${value.items[0].headline.toUpperCase()}!`; }],
  ['empty required analysis', value => { value.items[0].whyItMatters = ''; }],
])('rejects %s before a brief can render', (_, change) => {
  const value = fixture(); change(value);
  expect(parseMetabloomResearchBrief(value, { sources })).toBeNull();
});

test('keeps a current announcement separate from its future scheduled milestone', () => {
  expect(parseMetabloomResearchBrief(fixture(), { sources }).items[0]).toMatchObject({
    developmentDate: '2026-10-23', scheduledDate: '2026-10-29', evidenceStatus: 'announced',
  });
});

test('allows readable whitespace but rejects hidden control and direction overrides', () => {
  const value = fixture(); value.items[0].summary = 'A supported finding.\n\tA second line.\r\nA third line.';
  expect(parseMetabloomResearchBrief(value, { sources })).toEqual(value);
  for (const code of [0, 8, 11, 12, 14, 31, 127, 159, 0x202a, 0x202e, 0x2066, 0x2069]) {
    value.items[0].summary = `A hidden${String.fromCharCode(code)}character.`;
    expect(parseMetabloomResearchBrief(value, { sources })).toBeNull();
  }
});

test('retains explicit historical coverage independently of the server as-of date', () => {
  const value = fixture(); value.windowStart = '2008-06-01'; value.windowEnd = '2008-06-30';
  value.items.forEach(item => { item.developmentDate = '2008-06-13'; });
  expect(parseMetabloomResearchBrief(value, { sources })).toEqual(value);
});

test('allows an honest zero-item brief without invented source evidence', () => {
  const value = fixture(); value.items = []; value.sourceDetails = [];
  value.coverage = { requestedCount: 5, returnedCount: 0, status: 'unavailable', limitations: ['No dated stories qualified.'] };
  expect(parseMetabloomResearchBrief(value, { sources })).toEqual(value);
});

test('enforces the byte budget even when each individual multilingual field fits', () => {
  const value = fixture(); value.kind = 'research'; value.windowStart = null; value.windowEnd = null;
  value.coverage = { requestedCount: 10, returnedCount: 10, status: 'complete', limitations: [] };
  value.sourceDetails = [value.sourceDetails[0]];
  value.items = Array.from({ length: 10 }, (_, index) => ({ ...value.items[0], headline: `Finding ${index}`,
    background: Array.from({ length: 5 }, () => ({ text: '界'.repeat(1200), sourceIds: [1] })) }));
  expect(JSON.stringify(value).length).toBeLessThan(MAX_METABLOOM_RESEARCH_BRIEF_BYTES);
  expect(Buffer.byteLength(JSON.stringify(value), 'utf8')).toBeGreaterThan(MAX_METABLOOM_RESEARCH_BRIEF_BYTES);
  expect(parseMetabloomResearchBrief(value, { sources })).toBeNull();
});

test('publishes a brief exactly once only after its bounded chunks complete', () => {
  const onResearchBrief = jest.fn(), onResearchDetails = jest.fn();
  const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: false, allowResearchDetails: true,
    allowResearchBrief: true, onResearchBrief, onResearchDetails });
  expect(decoder.push(wire(beforeBrief()))).toBe(true);
  const records = briefRecords();
  expect(decoder.push(wire(records.slice(0, -1)))).toBe(true);
  expect(onResearchBrief).not.toHaveBeenCalled();
  expect(onResearchDetails).toHaveBeenCalledWith(report);
  expect(decoder.push(wire(records.slice(-1)))).toBe(true);
  expect(onResearchBrief).toHaveBeenCalledTimes(1);
  expect(onResearchBrief).toHaveBeenCalledWith(fixture());
  onResearchBrief.mock.calls[0][0].items[0].summary = 'External mutation';
  expect(decoder.getState().researchBrief).toEqual(fixture());
  expect(decoder.push(wire(afterBrief()))).toBe(true);
  expect(decoder.finish().ok).toBe(true);
});

test.each([
  ['duplicate chunk', records => [records[0], records[0], ...records.slice(1)]],
  ['missing completion', records => records.slice(0, -1)],
  ['oversized chunk', () => [{ type: 'research_brief_delta', index: 0, delta: 'x'.repeat(MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS + 1) }]],
  ['invalid JSON', () => [{ type: 'research_brief_delta', index: 0, delta: '{' }, { type: 'research_brief_complete' }]],
])('retains the report but rejects a %s brief stream', (_, change) => {
  const onResearchBrief = jest.fn(), onResearchDetails = jest.fn();
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true, onResearchBrief, onResearchDetails });
  decoder.push(wire([...beforeBrief(), ...change(briefRecords()), ...afterBrief()]));
  expect(decoder.finish().ok).toBe(false);
  expect(onResearchBrief).not.toHaveBeenCalled();
  expect(onResearchDetails).toHaveBeenCalledWith(report);
});

test('rejects brief events that were not negotiated or arrived before the full report', () => {
  const old = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
  expect(old.push(wire([...beforeBrief(), ...briefRecords()]))).toBe(false);
  const early = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true });
  expect(early.push(wire([...beforeBrief().slice(0, 3), ...briefRecords()]))).toBe(false);
});

test('rejects a changed compact source map in both stream and adapter boundaries', () => {
  const different = sources.slice(0, 8).map(source => ({ ...source })); different[0].url = 'https://other.example.test/wrong-source';
  const records = beforeBrief(); records[7] = { type: 'sources', sources: different };
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true });
  expect(decoder.push(wire(records))).toBe(false);
  const session = createMetabloomReplySession({ onUpdate: jest.fn() });
  session.attachResearchDetails(report);
  expect(() => session.attachSources(different)).toThrow('Research source map changed.');
});

test('a valid brief attaches privately and cannot be changed by a late adapter', () => {
  const onUpdate = jest.fn(), session = createMetabloomReplySession({ onUpdate });
  session.attachResearchDetails(report); session.attachSources(sources.slice(0, 8));
  const value = fixture(); session.attachResearchBrief(value);
  expect(onUpdate).not.toHaveBeenCalled();
  value.items[0].summary = 'Input mutation';
  const snapshot = session.snapshot(); snapshot.researchBrief.items[1].sourceIds[0] = 1;
  expect(session.snapshot().researchBrief).toEqual(fixture());
  session.interrupt();
  expect(session.attachResearchBrief(fixture())).toBe(false);
});
