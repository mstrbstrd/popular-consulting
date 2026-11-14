import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import OrbSection from './OrbSection';
import { requestMetabloomSourcePreview } from './metabloomSourceMediaClient';
import { metabloomSourceMediaUrl } from './metabloomSourceMediaProtocol';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('./metabloomSourceMediaClient', () => ({ requestMetabloomSourcePreview: jest.fn() }));

const tick = async ms => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const send = (message = 'Did the harbor bridge reopen?') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};
const tool = state => ({ type: 'tool_activity', name: 'search_web', callId: 'search_1', state });
const status = state => ({ type: 'agent_status', state });
const sources = [{ id: 1, title: 'Agency notice', url: 'https://agency.example.test/notice' },
  { id: 2, title: 'Ceremony report', url: 'https://news.example.test/ceremony' }];
const media = [{ sourceId: 2, token: 'm1.ceremony' }, { sourceId: 1, token: 'm1.notice' }];
const reply = { version: '2.0.0', segments: [{ response: 'It reopened [2] on the announced date [1].' }] };
let request, finish;
beforeEach(() => {
  jest.useFakeTimers();
  requestMetabloomSourcePreview.mockReset();
  requestMetabloomSourcePreview.mockImplementation(token => Promise.resolve({ version: '1', isArticle: token === 'm1.ceremony',
    image: token === 'm1.ceremony' ? { src: metabloomSourceMediaUrl('m1.ceremony-image', 'image'), alt: 'Crowd at the reopened bridge.' } : null,
    icon: null }));
  window.__metabloomRequest = value => { request = value; return new Promise(resolve => { finish = resolve; }); };
});
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null; });
const searchToValidation = async () => {
  send(); await tick(0);
  act(() => {
    request.onAgentStatus(status('working')); request.onToolActivity(tool('running'));
    request.onToolActivity(tool('complete')); request.onAgentStatus(status('reviewing')); request.onAgentStatus(status('validating'));
  });
};

test('a cited search answer shows loaded source photos after its source list, without storing capabilities in the message', async () => {
  render(<OrbSection />); await searchToValidation();
  act(() => {
    expect(request.onSourceMedia(media)).toBe(false);
    expect(request.onSources(sources)).toBe(true);
    expect(request.onSourceMedia(media)).toBe(true);
    expect(request.onSourceMedia(media)).toBe(false);
    request.onSegment(reply.segments[0], 0);
  });
  await act(async () => finish(reply)); await tick(2000);
  const message = screen.getAllByRole('article', { name: 'Metabloom message' }).at(-1);
  const gallery = within(message).getByRole('group', { name: 'Images from cited sources' });
  const list = within(message).getByRole('group', { name: 'Sources for this answer' });
  expect(list.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // The bubble frames only the message text; photo tiles sit below it on the page.
  expect(gallery.closest('.metabloom-chat__bubble')).toBeNull();
  expect(list.closest('.metabloom-chat__bubble')).not.toBeNull();
  expect(requestMetabloomSourcePreview.mock.calls.map(([token]) => token)).toEqual(['m1.ceremony', 'm1.notice']);
  const photo = within(gallery).getByRole('img', { name: 'Crowd at the reopened bridge.' });
  fireEvent.load(photo);
  expect(photo.closest('.metabloom-source-preview')).toHaveAttribute('data-preview-state', 'ready');
  expect(within(gallery).getByRole('link', { name: 'Read article: Ceremony report' })).toHaveAttribute('href', sources[1].url);
  const stored = JSON.stringify(window.__orbMessages());
  expect(stored).not.toContain('m1.ceremony');
  expect(stored).not.toContain('sourceMedia');
});

test('media arriving after answer text, or for a stopped request, is ignored', async () => {
  render(<OrbSection />); await searchToValidation();
  act(() => { request.onSources(sources); request.onSegment(reply.segments[0], 0); });
  act(() => expect(request.onSourceMedia(media)).toBe(false));
  await act(async () => finish(reply)); await tick(2000);
  expect(screen.queryByRole('group', { name: 'Images from cited sources' })).toBeNull();

  send('And the ferry schedule?'); await tick(0);
  const stopped = request;
  act(() => { stopped.onAgentStatus(status('working')); stopped.onToolActivity(tool('running')); stopped.onToolActivity(tool('complete')); });
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  act(() => expect(stopped.onSourceMedia(media)).toBe(false));
  expect(requestMetabloomSourcePreview).not.toHaveBeenCalled();
});

const findImage = state => ({ type: 'tool_activity', name: 'find_image', callId: 'image_1', state });
const photo = { token: 'm1.image-capability', width: 640, height: 960, alt: 'Fictional Singer on stage', title: 'Fictional Singer',
  pageUrl: 'https://en.wikipedia.org/wiki/Fictional_Singer', fileUrl: 'https://commons.wikimedia.org/wiki/File:Singer.jpg',
  artist: 'Example Photographer', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0' };

test('a found subject photo appears above the streaming answer and never enters stored messages', async () => {
  render(<OrbSection />);
  send('Can you show me who Fictional Singer is?'); await tick(0);
  act(() => {
    request.onAgentStatus(status('working'));
    expect(request.onToolImages([photo])).toBe(false);
    request.onToolActivity(findImage('running')); request.onToolActivity(findImage('complete'));
    request.onAgentStatus(status('reviewing')); request.onAgentStatus(status('validating'));
    expect(request.onToolImages([photo])).toBe(true);
    expect(request.onToolImages([photo])).toBe(false);
  });
  act(() => request.onSegment({ response: 'Here is Fictional Singer.' }, 0));
  const message = screen.getAllByRole('article', { name: 'Metabloom message' }).at(-1);
  expect(message).toHaveAttribute('data-stream-status', 'streaming');
  const image = within(message).getByRole('img', { name: 'Fictional Singer on stage' });
  await act(async () => finish({ version: '2.0.0', segments: [{ response: 'Here is Fictional Singer.' }] })); await tick(2000);
  const text = within(message).getByText('Here is Fictional Singer.');
  expect(image.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // The photo sits above the bubble with no surface of its own; the bubble holds only the text.
  expect(image.closest('.metabloom-chat__bubble')).toBeNull();
  expect(text.closest('.metabloom-chat__bubble')).not.toBeNull();
  expect(within(message).getByRole('link', { name: /Wikimedia Commons file page/ })).toHaveAttribute('href', photo.fileUrl);
  const stored = JSON.stringify(window.__orbMessages());
  expect(stored).not.toContain('m1.image-capability');
  expect(stored).not.toContain('commons.wikimedia.org');
});

test('a photo for a stopped request is ignored', async () => {
  render(<OrbSection />);
  send('Can you show me who Fictional Singer is?'); await tick(0);
  const stopped = request;
  act(() => { stopped.onAgentStatus(status('working')); stopped.onToolActivity(findImage('running')); stopped.onToolActivity(findImage('complete')); });
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  act(() => expect(stopped.onToolImages([photo])).toBe(false));
  expect(screen.queryByRole('img', { name: 'Fictional Singer on stage' })).toBeNull();
});
