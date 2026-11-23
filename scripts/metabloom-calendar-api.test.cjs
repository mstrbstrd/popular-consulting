const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const calendarHandler = require('../api/metabloom-calendar');
const { createMetabloomCalendarProvider } = require('../server/metabloomCalendarProvider');
const { canonicalCalendarPayload } = require('../src/components/metabloomCalendarProtocol');

const { createCalendarHandler } = calendarHandler._internals;

const ACCOUNT_IDENTITY = Object.freeze({
  accountKey: 'c'.repeat(64),
});

function createFakeRedisDb() {
  const store = new Map();
  return {
    config: { scope: 'd'.repeat(64) },
    store,
    async command(args) {
      assert.equal(args[0], 'EVAL');
      const script = args[1];
      const numKeys = Number(args[2]);
      assert.equal(numKeys, 1);
      const key = args[3];
      if (script.includes("redis.call('SET'")) {
        const expectedVersion = Number(args[4]);
        const nextText = args[5];
        const current = store.get(key) ?? null;
        let version = 0;
        if (current !== null) {
          const parsed = JSON.parse(current);
          version = parsed.version;
        }
        if (version !== expectedVersion) return ['conflict'];
        store.set(key, nextText);
        return ['ok', nextText];
      }
      return store.get(key) ?? null;
    },
  };
}

function createHarness({ enabled = true, authenticated = true, requireError = false, logs = [] } = {}) {
  const db = createFakeRedisDb();
  let clock = 1760000000000;
  const now = () => {
    clock += 1000;
    return clock;
  };
  const provider = createMetabloomCalendarProvider({
    env: { CALENDAR_PROVIDER: 'redis' },
    database: db,
    now,
    logger: entry => logs.push(entry),
  });
  const requireSession = async (_request, { onAccountIdentity } = {}) => {
    if (requireError) throw new Error('auth down');
    if (!authenticated) return { status: 401, code: 'authentication_required' };
    onAccountIdentity?.(ACCOUNT_IDENTITY);
    return null;
  };
  const handler = createCalendarHandler({
    requireSession,
    createProvider: () => provider,
    isEnabled: () => enabled,
    getProviderKind: () => provider.kind,
  });
  return { handler, db, provider, logs };
}

async function invoke(handler, {
  method = 'GET',
  url = '/api/metabloom-calendar',
  body,
  headers = {},
} = {}) {
  const req = {
    method,
    url,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  };
  const res = Object.assign(new EventEmitter(), {
    headers: {},
    body: '',
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name, value) { this.headers[name] = value; },
    end(chunk = '') {
      this.body += chunk;
      this.writableEnded = true;
    },
  });
  await handler(req, res);
  const contentType = res.headers['Content-Type'] || '';
  const json = contentType.includes('application/json') && res.body
    ? JSON.parse(res.body)
    : null;
  return { status: res.statusCode, headers: res.headers, body: res.body, json };
}

function signProposal(unsigned) {
  const payloadHash = createHash('sha256')
    .update(canonicalCalendarPayload(unsigned))
    .digest('hex');
  return { ...unsigned, payloadHash };
}

test('disabled calendar returns status false on GET ?mode=status and 404 on reads/writes', async () => {
  const { handler } = createHarness({ enabled: false });

  const statusRes = await invoke(handler, { url: '/api/metabloom-calendar?mode=status' });
  assert.equal(statusRes.status, 200);
  assert.deepEqual(statusRes.json, {
    enabled: false,
    provider: 'redis',
    events: [],
    version: 0,
  });

  const listRes = await invoke(handler, { url: '/api/metabloom-calendar' });
  assert.equal(listRes.status, 404);
  assert.deepEqual(listRes.json, { enabled: false, code: 'calendar_disabled' });

  const icsRes = await invoke(handler, { url: '/api/metabloom-calendar?format=ics' });
  assert.equal(icsRes.status, 404);
  assert.deepEqual(icsRes.json, { enabled: false, code: 'calendar_disabled' });

  const postRes = await invoke(handler, {
    method: 'POST',
    body: {
      action: 'create',
      event: {
        title: 'Blocked',
        start: '2026-11-24T17:00:00.000Z',
        end: '2026-11-24T18:00:00.000Z',
      },
    },
  });
  assert.equal(postRes.status, 404);
  assert.deepEqual(postRes.json, { enabled: false, code: 'calendar_disabled' });
});

test('auth denial, auth exception, and unsupported methods return expected status codes', async () => {
  const unauth = createHarness({ authenticated: false });
  const r401 = await invoke(unauth.handler, { url: '/api/metabloom-calendar?mode=status' });
  assert.equal(r401.status, 401);
  assert.deepEqual(r401.json, { code: 'authentication_required' });

  const brokenAuth = createHarness({ requireError: true });
  const r503 = await invoke(brokenAuth.handler, { url: '/api/metabloom-calendar?mode=status' });
  assert.equal(r503.status, 503);
  assert.deepEqual(r503.json, { code: 'authentication_unavailable' });

  const enabled = createHarness({ enabled: true });
  const r405 = await invoke(enabled.handler, { method: 'PUT' });
  assert.equal(r405.status, 405);
  assert.equal(r405.headers.Allow, 'GET, POST, PATCH, DELETE');
  assert.deepEqual(r405.json, { code: 'method_not_allowed' });
});

test('GET status, create, idempotent retry, list with range, and ICS export work end to end', async () => {
  const logs = [];
  const { handler } = createHarness({ enabled: true, logs });

  const statusRes = await invoke(handler, { url: '/api/metabloom-calendar?mode=status' });
  assert.equal(statusRes.status, 200);
  assert.deepEqual(statusRes.json, { enabled: true, provider: 'redis' });
  assert.equal(statusRes.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(statusRes.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');

  const initialList = await invoke(handler);
  assert.equal(initialList.status, 200);
  assert.deepEqual(initialList.json, {
    enabled: true,
    provider: 'redis',
    version: 0,
    updatedAt: 0,
    events: [],
  });

  const payloadHash = createHash('sha256').update('op-create-1').digest('hex');
  const createBody = {
    action: 'create',
    event: {
      title: 'Confidential Strategy Sync',
      start: '2026-11-24T17:00:00.000Z',
      end: '2026-11-24T18:00:00.000Z',
      timeZone: 'America/Vancouver',
      location: 'Room 404',
      description: 'Top secret quarterly notes',
      attendees: ['alice@example.test'],
      color: 'cobalt',
    },
    expectedVersion: 0,
    operationId: 'op_create_001',
    payloadHash,
  };
  const created = await invoke(handler, { method: 'POST', body: createBody });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, 'applied');
  assert.equal(created.json.version, 1);
  assert.equal(created.json.event.title, 'Confidential Strategy Sync');
  assert.equal(created.json.event.revision, 1);
  assert.ok(created.json.undoToken);

  // Duplicate operationId + same payloadHash returns duplicate without adding a second event.
  const duplicate = await invoke(handler, { method: 'POST', body: createBody });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.status, 'duplicate');
  assert.equal(duplicate.json.eventId, created.json.eventId);

  // Same operationId with different payloadHash fails with 409 calendar_operation_conflict.
  const opConflict = await invoke(handler, {
    method: 'POST',
    body: {
      ...createBody,
      payloadHash: createHash('sha256').update('different-payload').digest('hex'),
    },
  });
  assert.equal(opConflict.status, 409);
  assert.deepEqual(opConflict.json, { code: 'calendar_operation_conflict' });

  // Range query includes matching event and excludes out-of-window range.
  const inRange = await invoke(handler, {
    url: '/api/metabloom-calendar?start=2026-11-24T00:00:00.000Z&end=2026-11-25T00:00:00.000Z&timeZone=America%2FVancouver&limit=10',
  });
  assert.equal(inRange.status, 200);
  assert.equal(inRange.json.events.length, 1);
  assert.equal(inRange.json.events[0].id, created.json.eventId);

  const outOfRange = await invoke(handler, {
    url: '/api/metabloom-calendar?start=2026-12-01T00:00:00.000Z&end=2026-12-02T00:00:00.000Z',
  });
  assert.equal(outOfRange.status, 200);
  assert.equal(outOfRange.json.events.length, 0);

  // Malformed query fails with 400.
  const badRange = await invoke(handler, {
    url: '/api/metabloom-calendar?start=2026-11-24T00:00:00.000Z',
  });
  assert.equal(badRange.status, 400);
  assert.deepEqual(badRange.json, { code: 'calendar_invalid' });

  // ICS export returns text/calendar attachment with private headers.
  const ics = await invoke(handler, { url: '/api/metabloom-calendar?format=ics' });
  assert.equal(ics.status, 200);
  assert.equal(ics.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match(ics.headers['Content-Disposition'], /attachment; filename="popular-consulting-calendar\.ics"/);
  assert.match(ics.body, /BEGIN:VCALENDAR/);
  assert.match(ics.body, /SUMMARY:Confidential Strategy Sync/);
  assert.match(ics.body, /END:VCALENDAR/);

  // Redacted logging invariant (S6): no titles, descriptions, attendees, or undo tokens in logs.
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes('Confidential Strategy Sync'), false);
  assert.equal(serializedLogs.includes('Top secret quarterly notes'), false);
  assert.equal(serializedLogs.includes('alice@example.test'), false);
  assert.equal(serializedLogs.includes(created.json.undoToken), false);
});

test('PATCH, DELETE, optimistic conflict detection, and POST undo work cleanly', async () => {
  const { handler } = createHarness({ enabled: true });

  const created = await invoke(handler, {
    method: 'POST',
    body: {
      action: 'create',
      event: {
        title: 'Design Review',
        start: '2026-11-25T16:00:00.000Z',
        end: '2026-11-25T17:00:00.000Z',
      },
    },
  });
  assert.equal(created.status, 201);
  const eventId = created.json.eventId;

  // PATCH updates title and bumps revision to 2.
  const updated = await invoke(handler, {
    method: 'PATCH',
    body: {
      eventId,
      patch: { title: 'Architecture & Design Review', color: 'emerald' },
      expectedEventRevision: 1,
      expectedVersion: 1,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.version, 2);
  assert.equal(updated.json.event.title, 'Architecture & Design Review');
  assert.equal(updated.json.event.revision, 2);

  // Stale revision on PATCH returns 409 calendar_conflict.
  const stalePatch = await invoke(handler, {
    method: 'PATCH',
    body: {
      eventId,
      patch: { title: 'Stale Write' },
      expectedEventRevision: 1,
    },
  });
  assert.equal(stalePatch.status, 409);
  assert.deepEqual(stalePatch.json, { code: 'calendar_conflict' });

  // Stale expectedVersion on DELETE returns 409 calendar_conflict.
  const staleVersionDelete = await invoke(handler, {
    method: 'DELETE',
    body: {
      eventId,
      expectedEventRevision: 2,
      expectedVersion: 1,
    },
  });
  assert.equal(staleVersionDelete.status, 409);
  assert.deepEqual(staleVersionDelete.json, { code: 'calendar_conflict' });

  // Undo the update restores original title.
  const undoneUpdate = await invoke(handler, {
    method: 'POST',
    body: {
      action: 'undo',
      undoToken: updated.json.undoToken,
      expectedVersion: 2,
    },
  });
  assert.equal(undoneUpdate.status, 200);
  assert.equal(undoneUpdate.json.undoneAction, 'update');
  assert.equal(undoneUpdate.json.event.title, 'Design Review');
  assert.equal(undoneUpdate.json.event.revision, 3);

  // Re-using consumed undo token fails with 409 calendar_undo_unavailable.
  const reusedUndo = await invoke(handler, {
    method: 'POST',
    body: { action: 'undo', undoToken: updated.json.undoToken },
  });
  assert.equal(reusedUndo.status, 409);
  assert.deepEqual(reusedUndo.json, { code: 'calendar_undo_unavailable' });

  // DELETE removes the event and returns an undoToken.
  const deleted = await invoke(handler, {
    method: 'DELETE',
    body: { eventId, expectedEventRevision: 3, expectedVersion: 3 },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.event, null);
  assert.equal(deleted.json.eventId, eventId);
  assert.ok(deleted.json.undoToken);

  // Deleting again returns 404 calendar_not_found.
  const missingDelete = await invoke(handler, {
    method: 'DELETE',
    body: { eventId, expectedEventRevision: 3 },
  });
  assert.equal(missingDelete.status, 404);
  assert.deepEqual(missingDelete.json, { code: 'calendar_not_found' });

  // Undoing the delete restores the event.
  const restored = await invoke(handler, {
    method: 'POST',
    body: { action: 'undo', undoToken: deleted.json.undoToken },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.json.undoneAction, 'delete');
  assert.equal(restored.json.event.id, eventId);
});

test('POST confirm verifies SHA-256 payloadHash and executes create/update/delete proposals', async () => {
  const { handler } = createHarness({ enabled: true });

  const createProposal = signProposal({
    type: 'calendar_workspace',
    version: 1,
    command: 'create',
    requestId: 'req_confirm_1',
    operationId: 'op_confirm_create_1',
    conversationId: 'conv_confirm_1',
    expectedVersion: 0,
    requiresConfirmation: true,
    eventId: null,
    expectedEventRevision: null,
    event: {
      title: 'Client Kickoff',
      start: '2026-11-26T18:00:00.000Z',
      end: '2026-11-26T19:00:00.000Z',
      allDay: false,
      timeZone: 'America/Vancouver',
      location: 'Zoom',
      description: 'Project scope review',
      attendees: ['client@example.test'],
      color: 'amber',
    },
    patch: null,
    focus: { date: '2026-11-26', view: 'week', eventId: null },
    sourceText: 'Schedule Client Kickoff with client@example.test on Nov 26 at 10am',
  });

  // Tampered proposal is rejected with 400 calendar_proposal_tampered.
  const tampered = {
    ...createProposal,
    event: { ...createProposal.event, title: 'Tampered Title' },
  };
  const tamperedRes = await invoke(handler, {
    method: 'POST',
    body: { action: 'confirm', proposal: tampered },
  });
  assert.equal(tamperedRes.status, 400);
  assert.deepEqual(tamperedRes.json, { code: 'calendar_proposal_tampered' });

  // Valid create proposal commits with source: 'agent'.
  const confirmedCreate = await invoke(handler, {
    method: 'POST',
    body: { action: 'confirm', proposal: createProposal },
  });
  assert.equal(confirmedCreate.status, 200);
  assert.equal(confirmedCreate.json.status, 'applied');
  assert.equal(confirmedCreate.json.event.source, 'agent');
  assert.equal(confirmedCreate.json.event.title, 'Client Kickoff');
  const eventId = confirmedCreate.json.eventId;

  // Confirming an update proposal updates the event.
  const updateProposal = signProposal({
    type: 'calendar_workspace',
    version: 1,
    command: 'update',
    requestId: 'req_confirm_2',
    operationId: 'op_confirm_update_1',
    conversationId: 'conv_confirm_1',
    expectedVersion: 1,
    requiresConfirmation: true,
    eventId,
    expectedEventRevision: 1,
    event: null,
    patch: { location: 'Boardroom A', attendees: ['client@example.test', 'pm@example.test'] },
    focus: null,
    sourceText: 'Move Client Kickoff to Boardroom A and invite pm@example.test',
  });
  const confirmedUpdate = await invoke(handler, {
    method: 'POST',
    body: { action: 'confirm', proposal: updateProposal },
  });
  assert.equal(confirmedUpdate.status, 200);
  assert.equal(confirmedUpdate.json.event.location, 'Boardroom A');
  assert.equal(confirmedUpdate.json.event.revision, 2);

  // Confirming a delete proposal deletes the event.
  const deleteProposal = signProposal({
    type: 'calendar_workspace',
    version: 1,
    command: 'delete',
    requestId: 'req_confirm_3',
    operationId: 'op_confirm_delete_1',
    conversationId: 'conv_confirm_1',
    expectedVersion: 2,
    requiresConfirmation: true,
    eventId,
    expectedEventRevision: 2,
    event: null,
    patch: null,
    focus: null,
    sourceText: 'Cancel Client Kickoff',
  });
  const confirmedDelete = await invoke(handler, {
    method: 'POST',
    body: { action: 'confirm', proposal: deleteProposal },
  });
  assert.equal(confirmedDelete.status, 200);
  assert.equal(confirmedDelete.json.status, 'applied');
  assert.equal(confirmedDelete.json.event, null);
  assert.equal(confirmedDelete.json.eventId, eventId);

  // Non-mutating proposal command (open) is rejected on confirm.
  const openProposal = signProposal({
    type: 'calendar_workspace',
    version: 1,
    command: 'open',
    requestId: 'req_confirm_4',
    operationId: 'op_confirm_open_1',
    conversationId: 'conv_confirm_1',
    expectedVersion: null,
    requiresConfirmation: false,
    eventId: null,
    expectedEventRevision: null,
    event: null,
    patch: null,
    focus: null,
    sourceText: 'Open my calendar',
  });
  const badConfirm = await invoke(handler, {
    method: 'POST',
    body: { action: 'confirm', proposal: openProposal },
  });
  assert.equal(badConfirm.status, 400);
  assert.deepEqual(badConfirm.json, { code: 'calendar_invalid' });
});

test('missing JSON content-type and extra unknown body keys fail with 400 calendar_invalid', async () => {
  const { handler } = createHarness({ enabled: true });

  const wrongType = await invoke(handler, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ action: 'undo', undoToken: 'undo_12345678' }),
  });
  assert.equal(wrongType.status, 400);
  assert.deepEqual(wrongType.json, { code: 'calendar_invalid' });

  const extraKey = await invoke(handler, {
    method: 'POST',
    body: { action: 'undo', undoToken: 'undo_12345678', unexpected: true },
  });
  assert.equal(extraKey.status, 400);
  assert.deepEqual(extraKey.json, { code: 'calendar_invalid' });
});
