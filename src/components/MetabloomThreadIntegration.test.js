import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import MetabloomVisuals from './MetabloomVisuals';
import MetabloomWorkspaceContext from './MetabloomWorkspaceContext';
import MetabloomThreadsPanel from './MetabloomThreadsPanel';
import useMetabloomThreads from './useMetabloomThreads';
import { parseMetabloomThreadSnapshot, parseMetabloomThreadRequest, parseMetabloomThreadResponse } from './metabloomThreadProtocol';
import { requestMetabloomVisual } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';

jest.mock('./MetabloomModelPicker', () => require('../testHelpers/MetabloomModelPickerStub'));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));

const originalTextEncoder = global.TextEncoder;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const originalMedia = window.matchMedia;
const originalWidth = window.innerWidth;
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const copy = value => JSON.parse(JSON.stringify(value));
const sourceId = number => String(number).repeat(48);
const artifactVersion = number => String(number).repeat(32);
const calculator = number => ({ version: '1', designVersion: 'aetheris-1', kind: 'calculator',
  title: number === 1 ? 'Project price' : 'Alternate price', summary: 'Fictional project values.',
  provenance: { type: 'user', label: 'Supplied fictional values.', sourceIds: [] }, unit: 'CAD',
  controls: [{ id: 'hours', label: 'Hours', unit: '', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD', min: 10, max: 200, step: 5, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' });
const snapshot = (number = 1) => ({ schemaVersion: 1, conversation: {
  messages: [{ id: 'user-1', role: 'user', content: `Prepare estimate ${number}.`, status: 'complete', segments: [], actionChain: [] },
    { id: 'assistant-2', role: 'assistant', content: `Estimate ${number} is ready.`, status: 'complete', segments: [], actionChain: [] }],
  counter: 2, draft: `Review estimate ${number} with me.`, deepResearch: false, expressiveness: 0.8,
  allowEmoteChanges: false, paused: false, responseSource: 'interface', interrupted: false,
  unavailableResearchIds: [], researchAttachment: null,
  artifactAttachment: { reference: { id: sourceId(number), version: artifactVersion(number),
    selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } },
  label: 'Captured estimate', summary: 'Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD' },
}, visuals: { version: 1, records: [{ id: sourceId(number), kind: 'calculator', mode: 'tool',
  userId: 'user-1', replyId: 'assistant-2', expiresAt: Date.now() + 600000, status: 'ready',
  spec: calculator(number), sources: [], viewState: { inputs: { hours: number === 1 ? '17' : '24', rate: '85' } },
  artifactVersion: artifactVersion(number) }], lastInteractedId: sourceId(number),
activeVisualId: sourceId(number), workspaceView: 'expanded' }, workspace: null });
const metadata = (number = 1) => ({ threadId: uuid(number), title: number === 1 ? 'Budget review' : 'Delivery options',
  version: 1, createdAt: '2026-11-04T10:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z', messageCount: 2 });

function Surface({ threads, visualRef, onConversationStateChange }) {
  const [controller, setController] = React.useState(null);
  const ready = React.useCallback(value => {
    setController(value);
    return () => setController(current => current === value ? null : current);
  }, []);
  return <AppNavigationContext.Provider value={threads.navigation}>
    <MetabloomWorkspaceContext.Provider value={controller}>
      <OrbSection isActive threadSession={threads.session} threadBusy={threads.busy}
        threadPanel={<MetabloomThreadsPanel {...threads.panelProps} />}
        onShowThreads={() => threads.setExpanded(true)} onConversationStateChange={onConversationStateChange} />
      <MetabloomVisuals navigation={threads.navigation} threadSession={threads.session}
        ref={visualRef} onWorkspaceReady={ready} />
    </MetabloomWorkspaceContext.Provider>
  </AppNavigationContext.Provider>;
}
function Harness({ navigation, request, visualRef, threadRef }) {
  const threads = useMetabloomThreads({ navigation, request, enabled: true });
  const [started, setStarted] = React.useState(false);
  threadRef.current = threads;
  return <div className="orb-page" data-thread-history-enabled="true" data-thread-history={threads.expanded ? 'open' : 'closed'}
    data-conversation-started={started ? 'true' : 'false'}>
    <Surface key={threads.session.key} threads={threads} visualRef={visualRef} onConversationStateChange={setStarted} />
  </div>;
}

async function fixture({ cached = false, mobile = false, failOpen = false } = {}) {
  const records = new Map([1, 2].map(number => [uuid(number), { thread: metadata(number), snapshot: snapshot(number) }]));
  for (const record of records.values()) expect(parseMetabloomThreadSnapshot(record.snapshot)).not.toBeNull();
  const cache = new Map();
  if (cached) {
    const saved = records.get(uuid(1));
    cache.set('orbThreads', { id: saved.thread.threadId, thread: copy(saved.thread),
      snapshot: copy(saved.snapshot), confirmedSnapshot: copy(saved.snapshot), expanded: true });
  }
  const navigation = { getToolState: key => cache.get(key), saveToolState: jest.fn((key, value) => cache.set(key, value)) };
  let timestamp = 0;
  const request = jest.fn(async input => {
    const parsed = parseMetabloomThreadRequest(input);
    if (!parsed) throw new Error(`Invalid fictional ${input.action} request`);
    let response;
    if (parsed.action === 'list') response = { items: [...records.values()].map(record => copy(record.thread)) };
    else if (parsed.action === 'open') {
      if (failOpen) throw Object.assign(new Error('Fictional failed load'), { code: 'threads_unavailable' });
      response = copy(records.get(parsed.threadId));
    } else if (parsed.action === 'save' || parsed.action === 'rename') {
      const previous = records.get(parsed.threadId);
      const thread = { ...(previous?.thread || metadata()), threadId: parsed.threadId, title: parsed.title,
        version: (previous?.thread.version || 0) + 1,
        updatedAt: new Date(Date.parse('2026-11-04T10:00:00.000Z') + ++timestamp * 1000).toISOString(),
        messageCount: parsed.snapshot?.conversation.messages.length ?? previous.thread.messageCount };
      records.set(thread.threadId, { thread, snapshot: copy(parsed.snapshot || previous.snapshot) });
      response = { thread: copy(thread) };
    } else throw new Error(`Unexpected fictional request: ${parsed.action}`);
    const result = parseMetabloomThreadResponse(parsed, response);
    if (!result) throw new Error(`Invalid fictional ${parsed.action} response`);
    return result;
  });
  window.innerWidth = mobile ? 390 : 1440;
  window.matchMedia = query => ({ matches: query.includes('min-width: 1100') ? !mobile
    : query.includes('max-width: 900') ? mobile : false, addEventListener() {}, removeEventListener() {} });
  const visualRef = React.createRef(), threadRef = React.createRef();
  let view;
  await act(async () => {
    view = render(<Harness navigation={navigation} request={request} visualRef={visualRef} threadRef={threadRef} />);
  });
  return { ...view, cache, navigation, request, records, visualRef, threadRef };
}
const composer = () => screen.getByRole('textbox', { name: 'Message Metabloom', exact: true });
const currentWork = () => screen.getByRole('region', { name: 'Current component' });
const openHistory = async mobile => {
  const trigger = screen.queryByRole('button', { name: mobile ? 'Chats' : 'Expand chats', exact: true });
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh chats' })).toBeEnabled());
};
const noGeneration = () => {
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(window.__metabloomRequest).not.toHaveBeenCalled();
};

beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
beforeEach(() => {
  let number = 100;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => uuid(++number) } });
  requestMetabloomVisual.mockReset(); postMetabloomTool.mockReset();
  window.__metabloomRequest = jest.fn(() => new Promise(() => {}));
});
afterEach(() => {
  cleanup(); jest.restoreAllMocks();
  delete window.__metabloomRequest;
  window.matchMedia = originalMedia;
  window.innerWidth = originalWidth;
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else delete globalThis.crypto;
});

test('opening a persisted calculator restores its exact messages, draft, captured context and dedicated workspace without generation', async () => {
  const state = await fixture();
  await openHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Budget review' }));
  const frame = await screen.findByRole('region', { name: 'Project price' });
  expect(currentWork()).toContainElement(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  expect(within(frame).getByRole('spinbutton', { name: /^Hourly rate/ })).toHaveValue(85);
  expect(within(frame).getByText('1,445 CAD')).toBeInTheDocument();
  expect(screen.getByText('Estimate 1 is ready.')).toBeInTheDocument();
  expect(composer()).toHaveValue('Review estimate 1 with me.');
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Result: 1,445 CAD');
  expect(frame.closest('.metabloom-chat__messages')).toBeNull();
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  expect(state.request.mock.calls.filter(([input]) => input.action === 'open').map(([input]) => input.threadId)).toEqual([uuid(1)]);
  noGeneration();
});

test('editing only a restored calculator autosaves the coherent thread snapshot and preserves a frozen attachment', async () => {
  const state = await fixture({ cached: true });
  const frame = await within(currentWork()).findByRole('region', { name: 'Project price' });
  await openHistory();
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  expect(within(frame).getByText('1,700 CAD')).toBeInTheDocument();
  await waitFor(() => expect(state.request.mock.calls.some(([input]) => input.action === 'save')).toBe(true), { timeout: 3500 });
  const saved = state.request.mock.calls.find(([input]) => input.action === 'save')[0];
  expect(saved).toMatchObject({ threadId: uuid(1), expectedVersion: 1, title: 'Budget review' });
  expect(saved.snapshot.visuals.records).toHaveLength(1);
  expect(saved.snapshot.visuals.records[0].viewState.inputs).toEqual({ hours: '20', rate: '85' });
  expect(saved.snapshot.conversation.artifactAttachment.reference.inputs).toEqual({ hours: 17, rate: 85 });
  expect(saved.snapshot.conversation.draft).toBe('Review estimate 1 with me.');
  expect(saved.snapshot.conversation.messages.map(message => message.content)).toEqual(['Prepare estimate 1.', 'Estimate 1 is ready.']);
  expect(saved.snapshot.visuals.activeVisualId).toBe(sourceId(1));
  expect(parseMetabloomThreadSnapshot(saved.snapshot)).not.toBeNull();
  expect(within(currentWork()).getByRole('region', { name: 'Project price' })).toBe(frame);
  noGeneration();
});

test('New chat saves the outgoing edits, remounts both owners and restores the saved thread on Open', async () => {
  const state = await fixture({ cached: true });
  const frame = await within(currentWork()).findByRole('region', { name: 'Project price' });
  const firstController = state.visualRef.current;
  const firstComposer = composer();
  await openHistory();
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  fireEvent.change(firstComposer, { target: { value: 'Keep this unfinished question.' } });
  fireEvent.click(screen.getByRole('button', { name: 'New chat', exact: true }));
  await waitFor(() => expect(composer()).not.toBe(firstComposer));
  expect(state.visualRef.current).not.toBe(firstController);
  expect(firstController.mounted).toBe(false);
  expect(frame.isConnected).toBe(false);
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(0);
  expect(composer()).toHaveValue('');
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(window.__orbMessages()).toEqual([]);
  const saved = state.records.get(uuid(1)).snapshot;
  expect(saved.visuals.records[0].viewState.inputs.hours).toBe('20');
  expect(saved.conversation.draft).toBe('Keep this unfinished question.');
  expect(state.request.mock.calls.filter(([input]) => input.action === 'save')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Budget review' }));
  const returned = await screen.findByRole('region', { name: 'Project price' });
  expect(currentWork()).toContainElement(returned);
  expect(returned).not.toBe(frame);
  expect(within(returned).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  expect(within(returned).getByText('1,700 CAD')).toBeInTheDocument();
  expect(composer()).toHaveValue('Keep this unfinished question.');
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Result: 1,445 CAD');
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  noGeneration();
});

test('history collapse and expansion preserve the exact draft, invalid calculator field and controller', async () => {
  const state = await fixture({ cached: true });
  const frame = await within(currentWork()).findByRole('region', { name: 'Project price' });
  const hours = within(frame).getByRole('spinbutton', { name: 'Hours' });
  const input = composer(), controller = state.visualRef.current;
  await openHistory();
  fireEvent.change(hours, { target: { value: '' } });
  fireEvent.change(input, { target: { value: 'Still writing\nThis line is unfinished' } });
  fireEvent.click(screen.getByRole('button', { name: 'Collapse chats' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand chats' }));
  expect(composer()).toBe(input);
  expect(input).toHaveValue('Still writing\nThis line is unfinished');
  expect(within(currentWork()).getByRole('spinbutton', { name: 'Hours' })).toBe(hours);
  expect(hours).toHaveValue(null);
  expect(state.visualRef.current).toBe(controller);
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent('Result: 1,445 CAD');
  noGeneration();
});

test('renaming and refreshing metadata do not remount the active conversation or artifact', async () => {
  const state = await fixture({ cached: true });
  const frame = await within(currentWork()).findByRole('region', { name: 'Project price' });
  const input = composer(), controller = state.visualRef.current;
  await openHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Budget review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Chat title' }), { target: { value: 'Renamed budget' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }));
  await screen.findByRole('button', { name: 'Open chat: Renamed budget' });
  expect(composer()).toBe(input);
  expect(within(currentWork()).getByRole('region', { name: 'Project price' })).toBe(frame);
  expect(state.visualRef.current).toBe(controller);
  state.records.get(uuid(2)).thread.title = 'Updated delivery title';
  fireEvent.click(screen.getByRole('button', { name: 'Refresh chats' }));
  await screen.findByRole('button', { name: 'Open chat: Updated delivery title' });
  expect(composer()).toBe(input);
  expect(state.visualRef.current).toBe(controller);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(17);
  noGeneration();
});

test('a failed destination load keeps the current live thread, saved outgoing edits and source ownership', async () => {
  const state = await fixture({ cached: true, failOpen: true });
  const frame = await within(currentWork()).findByRole('region', { name: 'Project price' });
  const input = composer(), controller = state.visualRef.current;
  await openHistory();
  fireEvent.change(within(frame).getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Delivery options' }));
  await screen.findByRole('alert');
  expect(composer()).toBe(input);
  expect(state.visualRef.current).toBe(controller);
  expect(within(currentWork()).getByRole('region', { name: 'Project price' })).toBe(frame);
  expect(within(frame).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(20);
  expect(screen.queryByRole('region', { name: 'Alternate price' })).not.toBeInTheDocument();
  expect(state.records.get(uuid(1)).snapshot.visuals.records[0].viewState.inputs.hours).toBe('20');
  expect(state.threadRef.current.session.id).toBe(uuid(1));
  expect(screen.getByRole('button', { name: 'Open chat: Budget review' })).toHaveAttribute('aria-current', 'true');
  noGeneration();
});

test('switching threads with reused message IDs never keeps the previous thread component or captured context', async () => {
  const state = await fixture({ cached: true });
  const first = await within(currentWork()).findByRole('region', { name: 'Project price' });
  const firstController = state.visualRef.current;
  await openHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Delivery options' }));
  const second = await screen.findByRole('region', { name: 'Alternate price' });
  expect(currentWork()).toContainElement(second);
  expect(first.isConnected).toBe(false);
  expect(state.visualRef.current).not.toBe(firstController);
  expect(firstController.mounted).toBe(false);
  expect(second.closest('.metabloom-visual-slot')).toHaveAttribute('data-visual-id', sourceId(2));
  expect(within(second).getByRole('spinbutton', { name: 'Hours' })).toHaveValue(24);
  expect(screen.getByText('Estimate 2 is ready.')).toBeInTheDocument();
  expect(screen.queryByText('Estimate 1 is ready.')).not.toBeInTheDocument();
  expect(state.threadRef.current.session.capture().snapshot.conversation.artifactAttachment.reference.id).toBe(sourceId(2));
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(1);
  noGeneration();
});

test('mobile Open and New close the drawer across the paired remount and focus the new composer', async () => {
  const state = await fixture({ mobile: true });
  await openHistory(true);
  expect(screen.getByRole('dialog', { name: 'Chat history' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat: Budget review' }));
  const restored = await screen.findByRole('region', { name: 'Project price' });
  expect(currentWork()).toContainElement(restored);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chat history' })).not.toBeInTheDocument());
  await waitFor(() => expect(composer()).toHaveFocus());
  const previous = composer();
  fireEvent.click(screen.getByRole('button', { name: /^More/ }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'More options' })).getByRole('button', { name: 'Saved chats' }));
  expect(screen.queryByRole('dialog', { name: 'More options' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Chat history' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'New chat', exact: true }));
  await waitFor(() => expect(composer()).not.toBe(previous));
  expect(screen.queryByRole('dialog', { name: 'Chat history' })).not.toBeInTheDocument();
  await waitFor(() => expect(composer()).toHaveFocus());
  expect(composer()).toHaveValue('');
  expect(state.threadRef.current.expanded).toBe(false);
  expect(document.querySelectorAll('.metabloom-visual')).toHaveLength(0);
  noGeneration();
});
