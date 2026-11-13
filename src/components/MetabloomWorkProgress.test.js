import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import OrbSection from './OrbSection';
import MetabloomWorkStatus from './MetabloomWorkStatus';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const tick = async ms => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const send = (message = 'Search for the latest Nvidia news.') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};
const tool = state => ({ type: 'tool_activity', name: 'search_web', callId: 'search_1', state });
const progress = (sequence, summary) => ({ type: 'tool_progress', name: 'search_web', callId: 'search_1', sequence, summary });
const status = state => ({ type: 'agent_status', state });
const reply = { version: '2.0.0', segments: [{ response: 'A sourced result. [1]' }] };
let request, finish, reject;
beforeEach(() => {
  jest.useFakeTimers();
  window.__metabloomRequest = value => { request = value; return new Promise((resolve, fail) => { finish = resolve; reject = fail; }); };
});
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });
const startSearch = async () => {
  send(); await tick(0);
  act(() => { request.onAgentStatus(status('working')); request.onToolActivity(tool('running')); });
};

test('search updates, quiet periods and answer handoffs stay visible in ordinary chat', async () => {
  render(<OrbSection />); await startSearch();
  expect(screen.queryByRole('status', { name: 'Research progress' })).not.toBeInTheDocument();
  const work = screen.getByRole('status', { name: 'Work progress' });
  expect(work).toHaveTextContent('Searching the web');
  expect(screen.getByRole('button', { name: 'Stop response' })).toBeEnabled();
  act(() => request.onToolProgress(progress(1, 'Searching: Nvidia latest announcement')));
  expect(work).toHaveTextContent('Searching: Nvidia latest announcement');
  await tick(13000);
  expect(work).toHaveTextContent('Waiting for the next update.'); expect(work).toHaveTextContent('13s elapsed');
  act(() => request.onToolProgress(progress(2, 'Reading: example.com')));
  expect(work).toHaveTextContent('Reading: example.com'); expect(work).not.toHaveTextContent('Waiting for the next update.');
  act(() => { request.onToolActivity(tool('complete')); request.onAgentStatus(status('reviewing')); });
  expect(work).toHaveTextContent('Reviewing results'); expect(work).toHaveTextContent('Search complete. Reviewing the sources.');
  act(() => request.onAgentStatus(status('validating')));
  expect(work).toHaveTextContent('Checking the answer');
  act(() => {
    request.onSources([{ id: 1, title: 'Announcement', url: 'https://example.com/news' }]);
    request.onSegment(reply.segments[0], 0);
    expect(request.onToolProgress(progress(3, 'Late update'))).toBe(false);
  });
  await act(async () => finish(reply)); await tick(2000);
  expect(screen.queryByRole('status', { name: 'Work progress' })).not.toBeInTheDocument();
  expect(window.__orbMessages().at(-1).sources[0].url).toBe('https://example.com/news');
  expect(window.__orbState().pending).toBe(false);
});

test.each(['stop', 'reset', 'message', 'deactivate', 'unmount', 'error'])('%s ends work and rejects stale progress', async operation => {
  const view = render(<OrbSection isActive />); await startSearch();
  const old = request, oldFinish = finish;
  if (operation === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  else if (operation === 'reset') act(() => window.__orbReset());
  else if (operation === 'message') { send('A different question'); await tick(0); }
  else if (operation === 'deactivate') view.rerender(<OrbSection isActive={false} />);
  else if (operation === 'unmount') view.unmount();
  else { await act(async () => reject({ code: 'provider_unavailable' })); }
  expect(old.signal.aborted).toBe(true);
  act(() => expect(old.onToolProgress(progress(1, 'A stale source'))).toBe(false));
  await act(async () => oldFinish(reply));
  expect(screen.queryByRole('status', { name: 'Work progress' })).not.toBeInTheDocument();
  expect(screen.queryByText('A stale source')).not.toBeInTheDocument();
  if (operation === 'stop') expect(screen.getByText('Response stopped.')).toBeInTheDocument();
  if (operation === 'error') expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('a failed tool stays a failure while the model prepares its response', async () => {
  render(<OrbSection />); await startSearch();
  act(() => { request.onToolActivity(tool('failed')); request.onAgentStatus(status('reviewing')); });
  expect(screen.getByRole('status', { name: 'Work progress' })).toHaveTextContent('did not finish successfully');
  expect(request.onSources([{ id: 1, title: 'Invented', url: 'https://example.com' }])).toBe(false);
});

test('progress cannot extend the absolute request lifetime or finish an active tool', async () => {
  render(<OrbSection />); await startSearch();
  act(() => expect(request.onSegment(reply.segments[0], 0)).toBe(false));
  const old = request;
  await tick(80000);
  act(() => request.onToolProgress(progress(1, 'Reading: example.com')));
  await tick(10001);
  expect(old.signal.aborted).toBe(true);
  expect(window.__orbState().pending).toBe(false);
  expect(screen.queryByRole('status', { name: 'Work progress' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('updates preserve earlier reading position and composer focus', async () => {
  render(<OrbSection />); await startSearch();
  const transcript = screen.getByRole('log', { name: 'Conversation' }), composer = screen.getByRole('textbox');
  Object.defineProperties(transcript, { scrollHeight: { configurable: true, value: 1800 }, clientHeight: { configurable: true, value: 300 } });
  transcript.scrollTop = 120; fireEvent.scroll(transcript);
  act(() => composer.focus());
  act(() => request.onToolProgress(progress(1, 'Reading: example.com')));
  expect(transcript.scrollTop).toBe(120); expect(document.activeElement).toBe(composer);
});

test('elapsed time is not a fake percentage or a per-second screen reader announcement', async () => {
  const start = Date.now();
  const view = render(<MetabloomWorkStatus progress={{ label: 'Searching the web', summary: 'Reading: example.com', startedAt: start, updatedAt: start }} />);
  const work = screen.getByRole('status', { name: 'Work progress' });
  expect(work).toHaveAttribute('aria-live', 'polite');
  await tick(15000);
  expect(screen.getByText('15s elapsed')).toHaveAttribute('aria-hidden', 'true');
  expect(work).not.toHaveTextContent('%');
  view.unmount(); expect(jest.getTimerCount()).toBe(0);
});
