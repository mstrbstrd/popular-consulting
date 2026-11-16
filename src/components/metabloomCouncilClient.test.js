import { requestMetabloomCouncil } from './metabloomCouncilClient';
import { councilStep } from './metabloomCouncilProtocol';
const { TextEncoder, TextDecoder } = require('util');
const members = [{ provider: 'openai', model: 'gpt-5-mini' }, { provider: 'deepseek', model: 'deepseek-flash' }, { provider: 'anthropic', model: 'claude-sonnet' }];
const events = () => [{ type: 'council_start', members, chair: 'openai' }, ...Array.from({ length: 7 }, (_, index) => [
  { type: 'council_step', index, state: 'running' }, { type: 'council_step', index, state: 'complete', text: `Reply ${index}` }]).flat(), { type: 'council_done' }];
const response = (records, options = {}) => {
  const chunks = records.map(e => new TextEncoder().encode(JSON.stringify(e) + '\n'));
  const reader = { read: jest.fn(async () => chunks.length ? { value: chunks.shift(), done: false } : { done: true }), cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  return { ok: true, status: 200, headers: { get: key => key === 'content-type' ? 'application/x-ndjson' : null }, body: { getReader: () => reader }, ...options };
};
beforeAll(() => { global.TextDecoder = TextDecoder; });
test('live events precede completion and all dialogue is retained in the final envelope', async () => {
  const seen = [], fetchImpl = jest.fn(async () => response(events()));
  const reply = await requestMetabloomCouncil({ message: 'Ask the council', history: [], requestId: 'one', fetchImpl, onEvent: event => seen.push(event) });
  expect(seen).toHaveLength(16); expect(reply.segments).toHaveLength(4);
  expect(reply.segments[0].response).toContain('Reply 3'); expect(reply.segments[3].response).toContain('Reply 6');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ message: 'Ask the council', history: [], requestId: 'one' });
});
test.each(['missing', 'duplicate', 'invalid', 'error', 'after_done'])('rejects %s terminal stream without manufacturing a council answer', async kind => {
  const records = events();
  if (kind === 'missing') records.pop();
  if (kind === 'duplicate') records.splice(3, 0, records[2]);
  if (kind === 'invalid') records[2].text = 'x'.repeat(councilStep(0, members, 'openai').limit + 1);
  if (kind === 'error') records.splice(4, records.length, { type: 'error', code: 'provider_unavailable' });
  if (kind === 'after_done') records.push(records[2]);
  await expect(requestMetabloomCouncil({ message: 'Hi', fetchImpl: async () => response(records) })).rejects.toThrow();
});
test('pre-aborted requests cannot start network work', async () => {
  const controller = new AbortController(); controller.abort(); const fetchImpl = jest.fn();
  await expect(requestMetabloomCouncil({ message: 'Hi', signal: controller.signal, fetchImpl })).rejects.toMatchObject({ code: 'cancelled' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('correction events stream without committing an invalid draft or duplicating a saved contribution', async () => {
  const records = events(), seen = [];
  records.splice(10, 0, { type: 'council_step', index: 4, state: 'repairing' });
  const reply = await requestMetabloomCouncil({ message: 'Hi', fetchImpl: async () => response(records), onEvent: event => seen.push(event) });
  expect(seen).toHaveLength(17); expect(seen[10].state).toBe('repairing');
  expect(reply.segments[1].response).toContain('Reply 4'); expect(reply.segments).toHaveLength(4);
  records.splice(10, 0, records[10]);
  await expect(requestMetabloomCouncil({ message: 'Hi', fetchImpl: async () => response(records) })).rejects.toThrow();
});
test('cancellation during a contribution prevents the next event from arriving', async () => {
  const controller = new AbortController(), seen = [];
  await expect(requestMetabloomCouncil({ message: 'Hi', signal: controller.signal, fetchImpl: async () => response(events()),
    onEvent: event => { seen.push(event); controller.abort(); } })).rejects.toMatchObject({ code: 'cancelled' });
  expect(seen).toHaveLength(1);
});
