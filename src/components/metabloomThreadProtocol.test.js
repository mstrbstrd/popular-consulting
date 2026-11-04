const { TextEncoder } = require('util');
const { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } = require('./metabloomVisualSnapshot');
const { parseMetabloomThreadSnapshot, createMetabloomThreadSnapshot, parseMetabloomThreadMetadata,
  parseMetabloomThreadRequest, parseMetabloomThreadResponse, isMetabloomThreadId,
  MAX_METABLOOM_THREAD_MESSAGES, MAX_METABLOOM_THREAD_VISUALS, MAX_METABLOOM_THREAD_SNAPSHOT_BYTES,
  METABLOOM_THREAD_SNAPSHOT_OPTIONS } = require('./metabloomThreadProtocol');

const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
const copy = value => JSON.parse(JSON.stringify(value));
const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const sourceId = 'a'.repeat(48), artifactVersion = 'b'.repeat(32), briefId = 'c'.repeat(32);
const snapshot = () => ({ schemaVersion: 1, conversation: {
  messages: [{ id: 'user-1', role: 'user', content: 'Fictional question', status: 'complete' },
    { id: 'assistant-2', role: 'assistant', content: 'Fictional response', status: 'complete' }],
  counter: 2, draft: '', deepResearch: false },
visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const metadata = (overrides = {}) => ({ threadId: id, title: 'Fictional thread', version: 1,
  createdAt: '2026-11-04T12:00:00.000Z', updatedAt: '2026-11-04T12:00:00.000Z', messageCount: 2, ...overrides });
const save = (overrides = {}) => ({ action: 'save', threadId: id, expectedVersion: 0, title: 'Fictional thread',
  snapshot: snapshot(), ...overrides });
const calculator = () => ({ version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Project price',
  summary: 'Use supplied values.', provenance: { type: 'user', label: 'Supplied values.', sourceIds: [] },
  controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 0, max: 80, step: 1, initial: 10 }],
  formula: ['hours', '65', 'multiply'], formulaDescription: 'Hours multiplied by 65.', unit: 'CAD' });
const visual = (index = 1) => ({ id: index.toString(16).padStart(48, '0'), kind: 'calculator', mode: 'optional',
  userId: null, replyId: `assistant-${index * 2}`, expiresAt: 1600000000000, status: 'ready', spec: calculator(),
  sources: [], viewState: { inputs: { hours: '' } }, artifactVersion });
const withVisual = () => {
  const value = snapshot(), record = visual();
  value.visuals = { version: 1, records: [record], lastInteractedId: record.id,
    activeVisualId: record.id, workspaceView: 'expanded' };
  return value;
};
const evidence = Array.from({ length: 9 }, (_, index) => ({ id: index + 1,
  title: `Fictional source ${index + 1}`, url: `https://example.test/evidence-${index + 1}` }));
const reference = () => ({ researchId: sourceId, briefId, title: 'Original research',
  asOf: '2020-01-01T12:00:00.000Z', timeZone: 'UTC', localDate: '2020-01-01', expiresAt: '2020-01-01T13:00:00.000Z' });
const brief = () => ({ version: 'metabloom-research-brief-v1', kind: 'research', title: 'Original research',
  scope: 'Fictional evidence.', asOf: reference().asOf, timeZone: 'UTC', localDate: '2020-01-01',
  windowStart: null, windowEnd: null,
  coverage: { requestedCount: 1, returnedCount: 1, status: 'complete', limitations: [] },
  items: [{ headline: 'Fictional finding', summary: 'The supported finding.', sourceIds: [9],
    background: [], whyItMatters: 'The supported interpretation.', uncertainty: [], watchNext: [],
    developmentDate: null, scheduledDate: null, dateEvidence: null, evidenceStatus: 'reported' }],
  sourceDetails: [{ sourceId: 9, publisher: 'Fictional publication', publishedDate: null,
    dateEvidence: '', sourceType: 'reporting' }], media: [{ sourceId: 9, token: 'signed-session-only-token' }] });
const withResearch = () => {
  const value = snapshot();
  Object.assign(value.conversation.messages[1], { researchDetails: { notes: 'Full original evidence. [9]', sources: copy(evidence) },
    sources: [copy(evidence[8])], researchBrief: brief(), researchReference: reference(), researchReused: true });
  value.workspace = { messageId: 'assistant-2', view: 'expanded' };
  return value;
};

test('clones the minimum coherent envelope without retaining caller mutation', () => {
  const value = snapshot(), parsed = parseMetabloomThreadSnapshot(value);
  expect(parsed).toEqual(value);
  value.conversation.messages[0].content = 'Later edit';
  expect(parsed.conversation.messages[0].content).toBe('Fictional question');
  expect(parseMetabloomThreadMetadata(metadata())).toEqual(metadata());
});

test('captures live optional undefined fields and an interrupted prefix without resuming it', () => {
  const value = snapshot();
  delete value.schemaVersion;
  Object.assign(value.conversation, { pending: true, artifactAttachment: null, researchAttachment: null,
    expressiveness: 0.8, responseSource: 'model' });
  Object.assign(value.conversation.messages[1], { status: 'streaming', emote: undefined, source: undefined,
    segments: [{ response: 'Fictional response' }], actionChain: [] });
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
  const parsed = createMetabloomThreadSnapshot(value);
  expect(parsed.conversation).toMatchObject({ interrupted: true, responseSource: 'model' });
  expect(parsed.conversation).not.toHaveProperty('pending');
  expect(parsed.conversation.messages[1]).toMatchObject({ status: 'interrupted', content: 'Fictional response' });
  expect(parsed.conversation.messages[1]).not.toHaveProperty('emote');
  expect(parseMetabloomThreadSnapshot(parsed)).toEqual(parsed);
});

test('retains 200 messages and 100 visuals instead of the old navigation cache limits', () => {
  const value = snapshot();
  value.conversation.messages = Array.from({ length: MAX_METABLOOM_THREAD_MESSAGES }, (_, index) => ({
    id: `${index % 2 ? 'assistant' : 'user'}-${index + 1}`, role: index % 2 ? 'assistant' : 'user',
    content: `Retained message ${index + 1}`, status: 'complete' }));
  value.conversation.counter = MAX_METABLOOM_THREAD_MESSAGES;
  value.visuals.records = Array.from({ length: MAX_METABLOOM_THREAD_VISUALS }, (_, index) => visual(index + 1));
  const parsed = parseMetabloomThreadSnapshot(value);
  expect(parsed.conversation.messages).toHaveLength(200);
  expect(parsed.visuals.records).toHaveLength(100);
  expect(parsed.conversation.messages[0].content).toBe('Retained message 1');
  expect(createMetabloomVisualSnapshot(value.visuals.records, value.conversation.messages, null, null, undefined,
    METABLOOM_THREAD_SNAPSHOT_OPTIONS).records).toHaveLength(100);
  value.conversation.messages.push({ id: 'user-201', role: 'user', content: 'Over the limit', status: 'complete' });
  value.conversation.counter++;
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
  value.conversation.messages.pop();
  value.visuals.records.push(visual(101));
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test('keeps expired visual handles and unfinished numeric drafts unchanged', () => {
  const value = withVisual(), parsed = parseMetabloomThreadSnapshot(value);
  expect(parsed.visuals).toEqual(value.visuals);
  expect(parsed.visuals.records[0].viewState.inputs.hours).toBe('');
  expect(parsed.visuals.records[0].expiresAt).toBe(1600000000000);
  const frozen = { reference: { id: visual().id, version: artifactVersion,
    selector: { type: 'calculator' }, inputs: { hours: 17 } }, label: 'Captured scenario', summary: '17 hours' };
  value.conversation.artifactAttachment = frozen;
  expect(parseMetabloomThreadSnapshot(value).conversation.artifactAttachment).toEqual(frozen);
  frozen.reference.version = 'd'.repeat(32);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test('keeps full research, sparse source IDs, original dates and expired reference while stripping signed media only', () => {
  const value = withResearch(), parsed = parseMetabloomThreadSnapshot(value);
  const report = parsed.conversation.messages[1];
  expect(report.researchDetails).toEqual(value.conversation.messages[1].researchDetails);
  expect(report.sources).toEqual([evidence[8]]);
  expect(report.researchReference).toEqual(reference());
  expect(report.researchBrief).toEqual(expect.objectContaining({ asOf: reference().asOf, localDate: '2020-01-01' }));
  expect(report.researchBrief).not.toHaveProperty('media');
  expect(parsed.workspace).toEqual(value.workspace);
  expect(parseMetabloomThreadSnapshot(parsed)).toEqual(parsed);
});

test('retains completed research when its writer has no visible answer', () => {
  const value = withResearch();
  Object.assign(value.conversation.messages[1], { status: 'error', content: '', segments: [] });
  expect(parseMetabloomThreadSnapshot(value).conversation.messages[1].researchDetails.notes).toBe('Full original evidence. [9]');
});

test('preserves saved metadata and its bound confirmation without treating a different revision as confirmed', () => {
  const value = withVisual(), message = value.conversation.messages[1];
  message.savedArtifact = { artifactId: id, title: 'Saved calculator', kind: 'visual', version: 2,
    revision: 1, headRevision: 2, createdAt: metadata().createdAt, updatedAt: metadata().updatedAt };
  message.savedWorkBaseline = { version: 1, artifactId: id, revision: 1,
    source: { kind: 'visual', id: visual().id, artifactVersion }, scenario: { inputs: { hours: 10 } } };
  expect(parseMetabloomThreadSnapshot(value).conversation.messages[1].savedWorkBaseline).toEqual(message.savedWorkBaseline);
  message.savedWorkBaseline.revision = 2;
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test.each([
  value => { value.conversation.messages[1].id = 'user-2'; },
  value => { value.conversation.messages[1].id = 'assistant-1'; },
  value => { value.conversation.messages[1].id = 'assistant-02'; },
  value => { value.conversation.counter = 1; },
  value => { value.conversation.messages[1].role = 'system'; },
  value => { value.conversation.messages[1].status = 'streaming'; },
  value => { value.conversation.messages[1].source = 'unknown-source'; },
  value => { value.conversation.messages[1].emote = 'unknown-emote'; },
  value => { value.conversation.messages[1].segments = [{ response: 'Different text' }]; },
  value => { value.conversation.messages[1].actionChain = [{ action: 'execute', duration: 1000, intensity: 0.5, talking: false }]; },
  value => { value.conversation.messages[0].researchDetails = { notes: 'Unowned', sources: evidence }; },
  value => { value.conversation.messages[1].sources = [{ ...evidence[0], url: 'file:///not-http' }]; },
  value => { value.conversation.pending = false; },
  value => { value.conversation.expressiveness = 2; },
  value => { value.conversation.deepResearch = 'true'; },
  value => { value.conversation.draft = 'x'.repeat(1601); },
  value => { value.conversation.unavailableResearchIds = [sourceId, sourceId]; },
  value => { value.conversation.messages[0].unexpected = 'Never silently discard this'; },
  value => { value.schemaVersion = 2; },
])('rejects malformed durable data without dropping a message (%#)', mutate => {
  const value = snapshot(); mutate(value);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test.each([
  value => { value.visuals.records.push(copy(value.visuals.records[0])); },
  value => { value.visuals.records.push({ ...copy(value.visuals.records[0]), id: 'd'.repeat(48) }); },
  value => { value.visuals.records[0].replyId = 'assistant-4'; },
  value => { value.visuals.records[0].spec.title = ''; },
  value => { value.visuals.lastInteractedId = 'd'.repeat(48); },
  value => { value.visuals.activeVisualId = 'd'.repeat(48); },
  value => { value.workspace = { messageId: 'assistant-2', view: 'expanded' }; },
])('strict visual parsing rejects any record or selection it would otherwise lose (%#)', mutate => {
  const value = withVisual(); mutate(value);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test('strict visual capture rejects overflow and bad ready records, while only failed contentless placeholders may be omitted', () => {
  const messages = snapshot().conversation.messages, record = visual();
  expect(createMetabloomVisualSnapshot([record], messages, null, null, undefined,
    { ...METABLOOM_THREAD_SNAPSHOT_OPTIONS, maxBytes: 100 })).toBeNull();
  expect(createMetabloomVisualSnapshot([{ ...record, artifactVersion: 'bad' }], messages, null, null, undefined,
    METABLOOM_THREAD_SNAPSHOT_OPTIONS)).toBeNull();
  expect(createMetabloomVisualSnapshot([record, { status: 'failed' }], messages, null, null, undefined,
    METABLOOM_THREAD_SNAPSHOT_OPTIONS).records).toHaveLength(1);
  expect(parseMetabloomVisualSnapshot({ version: 1, records: [{ ...record, replyId: 'assistant-99' }],
    lastInteractedId: null }, messages).records).toHaveLength(0);
});

test('rejects two records that would resolve to the same assistant portal on restore', () => {
  const value = withVisual();
  value.visuals.records.unshift({ ...visual(), id: 'd'.repeat(48), mode: 'tool', userId: 'user-1', replyId: null });
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test.each([
  value => { value.conversation.messages[1].researchBrief.items[0].summary = ''; },
  value => { value.conversation.messages[1].researchDetails.sources[8].id = 10; },
  value => { value.conversation.messages[1].sources[0].url = 'https://other.example.test/'; },
  value => { value.conversation.messages[1].researchReference.localDate = '2020-01-02'; },
  value => { value.conversation.messages[1].researchReference.briefId = 'invalid'; },
  value => { value.workspace.messageId = 'assistant-4'; },
])('rejects corrupted research or its workspace instead of silently dropping evidence (%#)', mutate => {
  const value = withResearch(); mutate(value);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test('an attachment belongs to a retained report and both attachment kinds cannot be selected', () => {
  const value = withResearch();
  const { researchId, title: label, briefId: selectedBrief, ...dates } = reference();
  value.conversation.researchAttachment = { reference: { researchId, selector: { type: 'brief', briefId: selectedBrief } }, label, ...dates };
  expect(parseMetabloomThreadSnapshot(value).conversation.researchAttachment).toEqual(value.conversation.researchAttachment);
  value.visuals = withVisual().visuals;
  value.workspace = null;
  value.conversation.artifactAttachment = { reference: { id: visual().id, version: artifactVersion,
    selector: { type: 'calculator' }, inputs: { hours: 10 } }, label: 'Other context' };
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
  delete value.conversation.artifactAttachment;
  value.conversation.researchAttachment.reference.researchId = 'd'.repeat(48);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
});

test('enforces total UTF-8 bytes even when every individual research report is within its own limit', () => {
  const value = snapshot();
  value.conversation.messages = Array.from({ length: 4 }, (_, index) => ({ id: `assistant-${index + 1}`,
    role: 'assistant', status: 'complete', content: 'Retained complete research',
    researchDetails: { notes: 'é'.repeat(300000), sources: [evidence[0]] } }));
  value.conversation.counter = 4;
  expect(JSON.stringify(value).length).toBeLessThan(MAX_METABLOOM_THREAD_SNAPSHOT_BYTES);
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
  value.conversation.messages.length = 2;
  expect(parseMetabloomThreadSnapshot(value).conversation.messages).toHaveLength(2);
});

test('never executes serialization hooks or accessors and rejects cycles, sparse arrays and non-JSON data', () => {
  const getter = jest.fn(() => snapshot().conversation), value = snapshot();
  Object.defineProperty(value, 'conversation', { enumerable: true, get: getter });
  expect(parseMetabloomThreadSnapshot(value)).toBeNull();
  expect(createMetabloomThreadSnapshot(value)).toBeNull();
  expect(getter).not.toHaveBeenCalled();
  const hook = jest.fn(() => snapshot());
  expect(parseMetabloomThreadSnapshot({ toJSON: hook })).toBeNull();
  expect(hook).not.toHaveBeenCalled();
  const cyclic = snapshot(); cyclic.conversation.loop = cyclic;
  expect(parseMetabloomThreadSnapshot(cyclic)).toBeNull();
  const sparse = snapshot(); delete sparse.conversation.messages[0];
  expect(parseMetabloomThreadSnapshot(sparse)).toBeNull();
  const infinite = snapshot(); infinite.conversation.counter = Infinity;
  expect(parseMetabloomThreadSnapshot(infinite)).toBeNull();
  const hidden = snapshot(); Object.defineProperty(hidden, 'secret', { value: 'hidden' });
  expect(parseMetabloomThreadSnapshot(hidden)).toBeNull();
});

test('request parsing accepts only exact bounded authenticated-store operations', () => {
  expect(parseMetabloomThreadRequest(save())).toEqual(save());
  for (const request of [{ action: 'list' }, { action: 'open', threadId: id },
    { action: 'rename', threadId: id, expectedVersion: 1, title: 'Renamed' },
    { action: 'delete', threadId: id, expectedVersion: 1 }]) expect(parseMetabloomThreadRequest(request)).toEqual(request);
  expect(isMetabloomThreadId(id)).toBe(true);
  expect(isMetabloomThreadId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase())).toBe(false);
  for (const request of [save({ expectedVersion: -1 }), save({ expectedVersion: 2147483647 }),
    save({ title: ' leading whitespace' }), save({ title: 'line\nbreak' }), save({ title: 'a'.repeat(161) }),
    { action: 'list', owner: 'another-account' }, { action: 'open', threadId: id, refreshSources: true },
    { action: 'delete', threadId: id, expectedVersion: 0 }]) expect(parseMetabloomThreadRequest(request)).toBeNull();
});

test('response receipts bind IDs, counts, titles and version transitions to the exact request', () => {
  expect(parseMetabloomThreadResponse(save(), { thread: metadata() })).toEqual({ thread: metadata() });
  expect(parseMetabloomThreadResponse(save({ expectedVersion: 1 }), { thread: metadata() })).not.toBeNull();
  expect(parseMetabloomThreadResponse(save({ expectedVersion: 1 }), { thread: metadata({ version: 2 }) })).not.toBeNull();
  for (const thread of [metadata({ threadId: otherId }), metadata({ messageCount: 1 }), metadata({ version: 3 }),
    metadata({ title: 'Other title' })]) expect(parseMetabloomThreadResponse(save(), { thread })).toBeNull();
  const open = { action: 'open', threadId: id };
  expect(parseMetabloomThreadResponse(open, { thread: metadata(), snapshot: snapshot() })).not.toBeNull();
  expect(parseMetabloomThreadResponse(open, { thread: metadata({ messageCount: 1 }), snapshot: snapshot() })).toBeNull();
  const rename = { action: 'rename', threadId: id, expectedVersion: 2, title: 'Renamed' };
  expect(parseMetabloomThreadResponse(rename, { thread: metadata({ title: 'Renamed', version: 3 }) })).not.toBeNull();
  expect(parseMetabloomThreadResponse(rename, { thread: metadata({ title: 'Renamed', version: 4 }) })).toBeNull();
  expect(parseMetabloomThreadResponse({ action: 'delete', threadId: id, expectedVersion: 1 },
    { threadId: otherId, deleted: true })).toBeNull();
  expect(parseMetabloomThreadResponse({ action: 'list' }, { items: [metadata(), metadata()] })).toBeNull();
  expect(parseMetabloomThreadResponse({ action: 'list' }, { items: [metadata()] })).toEqual({ items: [metadata()] });
  expect(parseMetabloomThreadMetadata(metadata({ updatedAt: '2020-01-01T00:00:00.000Z' }))).toBeNull();
});
