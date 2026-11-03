import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import MetabloomVisuals from './MetabloomVisuals';
import { requestMetabloomVisual } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const originalTextEncoder = global.TextEncoder;
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
function Harness({ navigation, visualRef }) {
  return <AppNavigationContext.Provider value={navigation}>
    <div className="orb-page"><OrbSection /><MetabloomVisuals navigation={navigation} ref={visualRef} /></div>
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
const show = title => fireEvent.click(screen.getByRole('button', { name: `Show component: ${title}` }));
let requests, originalMatchMedia;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
beforeEach(() => {
  requests = [];
  requestMetabloomVisual.mockReset(); postMetabloomTool.mockReset();
  window.__metabloomRequest = request => new Promise(finish => requests.push({ request, finish }));
  originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
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
  const records = [record(1), record(2, { ...calculator, title: 'Newer estimate' })];
  const state = workspace(initialState(records, id(1)));
  const view = render(<React.StrictMode><Harness navigation={state.navigation} /></React.StrictMode>);
  const frame = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '23' } });
  view.unmount();
  expect(state.cache.get('orbVisuals').activeVisualId).toBe(id(1));
  expect(state.cache.get('orbVisuals').records[0].viewState.inputs.hours).toBe('23');
  state.mount();
  const restored = await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  expect(within(restored).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(23);
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
  const state = workspace(initialState([record(1)], id(1))), visualRef = React.createRef();
  let current = true;
  const navigation = { ...state.navigation, saveToolState: (key, value) => { if (current) state.cache.set(key, value); } };
  const view = render(<Harness navigation={navigation} visualRef={visualRef} />);
  await within(activeWorkspace()).findByRole('region', { name: calculator.title });
  const previous = visualRef.current, previousRecord = previous.records.get(id(1));
  current = false; state.cache.clear(); view.unmount();
  expect(state.cache.size).toBe(0);
  state.mount();
  expect(previous.activateComponent(previousRecord, { explicit: true })).toBe(false);
  expect(activeWorkspace()).toBeEmptyDOMElement();
  expect(document.querySelector('.orb-page')).not.toHaveAttribute('data-active-component');
  expect(screen.queryByRole('region', { name: calculator.title })).not.toBeInTheDocument();
});
