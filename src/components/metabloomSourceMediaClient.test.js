const { TextDecoder } = require('util');
const { requestMetabloomSourcePreview, METABLOOM_SOURCE_MEDIA_TIMEOUT_MS } = require('./metabloomSourceMediaClient');
const { metabloomSourceMediaUrl, MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES } = require('./metabloomSourceMediaProtocol');

const originalDecoder = global.TextDecoder;
const token = 'signed.source.token';
const preview = { version: '1', isArticle: true, image: { src: metabloomSourceMediaUrl(token, 'image'), alt: 'Article image.' }, icon: null };
const responseFor = (value = preview, { chunks, status = 200, type = 'application/json' } = {}) => {
  const parts = chunks || [Uint8Array.from(Buffer.from(JSON.stringify(value)))];
  const reader = { read: jest.fn(async () => parts.length ? { value: parts.shift(), done: false } : { done: true }),
    cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  return { reader, response: { status, ok: status >= 200 && status < 300,
    headers: { get: name => name === 'content-type' ? type : null },
    body: { getReader: () => reader, cancel: jest.fn(async () => {}) } } };
};
beforeEach(() => { global.TextDecoder = TextDecoder; });
afterEach(() => { global.TextDecoder = originalDecoder; jest.useRealTimers(); });

test('fetches a bounded validated preview with same-origin credentials and redirect rejection', async () => {
  const { response, reader } = responseFor();
  const fetchImpl = jest.fn(async () => response);
  expect(await requestMetabloomSourcePreview(token, { fetchImpl })).toEqual(preview);
  expect(fetchImpl).toHaveBeenCalledWith(metabloomSourceMediaUrl(token, 'preview'), expect.objectContaining({
    method: 'GET', credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' },
  }));
  expect(reader.cancel).toHaveBeenCalled();
  expect(reader.releaseLock).toHaveBeenCalled();
});

test('rejects an oversized response before parsing or exposing its image', async () => {
  const { response, reader } = responseFor(null, { chunks: [new Uint8Array(MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES + 1)] });
  await expect(requestMetabloomSourcePreview(token, { fetchImpl: async () => response })).rejects.toThrow('Source preview unavailable.');
  expect(reader.cancel).toHaveBeenCalled();
});

test.each([
  ['authentication failure', () => responseFor({ message: 'Private authentication detail.' }, { status: 401 })],
  ['HTML', () => responseFor(null, { type: 'text/html' })],
  ['unsafe image', () => responseFor({ ...preview, image: { src: 'https://attacker.test/image', alt: '' } })],
])('fails locally on %s without surfacing remote details', async (_, create) => {
  const { response } = create();
  await expect(requestMetabloomSourcePreview(token, { fetchImpl: async () => response })).rejects.toThrow('Source preview unavailable.');
});

test('does not start a request that is already aborted', async () => {
  const controller = new AbortController(); controller.abort();
  const fetchImpl = jest.fn();
  await expect(requestMetabloomSourcePreview(token, { fetchImpl, signal: controller.signal })).rejects.toHaveProperty('name', 'AbortError');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('bounds a stalled transport even when it ignores AbortSignal', async () => {
  jest.useFakeTimers();
  const fetchImpl = jest.fn(() => new Promise(() => {}));
  const request = requestMetabloomSourcePreview(token, { fetchImpl });
  const stopped = request.catch(error => error);
  jest.advanceTimersByTime(METABLOOM_SOURCE_MEDIA_TIMEOUT_MS);
  await expect(stopped).resolves.toHaveProperty('name', 'AbortError');
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('cancels a stalled body immediately and ignores a late body result', async () => {
  const controller = new AbortController();
  const { response, reader } = responseFor();
  let finishRead;
  reader.read.mockImplementation(() => new Promise(resolve => { finishRead = resolve; }));
  const request = requestMetabloomSourcePreview(token, { fetchImpl: async () => response, signal: controller.signal });
  const stopped = request.catch(error => error);
  await Promise.resolve();
  controller.abort();
  await expect(stopped).resolves.toHaveProperty('name', 'AbortError');
  expect(reader.cancel).toHaveBeenCalled();
  finishRead({ done: true });
  await Promise.resolve();
});
