import { createSourceMediaResolver } from './metabloomSourceMediaResolver';

const deferredRequest = () => {
  const calls = [];
  const request = jest.fn((token, { signal }) => new Promise((resolve, reject) => {
    calls.push({ token, signal, resolve, reject });
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
  }));
  return { calls, request };
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('waits until retained and started, then runs the most urgent previews within its concurrency bound', async () => {
  const { calls, request } = deferredRequest();
  const resolver = createSourceMediaResolver({ request, concurrency: 2 });
  ['far', 'next', 'active', 'later'].forEach((token, index) => resolver.preview(token, [6, 3, 0, 9][index]));
  await flush();
  expect(request).not.toHaveBeenCalled();
  const release = resolver.retain();
  await flush();
  expect(request).not.toHaveBeenCalled();
  resolver.start();
  await flush();
  expect(calls.map(call => call.token)).toEqual(['active', 'next']);
  resolver.preview('later', 1);
  calls[0].resolve({ token: 'active' });
  await flush();
  expect(calls.map(call => call.token)).toEqual(['active', 'next', 'later']);
  release();
});

test('repeated slide requests share one publisher lookup and its settled result', async () => {
  const { calls, request } = deferredRequest();
  const resolver = createSourceMediaResolver({ request });
  const release = resolver.retain(); resolver.start();
  const first = resolver.preview('shared', 4);
  const second = resolver.preview('shared', 0);
  await flush();
  expect(request).toHaveBeenCalledTimes(1);
  calls[0].resolve({ image: null });
  await expect(first).resolves.toEqual({ image: null });
  await expect(second).resolves.toEqual({ image: null });
  await expect(resolver.preview('shared', 0)).resolves.toEqual({ image: null });
  expect(request).toHaveBeenCalledTimes(1);
  release();
});

test('the last release aborts running work, rejects queued work, and a later retain starts clean', async () => {
  const { calls, request } = deferredRequest();
  const resolver = createSourceMediaResolver({ request, concurrency: 1 });
  const release = resolver.retain(); resolver.start();
  const running = resolver.preview('running');
  const queued = resolver.preview('queued');
  await flush();
  const second = resolver.retain();
  release();
  expect(calls[0].signal.aborted).toBe(false);
  second();
  expect(calls[0].signal.aborted).toBe(true);
  await expect(running).rejects.toThrow();
  await expect(queued).rejects.toThrow();
  const remount = resolver.retain();
  const again = resolver.preview('running');
  await flush();
  expect(calls).toHaveLength(2);
  calls[1].resolve({ image: null });
  await expect(again).resolves.toEqual({ image: null });
  remount(); remount();
});
