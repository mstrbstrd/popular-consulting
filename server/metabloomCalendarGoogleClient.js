const { createHash, randomBytes } = require('node:crypto');
const {
  MAX_CALENDAR_READ_EVENTS,
  MAX_CALENDAR_UNDO_HISTORY,
  MAX_CALENDAR_RECEIPT_CACHE,
  sanitizeUntrustedCalendarText,
  isValidTimeZone,
  isIsoDate,
  isIsoDateTime,
  eventIntervalMs,
  parseCalendarEvent,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarRangeQuery,
} = require('../src/components/metabloomCalendarProtocol');
const {
  GOOGLE_HTTP_TIMEOUT_MS,
  MAX_GOOGLE_RESPONSE_BYTES,
  isGoogleCalendarConfigured,
  readGoogleCalendarConfig,
  createGoogleTokenStore,
  refreshGoogleAccessToken,
  readBoundedResponseText,
} = require('./metabloomCalendarGoogleAuth');

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';
const GOOGLE_LIST_FIELDS = 'timeZone,items(id,etag,status,summary,description,location,start,end,attendees(email,displayName),colorId,created,updated)';
const MAX_GOOGLE_CALENDAR_API_BYTES = 2 * 1024 * 1024;
const MAX_GOOGLE_ERROR_BODY_BYTES = 4096;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_LOOKAHEAD_DAYS = 60;

const COLOR_TO_GOOGLE_COLOR_ID = Object.freeze({
  cobalt: '9',
  emerald: '10',
  amber: '5',
  rose: '11',
  violet: '3',
});

const GOOGLE_COLOR_ID_TO_COLOR = Object.freeze({
  '1': 'cobalt',
  '2': 'emerald',
  '3': 'violet',
  '4': 'rose',
  '5': 'amber',
  '6': 'amber',
  '7': 'cobalt',
  '8': 'default',
  '9': 'cobalt',
  '10': 'emerald',
  '11': 'rose',
});

function googleClientError(code = 'calendar_google_unavailable') {
  return Object.assign(new Error(code), { code });
}

function isSafeEventId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{5,160}$/.test(value);
}

function isSafeOperationId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function defaultUndoToken() {
  return `undo_${randomBytes(12).toString('hex')}`;
}

function etagToRevision(etag) {
  if (typeof etag !== 'string' || !etag.trim()) return 1;
  const digest = createHash('sha256').update(etag.trim(), 'utf8').digest();
  // 48-bit unsigned big-endian integer: strictly within safe positive JS integers.
  const value = digest.readUIntBE(0, 6);
  return value === 0 ? 1 : value;
}

function shiftIsoDate(isoDate, deltaDays) {
  if (!isIsoDate(isoDate)) return null;
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`) + deltaDays * MS_PER_DAY;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseTimestampMs(raw, fallback) {
  if (typeof raw === 'string' && raw) {
    const ms = Date.parse(raw);
    if (Number.isSafeInteger(ms) && ms >= 1) return ms;
  }
  return fallback;
}

function normalizeGoogleEvent(raw, { defaultTimeZone = 'UTC', nowMs = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.status === 'cancelled') return null;
  if (!isSafeEventId(raw.id)) return null;

  const rawStart = raw.start;
  const rawEnd = raw.end;
  if (!rawStart || typeof rawStart !== 'object' || !rawEnd || typeof rawEnd !== 'object') return null;

  let allDay = false;
  let start;
  let end;
  let timeZone = isValidTimeZone(defaultTimeZone) ? defaultTimeZone : 'UTC';

  if (typeof rawStart.date === 'string' && typeof rawEnd.date === 'string') {
    allDay = true;
    if (!isIsoDate(rawStart.date) || !isIsoDate(rawEnd.date)) return null;
    start = rawStart.date;
    // Google Calendar uses exclusive end.date for all-day events; Metabloom uses inclusive end date.
    const inclusiveEnd = shiftIsoDate(rawEnd.date, -1);
    end = inclusiveEnd && inclusiveEnd >= start ? inclusiveEnd : start;
  } else if (typeof rawStart.dateTime === 'string' && typeof rawEnd.dateTime === 'string') {
    allDay = false;
    if (!isIsoDateTime(rawStart.dateTime) || !isIsoDateTime(rawEnd.dateTime)) return null;
    start = rawStart.dateTime;
    end = rawEnd.dateTime;
    if (isValidTimeZone(rawStart.timeZone)) {
      timeZone = rawStart.timeZone;
    } else if (isValidTimeZone(rawEnd.timeZone)) {
      timeZone = rawEnd.timeZone;
    }
  } else {
    return null;
  }

  const title = sanitizeUntrustedCalendarText(raw.summary || '', 200) || '(Untitled)';
  const location = sanitizeUntrustedCalendarText(raw.location || '', 300);
  const description = sanitizeUntrustedCalendarText(raw.description || '', 2000);

  const attendees = [];
  if (Array.isArray(raw.attendees)) {
    const seen = new Set();
    for (const item of raw.attendees) {
      const candidate = typeof item === 'string'
        ? item
        : (item && typeof item === 'object' ? (item.email || item.displayName || '') : '');
      const clean = sanitizeUntrustedCalendarText(candidate, 160);
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      attendees.push(clean);
      if (attendees.length >= 25) break;
    }
  }

  const color = typeof raw.colorId === 'string' && Object.hasOwn(GOOGLE_COLOR_ID_TO_COLOR, raw.colorId)
    ? GOOGLE_COLOR_ID_TO_COLOR[raw.colorId]
    : 'default';

  const createdAt = parseTimestampMs(raw.created, nowMs);
  const updatedAt = Math.max(createdAt, parseTimestampMs(raw.updated, createdAt));

  return parseCalendarEvent({
    id: raw.id,
    title,
    start,
    end,
    allDay,
    timeZone,
    location,
    description,
    attendees,
    color,
    revision: etagToRevision(raw.etag),
    createdAt,
    updatedAt,
    source: 'google',
  });
}

function buildGoogleEventBody(event, { modeSwitched = false, includeAttendees = true } = {}) {
  const body = {
    summary: event.title,
    location: event.location || '',
    description: event.description || '',
  };

  if (event.allDay) {
    const endExclusive = shiftIsoDate(event.end, 1);
    if (!endExclusive) throw googleClientError('calendar_invalid');
    body.start = modeSwitched ? { date: event.start, dateTime: null } : { date: event.start };
    body.end = modeSwitched ? { date: endExclusive, dateTime: null } : { date: endExclusive };
  } else {
    body.start = modeSwitched
      ? { dateTime: event.start, timeZone: event.timeZone, date: null }
      : { dateTime: event.start, timeZone: event.timeZone };
    body.end = modeSwitched
      ? { dateTime: event.end, timeZone: event.timeZone, date: null }
      : { dateTime: event.end, timeZone: event.timeZone };
  }

  if (includeAttendees && Array.isArray(event.attendees) && event.attendees.length > 0) {
    body.attendees = event.attendees.map(email => ({ email }));
  } else if (includeAttendees && modeSwitched) {
    body.attendees = [];
  }

  if (event.color && Object.hasOwn(COLOR_TO_GOOGLE_COLOR_ID, event.color)) {
    body.colorId = COLOR_TO_GOOGLE_COLOR_ID[event.color];
  } else if (event.color === 'default') {
    body.colorId = null;
  }

  return body;
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

function composeSignal(signal, timeoutMs = GOOGLE_HTTP_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function createMetabloomCalendarGoogleClient({
  env = process.env,
  database = undefined,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  tokenStore = undefined,
  undoTokenGenerator = defaultUndoToken,
} = {}) {
  const resolvedTokenStore = tokenStore || createGoogleTokenStore(database, { env, now });

  function getConfigOrNull() {
    try {
      return readGoogleCalendarConfig(env, { requireOrigin: false });
    } catch {
      return null;
    }
  }

  function findDuplicateOperation(record, operationId, payloadHash) {
    if (!operationId) return null;
    if (!isSafeOperationId(operationId) || !isSha256Hex(payloadHash)) {
      throw googleClientError('calendar_invalid');
    }
    const prior = (record.recentOperations || []).find(entry => entry.operationId === operationId);
    if (!prior) return null;
    if (prior.payloadHash !== payloadHash) {
      throw googleClientError('calendar_operation_conflict');
    }
    return prior;
  }

  function appendUndoHistory(undoHistory, entry) {
    return [...(undoHistory || []), entry].slice(-MAX_CALENDAR_UNDO_HISTORY);
  }

  function appendRecentOperations(recentOperations, entry) {
    if (!entry) return recentOperations || [];
    return [...(recentOperations || []), entry].slice(-MAX_CALENDAR_RECEIPT_CACHE);
  }

  async function ensureValidTokenRecord(identity, options = {}, { forceRefresh = false } = {}) {
    const config = getConfigOrNull();
    if (!config) throw googleClientError('calendar_google_not_connected');

    let record;
    try {
      record = await resolvedTokenStore.read(identity, options);
    } catch (error) {
      if (error?.code === 'calendar_google_token_corrupt') {
        throw googleClientError('calendar_google_not_connected');
      }
      throw error;
    }
    if (!record) throw googleClientError('calendar_google_not_connected');

    const currentNow = now();
    const needsRefresh = forceRefresh
      || !record.accessToken
      || !Number.isSafeInteger(record.expiresAt)
      || record.expiresAt <= currentNow + ACCESS_TOKEN_REFRESH_SKEW_MS;

    if (!needsRefresh) {
      return { record, config };
    }
    if (!record.refreshToken) {
      throw googleClientError('calendar_google_not_connected');
    }

    const refreshed = await refreshGoogleAccessToken({
      refreshToken: record.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      fetchImpl,
      signal: options.signal,
    });

    const refreshedNow = now();
    const nextRecord = await resolvedTokenStore.write(identity, {
      ...record,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || record.refreshToken,
      expiresAt: refreshedNow + refreshed.expiresIn * 1000,
      scope: refreshed.scope || record.scope,
      updatedAt: Math.max(refreshedNow, record.updatedAt),
    }, options);

    return { record: nextRecord, config };
  }

  async function googleApiRequest(identity, {
    method = 'GET',
    pathSuffix = '',
    query = null,
    headers = {},
    body = undefined,
    allowEmptyResponse = false,
  }, options = {}) {
    options.signal?.throwIfAborted();
    if (typeof fetchImpl !== 'function') throw googleClientError('calendar_google_unavailable');

    const runWithRecord = async ({ record, config }) => {
      const calendarId = record.calendarId || config.calendarId || 'primary';
      const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/${encodeURIComponent(calendarId)}${pathSuffix}`);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const requestHeaders = {
        Authorization: `Bearer ${record.accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      };

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method,
          redirect: 'error',
          cache: 'no-store',
          signal: composeSignal(options.signal),
          headers: requestHeaders,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        options.signal?.throwIfAborted();
        throw googleClientError(error?.name === 'TimeoutError' ? 'calendar_google_timeout' : 'calendar_google_unavailable');
      }
      return { response, record, config };
    };

    let state = await ensureValidTokenRecord(identity, options);
    let { response } = await runWithRecord(state);

    if (response.status === 401 && state.record.refreshToken) {
      await response.body?.cancel?.().catch(() => {});
      state = await ensureValidTokenRecord(identity, options, { forceRefresh: true });
      ({ response } = await runWithRecord(state));
    }

    if (response.status === 401) {
      await response.body?.cancel?.().catch(() => {});
      throw googleClientError('calendar_google_not_connected');
    }
    if (response.status === 412) {
      await response.body?.cancel?.().catch(() => {});
      throw googleClientError('calendar_conflict');
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel?.().catch(() => {});
      throw googleClientError('calendar_not_found');
    }
    if (response.status === 400 || response.status === 422) {
      await response.body?.cancel?.().catch(() => {});
      throw googleClientError('calendar_invalid');
    }
    if (!response.ok) {
      let reason = null;
      try {
        const errText = await readBoundedResponseText(response, MAX_GOOGLE_ERROR_BODY_BYTES);
        const errJson = errText ? JSON.parse(errText) : null;
        const firstReason = errJson?.error?.errors?.[0]?.reason
          || errJson?.error?.details?.find(detail => typeof detail?.reason === 'string')?.reason
          || errJson?.error?.status
          || null;
        if (typeof firstReason === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(firstReason)) {
          reason = firstReason;
        }
      } catch { /* Ignore unreadable or oversized error payload. */ }
      console.info('metabloom_calendar_google_http', JSON.stringify({ status: response.status, reason }));
      if (response.status === 403 && ['accessNotConfigured', 'SERVICE_DISABLED'].includes(reason)) {
        throw googleClientError('calendar_google_api_disabled');
      }
      if (response.status === 403 && ['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'forbidden'].includes(reason)) {
        throw googleClientError('calendar_google_permission_denied');
      }
      if (response.status === 429 || ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason)) {
        throw googleClientError('calendar_google_rate_limited');
      }
      throw googleClientError('calendar_google_unavailable');
    }

    if (response.status === 204 || allowEmptyResponse) {
      await response.body?.cancel?.().catch(() => {});
      return { data: null, record: state.record, config: state.config };
    }

    const text = await readBoundedResponseText(response, Math.max(MAX_GOOGLE_RESPONSE_BYTES, MAX_GOOGLE_CALENDAR_API_BYTES));
    if (!text) {
      return { data: null, record: state.record, config: state.config };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw googleClientError('calendar_google_invalid_response');
    }
    return { data, record: state.record, config: state.config };
  }

  async function fetchRawEvent(identity, eventId, options) {
    const { data, record } = await googleApiRequest(identity, {
      method: 'GET',
      pathSuffix: `/events/${encodeURIComponent(eventId)}`,
    }, options);
    if (!data || typeof data !== 'object' || data.status === 'cancelled') {
      throw googleClientError('calendar_not_found');
    }
    return { rawEvent: data, record };
  }

  return {
    kind: 'google',

    async getConnectionStatus(identity, options = {}) {
      const config = getConfigOrNull();
      if (!config) {
        return {
          configured: false,
          connected: false,
          email: null,
          calendarId: 'primary',
        };
      }
      if (!identity?.accountKey) {
        return {
          configured: true,
          connected: false,
          email: null,
          calendarId: config.calendarId,
        };
      }
      try {
        const record = await resolvedTokenStore.read(identity, options);
        if (!record) {
          return {
            configured: true,
            connected: false,
            email: null,
            calendarId: config.calendarId,
          };
        }
        return {
          configured: true,
          connected: true,
          email: record.email || null,
          calendarId: record.calendarId || config.calendarId,
        };
      } catch (error) {
        if (error?.code === 'calendar_google_token_corrupt') {
          return {
            configured: true,
            connected: false,
            email: null,
            calendarId: config.calendarId,
          };
        }
        throw error;
      }
    },

    async listEvents(identity, range = null, options = {}) {
      const parsedRange = range ? parseCalendarRangeQuery(range) : null;
      if (range && !parsedRange) throw googleClientError('calendar_invalid');

      const nowMs = now();
      const timeMin = parsedRange
        ? parsedRange.start
        : new Date(nowMs - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY).toISOString();
      const timeMax = parsedRange
        ? parsedRange.end
        : new Date(nowMs + DEFAULT_LOOKAHEAD_DAYS * MS_PER_DAY).toISOString();
      const maxResults = parsedRange
        ? Math.min(parsedRange.limit, MAX_CALENDAR_READ_EVENTS)
        : MAX_CALENDAR_READ_EVENTS;

      const { data, record } = await googleApiRequest(identity, {
        method: 'GET',
        pathSuffix: '/events',
        query: {
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin,
          timeMax,
          maxResults,
          fields: GOOGLE_LIST_FIELDS,
          ...(parsedRange?.timeZone ? { timeZone: parsedRange.timeZone } : {}),
        },
      }, options);

      const defaultTimeZone = isValidTimeZone(data?.timeZone)
        ? data.timeZone
        : (parsedRange?.timeZone || 'UTC');
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const events = [];
      for (const item of rawItems) {
        const normalized = normalizeGoogleEvent(item, { defaultTimeZone, nowMs });
        if (normalized) events.push(normalized);
        if (events.length >= maxResults) break;
      }

      return {
        version: Number.isSafeInteger(record.updatedAt) && record.updatedAt > 0 ? record.updatedAt : nowMs,
        updatedAt: nowMs,
        events: sortEvents(events),
      };
    },

    async createEvent(identity, {
      event: rawEvent,
      operationId = null,
      payloadHash = null,
      confirmed,
    } = {}, options = {}) {
      const event = parseCalendarEventInput(rawEvent);
      if (!event) throw googleClientError('calendar_invalid');

      const { record } = await ensureValidTokenRecord(identity, options);
      const duplicate = findDuplicateOperation(record, operationId, payloadHash);
      if (duplicate) {
        let existing = null;
        if (duplicate.eventId) {
          try {
            const fetched = await fetchRawEvent(identity, duplicate.eventId, options);
            existing = normalizeGoogleEvent(fetched.rawEvent, { defaultTimeZone: event.timeZone, nowMs: now() });
          } catch {
            existing = null;
          }
        }
        return {
          status: 'duplicate',
          version: record.updatedAt,
          event: existing,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }

      const hasAttendees = event.attendees.length > 0;
      const sendUpdates = hasAttendees && confirmed !== false ? 'all' : 'none';
      const requestBody = buildGoogleEventBody(event, {
        modeSwitched: false,
        includeAttendees: hasAttendees,
      });

      const { data: rawCreated, record: latestRecord } = await googleApiRequest(identity, {
        method: 'POST',
        pathSuffix: '/events',
        query: { sendUpdates },
        body: requestBody,
      }, options);

      const timestamp = now();
      const created = normalizeGoogleEvent(rawCreated, { defaultTimeZone: event.timeZone, nowMs: timestamp });
      if (!created) throw googleClientError('calendar_google_invalid_response');

      const undoToken = undoTokenGenerator();
      const updatedRecord = await resolvedTokenStore.write(identity, {
        ...latestRecord,
        updatedAt: Math.max(timestamp, latestRecord.updatedAt),
        undoHistory: appendUndoHistory(latestRecord.undoHistory, {
          undoToken,
          action: 'create',
          eventId: created.id,
          beforeEvent: null,
          afterRevision: created.revision,
          afterEtag: typeof rawCreated?.etag === 'string' ? rawCreated.etag : null,
          createdAt: timestamp,
        }),
        recentOperations: appendRecentOperations(
          latestRecord.recentOperations,
          operationId ? { operationId, payloadHash, eventId: created.id, undoToken, at: timestamp } : null,
        ),
      }, options);

      return {
        status: 'applied',
        version: updatedRecord.updatedAt,
        event: created,
        eventId: created.id,
        undoToken,
      };
    },

    async updateEvent(identity, {
      eventId,
      patch: rawPatch,
      expectedEventRevision,
      operationId = null,
      payloadHash = null,
      confirmed,
    } = {}, options = {}) {
      const patch = parseCalendarEventPatch(rawPatch);
      if (!patch || !isSafeEventId(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1) {
        throw googleClientError('calendar_invalid');
      }

      const { record } = await ensureValidTokenRecord(identity, options);
      const duplicate = findDuplicateOperation(record, operationId, payloadHash);
      if (duplicate) {
        let existing = null;
        if (duplicate.eventId) {
          try {
            const fetched = await fetchRawEvent(identity, duplicate.eventId, options);
            existing = normalizeGoogleEvent(fetched.rawEvent, { nowMs: now() });
          } catch {
            existing = null;
          }
        }
        return {
          status: 'duplicate',
          version: record.updatedAt,
          event: existing,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }

      const { rawEvent: rawCurrent } = await fetchRawEvent(identity, eventId, options);
      const currentEtag = typeof rawCurrent.etag === 'string' && rawCurrent.etag.trim()
        ? rawCurrent.etag.trim()
        : null;
      const currentRevision = etagToRevision(currentEtag);
      if (currentRevision !== expectedEventRevision) {
        throw googleClientError('calendar_conflict');
      }

      const timestamp = now();
      const existing = normalizeGoogleEvent(rawCurrent, {
        defaultTimeZone: patch.timeZone || 'UTC',
        nowMs: timestamp,
      });
      if (!existing) throw googleClientError('calendar_google_invalid_response');

      const merged = parseCalendarEventInput({
        title: Object.hasOwn(patch, 'title') ? patch.title : existing.title,
        start: Object.hasOwn(patch, 'start') ? patch.start : existing.start,
        end: Object.hasOwn(patch, 'end') ? patch.end : existing.end,
        allDay: Object.hasOwn(patch, 'allDay') ? patch.allDay : existing.allDay,
        timeZone: Object.hasOwn(patch, 'timeZone') ? patch.timeZone : existing.timeZone,
        location: Object.hasOwn(patch, 'location') ? patch.location : existing.location,
        description: Object.hasOwn(patch, 'description') ? patch.description : existing.description,
        attendees: Object.hasOwn(patch, 'attendees') ? patch.attendees : existing.attendees,
        color: Object.hasOwn(patch, 'color') ? patch.color : existing.color,
      });
      if (!merged) throw googleClientError('calendar_invalid');

      const hasAttendees = existing.attendees.length > 0 || merged.attendees.length > 0;
      const sendUpdates = hasAttendees && confirmed !== false ? 'all' : 'none';
      const modeSwitched = existing.allDay !== merged.allDay;
      const patchBody = buildGoogleEventBody(merged, {
        modeSwitched,
        includeAttendees: Object.hasOwn(patch, 'attendees') || hasAttendees,
      });
      if (Object.hasOwn(patch, 'attendees') && merged.attendees.length === 0) {
        patchBody.attendees = [];
      }

      const { data: rawUpdated, record: latestRecord } = await googleApiRequest(identity, {
        method: 'PATCH',
        pathSuffix: `/events/${encodeURIComponent(eventId)}`,
        query: { sendUpdates },
        headers: currentEtag ? { 'If-Match': currentEtag } : {},
        body: patchBody,
      }, options);

      const updatedTimestamp = now();
      const updated = normalizeGoogleEvent(rawUpdated, {
        defaultTimeZone: merged.timeZone,
        nowMs: updatedTimestamp,
      });
      if (!updated) throw googleClientError('calendar_google_invalid_response');

      const undoToken = undoTokenGenerator();
      const updatedRecord = await resolvedTokenStore.write(identity, {
        ...latestRecord,
        updatedAt: Math.max(updatedTimestamp, latestRecord.updatedAt),
        undoHistory: appendUndoHistory(latestRecord.undoHistory, {
          undoToken,
          action: 'update',
          eventId: updated.id,
          beforeEvent: existing,
          afterRevision: updated.revision,
          afterEtag: typeof rawUpdated?.etag === 'string' ? rawUpdated.etag : null,
          createdAt: updatedTimestamp,
        }),
        recentOperations: appendRecentOperations(
          latestRecord.recentOperations,
          operationId ? { operationId, payloadHash, eventId: updated.id, undoToken, at: updatedTimestamp } : null,
        ),
      }, options);

      return {
        status: 'applied',
        version: updatedRecord.updatedAt,
        event: updated,
        eventId: updated.id,
        undoToken,
      };
    },

    async deleteEvent(identity, {
      eventId,
      expectedEventRevision,
      operationId = null,
      payloadHash = null,
      confirmed,
    } = {}, options = {}) {
      if (!isSafeEventId(eventId)
        || !Number.isSafeInteger(expectedEventRevision) || expectedEventRevision < 1) {
        throw googleClientError('calendar_invalid');
      }

      const { record } = await ensureValidTokenRecord(identity, options);
      const duplicate = findDuplicateOperation(record, operationId, payloadHash);
      if (duplicate) {
        return {
          status: 'duplicate',
          version: record.updatedAt,
          event: null,
          eventId: duplicate.eventId,
          undoToken: duplicate.undoToken,
        };
      }

      const { rawEvent: rawCurrent } = await fetchRawEvent(identity, eventId, options);
      const currentEtag = typeof rawCurrent.etag === 'string' && rawCurrent.etag.trim()
        ? rawCurrent.etag.trim()
        : null;
      const currentRevision = etagToRevision(currentEtag);
      if (currentRevision !== expectedEventRevision) {
        throw googleClientError('calendar_conflict');
      }

      const timestamp = now();
      const existing = normalizeGoogleEvent(rawCurrent, { nowMs: timestamp });
      if (!existing) throw googleClientError('calendar_google_invalid_response');

      const hasAttendees = existing.attendees.length > 0;
      const sendUpdates = hasAttendees && confirmed !== false ? 'all' : 'none';

      const { record: latestRecord } = await googleApiRequest(identity, {
        method: 'DELETE',
        pathSuffix: `/events/${encodeURIComponent(eventId)}`,
        query: { sendUpdates },
        headers: currentEtag ? { 'If-Match': currentEtag } : {},
        allowEmptyResponse: true,
      }, options);

      const deletedTimestamp = now();
      const undoToken = undoTokenGenerator();
      const updatedRecord = await resolvedTokenStore.write(identity, {
        ...latestRecord,
        updatedAt: Math.max(deletedTimestamp, latestRecord.updatedAt),
        undoHistory: appendUndoHistory(latestRecord.undoHistory, {
          undoToken,
          action: 'delete',
          eventId,
          beforeEvent: existing,
          afterRevision: null,
          afterEtag: null,
          createdAt: deletedTimestamp,
        }),
        recentOperations: appendRecentOperations(
          latestRecord.recentOperations,
          operationId ? { operationId, payloadHash, eventId, undoToken, at: deletedTimestamp } : null,
        ),
      }, options);

      return {
        status: 'applied',
        version: updatedRecord.updatedAt,
        event: null,
        eventId,
        undoToken,
      };
    },

    async undoOperation(identity, { undoToken } = {}, options = {}) {
      if (!isSafeEventId(undoToken)) {
        throw googleClientError('calendar_invalid');
      }

      const { record } = await ensureValidTokenRecord(identity, options);
      const entryIndex = (record.undoHistory || []).findIndex(entry => entry.undoToken === undoToken);
      if (entryIndex === -1) {
        throw googleClientError('calendar_undo_unavailable');
      }
      const entry = record.undoHistory[entryIndex];
      let restoredEvent = null;
      let restoredEventId = entry.eventId;
      let latestRecord = record;

      if (entry.action === 'create') {
        let current;
        try {
          current = await fetchRawEvent(identity, entry.eventId, options);
        } catch (error) {
          if (error?.code === 'calendar_not_found') throw googleClientError('calendar_conflict');
          throw error;
        }
        const currentEtag = typeof current.rawEvent.etag === 'string' ? current.rawEvent.etag.trim() : null;
        if (etagToRevision(currentEtag) !== entry.afterRevision) {
          throw googleClientError('calendar_conflict');
        }
        ({ record: latestRecord } = await googleApiRequest(identity, {
          method: 'DELETE',
          pathSuffix: `/events/${encodeURIComponent(entry.eventId)}`,
          query: { sendUpdates: 'none' },
          headers: currentEtag ? { 'If-Match': currentEtag } : {},
          allowEmptyResponse: true,
        }, options));
      } else if (entry.action === 'update') {
        if (!entry.beforeEvent) throw googleClientError('calendar_conflict');
        let current;
        try {
          current = await fetchRawEvent(identity, entry.eventId, options);
        } catch (error) {
          if (error?.code === 'calendar_not_found') throw googleClientError('calendar_conflict');
          throw error;
        }
        const currentEtag = typeof current.rawEvent.etag === 'string' ? current.rawEvent.etag.trim() : null;
        if (etagToRevision(currentEtag) !== entry.afterRevision) {
          throw googleClientError('calendar_conflict');
        }
        const currentNormalized = normalizeGoogleEvent(current.rawEvent, { nowMs: now() });
        const modeSwitched = Boolean(currentNormalized && currentNormalized.allDay !== entry.beforeEvent.allDay);
        const restoreBody = buildGoogleEventBody(entry.beforeEvent, {
          modeSwitched,
          includeAttendees: true,
        });
        if (entry.beforeEvent.attendees.length === 0) {
          restoreBody.attendees = [];
        }
        const { data: rawRestored, record: nextRecord } = await googleApiRequest(identity, {
          method: 'PATCH',
          pathSuffix: `/events/${encodeURIComponent(entry.eventId)}`,
          query: { sendUpdates: 'none' },
          headers: currentEtag ? { 'If-Match': currentEtag } : {},
          body: restoreBody,
        }, options);
        latestRecord = nextRecord;
        restoredEvent = normalizeGoogleEvent(rawRestored, {
          defaultTimeZone: entry.beforeEvent.timeZone,
          nowMs: now(),
        });
        if (!restoredEvent) throw googleClientError('calendar_google_invalid_response');
        restoredEventId = restoredEvent.id;
      } else if (entry.action === 'delete') {
        if (!entry.beforeEvent) throw googleClientError('calendar_conflict');
        const restoreBody = buildGoogleEventBody(entry.beforeEvent, {
          modeSwitched: false,
          includeAttendees: entry.beforeEvent.attendees.length > 0,
        });
        const { data: rawRestored, record: nextRecord } = await googleApiRequest(identity, {
          method: 'POST',
          pathSuffix: '/events',
          query: { sendUpdates: 'none' },
          body: restoreBody,
        }, options);
        latestRecord = nextRecord;
        restoredEvent = normalizeGoogleEvent(rawRestored, {
          defaultTimeZone: entry.beforeEvent.timeZone,
          nowMs: now(),
        });
        if (!restoredEvent) throw googleClientError('calendar_google_invalid_response');
        restoredEventId = restoredEvent.id;
      } else {
        throw googleClientError('calendar_undo_unavailable');
      }

      const timestamp = now();
      const remainingUndo = (latestRecord.undoHistory || []).filter(item => item.undoToken !== undoToken);
      const savedRecord = await resolvedTokenStore.write(identity, {
        ...latestRecord,
        updatedAt: Math.max(timestamp, latestRecord.updatedAt),
        undoHistory: remainingUndo,
      }, options);

      return {
        status: 'applied',
        version: savedRecord.updatedAt,
        event: restoredEvent,
        eventId: restoredEventId,
        undoneAction: entry.action,
      };
    },
  };
}

module.exports = {
  etagToRevision,
  normalizeGoogleEvent,
  createMetabloomCalendarGoogleClient,
  googleClientError,
};
