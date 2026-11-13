import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import MetabloomVisuals from './MetabloomVisuals';
import MetabloomWorkspaceContext from './MetabloomWorkspaceContext';
import { requestMetabloomVisual } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';
import { requestMetabloomSavedWork } from './metabloomSavedWorkApiClient';

jest.mock('./MetabloomModelPicker', () => require('../testHelpers/MetabloomModelPickerStub'));
jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
jest.mock('./metabloomSavedWorkApiClient', () => ({ requestMetabloomSavedWork: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const originalTextEncoder = global.TextEncoder;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const provenance = { type: 'user', label: 'Supplied fictional values.', sourceIds: [] };
const calculator = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Project price',
  summary: 'A fictional project estimate.', provenance, unit: 'CAD',
  controls: [{ id: 'hours', label: 'Hours', unit: '', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD', min: 10, max: 200, step: 5, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' };
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Project estimates',
  summary: 'Supplied fictional estimates.', provenance, columns: ['Project', 'Hours'],
  rows: Array.from({ length: 10 }, (_, index) => [`Project ${index + 1}`, String(index + 1)]) };
const line = { version: '1', designVersion: 'aetheris-1', kind: 'line-chart', title: 'Monthly hours',
  summary: 'Supplied fictional observations.', provenance, unit: 'hours',
  points: [{ label: 'January', value: 10 }, { label: 'February', value: 20 }] };
const id = index => String(index).repeat(48);
const version = index => String(index).repeat(32);
const envelope = response => ({ version: '2.0.0', segments: [{ response }] });
const record = (index, spec = calculator, viewState = { inputs: { hours: '17', rate: '85' } }) => ({
  id: id(index), kind: spec.kind, mode: 'tool', userId: `user-${index * 2 - 1}`,
  replyId: `assistant-${index * 2}`, expiresAt: Date.now() + 600000, status: 'ready', spec,
  sources: [], viewState, artifactVersion: version(index),
});
const initialState = (records, activeVisualId) => ({
  orb: { counter: records.length * 2, messages: records.flatMap(item => [
    { id: item.userId, role: 'user', content: `Create ${item.spec.title}.`, status: 'complete' },
    { id: item.replyId, role: 'assistant', content: `${item.spec.title} is ready.`, status: 'complete' },
  ]) },
  orbVisuals: { version: 1, records, lastInteractedId: records.find(item => item.kind === 'calculator')?.id || null,
    ...(activeVisualId ? { activeVisualId } : {}) },
});
const researchState = ({ expired = false, reference = true } = {}) => {
  const state = initialState([record(1)], id(1));
  const asOf = new Date(Date.now() - 120000).toISOString();
  const metadata = { researchId: 'a'.repeat(48), briefId: 'b'.repeat(32), title: 'Coastal evidence',
    asOf, timeZone: 'UTC', localDate: asOf.slice(0, 10), expiresAt: new Date(Date.now() + (expired ? -1000 : 600000)).toISOString() };
  const report = { notes: 'Original evidence for the two findings [1] [2].', sources: [1, 2].map(index => ({
    id: index, title: `Fictional source ${index}`, url: `https://example.org/source-${index}` })) };
  const brief = { version: 'metabloom-research-brief-v1', kind: 'research', title: 'Coastal evidence',
    scope: 'Compare the recorded findings.', asOf, timeZone: 'UTC', localDate: metadata.localDate,
    windowStart: null, windowEnd: null, coverage: { requestedCount: 2, returnedCount: 2, status: 'complete', limitations: [] },
    items: [1, 2].map(index => ({ headline: `Finding ${index}`, summary: `Recorded evidence ${index}.`, sourceIds: [index],
      background: [], whyItMatters: 'This supports comparison.', uncertainty: [], watchNext: [], developmentDate: null,
      scheduledDate: null, dateEvidence: null, evidenceStatus: 'reported' })),
    sourceDetails: [1, 2].map(sourceId => ({ sourceId, publisher: '', publishedDate: null, dateEvidence: '', sourceType: 'unknown' })) };
  state.orb.counter = 4;
  state.orb.messages.push({ id: 'user-3', role: 'user', content: 'Research the coastal evidence.', status: 'complete' },
    { id: 'assistant-4', role: 'assistant', content: 'The evidence is ready.', status: 'complete',
      researchDetails: report, researchBrief: brief, ...(reference ? { researchReference: metadata } : {}) });
  return state;
};
function Harness({ navigation, visualRef, isActive = true }) {
  const [controller, setController] = React.useState(null);
  const ready = React.useCallback(value => {
    setController(value);
    return () => setController(current => current === value ? null : current);
  }, []);
  return <AppNavigationContext.Provider value={navigation}>
    <MetabloomWorkspaceContext.Provider value={controller}>
      <div className="orb-page"><OrbSection isActive={isActive} /><MetabloomVisuals navigation={navigation} ref={visualRef} onWorkspaceReady={ready} /></div>
    </MetabloomWorkspaceContext.Provider>
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
const activeWorkspace = () => screen.getByRole('region', { name: 'Current component' });
const workspaceSaveStatus = () => within(activeWorkspace()).getByRole('status', { name: 'Save status' });
const show = title => fireEvent.click(screen.getByRole('button', { name: `Show component: ${title}` }));
let requests, originalMatchMedia;
// These fixtures exercise the retained start/generate/continue protocol.
// Default agent offers are also exercised by the mobile-workspace browser suite.
const legacyToolRequest = event => { event.detail.toolset = false; };
beforeAll(() => {
  global.TextEncoder = TextEncoder;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID: () => '00000000-0000-4000-8000-000000000099' } });
});
afterAll(() => {
  global.TextEncoder = originalTextEncoder;
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else delete globalThis.crypto;
});
beforeEach(() => {
  window.addEventListener('metabloom:user-message', legacyToolRequest, { capture: true });
  requests = [];
  requestMetabloomVisual.mockReset(); postMetabloomTool.mockReset();
  requestMetabloomSavedWork.mockReset();
  window.__metabloomRequest = request => new Promise(finish => requests.push({ request, finish }));
  originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  window.removeEventListener('metabloom:user-message', legacyToolRequest, { capture: true });
  cleanup(); jest.restoreAllMocks();
  delete window.__metabloomRequest;
  window.matchMedia = originalMatchMedia;
});

test('new generation opens one live component and its closing reply keeps the original message association', async () => {
  const state = workspace(); state.mount();
  const offer = { version: '1', designVersion: 'aetheris-1', id: id(1), kind: 'calculator', expiresAt: Date.now() + 600000 };
  postMetabloomTool.mockResolvedValueOnce({ offer, emote: 'neutral' })
    .mockResolvedValueOnce({ reply: envelope('Your calculator is ready.'), emote: 'neutral' });
  requestMetabloomVisual.mockResolvedValueOnce({ spec: calculator, sources: [], artifactVersion: version(1) });
  send('Create an interactive project-price calculator.');
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  await screen.findByText('Your calculator is ready.');
  const launcher = await screen.findByRole('button', { name: `Show component: ${calculator.title}` });
  await waitFor(() => expect(launcher.closest('article')).toHaveAttribute('data-message-id', 'assistant-2'));
  expect(frame.closest('.metabloom-chat__messages')).toBeNull();
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-active-component', 'true');
  expect(within(frame).getByText('650 CAD')).toBeInTheDocument();
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
});

test('Ask keeps the selected calculator visible through a follow-up without changing the captured scenario', async () => {
  workspace(initialState([record(1)])).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  expect(activeWorkspace()).toContainElement(frame);
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(requests).toHaveLength(0);
  fireEvent.change(hours, { target: { value: '20' } });
  send('Explain the selected scenario.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request.artifactContext).toEqual({ id: id(1), version: version(1),
    selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } });
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(activeWorkspace()).toContainElement(frame);
  await act(async () => requests[0].finish(envelope('The selected total is 1,445 CAD.')));
  await screen.findByText('The selected total is 1,445 CAD.');
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(20);
  expect(within(frame).getByText('1,700 CAD')).toBeInTheDocument();
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  send('An unrelated question without an attachment.');
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1].request).not.toHaveProperty('artifactContext');
  expect(activeWorkspace()).toContainElement(frame);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('removing an attachment keeps the live component open but never reattaches its data', async () => {
  workspace(initialState([record(1)])).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove visual reference' }));
  expect(activeWorkspace()).toContainElement(frame);
  send('Explain an unrelated idea.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request).not.toHaveProperty('artifactContext');
});

test('the composer displays a frozen scenario and recaptures live values only on Update selection', async () => {
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  const composer = screen.getByRole('textbox');
  fireEvent.change(composer, { target: { value: 'What would three more hours cost?' } });
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  const attachment = screen.getByRole('group', { name: 'Selected visual reference' });
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  fireEvent.change(hours, { target: { value: '20' } });
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  expect(within(frame).getByText('1,700 CAD')).toBeInTheDocument();
  expect(requests).toHaveLength(0);
  fireEvent.click(within(attachment).getByRole('button', { name: 'Update selection' }));
  expect(attachment).toHaveTextContent('Hours: 20 · Hourly rate: 85 CAD · Result: 1,700 CAD');
  expect(composer).toHaveValue('What would three more hours cost?');
  expect(composer).toHaveFocus();
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request.artifactContext.inputs).toEqual({ hours: 20, rate: 85 });
  expect(requests[0].request.artifactContext).not.toHaveProperty('summary');
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('an invalid live draft cannot replace the valid captured scenario', async () => {
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update selection' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your attached selection is unchanged.');
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Result: 1,445 CAD');
  send('Explain the captured values.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request.artifactContext.inputs).toEqual({ hours: 17, rate: 85 });
});

test('explicit selection reveals the current result again while streamed updates preserve workspace scrolling', async () => {
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  const body = frame.closest('.metabloom-component-workspace__body');
  body.scrollTop = 180;
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  expect(body.scrollTop).toBe(0);
  body.scrollTop = 120;
  show(calculator.title);
  expect(body.scrollTop).toBe(0);
  body.scrollTop = 170;
  send('Explain the selected scenario.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(body.scrollTop).toBe(0);
  body.scrollTop = 90;
  act(() => requests[0].request.onTextDelta('The selected scenario ', 0));
  await screen.findByText('The selected scenario');
  expect(body.scrollTop).toBe(90);
  expect(activeWorkspace()).toContainElement(frame);
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
});

test('returning and reopening a calculator moves its existing form and preserves an unfinished input', async () => {
  const state = workspace(initialState([record(1)], id(1))); state.mount();
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  fireEvent.change(hours, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Return component to conversation' }));
  const launcher = screen.getByRole('button', { name: `Show component: ${calculator.title}` });
  expect(launcher).toHaveFocus();
  expect(frame.closest('article')).toHaveAttribute('data-message-id', 'assistant-2');
  expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  expect(activeWorkspace()).toBeEmptyDOMElement();
  show(calculator.title);
  expect(activeWorkspace()).toContainElement(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(null);
  expect(within(frame).getByText('Enter valid inputs to calculate.')).toBeInTheDocument();
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('compact and expanded views keep the same form, composer, live summary, and unfinished values', async () => {
  const state = workspace(initialState([record(1)], id(1))), view = state.mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  const composer = screen.getByRole('textbox');
  const root = view.container.querySelector('.orb-page');
  const summary = root.querySelector('.metabloom-component-workspace__summary');
  expect(root).toHaveAttribute('data-component-view', 'compact');
  expect(summary).toHaveTextContent('1,445 CAD · 17 Hours · 85 CAD');
  fireEvent.change(composer, { target: { value: 'My unfinished question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(root).toHaveAttribute('data-component-view', 'expanded');
  expect(root.querySelector('.metabloom-component-workspace__body')).toHaveFocus();
  fireEvent.change(hours, { target: { value: '20' } });
  expect(summary).toHaveTextContent('1,700 CAD · 20 Hours · 85 CAD');
  fireEvent.change(hours, { target: { value: '' } });
  expect(summary).toHaveTextContent('Inputs need attention');
  fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
  expect(root).toHaveAttribute('data-component-view', 'compact');
  expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(null);
  expect(screen.getByRole('textbox')).toBe(composer);
  expect(composer).toHaveValue('My unfinished question');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  expect(requests).toHaveLength(0);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  view.unmount();
  expect(state.cache.get('orbVisuals').workspaceView).toBe('expanded');
  state.mount();
  await screen.findByRole('region', { name: calculator.title });
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
});

test('expanded editing preserves earlier transcript position through a reply and Back to chat', async () => {
  const view = workspace(initialState([record(1)], id(1))).mount();
  await screen.findByRole('region', { name: calculator.title });
  const transcript = view.container.querySelector('.metabloom-chat__messages');
  Object.defineProperties(transcript, { scrollHeight: { configurable: true, value: 1200 },
    clientHeight: { configurable: true, value: 300 } });
  transcript.scrollTop = 250;
  fireEvent.scroll(transcript);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  transcript.scrollTop = 0; // A hidden browser scroll container has no layout box.
  send('A separate question while I inspect the component.');
  await waitFor(() => expect(requests).toHaveLength(1));
  await act(async () => requests[0].finish(envelope('A new reply is ready.')));
  await screen.findByText('A new reply is ready.');
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  expect(transcript.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
  await waitFor(() => expect(transcript.scrollTop).toBe(250));
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  fireEvent.click(screen.getByRole('button', { name: 'Read latest reply in chat' }));
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'compact');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(transcript.scrollTop).toBe(1200);
});

test('focusing the composer returns mobile work to compact without changing its input draft', async () => {
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  act(() => screen.getByRole('textbox').focus());
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'compact');
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(requests).toHaveLength(0);
});

test('leaving mobile restores reading state and focus before hidden mobile controls disappear', async () => {
  let mobile = true;
  window.matchMedia = query => ({ get matches() { return query === '(max-width: 900px)' ? mobile : true; },
    addEventListener() {}, removeEventListener() {} });
  const state = workspace(initialState([record(1)], id(1))), visualRef = React.createRef();
  const view = render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  await screen.findByRole('region', { name: calculator.title });
  const transcript = view.container.querySelector('.metabloom-chat__messages');
  Object.defineProperties(transcript, { scrollHeight: { configurable: true, value: 1200 },
    clientHeight: { configurable: true, value: 300 } });
  transcript.scrollTop = 250; fireEvent.scroll(transcript);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  act(() => screen.getByRole('button', { name: 'Back to chat' }).focus());
  mobile = false;
  act(() => visualRef.current.onWorkspaceBreakpoint({ matches: false }));
  expect(view.container.querySelector('.metabloom-component-workspace__body')).toHaveFocus();
  await waitFor(() => expect(transcript.scrollTop).toBe(250));
  transcript.scrollTop = 500; fireEvent.scroll(transcript);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this scenario' }));
  await act(async () => new Promise(resolve => window.requestAnimationFrame(resolve)));
  expect(transcript.scrollTop).toBe(500);
});

test('returning a component to its message lets the launcher reading position win', async () => {
  const view = workspace(initialState([record(1)], id(1))).mount();
  await screen.findByRole('region', { name: calculator.title });
  const transcript = view.container.querySelector('.metabloom-chat__messages');
  Object.defineProperties(transcript, { scrollHeight: { configurable: true, value: 1200 },
    clientHeight: { configurable: true, value: 300 } });
  transcript.scrollTop = 250; fireEvent.scroll(transcript);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const launcher = screen.getByRole('button', { name: `Show component: ${calculator.title}` });
  jest.spyOn(launcher, 'focus').mockImplementation(() => { transcript.scrollTop = 800; });
  fireEvent.click(screen.getByRole('button', { name: 'Return component to conversation' }));
  await act(async () => new Promise(resolve => window.requestAnimationFrame(resolve)));
  expect(transcript.scrollTop).toBe(800);
});

test('switching the visible component preserves table sorting and filtering without remounting either card', async () => {
  const records = [record(1), record(2, table, { sort: { column: null, direction: 'asc' }, filter: '' })];
  workspace(initialState(records, id(1))).mount();
  const calculatorFrame = await screen.findByRole('region', { name: calculator.title });
  const tableFrame = await screen.findByRole('region', { name: table.title });
  const filter = within(tableFrame).getByRole('searchbox', { name: 'Filter rows' });
  fireEvent.change(filter, { target: { value: 'Project 1' } });
  fireEvent.click(within(tableFrame).getByRole('button', { name: /Hours/ }));
  fireEvent.click(within(tableFrame).getByRole('button', { name: /Hours/ }));
  show(table.title);
  expect(activeWorkspace()).toContainElement(tableFrame);
  expect(calculatorFrame.closest('article')).toHaveAttribute('data-message-id', 'assistant-2');
  show(calculator.title); show(table.title);
  expect(within(tableFrame).getByRole('searchbox', { name: 'Filter rows' })).toBe(filter);
  expect(filter).toHaveValue('Project 1');
  expect(within(tableFrame).getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'descending');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(2);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('the conversation picker preserves component identity, focus, scrolling, and the separately captured reference', async () => {
  const records = [record(1), record(2, table, { sort: { column: null, direction: 'asc' }, filter: '' })];
  workspace(initialState(records, id(1))).mount();
  const calculatorFrame = await screen.findByRole('region', { name: calculator.title });
  const tableFrame = screen.getByRole('region', { name: table.title });
  fireEvent.click(within(calculatorFrame).getByRole('button', { name: 'Ask about this scenario' }));
  const attachment = screen.getByRole('group', { name: 'Selected visual reference' });
  const picker = screen.getByRole('combobox', { name: 'Components in this conversation' });
  const body = document.querySelector('.metabloom-component-workspace__body');
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  body.scrollTop = 75;
  act(() => picker.focus());
  fireEvent.change(picker, { target: { value: id(2) } });
  expect(picker).toHaveFocus();
  expect(activeWorkspace()).toContainElement(tableFrame);
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  fireEvent.change(within(tableFrame).getByRole('searchbox'), { target: { value: 'Project 1' } });
  fireEvent.click(within(tableFrame).getByRole('button', { name: /Hours/ }));
  body.scrollTop = 110;
  fireEvent.change(picker, { target: { value: id(1) } });
  expect(body.scrollTop).toBe(75);
  expect(activeWorkspace()).toContainElement(calculatorFrame);
  fireEvent.change(picker, { target: { value: id(2) } });
  expect(body.scrollTop).toBe(110);
  expect(within(tableFrame).getByRole('searchbox')).toHaveValue('Project 1');
  expect(within(tableFrame).getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'ascending');
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(2);
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('picker labels distinguish duplicate titles and remove records pruned from the conversation', async () => {
  const records = [record(1), record(2)];
  const state = workspace(initialState(records, id(1))), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  const picker = await screen.findByRole('combobox', { name: 'Components in this conversation' });
  expect(within(picker).getByRole('option', { name: '1. Project price · Calculator' })).toHaveValue(id(1));
  expect(within(picker).getByRole('option', { name: '2. Project price · Calculator' })).toHaveValue(id(2));
  const previous = window.__orbMessages;
  window.__orbMessages = () => previous().filter(message => !['user-3', 'assistant-4'].includes(message.id));
  act(() => visualRef.current.reconcile());
  expect(screen.queryByRole('combobox', { name: 'Components in this conversation' })).not.toBeInTheDocument();
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  window.__orbMessages = previous;
  expect(requests).toHaveLength(0);
});

test('chart selection and expanded details survive workspace moves', async () => {
  const item = record(1, line, { active: 1, detailsOpen: true });
  workspace(initialState([item], item.id)).mount();
  const frame = await screen.findByRole('region', { name: line.title });
  const detail = within(frame).getByText('View exact values', { selector: 'summary' }).parentElement;
  expect(within(frame).getByRole('status')).toHaveTextContent('February:');
  expect(detail).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Return component to conversation' }));
  show(line.title);
  expect(activeWorkspace()).toContainElement(frame);
  expect(within(frame).getByRole('status')).toHaveTextContent('February:');
  expect(detail).toHaveAttribute('open');
});

test.each(['select', 'close', 'view'])('a newer explicit %s prevents an in-flight result from replacing the workspace', async action => {
  workspace(initialState([record(1)], id(1))).mount();
  const first = await screen.findByRole('region', { name: calculator.title });
  const secondSpec = { ...calculator, title: 'Second project price' };
  const offer = { version: '1', designVersion: 'aetheris-1', id: id(2), kind: 'calculator', expiresAt: Date.now() + 600000 };
  let finishGeneration;
  postMetabloomTool.mockResolvedValueOnce({ offer, emote: 'neutral' })
    .mockResolvedValueOnce({ reply: envelope('The second calculator is ready.'), emote: 'neutral' });
  requestMetabloomVisual.mockImplementationOnce(() => new Promise(resolve => { finishGeneration = resolve; }));
  send('Create a second interactive calculator.');
  await screen.findByRole('button', { name: 'Stop visual' });
  fireEvent.click(action === 'select' ? within(first).getByRole('button', { name: 'Ask about this scenario' })
    : screen.getByRole('button', { name: action === 'view' ? 'Open' : 'Return component to conversation' }));
  await act(async () => finishGeneration({ spec: secondSpec, sources: [], artifactVersion: version(2) }));
  const second = await screen.findByRole('region', { name: secondSpec.title });
  await screen.findByText('The second calculator is ready.');
  if (action === 'select') {
    expect(activeWorkspace()).toContainElement(first);
    expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Project price · Scenario');
  } else if (action === 'view') {
    expect(activeWorkspace()).toContainElement(first);
    expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  } else {
    expect(activeWorkspace()).toBeEmptyDOMElement();
    expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  }
  expect(activeWorkspace()).not.toContainElement(second);
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
});

test('a submitted exact reference opens its owned record, while another version cannot select it', async () => {
  const initial = initialState([record(1)]);
  const reference = { id: id(1), version: version(1), selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } };
  initial.orb.artifactAttachment = { reference, label: 'Project price · Scenario' };
  const state = workspace(initial), view = state.mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  expect(activeWorkspace()).toBeEmptyDOMElement();
  send('Explain this saved selection.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(activeWorkspace()).toContainElement(frame);
  view.unmount();
  const mismatch = initialState([record(1)]);
  mismatch.orb.artifactAttachment = { reference: { ...reference, version: version(2) }, label: 'An old revision' };
  workspace(mismatch).mount();
  await screen.findByRole('region', { name: calculator.title });
  send('Explain this old selection.');
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(activeWorkspace()).toBeEmptyDOMElement();
});

test('navigation and StrictMode restore the active older component once without generation', async () => {
  requestMetabloomSavedWork.mockResolvedValue({ items: [], nextCursor: null });
  const records = [record(1), record(2, { ...calculator, title: 'Newer estimate' })];
  const state = workspace(initialState(records, id(1)));
  const view = render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '23' } });
  const launcher = within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true });
  expect(launcher).toBeEnabled();
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(launcher).toHaveFocus();
  view.unmount();
  expect(state.cache.get('orbVisuals').activeVisualId).toBe(id(1));
  expect(state.cache.get('orbVisuals').records[0].viewState.inputs.hours).toBe('23');
  state.mount();
  const restored = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  expect(within(restored).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(23);
  expect(within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true })).toBeEnabled();
  await openWorkspaceSavedPanel();
  expect(within(screen.getByRole('region', { name: 'Current work' })).getByText(calculator.title)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(2);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
});

test('reset clears the workspace, its origin controls and retained active identity', async () => {
  const state = workspace(initialState([record(1)], id(1))), view = state.mount();
  await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  act(() => window.__orbReset());
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  expect(screen.queryByRole('button', { name: /^Show component:/ })).not.toBeInTheDocument();
  view.unmount();
  expect(state.cache.get('orbVisuals')).not.toHaveProperty('activeVisualId');
  state.mount();
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument();
});

test('pruned message ownership removes an active component instead of retaining an orphan workspace', async () => {
  const state = workspace(initialState([record(1)], id(1))), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  const readMessages = window.__orbMessages;
  window.__orbMessages = () => [];
  act(() => visualRef.current.reconcile());
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument();
  window.__orbMessages = readMessages;
});

test('invalidated account cleanup and stale callbacks cannot reopen a component in the next workspace', async () => {
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ artifact: savedArtifact() });
  const state = workspace(initialState([record(1)], id(1))), visualRef = React.createRef();
  let current = true;
  const navigation = { ...state.navigation, saveToolState: (key, value) => { if (current) state.cache.set(key, value); } };
  const view = render(<Harness navigation={navigation} visualRef={visualRef} />);
  await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  const previous = visualRef.current, previousRecord = previous.records.get(id(1));
  current = false; state.cache.clear(); view.unmount();
  expect(state.cache.size).toBe(0);
  state.mount();
  expect(previous.activateComponent(previousRecord, { explicit: true })).toBe(false);
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(screen.queryByRole('status', { name: 'Save status' })).not.toBeInTheDocument();
  expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument();
});

test('research shares the workspace while each live renderer, reading position, and captured selection stays intact', async () => {
  workspace(researchState()).mount();
  const calculatorFrame = await screen.findByRole('region', { name: calculator.title });
  const hours = within(calculatorFrame).getByRole('spinbutton', { name: 'Hours' });
  fireEvent.click(within(calculatorFrame).getByRole('button', { name: 'Ask about this scenario' }));
  const attachment = screen.getByRole('group', { name: 'Selected visual reference' });
  fireEvent.change(hours, { target: { value: '' } });
  const body = document.querySelector('.metabloom-component-workspace__body');
  body.scrollTop = 80;
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  const carousel = within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' });
  const choice = within(carousel).getByRole('combobox', { name: 'Choose a finding' });
  fireEvent.change(choice, { target: { value: '1' } });
  const finding = within(carousel).getByRole('article', { name: 'Finding 2' });
  const analysis = within(finding).getByText('Analysis and context', { selector: 'summary' });
  fireEvent.click(analysis);
  body.scrollTop = 160;
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  const picker = screen.getByRole('combobox', { name: 'Components in this conversation' });
  fireEvent.change(picker, { target: { value: id(1) } });
  expect(body.scrollTop).toBe(80);
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(null);
  fireEvent.change(picker, { target: { value: 'research:assistant-4' } });
  expect(body.scrollTop).toBe(160);
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBe(carousel);
  expect(choice).toHaveDisplayValue('Finding 2 of 2');
  expect(analysis.parentElement).toHaveAttribute('open');
  expect(within(carousel).getByRole('link', { name: 'Source 2: Fictional source 2' })).toHaveAttribute('href', 'https://example.org/source-2');
  expect(requests).toHaveLength(0);
  fireEvent.click(within(carousel).getByRole('button', { name: 'Use this finding' }));
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'compact');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent('Finding 2');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the selected finding.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'compact');
  expect(requests[0].request.researchContext).toEqual({ researchId: 'a'.repeat(48),
    selector: { type: 'finding', briefId: 'b'.repeat(32), index: 1 } });
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test.each([{ expired: true }, { reference: false }])('research remains readable without live reuse: %j', async options => {
  workspace(researchState(options)).mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBeVisible();
  if (options.expired) expect(screen.getByRole('button', { name: 'Use this research' })).toBeDisabled();
  else expect(screen.queryByRole('button', { name: 'Use this research' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test('research selection survives navigation and StrictMode, while reset closes it and retains readable reports', async () => {
  const state = workspace(researchState());
  const view = render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBeVisible();
  view.unmount();
  expect(state.cache.get('orbWorkspace')).toEqual({ messageId: 'assistant-4', view: 'expanded' });
  const next = render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  await within(activeWorkspace()).findByRole('region', { name: 'Coastal evidence' });
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  expect(document.querySelectorAll('.metabloom-research-slot')).toHaveLength(1);
  act(() => window.__orbReset());
  expect(activeWorkspace()).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'Open research: Coastal evidence' }));
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Return research to conversation' }));
  next.unmount();
  expect(state.cache.get('orbWorkspace')).toBeNull();
  expect(requests).toHaveLength(0);
});

test('pruning the active research removes its portal and the conversation picker', async () => {
  const state = workspace(researchState()), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  const slot = document.querySelector('.metabloom-research-slot');
  const previous = window.__orbMessages;
  window.__orbMessages = () => previous().filter(message => message.id !== 'assistant-4');
  act(() => visualRef.current.reconcile());
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(slot.isConnected).toBe(false);
  expect(visualRef.current.researchRecords.size).toBe(0);
  expect(screen.queryByRole('combobox', { name: 'Components in this conversation' })).not.toBeInTheDocument();
  window.__orbMessages = previous;
});

test('a detached research portal cannot be selected or reclaimed by an old registry', async () => {
  const state = workspace(researchState()), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  const launcher = await screen.findByRole('button', { name: 'Open research: Coastal evidence' });
  const descriptor = visualRef.current.researchRecords.get('assistant-4');
  descriptor.slot.remove();
  fireEvent.click(launcher);
  expect(visualRef.current.activeResearchId).toBeNull();
  act(() => visualRef.current.reconcile());
  expect(visualRef.current.researchRecords.size).toBe(0);
  expect(descriptor.slot.isConnected).toBe(false);
});

test('submitted research cannot select a message pruned before the observer reconciles', async () => {
  const state = workspace(researchState()), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  await screen.findByRole('button', { name: 'Open research: Coastal evidence' });
  const previous = window.__orbMessages;
  window.__orbMessages = () => previous().filter(message => message.id !== 'assistant-4');
  act(() => visualRef.current.activateSubmittedResearch({ researchId: 'a'.repeat(48), selector: { type: 'report' } }));
  expect(visualRef.current.activeVisualId).toBe(id(1));
  expect(visualRef.current.activeResearchId).toBeNull();
  window.__orbMessages = previous;
});

test('opening research prevents an older in-flight native result from taking over the workspace', async () => {
  workspace(researchState()).mount();
  await screen.findByRole('button', { name: 'Open research: Coastal evidence' });
  const offer = { version: '1', designVersion: 'aetheris-1', id: id(2), kind: 'calculator', expiresAt: Date.now() + 600000 };
  let finish;
  postMetabloomTool.mockResolvedValueOnce({ offer, emote: 'neutral' }).mockResolvedValueOnce({ reply: envelope('A new estimate is ready.'), emote: 'neutral' });
  requestMetabloomVisual.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  send('Create a second interactive calculator.');
  await screen.findByRole('button', { name: 'Stop visual' });
  expect(within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open research: Coastal evidence' }));
  const savedLauncher = within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true });
  expect(savedLauncher).toBeDisabled();
  fireEvent.click(savedLauncher);
  expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).not.toHaveBeenCalled();
  await act(async () => finish({ spec: { ...calculator, title: 'New estimate' }, sources: [], artifactVersion: version(2) }));
  await screen.findByText('A new estimate is ready.');
  expect(within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true })).toBeEnabled();
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBeVisible();
  expect(within(activeWorkspace()).queryByRole('region', { name: 'New estimate' })).not.toBeInTheDocument();
});

const savedArtifact = (extra = {}) => ({ artifactId: '00000000-0000-4000-8000-000000000001', title: 'Project price',
  kind: 'visual', version: 1, revision: 1, headRevision: 1, createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z', ...extra });
const savedVisual = (artifact = savedArtifact()) => ({ artifact,
  content: { schemaVersion: 1, kind: 'visual', spec: calculator, sources: [], scenario: { inputs: { hours: 17, rate: 85 } } },
  reference: { kind: 'visual', offer: { version: '1', designVersion: 'aetheris-1', id: 'f'.repeat(48), kind: 'calculator',
    expiresAt: Date.now() + 3600000 }, artifactVersion: 'f'.repeat(32) } });
const openSavedPanel = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'More', exact: true }));
  expect(screen.getByText('Reactions and previews', { selector: 'summary' }).parentElement).not.toHaveAttribute('open');
  fireEvent.click(within(screen.getByRole('dialog', { name: 'More options' })).getByRole('button', { name: 'Saved work', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh list' })).toBeEnabled());
  return screen.getByRole('dialog', { name: 'Saved work' });
};
const openWorkspaceSavedPanel = async () => {
  fireEvent.click(await within(activeWorkspace()).findByRole('button', { name: 'Saved work', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh list' })).toBeEnabled());
  return screen.getByRole('dialog', { name: 'Saved work' });
};

test('the workspace Saved launcher captures live inputs without changing the frozen attachment, form, or reading position', async () => {
  let confirm;
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
  const state = workspace(initialState([record(1)], id(1))), view = state.mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  const composer = screen.getByRole('textbox');
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  const attachment = screen.getByRole('group', { name: 'Selected visual reference' });
  fireEvent.change(hours, { target: { value: '20' } });
  fireEvent.change(composer, { target: { value: 'My unfinished question' } });
  const body = frame.closest('.metabloom-component-workspace__body');
  body.scrollTop = 90;
  const launcher = within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true });
  expect(launcher).toHaveTextContent('Saved');
  expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');
  await openWorkspaceSavedPanel();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request)).toEqual([{ action: 'list', limit: 20 }]);
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  expect(screen.getAllByRole('form', { name: 'Message Metabloom' })).toHaveLength(1);
  expect(screen.getByRole('textbox')).toBe(composer);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(body.scrollTop).toBe(90);
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'save', requestId: expect.any(String), title: 'Project price',
    source: { kind: 'visual', id: id(1), artifactVersion: version(1) }, scenario: { inputs: { hours: 20, rate: 85 } } });
  expect(window.__orbMessages().find(message => message.id === 'assistant-2')).not.toHaveProperty('savedArtifact');
  // A late renderer update must not be mistaken for the scenario captured by Save.
  fireEvent.change(hours, { target: { value: '23' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  await act(async () => confirm({ artifact: savedArtifact() }));
  expect(window.__orbMessages().find(message => message.id === 'assistant-2').savedArtifact).toEqual(savedArtifact());
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  expect(hours).toHaveValue(23);
  fireEvent.change(hours, { target: { value: '20' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(launcher).toHaveFocus();
  expect(composer).toHaveValue('My unfinished question');
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(20);
  expect(body.scrollTop).toBe(90);
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toBe(attachment);
  expect(attachment).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  view.unmount();
  expect(state.cache.get('orb').messages.find(message => message.id === 'assistant-2').savedArtifact).toEqual(savedArtifact());
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('the workspace Saved launcher follows selected research and Escape restores its reading state and opener', async () => {
  const artifact = savedArtifact({ kind: 'research', title: 'Coastal evidence' });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ artifact });
  workspace(researchState()).mount();
  const calculatorFrame = await screen.findByRole('region', { name: calculator.title });
  const hours = within(calculatorFrame).getByRole('spinbutton', { name: 'Hours' });
  fireEvent.change(hours, { target: { value: '20' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  const brief = within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  fireEvent.click(within(brief).getByRole('button', { name: 'Use this finding' }));
  const attachment = screen.getByRole('group', { name: 'Selected research reference' });
  const composer = screen.getByRole('textbox');
  fireEvent.change(composer, { target: { value: 'Keep my question about finding one' } });
  const choice = within(brief).getByRole('combobox', { name: 'Choose a finding' });
  fireEvent.change(choice, { target: { value: '1' } });
  const finding = within(brief).getByRole('article', { name: 'Finding 2' });
  const analysis = within(finding).getByText('Analysis and context', { selector: 'summary' });
  fireEvent.click(analysis);
  const body = brief.closest('.metabloom-component-workspace__body');
  body.scrollTop = 160;
  const launcher = within(activeWorkspace()).getByRole('button', { name: 'Saved work', exact: true });
  const dialog = await openWorkspaceSavedPanel();
  expect(screen.queryByRole('dialog', { name: 'More options' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('region', { name: 'Current work' })).toHaveTextContent('Coastal evidence');
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request)).toEqual([{ action: 'list', limit: 20 }]);
  expect(attachment).toHaveTextContent('Finding 1');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save current work' }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Saved', exact: true })).toBeDisabled());
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'save', requestId: expect.any(String), title: 'Coastal evidence',
    source: { kind: 'research', researchId: 'a'.repeat(48), briefId: 'b'.repeat(32) } });
  expect(window.__orbMessages().find(message => message.id === 'assistant-4').savedArtifact).toEqual(artifact);
  expect(window.__orbMessages().find(message => message.id === 'assistant-2')).not.toHaveProperty('savedArtifact');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBe(brief);
  expect(choice).toHaveDisplayValue('Finding 2 of 2');
  expect(analysis.parentElement).toHaveAttribute('open');
  expect(body.scrollTop).toBe(160);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(screen.getByRole('group', { name: 'Selected research reference' })).toBe(attachment);
  expect(attachment).toHaveTextContent('Finding 1');
  expect(screen.getByRole('textbox')).toBe(composer);
  expect(composer).toHaveValue('Keep my question about finding one');
  fireEvent.change(screen.getByRole('combobox', { name: 'Components in this conversation' }), { target: { value: id(1) } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(20);
  const reference = window.__orbMessages().find(message => message.id === 'assistant-4').researchReference;
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(reference.expiresAt) + 1);
  fireEvent.change(screen.getByRole('combobox', { name: 'Components in this conversation' }), { target: { value: 'research:assistant-4' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBe(brief);
  clock.mockRestore();
  expect(screen.getAllByRole('form', { name: 'Message Metabloom' })).toHaveLength(1);
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('the workspace Saved launcher cannot open during a reply or while the conversation is inactive', async () => {
  requestMetabloomSavedWork.mockResolvedValue({ items: [], nextCursor: null });
  const state = workspace(initialState([record(1)], id(1)));
  const view = render(<Harness navigation={state.navigation} />);
  const launcher = await within(activeWorkspace()).findByRole('button', { name: 'Saved work', exact: true });
  send('Explain the estimate.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(launcher).toBeDisabled();
  fireEvent.click(launcher);
  expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).not.toHaveBeenCalled();
  await act(async () => requests[0].finish(envelope('The estimate is ready to review.')));
  await screen.findByText('The estimate is ready to review.');
  expect(launcher).toBeEnabled();
  view.rerender(<Harness navigation={state.navigation} isActive={false} />);
  expect(launcher).toBeDisabled();
  fireEvent.click(launcher);
  expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument();
  expect(requestMetabloomSavedWork).not.toHaveBeenCalled();
  view.rerender(<Harness navigation={state.navigation} />);
  expect(launcher).toBeEnabled();
  await openWorkspaceSavedPanel();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
  view.rerender(<Harness navigation={state.navigation} isActive={false} />);
  expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument();
  expect(launcher).toBeDisabled();
});

test('More keeps Saved work available without adding a launcher to an empty workspace', async () => {
  requestMetabloomSavedWork.mockResolvedValue({ items: [], nextCursor: null });
  workspace().mount();
  expect(within(activeWorkspace()).queryByRole('button', { name: 'Saved work', exact: true })).not.toBeInTheDocument();
  const dialog = await openSavedPanel();
  expect(within(dialog).queryByRole('button', { name: 'Save current work' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close saved work' }));
  expect(screen.getByRole('button', { name: 'More', exact: true })).toHaveFocus();
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request)).toEqual([{ action: 'list', limit: 20 }]);
  expect(requests).toHaveLength(0);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('an unfinished calculator cannot silently save its initial values instead', async () => {
  requestMetabloomSavedWork.mockResolvedValue({ items: [], nextCursor: null });
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '' } });
  await openSavedPanel();
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeDisabled();
  expect(screen.getByText('Complete the component inputs before saving this work.')).toBeVisible();
  expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(1);
});

test('Open restores a saved calculator in a new conversation with fresh follow-up references and no generation', async () => {
  const result = savedVisual();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [result.artifact], nextCursor: null }).mockResolvedValueOnce(result);
  workspace().mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An unfinished draft' } });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  await waitFor(() => expect(frame.closest('.metabloom-component-workspace__body')).toHaveFocus());
  expect(within(frame).getByText('1,445 CAD')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveValue('An unfinished draft');
  expect(document.querySelector('.orb-page')).toHaveAttribute('data-component-view', 'expanded');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  expect(window.__orbMessages()[0].savedArtifact).toEqual(result.artifact);
  fireEvent.click(within(frame).getByRole('button', { name: 'Ask about this scenario' }));
  send('Explain this saved scenario.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request.artifactContext).toEqual({ id: 'f'.repeat(48), version: 'f'.repeat(32),
    selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } });
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('a confirmed calculator baseline compares numeric values and never treats an unfinished draft as saved', async () => {
  const result = savedVisual();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [result.artifact], nextCursor: null }).mockResolvedValueOnce(result);
  workspace().mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  const rate = within(frame).getByRole('spinbutton', { name: 'Hourly rate (CAD)' });
  for (const draft of ['17.0', '1.7e1', '17']) {
    fireEvent.change(hours, { target: { value: draft } });
    expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  }
  fireEvent.change(rate, { target: { value: '8.5e1' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  fireEvent.change(hours, { target: { value: '20' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  for (const draft of ['', '81']) {
    fireEvent.change(hours, { target: { value: draft } });
    expect(workspaceSaveStatus()).toHaveTextContent(/^Check inputs$/);
  }
  fireEvent.change(hours, { target: { value: '17' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open']);
  expect(requests).toHaveLength(0);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('a replayed create receipt for a newer head stays neutral until that exact saved content is opened', async () => {
  const replayed = savedArtifact({ version: 4, revision: 3, headRevision: 3 });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValueOnce({ artifact: replayed })
    .mockResolvedValueOnce({ items: [replayed], nextCursor: null }).mockResolvedValueOnce(revisionOpen(replayed, 20));
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled());
  expect(window.__orbMessages()[1].savedArtifact).toEqual(replayed);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 3$/));
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'save', 'list', 'open']);
});

test('a confirmed baseline and a later draft survive SPA remount without another save or Open', async () => {
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ artifact: savedArtifact() });
  const state = workspace(initialState([record(1)], id(1))), view = state.mount();
  await screen.findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  fireEvent.change(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '23' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  view.unmount();
  render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  const restored = await within(activeWorkspace()).findByRole('spinbutton', { name: 'Hours' });
  expect(restored).toHaveValue(23);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  fireEvent.change(restored, { target: { value: '17' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'save']);
  expect(requests).toHaveLength(0);
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test.each([
  ['saved_work_conflict', 409, 'Save status unknown'],
  ['saved_work_not_found', 404, 'Not saved'],
  ['saved_work_unavailable', 503, 'Save status unknown'],
  ['saved_work_invalid', undefined, 'Save status unknown'],
])('a correlated %s mutation response cannot leave the visible copy confidently saved', async (code, status, label) => {
  const artifact = savedArtifact();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce(savedVisual(artifact))
    .mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockRejectedValueOnce(Object.assign(new Error('Mutation could not be confirmed'), { code, status }));
  const state = workspace(), view = state.mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Project price' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New name' }), { target: { value: 'Client estimate' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Project price' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh list' })).toBeEnabled());
  expect(workspaceSaveStatus().textContent).toBe(label);
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  view.unmount();
  state.mount();
  await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus().textContent).toBe(label);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list', 'rename']);
});

test('a failed library read leaves a previously confirmed visible revision intact', async () => {
  const artifact = savedArtifact();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce(savedVisual(artifact))
    .mockRejectedValueOnce(Object.assign(new Error('List unavailable'), { code: 'saved_work_unavailable', status: 503 }));
  workspace().mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  expect(screen.getByRole('alert')).toHaveTextContent('Saved work is not available yet.');
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list']);
});

test('Open restores original research evidence with a fresh reusable reference and leaves the draft intact', async () => {
  const original = researchState().orb.messages[3];
  const artifact = savedArtifact({ kind: 'research', title: 'Saved coastal research' });
  const metadata = { ...original.researchReference, researchId: 'c'.repeat(48), briefId: 'd'.repeat(32) };
  const result = { artifact, content: { schemaVersion: 1, kind: 'research', question: 'Research coastal evidence.',
    asOf: metadata.asOf, localDate: metadata.localDate, timeZone: metadata.timeZone,
    report: original.researchDetails, brief: original.researchBrief }, reference: { kind: 'research', research: metadata } };
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null }).mockResolvedValueOnce(result);
  workspace().mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Saved coastal research', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const brief = within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' });
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  fireEvent.change(within(brief).getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '1' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(within(brief).getByRole('link', { name: 'Source 2: Fictional source 2' })).toHaveAttribute('href', 'https://example.org/source-2');
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  expect(screen.queryByRole('group', { name: 'Selected research reference' })).not.toBeInTheDocument();
  const imported = window.__orbMessages()[0];
  expect(imported.researchDetails).toEqual(original.researchDetails);
  expect(imported.researchBrief.asOf).toBe(original.researchBrief.asOf);
  expect(imported.researchReference).toEqual(metadata);
  fireEvent.click(within(brief).getByRole('button', { name: 'Use this finding' }));
  send('Explain the saved second finding.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].request.researchContext).toEqual({ researchId: 'c'.repeat(48),
    selector: { type: 'finding', briefId: 'd'.repeat(32), index: 1 } });
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('a failed local Open at message capacity preserves every previous message and live report state', async () => {
  const initial = researchState();
  for (let index = 5; index <= 24; index++) initial.orb.messages.push({ id: `${index % 2 ? 'user' : 'assistant'}-${index}`,
    role: index % 2 ? 'user' : 'assistant', content: `Retained message ${index}.`, status: 'complete' });
  initial.orb.counter = 24;
  const state = workspace(initial), visualRef = React.createRef();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [savedArtifact()], nextCursor: null }).mockResolvedValueOnce(savedVisual());
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open research: Coastal evidence' }));
  const brief = within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' });
  fireEvent.change(within(brief).getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '1' } });
  const before = window.__orbMessages();
  jest.spyOn(visualRef.current, 'importSavedVisual').mockReturnValue(false);
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened in the current conversation');
  expect(window.__orbMessages()).toEqual(before);
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBe(brief);
  expect(within(brief).getByRole('combobox', { name: 'Choose a finding' })).toHaveDisplayValue('Finding 2 of 2');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
});

test('a late saved Open cannot override a newer workspace choice', async () => {
  let finish;
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [savedArtifact()], nextCursor: null })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = workspace(researchState()), visualRef = React.createRef();
  render(<Harness navigation={state.navigation} visualRef={visualRef} />);
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  act(() => visualRef.current.activateResearchSurface(visualRef.current.researchRecords.get('assistant-4'), { explicit: true, view: 'expanded' }));
  await act(async () => finish(savedVisual()));
  expect(screen.getByRole('alert')).toHaveTextContent('could not be opened in the current conversation');
  expect(within(activeWorkspace()).getByRole('region', { name: 'Coastal evidence' })).toBeVisible();
  expect(window.__orbMessages()).toHaveLength(4);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('unavailable durable storage never creates a local success or changes the current component', async () => {
  requestMetabloomSavedWork.mockRejectedValue(Object.assign(new Error('Unavailable'), { code: 'saved_work_unavailable' }));
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  await openSavedPanel();
  expect(screen.getByRole('alert')).toHaveTextContent('Saved work is not available yet.');
  expect(screen.getByRole('button', { name: 'Save current work' })).toBeDisabled();
  expect(window.__orbMessages()[1]).not.toHaveProperty('savedArtifact');
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(within(frame).getByText('1,445 CAD')).toBeInTheDocument();
});

const associatedState = (artifact = savedArtifact()) => {
  const state = initialState([record(1)], id(1));
  state.orb.messages[1].savedArtifact = artifact;
  return state;
};
const revisionOpen = (artifact, hours, handle = 'f') => {
  const result = savedVisual(artifact);
  result.content.scenario.inputs.hours = hours;
  result.reference.offer.id = handle.repeat(48);
  result.reference.artifactVersion = handle.repeat(32);
  return result;
};

test('Save changes and Undo append confirmed revisions while keeping the separately selected message context frozen', async () => {
  const original = savedArtifact(), changed = savedArtifact({ version: 2, revision: 2, headRevision: 2 });
  const undone = savedArtifact({ version: 3, revision: 3, headRevision: 3 });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [original], nextCursor: null })
    .mockResolvedValueOnce({ artifact: changed, undo: { artifactId: original.artifactId, revision: 1, expectedVersion: 2 } })
    .mockResolvedValueOnce(revisionOpen(changed, 20))
    .mockResolvedValueOnce({ artifact: undone, undo: { artifactId: original.artifactId, revision: 2, expectedVersion: 3 } })
    .mockRejectedValueOnce(Object.assign(new Error('Undo reference unavailable'), { code: 'saved_work_unavailable' }))
    .mockResolvedValueOnce(revisionOpen(undone, 17, 'e'));
  workspace(associatedState()).mount();
  const originalFrame = await screen.findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  fireEvent.click(within(originalFrame).getByRole('button', { name: 'Ask about this scenario' }));
  fireEvent.change(within(originalFrame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep my question about the earlier 17 hours' } });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue editing' })).toBeEnabled());
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Changes saved as revision 2. This revision is now open.');
  expect(requestMetabloomSavedWork.mock.calls[1][0]).toEqual({ action: 'revise', artifactId: original.artifactId, expectedVersion: 1,
    source: { kind: 'visual', id: id(1), artifactVersion: version(1) }, scenario: { inputs: { hours: 20, rate: 85 } } });
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  expect(window.__orbMessages().find(message => message.id === 'assistant-2').savedArtifact).toMatchObject({ version: 2, revision: 1, headRevision: 2 });
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(changed);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 2$/);
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  fireEvent.click(screen.getByRole('button', { name: 'Undo last saved change' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry open' })).toBeEnabled());
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'restore', artifactId: original.artifactId, revision: 1, expectedVersion: 2 });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 2$/);
  expect(within(activeWorkspace()).getByText('Working from revision 2 · Latest 3')).toBeVisible();
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  fireEvent.click(screen.getByRole('button', { name: 'Retry open' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Undo saved as revision 3. This revision is now open.'));
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(undone);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 3$/);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'revise', 'open', 'restore', 'open', 'open']);
  expect(screen.getByRole('textbox')).toHaveValue('Keep my question about the earlier 17 hours');
  fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
  await waitFor(() => expect(document.querySelector('.metabloom-component-workspace__body')).toHaveFocus());
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('a confirmed revision with failed Open preserves the visible work and retries only hydration', async () => {
  const changed = savedArtifact({ version: 2, revision: 2, headRevision: 2 });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [savedArtifact()], nextCursor: null })
    .mockResolvedValueOnce({ artifact: changed, undo: { artifactId: changed.artifactId, revision: 1, expectedVersion: 2 } })
    .mockRejectedValueOnce(Object.assign(new Error('Reference hydration failed'), { code: 'saved_work_unavailable' }))
    .mockResolvedValueOnce(revisionOpen(changed, 20));
  workspace(associatedState()).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry open' })).toBeEnabled());
  expect(screen.getByRole('alert')).toHaveTextContent('Revision 2 is saved, but it could not be opened.');
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(window.__orbMessages()[1].savedArtifact).toMatchObject({ version: 2, revision: 1, headRevision: 2 });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  expect(screen.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Undo last saved change' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry open' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue editing' })).toBeEnabled());
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'revise', 'open', 'open']);
  expect(requestMetabloomSavedWork.mock.calls[3][0]).toEqual({ action: 'open', artifactId: changed.artifactId, revision: 2 });
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(changed);
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 2$/);
});

test('History opens an exact earlier revision without changing the saved head and labels the older working copy', async () => {
  const head = savedArtifact({ version: 4, revision: 3, headRevision: 3 });
  const historical = { ...head, revision: 1 };
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce(revisionOpen(head, 25, 'e'))
    .mockResolvedValueOnce({ items: [head], nextCursor: null })
    .mockResolvedValueOnce({ artifact: head, items: [3, 2, 1].map(revision => ({ revision, createdAt: head.createdAt })), nextBeforeRevision: null })
    .mockResolvedValueOnce(revisionOpen(historical, 17));
  workspace().mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 3$/));
  const currentFrame = within(activeWorkspace()).getByRole('region', { name: calculator.title });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'History of Project price' }));
  const history = await screen.findByRole('region', { name: 'History of Project price' });
  fireEvent.click(within(history).getByRole('button', { name: 'Open revision 1 of Project price' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  const frame = within(activeWorkspace()).getByRole('region', { name: calculator.title });
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(within(activeWorkspace()).getByText('Working from revision 1 · Latest 3')).toBeVisible();
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(historical);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list', 'history', 'open']);
  expect(requestMetabloomSavedWork.mock.calls[4][0]).toEqual({ action: 'open', artifactId: head.artifactId, revision: 1 });
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  expect(within(activeWorkspace()).getByText('Working from revision 1 · Latest 3')).toBeVisible();
  const picker = within(activeWorkspace()).getByRole('combobox', { name: 'Components in this conversation' });
  fireEvent.change(picker, { target: { value: 'e'.repeat(48) } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 3$/);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(currentFrame);
  expect(within(currentFrame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(25);
  fireEvent.change(picker, { target: { value: 'f'.repeat(48) } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
});

test('confirmed Rename updates association metadata and Delete detaches it while retaining the live component', async () => {
  const renamed = savedArtifact({ title: 'Client estimate', version: 2 });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValueOnce({ artifact: savedArtifact() })
    .mockResolvedValueOnce({ items: [savedArtifact()], nextCursor: null })
    .mockResolvedValueOnce({ artifact: renamed })
    .mockResolvedValueOnce({ artifactId: renamed.artifactId, version: 2, deleted: true });
  workspace(initialState([record(1)], id(1))).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save current work' }));
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Rename Project price' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New name' }), { target: { value: renamed.title } });
  fireEvent.submit(screen.getByRole('form', { name: 'Rename Project price' }));
  await screen.findByRole('button', { name: 'Rename Client estimate' });
  expect(window.__orbMessages()[1].savedArtifact).toEqual(renamed);
  expect(within(activeWorkspace()).getByRole('heading', { name: 'Client estimate' })).toBeInTheDocument();
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Client estimate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved copy' }));
  await waitFor(() => expect(window.__orbMessages()[1]).not.toHaveProperty('savedArtifact'));
  expect(requestMetabloomSavedWork.mock.calls[4][0]).toEqual({ action: 'delete', artifactId: renamed.artifactId, expectedVersion: 2 });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  expect(window.__orbMessages()[1]).not.toHaveProperty('savedWorkBaseline');
  expect(screen.queryByRole('button', { name: 'Save changes', exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(within(activeWorkspace()).getByRole('heading', { name: 'Project price' })).toBeInTheDocument();
});

test('Delete clears the saved status of every open copy without discarding either live scenario', async () => {
  const artifact = savedArtifact();
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce(revisionOpen(artifact, 17, 'e'))
    .mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce(revisionOpen(artifact, 17))
    .mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce({ artifactId: artifact.artifactId, version: 1, deleted: true });
  workspace().mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const firstHours = await within(activeWorkspace()).findByRole('spinbutton', { name: 'Hours' });
  fireEvent.change(firstHours, { target: { value: '20' } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Unsaved changes$/);
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/));
  const secondHours = within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project price' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved copy' }));
  await waitFor(() => expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/));
  expect(window.__orbMessages().every(message => !message.savedArtifact && !message.savedWorkBaseline)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toBe(secondHours);
  expect(secondHours).toHaveValue(17);
  fireEvent.change(screen.getByRole('combobox', { name: 'Components in this conversation' }), { target: { value: 'e'.repeat(48) } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Not saved$/);
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toBe(firstHours);
  expect(firstHours).toHaveValue(20);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list', 'open', 'list', 'delete']);
});

test('cancelling Delete keeps confirmation, but closing after dispatch leaves the preserved copy neutral', async () => {
  const artifact = savedArtifact();
  let finishDelete;
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockResolvedValueOnce(savedVisual(artifact))
    .mockResolvedValueOnce({ items: [artifact], nextCursor: null })
    .mockImplementationOnce(() => new Promise(resolve => { finishDelete = resolve; }));
  workspace().mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Open Project price', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Saved work' })).not.toBeInTheDocument());
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  await openWorkspaceSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project price' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep saved copy' }));
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list']);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Project price' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved copy' }));
  await waitFor(() => expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(4));
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(artifact);
  await act(async () => finishDelete({ artifactId: artifact.artifactId, version: 1, deleted: true }));
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(artifact);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(requestMetabloomSavedWork.mock.calls.map(([request]) => request.action)).toEqual(['list', 'open', 'list', 'delete']);
});

test('restoring another saved item cannot relabel or replace active work when its subsequent Open fails', async () => {
  const other = savedArtifact({ artifactId: '00000000-0000-4000-8000-000000000002', title: 'Another estimate', version: 3, revision: 3, headRevision: 3 });
  const restored = { ...other, version: 4, revision: 4, headRevision: 4 };
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [savedArtifact(), other], nextCursor: null })
    .mockResolvedValueOnce({ artifact: other, items: [{ revision: 1, createdAt: other.createdAt }], nextBeforeRevision: null })
    .mockResolvedValueOnce({ artifact: restored, undo: { artifactId: other.artifactId, revision: 3, expectedVersion: 4 } })
    .mockRejectedValueOnce(new Error('No fresh reference available'));
  workspace(associatedState()).mount();
  const frame = await screen.findByRole('region', { name: calculator.title });
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'History of Another estimate' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore revision 1 of Another estimate' }));
  expect(screen.getByRole('button', { name: 'Cancel restore' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Restore as current' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry open' })).toBeEnabled());
  expect(window.__orbMessages()[1].savedArtifact).toEqual(savedArtifact());
  expect(workspaceSaveStatus()).toHaveTextContent(/^Save status unknown$/);
  expect(within(activeWorkspace()).getByRole('region', { name: calculator.title })).toBe(frame);
  expect(screen.getByRole('region', { name: 'Confirmed revision' })).toHaveTextContent('Another estimate');
  expect(requestMetabloomSavedWork.mock.calls[2][0]).toEqual({ action: 'restore', artifactId: other.artifactId, revision: 1, expectedVersion: 3 });
});

test('retrying a captured Save after restoring different work associates only the original message', async () => {
  const other = savedArtifact({ artifactId: '00000000-0000-4000-8000-000000000002', title: 'Another estimate', version: 3, revision: 3, headRevision: 3 });
  const restored = { ...other, version: 4, revision: 4, headRevision: 4 };
  const savedCopy = savedArtifact({ artifactId: '00000000-0000-4000-8000-000000000003' });
  requestMetabloomSavedWork.mockResolvedValueOnce({ items: [savedArtifact(), other], nextCursor: null })
    .mockRejectedValueOnce(Object.assign(new Error('Unconfirmed save'), { code: 'saved_work_timeout' }))
    .mockResolvedValueOnce({ artifact: other, items: [{ revision: 1, createdAt: other.createdAt }], nextBeforeRevision: null })
    .mockResolvedValueOnce({ artifact: restored, undo: { artifactId: other.artifactId, revision: 3, expectedVersion: 4 } })
    .mockResolvedValueOnce(revisionOpen(restored, 9))
    .mockResolvedValueOnce({ artifact: savedCopy })
    .mockRejectedValueOnce(Object.assign(new Error('No content change'), { code: 'saved_work_invalid' }));
  workspace(associatedState()).mount();
  await openSavedPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save as new', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'History of Another estimate' })).toBeEnabled());
  const captured = requestMetabloomSavedWork.mock.calls[1][0];
  fireEvent.click(screen.getByRole('button', { name: 'History of Another estimate' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore revision 1 of Another estimate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore as current' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue editing' })).toBeEnabled());
  const current = screen.getByRole('region', { name: 'Current work' });
  expect(current).toHaveTextContent('Another estimate');
  expect(within(current).getByRole('button', { name: 'Save as new', exact: true })).toBeDisabled();
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(9);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 4$/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry captured save: Project price', exact: true }));
  await waitFor(() => expect(window.__orbMessages().find(message => message.id === 'assistant-2').savedArtifact).toEqual(savedCopy));
  expect(requestMetabloomSavedWork.mock.calls[5][0]).toEqual(captured);
  expect(window.__orbMessages().at(-1).savedArtifact).toEqual(restored);
  expect(within(activeWorkspace()).getByRole('heading', { name: 'Another estimate' })).toBeInTheDocument();
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(9);
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 4$/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save changes', exact: true }));
  await waitFor(() => expect(requestMetabloomSavedWork).toHaveBeenCalledTimes(7));
  expect(requestMetabloomSavedWork.mock.calls[6][0]).toMatchObject({ action: 'revise', artifactId: other.artifactId,
    expectedVersion: 4, source: { id: 'f'.repeat(48) }, scenario: { inputs: { hours: 9, rate: 85 } } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This content could not be saved as a new revision.'));
  fireEvent.click(screen.getByRole('button', { name: 'Close saved work' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Components in this conversation' }), { target: { value: id(1) } });
  expect(workspaceSaveStatus()).toHaveTextContent(/^Saved · Revision 1$/);
  expect(within(activeWorkspace()).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
});
