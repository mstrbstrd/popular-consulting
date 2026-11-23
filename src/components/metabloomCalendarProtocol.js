const METABLOOM_CALENDAR_VERSION = 1;
const MAX_CALENDAR_EVENTS = 500;
const MAX_CALENDAR_STORE_BYTES = 512 * 1024;
const MAX_CALENDAR_READ_EVENTS = 200;
const MAX_CALENDAR_RANGE_DAYS = 90;
const MAX_CALENDAR_UNDO_HISTORY = 20;
const MAX_CALENDAR_RECEIPT_CACHE = 40;
const MAX_CALENDAR_EVENT_BYTES = 8192;
const MAX_CALENDAR_PROPOSAL_BYTES = 32768;

const CALENDAR_VIEWS = Object.freeze(['month', 'week', 'day', 'agenda']);
const CALENDAR_COLORS = Object.freeze(['default', 'cobalt', 'emerald', 'amber', 'rose', 'violet']);
const CALENDAR_SOURCES = Object.freeze(['manual', 'agent', 'mcp']);
const CALENDAR_COMMANDS = Object.freeze(['open', 'focus', 'create', 'update', 'delete']);
const CALENDAR_RECEIPT_STATUSES = Object.freeze([
  'applied',
  'pending_confirmation',
  'duplicate',
  'conflict',
  'rejected',
  'cancelled',
  'unavailable',
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && (() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value'));
  })());

const exact = (value, fields) => plain(value)
  && Reflect.ownKeys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));

const hasDisallowedControl = value => Array.from(value).some(char => {
  const code = char.codePointAt(0);
  return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
});

const safeText = (value, max, empty = false) => typeof value === 'string'
  && value.length <= max
  && (empty || value.trim().length > 0)
  && !hasDisallowedControl(value);

const safeIdentifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const safeEventId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
const safeRevision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const safePositiveInt = value => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;

const withinBytes = (value, max) => {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= max; }
  catch { return false; }
};

const deepCopy = value => JSON.parse(JSON.stringify(value));

function sanitizeUntrustedCalendarText(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n?/g, '\n');
  let cleaned = '';
  for (const char of normalized) {
    const code = char.codePointAt(0);
    if (code === 127 || (code < 32 && code !== 9 && code !== 10)) continue;
    cleaned += char;
    if (cleaned.length >= maxLength) break;
  }
  return cleaned.trim();
}

function isValidTimeZone(value) {
  if (!safeText(value, 80) || /\s/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isIsoDateTime(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const datePart = value.slice(0, 10);
  if (!isIsoDate(datePart)) return false;
  const hours = Number(value.slice(11, 13));
  const minutes = Number(value.slice(14, 16));
  const seconds = Number(value.slice(17, 19));
  if (hours > 23 || minutes > 59 || seconds > 59) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function eventIntervalMs(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.allDay) {
    if (!isIsoDate(event.start) || !isIsoDate(event.end)) return null;
    const startMs = Date.parse(`${event.start}T00:00:00.000Z`);
    const endMs = Date.parse(`${event.end}T00:00:00.000Z`) + MS_PER_DAY;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
    return { startMs, endMs };
  }
  if (!isIsoDateTime(event.start) || !isIsoDateTime(event.end)) return null;
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
  return { startMs, endMs };
}

function parseAttendees(value) {
  if (!Array.isArray(value) || value.length > 25) return null;
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (!safeText(item, 160)) return null;
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function parseCalendarEventInput(value) {
  if (!plain(value)) return null;
  const allowedKeys = new Set([
    'title',
    'start',
    'end',
    'allDay',
    'timeZone',
    'location',
    'description',
    'attendees',
    'color',
  ]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return null;
  if (!safeText(value.title, 200)) return null;
  const allDay = value.allDay === undefined ? false : value.allDay;
  if (typeof allDay !== 'boolean') return null;
  const timeZone = value.timeZone === undefined ? 'UTC' : value.timeZone;
  if (!isValidTimeZone(timeZone)) return null;
  const location = value.location === undefined ? '' : value.location;
  if (!safeText(location, 300, true)) return null;
  const description = value.description === undefined ? '' : value.description;
  if (!safeText(description, 2000, true)) return null;
  const attendees = value.attendees === undefined ? [] : parseAttendees(value.attendees);
  if (!attendees) return null;
  const color = value.color === undefined ? 'default' : value.color;
  if (!CALENDAR_COLORS.includes(color)) return null;

  const candidate = {
    title: value.title.trim(),
    start: value.start,
    end: value.end,
    allDay,
    timeZone,
    location: location.trim(),
    description: description.trim(),
    attendees,
    color,
  };
  if (!eventIntervalMs(candidate)) return null;
  return withinBytes(candidate, MAX_CALENDAR_EVENT_BYTES) ? candidate : null;
}

function parseCalendarEventPatch(value) {
  if (!plain(value)) return null;
  const allowedKeys = new Set([
    'title',
    'start',
    'end',
    'allDay',
    'timeZone',
    'location',
    'description',
    'attendees',
    'color',
  ]);
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !allowedKeys.has(key))) return null;
  const patch = {};
  if (Object.hasOwn(value, 'title')) {
    if (!safeText(value.title, 200)) return null;
    patch.title = value.title.trim();
  }
  if (Object.hasOwn(value, 'allDay')) {
    if (typeof value.allDay !== 'boolean') return null;
    patch.allDay = value.allDay;
  }
  if (Object.hasOwn(value, 'start')) {
    if (!isIsoDate(value.start) && !isIsoDateTime(value.start)) return null;
    patch.start = value.start;
  }
  if (Object.hasOwn(value, 'end')) {
    if (!isIsoDate(value.end) && !isIsoDateTime(value.end)) return null;
    patch.end = value.end;
  }
  if (Object.hasOwn(value, 'timeZone')) {
    if (!isValidTimeZone(value.timeZone)) return null;
    patch.timeZone = value.timeZone;
  }
  if (Object.hasOwn(value, 'location')) {
    if (!safeText(value.location, 300, true)) return null;
    patch.location = value.location.trim();
  }
  if (Object.hasOwn(value, 'description')) {
    if (!safeText(value.description, 2000, true)) return null;
    patch.description = value.description.trim();
  }
  if (Object.hasOwn(value, 'attendees')) {
    const attendees = parseAttendees(value.attendees);
    if (!attendees) return null;
    patch.attendees = attendees;
  }
  if (Object.hasOwn(value, 'color')) {
    if (!CALENDAR_COLORS.includes(value.color)) return null;
    patch.color = value.color;
  }
  return withinBytes(patch, MAX_CALENDAR_EVENT_BYTES) ? patch : null;
}

function parseCalendarEvent(value) {
  if (!exact(value, [
    'id',
    'title',
    'start',
    'end',
    'allDay',
    'timeZone',
    'location',
    'description',
    'attendees',
    'color',
    'revision',
    'createdAt',
    'updatedAt',
    'source',
  ])) return null;
  if (!safeEventId(value.id) || !safePositiveInt(value.revision)
    || !safePositiveInt(value.createdAt) || !safePositiveInt(value.updatedAt)
    || value.updatedAt < value.createdAt || !CALENDAR_SOURCES.includes(value.source)) return null;
  const input = parseCalendarEventInput({
    title: value.title,
    start: value.start,
    end: value.end,
    allDay: value.allDay,
    timeZone: value.timeZone,
    location: value.location,
    description: value.description,
    attendees: value.attendees,
    color: value.color,
  });
  if (!input) return null;
  const record = {
    id: value.id,
    ...input,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    source: value.source,
  };
  return withinBytes(record, MAX_CALENDAR_EVENT_BYTES) ? record : null;
}

function parseCalendarRangeQuery(value) {
  if (!plain(value)) return null;
  const allowedKeys = new Set(['start', 'end', 'timeZone', 'limit']);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return null;
  if (!isIsoDateTime(value.start) || !isIsoDateTime(value.end)) return null;
  const startMs = Date.parse(value.start);
  const endMs = Date.parse(value.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  if (endMs - startMs > MAX_CALENDAR_RANGE_DAYS * MS_PER_DAY) return null;
  const timeZone = value.timeZone === undefined ? 'UTC' : value.timeZone;
  if (!isValidTimeZone(timeZone)) return null;
  const limit = value.limit === undefined ? MAX_CALENDAR_READ_EVENTS : value.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CALENDAR_READ_EVENTS) return null;
  return { start: value.start, end: value.end, timeZone, limit };
}

function requiresCalendarConfirmation(command, eventOrPatch, existingEvent = null) {
  if (command === 'delete') return true;
  if (command === 'create') {
    return Array.isArray(eventOrPatch?.attendees) && eventOrPatch.attendees.length > 0;
  }
  if (command === 'update') {
    const nextAttendees = Array.isArray(eventOrPatch?.attendees) ? eventOrPatch.attendees : [];
    const prevAttendees = Array.isArray(existingEvent?.attendees) ? existingEvent.attendees : [];
    return nextAttendees.length > 0 || prevAttendees.length > 0;
  }
  return false;
}

function parseCalendarFocus(value) {
  if (value === null) return null;
  if (!exact(value, ['date', 'view', 'eventId'])) return null;
  if (value.date !== null && !isIsoDate(value.date)) return null;
  if (value.view !== null && !CALENDAR_VIEWS.includes(value.view)) return null;
  if (value.eventId !== null && !safeEventId(value.eventId)) return null;
  if (value.date === null && value.view === null && value.eventId === null) return null;
  return deepCopy(value);
}

function parseCalendarProposal(value, expectedRequestId) {
  if (!exact(value, [
    'type',
    'version',
    'command',
    'requestId',
    'operationId',
    'conversationId',
    'expectedVersion',
    'requiresConfirmation',
    'eventId',
    'expectedEventRevision',
    'event',
    'patch',
    'focus',
    'sourceText',
    'payloadHash',
  ])) return null;
  if (value.type !== 'calendar_workspace'
    || value.version !== METABLOOM_CALENDAR_VERSION
    || !CALENDAR_COMMANDS.includes(value.command)
    || !safeIdentifier(value.requestId)
    || (expectedRequestId !== undefined && value.requestId !== expectedRequestId)
    || !safeIdentifier(value.operationId)
    || !safeIdentifier(value.conversationId)
    || (value.expectedVersion !== null && !safeRevision(value.expectedVersion))
    || typeof value.requiresConfirmation !== 'boolean'
    || !safeText(value.sourceText, 1600)
    || typeof value.payloadHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.payloadHash)) return null;

  const focus = parseCalendarFocus(value.focus);
  if (value.focus !== null && !focus) return null;

  if (value.command === 'open' || value.command === 'focus') {
    if (value.requiresConfirmation || value.eventId !== null || value.expectedEventRevision !== null
      || value.event !== null || value.patch !== null) return null;
    if (value.command === 'focus' && !focus) return null;
  } else if (value.command === 'create') {
    const event = parseCalendarEventInput(value.event);
    if (!event || value.eventId !== null || value.expectedEventRevision !== null || value.patch !== null) return null;
    if (requiresCalendarConfirmation('create', event) && !value.requiresConfirmation) return null;
  } else if (value.command === 'update') {
    const patch = parseCalendarEventPatch(value.patch);
    if (!patch || !safeEventId(value.eventId) || !safePositiveInt(value.expectedEventRevision) || value.event !== null) return null;
    if (requiresCalendarConfirmation('update', patch) && !value.requiresConfirmation) return null;
  } else if (value.command === 'delete') {
    if (!value.requiresConfirmation || !safeEventId(value.eventId) || !safePositiveInt(value.expectedEventRevision)
      || value.event !== null || value.patch !== null) return null;
  }

  return withinBytes(value, MAX_CALENDAR_PROPOSAL_BYTES) ? deepCopy(value) : null;
}

function parseCalendarReceipt(value) {
  if (!exact(value, [
    'version',
    'requestId',
    'operationId',
    'status',
    'calendarVersion',
    'eventId',
    'eventRevision',
    'undoToken',
    'requiresConfirmation',
    'message',
    'event',
  ])) return null;
  if (value.version !== METABLOOM_CALENDAR_VERSION
    || !safeIdentifier(value.requestId)
    || !safeIdentifier(value.operationId)
    || !CALENDAR_RECEIPT_STATUSES.includes(value.status)
    || (value.calendarVersion !== null && !safeRevision(value.calendarVersion))
    || (value.eventId !== null && !safeEventId(value.eventId))
    || (value.eventRevision !== null && !safePositiveInt(value.eventRevision))
    || (value.undoToken !== null && !safeIdentifier(value.undoToken))
    || typeof value.requiresConfirmation !== 'boolean'
    || !safeText(value.message, 500)) return null;
  if (value.event !== null && !parseCalendarEvent(value.event)) return null;
  return withinBytes(value, MAX_CALENDAR_PROPOSAL_BYTES) ? deepCopy(value) : null;
}

function canonicalCalendarPayload(proposal) {
  const sorted = value => Array.isArray(value)
    ? value.map(sorted)
    : plain(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
      : value;
  const { payloadHash, ...payload } = proposal;
  return JSON.stringify(sorted(payload));
}

function eventOverlapsWindow(event, windowStartMs, windowEndMs) {
  const interval = eventIntervalMs(event);
  if (!interval) return false;
  return interval.startMs < windowEndMs && interval.endMs > windowStartMs;
}

function findCalendarFreeSlots(events, {
  start,
  end,
  durationMinutes = 30,
  maxSlots = 12,
} = {}) {
  if (!Array.isArray(events) || !isIsoDateTime(start) || !isIsoDateTime(end)) return [];
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 12 * 60) return [];
  if (!Number.isSafeInteger(maxSlots) || maxSlots < 1 || maxSlots > 50) return [];
  const windowStartMs = Date.parse(start);
  const windowEndMs = Date.parse(end);
  const durationMs = durationMinutes * 60 * 1000;
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs - windowStartMs < durationMs) {
    return [];
  }

  const busy = [];
  for (const event of events) {
    const interval = eventIntervalMs(event);
    if (!interval) continue;
    const clampedStart = Math.max(windowStartMs, interval.startMs);
    const clampedEnd = Math.min(windowEndMs, interval.endMs);
    if (clampedStart < clampedEnd) busy.push({ startMs: clampedStart, endMs: clampedEnd });
  }
  busy.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged = [];
  for (const block of busy) {
    const last = merged[merged.length - 1];
    if (last && block.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, block.endMs);
    } else {
      merged.push({ ...block });
    }
  }

  const slots = [];
  let cursor = windowStartMs;
  for (const block of merged) {
    if (block.startMs - cursor >= durationMs) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(block.startMs).toISOString(),
        durationMinutes: Math.floor((block.startMs - cursor) / 60000),
      });
      if (slots.length >= maxSlots) return slots;
    }
    cursor = Math.max(cursor, block.endMs);
  }
  if (windowEndMs - cursor >= durationMs && slots.length < maxSlots) {
    slots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(windowEndMs).toISOString(),
      durationMinutes: Math.floor((windowEndMs - cursor) / 60000),
    });
  }
  return slots;
}

function escapeIcsText(value) {
  return sanitizeUntrustedCalendarText(value, 2000)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatIcsUtc(ms) {
  const date = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T`
    + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function exportCalendarEventsToIcs(events, { calendarName = 'Popular Consulting Calendar', nowMs = Date.now() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Popular Consulting//Metabloom Calendar//EN',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];
  const stamp = formatIcsUtc(nowMs);
  for (const raw of Array.isArray(events) ? events : []) {
    const event = parseCalendarEvent(raw);
    if (!event) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@popcon.dev`);
    lines.push(`DTSTAMP:${stamp}`);
    if (event.allDay) {
      const endExclusiveMs = Date.parse(`${event.end}T00:00:00.000Z`) + MS_PER_DAY;
      const endDate = new Date(endExclusiveMs).toISOString().slice(0, 10).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${event.start.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
    } else {
      lines.push(`DTSTART:${formatIcsUtc(Date.parse(event.start))}`);
      lines.push(`DTEND:${formatIcsUtc(Date.parse(event.end))}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = {
  METABLOOM_CALENDAR_VERSION,
  MAX_CALENDAR_EVENTS,
  MAX_CALENDAR_STORE_BYTES,
  MAX_CALENDAR_READ_EVENTS,
  MAX_CALENDAR_RANGE_DAYS,
  MAX_CALENDAR_UNDO_HISTORY,
  MAX_CALENDAR_RECEIPT_CACHE,
  MAX_CALENDAR_EVENT_BYTES,
  MAX_CALENDAR_PROPOSAL_BYTES,
  CALENDAR_VIEWS,
  CALENDAR_COLORS,
  CALENDAR_SOURCES,
  CALENDAR_COMMANDS,
  CALENDAR_RECEIPT_STATUSES,
  sanitizeUntrustedCalendarText,
  isValidTimeZone,
  isIsoDate,
  isIsoDateTime,
  eventIntervalMs,
  eventOverlapsWindow,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarEvent,
  parseCalendarRangeQuery,
  requiresCalendarConfirmation,
  parseCalendarFocus,
  parseCalendarProposal,
  parseCalendarReceipt,
  canonicalCalendarPayload,
  findCalendarFreeSlots,
  exportCalendarEventsToIcs,
};
