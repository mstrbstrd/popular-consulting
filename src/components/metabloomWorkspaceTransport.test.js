import { requestMetabloomResponse } from './metabloomApiClient';
import { createMetabloomSegmentStreamDecoder } from './metabloomEmoteProtocol';
import { canonicalWorkspacePayload, parseMetabloomWorkspaceProposal } from './metabloomWorkspaceProtocol';
const { createHash } = require('node:crypto');
const { TextEncoder } = require('node:util');
global.TextEncoder = TextEncoder;
const conversationId = '12345678-1234-4123-8123-123456789abc';
const workspaceContext = { version: 1, status: 'connected', conversationId, workspaceInstanceId: 'invoice-one',
  bindingEpoch: 2, dataRevision: 3, fields: { companyName: 'Demo Studio' }, items: [], missing: ['Add a line'], ready: false };
const sign = value => ({ ...value, payloadHash: createHash('sha256').update(canonicalWorkspacePayload(value)).digest('hex') });
const proposal = () => sign({ type: 'invoice_workspace', version: 1, command: 'update', requestId: 'request-one', operationId: 'operation-one',
  conversationId, workspaceInstanceId: 'invoice-one', bindingEpoch: 2, expectedDataRevision: 3,
  changes: [{ field: 'companyName', value: 'New Studio', sourceText: 'New Studio' }], lineChanges: [], section: null });
const opening = () => [
  { type: 'emote', phase: 'input', emote: 'neutral' }, { type: 'action', action: 'none' },
  { type: 'agent_status', state: 'working' },
  { type: 'tool_activity', name: 'update_invoice_workspace', callId: 'change-one', state: 'running' },
  { type: 'tool_activity', name: 'update_invoice_workspace', callId: 'change-one', state: 'complete' },
  { type: 'agent_status', state: 'reviewing' }, { type: 'agent_status', state: 'validating' },
  { type: 'segment', index: 0, response: 'The invoice change is prepared.' }, { type: 'text_complete' },
];
const closing = () => [{ type: 'emote', phase: 'response', emote: 'neutral' }, { type: 'done', version: '2.0.0' }];
const lines = events => events.map(JSON.stringify).join('\n') + '\n';
const transport = events => jest.fn(async () => ({ ok: true, status: 200,
  headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null }, text: async () => lines(events) }));
const request = (fetchImpl, extra = {}) => requestMetabloomResponse({ message: 'Use New Studio', requestId: 'request-one',
  conversationId, workspaceContext, fetchImpl, ...extra });

test('negotiates bounded workspace context and exposes prepared metadata only after complete valid transport', async () => {
  const onWorkspaceProposal = jest.fn(), fetchImpl = transport([...opening(), proposal(), ...closing()]);
  const value = await request(fetchImpl, { onWorkspaceProposal });
  expect(value.workspaceProposal).toEqual(proposal());
  expect(onWorkspaceProposal).toHaveBeenCalledTimes(1);
  const options = fetchImpl.mock.calls[0][1];
  expect(options.headers['X-Metabloom-Workspace']).toBe('1');
  expect(JSON.parse(options.body).workspaceContext).toEqual(workspaceContext);
  expect(value.segments[0].response).toBe('The invoice change is prepared.');
});

test.each([
  ['missing terminal record', [...opening(), proposal()]],
  ['extra records after terminal', [...opening(), proposal(), ...closing(), { type: 'text_complete' }]],
  ['duplicate proposal', [...opening(), proposal(), proposal(), ...closing()]],
  ['wrong request', [...opening(), { ...proposal(), requestId: 'another-request' }, ...closing()]],
  ['proposal before text completion', [...opening().slice(0, -1), proposal(), { type: 'text_complete' }, ...closing()]],
  ['operation without metadata', [...opening(), ...closing()]],
  ['mismatched command', [...opening(), sign({ ...proposal(), command: 'focus', section: 'items', changes: [] }), ...closing()]],
])('rejects %s without delivering a page operation', async (_, events) => {
  const onWorkspaceProposal = jest.fn();
  await expect(request(transport(events), { onWorkspaceProposal })).rejects.toMatchObject({ code: 'invalid_response' });
  expect(onWorkspaceProposal).not.toHaveBeenCalled();
});

test('old clients reject workspace vocabulary and research requests cannot attach local invoice context', async () => {
  const old = transport([...opening(), proposal(), ...closing()]);
  await expect(requestMetabloomResponse({ message: 'Edit', requestId: 'request-one', conversationId, fetchImpl: old }))
    .rejects.toMatchObject({ code: 'invalid_response' });
  expect(old.mock.calls[0][1].headers['X-Metabloom-Workspace']).toBeUndefined();
  const never = jest.fn();
  await expect(request(never, { actionMode: 'deep-research' })).rejects.toMatchObject({ code: 'invalid_request' });
  await expect(request(never, { toolset: false })).rejects.toMatchObject({ code: 'invalid_request' });
  expect(never).not.toHaveBeenCalled();
});

test('invalid scope and oversized combined history are rejected before provider transport', async () => {
  const fetchImpl = jest.fn();
  await expect(request(fetchImpl, { workspaceContext: { ...workspaceContext, fields: { logoDataUrl: 'private' } } }))
    .rejects.toMatchObject({ code: 'invalid_request' });
  await expect(request(fetchImpl, { workspaceContext: { ...workspaceContext, conversationId: '22345678-1234-4123-8123-123456789abc' } }))
    .rejects.toMatchObject({ code: 'invalid_request' });
  await expect(request(fetchImpl, { history: [{ role: 'user', content: '界'.repeat(22000) }] })).rejects.toMatchObject({ code: 'invalid_request' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('negotiated 24k to 32KiB workspace records pass the outer visual wrapper and strict workspace parser', async () => {
  const value = sign({ ...proposal(), changes: [], lineChanges: Array.from({ length: 14 }, () => ({ op: 'add', id: null,
    sourceText: 'x'.repeat(800), changes: [{ field: 'description', value: 'x'.repeat(400), sourceText: 'x'.repeat(800) }] })) });
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  expect(bytes).toBeGreaterThan(24000); expect(bytes).toBeLessThanOrEqual(32768);
  expect(parseMetabloomWorkspaceProposal(value)).not.toBeNull();
  expect((await request(transport([...opening(), value, ...closing()]))).workspaceProposal).toEqual(value);
});

test('the workspace event limit counts UTF-8 bytes and ordinary records keep their 24k limit', async () => {
  const value = sign({ ...proposal(), changes: [], lineChanges: Array.from({ length: 10 }, () => ({ op: 'add', id: null,
    sourceText: '界'.repeat(800), changes: [{ field: 'description', value: '界'.repeat(400), sourceText: '界'.repeat(800) }] })) });
  expect(JSON.stringify(value).length).toBeLessThan(24000);
  expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeGreaterThan(32768);
  await expect(request(transport([...opening(), value, ...closing()]))).rejects.toMatchObject({ code: 'invalid_response' });
  const decoder = createMetabloomSegmentStreamDecoder({ allowTools: true, allowWorkspace: true, requestId: 'request-one' });
  expect(decoder.push(JSON.stringify({ type: 'segment', index: 0, response: 'x'.repeat(24001) }) + '\n')).toBe(false);
});

test('cancellation after staged proposal but before EOF never invokes the proposal callback', async () => {
  const abort = new AbortController(), onWorkspaceProposal = jest.fn();
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null },
    text: async () => { abort.abort(); return lines([...opening(), proposal(), ...closing()]); } }));
  await expect(request(fetchImpl, { signal: abort.signal, onWorkspaceProposal })).rejects.toMatchObject({ code: 'cancelled' });
  expect(onWorkspaceProposal).not.toHaveBeenCalled();
});


test('proposal metadata must match the captured document, revision and conversation', async () => {
  for (const change of [{ workspaceInstanceId: 'another-invoice' }, { bindingEpoch: 3 }, { expectedDataRevision: 4 },
    { conversationId: '22345678-1234-4123-8123-123456789abc' }]) {
    const onWorkspaceProposal = jest.fn();
    await expect(request(transport([...opening(), sign({ ...proposal(), ...change }), ...closing()]), { onWorkspaceProposal }))
      .rejects.toMatchObject({ code: 'invalid_response' });
    expect(onWorkspaceProposal).not.toHaveBeenCalled();
  }
});
