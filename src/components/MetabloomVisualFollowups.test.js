import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import MetabloomVisuals from './MetabloomVisuals';
import { postMetabloomTool } from './metabloomToolClient';
import { requestMetabloomVisual } from './metabloomVisualApiClient';

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
const mapHistory = [{ role: 'user', content: 'Show me a map of Kelowna BC.' },
  { role: 'assistant', content: 'Done. The map, PNG and heatmap are displayed.' }];
const chartHistory = [{ role: 'user', content: 'Create a pie chart: apples 75, crust 20, sugar 5.' },
  { role: 'assistant', content: 'Done. Say next and I will display more charts.' }];

beforeEach(() => {
  postMetabloomTool.mockReset().mockImplementation(() => new Promise(() => {}));
  requestMetabloomVisual.mockReset();
});
afterEach(() => { cleanup(); delete window.__orbMessages; });

function start(message, history = []) {
  const controller = new AbortController();
  const ref = React.createRef();
  window.__orbMessages = () => [{ id: 'user-1', role: 'user', content: message }];
  render(<div className="orb-page">
    <article data-message-id="user-1"><div className="metabloom-chat__bubble">{message}</div></article>
    <MetabloomVisuals ref={ref} />
  </div>);
  const event = new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'followup-1', message, history, actionMode: 'auto', signal: controller.signal,
    claim: jest.fn(), respond: jest.fn(), onToolActivity: jest.fn(),
  } });
  act(() => window.dispatchEvent(event));
  return { event, controller, ref };
}

test.each([
  ['What else can you do with gen UI?', []],
  ['Show me a map of Kelowna BC.', []],
  ["i shouldn't have to, just pick yourself please", mapHistory],
  ["let's do all three one at a time", mapHistory],
  ['i want it visible in the gen ui', mapHistory],
  ['lets go', mapHistory],
  ['nope', mapHistory],
  ["i don't see any of that", mapHistory],
  ['next', chartHistory],
])('a capability, unsupported, status or generic confirmation turn stays on the ordinary deterministic response path: %s', (message, history) => {
  const { event } = start(message, history);
  expect(event.defaultPrevented).toBe(false);
  expect(event.detail.claim).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('an explicit supported repeat is claimed once and preserves the original message and user history for the shared server resolver', () => {
  const message = 'Render that pie chart again.';
  const { event, controller } = start(message, chartHistory);
  expect(event.defaultPrevented).toBe(true);
  expect(event.detail.claim).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledTimes(1);
  expect(postMetabloomTool).toHaveBeenCalledWith({ phase: 'start', message, history: chartHistory, requestId: 'followup-1' }, { signal: controller.signal });
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('a new user topic prevents an old supported component from being repeated', () => {
  const { event } = start('Render that pie chart again.', [...chartHistory, { role: 'user', content: 'Now tell me about travel.' }]);
  expect(event.defaultPrevented).toBe(false);
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('only a ready element connected to the active Orb root produces mounted evidence', () => {
  const { ref } = start('Hello.');
  const finish = jest.fn();
  ref.current.finishTool = finish;
  const slot = document.createElement('div');
  slot.innerHTML = '<section class="metabloom-visual" data-visual-state="ready"></section>';
  const record = { mode: 'tool', status: 'ready', continuing: false, slot };
  ref.current.ready(record);
  expect(finish).toHaveBeenLastCalledWith(record, 'unknown');
  document.body.appendChild(slot);
  ref.current.ready(record);
  expect(finish).toHaveBeenLastCalledWith(record, 'unknown');
  ref.current.root.appendChild(slot);
  ref.current.ready(record);
  expect(finish).toHaveBeenLastCalledWith(record, 'mounted');
  slot.remove();
  ref.current.ready(record);
  expect(finish).toHaveBeenLastCalledWith(record, 'unknown');
});
