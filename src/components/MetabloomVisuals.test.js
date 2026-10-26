import React from 'react';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import MetabloomVisuals from './MetabloomVisuals';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import OrbSection from './OrbSection';
import { requestMetabloomVisual, METABLOOM_VISUAL_OFFER_EVENT } from './metabloomVisualApiClient';
import { postMetabloomTool } from './metabloomToolClient';
import userEvent from '@testing-library/user-event';

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
const table = { version: '1', designVersion: 'aetheris-1', kind: 'table', title: 'Options compared', summary: 'Your supplied values.',
  provenance: { type: 'user', label: 'User-provided values.', sourceIds: [] }, columns: ['Option', 'Value'], rows: [['A', '10'], ['B', '20']] };
const calculator = { version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Share the total', summary: 'Calculate from your inputs.', provenance: table.provenance, controls: [{ id: 'total', label: 'Total', unit: 'CAD', min: 0, max: 1000, step: 1, initial: 120 }, { id: 'people', label: 'People', unit: '', min: 0, max: 20, step: 1, initial: 3 }], formula: ['total', 'people', 'divide'], formulaDescription: 'Total divided by people.', unit: 'CAD per person' };
const pie = { version: '1', designVersion: 'aetheris-1', kind: 'pie-chart', title: 'Apple-pie ingredients by mass',
  summary: 'An illustrative recipe example, not exact baking instructions.',
  provenance: { type: 'illustrative', label: 'Assumed example quantities in grams; actual recipes vary.', sourceIds: [] },
  unit: 'g', points: [{ label: 'Apples', value: 700 }, { label: 'Flour', value: 200 }, { label: 'Butter', value: 100 }] };
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

test('pie slices and legend buttons share keyboard selection and preserve exact values and assumptions', () => {
  const { container } = render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'pie', status: 'ready', spec: pie }} /></div>);
  expect(screen.getByRole('group', { name: pie.title })).toBeInTheDocument();
  expect(screen.getByText('Assumed example quantities in grams; actual recipes vary.')).toBeInTheDocument();
  expect(container.querySelectorAll('.metabloom-visual__pie-slice')).toHaveLength(3);
  const flourSlice = screen.getByRole('button', { name: 'Flour slice: 200 g (20% of the total)' });
  const butterSlice = screen.getByRole('button', { name: 'Butter slice: 100 g (10% of the total)' });
  userEvent.tab();
  expect(screen.getByRole('button', { name: 'Apples slice: 700 g (70% of the total)' })).toHaveFocus();
  userEvent.tab();
  expect(flourSlice).toHaveFocus();
  expect(flourSlice).toHaveAttribute('aria-pressed', 'false');
  act(() => userEvent.keyboard('{Enter}'));
  expect(flourSlice).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Flour 20%' })).toHaveAttribute('aria-pressed', 'true');
  userEvent.tab();
  expect(butterSlice).toHaveFocus();
  act(() => userEvent.keyboard(' '));
  expect(butterSlice).toHaveAttribute('aria-pressed', 'true');
  expect(flourSlice).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('Butter: 100 g (10% of the total).');
  userEvent.tab();
  expect(screen.getByRole('button', { name: 'Apples 70%' })).toHaveFocus();
  userEvent.tab();
  expect(screen.getByRole('button', { name: 'Flour 20%' })).toHaveFocus();
  act(() => userEvent.keyboard('{Enter}'));
  expect(screen.getByRole('button', { name: 'Flour 20%' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Flour: 200 g (20% of the total).');
  expect(container.querySelector('.metabloom-visual__pie-slice[data-selected="true"]')).toHaveClass('metabloom-visual__series-2');
  const selectedSlice = container.querySelector('.metabloom-visual__pie-slice[data-selected="true"]');
  const edge = container.querySelector('.metabloom-visual__pie-edge');
  expect(edge).toHaveAttribute('d', selectedSlice.getAttribute('d'));
  expect(edge).toBe(selectedSlice.ownerSVGElement.lastElementChild);
  expect(edge).toHaveAttribute('stroke', 'url(#pie-pie-spectrum)');
  expect(edge).toHaveAttribute('aria-hidden', 'true');
  expect(edge).toHaveAttribute('focusable', 'false');
  expect(edge).not.toHaveAttribute('tabindex');
  expect(edge).not.toHaveAttribute('role');
  fireEvent.click(screen.getByText('View exact values'));
  expect(screen.getByRole('table')).toHaveTextContent('Amount (g)');
  expect(screen.getByRole('table')).toHaveTextContent('700');
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test('clicking a pie slice and its category button updates the same highlight and summary', () => {
  const { container } = render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'pie-click', status: 'ready', spec: pie }} /></div>);
  const flourSlice = screen.getByRole('button', { name: 'Flour slice: 200 g (20% of the total)' });
  fireEvent.click(flourSlice);
  expect(flourSlice).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Flour 20%' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Flour: 200 g (20% of the total).');
  expect(container.querySelector('.metabloom-visual__pie-edge')).toHaveAttribute('d', flourSlice.getAttribute('d'));
  fireEvent.click(screen.getByRole('button', { name: 'Butter 10%' }));
  const butterSlice = screen.getByRole('button', { name: 'Butter slice: 100 g (10% of the total)' });
  expect(butterSlice).toHaveAttribute('aria-pressed', 'true');
  expect(flourSlice).toHaveAttribute('aria-pressed', 'false');
  expect(container.querySelector('.metabloom-visual__pie-edge')).toHaveAttribute('d', butterSlice.getAttribute('d'));
  expect(screen.getByRole('status')).toHaveTextContent('Butter: 100 g (10% of the total).');
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(postMetabloomTool).not.toHaveBeenCalled();
});

test.each([1e12, Number.MIN_VALUE])('a pie with one positive part renders a complete circle for %s', value => {
  const chart = { ...pie, points: [{ label: 'Present', value }, { label: 'Absent', value: 0 }] };
  const { container } = render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'single', status: 'ready', spec: chart }} /></div>);
  expect(container.querySelectorAll('circle.metabloom-visual__pie-slice')).toHaveLength(1);
  expect(container.querySelectorAll('path.metabloom-visual__pie-slice')).toHaveLength(0);
  expect(container.querySelector('circle.metabloom-visual__pie-edge')).toHaveAttribute('r', '96');
  expect(screen.getByRole('button', { name: 'Present 100%' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Absent 0%' }));
  expect(screen.getByRole('status')).toHaveTextContent('Absent: 0 g (0% of the total).');
  expect(container.querySelector('.metabloom-visual__pie-edge')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Present slice:/ }));
  expect(screen.getByRole('button', { name: 'Present 100%' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('circle.metabloom-visual__pie-edge')).toHaveAttribute('r', '96');
  expect(container.querySelector('svg').innerHTML).not.toMatch(/NaN|Infinity/);
});

test('tiny positive pie parts never display a misleading zero percent', () => {
  const chart = { ...pie, points: [{ label: 'Main', value: 1e12 }, { label: 'Trace', value: Number.MIN_VALUE }] };
  const { container } = render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id: 'tiny', status: 'ready', spec: chart }} /></div>);
  expect(screen.getByRole('button', { name: 'Trace <0.01%' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Main >99.99%' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trace <0.01%' }));
  expect(container.querySelector('.metabloom-visual__pie-edge')).toBeNull();
  expect(container.querySelector('svg').innerHTML).not.toMatch(/NaN|Infinity/);
});

test('an explicit apple-pie request mounts the pie before its closing response', async () => {
  const message = 'can you create a pie chart the represents the ingredients in an apple pie?';
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'e'.repeat(48), kind: 'pie-chart', expiresAt: Date.now() + 600000 };
  postMetabloomTool.mockImplementation(({ phase }) => Promise.resolve(phase === 'start'
    ? { offer, emote: 'neutral' }
    : { reply: { version: '2.0.0', segments: [{ response: 'Here is an illustrative apple-pie ingredient chart.' }] }, emote: 'neutral' }));
  requestMetabloomVisual.mockResolvedValue({ spec: pie, sources: [] });
  messages = [{ id: 'user-1', role: 'user', content: message }];
  const respond = jest.fn(() => expect(screen.getByRole('button', { name: 'Apples 70%' })).toBeInTheDocument());
  render(<div className="orb-page"><article data-message-id="user-1"><div className="metabloom-chat__bubble">{message}</div></article><MetabloomVisuals /></div>);
  const event = new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'pie-mount-1', message, history: [], actionMode: 'auto', signal: new AbortController().signal,
    claim: jest.fn(), respond, onToolActivity: jest.fn(), onReaction: jest.fn(),
  } });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(requestMetabloomVisual.mock.calls[0][0].kind).toBe('pie-chart');
  expect(postMetabloomTool.mock.calls[1][0]).toEqual({ phase: 'continue', id: offer.id, display: 'mounted' });
  expect(screen.queryByText(/I could not create/)).not.toBeInTheDocument();
});

test('disabled tool never falls back to the ordinary model or displays HTML source', async () => {
  postMetabloomTool.mockRejectedValue({ code: 'tool_disabled' });
  messages = [{ id: 'user-1', role: 'user', content: 'Create an interactive calculator.' }];
  const respond = jest.fn();
  render(<div className="orb-page">
    <article data-message-id="user-1"><div className="metabloom-chat__bubble">Create an interactive calculator.</div></article>
    <MetabloomVisuals />
  </div>);
  const event = new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'mount-1', message: 'Create an interactive calculator.', history: [], actionMode: 'auto',
    signal: new AbortController().signal, claim: jest.fn(), respond, onToolActivity: jest.fn(),
  } });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  const reply = respond.mock.calls[0][0].segments[0].response;
  expect(reply).toMatch(/not enabled/);
  expect(reply).not.toMatch(/<script|<input|<div|function\s*\(/);
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
});

test('an explicit visual keeps its assistant-side slot, calculator state and focus through the closing response', async () => {
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'b'.repeat(48),
    kind: 'calculator', expiresAt: Date.now() + 600000 };
  let resolveVisual, resolveContinuation;
  postMetabloomTool.mockImplementation(({ phase }) => phase === 'start'
    ? Promise.resolve({ offer, emote: 'neutral' })
    : new Promise(resolve => { resolveContinuation = resolve; }));
  requestMetabloomVisual.mockImplementation(() => new Promise(resolve => { resolveVisual = resolve; }));
  messages = [{ id: 'user-1', role: 'user', content: 'Create an interactive calculator.' }];
  const HostTool = ({ complete }) => <div className="orb-page">
    <article className="metabloom-chat__message metabloom-chat__message--user" data-message-id="user-1" data-stream-status="complete"><div className="metabloom-chat__bubble">Create an interactive calculator.</div></article>
    {complete && <article className="metabloom-chat__message metabloom-chat__message--assistant" data-message-id="assistant-2" data-stream-status="complete"><span className="metabloom-chat__speaker">Metabloom</span><div className="metabloom-chat__bubble">Your calculator is ready.</div></article>}
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
  const stop = await screen.findByRole('button', { name: 'Stop visual' });
  const slot = stop.closest('.metabloom-visual-slot');
  const pendingArticle = slot.parentElement;
  expect(pendingArticle).toHaveClass('metabloom-chat__message--assistant');
  expect(pendingArticle.previousElementSibling).toHaveAttribute('data-message-id', 'user-1');
  expect(pendingArticle.querySelector('.metabloom-chat__speaker')).toHaveTextContent('Metabloom');
  expect(document.querySelector('[data-message-id="user-1"] .metabloom-visual')).toBeNull();
  await act(async () => resolveVisual({ spec: calculator, sources: [] }));
  await screen.findByRole('heading', { name: 'Share the total' });
  const frame = document.querySelector('.metabloom-visual');
  const people = screen.getByLabelText('People');
  fireEvent.change(people, { target: { value: '4' } });
  people.focus();
  expect(people).toHaveFocus();
  expect(respond).not.toHaveBeenCalled();
  await act(async () => resolveContinuation({
    reply: { version: '2.0.0', segments: [{ response: 'Your calculator is ready.' }] }, emote: 'neutral',
  }));
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
  expect(postMetabloomTool).toHaveBeenCalledTimes(2);
  expect(postMetabloomTool.mock.calls[1][0].display).toBe('mounted');
  host.rerender(<HostTool complete />);
  await waitFor(() => expect(document.querySelector('[data-message-id="assistant-2"] .metabloom-visual')).not.toBeNull());
  expect(document.querySelector('[data-message-id="assistant-2"] .metabloom-visual-slot')).toBe(slot);
  expect(document.querySelector('.metabloom-visual')).toBe(frame);
  expect(slot.nextElementSibling).toHaveClass('metabloom-chat__bubble');
  expect(pendingArticle.isConnected).toBe(false);
  expect(screen.getByLabelText('People')).toBe(people);
  expect(people).toHaveValue(4);
  expect(people).toHaveFocus();
  expect(screen.getByText('30 CAD per person')).toBeInTheDocument();
  expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  expect(window.__metabloomVisualSnapshot()).toEqual({ id: offer.id, inputs: { total: 120, people: 4 } });
  fireEvent.change(screen.getByLabelText('People'), { target: { value: '' } });
  expect(window.__metabloomVisualSnapshot()).toBeNull();
  controller.abort();
});

test.each(['pruning', 'unmount'])('a pending assistant visual is removed on %s and ignores a late result', async reason => {
  const message = 'Create an interactive calculator.';
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'f'.repeat(48),
    kind: 'calculator', expiresAt: Date.now() + 600000 };
  let resolveVisual;
  postMetabloomTool.mockResolvedValue({ offer, emote: 'neutral' });
  requestMetabloomVisual.mockImplementation(() => new Promise(resolve => { resolveVisual = resolve; }));
  messages = [{ id: 'user-1', role: 'user', content: message }];
  const HostTool = ({ cleared = false }) => <div className="orb-page">
    {!cleared && <article data-message-id="user-1"><div className="metabloom-chat__bubble">{message}</div></article>}
    <MetabloomVisuals />
  </div>;
  const host = render(<HostTool />);
  const respond = jest.fn();
  act(() => window.dispatchEvent(new CustomEvent('metabloom:user-message', { cancelable: true, detail: {
    requestId: 'pending-1', message, history: [], actionMode: 'auto', signal: new AbortController().signal,
    claim: jest.fn(), respond, onToolActivity: jest.fn(),
  } })));
  const pendingArticle = (await screen.findByRole('button', { name: 'Stop visual' })).closest('article');
  const signal = requestMetabloomVisual.mock.calls[0][1].signal;
  if (reason === 'unmount') host.unmount();
  else { messages = []; host.rerender(<HostTool cleared />); }
  await waitFor(() => expect(pendingArticle.parentNode).toBeNull());
  expect(signal.aborted).toBe(true);
  await act(async () => resolveVisual({ spec: calculator, sources: [] }));
  expect(screen.queryByRole('heading', { name: 'Share the total' })).not.toBeInTheDocument();
  expect(document.querySelector('.metabloom-visual-slot')).toBeNull();
  expect(postMetabloomTool).toHaveBeenCalledTimes(1);
  expect(respond).not.toHaveBeenCalled();
});

describe('the explicit visual reading position in the real Orb transcript', () => {
  let matchMedia;
  let ordinaryRequests;
  beforeEach(() => {
    matchMedia = window.matchMedia;
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    ordinaryRequests = [];
    window.__metabloomRequest = request => new Promise(finish => ordinaryRequests.push({ request, finish }));
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    window.matchMedia = matchMedia;
    window.__metabloomRequest = null;
  });
  const send = message => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
  };
  const setup = async ({ visualHeight = 900, visualTop = 2500 } = {}) => {
    const offer = { version: '1', designVersion: 'aetheris-1', id: '1'.repeat(48),
      kind: 'calculator', expiresAt: Date.now() + 600000 };
    let resolveVisual, resolveContinuation;
    postMetabloomTool.mockImplementation(({ phase }) => phase === 'start'
      ? Promise.resolve({ offer, emote: 'neutral' })
      : new Promise(resolve => { resolveContinuation = resolve; }));
    requestMetabloomVisual.mockImplementation(() => new Promise(resolve => { resolveVisual = resolve; }));
    render(<div className="orb-page"><OrbSection /><MetabloomVisuals /></div>);
    const transcript = screen.getByRole('log', { name: 'Conversation' });
    let scrollHeight = 4000, scrollTop = 0;
    Object.defineProperties(transcript, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, get: () => scrollTop,
        set: value => { scrollTop = Math.max(0, Math.min(scrollHeight - 600, value)); } },
    });
    transcript.style.setProperty('mask-image', 'linear-gradient(transparent, black)');
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this === transcript) return { top: 100, bottom: 700, left: 0, right: 500, height: 600, width: 500 };
      if (this.classList.contains('metabloom-visual')) {
        const top = visualTop - scrollTop;
        return { top, bottom: top + visualHeight, left: 0, right: 500, height: visualHeight, width: 500 };
      }
      return originalRect.call(this);
    });
    send('Create an interactive calculator.');
    await screen.findByRole('button', { name: 'Stop visual' });
    return {
      transcript,
      ready: async () => {
        await act(async () => resolveVisual({ spec: calculator, sources: [] }));
        await waitFor(() => expect(postMetabloomTool).toHaveBeenCalledTimes(2));
        return screen.getByRole('region', { name: calculator.title });
      },
      finish: async () => {
        scrollHeight = 4400;
        await act(async () => resolveContinuation({ reply: { version: '2.0.0',
          segments: [{ response: 'Your calculator is ready.' }] }, emote: 'neutral' }));
        await screen.findByText('Your calculator is ready.');
      },
    };
  };

  test('a long ready visual opens below the fade and keeps its position and focused input through the closing reply', async () => {
    const { transcript, ready, finish } = await setup();
    expect(transcript.scrollTop).toBe(3400);
    const visual = await ready();
    expect(visual.getBoundingClientRect().top).toBe(184);
    const readingPosition = transcript.scrollTop;
    const people = screen.getByLabelText('People');
    fireEvent.change(people, { target: { value: '4' } });
    act(() => people.focus());
    await finish();
    expect(transcript.scrollTop).toBe(readingPosition);
    expect(people).toHaveFocus();
    expect(people).toHaveValue(4);
    expect(visual.closest('article')).toHaveAttribute('data-message-id', 'assistant-2');
    expect(requestMetabloomVisual).toHaveBeenCalledTimes(1);
  });

  test('a ready visual already in view does not jump when the closing reply or viewport updates arrive', async () => {
    const { transcript, ready, finish } = await setup({ visualHeight: 200, visualTop: 3900 });
    await ready();
    expect(transcript.scrollTop).toBe(3400);
    await finish();
    expect(transcript.scrollTop).toBe(3400);
    fireEvent(window, new Event('resize'));
    await act(async () => new Promise(resolve => window.requestAnimationFrame(resolve)));
    expect(transcript.scrollTop).toBe(3400);
  });

  test('manual earlier reading stays put, while a new ordinary turn restores following latest and rejects an old visual notification', async () => {
    const { transcript, ready, finish } = await setup();
    transcript.scrollTop = 100;
    fireEvent.scroll(transcript);
    const visual = await ready();
    const slot = visual.closest('.metabloom-visual-slot');
    expect(transcript.scrollTop).toBe(100);
    await finish();
    expect(transcript.scrollTop).toBe(100);
    send('Thank you, tell me a story.');
    expect(transcript.scrollTop).toBe(3800);
    await waitFor(() => expect(ordinaryRequests).toHaveLength(1));
    act(() => window.dispatchEvent(new CustomEvent('metabloom:visual-ready', {
      detail: { id: slot.dataset.visualId, userId: slot.dataset.visualUserId },
    })));
    expect(transcript.scrollTop).toBe(3800);
    await act(async () => ordinaryRequests[0].finish({ version: '2.0.0', segments: [{ response: 'A new ordinary answer.' }] }));
    await screen.findByText('A new ordinary answer.');
    expect(transcript.scrollTop).toBe(3800);
  });
});
