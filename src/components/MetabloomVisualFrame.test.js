import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import MetabloomVisualFrame from './MetabloomVisualFrame';

const spec = {
  kind: 'table', title: 'Project estimates', summary: 'Your supplied estimates.',
  columns: ['Project', 'Hours'], rows: [['Website', '20']],
  provenance: { type: 'user', label: 'User-provided values.' },
};
const pending = { id: 'visual-transition', kind: 'table', status: 'generating' };
const ready = { ...pending, status: 'ready', spec };
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const originalResizeObserver = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
let animations;
let observers;
let mediaListeners;
let motion;
let hidden;
let pendingHeight;
let readyHeight;

const restoreProperty = (owner, name, descriptor) => {
  if (descriptor) Object.defineProperty(owner, name, descriptor);
  else delete owner[name];
};

beforeEach(() => {
  animations = [];
  observers = [];
  mediaListeners = new Set();
  pendingHeight = 180;
  readyHeight = 460;
  hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  motion = {
    matches: false,
    addEventListener: jest.fn((_event, listener) => mediaListeners.add(listener)),
    removeEventListener: jest.fn((_event, listener) => mediaListeners.delete(listener)),
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: jest.fn(() => motion) });
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: jest.fn(callback => {
    const observer = { callback, observe: jest.fn(), disconnect: jest.fn() };
    observers.push(observer);
    return observer;
  }) });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: jest.fn(function (keyframes, options) {
    const animation = {
      target: this, keyframes, options, onfinish: null, cancel: jest.fn(),
      finish: jest.fn(() => animation.onfinish?.()),
    };
    animations.push(animation);
    return animation;
  }) });
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const height = this.dataset.visualState === 'generating' ? pendingHeight : readyHeight;
    return { x: 0, y: 0, top: 0, left: 0, right: 620, bottom: height, width: 620, height };
  });
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  restoreProperty(HTMLElement.prototype, 'animate', originalAnimate);
  restoreProperty(window, 'ResizeObserver', originalResizeObserver);
  restoreProperty(window, 'matchMedia', originalMatchMedia);
});

test('waits for the measured expansion to settle before announcing ready', () => {
  const onReady = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
  const frame = screen.getByRole('region', { name: 'Visual answer' });
  expect(observers[0].observe).toHaveBeenCalledWith(frame);
  pendingHeight = 220;
  act(() => observers[0].callback());

  view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  expect(screen.getByRole('heading', { name: 'Project estimates' })).toBeInTheDocument();
  expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  expect(animations).toHaveLength(2);
  const expansion = animations.find(animation => animation.target === frame);
  const reveal = animations.find(animation => animation.target.classList.contains('metabloom-visual__content'));
  expect(expansion.keyframes.map(keyframe => keyframe.height)).toEqual(['220px', '460px']);
  expect(reveal.options).toEqual(expansion.options);
  act(() => reveal.finish());
  expect(onReady).not.toHaveBeenCalled();

  act(() => expansion.finish());
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(mediaListeners.size).toBe(0);
  view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  expect(animations).toHaveLength(2);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test.each(['reduced motion', 'hidden document', 'unavailable animation API', 'unchanged height'])(
  'announces ready immediately with %s', mode => {
    const onReady = jest.fn();
    const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
    if (mode === 'reduced motion') motion.matches = true;
    if (mode === 'hidden document') hidden.mockReturnValue(true);
    if (mode === 'unavailable animation API') HTMLElement.prototype.animate = undefined;
    if (mode === 'unchanged height') readyHeight = pendingHeight;

    view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop visual' })).not.toBeInTheDocument();
  },
);

test('an initially ready artifact is immediately available without a pending animation', () => {
  const onReady = jest.fn();
  render(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(animations).toHaveLength(0);
  expect(observers).toHaveLength(0);
});

test('disconnects pending measurements when the frame unmounts', () => {
  const onReady = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
  view.unmount();
  expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  expect(onReady).not.toHaveBeenCalled();
  expect(animations).toHaveLength(0);
});

test.each(['cancelled', 'failed', 'unmounted'])('cleans up an expansion that is %s without a stale ready signal', state => {
  const onReady = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
  view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  if (state === 'unmounted') view.unmount();
  else view.rerender(<MetabloomVisualFrame artifact={{ ...pending, status: state }} onReady={onReady} />);

  expect(animations).toHaveLength(2);
  for (const animation of animations) {
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(animation.onfinish).toBeNull();
  }
  expect(mediaListeners.size).toBe(0);
  act(() => {
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  for (const animation of animations) expect(animation.finish).not.toHaveBeenCalled();
  act(() => animations.forEach(animation => animation.finish()));
  expect(onReady).not.toHaveBeenCalled();
});

test('settles an active expansion when reduced motion is enabled', () => {
  const onReady = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
  view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  act(() => {
    motion.matches = true;
    for (const listener of mediaListeners) listener({ matches: true });
  });
  expect(animations).toHaveLength(2);
  for (const animation of animations) expect(animation.finish).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(mediaListeners.size).toBe(0);
});

test('settles an active expansion when the document becomes hidden and removes its visibility listener', () => {
  const add = jest.spyOn(document, 'addEventListener');
  const remove = jest.spyOn(document, 'removeEventListener');
  const onReady = jest.fn();
  const view = render(<MetabloomVisualFrame artifact={pending} onReady={onReady} />);
  view.rerender(<MetabloomVisualFrame artifact={ready} onReady={onReady} />);
  const listener = add.mock.calls.find(([event]) => event === 'visibilitychange')?.[1];
  expect(listener).toEqual(expect.any(Function));
  act(() => {
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(animations).toHaveLength(2);
  for (const animation of animations) expect(animation.finish).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('visibilitychange', listener);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  for (const animation of animations) expect(animation.finish).toHaveBeenCalledTimes(1);
});
