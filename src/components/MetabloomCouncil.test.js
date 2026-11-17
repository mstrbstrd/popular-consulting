import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrbSection from './OrbSection';
import MetabloomCouncilProgress from './MetabloomCouncilProgress';
import { requestMetabloomCouncil } from './metabloomCouncilClient';
import { buildCouncilReply } from './metabloomCouncilProtocol';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { parseMetabloomThreadSnapshot } from './metabloomThreadProtocol';
const { TextEncoder } = require('util');
const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
jest.mock('./metabloomCouncilClient', () => ({ requestMetabloomCouncil: jest.fn() }));
let mockAvatar;
jest.mock('./MetabloomAvatar', () => props => { mockAvatar = props; return null; });
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
const members = [{ provider: 'openai', model: 'gpt-5-mini' }, { provider: 'deepseek', model: 'deepseek-flash' }, { provider: 'anthropic', model: 'claude-sonnet' }];
const reply = () => buildCouncilReply(members, ['One', 'Two', 'Three', 'Critique one', 'Critique two', 'Critique three', 'Synthesis'], 'openai');
beforeEach(() => { requestMetabloomCouncil.mockReset(); });
const send = value => { fireEvent.change(screen.getByRole('textbox', { name: 'Message Metabloom' }), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Send message' })); };
test('asking the council shows only the final answer with the full discussion closed until expanded', async () => {
  requestMetabloomCouncil.mockResolvedValue(reply());
  render(<OrbSection />);
  send('I am asking the council: what should we do?');
  await waitFor(() => expect(requestMetabloomCouncil).toHaveBeenCalledTimes(1));
  expect(requestMetabloomCouncil.mock.calls[0][0].message).toBe('I am asking the council: what should we do?');
  expect(await screen.findByText('Synthesis')).toBeVisible();
  const contribution = screen.getByText(/Critique and revision: Critique one/);
  expect(contribution).not.toBeVisible();
  expect(screen.queryByText(/Council synthesis/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('View council discussion'));
  expect(contribution).toBeVisible();
  fireEvent.click(screen.getByText('View council discussion'));
  expect(contribution).not.toBeVisible();
  expect(mockAvatar.council).toBe(false);
});
test('manual mode uses council for an ordinary message and excludes Deep Research', async () => {
  requestMetabloomCouncil.mockResolvedValue(reply()); render(<OrbSection />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Deep Research' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Council' }));
  expect(screen.getByRole('checkbox', { name: 'Deep Research' })).not.toBeChecked();
  expect(screen.getByText(/Shares this conversation across/)).toBeInTheDocument();
  send('Compare these approaches.');
  await waitFor(() => expect(requestMetabloomCouncil).toHaveBeenCalledTimes(1));
});
test('Stop aborts the owned council request and suppresses late contributions and completion', async () => {
  let options, resolve;
  requestMetabloomCouncil.mockImplementation(value => { options = value; return new Promise(done => { resolve = done; }); });
  render(<OrbSection />); send('Ask the council');
  await waitFor(() => expect(options).toBeDefined());
  act(() => options.onEvent({ type: 'council_start', members, chair: 'openai' }));
  act(() => options.onEvent({ type: 'council_step', index: 0, state: 'running' }));
  expect(screen.getByRole('status', { name: 'Work progress' })).toHaveTextContent('Opening · OpenAI · Responding');
  expect(mockAvatar).toMatchObject({ council: true, councilSpeaker: { provider: 'openai', round: 'Opening', state: 'running' } });
  act(() => options.onEvent({ type: 'council_step', index: 0, state: 'repairing' }));
  expect(screen.getByRole('status', { name: 'Work progress' })).toHaveTextContent('Opening · OpenAI · Correcting response format');
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  expect(options.signal.aborted).toBe(true);
  expect(mockAvatar.councilSpeaker).toBeNull();
  expect(mockAvatar.council).toBe(false);
  await act(async () => { options.onEvent({ type: 'council_step', index: 0, state: 'complete', text: 'Late contribution' }); resolve(reply()); });
  expect(screen.queryByText('Late contribution')).not.toBeInTheDocument();
  expect(screen.queryByText(/Council synthesis/)).not.toBeInTheDocument();
});
test('correction progress names the actual member and preserves the original elapsed time', () => {
  jest.useFakeTimers();
  const events = [{ type: 'council_start', members, chair: 'openai' }, { type: 'council_step', index: 4, state: 'running' }];
  const view = render(<MetabloomCouncilProgress pending events={events} />);
  act(() => jest.advanceTimersByTime(13000));
  const correcting = [...events, { type: 'council_step', index: 4, state: 'repairing' }];
  view.rerender(<MetabloomCouncilProgress pending events={correcting} />);
  expect(screen.getByRole('status', { name: 'Work progress' })).toHaveTextContent('Critique · DeepSeek · Correcting response format');
  expect(screen.getByText('13s elapsed')).toBeInTheDocument();
  expect(screen.queryByText('Waiting for the next update.')).not.toBeInTheDocument();
  view.rerender(<MetabloomCouncilProgress pending={false} events={correcting} />);
  expect(screen.getByRole('status')).toHaveTextContent('Council incomplete during Critique · DeepSeek');
  view.unmount(); jest.useRealTimers();
});
test('progress exposes real contributions as readable details and marks partial failure', () => {
  render(<MetabloomCouncilProgress pending={false} events={[{ type: 'council_start', members, chair: 'openai' },
    { type: 'council_step', index: 0, state: 'running' }, { type: 'council_step', index: 0, state: 'complete', text: 'Opening view' }]} />);
  expect(screen.getByRole('status')).toHaveTextContent('incomplete');
  expect(screen.getByText('Opening · OpenAI · gpt-5-mini')).toBeInTheDocument();
  expect(screen.getByText('Opening view').closest('details')).toBeInTheDocument();
});
test('quiet council work retains the shared elapsed-time and waiting status without inventing progress', () => {
  jest.useFakeTimers();
  const events = [{ type: 'council_start', members, chair: 'openai' }, { type: 'council_step', index: 0, state: 'running' }];
  const view = render(<MetabloomCouncilProgress pending events={events} />);
  act(() => jest.advanceTimersByTime(13000));
  expect(screen.getByText('Waiting for the next update.')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Work progress' })).toHaveTextContent('Opening · OpenAI · Responding');
  view.unmount(); jest.useRealTimers();
});


test('manual council seats enter before sending, follow the actual critique and synthesis chair, and settle on failure', async () => {
  let options, reject;
  requestMetabloomCouncil.mockImplementation(value => { options = value; return new Promise((_, fail) => { reject = fail; }); });
  render(<OrbSection />);
  expect(mockAvatar.council).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Council' }));
  expect(mockAvatar.council).toBe(true);
  expect(mockAvatar.councilSpeaker).toBeNull();
  send('Discuss this.');
  await waitFor(() => expect(options).toBeDefined());
  act(() => options.onEvent({ type: 'council_start', members, chair: 'anthropic' }));
  const onEvent = options.onEvent;
  for (const [index, provider, round] of [[0, 'openai', 'Opening'], [1, 'deepseek', 'Opening'], [2, 'anthropic', 'Opening'], [4, 'deepseek', 'Critique'], [6, 'anthropic', 'Synthesis']]) {
    act(() => onEvent({ type: 'council_step', index, state: 'running' }));
    expect(mockAvatar.councilSpeaker).toMatchObject({ provider, round, state: 'running' });
    act(() => onEvent({ type: 'council_step', index, state: 'complete', text: 'Completed contribution' }));
    expect(mockAvatar.councilSpeaker).toBeNull();
  }
  act(() => options.onEvent({ type: 'council_step', index: 6, state: 'repairing' }));
  expect(mockAvatar.councilSpeaker.state).toBe('repairing');
  await act(async () => reject({ code: 'answer_invalid' }));
  expect(mockAvatar.councilSpeaker).toBeNull();
  expect(mockAvatar.council).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Council' }));
  expect(mockAvatar.council).toBe(false);
  expect(mockAvatar.provider).toBeUndefined();
});

test('typing, negating and removing a council request cannot activate its scene or start work', () => {
  render(<OrbSection />);
  const input = screen.getByRole('textbox', { name: 'Message Metabloom' });
  fireEvent.change(input, { target: { value: 'asking the council about this' } });
  expect(mockAvatar.council).toBe(false);
  expect(screen.getByText(/Shares this conversation across/)).toBeVisible();
  fireEvent.change(input, { target: { value: 'do not ask the council' } });
  expect(mockAvatar.council).toBe(false);
  fireEvent.change(input, { target: { value: '' } });
  expect(mockAvatar.council).toBe(false);
  expect(requestMetabloomCouncil).not.toHaveBeenCalled();
});

test('submitting an automatic request activates the council even after the composer clears', async () => {
  requestMetabloomCouncil.mockImplementation(() => new Promise(() => {}));
  render(<OrbSection />);
  const input = screen.getByRole('textbox', { name: 'Message Metabloom' });
  fireEvent.change(input, { target: { value: 'Ask the council about this' } });
  expect(mockAvatar.council).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(requestMetabloomCouncil).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue('');
  expect(mockAvatar.council).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  expect(mockAvatar.council).toBe(false);
});

test('saved council replies reopen with their answer visible and discussion collapsed', () => {
  const segments = reply().segments;
  const saved = parseMetabloomThreadSnapshot({ schemaVersion: 1, conversation: { counter: 1, draft: '', deepResearch: false,
    messages: [{ id: 'assistant-1', role: 'assistant', status: 'complete', source: 'model', segments,
      content: segments.map(segment => segment.response).join('\n\n') }] },
    visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
  expect(saved).not.toBeNull();
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved.conversation }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByText('Synthesis')).toBeVisible();
  expect(screen.getByText(/Critique and revision: Critique three/)).not.toBeVisible();
  fireEvent.click(screen.getByText('View council discussion'));
  expect(screen.getByText(/Critique and revision: Critique three/)).toBeVisible();
  expect(requestMetabloomCouncil).not.toHaveBeenCalled();
});
