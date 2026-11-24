import {
  METABLOOM_GMAIL_VERSION,
  MAX_GMAIL_LIST_RESULTS,
  MAX_GMAIL_READ_PER_TURN,
  MAX_GMAIL_BODY_CHARS,
  GMAIL_COMMANDS,
  GMAIL_ORGANIZE_ACTIONS,
  GMAIL_RECEIPT_STATUSES,
  sanitizeUntrustedEmailText,
  isValidEmailAddress,
  parseEmailAddressList,
  parseGmailProposal,
  parseGmailReceipt,
  canonicalGmailPayload,
} from './metabloomGmailProtocol';

const VALID_HASH = 'a'.repeat(64);

function makeSendProposal(overrides = {}) {
  return {
    type: 'gmail_workspace',
    version: METABLOOM_GMAIL_VERSION,
    command: 'send',
    requestId: 'req_gmail_01',
    operationId: 'gmop_01',
    conversationId: 'conv_01',
    requiresConfirmation: true,
    messageId: null,
    threadId: null,
    inReplyTo: null,
    to: ['alice@example.com'],
    cc: [],
    subject: 'Project kickoff',
    body: 'Hi Alice, let us meet tomorrow at 10am.',
    sourceText: 'email Alice about project kickoff',
    payloadHash: VALID_HASH,
    ...overrides,
  };
}

function makeTrashProposal(overrides = {}) {
  return {
    type: 'gmail_workspace',
    version: METABLOOM_GMAIL_VERSION,
    command: 'trash',
    requestId: 'req_gmail_02',
    operationId: 'gmop_02',
    conversationId: 'conv_01',
    requiresConfirmation: true,
    messageId: 'msg_abc123',
    threadId: 'thr_abc123',
    inReplyTo: null,
    to: [],
    cc: [],
    subject: 'Old newsletter',
    body: '',
    sourceText: 'move the old newsletter to trash',
    payloadHash: VALID_HASH,
    ...overrides,
  };
}

function makeReceipt(overrides = {}) {
  return {
    version: METABLOOM_GMAIL_VERSION,
    requestId: 'req_gmail_01',
    operationId: 'gmop_01',
    status: 'applied',
    command: 'draft',
    draftId: 'r-12345',
    messageId: 'msg_12345',
    threadId: 'thr_12345',
    undoAction: null,
    requiresConfirmation: false,
    message: 'Email draft created in Gmail.',
    preview: {
      to: ['alice@example.com'],
      cc: [],
      subject: 'Project kickoff',
      snippet: 'Hi Alice, let us meet tomorrow.',
      from: null,
    },
    ...overrides,
  };
}

describe('metabloomGmailProtocol', () => {
  test('exports expected protocol constants', () => {
    expect(METABLOOM_GMAIL_VERSION).toBe(1);
    expect(MAX_GMAIL_LIST_RESULTS).toBe(15);
    expect(MAX_GMAIL_READ_PER_TURN).toBe(3);
    expect(MAX_GMAIL_BODY_CHARS).toBe(4000);
    expect(GMAIL_COMMANDS).toEqual(['send', 'draft', 'organize', 'trash']);
    expect(GMAIL_ORGANIZE_ACTIONS).toEqual(['archive', 'mark_read', 'mark_unread', 'star', 'unstar']);
    expect(GMAIL_RECEIPT_STATUSES).toEqual([
      'applied',
      'pending_confirmation',
      'duplicate',
      'rejected',
      'cancelled',
      'unavailable',
    ]);
  });

  test('sanitizeUntrustedEmailText strips scripts, styles, HTML tags, and control chars', () => {
    const dirty = '<div><style>body{color:red}</style><script>alert(1)</script>'
      + '<p>Hello &amp; welcome &lt;friend&gt;!</p><p>Line\u0000\u0007\u202e two&nbsp;here&#39;s more.</p></div>';
    const cleaned = sanitizeUntrustedEmailText(dirty, 200);
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert(1)');
    expect(cleaned).not.toContain('color:red');
    expect(cleaned).not.toContain('\u0000');
    expect(cleaned).not.toContain('\u202e');
    expect(cleaned).toContain('Hello & welcome <friend>!');
    expect(cleaned).toContain("Line two here's more.");
  });

  test('sanitizeUntrustedEmailText enforces maxLength cap and handles non-strings', () => {
    expect(sanitizeUntrustedEmailText(null, 50)).toBe('');
    expect(sanitizeUntrustedEmailText('a'.repeat(500), 40)).toHaveLength(40);
  });

  test('isValidEmailAddress accepts valid addresses and rejects header injection or malformed inputs', () => {
    expect(isValidEmailAddress('alice@example.com')).toBe(true);
    expect(isValidEmailAddress('bob.smith+work@sub.company.co.uk')).toBe(true);
    expect(isValidEmailAddress('bad\r\nBcc:evil@example.com')).toBe(false);
    expect(isValidEmailAddress('bad\n@example.com')).toBe(false);
    expect(isValidEmailAddress('alice @example.com')).toBe(false);
    expect(isValidEmailAddress('alice@localhost')).toBe(false);
    expect(isValidEmailAddress('alice..bob@example.com')).toBe(false);
    expect(isValidEmailAddress(`${'a'.repeat(250)}@example.com`)).toBe(false);
    expect(isValidEmailAddress('')).toBe(false);
    expect(isValidEmailAddress(null)).toBe(false);
  });

  test('parseEmailAddressList normalizes strings and arrays, deduplicates, and rejects CR/LF', () => {
    expect(parseEmailAddressList('alice@example.com, BOB@example.com, alice@example.com')).toEqual([
      'alice@example.com',
      'BOB@example.com',
    ]);
    expect(parseEmailAddressList(['one@example.com', 'two@example.com'])).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
    expect(parseEmailAddressList('')).toEqual([]);
    expect(parseEmailAddressList([])).toEqual([]);
    expect(parseEmailAddressList('alice@example.com\r\nBcc:evil@example.com')).toBeNull();
    expect(parseEmailAddressList(['alice@example.com\n'])).toBeNull();
    expect(parseEmailAddressList(['not-an-email'])).toBeNull();
    expect(parseEmailAddressList(['a@b.co', 'c@d.co', 'e@f.co'], 2)).toBeNull();
  });

  test('parseGmailProposal validates send and trash proposals and enforces requiresConfirmation === true', () => {
    const validSend = parseGmailProposal(makeSendProposal(), 'req_gmail_01');
    expect(validSend).toMatchObject({ command: 'send', requiresConfirmation: true });

    const validTrash = parseGmailProposal(makeTrashProposal(), 'req_gmail_02');
    expect(validTrash).toMatchObject({ command: 'trash', requiresConfirmation: true, messageId: 'msg_abc123' });

    expect(parseGmailProposal(makeSendProposal({ requiresConfirmation: false }), 'req_gmail_01')).toBeNull();
    expect(parseGmailProposal(makeTrashProposal({ requiresConfirmation: false }), 'req_gmail_02')).toBeNull();
    expect(parseGmailProposal(makeSendProposal({ command: 'draft' }), 'req_gmail_01')).toBeNull();
    expect(parseGmailProposal(makeSendProposal({ to: [] }), 'req_gmail_01')).toBeNull();
    expect(parseGmailProposal(makeSendProposal({ subject: 'Injected\r\nBcc:evil@example.com' }), 'req_gmail_01')).toBeNull();
    expect(parseGmailProposal(makeTrashProposal({ messageId: null }), 'req_gmail_02')).toBeNull();
    expect(parseGmailProposal(makeSendProposal(), 'req_different')).toBeNull();
  });

  test('parseGmailReceipt validates drafts, organize undo actions, and rejects invalid shapes', () => {
    expect(parseGmailReceipt(makeReceipt())).toMatchObject({
      status: 'applied',
      command: 'draft',
      draftId: 'r-12345',
    });

    const organizeReceipt = parseGmailReceipt(makeReceipt({
      command: 'organize',
      draftId: null,
      undoAction: 'unarchive',
      message: 'Archived message.',
      preview: { subject: 'Status update', from: 'boss@example.com', snippet: 'Looks good' },
    }));
    expect(organizeReceipt).toMatchObject({ command: 'organize', undoAction: 'unarchive' });

    expect(parseGmailReceipt(makeReceipt({ undoAction: 'permanent_delete' }))).toBeNull();
    expect(parseGmailReceipt(makeReceipt({ status: 'unknown_status' }))).toBeNull();
    expect(parseGmailReceipt(makeReceipt({ extraField: true }))).toBeNull();
  });

  test('canonicalGmailPayload produces deterministic sorted JSON omitting payloadHash', () => {
    const a = makeSendProposal({ payloadHash: '1'.repeat(64) });
    const b = {
      payloadHash: '2'.repeat(64),
      body: a.body,
      subject: a.subject,
      cc: a.cc,
      to: a.to,
      inReplyTo: a.inReplyTo,
      threadId: a.threadId,
      messageId: a.messageId,
      requiresConfirmation: a.requiresConfirmation,
      conversationId: a.conversationId,
      operationId: a.operationId,
      requestId: a.requestId,
      command: a.command,
      version: a.version,
      type: a.type,
      sourceText: a.sourceText,
    };
    const canonA = canonicalGmailPayload(a);
    const canonB = canonicalGmailPayload(b);
    expect(canonA).toBe(canonB);
    expect(canonA).not.toContain('payloadHash');
  });

  test('works when global TextEncoder is undefined (JSDOM fallback)', () => {
    const originalTextEncoder = globalThis.TextEncoder;
    try {
      globalThis.TextEncoder = undefined;
      expect(parseGmailProposal(makeSendProposal(), 'req_gmail_01')).not.toBeNull();
      expect(parseGmailReceipt(makeReceipt())).not.toBeNull();
    } finally {
      globalThis.TextEncoder = originalTextEncoder;
    }
  });
});
