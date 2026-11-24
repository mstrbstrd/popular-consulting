'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
  METABLOOM_GMAIL_VERSION,
  MAX_GMAIL_READ_PER_TURN,
  sanitizeUntrustedEmailText,
  isValidEmailAddress,
  parseEmailAddressList,
  parseGmailProposal,
  parseGmailReceipt,
  canonicalGmailPayload,
} = require('../src/components/metabloomGmailProtocol');

const {
  GOOGLE_OAUTH_SCOPES,
  GMAIL_MODIFY_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  hasGmailReadScope,
  hasGmailSendScope,
} = require('../server/metabloomCalendarGoogleAuth');

const {
  buildRawMimeMessage,
  extractGmailBody,
  createMetabloomGmailClient,
} = require('../server/metabloomGmailClient');

const {
  isMetabloomGmailEnabled,
  isMetabloomGmailSendEnabled,
  METABLOOM_GMAIL_TOOLS,
  executeMetabloomGmailTool,
  signGmailProposal,
} = require('../server/metabloomGmailWorkflow');

const { executeMetabloomCalendarTool } = require('../server/metabloomCalendarWorkflow');
const gmailEndpoint = require('../api/metabloom-gmail');
const googleAuthEndpoint = require('../api/metabloom-calendar-google');

const ACCOUNT_IDENTITY = Object.freeze({
  accountKey: 'a'.repeat(64),
});

const TEST_ENV = Object.freeze({
  METABLOOM_CALENDAR_ENABLED: '1',
  GOOGLE_CALENDAR_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'super-secret-client-value',
  AUTH_APP_ORIGIN: 'https://popcon.example',
});

function createMemoryTokenStore(initialRecord = null) {
  let current = initialRecord ? JSON.parse(JSON.stringify(initialRecord)) : null;
  return {
    getCurrent: () => current,
    async read() {
      return current ? JSON.parse(JSON.stringify(current)) : null;
    },
    async write(_identity, next) {
      current = JSON.parse(JSON.stringify(next));
      return JSON.parse(JSON.stringify(current));
    },
    async remove() {
      current = null;
      return { deleted: true };
    },
  };
}

function makeFullTokenRecord(overrides = {}) {
  return {
    v: 1,
    accessToken: 'ya29.secret-access-token-do-not-log',
    refreshToken: '1//secret-refresh-token',
    expiresAt: Date.now() + 3600 * 1000,
    scope: GOOGLE_OAUTH_SCOPES,
    email: 'owner@popcon.example',
    calendarId: 'primary',
    connectedAt: 1700000000000,
    updatedAt: 1700000000000,
    undoHistory: [],
    recentOperations: [],
    ...overrides,
  };
}

function makeJsonResponse(status, body) {
  const text = body === null || body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    async text() {
      return text;
    },
  };
}

function makeMockRes() {
  const headers = new Map();
  let body = '';
  return {
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(chunk = '') {
      body += chunk;
      this.writableEnded = true;
    },
    json() {
      return JSON.parse(body);
    },
    on() {},
    off() {},
  };
}

test('OAuth scope upgrade includes Gmail modify and compose scopes and status API reports them', async () => {
  assert.ok(GOOGLE_OAUTH_SCOPES.includes(GMAIL_MODIFY_SCOPE));
  assert.ok(GOOGLE_OAUTH_SCOPES.includes(GMAIL_COMPOSE_SCOPE));

  const legacyRecord = makeFullTokenRecord({
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
  });
  assert.equal(hasGmailReadScope(legacyRecord), false);
  assert.equal(hasGmailSendScope(legacyRecord), false);

  const upgradedRecord = makeFullTokenRecord();
  assert.equal(hasGmailReadScope(upgradedRecord), true);
  assert.equal(hasGmailSendScope(upgradedRecord), true);

  const statusHandler = googleAuthEndpoint._internals.createGoogleCalendarAuthHandler({
    requireSession: async (_req, { onAccountIdentity }) => {
      onAccountIdentity(ACCOUNT_IDENTITY);
      return null;
    },
    env: TEST_ENV,
    tokenStore: createMemoryTokenStore(legacyRecord),
    logger: () => {},
  });

  const legacyRes = makeMockRes();
  await statusHandler({ method: 'GET', url: '/api/metabloom-calendar-google?action=status', headers: {} }, legacyRes);
  assert.equal(legacyRes.statusCode, 200);
  assert.deepEqual(legacyRes.json(), {
    configured: true,
    connected: true,
    gmailConnected: false,
    gmailSendConnected: false,
    email: 'owner@popcon.example',
    calendarId: 'primary',
  });

  const upgradedHandler = googleAuthEndpoint._internals.createGoogleCalendarAuthHandler({
    requireSession: async (_req, { onAccountIdentity }) => {
      onAccountIdentity(ACCOUNT_IDENTITY);
      return null;
    },
    env: TEST_ENV,
    tokenStore: createMemoryTokenStore(upgradedRecord),
    logger: () => {},
  });
  const upgradedRes = makeMockRes();
  await upgradedHandler({ method: 'GET', url: '/api/metabloom-calendar-google?action=status', headers: {} }, upgradedRes);
  assert.equal(upgradedRes.statusCode, 200);
  assert.equal(upgradedRes.json().gmailConnected, true);
  assert.equal(upgradedRes.json().gmailSendConnected, true);
});

test('MIME builder rejects header injection (CR/LF) in To, Cc, Subject, and In-Reply-To', () => {
  const validRaw = buildRawMimeMessage({
    to: ['alice@example.com'],
    cc: ['bob@example.com'],
    subject: 'Quarterly review',
    body: 'Hello Alice,\nLet us review Q4 numbers.',
    inReplyTo: '<msg-01@example.com>',
  });
  const decoded = Buffer.from(validRaw, 'base64url').toString('utf8');
  assert.ok(decoded.includes('To: alice@example.com\r\n'));
  assert.ok(decoded.includes('Cc: bob@example.com\r\n'));
  assert.ok(decoded.includes('Subject: Quarterly review\r\n'));
  assert.ok(decoded.includes('In-Reply-To: <msg-01@example.com>\r\n'));
  assert.ok(decoded.includes('Hello Alice,\r\nLet us review Q4 numbers.'));

  assert.throws(
    () => buildRawMimeMessage({ to: ['alice@example.com\r\nBcc:evil@attacker.test'], subject: 'Hi', body: 'Hello' }),
    err => err.code === 'gmail_invalid',
  );
  assert.throws(
    () => buildRawMimeMessage({ to: ['alice@example.com'], cc: ['bob@example.com\nBcc:evil@attacker.test'], subject: 'Hi', body: 'Hello' }),
    err => err.code === 'gmail_invalid',
  );
  assert.throws(
    () => buildRawMimeMessage({ to: ['alice@example.com'], subject: 'Hi\r\nBcc: evil@attacker.test', body: 'Hello' }),
    err => err.code === 'gmail_invalid',
  );
  assert.throws(
    () => buildRawMimeMessage({ to: ['alice@example.com'], subject: 'Hi', body: 'Hello', inReplyTo: '<a@b>\r\nX-Evil: 1' }),
    err => err.code === 'gmail_invalid',
  );
  assert.equal(isValidEmailAddress('alice@example.com\r\n'), false);
  assert.equal(parseEmailAddressList('alice@example.com\r\nBcc:evil@example.com'), null);
});

test('HTML sanitization and MIME part extraction prefer text/plain and sanitize text/html fallback', () => {
  const plainData = Buffer.from('Plain text meeting at 2pm.', 'utf8').toString('base64url');
  const htmlData = Buffer.from('<div><script>steal()</script><style>p{display:none}</style><p>HTML &amp; <b>bold</b></p></div>', 'utf8').toString('base64url');

  const preferPlain = extractGmailBody({
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: plainData } },
      { mimeType: 'text/html', body: { data: htmlData } },
    ],
  });
  assert.equal(preferPlain, 'Plain text meeting at 2pm.');

  const htmlFallback = extractGmailBody({
    mimeType: 'multipart/mixed',
    parts: [
      { mimeType: 'text/html', body: { data: htmlData } },
    ],
  });
  assert.equal(htmlFallback, 'HTML & bold');
  assert.ok(!htmlFallback.includes('steal()'));
  assert.ok(!htmlFallback.includes('display:none'));

  const sanitized = sanitizeUntrustedEmailText('<script>bad()</script>Hello\u0000\u202eWorld', 100);
  assert.equal(sanitized, 'HelloWorld');
});

test('Gmail client handles list, read, draft, send with dedupe, organize, trash, and safe 403 reason mapping', async () => {
  const calls = [];
  const tokenStore = createMemoryTokenStore(makeFullTokenRecord());
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('/messages?')) {
      return makeJsonResponse(200, { messages: [{ id: 'msg_01', threadId: 'thr_01' }], resultSizeEstimate: 1 });
    }
    if (url.includes('/messages/msg_01?format=metadata')) {
      return makeJsonResponse(200, {
        id: 'msg_01',
        threadId: 'thr_01',
        snippet: 'See you Friday at 3pm',
        labelIds: ['INBOX', 'UNREAD'],
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'owner@popcon.example' },
            { name: 'Subject', value: 'Friday dentist' },
            { name: 'Date', value: 'Thu, 14 May 2026 10:00:00 -0700' },
          ],
        },
      });
    }
    if (url.includes('/messages/msg_01?format=full')) {
      return makeJsonResponse(200, {
        id: 'msg_01',
        threadId: 'thr_01',
        snippet: 'See you Friday',
        labelIds: ['INBOX'],
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Friday dentist' },
            { name: 'Message-ID', value: '<dentist@example.com>' },
          ],
          body: { data: Buffer.from('Dentist appointment Friday 3pm-4pm.', 'utf8').toString('base64url') },
        },
      });
    }
    if (url.endsWith('/drafts') && init.method === 'POST') {
      return makeJsonResponse(200, { id: 'r-draft-1', message: { id: 'msg_draft_1', threadId: 'thr_draft_1' } });
    }
    if (url.endsWith('/messages/send') && init.method === 'POST') {
      return makeJsonResponse(200, { id: 'msg_sent_1', threadId: 'thr_sent_1', labelIds: ['SENT'] });
    }
    if (url.endsWith('/messages/msg_01/modify') && init.method === 'POST') {
      return makeJsonResponse(200, { id: 'msg_01', threadId: 'thr_01', labelIds: [] });
    }
    if (url.endsWith('/messages/msg_01/trash') && init.method === 'POST') {
      return makeJsonResponse(200, { id: 'msg_01', threadId: 'thr_01', labelIds: ['TRASH'] });
    }
    return makeJsonResponse(404, { error: { message: 'not found' } });
  };

  const client = createMetabloomGmailClient({ env: TEST_ENV, tokenStore, fetchImpl });

  const listed = await client.listMessages(ACCOUNT_IDENTITY, { query: 'is:unread', maxResults: 5 });
  assert.equal(listed.messages.length, 1);
  assert.equal(listed.messages[0].subject, 'Friday dentist');
  assert.equal(listed.messages[0].isUnread, true);

  const read = await client.readMessage(ACCOUNT_IDENTITY, { messageId: 'msg_01' });
  assert.equal(read.body, 'Dentist appointment Friday 3pm-4pm.');
  assert.equal(read.messageIdHeader, '<dentist@example.com>');

  const draft = await client.createDraft(ACCOUNT_IDENTITY, {
    to: ['alice@example.com'],
    subject: 'Draft subject',
    body: 'Draft body',
  });
  assert.equal(draft.draftId, 'r-draft-1');

  const opHash = createHash('sha256').update('send-payload').digest('hex');
  const sent1 = await client.sendMessage(ACCOUNT_IDENTITY, {
    to: ['alice@example.com'],
    subject: 'Hello',
    body: 'Body text',
    operationId: 'gmop_send_01',
    payloadHash: opHash,
  });
  assert.equal(sent1.status, 'applied');
  assert.equal(sent1.messageId, 'msg_sent_1');

  // Repeating the same operationId + payloadHash returns duplicate without a second POST /messages/send.
  const sendCallsBefore = calls.filter(c => c.url.endsWith('/messages/send')).length;
  const sent2 = await client.sendMessage(ACCOUNT_IDENTITY, {
    to: ['alice@example.com'],
    subject: 'Hello',
    body: 'Body text',
    operationId: 'gmop_send_01',
    payloadHash: opHash,
  });
  assert.equal(sent2.status, 'duplicate');
  assert.equal(calls.filter(c => c.url.endsWith('/messages/send')).length, sendCallsBefore);

  const archived = await client.modifyLabels(ACCOUNT_IDENTITY, { messageId: 'msg_01', action: 'archive' });
  assert.equal(archived.undoAction, 'unarchive');

  const trashed = await client.trashMessage(ACCOUNT_IDENTITY, { messageId: 'msg_01' });
  assert.equal(trashed.status, 'applied');
  assert.equal(calls.some(c => c.method === 'DELETE' && c.url.includes('/messages/')), false);

  // Verify 403 error mapping and zero-PII logging.
  const logged = [];
  const origInfo = console.info;
  console.info = (...args) => { logged.push(args.join(' ')); };
  try {
    const disabledClient = createMetabloomGmailClient({
      env: TEST_ENV,
      tokenStore,
      fetchImpl: async () => makeJsonResponse(403, {
        error: {
          message: 'Gmail API disabled for secret-subject@example.com',
          errors: [{ reason: 'accessNotConfigured' }],
        },
      }),
    });
    await assert.rejects(
      () => disabledClient.listMessages(ACCOUNT_IDENTITY, { query: 'from:secret@example.com', maxResults: 5 }),
      err => err.code === 'gmail_api_disabled',
    );
  } finally {
    console.info = origInfo;
  }
  assert.ok(logged.length >= 1);
  assert.ok(logged.every(line => !line.includes('secret-subject@example.com') && !line.includes('ya29.')));
});

test('Workflow enforces G1 (never auto-send), G2 (draft), G3 (organize+undo), G4 (trash confirm), read cap, and scope guidance', async () => {
  assert.equal(METABLOOM_GMAIL_TOOLS.length, 6);

  let sendCalled = 0;
  let trashCalled = 0;
  const mockClient = {
    async getConnectionStatus() {
      return { configured: true, connected: true, sendConnected: true, email: 'owner@popcon.example' };
    },
    async listMessages() {
      return { messages: [{ id: 'msg_1', subject: 'Hello', from: 'a@b.com', snippet: 'Hi' }], resultSizeEstimate: 1 };
    },
    async readMessage(_id, { messageId }) {
      return { id: messageId, threadId: 'thr_1', subject: 'Secret Invoice', from: 'billing@vendor.test', snippet: 'Due Friday', body: 'Pay soon' };
    },
    async createDraft() {
      return { draftId: 'r-101', messageId: 'msg_d1', threadId: 'thr_d1' };
    },
    async sendMessage() {
      sendCalled += 1;
      return { status: 'applied', messageId: 'should_never_happen' };
    },
    async modifyLabels(_id, { messageId }) {
      return { messageId, threadId: 'thr_1', undoAction: 'unarchive' };
    },
    async trashMessage() {
      trashCalled += 1;
      return { status: 'applied', messageId: 'should_never_happen' };
    },
  };

  // G1: propose_send_email NEVER sends during LLM turn; returns signed pending_confirmation proposal.
  const sendProposalResult = await executeMetabloomGmailTool({
    name: 'propose_send_email',
    args: {
      to: ['alice@example.com'],
      cc: [],
      subject: 'Kickoff',
      body: 'Hi Alice, ready for kickoff?',
      threadId: null,
      inReplyTo: null,
      sourceText: 'email Alice about kickoff',
    },
    accountIdentity: ACCOUNT_IDENTITY,
    client: mockClient,
    message: 'Please email Alice about kickoff',
    requestId: 'req_1',
    conversationId: 'conv_1',
    env: TEST_ENV,
  });
  assert.equal(sendCalled, 0);
  assert.equal(sendProposalResult.output.status, 'pending_confirmation');
  assert.equal(sendProposalResult.gmailProposal.requiresConfirmation, true);
  assert.ok(parseGmailProposal(sendProposalResult.gmailProposal, 'req_1'));
  assert.ok(parseGmailReceipt(sendProposalResult.gmailReceipt));

  // G2: create_email_draft creates reversible draft.
  const draftResult = await executeMetabloomGmailTool({
    name: 'create_email_draft',
    args: {
      to: ['alice@example.com'],
      cc: [],
      subject: 'Draft kickoff',
      body: 'Draft text',
      threadId: null,
      inReplyTo: null,
      sourceText: 'draft an email to Alice',
    },
    accountIdentity: ACCOUNT_IDENTITY,
    client: mockClient,
    message: 'Please draft an email to Alice',
    requestId: 'req_2',
    conversationId: 'conv_1',
    env: TEST_ENV,
  });
  assert.equal(draftResult.gmailReceipt.status, 'applied');
  assert.equal(draftResult.gmailReceipt.command, 'draft');
  assert.equal(draftResult.gmailReceipt.draftId, 'r-101');

  // G3: organize_email requires grounding and returns undoAction.
  const orgResult = await executeMetabloomGmailTool({
    name: 'organize_email',
    args: { messageId: 'msg_1', action: 'archive', sourceText: 'archive that email' },
    accountIdentity: ACCOUNT_IDENTITY,
    client: mockClient,
    message: 'Go ahead and archive that email',
    requestId: 'req_3',
    conversationId: 'conv_1',
    env: TEST_ENV,
  });
  assert.equal(orgResult.gmailReceipt.status, 'applied');
  assert.equal(orgResult.gmailReceipt.undoAction, 'unarchive');

  // Prohibitions must be rejected.
  await assert.rejects(
    () => executeMetabloomGmailTool({
      name: 'organize_email',
      args: { messageId: 'msg_1', action: 'archive', sourceText: 'archive that email' },
      accountIdentity: ACCOUNT_IDENTITY,
      client: mockClient,
      message: 'Do not archive that email',
      requestId: 'req_3b',
      conversationId: 'conv_1',
      env: TEST_ENV,
    }),
    err => err.code === 'gmail_evidence_required',
  );

  // G4: propose_trash_email NEVER trashes during LLM turn.
  const trashResult = await executeMetabloomGmailTool({
    name: 'propose_trash_email',
    args: { messageId: 'msg_1', sourceText: 'trash that invoice email' },
    accountIdentity: ACCOUNT_IDENTITY,
    client: mockClient,
    message: 'Please trash that invoice email',
    requestId: 'req_4',
    conversationId: 'conv_1',
    env: TEST_ENV,
  });
  assert.equal(trashCalled, 0);
  assert.equal(trashResult.gmailProposal.command, 'trash');
  assert.equal(trashResult.gmailProposal.requiresConfirmation, true);
  assert.equal(trashResult.gmailReceipt.status, 'pending_confirmation');
  assert.equal(trashResult.gmailReceipt.preview.subject, 'Secret Invoice');

  // Read cap (MAX_GMAIL_READ_PER_TURN = 3).
  await assert.rejects(
    () => executeMetabloomGmailTool({
      name: 'read_email',
      args: { messageId: 'msg_4' },
      accountIdentity: ACCOUNT_IDENTITY,
      client: mockClient,
      message: 'Read my emails',
      requestId: 'req_5',
      conversationId: 'conv_1',
      gmailReadsCount: MAX_GMAIL_READ_PER_TURN,
      env: TEST_ENV,
    }),
    err => err.code === 'gmail_read_limit',
  );

  // Missing Gmail scope returns clean reconnect guidance.
  const noScopeClient = {
    async listMessages() {
      throw Object.assign(new Error('gmail_permission_denied'), { code: 'gmail_permission_denied' });
    },
  };
  const missingScopeResult = await executeMetabloomGmailTool({
    name: 'list_recent_emails',
    args: { query: null, maxResults: 5 },
    accountIdentity: ACCOUNT_IDENTITY,
    client: noScopeClient,
    message: 'Check my recent emails',
    requestId: 'req_6',
    conversationId: 'conv_1',
    env: TEST_ENV,
  });
  assert.equal(missingScopeResult.output.status, 'unavailable');
  assert.equal(missingScopeResult.output.code, 'gmail_permission_denied');
  assert.ok(missingScopeResult.output.message.includes('/calendar'));
});

test('Invariant G5: Email-to-Calendar forces requiresConfirmation=true when gmailReadInTurn is true', async () => {
  let createCalls = 0;
  const mockProvider = {
    async createEvent() {
      createCalls += 1;
      return {
        status: 'applied',
        version: 1,
        eventId: 'evt_solo_1',
        undoToken: 'undo_12345',
        event: {
          id: 'evt_solo_1',
          title: 'Dentist appointment',
          start: '2026-05-15T15:00:00-07:00',
          end: '2026-05-15T16:00:00-07:00',
          allDay: false,
          timeZone: 'America/Vancouver',
          location: 'Downtown Dental',
          description: '',
          attendees: [],
          color: 'default',
          revision: 1,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          source: 'agent',
        },
      };
    },
  };

  // With gmailReadInTurn=true, a solo event (0 attendees) MUST NOT auto-commit!
  const emailToCalResult = await executeMetabloomCalendarTool({
    name: 'create_calendar_event',
    args: {
      title: 'Dentist appointment',
      start: '2026-05-15T15:00:00-07:00',
      end: '2026-05-15T16:00:00-07:00',
      allDay: false,
      timeZone: 'America/Vancouver',
      location: 'Downtown Dental',
      description: 'Extracted from email',
      attendees: [],
      color: null,
      sourceText: 'add the dentist appointment to my calendar',
    },
    accountIdentity: ACCOUNT_IDENTITY,
    provider: mockProvider,
    message: 'Check my recent emails and add the dentist appointment to my calendar',
    requestId: 'req_e2c_1',
    conversationId: 'conv_1',
    gmailReadInTurn: true,
  });

  assert.equal(createCalls, 0);
  assert.equal(emailToCalResult.output.status, 'pending_confirmation');
  assert.equal(emailToCalResult.calendarProposal.requiresConfirmation, true);
  assert.equal(emailToCalResult.calendarReceipt.status, 'pending_confirmation');
  assert.equal(emailToCalResult.calendarReceipt.requiresConfirmation, true);

  // Without gmailReadInTurn, solo create still commits immediately as before.
  const directCalResult = await executeMetabloomCalendarTool({
    name: 'create_calendar_event',
    args: {
      title: 'Dentist appointment',
      start: '2026-05-15T15:00:00-07:00',
      end: '2026-05-15T16:00:00-07:00',
      allDay: false,
      timeZone: 'America/Vancouver',
      location: 'Downtown Dental',
      description: '',
      attendees: [],
      color: null,
      sourceText: 'add dentist appointment to my calendar',
    },
    accountIdentity: ACCOUNT_IDENTITY,
    provider: mockProvider,
    message: 'Please add dentist appointment to my calendar',
    requestId: 'req_direct_1',
    conversationId: 'conv_1',
    gmailReadInTurn: false,
  });
  assert.equal(createCalls, 1);
  assert.equal(directCalResult.calendarReceipt.status, 'applied');
});

test('api/metabloom-gmail.js enforces SHA-256 verification, send kill-switch, saveAsDraft, dedupe, and zero-PII logging', async () => {
  const logged = [];
  const actions = [];
  let sendEnabled = true;

  const mockClient = {
    async getConnectionStatus() {
      return { configured: true, connected: true, sendConnected: true, email: 'owner@popcon.example' };
    },
    async sendMessage(_id, params) {
      actions.push({ type: 'send', to: params.to });
      return { status: 'applied', messageId: 'msg_sent_99', threadId: 'thr_99' };
    },
    async createDraft(_id, params) {
      actions.push({ type: 'draft', to: params.to });
      return { draftId: 'r-saved-99', messageId: 'msg_d99', threadId: 'thr_99' };
    },
    async trashMessage(_id, params) {
      actions.push({ type: 'trash', messageId: params.messageId });
      return { status: 'applied', messageId: params.messageId, threadId: 'thr_1' };
    },
    async sendDraft(_id, params) {
      actions.push({ type: 'send_draft', draftId: params.draftId });
      return { messageId: 'msg_from_draft', threadId: 'thr_99' };
    },
    async discardDraft(_id, params) {
      actions.push({ type: 'discard_draft', draftId: params.draftId });
      return { draftId: params.draftId, discarded: true };
    },
    async modifyLabels(_id, params) {
      actions.push({ type: 'undo', messageId: params.messageId, action: params.action });
      return { messageId: params.messageId, undoAction: 'archive' };
    },
  };

  const handler = gmailEndpoint._internals.createGmailHandler({
    requireSession: async (_req, { onAccountIdentity }) => {
      onAccountIdentity(ACCOUNT_IDENTITY);
      return null;
    },
    createClient: () => mockClient,
    isEnabled: () => true,
    isSendEnabled: () => sendEnabled,
    logger: entry => { logged.push(JSON.stringify(entry)); },
  });

  // 1. GET status
  const statusRes = makeMockRes();
  await handler({ method: 'GET', url: '/api/metabloom-gmail?mode=status', headers: {} }, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.deepEqual(statusRes.json(), {
    enabled: true,
    sendEnabled: true,
    connected: true,
    sendConnected: true,
    email: 'owner@popcon.example',
  });

  // 2. Signed proposal tampered -> 400 gmail_proposal_tampered
  const signedProposal = signGmailProposal({
    command: 'send',
    requestId: 'req_confirm_1',
    operationId: 'gmop_confirm_1',
    conversationId: 'conv_1',
    to: ['secret-recipient@example.com'],
    cc: [],
    subject: 'Confidential Deal Terms',
    body: 'Ultra secret body text 99999',
    sourceText: 'send email to secret recipient',
  }, 'req_confirm_1');

  const tamperedRes = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: {
      action: 'confirm',
      proposal: { ...signedProposal, to: ['attacker@evil.test'] },
    },
  }, tamperedRes);
  assert.equal(tamperedRes.statusCode, 400);
  assert.equal(tamperedRes.json().code, 'gmail_proposal_tampered');

  // 3. Valid confirm with saveAsDraft=true saves draft instead of sending
  const saveDraftRes = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'confirm', proposal: signedProposal, saveAsDraft: true },
  }, saveDraftRes);
  assert.equal(saveDraftRes.statusCode, 200);
  assert.equal(saveDraftRes.json().command, 'draft');
  assert.equal(saveDraftRes.json().draftId, 'r-saved-99');

  // 4. Valid confirm send executes once, second call returns duplicate
  const sendRes1 = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'confirm', proposal: signedProposal },
  }, sendRes1);
  assert.equal(sendRes1.statusCode, 200);
  assert.equal(sendRes1.json().status, 'applied');
  assert.equal(sendRes1.json().messageId, 'msg_sent_99');

  const sendRes2 = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'confirm', proposal: signedProposal },
  }, sendRes2);
  assert.equal(sendRes2.statusCode, 200);
  assert.equal(sendRes2.json().status, 'duplicate');
  assert.equal(actions.filter(a => a.type === 'send').length, 1);

  // 5. Send kill switch blocks send_draft and new confirm sends
  sendEnabled = false;
  const blockedSendDraftRes = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'send_draft', draftId: 'r-saved-99' },
  }, blockedSendDraftRes);
  assert.equal(blockedSendDraftRes.statusCode, 403);
  assert.equal(blockedSendDraftRes.json().code, 'gmail_send_disabled');

  // 6. Discard draft and Undo work even when send kill switch is active
  const discardRes = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'discard_draft', draftId: 'r-saved-99' },
  }, discardRes);
  assert.equal(discardRes.statusCode, 200);
  assert.equal(discardRes.json().draftId, 'r-saved-99');

  const undoRes = makeMockRes();
  await handler({
    method: 'POST',
    url: '/api/metabloom-gmail',
    headers: { 'content-type': 'application/json' },
    body: { action: 'undo', messageId: 'msg_1', undoAction: 'unarchive' },
  }, undoRes);
  assert.equal(undoRes.statusCode, 200);
  assert.equal(undoRes.json().status, 'applied');

  // 7. Zero-PII logging check
  const allLogs = logged.join('\n');
  assert.ok(!allLogs.includes('secret-recipient@example.com'));
  assert.ok(!allLogs.includes('Confidential Deal Terms'));
  assert.ok(!allLogs.includes('Ultra secret body text 99999'));
  assert.ok(!allLogs.includes('owner@popcon.example'));
});

test('Kill switches isMetabloomGmailEnabled and isMetabloomGmailSendEnabled behave safely', () => {
  assert.equal(isMetabloomGmailEnabled(TEST_ENV), true);
  assert.equal(isMetabloomGmailSendEnabled(TEST_ENV), true);

  assert.equal(isMetabloomGmailEnabled({ ...TEST_ENV, METABLOOM_GMAIL_ENABLED: '0' }), false);
  assert.equal(isMetabloomGmailEnabled({ ...TEST_ENV, METABLOOM_GMAIL_ENABLED: 'false' }), false);
  assert.equal(isMetabloomGmailSendEnabled({ ...TEST_ENV, METABLOOM_GMAIL_ENABLED: '0' }), false);

  assert.equal(isMetabloomGmailEnabled({ ...TEST_ENV, METABLOOM_GMAIL_SEND_ENABLED: '0' }), true);
  assert.equal(isMetabloomGmailSendEnabled({ ...TEST_ENV, METABLOOM_GMAIL_SEND_ENABLED: '0' }), false);
  assert.equal(isMetabloomGmailSendEnabled({ ...TEST_ENV, METABLOOM_GMAIL_SEND_ENABLED: 'false' }), false);

  assert.equal(isMetabloomGmailEnabled({ ...TEST_ENV, METABLOOM_CALENDAR_ENABLED: '0' }), false);
  assert.equal(isMetabloomGmailEnabled({ METABLOOM_CALENDAR_ENABLED: '1' }), false);
  assert.equal(METABLOOM_GMAIL_VERSION, 1);
  assert.ok(canonicalGmailPayload(signGmailProposal({
    command: 'trash',
    requestId: 'r1',
    operationId: 'op1',
    conversationId: 'c1',
    messageId: 'm1',
    sourceText: 'trash it',
  }, 'r1')).includes('"command":"trash"'));
});
