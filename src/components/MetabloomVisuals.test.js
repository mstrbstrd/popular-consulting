import React from 'react';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import MetabloomVisuals from './MetabloomVisuals';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import { requestMetabloomVisual, METABLOOM_VISUAL_OFFER_EVENT } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Options compared', summary: 'Your supplied values.',
  provenance: { type: 'user', label: 'User-provided values.', sourceIds: [] }, columns: ['Option', 'Value'], rows: [['A', '10'], ['B', '20']] };
const calculator = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Share the total', summary: 'Calculate from your inputs.', provenance: table.provenance, controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 1, initial: 120 }, { id: 'people', label: 'People', unit: '', min: 0, max: 20, step: 1, initial: 3 }], formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
let messages;
function Host({ complete = false }) {
  return <div className="orb-page"><article data-message-id="assistant-2" data-stream-status={complete ? 'complete' : 'streaming'}><div className="metabloom-chat__bubble">The original answer.</div></article><MetabloomVisuals /></div>;
}
function startTurn(id = 'mount-1', userId = 'user-1') {
  const controller = new AbortController(); messages = [{ id: userId, role: 'user', content: 'Compare.' }];
  act(() => window.dispatchEvent(new CustomEvent('metabloom:user-message', { detail: { requestId: id, message: 'Compare.', signal: controller.signal } })));
  return { controller, detail: { requestId: id, signal: controller.signal, offer: { version: '1', designVersion: 'aetheris-1', id: 'a'.repeat(48), kind: 'table', expiresAt: Date.now() + 600000 }, reply: { segments: [{ response: 'The original answer.' }] } } };
}
function completeTurn() { messages.push({ id: 'assistant-2', role: 'assistant', content: 'The original answer.', status: 'complete' }); }
beforeEach(() => { messages = []; window.__orbMessages = () => messages.map(message => ({ ...message })); requestMetabloomVisual.mockReset(); postMetabloomTool.mockReset(); });
afterEach(() => { cleanup(); delete window.__orbMessages; document.documentElement.removeAttribute('data-theme'); });

test('waits for exact text completion and the visible scene gate before requesting a visual', async () => {
  requestMetabloomVisual.mockResolvedValue({ spec: table, sources: [] }); const host = render(<Host />); const turn = startTurn();
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  completeTurn(); host.rerender(<Host complete />);
  await screen.findByRole('heading', { name: 'Options compared' });
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(screen.getByText('The original answer.')).toBeInTheDocument();
});
test('stale requests and a different signal cannot attach to the new reply', async () => {
  requestMetabloomVisual.mockResolvedValue({ spec: table, sources: [] }); const host = render(<Host />); const old = startTurn(); startTurn('mount-2', 'user-3');
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: old.detail })));
  completeTurn(); host.rerender(<Host complete />);
  await act(async () => {}); expect(requestMetabloomVisual).not.toHaveBeenCalled();
});
test('duplicate offers and ordinary theme updates do not regenerate a ready artifact', async () => {
  requestMetabloomVisual.mockResolvedValue({ spec: table, sources: [] }); const host = render(<Host />); const turn = startTurn(); completeTurn(); host.rerender(<Host complete />);
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  await screen.findByRole('heading', { name: 'Options compared' });
  act(() => { window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })); document.documentElement.setAttribute('data-theme', 'dark'); });
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
});
test('a newer message cancels only the visual and ignores its late completion', async () => {
  let resolve; requestMetabloomVisual.mockImplementation(() => new Promise(done => { resolve = done; }));
  const host = render(<Host />); const turn = startTurn(); completeTurn(); host.rerender(<Host complete />);
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  await screen.findByRole('button', { name: 'Stop visual' });
  const signal = requestMetabloomVisual.mock.calls[0][1].signal;
  act(() => { messages.push({ id: 'user-3', role: 'user', content: 'Next.' }); window.dispatchEvent(new CustomEvent('metabloom:user-message', { detail: { requestId: 'mount-2', message: 'Next.', signal: new AbortController().signal } })); });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ spec: table, sources: [] }));
  expect(screen.queryByRole('heading', { name: 'Options compared' })).not.toBeInTheDocument();
  expect(screen.getByText('The original answer.')).toBeInTheDocument();
});
test('an independent builder failure leaves the existing answer intact', async () => {
  requestMetabloomVisual.mockRejectedValue({ code: 'visual_invalid' }); const host = render(<Host />); const turn = startTurn(); completeTurn(); host.rerender(<Host complete />);
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  await screen.findByText('The generated visual did not pass validation. Your answer is unchanged.');
  expect(screen.getByText('The original answer.')).toBeInTheDocument();
});
test('leaving the component aborts generation and removes its portal slot', async () => {
  requestMetabloomVisual.mockImplementation(() => new Promise(() => {})); const host = render(<Host />); const turn = startTurn(); completeTurn(); host.rerender(<Host complete />);
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  await waitFor(() => expect(requestMetabloomVisual).toHaveBeenCalledTimes(1)); const signal = requestMetabloomVisual.mock.calls[0][1].signal;
  host.unmount(); expect(signal.aborted).toBe(true); expect(document.querySelector('.metabloom-visual-slot')).toBeNull();
});
test('calculator inputs recompute locally, reject zero division and survive a theme change', () => {
  render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'calc', status: 'ready', spec: calculator }} /></div>);
  expect(screen.getByText('40 CAD per person')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('People'), { target: { value: '0' } });
  expect(screen.getByText('Enter valid inputs to calculate.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('People'), { target: { value: '4' } });
  act(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(screen.getByText('30 CAD per person')).toBeInTheDocument();
  expect(screen.getByLabelText('People')).toHaveValue(4); expect(requestMetabloomVisual).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset values' })); expect(screen.getByText('40 CAD per person')).toBeInTheDocument();
});

test('ambiguous concurrent Orb surfaces never claim a visual offer', async () => {
  requestMetabloomVisual.mockResolvedValue({ spec: table, sources: [] }); render(<><Host complete /><Host complete /></>);
  const turn = startTurn(); completeTurn();
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail: turn.detail })));
  await act(async () => {}); expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('multi-series chart renders three labeled paths and accessible exact values', () => {
  const chart = { version: '1', designVersion: 'aetheris-1', kind: 'line-chart',
    title: 'Business revenue', summary: 'Six months of user-supplied data.',
    provenance: table.provenance, unit: 'thousands of dollars',
    labels: ['M1', 'M2', 'M3'],
    series: [{ id: 'a', label: 'Business A', values: [20, 24, 28] },
      { id: 'b', label: 'Business B', values: [30, 29, 33] },
      { id: 'c', label: 'Business C', values: [15, 19, 23] }] };
  const { container } = render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'chart', status: 'ready', spec: chart }} /></div>);
  expect(screen.getByRole('list', { name: 'Chart series' })).toHaveTextContent('Business A');
  expect(screen.getByRole('list', { name: 'Chart series' })).toHaveTextContent('Business C');
  expect(container.querySelectorAll('path.metabloom-visual__line')).toHaveLength(3);
  fireEvent.click(screen.getByText('View exact values'));
  expect(screen.getByRole('table')).toHaveTextContent('33');
  expect(screen.getByRole('table')).toHaveTextContent('Business B');
});

test('explicit tool call generates an artifact before the closing response and passes current calculator state', async () => {
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'b'.repeat(48),
    kind: 'calculator', expiresAt: Date.now() + 600000 };
  postMetabloomTool.mockImplementation(({ phase }) => Promise.resolve(phase === 'start'
    ? { offer, emote: 'neutral' }
    : { reply: { version: '2.0.0', segments: [{ response: 'Your calculator is ready.' }] }, emote: 'neutral' }));
  requestMetabloomVisual.mockResolvedValue({ spec: calculator, sources: [] });
  messages = [{ id: 'user-1', role: 'user', content: 'Create an interactive calculator.' }];
  const HostTool = ({ complete }) => <div className="orb-page">
    <article data-message-id="user-1" data-stream-status="complete"><div className="metabloom-chat__bubble">Create an interactive calculator.</div></article>
    {complete && <article data-message-id="assistant-2" data-stream-status="complete"><div className="metabloom-chat__bubble">Your calculator is ready.</div></article>}
    <MetabloomVisuals />
  </div>;
  const host = render(<HostTool complete={false} />);
  const controller = new AbortController();
  const respond = jest.fn(() => {
    messages.push({ id: 'assistant-2', role: 'assistant', content: 'Your calculator is ready.', status: 'complete' });
  });
  const event = new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'mount-1', message: 'Create an interactive calculator.', history: [], actionMode: 'auto',
    signal: controller.signal, claim: jest.fn(), respond, onToolActivity: jest.fn(), onReaction: jest.fn(),
  } });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await screen.findByRole('heading', { name: 'Share the total' });
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
  expect(postMetabloomTool.mock.calls[1][0].display).toBe('mounted');
  host.rerender(<HostTool complete />);
  await waitFor(() => expect(document.querySelector('[data-message-id="assistant-2"] .metabloom-visual')).not.toBeNull());
  fireEvent.change(screen.getByLabelText('People'), { target: { value: '4' } });
  expect(window.__metabloomVisualSnapshot()).toEqual({ id: offer.id, inputs: { total: 120, people: 4 } });
  fireEvent.change(screen.getByLabelText('People'), { target: { value: '' } });
  expect(window.__metabloomVisualSnapshot()).toBeNull();
  controller.abort();
});
