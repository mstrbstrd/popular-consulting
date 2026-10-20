import React from 'react';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import MetabloomVisuals from './MetabloomVisuals';
import { requestMetabloomVisual } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
const message = 'Create a table of these ingredients.';
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Ingredients',
  summary: 'Provided ingredients.', provenance: { type: 'user', label: 'User inputs.', sourceIds: [] },
  columns: ['Ingredient', 'Mass'], rows: [['Apples', '500 g'], ['Sugar', '100 g']] };
const offer = { version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'table', expiresAt: Date.now() + 600000 };
let log;
beforeEach(() => {
  window.__orbMessages = () => [{ id: 'user-1', role: 'user', content: message }];
  requestMetabloomVisual.mockReset();
  postMetabloomTool.mockReset();
  log = jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { cleanup(); delete window.__orbMessages; log.mockRestore(); });
function start() {
  const controller = new AbortController();
  const respond = jest.fn(), onToolActivity = jest.fn();
  const host = render(<div className="orb-page">
    <article data-message-id="user-1"><div className="metabloom-chat__bubble">{message}</div></article>
    <MetabloomVisuals />
  </div>);
  const event = new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'mount-1', message, history: [], actionMode: 'auto', signal: controller.signal,
    claim: jest.fn(), respond, onToolActivity,
  } });
  act(() => window.dispatchEvent(event));
  return { controller, respond, onToolActivity, host, event };
}

test('a tool timeout is explained with its safe reference and does not start generation or a fallback model', async () => {
  postMetabloomTool.mockRejectedValue({ code: 'tool_timeout', status: 504, requestRef: '012345abcdef', message: 'Private provider text' });
  const { respond, onToolActivity, event } = start();
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  const answer = respond.mock.calls[0][0].segments[0].response;
  expect(answer).toContain('took too long');
  expect(answer).toContain('Code: tool_timeout. Reference: 012345abcdef.');
  expect(answer).not.toContain('Private');
  expect(onToolActivity).toHaveBeenLastCalledWith('complete');
  expect(postMetabloomTool).toHaveBeenCalledTimes(1);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('untrusted error text and malformed references never reach chat or diagnostics', async () => {
  postMetabloomTool.mockRejectedValue({ code: '<script>private</script>', requestRef: '012345abcdef\n', status: '504', message: 'Private provider text' });
  const { respond } = start();
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  const answer = respond.mock.calls[0][0].segments[0].response;
  expect(answer).toContain('Code: tool_unavailable.');
  expect(answer).not.toMatch(/Reference:|script|Private/);
  expect(log).toHaveBeenCalledWith(expect.any(String), { code: 'tool_unavailable', requestRef: null, status: null });
});

test('a continuation timeout preserves the rendered component and accurately identifies its missing explanation', async () => {
  requestMetabloomVisual.mockResolvedValue({ spec: table, sources: [] });
  postMetabloomTool.mockImplementation(({ phase }) => phase === 'start'
    ? Promise.resolve({ offer, emote: 'neutral' })
    : Promise.reject({ code: 'tool_timeout', status: 504, requestRef: '012345abcdef' }));
  const { respond } = start();
  await screen.findByRole('heading', { name: 'Ingredients' });
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  expect(respond.mock.calls[0][0].segments[0].response).toContain('The visual is ready, but its explanation timed out.');
  expect(respond.mock.calls[0][0].segments[0].response).toContain('Reference: 012345abcdef.');
  expect(screen.getByRole('table')).toHaveTextContent('500 g');
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
  expect(postMetabloomTool.mock.calls[1][0].display).toBe('mounted');
});

test('aborting while the tool request is pending keeps its late failure out of the transcript', async () => {
  let reject;
  postMetabloomTool.mockImplementation(() => new Promise((_resolve, failed) => { reject = failed; }));
  const { controller, respond } = start();
  act(() => controller.abort());
  await act(async () => reject({ code: 'tool_timeout', requestRef: '012345abcdef' }));
  expect(respond).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});
