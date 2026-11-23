const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetabloomCalendarStore } = require('../server/metabloomCalendarStore');
const { createMetabloomCalendarProvider, getMetabloomCalendarProviderKind, isMetabloomCalendarEnabled } = require('../server/metabloomCalendarProvider');

const SCOPE = '1'.repeat(64);
const IDENTITY = Object.freeze({ accountKey: '2'.repeat(64) });
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function createMemoryRedisDatabase() {
  const store = new Map();
  return {
    config: { scope: SCOPE },
    async command(args) {
      const [cmd, script, numKeys, key, arg1, arg2] = args;
      assert.equal(cmd, 'EVAL');
      assert.equal(numKeys, '1');
      if (script.includes("redis.call('SET'")) {
        const current = store.get(key) || null;
        const currentVersion = current ? JSON.parse(current).version : 0;
        if (currentVersion !== Number(arg1)) return ['conflict'];
        store.set(key, arg2);
        return ['ok', arg2];
      }
      return store.get(key) || null;
    },
  };
}

test('create, list, update, delete, and undo calendar events with optimistic concurrency', async () => {
  let clock = 1795450000000;
  let seq = 0;
  const db = createMemoryRedisDatabase();
  const store = createMetabloomCalendarStore(db, {
    now: () => ++clock,
    idGenerator: () => `evt_${String(++seq).padStart(12, '0')}`,
    undoTokenGenerator: () => `undo_${String(++seq).padStart(12, '0')}`,
  });

  const initial = await store.listEvents(IDENTITY);
  assert.equal(initial.version, 0);
  assert.deepEqual(initial.events, []);

  const created = await store.createEvent(IDENTITY, {
    event: {
      title: 'Design sync',
      start: '2026-11-24T17:00:00.000Z',
      end: '2026-11-24T18:00:00.000Z',
      timeZone: 'America/Vancouver',
    },
    source: 'agent',
    expectedVersion: 0,
    operationId: 'op-create-1',
    payloadHash: HASH_A,
  });
  assert.equal(created.status, 'applied');
  assert.equal(created.version, 1);
  assert.equal(created.event.revision, 1);

  // Exact replay with the same operationId + payloadHash returns duplicate.
  const replay = await store.createEvent(IDENTITY, {
    event: {
      title: 'Design sync',
      start: '2026-11-24T17:00:00.000Z',
      end: '2026-11-24T18:00:00.000Z',
      timeZone: 'America/Vancouver',
    },
    source: 'agent',
    expectedVersion: 0,
    operationId: 'op-create-1',
    payloadHash: HASH_A,
  });
  assert.equal(replay.status, 'duplicate');
  assert.equal(replay.eventId, created.eventId);

  // Reusing operationId with an altered payload fails closed.
  await assert.rejects(
    () => store.createEvent(IDENTITY, {
      event: {
        title: 'Tampered',
        start: '2026-11-24T17:00:00.000Z',
        end: '2026-11-24T18:00:00.000Z',
      },
      operationId: 'op-create-1',
      payloadHash: HASH_B,
    }),
    error => error.code === 'calendar_operation_conflict',
  );

  // Updating with stale event revision fails with conflict.
  await assert.rejects(
    () => store.updateEvent(IDENTITY, {
      eventId: created.eventId,
      patch: { title: 'Stale' },
      expectedEventRevision: 99,
    }),
    error => error.code === 'calendar_conflict',
  );

  const updated = await store.updateEvent(IDENTITY, {
    eventId: created.eventId,
    patch: { title: 'Design sync v2', location: 'Studio' },
    expectedEventRevision: 1,
    source: 'manual',
  });
  assert.equal(updated.status, 'applied');
  assert.equal(updated.event.revision, 2);
  assert.equal(updated.event.title, 'Design sync v2');

  // Undoing the original create must fail because the event was subsequently edited.
  await assert.rejects(
    () => store.undoOperation(IDENTITY, { undoToken: created.undoToken }),
    error => error.code === 'calendar_conflict',
  );

  // Undoing the latest update restores the previous fields at revision 3.
  const undoneUpdate = await store.undoOperation(IDENTITY, { undoToken: updated.undoToken });
  assert.equal(undoneUpdate.undoneAction, 'update');
  assert.equal(undoneUpdate.event.title, 'Design sync');
  assert.equal(undoneUpdate.event.revision, 3);

  // Delete and then undo delete restores the event.
  const deleted = await store.deleteEvent(IDENTITY, {
    eventId: created.eventId,
    expectedEventRevision: 3,
  });
  assert.equal(deleted.status, 'applied');
  assert.equal((await store.listEvents(IDENTITY)).events.length, 0);

  const restored = await store.undoOperation(IDENTITY, { undoToken: deleted.undoToken });
  assert.equal(restored.undoneAction, 'delete');
  assert.equal(restored.event.title, 'Design sync');
  assert.equal((await store.listEvents(IDENTITY)).events.length, 1);
});

test('provider exposes free slots, ICS export, feature flags, and redacted logs', async () => {
  const logs = [];
  const db = createMemoryRedisDatabase();
  const provider = createMetabloomCalendarProvider({
    env: { CALENDAR_PROVIDER: 'redis' },
    database: db,
    now: () => 1795450000000,
    logger: entry => logs.push(entry),
  });

  assert.equal(provider.kind, 'redis');
  assert.equal(isMetabloomCalendarEnabled({}), false);
  assert.equal(isMetabloomCalendarEnabled({ METABLOOM_CALENDAR_ENABLED: '1' }), true);
  assert.equal(getMetabloomCalendarProviderKind({ CALENDAR_PROVIDER: 'mcp' }), 'redis');
  assert.equal(getMetabloomCalendarProviderKind({
    CALENDAR_PROVIDER: 'mcp',
    CALENDAR_MCP_URL: 'https://mcp.example.com/calendar',
  }), 'mcp');

  await provider.createEvent(IDENTITY, {
    event: {
      title: 'Confidential Client Call',
      start: '2026-11-24T17:00:00.000Z',
      end: '2026-11-24T18:00:00.000Z',
      attendees: ['secret@client.example'],
    },
    operationId: 'op-secret-1',
    payloadHash: HASH_A,
  }, { requestRef: 'req-42' });

  const { slots } = await provider.findFreeSlots(IDENTITY, {
    start: '2026-11-24T16:00:00.000Z',
    end: '2026-11-24T19:00:00.000Z',
    durationMinutes: 45,
  }, { requestRef: 'req-43' });
  assert.equal(slots.length, 2);

  const ics = await provider.exportIcs(IDENTITY);
  assert.match(ics, /SUMMARY:Confidential Client Call/);

  // Redaction invariant: no event title or attendee email may appear in logs.
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes('Confidential Client Call'), false);
  assert.equal(serializedLogs.includes('secret@client.example'), false);
  assert.equal(logs[0].requestRef, 'req-42');
  assert.equal(logs[0].operation, 'create_event');
});
