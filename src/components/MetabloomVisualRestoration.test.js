import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import MetabloomVisuals from './MetabloomVisuals';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';

const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const provenance = { type: 'user', label: 'Supplied example values.', sourceIds: [] };
const calculator = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Share the total',
  summary: 'Calculate from your inputs.', provenance,
  controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 1, initial: 120 },
    { id: 'people', label: 'People', unit: '', min: 1, max: 20, step: 1, initial: 3 }],
  formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Published example estimates',
  summary: 'The supplied project estimates.', provenance: { type: 'sources', label: 'Published example data.', sourceIds: [1] },
  columns: ['Project', 'Hours'], rows: Array.from({ length: 10 }, (_, index) => [
    `${index % 2 ? 'Beta' : 'Alpha'} ${index}`, String((index + 1) * 10),
  ]) };
const sources = [{ id: 1, title: 'Published estimates', url: 'https://example.org/estimates' }];
const line = { version: '1', designVersion: 'aetheris-1', kind: 'line-chart', title: 'Example monthly totals',
  summary: 'Three supplied observations.', provenance, unit: 'hours',
  points: [{ label: 'January', value: 10 }, { label: 'February', value: 20 }, { label: 'March', value: 30 }] };
const pie = { version: '1', designVersion: 'aetheris-1', kind: 'pie-chart', title: 'Example ingredient shares',
  summary: 'An illustrative ingredient breakdown.', provenance, unit: 'g',
  points: [{ label: 'Apples', value: 700 }, { label: 'Flour', value: 200 }, { label: 'Butter', value: 100 }] };
const flow = { version: '1', designVersion: 'aetheris-1', kind: 'flowchart', title: 'Example review process',
  summary: 'An example review process.', provenance,
  nodes: [{ id: 'draft', label: 'Draft' }, { id: 'review', label: 'Review' }],
  edges: [{ from: 'draft', to: 'review', label: 'Submit' }] };
const envelope = response => ({ version: '2.0.0', segments: [{ response }] });
const makeOffer = (id, kind) => ({ version: '1', designVersion: 'aetheris-1', id, kind, expiresAt: Date.now() + 600000 });
const makeStored = (spec, viewState, overrides = {}) => ({ id: 'a'.repeat(48), kind: spec.kind, mode: 'optional',
  userId: null, replyId: 'assistant-2', expiresAt: 1800000000000, status: 'ready', spec,
  sources: spec.kind === 'table' ? sources : [], viewState, ...overrides });
const savedConversation = () => ({ counter: 2, messages: [
  { id: 'user-1', role: 'user', content: 'Explain the example.', status: 'complete' },
  { id: 'assistant-2', role: 'assistant', content: 'The original answer remains available.', status: 'complete' },
] });
function Harness({ navigation }) {
  return <AppNavigationContext.Provider value={navigation}>
    <div className="orb-page"><OrbSection /><MetabloomVisuals navigation={navigation} /></div>
  </AppNavigationContext.Provider>;
}
function workspace(initial = {}) {
  const cache = new Map(Object.entries(initial));
  const navigation = { getToolState: key => cache.get(key), saveToolState: jest.fn((key, value) => cache.set(key, value)) };
  return { cache, navigation, mount: () => render(<Harness navigation={navigation} />) };
}
const send = message => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};
let ordinaryRequests;
let matchMedia;
let hiddenDescriptor;
let readyListener;
beforeEach(() => {
  requestMetabloomVisual.mockReset(); postMetabloomTool.mockReset();
  ordinaryRequests = [];
  window.__metabloomRequest = request => new Promise(finish => ordinaryRequests.push({ request, finish }));
  matchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  readyListener = jest.fn();
  window.addEventListener('metabloom:visual-ready', readyListener);
});
afterEach(() => {
  cleanup(); jest.restoreAllMocks();
  window.__metabloomRequest = null;
  window.matchMedia = matchMedia;
  window.removeEventListener('metabloom:visual-ready', readyListener);
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
  else delete document.hidden;
});

async function buildCalculator(spec = calculator, id = 'b'.repeat(48), { pendingExplanation = false } = {}) {
  const offer = makeOffer(id, 'calculator');
  const closing = `${spec.title} is ready.`;
  let finishExplanation;
  postMetabloomTool.mockResolvedValueOnce({ offer, emote: 'neutral' });
  if (pendingExplanation) postMetabloomTool.mockImplementationOnce(() => new Promise(resolve => { finishExplanation = resolve; }));
  else postMetabloomTool.mockResolvedValueOnce({ reply: envelope(closing), emote: 'neutral' });
  requestMetabloomVisual.mockResolvedValueOnce({ spec, sources: [] });
  send('Create an interactive calculator.');
  const region = await screen.findByRole('region', { name: spec.title });
  await waitFor(() => expect(postMetabloomTool.mock.calls.some(([body]) => body.phase === 'continue' && body.id === id)).toBe(true));
  if (!pendingExplanation) {
    await screen.findByText(closing);
    await waitFor(() => expect(region.closest('article')).toHaveAttribute('data-message-id'));
  }
  const continuation = postMetabloomTool.mock.calls.find(([body]) => body.phase === 'continue' && body.id === id);
  return { offer, region, closing, finishExplanation, continuationSignal: continuation[1].signal };
}

test('restores an optional completed table beside its exact answer with its sources, sort and filter', async () => {
  const state = workspace(); const view = state.mount();
  requestMetabloomVisual.mockResolvedValueOnce({ spec: table, sources });
  send('Explain the supplied estimates.');
  await waitFor(() => expect(ordinaryRequests).toHaveLength(1));
  const { request, finish } = ordinaryRequests[0];
  const offer = makeOffer('a'.repeat(48), 'table');
  const reply = envelope('The supplied estimates are ready to compare.');
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, {
    detail: { requestId: request.requestId, signal: request.signal, offer, reply },
  })));
  await act(async () => finish(reply));
  const region = await screen.findByRole('region', { name: table.title });
  const replyId = region.closest('article').dataset.messageId;
  fireEvent.change(within(region).getByRole('searchbox', { name: 'Filter rows' }), { target: { value: 'Alpha' } });
  fireEvent.click(within(region).getByRole('button', { name: /Hours/ }));
  fireEvent.click(within(region).getByRole('button', { name: /Hours/ }));
  view.unmount();
  expect(state.cache.get('orbVisuals').records[0]).toMatchObject({ id: offer.id, replyId, expiresAt: offer.expiresAt,
    viewState: { sort: { column: 1, direction: 'desc' }, filter: 'Alpha' } });
  readyListener.mockClear();
  state.mount();

  const restored = await screen.findByRole('region', { name: table.title });
  expect(restored.closest('article')).toHaveAttribute('data-message-id', replyId);
  expect(restored.closest('.metabloom-visual-slot').previousElementSibling).toHaveClass('metabloom-chat__bubble');
  expect(within(restored).getByRole('searchbox', { name: 'Filter rows' })).toHaveValue('Alpha');
  expect(within(restored).getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'descending');
  const rows = within(within(restored).getByRole('table')).getAllByRole('row').slice(1);
  expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Alpha 8', 'Alpha 6', 'Alpha 4', 'Alpha 2', 'Alpha 0']);
  const source = within(restored).getByRole('link', { name: 'Published estimates' });
  expect(source).toHaveAttribute('href', sources[0].url);
  expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByText(reply.segments[0].response)).toBeInTheDocument();
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(ordinaryRequests).toHaveLength(1);
  expect(readyListener).not.toHaveBeenCalled();
});

test('restores two calculator values and keeps the older calculator selected without replaying work', async () => {
  const state = workspace(); const view = state.mount();
  const firstSpec = { ...calculator, title: 'First shared total' };
  const secondSpec = { ...calculator, title: 'Second shared total' };
  const first = await buildCalculator(firstSpec, 'b'.repeat(48));
  const second = await buildCalculator(secondSpec, 'c'.repeat(48));
  fireEvent.change(within(second.region).getByLabelText('People'), { target: { value: '4' } });
  fireEvent.change(within(first.region).getByLabelText('People'), { target: { value: '6' } });
  expect(window.__metabloomVisualSnapshot()).toEqual({ id: first.offer.id, inputs: { total: 120, people: 6 } });
  view.unmount();
  readyListener.mockClear();
  state.mount();

  const restoredFirst = await screen.findByRole('region', { name: firstSpec.title });
  const restoredSecond = screen.getByRole('region', { name: secondSpec.title });
  expect(within(restoredFirst).getByLabelText('People')).toHaveValue(6);
  expect(within(restoredSecond).getByLabelText('People')).toHaveValue(4);
  expect(within(restoredFirst).getByText('20 CAD per person')).toBeInTheDocument();
  expect(within(restoredSecond).getByText('30 CAD per person')).toBeInTheDocument();
  expect(restoredFirst.closest('.metabloom-visual-slot').nextElementSibling).toHaveClass('metabloom-chat__bubble');
  expect(window.__metabloomVisualSnapshot()).toEqual({ id: first.offer.id, inputs: { total: 120, people: 6 } });
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(2);
  expect(postMetabloomTool).toHaveBeenCalledTimes(4);
  expect(ordinaryRequests).toHaveLength(0);
  expect(readyListener).not.toHaveBeenCalled();
});

test('StrictMode restores two calculators once and preserves the older selection across its cleanup cycle', async () => {
  const firstSpec = { ...calculator, title: 'Older saved calculator' };
  const secondSpec = { ...calculator, title: 'Newer saved calculator' };
  const first = makeStored(firstSpec, { inputs: { total: '120', people: '6' } },
    { id: 'b'.repeat(48), mode: 'tool', userId: 'user-1' });
  const second = makeStored(secondSpec, { inputs: { total: '120', people: '4' } },
    { id: 'c'.repeat(48), mode: 'tool', userId: 'user-3', replyId: 'assistant-4' });
  const conversation = savedConversation();
  conversation.counter = 4;
  conversation.messages.push(
    { id: 'user-3', role: 'user', content: 'Create another calculator.', status: 'complete' },
    { id: 'assistant-4', role: 'assistant', content: 'The second calculator is ready.', status: 'complete' },
  );
  const state = workspace({ orb: conversation,
    orbVisuals: { version: 1, records: [first, second], lastInteractedId: first.id } });
  const view = render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  const older = await screen.findByRole('region', { name: firstSpec.title });
  const newer = screen.getByRole('region', { name: secondSpec.title });
  expect(within(older).getByLabelText('People')).toHaveValue(6);
  expect(within(newer).getByLabelText('People')).toHaveValue(4);
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(2);
  expect(window.__metabloomVisualSnapshot()).toEqual({ id: first.id, inputs: { total: 120, people: 6 } });
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(ordinaryRequests).toHaveLength(0);
  expect(readyListener).not.toHaveBeenCalled();
  view.unmount();
  expect(state.cache.get('orbVisuals')).toMatchObject({ lastInteractedId: first.id, records: [first, second] });
});

test.each(['', '99'])('restores an invalid calculator draft %j as invalid instead of a valid default or follow-up context', async draft => {
  const state = workspace(); const view = state.mount();
  const result = await buildCalculator();
  fireEvent.change(within(result.region).getByLabelText('People'), { target: { value: draft } });
  expect(window.__metabloomVisualSnapshot()).toBeNull();
  view.unmount();
  expect(state.cache.get('orbVisuals').records[0].viewState.inputs.people).toBe(draft);
  state.mount();
  const restored = await screen.findByRole('region', { name: calculator.title });
  expect(within(restored).getByLabelText('People')).toHaveValue(draft === '' ? null : 99);
  expect(within(restored).getByText('Enter valid inputs to calculate.')).toBeInTheDocument();
  expect(window.__metabloomVisualSnapshot()).toBeNull();
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
});

test('retains a ready visual when navigation interrupts its closing explanation and rejects the late explanation', async () => {
  const state = workspace(); const view = state.mount();
  const result = await buildCalculator(calculator, 'd'.repeat(48), { pendingExplanation: true });
  expect(window.__orbState().pending).toBe(true);
  view.unmount();
  expect(result.continuationSignal.aborted).toBe(true);
  expect(state.cache.get('orbVisuals').records[0]).toMatchObject({ id: result.offer.id, status: 'ready', userId: 'user-1', replyId: null });
  readyListener.mockClear();
  state.mount();
  const restored = await screen.findByRole('region', { name: calculator.title });
  expect(restored.closest('article').previousElementSibling).toHaveAttribute('data-message-id', 'user-1');
  expect(window.__orbMessages().filter(message => message.role === 'assistant')).toEqual([]);
  await act(async () => result.finishExplanation({ reply: envelope('A late explanation must not enter the restored conversation.'), emote: 'resolute' }));
  expect(screen.queryByText('A late explanation must not enter the restored conversation.')).not.toBeInTheDocument();
  expect(window.__orbMessages().filter(message => message.role === 'assistant')).toEqual([]);
  expect(window.__orbState().pending).toBe(false);
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
  expect(readyListener).not.toHaveBeenCalled();
});

test('restores an interrupted generation as a stopped card and ignores its late result', async () => {
  const state = workspace(); const view = state.mount();
  const offer = makeOffer('e'.repeat(48), 'calculator');
  let finishGeneration;
  postMetabloomTool.mockResolvedValueOnce({ offer, emote: 'neutral' });
  requestMetabloomVisual.mockImplementationOnce(() => new Promise(resolve => { finishGeneration = resolve; }));
  send('Create an interactive calculator.');
  await screen.findByRole('button', { name: 'Stop visual' });
  const signal = requestMetabloomVisual.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(state.cache.get('orbVisuals').records[0]).toMatchObject({ id: offer.id, status: 'cancelled', spec: null, sources: [], viewState: null });
  state.mount();
  await screen.findByRole('heading', { name: 'Visual stopped' });
  expect(screen.queryByRole('button', { name: 'Stop visual' })).not.toBeInTheDocument();
  await act(async () => finishGeneration({ spec: calculator, sources: [] }));
  expect(screen.getAllByRole('heading', { name: 'Visual stopped' })).toHaveLength(1);
  expect(screen.queryByRole('heading', { name: calculator.title })).not.toBeInTheDocument();
  expect(window.__orbState().pending).toBe(false);
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledTimes(1);
});

test.each([
  ['line chart', line, { active: null, detailsOpen: false }],
  ['pie chart', pie, { selectedIndex: 0, detailsOpen: false }],
  ['flowchart', flow, { selectedId: null, detailsOpen: false }],
])('restores the inspected %s selection and open detail view', async (kind, spec, viewState) => {
  const item = makeStored(spec, viewState);
  const state = workspace({ orb: savedConversation(), orbVisuals: { version: 1, records: [item], lastInteractedId: null } });
  const view = state.mount();
  const region = await screen.findByRole('region', { name: spec.title });
  if (kind === 'line chart') fireEvent.keyDown(within(region).getByRole('group', { name: spec.title }), { key: 'End' });
  else if (kind === 'pie chart') fireEvent.click(within(region).getByRole('button', { name: 'Flour 20%' }));
  else fireEvent.click(within(region).getByRole('button', { name: /^Step 2: Review/ }));
  const detailLabel = kind === 'flowchart' ? 'View steps and connections' : 'View exact values';
  const summary = within(region).getByText(detailLabel, { selector: 'summary' });
  fireEvent.click(summary);
  fireEvent(summary.parentElement, new Event('toggle'));
  view.unmount();
  state.mount();

  const restored = await screen.findByRole('region', { name: spec.title });
  expect(within(restored).getByText(detailLabel, { selector: 'summary' }).parentElement).toHaveAttribute('open');
  if (kind === 'line chart') expect(within(restored).getByRole('status')).toHaveTextContent('March:');
  else if (kind === 'pie chart') expect(within(restored).getByRole('button', { name: 'Flour 20%' })).toHaveAttribute('aria-pressed', 'true');
  else expect(within(restored).getByRole('button', { name: /^Step 2: Review/ })).toHaveAttribute('aria-pressed', 'true');
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('expired validated results remain readable while unsafe and orphaned saved visuals are discarded without requests', async () => {
  const item = makeStored(table, { sort: { column: null, direction: 'asc' }, filter: '' }, { expiresAt: 1 });
  const unsafe = { ...item, id: 'f'.repeat(48), spec: { ...table, title: 'Unsafe saved visual' },
    sources: [{ id: 1, title: 'Unsafe source', url: 'data:text/html,unsafe' }] };
  const orphan = makeStored(calculator, { inputs: { total: '120', people: '3' } },
    { id: '9'.repeat(48), replyId: 'assistant-999' });
  const state = workspace({ orb: savedConversation(), orbVisuals: { version: 1, records: [item, unsafe, orphan], lastInteractedId: null } });
  const view = state.mount();
  await screen.findByRole('region', { name: table.title });
  expect(screen.queryByRole('heading', { name: 'Unsafe saved visual' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: calculator.title })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Published estimates' })).toHaveAttribute('href', sources[0].url);
  view.unmount();
  expect(state.cache.get('orbVisuals').records).toEqual([item]);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(ordinaryRequests).toHaveLength(0);
});

test('reset clears visuals and their cache while retaining the completed conversation', async () => {
  const state = workspace(); const view = state.mount();
  const result = await buildCalculator();
  const before = window.__orbMessages();
  act(() => window.__orbReset());
  await waitFor(() => expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument());
  expect(window.__orbMessages()).toEqual(before);
  expect(state.cache.get('orbVisuals')).toBeNull();
  view.unmount();
  state.mount();
  expect(screen.getByText(result.closing)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument();
  expect(window.__metabloomVisualSnapshot()).toBeNull();
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
});
