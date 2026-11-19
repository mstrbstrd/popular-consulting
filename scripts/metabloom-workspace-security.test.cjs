const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseMetabloomWorkspaceContext, parseMetabloomWorkspaceProposal, parseMetabloomWorkspaceReceipt,
  canonicalWorkspacePayload, METABLOOM_WORKSPACE_SAFE_FIELDS } = require('../src/components/metabloomWorkspaceProtocol');

const conversationId = '12345678-1234-4123-8123-123456789012';
const proposal = () => ({ type: 'invoice_workspace', version: 1, command: 'update', requestId: 'request-security',
  operationId: 'operation-security', conversationId, workspaceInstanceId: 'workspace-security', bindingEpoch: 3,
  expectedDataRevision: 8, changes: [{ field: 'clientName', value: 'Fictional Client', sourceText: 'Fictional Client' }],
  lineChanges: [], section: null, payloadHash: 'a'.repeat(64) });
const context = () => ({ version: 1, status: 'connected', conversationId, workspaceInstanceId: 'workspace-security',
  bindingEpoch: 3, dataRevision: 8, fields: { clientName: 'Fictional Client' }, items: [], missing: [], ready: false });
const hash = value => createHash('sha256').update(canonicalWorkspacePayload(value)).digest('hex');

test('serialized authority claims and executable actions cannot extend any workspace envelope', () => {
  for (const name of ['accountId', 'owner', 'role', 'auth', 'approved', 'execute', 'selector', 'url', 'save', 'send', 'print']) {
    const wire = JSON.parse(JSON.stringify({ ...proposal(), [name]: name === 'role' ? 'admin' : true }));
    assert.equal(parseMetabloomWorkspaceProposal(wire), null, name);
    assert.equal(parseMetabloomWorkspaceContext({ ...context(), [name]: true }), null, name);
  }
});

test('JSON prototype-pollution keys are rejected without changing object prototypes', () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const value = context();
    value.fields = JSON.parse(`{"clientName":"Fictional Client","${name}":{"polluted":true}}`);
    assert.equal(parseMetabloomWorkspaceContext(value), null);
    const changed = proposal(); changed.changes[0].field = name;
    assert.equal(parseMetabloomWorkspaceProposal(changed), null);
  }
  assert.equal({}.polluted, undefined);
});

test('a signed operation cannot be rebound to another request, thread, invoice or revision', () => {
  const original = proposal(); const originalHash = hash(original);
  for (const update of [{ requestId: 'another-request' }, { operationId: 'another-operation' },
    { conversationId: '22345678-1234-4123-8123-123456789012' }, { workspaceInstanceId: 'another-invoice' },
    { bindingEpoch: 4 }, { expectedDataRevision: 9 }, { command: 'focus', changes: [], section: 'items' }]) {
    assert.notEqual(hash({ ...original, ...update }), originalHash, JSON.stringify(update));
  }
  assert.equal(parseMetabloomWorkspaceProposal(original, 'another-request'), null);
});

test('default projection excludes every private category while explicit values remain bounded data', () => {
  for (const name of ['companyEmail', 'companyAddress', 'companyWebsite', 'companyPhone', 'businessNumber', 'taxNumber', 'clientAddress', 'notes', 'logoDataUrl'])
    assert.equal(METABLOOM_WORKSPACE_SAFE_FIELDS.includes(name), false, name);
  const allowed = context(); allowed.fields.notes = 'Fictional explicitly selected note';
  assert.equal(parseMetabloomWorkspaceContext(allowed).fields.notes, allowed.fields.notes);
  allowed.fields.logoDataUrl = 'data:image/png;base64,AAAA';
  assert.equal(parseMetabloomWorkspaceContext(allowed), null, 'Even explicit scope cannot transmit a local logo');
});

test('schema validation copies accepted snapshots so later mutation cannot change the validated payload', () => {
  const raw = proposal(), accepted = parseMetabloomWorkspaceProposal(raw);
  raw.changes[0].value = 'Changed after validation'; raw.expectedDataRevision = 100;
  assert.equal(accepted.changes[0].value, 'Fictional Client'); assert.equal(accepted.expectedDataRevision, 8);
  const source = context(), captured = parseMetabloomWorkspaceContext(source);
  source.fields.clientName = 'Changed locally'; assert.equal(captured.fields.clientName, 'Fictional Client');
});

test('many individually valid source excerpts cannot exceed the encoded operation budget', () => {
  const value = proposal();
  value.lineChanges = Array.from({ length: 20 }, () => ({ op: 'add', id: null, sourceText: '界'.repeat(1500),
    changes: [{ field: 'description', value: 'Fictional service', sourceText: 'Fictional service' }] }));
  assert.equal(parseMetabloomWorkspaceProposal(value), null);
});

test('line changes cannot smuggle totals, extreme numbers, formulas or duplicate mutation targets', () => {
  const line = { op: 'update', id: 'a'.repeat(16), sourceText: 'first line', changes: [] };
  for (const [field, value] of [['total', '1.00'], ['qty', '0'], ['cost', 'Infinity'], ['cost', '=1+1'], ['gst', 'false']]) {
    const changed = proposal(); changed.lineChanges = [{ ...line, changes: [{ field, value, sourceText: String(value) }] }];
    assert.equal(parseMetabloomWorkspaceProposal(changed), null, `${field}:${value}`);
  }
  const changed = proposal(); changed.lineChanges = [
    { ...line, op: 'remove' }, { ...line, changes: [{ field: 'cost', value: '10', sourceText: '10' }] },
  ];
  assert.equal(parseMetabloomWorkspaceProposal(changed), null);
});

test('receipts cannot assert payment or include a private invoice under alternative keys', () => {
  const receipt = { version: 1, requestId: 'request-security', operationId: 'operation-security', status: 'applied',
    workspaceInstanceId: 'workspace-security', dataRevision: 9, message: 'Updated the invoice.', missing: [], total: '997.50', currency: 'CAD' };
  for (const status of ['paid', 'issued', 'sent', 'saved', 'confirmed']) assert.equal(parseMetabloomWorkspaceReceipt({ ...receipt, status }), null);
  for (const key of ['context', 'snapshot', 'invoice', 'fields', 'items']) assert.equal(parseMetabloomWorkspaceReceipt({ ...receipt, [key]: {} }), null);
});

test('every browser edit fixture prepares against actual server targeting and source-grounding rules', () => {
  const { prepareMetabloomWorkspaceOperation } = require('../server/metabloomWorkspaceWorkflow');
  const { messages, workspaceUpdate } = require('./fixtures/metabloom-companion.cjs');
  const snapshot = context();
  snapshot.items = [['Website development', '12', '65'], ['Design review', '2', '85']].map(([description, qty, cost], index) => ({
    id: String(index + 1).repeat(16), date: '2026-11-19', description, qty, cost, discount: '0', gst: true, pst: false,
  }));
  for (const message of [messages.conflict, messages.quantity, messages.stop, messages.revoked]) {
    const result = prepareMetabloomWorkspaceOperation({ name: 'update_invoice_workspace', args: workspaceUpdate(message, snapshot),
      context: snapshot, message, requestId: 'fixture-contract-request', conversationId });
    assert.equal(result.command, 'update'); assert.equal(result.lineChanges[0].id, snapshot.items[0].id);
    assert.equal(result.lineChanges.length, 1);
  }
});

test('capability endpoint uses real origin/admin/session checks and never caches an authorization decision', async () => {
  const endpoint = require('../api/metabloom-workspace');
  const { SESSION_SECONDS, SESSION_COOKIE, SESSION_VERSION } = await import('../server/auth-session.mjs');
  const env = { AUTH_APP_ORIGIN: 'https://companion.example.test', AUTH0_ISSUER: 'https://identity.example.test/',
    AUTH0_CLIENT_ID: 'fixture-client', AUTH0_CLIENT_SECRET: 'fictional-secret-not-a-credential',
    AUTH_ADMIN_SUBJECTS: '["auth0|approved"]', AUTH_REDIS_REST_URL: 'https://redis.example.test',
    AUTH_REDIS_REST_TOKEN: 'fictional-redis-not-a-credential', AUTH_SESSION_NAMESPACE: 'companion-fixture',
    AUTH_SESSION_EPOCH: 'fixture-epoch-123456789', AUTH_ENVIRONMENT: 'development', VERCEL_ENV: 'development',
    METABLOOM_WORKSPACE_ENABLED: 'true' };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const previousFetch = global.fetch;
  let record, storeReads = 0;
  Object.assign(process.env, env);
  global.fetch = async (url, options) => {
    assert.equal(url, env.AUTH_REDIS_REST_URL, 'Capability check cannot call models or another service');
    assert.equal(JSON.parse(options.body)[0], 'GET'); storeReads++;
    return Response.json({ result: record ? JSON.stringify(record) : null });
  };
  const current = () => {
    const issuedAt = Date.now() - 1000;
    return { version: SESSION_VERSION, issuer: env.AUTH0_ISSUER, subject: 'auth0|approved',
      authenticationMethod: 'passkey', authenticatedAt: Math.floor(issuedAt / 1000),
      csrf: 'b'.repeat(64), name: 'Fictional companion user', issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000 };
  };
  const request = () => ({ method: 'GET', headers: { host: 'companion.example.test', cookie: `${SESSION_COOKIE}=${'a'.repeat(64)}` } });
  const invoke = async req => {
    const response = { headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; },
      end(value) { this.body = value; this.writableEnded = true; } };
    await endpoint(req, response);
    for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) assert.match(response.headers[name], /no-store/);
    assert.equal(response.headers.Vary, 'Cookie'); return response;
  };
  try {
    record = current();
    const allowed = await invoke(request()); assert.equal(allowed.statusCode, 200);
    assert.deepEqual(JSON.parse(allowed.body), { version: 1, enabled: true });
    for (const overrides of [null, { subject: 'auth0|unapproved' }, { expiresAt: Date.now() - 1 },
      { issuer: 'https://other.example.test/' }, { authenticationMethod: 'password' }]) {
      record = overrides === null ? null : { ...current(), ...overrides };
      const rejected = await invoke(request()); assert.equal(rejected.statusCode, 401); assert(!rejected.body.includes('enabled'));
    }
    record = current();
    for (const headers of [{ host: 'other-deployment.example.test' }, { cookie: `${SESSION_COOKIE}=admin` },
      { cookie: `${SESSION_COOKIE}=${'a'.repeat(64)}; ${SESSION_COOKIE}=${'a'.repeat(64)}` }]) {
      const before = storeReads, req = request(); Object.assign(req.headers, headers);
      const rejected = await invoke(req); assert([401, 403].includes(rejected.statusCode)); assert.equal(storeReads, before);
    }
    const wrongOrigin = request(); wrongOrigin.method = 'POST'; wrongOrigin.headers.origin = 'https://other.example.test';
    assert.equal((await invoke(wrongOrigin)).statusCode, 403);
    const write = request(); write.method = 'POST'; write.headers.origin = env.AUTH_APP_ORIGIN;
    assert.equal((await invoke(write)).statusCode, 405);
    process.env.METABLOOM_WORKSPACE_ENABLED = 'false';
    assert.deepEqual(JSON.parse((await invoke(request())).body), { version: 1, enabled: false });
    global.fetch = async () => { throw new Error('Fictional store outage'); };
    assert.equal((await invoke(request())).statusCode, 503);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
