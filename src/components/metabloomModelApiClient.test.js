import { TextEncoder, TextDecoder } from 'util';
import { requestMetabloomModels } from './metabloomModelApiClient';
import { requestMetabloomResponse } from './metabloomApiClient';
import { defaultModelPreferences } from './metabloomModelProtocol';

const originalDecoder = global.TextDecoder;
beforeEach(() => { global.TextDecoder = TextDecoder; });
afterEach(() => { global.TextDecoder = originalDecoder; });
const jsonResponse = value => {
  let sent = false;
  const reader = { read: jest.fn(async () => { if (sent) return { done: true }; sent = true;
    return { value: new TextEncoder().encode(JSON.stringify(value)), done: false }; }), cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, body: { getReader: () => reader }, reader };
};
test('preferences use the authenticated server endpoint with only the selected provider and model', async () => {
  const selection = { provider: 'anthropic', model: 'latest' }, response = jsonResponse({ preferences: defaultModelPreferences() });
  const fetchImpl = jest.fn(async () => response);
  await requestMetabloomModels({ selection, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith('/api/metabloom-models', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify(selection) }));
  expect(response.reader.cancel).toHaveBeenCalled(); expect(response.reader.releaseLock).toHaveBeenCalled();
});
test('invalid or oversized catalog responses are rejected and their reader is closed', async () => {
  for (const value of [{ version: 1, providers: [] }, { text: 'x'.repeat(131073) }]) {
    const response = jsonResponse(value);
    await expect(requestMetabloomModels({ fetchImpl: async () => response })).rejects.toBeInstanceOf(Error);
    expect(response.reader.cancel).toHaveBeenCalled();
  }
});
test('the chat client forwards the selection and cannot turn its failure into a demo', async () => {
  const modelSelection = { provider: 'deepseek', model: 'deepseek-flash' };
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 503, headers: { get: name => name === 'content-type' ? 'application/json' : null },
    text: async () => JSON.stringify({ code: 'not_configured' }) }));
  await expect(requestMetabloomResponse({ message: 'Hello', modelSelection, optional: true, fetchImpl })).rejects.toMatchObject({ code: 'not_configured' });
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).modelSelection).toEqual(modelSelection);
  await expect(requestMetabloomResponse({ message: 'Hello', modelSelection: { ...modelSelection, apiKey: 'no-client-keys' }, fetchImpl })).rejects.toMatchObject({ code: 'invalid_request' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
