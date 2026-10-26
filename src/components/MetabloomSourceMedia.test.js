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
