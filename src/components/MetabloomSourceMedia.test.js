import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MetabloomArticlePreview, MetabloomPublisherIcon } from './MetabloomSourceMedia';
import { requestMetabloomSourcePreview } from './metabloomSourceMediaClient';
import { metabloomSourceMediaUrl } from './metabloomSourceMediaProtocol';

jest.mock('./metabloomSourceMediaClient', () => ({ requestMetabloomSourcePreview: jest.fn() }));
const source = { id: 1, title: 'Fictional published article', url: 'https://publisher.example.test/original?story=1' };
const token = 'signed.article.source';
const media = (selectedToken = token) => ({ version: '1', isArticle: true,
  image: { src: metabloomSourceMediaUrl(selectedToken, 'image'), alt: 'The original article’s image.' },
  icon: { src: metabloomSourceMediaUrl(selectedToken, 'icon') } });
const originalObserver = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
beforeEach(() => {
  requestMetabloomSourcePreview.mockReset();
  Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
});
afterEach(() => {
  if (originalObserver) Object.defineProperty(window, 'IntersectionObserver', originalObserver);
  else delete window.IntersectionObserver;
});

test('keeps the original source usable while media loads, then mounts only its authenticated lazy image', async () => {
  let finish;
  requestMetabloomSourcePreview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<div className="orb-page"><MetabloomArticlePreview source={source} token={token} publisher="Fictional publisher" /></div>);
  const reserved = container.querySelector('.metabloom-source-preview__image-area');
  expect(screen.getByRole('link', { name: /Open source: Fictional published article/ })).toHaveAttribute('href', source.url);
  expect(screen.getByText('publisher.example.test')).toBeInTheDocument();
  expect(screen.getByText('Fictional publisher')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await act(async () => finish(media()));
  const image = screen.getByRole('img', { name: 'The original article’s image.' });
  expect(image).toHaveAttribute('src', metabloomSourceMediaUrl(token, 'image'));
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('width', '640');
  expect(image).toHaveAttribute('height', '360');
  expect(container.querySelector('.metabloom-source-preview__image-area')).toBe(reserved);
  fireEvent.load(image);
  expect(container.querySelector('.metabloom-source-preview')).toHaveAttribute('data-preview-state', 'ready');
  const link = screen.getByRole('link', { name: /Read article: Fictional published article/ });
  expect(link).toHaveAttribute('href', source.url);
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('article image failure leaves a stable source card and complete outbound action', async () => {
  requestMetabloomSourcePreview.mockResolvedValue(media());
  const { container } = render(<div className="orb-page"><MetabloomArticlePreview source={source} token={token} /></div>);
  const reserved = container.querySelector('.metabloom-source-preview__image-area');
  const image = await screen.findByRole('img', { name: 'The original article’s image.' });
  fireEvent.error(image);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(source.title)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Read article:/ })).toHaveAttribute('href', source.url);
  expect(container.querySelector('.metabloom-source-preview__image-area')).toBe(reserved);
  expect(container.querySelector('.metabloom-source-preview')).toHaveAttribute('data-preview-state', 'unavailable');
});

test('a compact preview identifies its canonical article and source number before and after image loading', async () => {
  let finish;
  const syndicated = { ...source, id: 13, title: 'Wire report: a fictional coastal agency announces a new ferry service' };
  requestMetabloomSourcePreview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<div className="orb-page"><MetabloomArticlePreview source={syndicated}
    token={token} publisher="Fictional wire service" compact /></div>);
  expect(screen.getByText(syndicated.title)).toBeVisible();
  expect(screen.getByText('Source 13')).toBeVisible();
  expect(screen.getByText('publisher.example.test')).toBeVisible();
  const articleLink = screen.getByRole('link', { name: `Open source: ${syndicated.title}` });
  expect(articleLink).toHaveAttribute('href', syndicated.url);
  expect(articleLink).toHaveAttribute('title', syndicated.title);
  await act(async () => finish(media()));
  const image = screen.getByRole('img', { name: 'The original article’s image.' });
  fireEvent.load(image);
  expect(screen.getByText(syndicated.title)).toBeVisible();
  expect(screen.getByRole('link', { name: `Read article: ${syndicated.title}` })).toBe(articleLink);
  fireEvent.error(image);
  expect(screen.getByText(syndicated.title)).toBeVisible();
  expect(screen.getByText('Source 13')).toBeVisible();
  expect(articleLink).toHaveAttribute('href', syndicated.url);
  expect(view.container.querySelector('.metabloom-source-preview__image-area')).toHaveAttribute('hidden');
});

test.each(['unavailable', 'not an article'])('uses a text-complete card when preview is %s', async mode => {
  if (mode === 'unavailable') requestMetabloomSourcePreview.mockRejectedValue(new Error('Private server detail'));
  else requestMetabloomSourcePreview.mockResolvedValue({ version: '1', isArticle: false, image: null, icon: null });
  render(<div className="orb-page"><MetabloomArticlePreview source={source} token={token} /></div>);
  await act(async () => {});
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open source:/ })).toHaveAttribute('href', source.url);
  expect(screen.queryByText(/Private server detail/)).not.toBeInTheDocument();
});

test('defers metadata until near the viewport and aborts the bounded request on unmount', async () => {
  let observe, finish;
  const disconnect = jest.fn();
  window.IntersectionObserver = jest.fn(callback => { observe = callback; return { observe: jest.fn(), disconnect }; });
  requestMetabloomSourcePreview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<MetabloomArticlePreview source={source} token={token} />);
  expect(requestMetabloomSourcePreview).not.toHaveBeenCalled();
  act(() => observe([{ isIntersecting: false }]));
  expect(requestMetabloomSourcePreview).not.toHaveBeenCalled();
  act(() => observe([{ isIntersecting: true }]));
  act(() => observe([{ isIntersecting: true }]));
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(1);
  const signal = requestMetabloomSourcePreview.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(disconnect).toHaveBeenCalled();
  await act(async () => finish(media()));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('a changed source ignores late metadata from the previous token', async () => {
  const finishes = [];
  requestMetabloomSourcePreview.mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
  const view = render(<MetabloomArticlePreview source={source} token={token} />);
  const oldSignal = requestMetabloomSourcePreview.mock.calls[0][1].signal;
  const next = { ...source, id: 2, title: 'Second source article', url: 'https://second.example.test/story' };
  view.rerender(<MetabloomArticlePreview source={next} token="signed.second.source" />);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishes[0](media()));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await act(async () => finishes[1](media('signed.second.source')));
  expect(screen.getByRole('img')).toHaveAttribute('src', metabloomSourceMediaUrl('signed.second.source', 'image'));
  expect(screen.getByRole('link', { name: /Read article: Second source article/ })).toHaveAttribute('href', next.url);
});

test('publisher icons recover their neutral fallback without retaining a broken image or stale token', () => {
  const view = render(<MetabloomPublisherIcon token={token} />);
  const first = view.container.querySelector('img');
  expect(first).toHaveAttribute('src', metabloomSourceMediaUrl(token, 'icon'));
  expect(first).toHaveAttribute('alt', '');
  fireEvent.error(first);
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.querySelector('.metabloom-source-icon svg')).not.toBeNull();
  view.rerender(<MetabloomPublisherIcon token="second.site.token" />);
  expect(view.container.querySelector('img')).toHaveAttribute('src', metabloomSourceMediaUrl('second.site.token', 'icon'));
});

const candidates = () => [1, 2, 3, 4].map(id => ({
  source: { id, title: `Cited article ${id}`, url: `https://publisher${id}.example.test/article?utm_source=openai` },
  token: `signed.article.${id}`, publisher: `Publisher ${id}`,
}));

test.each(['missing image', 'metadata unavailable', 'not an article'])(
  'tries another cited article when the primary has %s and keeps the successful image with its own source link', async reason => {
    const entries = candidates();
    requestMetabloomSourcePreview.mockImplementation(selected => {
      if (selected === entries[0].token) return reason === 'metadata unavailable'
        ? Promise.reject(new Error('Unavailable publisher'))
        : Promise.resolve({ version: '1', isArticle: reason !== 'not an article', image: null, icon: null });
      return Promise.resolve(media(selected));
    });
    const view = render(<MetabloomArticlePreview candidates={entries} compact />);
    const image = await screen.findByRole('img', { name: 'The original article’s image.' });
    fireEvent.load(image);
    expect(image).toHaveAttribute('src', metabloomSourceMediaUrl(entries[1].token, 'image'));
    expect(screen.getByRole('link', { name: 'Read article: Cited article 2' })).toHaveAttribute('href', entries[1].source.url);
    expect(screen.getByText('Publisher 2')).toBeInTheDocument();
    expect(screen.getByText('Cited article 2')).toBeVisible();
    expect(screen.getByText('Source 2')).toBeVisible();
    expect(screen.queryByText('Source 1')).not.toBeInTheDocument();
    expect(requestMetabloomSourcePreview.mock.calls.map(([selected]) => selected)).toEqual(entries.slice(0, 2).map(entry => entry.token));
    view.rerender(<MetabloomArticlePreview candidates={candidates()} compact />);
    expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('.metabloom-source-preview')).toHaveAttribute('data-preview-state', 'ready');
  },
);

test('failed image delivery advances to a cited alternate while a successful primary does not load other sources', async () => {
  const entries = candidates();
  requestMetabloomSourcePreview.mockImplementation(selected => Promise.resolve(media(selected)));
  render(<MetabloomArticlePreview candidates={entries} compact />);
  const first = await screen.findByRole('img', { name: 'The original article’s image.' });
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(1);
  fireEvent.error(first);
  await act(async () => {});
  const second = screen.getByRole('img', { name: 'The original article’s image.' });
  expect(second).toHaveAttribute('src', metabloomSourceMediaUrl(entries[1].token, 'image'));
  fireEvent.load(second);
  expect(screen.getByRole('link', { name: 'Read article: Cited article 2' })).toHaveAttribute('href', entries[1].source.url);
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(2);
});

test('an exhausted compact preview keeps the original article title and link without an empty photo placeholder', async () => {
  const entries = candidates();
  requestMetabloomSourcePreview.mockResolvedValue({ version: '1', isArticle: true, image: null, icon: null });
  const view = render(<MetabloomArticlePreview candidates={entries} compact />);
  const reserved = view.container.querySelector('.metabloom-source-preview__image-area');
  await act(async () => {});
  expect(requestMetabloomSourcePreview.mock.calls.map(([selected]) => selected)).toEqual(entries.slice(0, 3).map(entry => entry.token));
  expect(screen.getByRole('link', { name: 'Read article: Cited article 1' })).toHaveAttribute('href', entries[0].source.url);
  expect(screen.getByText('Publisher 1')).toBeInTheDocument();
  expect(screen.getByText('Cited article 1')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(view.container.querySelector('.metabloom-source-preview__image-area')).toBe(reserved);
  expect(reserved).toHaveAttribute('hidden');
  expect(view.container.querySelector('.metabloom-source-preview')).toHaveAttribute('data-preview-state', 'unavailable');
});

test('a compact preview only removes its reserved image area after every image delivery fails', async () => {
  const entries = candidates().slice(0, 2);
  requestMetabloomSourcePreview.mockImplementation(selected => Promise.resolve(media(selected)));
  const view = render(<MetabloomArticlePreview candidates={entries} compact />);
  const reserved = view.container.querySelector('.metabloom-source-preview__image-area');
  const first = await screen.findByRole('img', { name: 'The original article’s image.' });
  expect(reserved).not.toHaveAttribute('hidden');
  fireEvent.error(first);
  await act(async () => {});
  const alternate = screen.getByRole('img', { name: 'The original article’s image.' });
  expect(alternate).toHaveAttribute('src', metabloomSourceMediaUrl(entries[1].token, 'image'));
  expect(reserved).not.toHaveAttribute('hidden');
  fireEvent.error(alternate);
  expect(reserved).toHaveAttribute('hidden');
  expect(screen.getByText('Cited article 1')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Read article: Cited article 1' })).toHaveAttribute('href', entries[0].source.url);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(2);
});

test('unmounting during an alternate lookup aborts it and never advances to another source', async () => {
  let finish;
  requestMetabloomSourcePreview.mockImplementation(selected => selected === 'signed.article.1'
    ? Promise.resolve({ version: '1', isArticle: true, image: null, icon: null })
    : new Promise(resolve => { finish = resolve; }));
  const view = render(<MetabloomArticlePreview candidates={candidates()} />);
  await act(async () => {});
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(2);
  const signal = requestMetabloomSourcePreview.mock.calls[1][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ version: '1', isArticle: true, image: null, icon: null }));
  expect(requestMetabloomSourcePreview).toHaveBeenCalledTimes(2);
});
