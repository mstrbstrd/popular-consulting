const {
  sanitizeUntrustedCalendarText,
  isValidTimeZone,
  isIsoDate,
  isIsoDateTime,
  parseCalendarEventInput,
  parseCalendarEventPatch,
  parseCalendarEvent,
  parseCalendarRangeQuery,
  requiresCalendarConfirmation,
  parseCalendarProposal,
  parseCalendarReceipt,
  canonicalCalendarPayload,
  findCalendarFreeSlots,
  exportCalendarEventsToIcs,
} = require('./metabloomCalendarProtocol');

const HASH = 'a'.repeat(64);

const sampleEvent = (overrides = {}) => ({
  id: 'evt_1234567890ab',
  title: 'Architecture review',
  start: '2026-11-24T17:00:00.000Z',
  end: '2026-11-24T18:00:00.000Z',
  allDay: false,
  timeZone: 'America/Vancouver',
  location: 'Kelowna Office',
  description: 'Review calendar invariants',
  attendees: [],
  color: 'cobalt',
  revision: 1,
  createdAt: 1795450000000,
  updatedAt: 1795450000000,
  source: 'manual',
  ...overrides,
});

describe('metabloomCalendarProtocol', () => {
  test('validates ISO dates, datetimes, and IANA timezones strictly', () => {
    expect(isIsoDate('2026-11-24')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-11-24T10:00:00Z')).toBe(false);

    expect(isIsoDateTime('2026-11-24T17:00:00Z')).toBe(true);
    expect(isIsoDateTime('2026-11-24T17:00:00.000-08:00')).toBe(true);
    expect(isIsoDateTime('2026-11-24T25:00:00Z')).toBe(false);
    expect(isIsoDateTime('2026-11-24')).toBe(false);

    expect(isValidTimeZone('America/Vancouver')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('UTC\nInjected')).toBe(false);
  });

  test('strips disallowed control characters from untrusted calendar text', () => {
    const raw = '  Meet\u0000ing\u0007\r\nNotes\u007f here  ';
    expect(sanitizeUntrustedCalendarText(raw, 50)).toBe('Meeting\nNotes here');
    expect(sanitizeUntrustedCalendarText('abcdef', 3)).toBe('abc');
  });

  test('validates timed and all-day event inputs and rejects inverted intervals', () => {
    const timed = parseCalendarEventInput({
      title: '  Deep work  ',
      start: '2026-11-24T16:00:00Z',
      end: '2026-11-24T17:30:00Z',
      timeZone: 'America/Vancouver',
    });
    expect(timed).toEqual({
      title: 'Deep work',
      start: '2026-11-24T16:00:00Z',
      end: '2026-11-24T17:30:00Z',
      allDay: false,
      timeZone: 'America/Vancouver',
      location: '',
      description: '',
      attendees: [],
      color: 'default',
    });

    const allDay = parseCalendarEventInput({
      title: 'Offsite',
      start: '2026-11-25',
      end: '2026-11-26',
      allDay: true,
    });
    expect(allDay.allDay).toBe(true);

    expect(parseCalendarEventInput({
      title: 'Broken',
      start: '2026-11-24T18:00:00Z',
      end: '2026-11-24T17:00:00Z',
    })).toBeNull();

    expect(parseCalendarEventInput({
      title: 'Unknown field',
      start: '2026-11-24T16:00:00Z',
      end: '2026-11-24T17:00:00Z',
      extra: true,
    })).toBeNull();
  });

  test('parses patches, full events, and bounded range queries', () => {
    expect(parseCalendarEventPatch({ title: 'Updated title', color: 'emerald' })).toEqual({
      title: 'Updated title',
      color: 'emerald',
    });
    expect(parseCalendarEventPatch({})).toBeNull();
    expect(parseCalendarEvent(sampleEvent())).toEqual(sampleEvent());
    expect(parseCalendarEvent(sampleEvent({ updatedAt: 1795440000000 }))).toBeNull();

    const range = parseCalendarRangeQuery({
      start: '2026-11-01T00:00:00Z',
      end: '2026-11-30T23:59:59Z',
      timeZone: 'America/Vancouver',
      limit: 50,
    });
    expect(range.limit).toBe(50);

    // Rejects windows exceeding 90 days.
    expect(parseCalendarRangeQuery({
      start: '2026-01-01T00:00:00Z',
      end: '2026-06-01T00:00:00Z',
    })).toBeNull();
  });

  test('enforces confirmation policy for deletes and external attendees', () => {
    expect(requiresCalendarConfirmation('create', { attendees: [] })).toBe(false);
    expect(requiresCalendarConfirmation('create', { attendees: ['alex@example.com'] })).toBe(true);
    expect(requiresCalendarConfirmation('update', { title: 'Rename' }, sampleEvent())).toBe(false);
    expect(requiresCalendarConfirmation('update', { title: 'Rename' }, sampleEvent({ attendees: ['alex@example.com'] }))).toBe(true);
    expect(requiresCalendarConfirmation('delete', null, sampleEvent())).toBe(true);

    // Proposals for delete or external attendees must set requiresConfirmation: true.
    const baseProposal = {
      type: 'calendar_workspace',
      version: 1,
      command: 'delete',
      requestId: 'req-123',
      operationId: 'op-123',
      conversationId: 'thr-12345678',
      expectedVersion: 2,
      requiresConfirmation: false,
      eventId: 'evt_1234567890ab',
      expectedEventRevision: 1,
      event: null,
      patch: null,
      focus: null,
      sourceText: 'delete the architecture review',
      payloadHash: HASH,
    };
    expect(parseCalendarProposal(baseProposal, 'req-123')).toBeNull();
    expect(parseCalendarProposal({ ...baseProposal, requiresConfirmation: true }, 'req-123')).not.toBeNull();

    const canonicalA = canonicalCalendarPayload({ ...baseProposal, requiresConfirmation: true });
    const canonicalB = canonicalCalendarPayload({
      payloadHash: 'b'.repeat(64),
      sourceText: 'delete the architecture review',
      type: 'calendar_workspace',
      version: 1,
      command: 'delete',
      requestId: 'req-123',
      operationId: 'op-123',
      conversationId: 'thr-12345678',
      expectedVersion: 2,
      requiresConfirmation: true,
      eventId: 'evt_1234567890ab',
      expectedEventRevision: 1,
      event: null,
      patch: null,
      focus: null,
    });
    expect(canonicalA).toBe(canonicalB);

    expect(parseCalendarReceipt({
      version: 1,
      requestId: 'req-123',
      operationId: 'op-123',
      status: 'pending_confirmation',
      calendarVersion: 2,
      eventId: 'evt_1234567890ab',
      eventRevision: 1,
      undoToken: null,
      requiresConfirmation: true,
      message: 'Confirm deleting Architecture review.',
      event: null,
    })).not.toBeNull();
  });

  test('computes deterministic free slots and exports valid ICS', () => {
    const events = [
      sampleEvent({ id: 'evt_111111111111', start: '2026-11-24T17:00:00.000Z', end: '2026-11-24T18:00:00.000Z' }),
      sampleEvent({ id: 'evt_222222222222', start: '2026-11-24T17:30:00.000Z', end: '2026-11-24T19:00:00.000Z' }),
      sampleEvent({ id: 'evt_333333333333', start: '2026-11-24T19:15:00.000Z', end: '2026-11-24T20:00:00.000Z' }),
    ];
    const slots = findCalendarFreeSlots(events, {
      start: '2026-11-24T16:00:00.000Z',
      end: '2026-11-24T21:00:00.000Z',
      durationMinutes: 30,
    });
    // 16:00-17:00 (60m) and 20:00-21:00 (60m); 19:00-19:15 (15m) is filtered out.
    expect(slots).toEqual([
      { start: '2026-11-24T16:00:00.000Z', end: '2026-11-24T17:00:00.000Z', durationMinutes: 60 },
      { start: '2026-11-24T20:00:00.000Z', end: '2026-11-24T21:00:00.000Z', durationMinutes: 60 },
    ]);

    const ics = exportCalendarEventsToIcs([
      sampleEvent({ title: 'Sync, Q4; Plan', description: 'Line 1\nLine 2' }),
    ], { nowMs: Date.parse('2026-11-23T12:00:00Z') });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('SUMMARY:Sync\\, Q4\\; Plan\r\n');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });
});
