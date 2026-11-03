import { createMetabloomSegmentStreamDecoder } from './metabloomEmoteProtocol';
import { createMetabloomReplySession } from './metabloomReplySession';
import { requestMetabloomResponse } from './metabloomApiClient';
import { parseMetabloomResearchReference, parseMetabloomResearchReferenceMetadata,
  parseMetabloomResearchAttachment, parseMetabloomResearchAnswerSources, isMetabloomFreshResearchRequest } from './metabloomResearchReference';

const research = { researchId: 'a'.repeat(48), title: 'Original research', asOf: '2026-11-02T17:00:00.000Z',
  timeZone: 'America/Vancouver', localDate: '2026-11-02', expiresAt: '2026-11-02T18:00:00.000Z' };
const reference = { researchId: research.researchId, selector: { type: 'report' } };
const sources = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, title: `Original source ${index + 1}`, url: `https://example.com/${index + 1}` }));
const report = { notes: 'Earlier findings remain limited to the original evidence [9] [10].', sources };
const record = event => `${JSON.stringify(event)}\n`;
const input = record({ type: 'emote', phase: 'input', emote: 'curious' });
const action = choice => record({ type: 'action', action: choice });
const reuse = record({ type: 'research_reuse', research });
const reportRecords = (notes = report.notes) => record({ type: 'research_report_sources', sources: sources.slice(0, 8) })
  + record({ type: 'research_report_sources', sources: sources.slice(8) })
  + (notes.match(/[\s\S]{1,2048}/g) || []).map((delta, index) => record({ type: 'research_report_delta', index, delta })).join('')
  + record({ type: 'research_report_complete' });
const sourceIds = ids => record({ type: 'sources', sourceIds: ids });
const synthesis = record({ type: 'research', state: 'synthesizing' });
const reply = { version: '2.0.0', segments: [{ response: 'These earlier findings have unchanged limits [9] [10].' }] };
const completion = record({ type: 'segment', index: 0, ...reply.segments[0] }) + record({ type: 'text_complete' })
  + record({ type: 'emote', phase: 'response', emote: 'resolute' }) + record({ type: 'done', version: '2.0.0' });
const prefix = input + action('none') + reuse;
const stream = prefix + reportRecords() + sourceIds([9, 10]) + synthesis + completion;
const decoder = options => createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, allowResearchBrief: true, allowResearchReuse: true, ...options });

test('opaque research selectors are copied and cannot carry replacement evidence or dates', () => {
  expect(parseMetabloomResearchReference(reference)).toEqual(reference);
  expect(parseMetabloomResearchReference(reference)).not.toBe(reference);
  expect(parseMetabloomResearchReference({ ...reference, report })).toBeNull();
  expect(parseMetabloomResearchReference({ ...reference, asOf: research.asOf })).toBeNull();
  expect(parseMetabloomResearchReference({ ...reference, selector: { type: 'finding', briefId: 'b'.repeat(32), index: 9 } })).toBeTruthy();
  expect(parseMetabloomResearchReference({ ...reference, selector: { type: 'finding', briefId: 'b'.repeat(32), index: 10 } })).toBeNull();
  expect(parseMetabloomResearchReference({ ...reference, selector: { type: 'brief', briefId: 'b'.repeat(32) } })).toBeTruthy();
  expect(parseMetabloomResearchReference({ ...reference, researchId: 'A'.repeat(48) })).toBeNull();
});

test('reference dates and composer metadata are bounded and validated without changing the original time', () => {
  expect(parseMetabloomResearchReferenceMetadata(research)).toEqual(research);
  expect(parseMetabloomResearchReferenceMetadata({ ...research, localDate: '2026-11-04' })).toBeNull();
  expect(parseMetabloomResearchReferenceMetadata({ ...research, expiresAt: research.asOf })).toBeNull();
  expect(parseMetabloomResearchReferenceMetadata({ ...research, timeZone: 'Not/AZone' })).toBeNull();
  expect(parseMetabloomResearchReferenceMetadata({ ...research, title: 'x'.repeat(161) })).toBeNull();
  const attachment = { reference, label: research.title, asOf: research.asOf, timeZone: research.timeZone, localDate: research.localDate, expiresAt: research.expiresAt };
  expect(parseMetabloomResearchAttachment(attachment)).toEqual(attachment);
  expect(parseMetabloomResearchAttachment({ ...attachment, report })).toBeNull();
});

test.each(['Update this research with new sources', 'Please refresh the report', 'Search the web again', 'Research this again',
  'Run a fresh web search', 'Find the latest sources', 'Look up current news'])( 'explicit fresh instruction is recognized: %s', message => {
  expect(isMetabloomFreshResearchRequest(message)).toBe(true);
});
test.each(['Summarize this research', 'Update the table using these findings', 'Explain what the research means',
  'Do not search again', "Don't update the research", 'Without doing research again, explain it',
  'Turn this into a table', 'What did the latest research say?'])( 'reuse instruction stays on retained evidence: %s', message => {
  expect(isMetabloomFreshResearchRequest(message)).toBe(false);
});

test('sparse answer sources must retain exact IDs, titles and links from the full report', () => {
  expect(parseMetabloomResearchAnswerSources([sources[8], sources[9]], { report })).toEqual([sources[8], sources[9]]);
  expect(parseMetabloomResearchAnswerSources([sources[8], sources[8]], { report })).toBeNull();
  expect(parseMetabloomResearchAnswerSources([{ ...sources[8], url: 'https://different.example/' }], { report })).toBeNull();
  expect(parseMetabloomResearchAnswerSources([{ ...sources[8], id: 1 }], { report })).toBeNull();
  expect(parseMetabloomResearchAnswerSources([sources[8]], {})).toBeNull();
});

test('negotiated reuse streams original report and sparse citations without a searching state', () => {
  const onResearch = jest.fn(), onResearchReference = jest.fn(), onSources = jest.fn();
  const reader = decoder({ onResearch, onResearchReference, onSources });
  for (let offset = 0; offset < stream.length; offset += 13) expect(reader.push(stream.slice(offset, offset + 13))).toBe(true);
  expect(reader.finish()).toEqual({ ok: true, value: reply });
  expect(onResearch.mock.calls.map(([value]) => value.state)).toEqual(['reusing', 'synthesizing']);
  expect(onResearchReference).toHaveBeenCalledWith(research);
  expect(onSources).toHaveBeenCalledWith([sources[8], sources[9]]);
  expect(reader.getState()).toMatchObject({ researchReused: true, researchReference: research, researchDetails: report });
});

test('legacy or unnegotiated decoders reject the reuse event', () => {
  const reader = decoder({ allowResearchReuse: false });
  expect(reader.push(stream)).toBe(false);
  const noReport = decoder({ allowResearchDetails: false });
  expect(noReport.push(stream)).toBe(false);
});

test.each([
  input + action('deep-research') + reuse,
  prefix + record({ type: 'research', state: 'searching' }),
  prefix + reuse,
  prefix + sourceIds([9]),
  prefix + reportRecords() + sourceIds([9, 9]),
  prefix + reportRecords() + sourceIds([11]),
  prefix + reportRecords() + record({ type: 'sources', sources: [sources[0]] }),
  prefix + reportRecords() + sourceIds([9]) + completion,
])('invalid reuse order or source map fails closed (%#)', invalid => {
  const reader = decoder();
  expect(reader.push(invalid)).toBe(false);
});

test('a completed report retains its reuse handle when the formatter/writer fails', () => {
  const onResearchReference = jest.fn(), onResearchDetails = jest.fn();
  const reader = decoder({ onResearchReference, onResearchDetails });
  const searched = input + action('deep-research') + record({ type: 'research', state: 'searching' })
    + reportRecords() + record({ type: 'research_reference', research });
  expect(reader.push(searched)).toBe(true);
  expect(reader.push(record({ type: 'error', code: 'answer_invalid', requestRef: '123456abcdef' }))).toBe(false);
  expect(onResearchDetails).toHaveBeenCalledWith(report);
  expect(onResearchReference).toHaveBeenCalledWith(research);
  expect(reader.getState()).toMatchObject({ researchReference: research, researchDetails: report, failed: true });
});

test('fresh research cannot advertise a handle before the validated report or replace immutable metadata', () => {
  const early = decoder();
  expect(early.push(input + action('deep-research') + record({ type: 'research', state: 'searching' })
    + record({ type: 'research_reference', research }))).toBe(false);
  const duplicate = decoder();
  expect(duplicate.push(input + action('deep-research') + record({ type: 'research', state: 'searching' })
    + reportRecords() + record({ type: 'research_reference', research }))).toBe(true);
  expect(duplicate.push(record({ type: 'research_reference', research: { ...research, expiresAt: '2026-11-02T19:00:00.000Z' } }))).toBe(false);
});

test('reuse keeps the full report reader budget beyond the ordinary 320k stream cap', () => {
  const reader = decoder();
  const notes = 'Complete earlier report [9].\n'.repeat(20000);
  expect(reader.push(prefix + reportRecords(notes) + sourceIds([9, 10]) + synthesis + completion)).toBe(true);
  expect(reader.finish().ok).toBe(true);
  expect(reader.getState().researchDetails.notes).toBe(notes);
});

test('reply snapshots preserve report-only failures, source IDs, and independent reference metadata', () => {
  const onUpdate = jest.fn();
  const session = createMetabloomReplySession({ onUpdate });
  session.markResearchReused();
  session.attachResearchReference(research);
  session.attachResearchDetails(report);
  session.attachSources([sources[8], sources[9]]);
  expect(session.snapshot()).toMatchObject({ researchReused: true, researchReference: research, researchDetails: report,
    sources: [sources[8], sources[9]] });
  session.snapshot().researchReference.title = 'Changed';
  expect(session.snapshot().researchReference.title).toBe(research.title);
  expect(session.finishResearch()).toBe(true);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error', researchReference: research, researchDetails: report }));
});

const fetchStream = () => jest.fn().mockResolvedValue({ ok: true, status: 200,
  headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null }, text: async () => stream });
test('client opts into reuse, overrides Deep Research, and surfaces preserved metadata', async () => {
  const fetchImpl = fetchStream(), onResearchReference = jest.fn(), onResearch = jest.fn();
  await expect(requestMetabloomResponse({ fetchImpl, message: 'Explain these findings', actionMode: 'deep-research',
    researchContext: reference, onResearchReference, onResearch })).resolves.toEqual(reply);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ actionMode: 'none', researchContext: reference, streamResearchReuse: true });
  expect(onResearchReference).toHaveBeenCalledWith(research);
  expect(onResearch.mock.calls.map(([value]) => value.state)).toEqual(['reusing', 'synthesizing']);
});

test('client forwards a deliberate new search with the reference for server ownership validation', async () => {
  const fetchImpl = fetchStream();
  await requestMetabloomResponse({ fetchImpl, message: 'Update this research with new sources', researchContext: reference });
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ actionMode: 'deep-research', researchContext: reference });
});

test('invalid or mixed references cannot silently fall back to ordinary chat', async () => {
  const fetchImpl = fetchStream();
  await expect(requestMetabloomResponse({ fetchImpl, message: 'Explain', researchContext: { ...reference, report } }))
    .rejects.toMatchObject({ code: 'research_reference_invalid' });
  await expect(requestMetabloomResponse({ fetchImpl, message: 'Explain', researchContext: reference, artifactContext: {} }))
    .rejects.toMatchObject({ code: 'research_reference_invalid' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('a missing transport never turns an explicit research reference into an optional demo fallback', async () => {
  await expect(requestMetabloomResponse({ fetchImpl: null, optional: true, message: 'Explain', researchContext: reference }))
    .rejects.toMatchObject({ name: 'MetabloomApiError' });
});
