import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import { METABLOOM_ARTIFACT_REFERENCE_EVENT } from './metabloomArtifactReference';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const now = Date.parse('2026-11-02T10:00:00.000Z');
const metadataFor = () => ({ researchId: 'a'.repeat(48), title: 'Fictional orchard assessment',
  asOf: '2026-11-02T09:45:00.000Z', timeZone: 'America/Toronto', localDate: '2026-11-02',
  expiresAt: '2026-11-02T10:45:00.000Z' });
const reportFor = () => ({ notes: 'The first fictional finding is qualified [9]. The second remains uncertain [12].',
  sources: Array.from({ length: 12 }, (_, index) => ({ id: index + 1,
    title: `Fictional source ${index + 1}`, url: `https://example.org/research-${index + 1}` })) });
const briefFor = () => ({ version: 'metabloom-research-brief-v1', kind: 'research',
  title: metadataFor().title, scope: 'The recorded fictional orchard evidence.',
  asOf: metadataFor().asOf, timeZone: metadataFor().timeZone, localDate: metadataFor().localDate,
  windowStart: null, windowEnd: null,
  coverage: { requestedCount: 3, returnedCount: 2, status: 'partial', limitations: ['Two findings have recorded evidence.'] },
  items: [9, 12].map(id => ({ headline: `Fictional finding from source ${id}`,
    summary: `The original evidence for finding ${id} remains qualified.`, sourceIds: [id], background: [],
    whyItMatters: 'This recorded finding supports a comparison.', uncertainty: ['A future outcome is unknown.'],
    watchNext: [], developmentDate: null, scheduledDate: null, dateEvidence: null, evidenceStatus: 'reported' })),
  sourceDetails: [9, 12].map(sourceId => ({ sourceId, publisher: '', publishedDate: null,
    dateEvidence: '', sourceType: 'unknown' })),
});
const messageFor = ({ status = 'complete', brief = true, metadata = metadataFor(), reused = false } = {}) => ({
  id: 'assistant-1', role: 'assistant', status, source: 'model',
  content: status === 'complete' ? 'The original research has two supported findings [1].' : '',
  segments: [], sources: [reportFor().sources[0]], researchDetails: reportFor(),
  ...(brief ? { researchBrief: briefFor() } : {}),
  ...(metadata ? { researchReference: { ...metadata, ...(brief ? { briefId: 'b'.repeat(32) } : {}) } } : {}),
  ...(reused ? { researchReused: true } : {}),
});
const attachmentFor = () => ({ reference: { researchId: metadataFor().researchId, selector: { type: 'report' } },
  label: metadataFor().title, asOf: metadataFor().asOf, timeZone: metadataFor().timeZone,
  localDate: metadataFor().localDate, expiresAt: metadataFor().expiresAt });
const artifactFor = () => ({ reference: { id: 'c'.repeat(48), version: 'd'.repeat(32),
  selector: { type: 'calculator' }, inputs: { hours: 10, rate: 65 } }, label: 'Project price · Scenario' });
const workspace = (initial = { messages: [messageFor()], counter: 1 }) => {
  const cache = new Map([['orb', initial]]);
  const navigation = { getToolState: key => cache.get(key), saveToolState: (key, value) => cache.set(key, value) };
  const mount = (isActive = true) => render(<AppNavigationContext.Provider value={navigation}>
    <div className="orb-page"><OrbSection isActive={isActive} /></div>
  </AppNavigationContext.Provider>);
  return { cache, mount };
};
const tick = async (ms = 0) => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const send = async (message = 'Compare these findings.') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
  await tick();
};
const stageArtifact = view => act(() => window.dispatchEvent(new CustomEvent(METABLOOM_ARTIFACT_REFERENCE_EVENT,
  { detail: { ...artifactFor(), root: view.container.querySelector('.orb-page') } })));
let requests, originalMatchMedia, hiddenDescriptor, originalFetch;
const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(now); requests = [];
  originalFetch = globalThis.fetch;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  window.__metabloomRequest = request => new Promise((finish, reject) => requests.push({ request, finish, reject }));
});
afterEach(() => {
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
  delete window.__metabloomRequest;
  globalThis.fetch = originalFetch;
  window.matchMedia = originalMatchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
  else delete document.hidden;
});

test('staging dated research preserves and focuses the draft without starting a request', () => {
  workspace({ messages: [messageFor()], draft: 'Compare the qualifications.', deepResearch: true }).mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  const reference = screen.getByRole('group', { name: 'Selected research reference' });
  expect(reference).toHaveTextContent('Use saved research');
  expect(reference).toHaveTextContent(metadataFor().title);
  expect(reference).toHaveTextContent('Research date Nov 2, 2026 · America/Toronto');
  expect(reference).toHaveTextContent('As of Nov 2, 2026, 09:45 UTC');
  expect(reference).toHaveTextContent('Reuse expires Nov 2, 2026, 10:45 UTC');
  expect(screen.getByRole('textbox')).toHaveValue('Compare the qualifications.');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('textbox')).toHaveAccessibleDescription(expect.stringContaining(metadataFor().title));
  expect(screen.getByRole('checkbox', { name: 'Deep Research' })).toBeChecked();
  expect(requests).toHaveLength(0);
});

test('a browser with older Vancouver timezone rules preserves the server research day and exact UTC instants', () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locale, options) => {
    if (options?.timeZone !== 'America/Vancouver') return new NativeDateTimeFormat(locale, options);
    // Older browser data applies UTC-8 here; the server's newer database has
    // already established UTC-7 and the next calendar day for this instant.
    const formatter = new NativeDateTimeFormat(locale, { ...options, timeZone: 'Etc/GMT+8' });
    const resolvedOptions = formatter.resolvedOptions.bind(formatter);
    formatter.resolvedOptions = () => ({ ...resolvedOptions(), timeZone: 'America/Vancouver' });
    return formatter;
  });
  const metadata = { ...metadataFor(), asOf: '2026-11-02T07:30:00.000Z', timeZone: 'America/Vancouver',
    localDate: '2026-11-02', expiresAt: '2026-11-02T08:30:00.000Z' };
  jest.setSystemTime(Date.parse('2026-11-02T07:45:00.000Z'));
  const browserDay = new Intl.DateTimeFormat('en-US', { timeZone: metadata.timeZone, day: '2-digit' })
    .formatToParts(new Date(metadata.asOf)).find(part => part.type === 'day').value;
  expect(browserDay).toBe('01');
  const message = { ...messageFor({ metadata }), researchBrief: { ...briefFor(),
    asOf: metadata.asOf, timeZone: metadata.timeZone, localDate: metadata.localDate } };
  const state = workspace({ messages: [message] }), view = state.mount();
  const report = screen.getByRole('group', { name: 'Research reuse' });
  expect(report).toHaveTextContent('Research date Nov 2, 2026 · America/Vancouver');
  expect(report).toHaveTextContent('As of Nov 2, 2026, 07:30 UTC');
  expect(report).toHaveTextContent('Reuse expires Nov 2, 2026, 08:30 UTC');
  expect(report.querySelector('time[datetime="2026-11-02"]')).toHaveTextContent('Nov 2, 2026');
  expect(report.querySelector(`time[datetime="${metadata.asOf}"]`)).toHaveTextContent('07:30');
  const brief = screen.getByRole('region', { name: metadata.title });
  expect(brief.querySelector('header time')).toHaveAttribute('datetime', metadata.localDate);
  fireEvent.click(within(brief).getByText('Briefing details', { selector: 'summary' }));
  expect(within(brief).getByText('As of').parentElement).toHaveTextContent('Nov 2, 2026, 07:30 UTC');
  expect(within(brief).getByText('Timezone').parentElement).toHaveTextContent('America/Vancouver');
  fireEvent.click(screen.getByRole('button', { name: 'Use this brief' }));
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Research date Nov 2, 2026 · America/Vancouver');
  view.unmount();
  expect(state.cache.get('orb').researchAttachment.localDate).toBe(metadata.localDate);
  state.mount();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('As of Nov 2, 2026, 07:30 UTC');
  expect(window.__orbMessages()[0].researchBrief.localDate).toBe(metadata.localDate);
  expect(requests).toHaveLength(0);
});

test('a one-shot research locator overrides the persisted Deep Research toggle without sending evidence text', async () => {
  workspace({ messages: [messageFor()], deepResearch: true }).mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send();
  expect(requests).toHaveLength(1);
  expect(requests[0].request.researchContext).toEqual(attachmentFor().reference);
  expect(requests[0].request.actionMode).toBe('none');
  expect(requests[0].request).not.toHaveProperty('artifactContext');
  expect(JSON.stringify(requests[0].request.history)).not.toContain(reportFor().notes);
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  await send('An independent question.');
  expect(requests).toHaveLength(2);
  expect(requests[1].request).not.toHaveProperty('researchContext');
});

test.each(['Refresh this research offline.', 'Update this research without browsing.'])('source-limited wording keeps the client in reuse mode: %s', async message => {
  workspace({ messages: [messageFor()], deepResearch: true }).mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Use saved research');
  await send(message);
  expect(requests[0].request.actionMode).toBe('none');
  expect(requests[0].request.researchContext).toEqual(attachmentFor().reference);
});

test('only an explicit finding action selects its original brief index, even beyond source eight', async () => {
  workspace().mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '1' } });
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Use this finding' }));
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent(briefFor().items[1].headline);
  await send('Explain this finding.');
  expect(requests[0].request.researchContext).toEqual({ researchId: metadataFor().researchId,
    selector: { type: 'finding', briefId: 'b'.repeat(32), index: 1 } });
});

test('using the brief submits its exact saved brief selector separately from the full report', async () => {
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this brief' }));
  expect(requests).toHaveLength(0);
  await send('Summarize this briefing.');
  expect(requests[0].request.researchContext).toEqual({ researchId: metadataFor().researchId,
    selector: { type: 'brief', briefId: 'b'.repeat(32) } });
});

test('restored research and visual references remain mutually exclusive in either staging order', () => {
  const view = workspace({ messages: [messageFor()], researchAttachment: attachmentFor(), artifactAttachment: artifactFor() }).mount();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  stageArtifact(view);
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test('SPA navigation restores a cloned research attachment and removal omits it from the next request', async () => {
  const state = workspace(), view = state.mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Read these qualifications.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  view.unmount();
  expect(state.cache.get('orb').researchAttachment).toEqual(attachmentFor());
  state.mount();
  state.cache.get('orb').researchAttachment.reference.researchId = 'f'.repeat(48);
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveAttribute('data-research-reference', metadataFor().researchId);
  expect(screen.getByRole('textbox')).toHaveValue('Read these qualifications.');
  expect(requests).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Remove research reference' }));
  expect(screen.getByRole('textbox')).toHaveFocus();
  await send();
  expect(requests[0].request).not.toHaveProperty('researchContext');
});

test('Search again stages a fresh search and explicit update wording announces the same mode', async () => {
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Update this research.' } });
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Search for updates');
  expect(requests).toHaveLength(0);
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' })); await tick();
  expect(requests[0].request.actionMode).toBe('deep-research');
  expect(requests[0].request.researchContext).toEqual(attachmentFor().reference);
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Investigate the orchard.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search again' }));
  expect(screen.getByRole('textbox')).toHaveValue('Investigate the orchard.');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('checkbox', { name: 'Deep Research' })).toBeChecked();
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' })); await tick();
  expect(requests[1].request.actionMode).toBe('deep-research');
  expect(requests[1].request).not.toHaveProperty('researchContext');
});

test('a completed persisted report remains reusable when the brief and writer fail', async () => {
  workspace({ messages: [messageFor({ status: 'error', brief: false })] }).mount();
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent(reportFor().notes);
  expect(screen.queryByRole('button', { name: 'Use this finding' })).not.toBeInTheDocument();
  expect(screen.getByText('Research completed. The short answer could not be prepared.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send('Explain the saved evidence.');
  expect(requests[0].request.researchContext).toEqual(attachmentFor().reference);
  expect(requests[0].request.history).toEqual([]);
});

test('expiry disables reuse while preserving research and a staged expired reference cannot send', async () => {
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await tick(Date.parse(metadataFor().expiresAt) - now + 1);
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Use this finding' })).toBeDisabled();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Research reference expired');
  await send('Update this research.');
  expect(screen.getByRole('alert')).toHaveTextContent('This research reference has expired.');
  expect(screen.getByRole('textbox')).toHaveValue('Update this research.');
  expect(requests).toHaveLength(0);
  expect(window.__orbMessages()[0].researchDetails).toEqual(reportFor());
  fireEvent.click(screen.getByRole('button', { name: 'Search again' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' })); await tick();
  expect(requests).toHaveLength(1);
  expect(requests[0].request).not.toHaveProperty('researchContext');
});

test.each([null, { ...metadataFor(), expiresAt: 'invalid' }])('unavailable reuse metadata leaves the completed report readable', metadata => {
  workspace({ messages: [messageFor({ status: 'error', brief: false, metadata })] }).mount();
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent(reportFor().notes);
  expect(screen.queryByRole('button', { name: 'Use this research' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test('server expiry restores the failed reference for explicit recovery and blocks repeated reuse', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const state = workspace(), view = state.mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send('Explain the original findings.');
  await act(async () => requests[0].reject({ code: 'research_reference_unavailable', status: 410 }));
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Research reference unavailable');
  expect(screen.getByRole('textbox')).toHaveValue('Explain the original findings.');
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Search again' })).toBeEnabled();
  await send();
  expect(requests).toHaveLength(1);
  view.unmount(); state.mount();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Research reference unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Search again' }));
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' })); await tick();
  expect(requests).toHaveLength(2);
  expect(requests[1].request).not.toHaveProperty('researchContext');
  expect(requests[1].request.actionMode).toBe('deep-research');
});

test('a temporary storage failure allows an explicit retry without marking the report unavailable', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send();
  await act(async () => requests[0].reject({ code: 'research_reference_unavailable', status: 503 }));
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeEnabled();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Use saved research');
  expect(requests).toHaveLength(1);
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' })); await tick();
  expect(requests).toHaveLength(2);
  expect(requests[1].request.researchContext).toEqual(attachmentFor().reference);
});

test('failed-reference recovery never overwrites a newer draft or selected visual', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const view = workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send('The older research question.');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The newer visual question.' } });
  stageArtifact(view);
  await act(async () => requests[0].reject({ code: 'research_reference_unavailable', status: 410 }));
  expect(screen.getByRole('textbox')).toHaveValue('The newer visual question.');
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent(artifactFor().label);
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});

test.each(['no transport', 'empty adapter result'])('%s cannot replace explicitly selected research with a preview response', async mode => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const adapter = jest.fn(() => Promise.resolve(null));
  if (mode === 'no transport') {
    delete window.__metabloomRequest;
    globalThis.fetch = undefined;
  } else window.__metabloomRequest = adapter;
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send('Explain the recorded finding.');
  await tick(1500);
  expect(screen.getByRole('alert')).toHaveTextContent(mode === 'no transport' ? 'Code: network_error' : 'Code: not_configured');
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Use saved research');
  expect(screen.getByRole('textbox')).toHaveValue('Explain the recorded finding.');
  expect(screen.getByRole('button', { name: 'Search again' })).toBeEnabled();
  expect(screen.getAllByRole('article', { name: 'Metabloom message' })).toHaveLength(1);
  expect(screen.queryByText('Preview response')).not.toBeInTheDocument();
  expect(window.__orbState().pending).toBe(false);
  expect(adapter).toHaveBeenCalledTimes(mode === 'no transport' ? 0 : 1);
  expect(requests).toHaveLength(0);
});

test('reset clears the draft attachment and inactive surfaces cannot stage research', () => {
  const state = workspace(), view = state.mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  act(() => window.__orbReset());
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  view.unmount();
  expect(state.cache.get('orb').researchAttachment).toBeNull();
  state.mount(false);
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test('an expired account cache cannot transfer a research reference to the next account', () => {
  const cache = new Map(); let revision = 1;
  const owner = revision;
  const navigation = { getToolState: () => ({ messages: [messageFor()] }),
    saveToolState: (key, value) => { if (owner === revision) cache.set(key, value); } };
  const view = render(<AppNavigationContext.Provider value={navigation}><OrbSection /></AppNavigationContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  revision++; view.unmount();
  expect(cache.has('orb')).toBe(false);
  workspace({ messages: [] }).mount();
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use this research' })).not.toBeInTheDocument();
});

test('a reused reply keeps sparse citation IDs, original dates and coverage without a research scene', async () => {
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send();
  const { request, finish } = requests[0];
  const report = reportFor(), metadata = { ...metadataFor(), briefId: 'b'.repeat(32) };
  act(() => {
    expect(request.onAction('none')).toBe(true);
    expect(request.onResearch({ state: 'reusing' })).toBe(true);
    expect(request.onResearchReference(metadata)).toBe(true);
    expect(request.onResearchDetails(report)).toBe(true);
    expect(request.onSources([report.sources[8], report.sources[11]])).toBe(true);
    expect(request.onResearch({ state: 'synthesizing' })).toBe(true);
    expect(request.onResearchBrief(briefFor())).toBe(true);
  });
  await act(async () => finish({ version: '2.0.0', segments: [{ response: 'The comparison retains the qualifications [9] and [12].' }] }));
  await tick();
  const replies = screen.getAllByRole('article', { name: 'Metabloom message' });
  const reused = within(replies[replies.length - 1]);
  const answer = reused.getByText('The comparison retains the qualifications', { exact: false });
  expect(within(answer).getByRole('link', { name: 'Source 9: Fictional source 9' })).toHaveAttribute('href', report.sources[8].url);
  expect(within(answer).getByRole('link', { name: 'Source 12: Fictional source 12' })).toHaveAttribute('href', report.sources[11].url);
  expect(reused.getByRole('group', { name: 'Research reuse' })).toHaveTextContent('Reused sources');
  expect(reused.getByRole('group', { name: 'Research reuse' })).toHaveTextContent('Research date Nov 2, 2026 · America/Toronto');
  expect(reused.getByRole('group', { name: 'Research reuse' })).toHaveTextContent('As of Nov 2, 2026, 09:45 UTC');
  expect(reused.getByText('Two findings have recorded evidence.')).toBeInTheDocument();
  expect(screen.queryByText('Searching sources', { exact: true })).not.toBeInTheDocument();
  const saved = window.__orbMessages().at(-1);
  expect(saved.researchReused).toBe(true);
  expect(saved.researchReference).toEqual(metadata);
  expect(saved.sources.map(source => source.id)).toEqual([9, 12]);
  metadata.title = 'An outside mutation';
  expect(window.__orbMessages().at(-1).researchReference.title).toBe(metadataFor().title);
});

test('reuse has its own writer budget and rejects fresh-search states without starting a research scene', async () => {
  workspace().mount();
  fireEvent.click(screen.getByRole('button', { name: 'Use this research' }));
  await send();
  const { request, finish } = requests[0], report = reportFor();
  act(() => {
    expect(request.onAction('none')).toBe(true);
    expect(request.onResearch({ state: 'reusing' })).toBe(true);
    expect(request.onResearch({ state: 'searching' })).toBe(false);
  });
  await tick(31000);
  expect(request.signal.aborted).toBe(false);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Searching sources', { exact: true })).not.toBeInTheDocument();
  act(() => {
    expect(request.onResearchReference(metadataFor())).toBe(true);
    expect(request.onResearchDetails(report)).toBe(true);
    expect(request.onSources([report.sources[8]])).toBe(true);
    expect(request.onResearch({ state: 'synthesizing' })).toBe(true);
    expect(request.onResearch({ state: 'reusing' })).toBe(false);
  });
  await act(async () => finish({ version: '2.0.0', segments: [{ response: 'The saved finding remains qualified [9].' }] }));
  await tick();
  expect(screen.getByText('The saved finding remains qualified', { exact: false })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});

test('new research exposes its saved reference after completion and safely adds brief selection', async () => {
  workspace({ messages: [] }).mount();
  await send('Investigate the orchard.');
  const { request, finish } = requests[0], report = reportFor();
  act(() => {
    expect(request.onResearchReference(metadataFor())).toBe(false);
    expect(request.onAction('deep-research')).toBe(true);
    expect(request.onResearch({ state: 'searching' })).toBe(true);
    expect(request.onResearchDetails(report)).toBe(true);
    expect(request.onResearchReference(metadataFor())).toBe(true);
    expect(request.onSources([report.sources[0]])).toBe(true);
    expect(request.onResearch({ state: 'synthesizing' })).toBe(true);
    expect(request.onResearchBrief(briefFor())).toBe(true);
    expect(request.onResearchReference({ ...metadataFor(), briefId: 'b'.repeat(32) })).toBe(true);
  });
  expect(screen.queryByRole('button', { name: 'Use this research' })).not.toBeInTheDocument();
  await act(async () => finish({ version: '2.0.0', segments: [{ response: 'Two recorded findings are available.' }] }));
  await tick(750);
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Use this finding' })).toBeEnabled();
  act(() => expect(request.onResearchReference(metadataFor())).toBe(false));
  expect(requests).toHaveLength(1);
});
