const { randomBytes } = require('node:crypto');
const {
  MAX_CALENDAR_EVENTS,
  MAX_CALENDAR_STORE_BYTES,
  MAX_CALENDAR_UNDO_HISTORY,
  MAX_CALENDAR_RECEIPT_CACHE,
  parseCalendarEvent,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarRangeQuery,
  eventIntervalMs,
  eventOverlapsWindow,
} = require('../src/components/metabloomCalendarProtocol');

const READ_SCRIPT = "return redis.call('GET', KEYS[1])";
const WRITE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local version = 0
if current then
  local record = cjson.decode(current)
  if type(record.version) ~= 'number' or record.version < 1 or record.version ~= math.floor(record.version) then
    return redis.error_reply('Invalid calendar record')
  end
  version = record.version
end
if version ~= tonumber(ARGV[1]) then return {'conflict'} end
redis.call('SET', KEYS[1], ARGV[2])
return {'ok', ARGV[2]}`;

function calendarError(code = 'calendar_unavailable') {
  return Object.assign(new Error(code), { code });
}

const defaultDatabase = () => require('./metabloomSavedWorkDatabase').getMetabloomSavedWorkDatabase();
const defaultId = () => `evt_${randomBytes(12).toString('hex')}`;
const defaultUndoToken = () => `undo_${randomBytes(12).toString('hex')}`;

function emptyState() {
  return {
    version: 0,
    updatedAt: 0,
    events: [],
    recentOperations: [],
    undoHistory: [],
  };
}

function validRecentOperation(entry) {
  return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.operationId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(entry.operationId)
    && typeof entry.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(entry.payloadHash)
    && (entry.eventId === null || (typeof entry.eventId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(entry.eventId)))
    && (entry.undoToken === null || (typeof entry.undoToken === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(entry.undoToken)))
    && Number.isSafeInteger(entry.at) && entry.at >= 1;
}

function validUndoEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (typeof entry.undoToken !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(entry.undoToken)) return false;
  if (!['create', 'update', 'delete'].includes(entry.action)) return false;
  if (typeof entry.eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(entry.eventId)) return false;
  if (entry.beforeEvent !== null && !parseCalendarEvent(entry.beforeEvent)) return false;
  if (entry.afterRevision !== null && (!Number.isSafeInteger(entry.afterRevision) || entry.afterRevision < 1)) return false;
  if (!Number.isSafeInteger(entry.createdAt) || entry.createdAt < 1) return false;
  return true;
}

function parseRecord(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CALENDAR_STORE_BYTES) {
    throw calendarError();
  }
  let value;
  try { value = JSON.parse(text); } catch { throw calendarError(); }
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1
    || !Array.isArray(value.events) || value.events.length > MAX_CALENDAR_EVENTS
    || !Array.isArray(value.recentOperations) || value.recentOperations.length > MAX_CALENDAR_RECEIPT_CACHE
    || !Array.isArray(value.undoHistory) || value.undoHistory.length > MAX_CALENDAR_UNDO_HISTORY) {
    throw calendarError();
  }
  const events = [];
  const seenIds = new Set();
  for (const raw of value.events) {
    const parsed = parseCalendarEvent(raw);
    if (!parsed || seenIds.has(parsed.id)) throw calendarError();
    seenIds.add(parsed.id);
    events.push(parsed);
  }
  if (!value.recentOperations.every(validRecentOperation) || !value.undoHistory.every(validUndoEntry)) {
    throw calendarError();
  }
  return {
    version: value.version,
    updatedAt: value.updatedAt,
    events,
    recentOperations: value.recentOperations.map(entry => ({ ...entry })),
    undoHistory: value.undoHistory.map(entry => ({
      ...entry,
      beforeEvent: entry.beforeEvent ? parseCalendarEvent(entry.beforeEvent) : null,
    })),
  };
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const ia = eventIntervalMs(a);
    const ib = eventIntervalMs(b);
    const diff = (ia?.startMs || 0) - (ib?.startMs || 0);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

function createMetabloomCalendarStore(database, {
  now = Date.now,
  idGenerator = defaultId,
  undoTokenGenerator = defaultUndoToken,
} = {}) {
  const resolveDb = () => database || defaultDatabase();

  const keyFor = identity => {
    const db = resolveDb();
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(db.config?.scope)) {
      throw calendarError('calendar_invalid');
    }
    return `metabloom:calendar:v1:${db.config.scope}:${identity.accountKey}`;
  };

  const command = async (args, options) => {
    try { return await resolveDb().command(args, options); }
    catch { throw calendarError(); }
  };

  const readState = async (identity, options) => {
    const result = await command(['EVAL', READ_SCRIPT, '1', keyFor(identity)], options);
    return result === null ? emptyState() : parseRecord(result);
  };

  const commitState = async (identity, expectedVersion, nextState, options) => {
    const key = keyFor(identity);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) {
      throw calendarError('calendar_invalid');
    }
    const text = JSON.stringify(nextState);
    if (Buffer.byteLength(text, 'utf8') > MAX_CALENDAR_STORE_BYTES) {
      throw calendarError('calendar_limit');
    }
    parseRecord(text);
    const result = await command(['EVAL', WRITE_SCRIPT, '1', key, String(expectedVersion), text], options);
    if (Array.isArray(result) && result.length === 1 && result[0] === 'conflict') {
      throw calendarError('calendar_conflict');
    }
    if (!Array.isArray(result) || result.length !== 2 || result[0] !== 'ok' || result[1] !== text) {
      throw calendarError();
    }
    // No automatic retries: a lost response can follow a committed SET.
    return parseRecord(result[1]);
  };

  const findDuplicateOperation = (state, operationId, payloadHash) => {
    if (!operationId) return null;
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(operationId)
      || typeof payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(payloadHash)) {
      throw calendarError('calendar_invalid');
    }
    const prior = state.recentOperations.find(entry => entry.operationId === operationId);
    if (!prior) return null;
    if (prior.payloadHash !== payloadHash) throw calendarError('calendar_operation_conflict');
    return prior;
  };

  const pushRecentOperation = (recentOperations, entry) => {
    if (!entry) return recentOperations;
    return [...recentOperations, entry].slice(-MAX_CALENDAR_RECEIPT_CACHE);
  };

  const pushUndoEntry = (undoHistory, entry) => [...undoHistory, entry].slice(-MAX_CALENDAR_UNDO_HISTORY);

  return {
    readState,

    async listEvents(identity, range = null, options) {
      const state = await readState(identity, options);
      let events = sortEvents(state.events);
      if (range) {
        const parsedRange = parseCalendarRangeQuery(range);
        if (!parsedRange) throw calendarError('calendar_invalid');
        const startMs = Date.parse(parsedRange.start);
        const endMs = Date.parse(parsedRange.end);
        events = events.filter(event => eventOverlapsWindow(event, startMs, endMs)).slice(0, parsedRange.limit);
      }
      return { version: state.version, updatedAt: state.updatedAt, events };
    },

    async getEvent(identity, eventId, options) {
      if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)) {
        throw calendarError('calendar_invalid');
      }
      const state = await readState(identity, options);
      const event = state.events.find(candidate => candidate.id === eventId) || null;
      return { version: state.version, event };
    },

    async createEvent(identity, {
      event: rawEvent,
      source = 'manual',
      expectedVersion = null,
      operationId = null,
      payloadHash = null,
    } = {}, options) {
      const input = parseCalendarEventInput(rawEvent);
      if (!input || !['manual', 'agent', 'mcp'].includes(source)) throw calendarError('calendar_invalid');
      const state = await readState(identity, options);
      const duplicate = findDuplicateOperation(state, operationId, payloadHash);
      if (duplicate) {
        const existing = state.events.find(candidate => candidate.id === duplicate.eventId) || null;
        return {
          status: 'duplicate',
          version: state.version,
          event: existing,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }
      if (expectedVersion !== null && expectedVersion !== state.version) {
        throw calendarError('calendar_conflict');
      }
      if (state.events.length >= MAX_CALENDAR_EVENTS) throw calendarError('calendar_limit');

      const timestamp = now();
      const created = parseCalendarEvent({
        id: idGenerator(),
        ...input,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        source,
      });
      if (!created) throw calendarError('calendar_invalid');
      const undoToken = undoTokenGenerator();
      const nextState = {
        version: state.version + 1,
        updatedAt: timestamp,
        events: sortEvents([...state.events, created]),
        recentOperations: pushRecentOperation(
          state.recentOperations,
          operationId ? { operationId, payloadHash, eventId: created.id, undoToken, at: timestamp } : null,
        ),
        undoHistory: pushUndoEntry(state.undoHistory, {
          undoToken,
          action: 'create',
          eventId: created.id,
          beforeEvent: null,
          afterRevision: created.revision,
          createdAt: timestamp,
        }),
      };
      const saved = await commitState(identity, state.version, nextState, options);
      return {
        status: 'applied',
        version: saved.version,
        event: created,
        eventId: created.id,
        undoToken,
      };
    },

    async updateEvent(identity, {
      eventId,
      patch: rawPatch,
      expectedEventRevision,
      expectedVersion = null,
      source = 'manual',
      operationId = null,
      payloadHash = null,
    } = {}, options) {
      const patch = parseCalendarEventPatch(rawPatch);
      if (!patch || typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1
        || !['manual', 'agent', 'mcp'].includes(source)) {
        throw calendarError('calendar_invalid');
      }
      const state = await readState(identity, options);
      const duplicate = findDuplicateOperation(state, operationId, payloadHash);
      if (duplicate) {
        const existing = state.events.find(candidate => candidate.id === duplicate.eventId) || null;
        return {
          status: 'duplicate',
          version: state.version,
          event: existing,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }
      if (expectedVersion !== null && expectedVersion !== state.version) {
        throw calendarError('calendar_conflict');
      }
      const index = state.events.findIndex(candidate => candidate.id === eventId);
      if (index === -1) throw calendarError('calendar_not_found');
      const existing = state.events[index];
      if (existing.revision !== expectedEventRevision) throw calendarError('calendar_conflict');

      const timestamp = now();
      const merged = parseCalendarEvent({
        ...existing,
        ...patch,
        id: existing.id,
        revision: existing.revision + 1,
        createdAt: existing.createdAt,
        updatedAt: Math.max(timestamp, existing.updatedAt),
        source,
      });
      if (!merged) throw calendarError('calendar_invalid');
      const undoToken = undoTokenGenerator();
      const nextEvents = state.events.map((item, idx) => (idx === index ? merged : item));
      const nextState = {
        version: state.version + 1,
        updatedAt: timestamp,
        events: sortEvents(nextEvents),
        recentOperations: pushRecentOperation(
          state.recentOperations,
          operationId ? { operationId, payloadHash, eventId: merged.id, undoToken, at: timestamp } : null,
        ),
        undoHistory: pushUndoEntry(state.undoHistory, {
          undoToken,
          action: 'update',
          eventId: merged.id,
          beforeEvent: existing,
          afterRevision: merged.revision,
          createdAt: timestamp,
        }),
      };
      const saved = await commitState(identity, state.version, nextState, options);
      return {
        status: 'applied',
        version: saved.version,
        event: merged,
        eventId: merged.id,
        undoToken,
      };
    },

    async deleteEvent(identity, {
      eventId,
      expectedEventRevision,
      expectedVersion = null,
      operationId = null,
      payloadHash = null,
    } = {}, options) {
      if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1) {
        throw calendarError('calendar_invalid');
      }
      const state = await readState(identity, options);
      const duplicate = findDuplicateOperation(state, operationId, payloadHash);
      if (duplicate) {
        return {
          status: 'duplicate',
          version: state.version,
          event: null,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }
      if (expectedVersion !== null && expectedVersion !== state.version) {
        throw calendarError('calendar_conflict');
      }
      const index = state.events.findIndex(candidate => candidate.id === eventId);
      if (index === -1) throw calendarError('calendar_not_found');
      const existing = state.events[index];
      if (existing.revision !== expectedEventRevision) throw calendarError('calendar_conflict');

      const timestamp = now();
      const undoToken = undoTokenGenerator();
      const nextEvents = state.events.filter((_, idx) => idx !== index);
      const nextState = {
        version: state.version + 1,
        updatedAt: timestamp,
        events: sortEvents(nextEvents),
        recentOperations: pushRecentOperation(
          state.recentOperations,
          operationId ? { operationId, payloadHash, eventId: existing.id, undoToken, at: timestamp } : null,
        ),
        undoHistory: pushUndoEntry(state.undoHistory, {
          undoToken,
          action: 'delete',
          eventId: existing.id,
          beforeEvent: existing,
          afterRevision: null,
          createdAt: timestamp,
        }),
      };
      const saved = await commitState(identity, state.version, nextState, options);
      return {
        status: 'applied',
        version: saved.version,
        event: null,
        eventId: existing.id,
        undoToken,
      };
    },

    async undoOperation(identity, { undoToken, expectedVersion = null } = {}, options) {
      if (typeof undoToken !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(undoToken)) {
        throw calendarError('calendar_invalid');
      }
      const state = await readState(identity, options);
      if (expectedVersion !== null && expectedVersion !== state.version) {
        throw calendarError('calendar_conflict');
      }
      const entryIndex = state.undoHistory.findIndex(entry => entry.undoToken === undoToken);
      if (entryIndex === -1) throw calendarError('calendar_undo_unavailable');
      const entry = state.undoHistory[entryIndex];
      const existingIndex = state.events.findIndex(candidate => candidate.id === entry.eventId);
      const timestamp = now();
      let nextEvents;
      let restoredEvent = null;

      if (entry.action === 'create') {
        if (existingIndex === -1 || state.events[existingIndex].revision !== entry.afterRevision) {
          throw calendarError('calendar_conflict');
        }
        nextEvents = state.events.filter((_, idx) => idx !== existingIndex);
      } else if (entry.action === 'update') {
        if (existingIndex === -1 || state.events[existingIndex].revision !== entry.afterRevision || !entry.beforeEvent) {
          throw calendarError('calendar_conflict');
        }
        restoredEvent = parseCalendarEvent({
          ...entry.beforeEvent,
          revision: state.events[existingIndex].revision + 1,
          updatedAt: Math.max(timestamp, state.events[existingIndex].updatedAt),
        });
        if (!restoredEvent) throw calendarError();
        nextEvents = state.events.map((item, idx) => (idx === existingIndex ? restoredEvent : item));
      } else if (entry.action === 'delete') {
        if (existingIndex !== -1 || !entry.beforeEvent) throw calendarError('calendar_conflict');
        if (state.events.length >= MAX_CALENDAR_EVENTS) throw calendarError('calendar_limit');
        restoredEvent = parseCalendarEvent({
          ...entry.beforeEvent,
          revision: entry.beforeEvent.revision + 1,
          updatedAt: Math.max(timestamp, entry.beforeEvent.updatedAt),
        });
        if (!restoredEvent) throw calendarError();
        nextEvents = [...state.events, restoredEvent];
      } else {
        throw calendarError('calendar_undo_unavailable');
      }

      const nextState = {
        version: state.version + 1,
        updatedAt: timestamp,
        events: sortEvents(nextEvents),
        recentOperations: state.recentOperations,
        undoHistory: state.undoHistory.filter((_, idx) => idx !== entryIndex),
      };
      const saved = await commitState(identity, state.version, nextState, options);
      return {
        status: 'applied',
        version: saved.version,
        event: restoredEvent,
        eventId: entry.eventId,
        undoneAction: entry.action,
      };
    },
  };
}

module.exports = {
  createMetabloomCalendarStore,
  calendarError,
};
