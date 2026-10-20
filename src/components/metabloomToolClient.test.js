const { TextEncoder, TextDecoder } = require('util');
const { postMetabloomTool } = require('./metabloomToolClient');
const { getMetabloomApiErrorMessage } = require('./metabloomRequestErrors');

const encoders = { TextEncoder: global.TextEncoder, TextDecoder: global.TextDecoder };
beforeAll(() => { global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder; });
afterAll(() => { global.TextEncoder = encoders.TextEncoder; global.TextDecoder = encoders.TextDecoder; });
const request = { phase: 'start', message: 'Create a pie chart.', history: [], requestId: 'mount-1' };
const requestRef = '012345abcdef';
const headerRef = 'abcdef012345';
function response(payload, { status = 200, contentType = 'application/json', reference = headerRef } = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const reader = { read: jest.fn().mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(text) })
    .mockResolvedValue({ done: true }), cancel: jest.fn().mockResolvedValue(), releaseLock: jest.fn() };
  return { ok: status >= 200 && status < 300, status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType
      : name.toLowerCase() === 'x-metabloom-request-ref' ? reference : null },
    body: { getReader: jest.fn(() => reader), cancel: jest.fn().mockResolvedValue() }, reader };
}

test('preserves the start timeout and safe reference from a 504 without retrying paid work', async () => {
  const reply = response({ code: 'tool_timeout', requestRef, message: 'Private provider diagnostic' }, { status: 504 });
  const fetchImpl = jest.fn().mockResolvedValue(reply);
  await expect(postMetabloomTool(request, { fetchImpl })).rejects.toMatchObject({
    code: 'tool_timeout', status: 504, requestRef, message: getMetabloomApiErrorMessage('tool_timeout'),
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(reply.reader.cancel).toHaveBeenCalled();
  expect(reply.reader.releaseLock).toHaveBeenCalledTimes(1);
});

test.each([
  [401, 'authentication_required'], [429, 'rate_limited'], [503, 'tool_disabled'],
  [502, 'tool_invalid'], [502, 'tool_output_limit'], [502, 'model_configuration_error'],
  [502, 'provider_authentication_failed'], [502, 'provider_rate_limited'], [502, 'provider_unavailable'],
])('keeps the actionable %s / %s error vocabulary', async (status, code) => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ code, requestRef }, { status }));
  await expect(postMetabloomTool(request, { fetchImpl })).rejects.toMatchObject({
    code, status, requestRef, message: getMetabloomApiErrorMessage(code),
  });
});

test('recognizes a non-JSON platform timeout without copying its HTML', async () => {
  const reply = response('<html>Private platform stack</html>', { status: 504, contentType: 'text/html' });
  const failure = await postMetabloomTool(request, { fetchImpl: async () => reply }).catch(error => error);
  expect(failure).toMatchObject({ code: 'tool_timeout', status: 504, requestRef: headerRef });
  expect(failure.message).not.toMatch(/html|Private|stack/);
  expect(reply.body.getReader).not.toHaveBeenCalled();
  expect(reply.body.cancel).toHaveBeenCalledTimes(1);
});

test.each(['constructor', '__proto__', 'Private provider diagnostic'])('rejects unknown code %s and an unsafe body reference', async code => {
  const failure = await postMetabloomTool(request, {
    fetchImpl: async () => response({ code, requestRef: `${requestRef}\n`, error: 'Private provider diagnostic' }, { status: 502 }),
  }).catch(error => error);
  expect(failure).toMatchObject({ code: 'tool_unavailable', requestRef: headerRef, status: 502 });
  expect(failure.message).not.toContain('Private');
});

test('a malformed reference cannot erase a known error or introduce a diagnostic into the UI', async () => {
  const failure = await postMetabloomTool(request, { fetchImpl: async () => response({
    code: 'tool_timeout', requestRef: 'unsafe reference',
  }, { status: 504, reference: 'ABCDEF012345' }) }).catch(error => error);
  expect(failure).toMatchObject({ code: 'tool_timeout', requestRef: null });
  expect(failure.message).not.toContain('unsafe');
});

test.each(['not-json', 'x'.repeat(4097)])('bounds malformed or oversized HTTP error bodies', async payload => {
  const reply = response(payload, { status: 504 });
  await expect(postMetabloomTool(request, { fetchImpl: async () => reply })).rejects.toMatchObject({
    code: 'tool_timeout', status: 504, requestRef: headerRef,
  });
  expect(reply.reader.cancel).toHaveBeenCalled();
});

test('a cancelled request performs no fetch and remains an AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = jest.fn();
  await expect(postMetabloomTool(request, { signal: controller.signal, fetchImpl })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('cancels a pending response reader and rejects late completion as AbortError', async () => {
  const reply = response({ code: 'tool_timeout' }, { status: 504 });
  let release;
  reply.reader.read.mockReset().mockImplementation(() => new Promise(resolve => { release = resolve; }));
  reply.reader.cancel.mockImplementation(() => { release?.({ done: true }); return Promise.resolve(); });
  const controller = new AbortController();
  const pending = postMetabloomTool(request, { signal: controller.signal, fetchImpl: async () => reply });
  const outcome = pending.catch(error => error);
  await Promise.resolve();
  expect(reply.reader.read).toHaveBeenCalledTimes(1);
  controller.abort();
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(reply.reader.cancel).toHaveBeenCalled();
  expect(reply.reader.releaseLock).toHaveBeenCalledTimes(1);
});

test('network diagnostics never become user-facing messages', async () => {
  const failure = await postMetabloomTool(request, { fetchImpl: async () => { throw new Error('Private request body'); } }).catch(error => error);
  expect(failure).toMatchObject({ code: 'network_error', requestRef: null, status: 0 });
  expect(failure.message).not.toContain('Private');
});

test('successful tool start and continuation still validate their existing contracts', async () => {
  const offer = { version: '1', designVersion: 'aetheris-1', id: 'd'.repeat(48), kind: 'table', expiresAt: Date.now() + 600000 };
  await expect(postMetabloomTool(request, { fetchImpl: async () => response({ offer, emote: 'neutral' }) })).resolves.toEqual({ offer, emote: 'neutral' });
  const reply = { version: '2.0.0', segments: [{ response: 'Your chart is ready.' }] };
  await expect(postMetabloomTool({ phase: 'continue', id: offer.id, display: 'mounted' }, {
    fetchImpl: async () => response({ reply, emote: 'neutral' }),
  })).resolves.toEqual({ reply, emote: 'neutral' });
  await expect(postMetabloomTool(request, { fetchImpl: async () => response({ offer: {}, emote: 'neutral' }) })).rejects.toMatchObject({ code: 'tool_invalid' });
});
