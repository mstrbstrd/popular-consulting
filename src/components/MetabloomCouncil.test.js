import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrbSection from './OrbSection';
import MetabloomCouncilProgress from './MetabloomCouncilProgress';
import { requestMetabloomCouncil } from './metabloomCouncilClient';
import { buildCouncilReply } from './metabloomCouncilProtocol';
jest.mock('./metabloomCouncilClient', () => ({ requestMetabloomCouncil: jest.fn() }));
jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
const members = [{ provider: 'openai', model: 'gpt-5-mini' }, { provider: 'deepseek', model: 'deepseek-flash' }, { provider: 'anthropic', model: 'claude-sonnet' }];
const reply = () => buildCouncilReply(members, ['One', 'Two', 'Three', 'Critique one', 'Critique two', 'Critique three', 'Synthesis'], 'openai');
beforeEach(() => { requestMetabloomCouncil.mockReset(); });
const send = value => { fireEvent.change(screen.getByRole('textbox', { name: 'Message Metabloom' }), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Send message' })); };
test('asking the council automatically routes to the council and persists the complete discussion as one reply', async () => {
  requestMetabloomCouncil.mockResolvedValue(reply());
  render(<OrbSection />);
  send('I am asking the council: what should we do?');
  await waitFor(() => expect(requestMetabloomCouncil).toHaveBeenCalledTimes(1));
  expect(requestMetabloomCouncil.mock.calls[0][0].message).toBe('I am asking the council: what should we do?');
  expect(await screen.findByText(/Critique and revision: Critique one/)).toBeInTheDocument();
  expect(screen.getByText(/Council synthesis/)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  expect(options.signal.aborted).toBe(true);
  await act(async () => { options.onEvent({ type: 'council_step', index: 0, state: 'complete', text: 'Late contribution' }); resolve(reply()); });
  expect(screen.queryByText('Late contribution')).not.toBeInTheDocument();
  expect(screen.queryByText(/Council synthesis/)).not.toBeInTheDocument();
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
