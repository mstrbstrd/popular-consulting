const {
  findCalendarFreeSlots,
  exportCalendarEventsToIcs,
  parseCalendarRangeQuery,
} = require('../src/components/metabloomCalendarProtocol');
const { createMetabloomCalendarStore } = require('./metabloomCalendarStore');
const { createMetabloomCalendarMcpClient } = require('./metabloomCalendarMcpClient');

function isMetabloomCalendarEnabled(env = process.env) {
  return ['1', 'true'].includes(String(env.METABLOOM_CALENDAR_ENABLED || '').trim().toLowerCase());
}

function getMetabloomCalendarProviderKind(env = process.env) {
  const configured = String(env.CALENDAR_PROVIDER || 'redis').trim().toLowerCase();
  if (configured === 'mcp' && env.CALENDAR_MCP_URL) return 'mcp';
  return 'redis';
}

function logCalendarOperation({ requestRef = null, provider, operation, status, durationMs, operationId = null }) {
  // Never log event titles, descriptions, attendee details, or credentials.
  console.info('metabloom_calendar_op', JSON.stringify({
    ...(requestRef ? { requestRef } : {}),
    provider,
    operation,
    status,
    durationMs,
    ...(operationId ? { operationId } : {}),
  }));
}

function createMetabloomCalendarProvider({
  env = process.env,
  database = undefined,
  fetchImpl = undefined,
  now = Date.now,
  logger = logCalendarOperation,
} = {}) {
  const kind = getMetabloomCalendarProviderKind(env);
  const backend = kind === 'mcp'
    ? createMetabloomCalendarMcpClient({
      endpointUrl: env.CALENDAR_MCP_URL,
      authToken: env.CALENDAR_MCP_AUTH_TOKEN || null,
      fetchImpl: fetchImpl || globalThis.fetch,
      now,
    })
    : createMetabloomCalendarStore(database, { now });

  const traced = async (operation, { requestRef = null, operationId = null }, fn) => {
    const startedAt = now();
    try {
      const result = await fn();
      logger({
        requestRef,
        provider: kind,
        operation,
        status: result?.status || 'ok',
        durationMs: Math.max(0, now() - startedAt),
        operationId,
      });
      return result;
    } catch (error) {
      logger({
        requestRef,
        provider: kind,
        operation,
        status: error?.code || 'failed',
        durationMs: Math.max(0, now() - startedAt),
        operationId,
      });
      throw error;
    }
  };

  return {
    kind,

    listEvents(identity, range = null, options = {}) {
      return traced('list_events', options, () => backend.listEvents(identity, range, options));
    },

    async findFreeSlots(identity, query, options = {}) {
      return traced('find_free_slots', options, async () => {
        const range = parseCalendarRangeQuery({
          start: query?.start,
          end: query?.end,
          timeZone: query?.timeZone || 'UTC',
        });
        if (!range) {
          throw Object.assign(new Error('calendar_invalid'), { code: 'calendar_invalid' });
        }
        const { version, events } = await backend.listEvents(identity, range, options);
        const slots = findCalendarFreeSlots(events, {
          start: range.start,
          end: range.end,
          durationMinutes: query?.durationMinutes ?? 30,
          maxSlots: query?.maxSlots ?? 12,
        });
        return { version, slots };
      });
    },

    createEvent(identity, params, options = {}) {
      return traced('create_event', { ...options, operationId: params?.operationId || null }, () =>
        backend.createEvent(identity, params, options));
    },

    updateEvent(identity, params, options = {}) {
      return traced('update_event', { ...options, operationId: params?.operationId || null }, () =>
        backend.updateEvent(identity, params, options));
    },

    deleteEvent(identity, params, options = {}) {
      return traced('delete_event', { ...options, operationId: params?.operationId || null }, () =>
        backend.deleteEvent(identity, params, options));
    },

    undoOperation(identity, params, options = {}) {
      return traced('undo_operation', options, () => backend.undoOperation(identity, params, options));
    },

    async exportIcs(identity, range = null, options = {}) {
      return traced('export_ics', options, async () => {
        const { events } = await backend.listEvents(identity, range, options);
        return exportCalendarEventsToIcs(events, { nowMs: now() });
      });
    },
  };
}

module.exports = {
  isMetabloomCalendarEnabled,
  getMetabloomCalendarProviderKind,
  createMetabloomCalendarProvider,
  logCalendarOperation,
};
