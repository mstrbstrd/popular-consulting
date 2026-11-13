import { createMetabloomAgentLifecycle, MAX_METABLOOM_TOOL_PROGRESS } from './metabloomAgentTools';
import { createMetabloomSegmentStreamDecoder } from './metabloomEmoteProtocol';

const status = state => ({ type: 'agent_status', state });
const activity = (state, callId = 'search_1') => ({ type: 'tool_activity', name: 'search_web', callId, state });
const progress = (sequence = 1) => ({ type: 'tool_progress', name: 'search_web', callId: 'search_1', sequence, summary: 'Reading: example.com' });
const open = () => {
  const state = createMetabloomAgentLifecycle({ requireStatus: true });
  expect(state.accept(status('working'))).toBeTruthy(); expect(state.accept(activity('running'))).toBeTruthy();
  return state;
};

test('work is announced before a tool, and handoff plus validation precede the answer', () => {
  const state = createMetabloomAgentLifecycle({ requireStatus: true });
  expect(state.accept(activity('running'))).toBeNull();
  expect(state.accept(status('working'))).toBeTruthy();
  expect(state.canAnswer()).toBe(false);
  expect(state.accept(activity('running'))).toBeTruthy();
  expect(state.accept(progress())).toBeTruthy();
  expect(state.accept(activity('complete'))).toBeTruthy();
  expect(state.canAnswer()).toBe(false);
  expect(state.accept(status('validating'))).toBeNull();
  expect(state.accept(status('reviewing'))).toBeTruthy();
  expect(state.accept(status('validating'))).toBeTruthy();
  expect(state.canAnswer()).toBe(true);
  expect(state.accept(activity('running', 'new_search'))).toBeNull();
  expect(state.accept(status('reviewing'))).toBeNull();
});

test.each([
  { ...progress(), callId: 'old_request' }, { ...progress(), name: 'calculate' }, progress(2),
  { ...progress(), summary: 'Invisible\u202econtrol' }, { ...progress(), summary: 'x'.repeat(201) },
  { ...progress(), summary: '' }, { ...progress(), privateReasoning: 'No' },
])('rejects invalid, uncorrelated or out-of-order progress: %j', event => {
  const state = open();
  expect(state.accept(event)).toBeNull();
  expect(state.getState().summary).toBeNull();
});

test('progress is bounded and cannot continue after completion or failure', () => {
  for (const terminal of ['complete', 'failed']) {
    const state = open();
    for (let i = 1; i <= MAX_METABLOOM_TOOL_PROGRESS; i++) expect(state.accept(progress(i))).toBeTruthy();
    expect(state.accept(progress(MAX_METABLOOM_TOOL_PROGRESS + 1))).toBeNull();
    expect(state.accept(activity(terminal))).toBeTruthy();
    expect(state.accept(progress(1))).toBeNull();
    expect(state.getState().searchComplete).toBe(terminal === 'complete');
  }
});

test('legacy tool clients retain their contract without accepting new progress records', () => {
  const initial = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' }];
  const legacy = createMetabloomSegmentStreamDecoder({ allowTools: true });
  expect(legacy.push([...initial, status('working')].map(value => JSON.stringify(value)).join('\n') + '\n')).toBe(false);
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true });
  expect(decoder.push([...initial, activity('running')].map(value => JSON.stringify(value)).join('\n') + '\n')).toBe(false);
});

test('a successful tool alone cannot commit text on the progress protocol', () => {
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowToolProgress: true });
  const events = [{ type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' },
    status('working'), { ...activity('running'), name: 'calculate' }, { ...activity('complete'), name: 'calculate' },
    { type: 'segment', index: 0, response: 'An unchecked answer.' }];
  expect(decoder.push(events.map(value => JSON.stringify(value)).join('\n') + '\n')).toBe(false);
});
