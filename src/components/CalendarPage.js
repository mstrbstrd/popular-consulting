import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import NavMenu from './NavMenu';
import {
  fetchCalendarStatus,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  undoCalendarOperation,
  getCalendarExportUrl,
} from './metabloomCalendarApiClient';
import {
  CALENDAR_COLORS,
  CALENDAR_VIEWS,
  isIsoDate,
  isValidTimeZone,
  sanitizeUntrustedCalendarText,
} from './metabloomCalendarProtocol';
import { metabloomCalendarBridge } from './metabloomCalendarBridge';
import './LiquidGlass.css';
import './CalendarPage.css';

const WEEKDAY_LABELS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const VIEW_LABELS = Object.freeze({
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
});
const COLOR_LABELS = Object.freeze({
  default: 'Slate',
  cobalt: 'Cobalt',
  emerald: 'Emerald',
  amber: 'Amber',
  rose: 'Rose',
  violet: 'Violet',
});

const pad2 = value => String(value).padStart(2, '0');

function resolveDefaultTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatDateInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch { /* Fall back to local date components. */ }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalInputParts(isoDateTime) {
  const parsed = new Date(isoDateTime);
  if (!Number.isFinite(parsed.getTime())) {
    return { date: formatDateInTimeZone(new Date(), resolveDefaultTimeZone()), time: '09:00' };
  }
  return {
    date: `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`,
    time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
  };
}

function addDaysIso(isoDate, deltaDays) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function addMonthsIso(isoDate, deltaMonths) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  const maxDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(Math.min(day, maxDay))}`;
}

function weekdayOfIso(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function startOfWeekIso(isoDate) {
  return addDaysIso(isoDate, -weekdayOfIso(isoDate));
}

function listDateRange(startIso, endIso) {
  const days = [];
  let cursor = startIso;
  while (cursor <= endIso && days.length < 62) {
    days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return days;
}

function computeVisibleWindow(anchorDate, view) {
  if (view === 'month') {
    const [year, month] = anchorDate.split('-').map(Number);
    const firstOfMonth = `${year}-${pad2(month)}-01`;
    const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastOfMonth = `${year}-${pad2(month)}-${pad2(lastDayNum)}`;
    const visibleStart = startOfWeekIso(firstOfMonth);
    const visibleEnd = addDaysIso(startOfWeekIso(lastOfMonth), 6);
    return {
      visibleStart,
      visibleEnd,
      queryStart: `${addDaysIso(visibleStart, -1)}T00:00:00.000Z`,
      queryEnd: `${addDaysIso(visibleEnd, 1)}T23:59:59.999Z`,
      days: listDateRange(visibleStart, visibleEnd),
    };
  }
  if (view === 'week') {
    const visibleStart = startOfWeekIso(anchorDate);
    const visibleEnd = addDaysIso(visibleStart, 6);
    return {
      visibleStart,
      visibleEnd,
      queryStart: `${addDaysIso(visibleStart, -1)}T00:00:00.000Z`,
      queryEnd: `${addDaysIso(visibleEnd, 1)}T23:59:59.999Z`,
      days: listDateRange(visibleStart, visibleEnd),
    };
  }
  if (view === 'day') {
    return {
      visibleStart: anchorDate,
      visibleEnd: anchorDate,
      queryStart: `${addDaysIso(anchorDate, -1)}T00:00:00.000Z`,
      queryEnd: `${addDaysIso(anchorDate, 1)}T23:59:59.999Z`,
      days: [anchorDate],
    };
  }
  const visibleStart = anchorDate;
  const visibleEnd = addDaysIso(anchorDate, 29);
  return {
    visibleStart,
    visibleEnd,
    queryStart: `${addDaysIso(visibleStart, -1)}T00:00:00.000Z`,
    queryEnd: `${addDaysIso(visibleEnd, 1)}T23:59:59.999Z`,
    days: listDateRange(visibleStart, visibleEnd),
  };
}

function eventOverlapsDate(event, isoDate, timeZone) {
  if (!event) return false;
  if (event.allDay) {
    return isoDate >= event.start && isoDate <= event.end;
  }
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const startDay = formatDateInTimeZone(new Date(startMs), timeZone);
  const endDay = formatDateInTimeZone(new Date(Math.max(startMs, endMs - 1)), timeZone);
  return isoDate >= startDay && isoDate <= endDay;
}

function eventSortMs(event) {
  if (event.allDay) return Date.parse(`${event.start}T00:00:00.000Z`) || 0;
  return Date.parse(event.start) || 0;
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const timeDiff = eventSortMs(a) - eventSortMs(b);
    if (timeDiff !== 0) return timeDiff;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  });
}

function formatDayHeading(isoDate, options) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(dt);
  } catch {
    return isoDate;
  }
}

function formatRangeHeading(anchorDate, view, visibleStart, visibleEnd) {
  if (view === 'month') {
    return formatDayHeading(anchorDate, { month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const startLabel = formatDayHeading(visibleStart, { month: 'short', day: 'numeric' });
    const endLabel = formatDayHeading(visibleEnd, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }
  if (view === 'day') {
    return formatDayHeading(anchorDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const startLabel = formatDayHeading(visibleStart, { month: 'short', day: 'numeric' });
  const endLabel = formatDayHeading(visibleEnd, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Agenda · ${startLabel} – ${endLabel}`;
}

function formatEventTime(event, timeZone) {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch {
    return `${event.start} – ${event.end}`;
  }
}

function formatShortStartTime(event, timeZone) {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  if (!Number.isFinite(start.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(start);
  } catch {
    return '';
  }
}

function createInitialForm(mode, event, defaultDate) {
  if (mode === 'edit' && event) {
    if (event.allDay) {
      return {
        title: event.title || '',
        allDay: true,
        startDate: event.start || defaultDate,
        startTime: '09:00',
        endDate: event.end || event.start || defaultDate,
        endTime: '10:00',
        location: event.location || '',
        description: event.description || '',
        attendeesText: Array.isArray(event.attendees) ? event.attendees.join(', ') : '',
        color: CALENDAR_COLORS.includes(event.color) ? event.color : 'default',
      };
    }
    const startParts = formatLocalInputParts(event.start);
    const endParts = formatLocalInputParts(event.end);
    return {
      title: event.title || '',
      allDay: false,
      startDate: startParts.date,
      startTime: startParts.time,
      endDate: endParts.date,
      endTime: endParts.time,
      location: event.location || '',
      description: event.description || '',
      attendeesText: Array.isArray(event.attendees) ? event.attendees.join(', ') : '',
      color: CALENDAR_COLORS.includes(event.color) ? event.color : 'default',
    };
  }
  return {
    title: '',
    allDay: false,
    startDate: defaultDate,
    startTime: '09:00',
    endDate: defaultDate,
    endTime: '10:00',
    location: '',
    description: '',
    attendeesText: '',
    color: 'cobalt',
  };
}

function parseAttendeesInput(raw) {
  return raw
    .split(',')
    .map(item => sanitizeUntrustedCalendarText(item, 160))
    .filter(Boolean);
}

function buildEventPayload(form, timeZone) {
  const title = sanitizeUntrustedCalendarText(form.title, 200);
  if (!title) return { error: 'Please enter an event title.' };

  let start;
  let end;
  if (form.allDay) {
    if (!isIsoDate(form.startDate) || !isIsoDate(form.endDate)) {
      return { error: 'Please choose valid start and end dates.' };
    }
    if (form.endDate < form.startDate) {
      return { error: 'End date cannot be earlier than start date.' };
    }
    start = form.startDate;
    end = form.endDate;
  } else {
    const startDt = new Date(`${form.startDate}T${form.startTime}:00`);
    const endDt = new Date(`${form.endDate}T${form.endTime}:00`);
    if (!Number.isFinite(startDt.getTime()) || !Number.isFinite(endDt.getTime())) {
      return { error: 'Please enter valid start and end dates and times.' };
    }
    if (endDt.getTime() <= startDt.getTime()) {
      return { error: 'End time must be after start time.' };
    }
    start = startDt.toISOString();
    end = endDt.toISOString();
  }

  return {
    payload: {
      title,
      start,
      end,
      allDay: Boolean(form.allDay),
      timeZone,
      location: sanitizeUntrustedCalendarText(form.location, 300),
      description: sanitizeUntrustedCalendarText(form.description, 2000),
      attendees: parseAttendeesInput(form.attendeesText),
      color: CALENDAR_COLORS.includes(form.color) ? form.color : 'default',
    },
  };
}

function EventModal({
  modal,
  timeZone,
  submitting,
  errorMessage,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(() => createInitialForm(modal.mode, modal.event, modal.defaultDate));
  const [localError, setLocalError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleInputRef = useRef(null);

  useEffect(() => {
    setForm(createInitialForm(modal.mode, modal.event, modal.defaultDate));
    setLocalError('');
    setConfirmingDelete(false);
  }, [modal]);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, [modal]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updateField = (field, value) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setLocalError('');
  };

  const handleSubmit = event => {
    event.preventDefault();
    const built = buildEventPayload(form, timeZone);
    if (built.error) {
      setLocalError(built.error);
      return;
    }
    onSave(built.payload);
  };

  const activeError = localError || errorMessage;

  return (
    <div className="calendar-modal-layer">
      <button
        type="button"
        className="calendar-modal-backdrop"
        aria-label="Close event dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-modal-title"
      >
        <div className="calendar-modal-header">
          <h2 id="calendar-modal-title">
            {modal.mode === 'edit' ? 'Edit event' : 'New event'}
          </h2>
          <button
            type="button"
            className="calendar-btn calendar-btn--ghost"
            onClick={onClose}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>

        <form className="calendar-modal-form" onSubmit={handleSubmit} noValidate>
          <div className="calendar-field">
            <label htmlFor="calendar-event-title">Title</label>
            <input
              ref={titleInputRef}
              id="calendar-event-title"
              type="text"
              maxLength={200}
              required
              value={form.title}
              onChange={event => updateField('title', event.target.value)}
              placeholder="Team sync, client review, focus block…"
            />
          </div>

          <div className="calendar-field calendar-field--checkbox">
            <input
              id="calendar-event-allday"
              type="checkbox"
              checked={form.allDay}
              onChange={event => updateField('allDay', event.target.checked)}
            />
            <label htmlFor="calendar-event-allday">All-day event</label>
          </div>

          <div className="calendar-field-grid">
            <div className="calendar-field">
              <label htmlFor="calendar-event-start-date">Start date</label>
              <input
                id="calendar-event-start-date"
                type="date"
                required
                value={form.startDate}
                onChange={event => updateField('startDate', event.target.value)}
              />
            </div>
            {!form.allDay && (
              <div className="calendar-field">
                <label htmlFor="calendar-event-start-time">Start time</label>
                <input
                  id="calendar-event-start-time"
                  type="time"
                  required
                  value={form.startTime}
                  onChange={event => updateField('startTime', event.target.value)}
                />
              </div>
            )}
            <div className="calendar-field">
              <label htmlFor="calendar-event-end-date">End date</label>
              <input
                id="calendar-event-end-date"
                type="date"
                required
                value={form.endDate}
                onChange={event => updateField('endDate', event.target.value)}
              />
            </div>
            {!form.allDay && (
              <div className="calendar-field">
                <label htmlFor="calendar-event-end-time">End time</label>
                <input
                  id="calendar-event-end-time"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={event => updateField('endTime', event.target.value)}
                />
              </div>
            )}
          </div>

          <div className="calendar-field-grid">
            <div className="calendar-field">
              <label htmlFor="calendar-event-location">Location</label>
              <input
                id="calendar-event-location"
                type="text"
                maxLength={300}
                value={form.location}
                onChange={event => updateField('location', event.target.value)}
                placeholder="Office, video link, or address"
              />
            </div>
            <div className="calendar-field">
              <label htmlFor="calendar-event-color">Color tag</label>
              <select
                id="calendar-event-color"
                value={form.color}
                onChange={event => updateField('color', event.target.value)}
              >
                {CALENDAR_COLORS.map(color => (
                  <option key={color} value={color}>{COLOR_LABELS[color]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="calendar-field">
            <label htmlFor="calendar-event-attendees">Attendees (comma-separated)</label>
            <input
              id="calendar-event-attendees"
              type="text"
              value={form.attendeesText}
              onChange={event => updateField('attendeesText', event.target.value)}
              placeholder="alex@example.com, sam@example.com"
            />
          </div>

          <div className="calendar-field">
            <label htmlFor="calendar-event-description">Description</label>
            <textarea
              id="calendar-event-description"
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={event => updateField('description', event.target.value)}
              placeholder="Agenda, notes, or preparation details"
            />
          </div>

          {activeError && (
            <p className="calendar-modal-error" role="alert">{activeError}</p>
          )}

          {modal.mode === 'edit' && confirmingDelete && (
            <div className="calendar-delete-confirm" role="region" aria-label="Confirm deletion">
              <p>Delete &ldquo;{modal.event?.title}&rdquo;? You can undo right after deleting.</p>
              <div className="calendar-delete-confirm-actions">
                <button
                  type="button"
                  className="calendar-btn calendar-btn--danger"
                  disabled={submitting}
                  onClick={() => onDelete(modal.event)}
                >
                  {submitting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  className="calendar-btn calendar-btn--ghost"
                  disabled={submitting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep event
                </button>
              </div>
            </div>
          )}

          <div className="calendar-modal-actions">
            {modal.mode === 'edit' && !confirmingDelete && (
              <button
                type="button"
                className="calendar-btn calendar-btn--danger-outline"
                disabled={submitting}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete event
              </button>
            )}
            <div className="calendar-modal-actions-end">
              <button
                type="button"
                className="calendar-btn calendar-btn--ghost"
                disabled={submitting}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="calendar-btn calendar-btn--primary"
                disabled={submitting}
              >
                {submitting ? 'Saving…' : modal.mode === 'edit' ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function CalendarContent({ onReady }) {
  const auth = useAuth();
  const { status, user, logoutRevision, refresh } = auth;
  const navigation = useAppNavigation();
  const clientEnabled = process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED !== '0';
  const signedIn = status === 'authenticated' && user?.role === 'admin' && typeof user?.id === 'string';
  const accountKey = `${user?.id || ''}:${logoutRevision || 0}`;

  const [timeZone] = useState(resolveDefaultTimeZone);
  const todayIso = useMemo(() => formatDateInTimeZone(new Date(), timeZone), [timeZone]);
  const [view, setView] = useState('month');
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [serverStatus, setServerStatus] = useState({ checked: false, enabled: true, provider: 'redis' });
  const [events, setEvents] = useState([]);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [undoState, setUndoState] = useState(null);
  const [undoing, setUndoing] = useState(false);

  const readyCalledRef = useRef(false);
  const lastTriggerRef = useRef(null);
  const focusRestoreTimerRef = useRef(0);
  const bridgeListenersRef = useRef(new Set());
  const statusAbortRef = useRef(null);
  const eventsAbortRef = useRef(null);
  const mutationAbortRef = useRef(null);

  const windowRange = useMemo(() => computeVisibleWindow(anchorDate, view), [anchorDate, view]);
  const sortedEvents = useMemo(() => sortEvents(events), [events]);

  const contextSnapshotRef = useRef({
    visibleStart: windowRange.visibleStart,
    visibleEnd: windowRange.visibleEnd,
    view,
    timeZone,
    selectedEventId,
    dataRevision: calendarVersion,
  });
  contextSnapshotRef.current = {
    visibleStart: windowRange.visibleStart,
    visibleEnd: windowRange.visibleEnd,
    view,
    timeZone,
    selectedEventId,
    dataRevision: calendarVersion,
  };

  useEffect(() => {
    bridgeListenersRef.current.forEach(listener => {
      try { listener(); } catch { /* Listener error ignored. */ }
    });
  }, [windowRange.visibleStart, windowRange.visibleEnd, view, timeZone, selectedEventId, calendarVersion]);

  useEffect(() => {
    if (status !== 'loading' && !readyCalledRef.current) {
      readyCalledRef.current = true;
      onReady?.();
    }
  }, [status, onReady]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = { html: html.style.cssText, body: body.style.cssText, title: document.title };
    html.classList.add('calendar-route');
    html.style.fontSize = '62.5%';
    html.style.overflow = 'auto';
    html.style.height = 'auto';
    body.style.overflow = 'visible';
    body.style.height = 'auto';
    document.title = 'Calendar | Popular Consulting';
    return () => {
      html.classList.remove('calendar-route');
      html.style.cssText = previous.html;
      body.style.cssText = previous.body;
      document.title = previous.title;
    };
  }, []);

  // Invalidate cached data and abort in-flight work on logout or account switch.
  useEffect(() => {
    statusAbortRef.current?.abort();
    eventsAbortRef.current?.abort();
    mutationAbortRef.current?.abort();
    setEvents([]);
    setCalendarVersion(0);
    setSelectedEventId(null);
    setModal(null);
    setModalError('');
    setUndoState(null);
    setErrorMessage('');
    setServerStatus({ checked: false, enabled: true, provider: 'redis' });
  }, [accountKey, signedIn]);

  // Keep bridge configured even if CalendarPage is rendered standalone.
  const navPathname = navigation?.pathname || '/calendar';
  const navNavigate = navigation?.navigate;
  useEffect(() => {
    metabloomCalendarBridge.configure({
      auth,
      pathname: navPathname,
      navigate: navNavigate,
    });
  }, [auth, navPathname, navNavigate]);

  // Register live CalendarController with metabloomCalendarBridge.
  useEffect(() => {
    if (!signedIn || !clientEnabled) return undefined;
    const controller = {
      getContext({ conversationId } = {}) {
        return {
          version: 1,
          status: 'connected',
          conversationId: conversationId || null,
          ...contextSnapshotRef.current,
        };
      },
      focus({ date, view: nextView, eventId } = {}) {
        if (date && isIsoDate(date)) setAnchorDate(date);
        if (nextView && CALENDAR_VIEWS.includes(nextView)) setView(nextView);
        if (eventId !== undefined) setSelectedEventId(eventId || null);
      },
      refresh({ date, view: nextView, eventId } = {}) {
        if (date && isIsoDate(date)) setAnchorDate(date);
        if (nextView && CALENDAR_VIEWS.includes(nextView)) setView(nextView);
        if (eventId !== undefined) setSelectedEventId(eventId || null);
        setRefreshTick(tick => tick + 1);
      },
      subscribe(listener) {
        bridgeListenersRef.current.add(listener);
        return () => bridgeListenersRef.current.delete(listener);
      },
      disconnect() {
        setSelectedEventId(null);
      },
    };
    const unregister = metabloomCalendarBridge.register(controller);
    return () => unregister();
  }, [signedIn, clientEnabled]);

  // Fetch server feature status.
  useEffect(() => {
    if (!signedIn || !clientEnabled) return undefined;
    statusAbortRef.current?.abort();
    const controller = new AbortController();
    statusAbortRef.current = controller;
    let active = true;
    fetchCalendarStatus({ signal: controller.signal })
      .then(result => {
        if (!active || controller.signal.aborted) return;
        setServerStatus({
          checked: true,
          enabled: result?.enabled !== false,
          provider: result?.provider || 'redis',
        });
      })
      .catch(error => {
        if (!active || controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'cancelled') return;
        if (error?.code === 'calendar_disabled') {
          setServerStatus({ checked: true, enabled: false, provider: 'redis' });
          return;
        }
        setServerStatus({ checked: true, enabled: true, provider: 'redis' });
        setErrorMessage('Could not check calendar status. Try refreshing.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [signedIn, clientEnabled, accountKey]);

  // Load events for the active visible window.
  useEffect(() => {
    if (!signedIn || !clientEnabled || !serverStatus.checked || !serverStatus.enabled) return undefined;
    eventsAbortRef.current?.abort();
    const controller = new AbortController();
    eventsAbortRef.current = controller;
    let active = true;
    setLoading(true);
    setErrorMessage('');
    listCalendarEvents({
      start: windowRange.queryStart,
      end: windowRange.queryEnd,
      timeZone,
      limit: 200,
      signal: controller.signal,
    })
      .then(result => {
        if (!active || controller.signal.aborted) return;
        if (result?.enabled === false) {
          setServerStatus(previous => ({ ...previous, enabled: false, provider: result.provider || previous.provider }));
          setEvents([]);
          setLoading(false);
          return;
        }
        if (result?.provider) {
          setServerStatus(previous => ({ ...previous, provider: result.provider }));
        }
        setEvents(Array.isArray(result?.events) ? result.events : []);
        if (Number.isSafeInteger(result?.version)) setCalendarVersion(result.version);
        setLoading(false);
      })
      .catch(error => {
        if (!active || controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'cancelled') return;
        setLoading(false);
        setErrorMessage(error?.message || 'Unable to load calendar events.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [signedIn, clientEnabled, serverStatus.checked, serverStatus.enabled, windowRange.queryStart, windowRange.queryEnd, timeZone, refreshTick]);

  useEffect(() => () => {
    window.clearTimeout(focusRestoreTimerRef.current);
    statusAbortRef.current?.abort();
    eventsAbortRef.current?.abort();
    mutationAbortRef.current?.abort();
  }, []);

  const stepRange = useCallback(direction => {
    setAnchorDate(current => {
      if (view === 'month') return addMonthsIso(current, direction);
      if (view === 'week') return addDaysIso(current, direction * 7);
      if (view === 'day') return addDaysIso(current, direction);
      return addDaysIso(current, direction * 14);
    });
  }, [view]);

  const jumpToday = useCallback(() => {
    setAnchorDate(todayIso);
  }, [todayIso]);

  const triggerRefresh = useCallback(() => {
    setRefreshTick(tick => tick + 1);
  }, []);

  const openCreateModal = useCallback(defaultDate => {
    lastTriggerRef.current = document.activeElement;
    setModalError('');
    setModal({ mode: 'create', defaultDate: isIsoDate(defaultDate) ? defaultDate : anchorDate });
  }, [anchorDate]);

  const openEditModal = useCallback(event => {
    lastTriggerRef.current = document.activeElement;
    setSelectedEventId(event.id);
    setModalError('');
    setModal({ mode: 'edit', event, defaultDate: anchorDate });
  }, [anchorDate]);

  const closeModal = useCallback(() => {
    setModal(null);
    setModalError('');
    const trigger = lastTriggerRef.current;
    window.clearTimeout(focusRestoreTimerRef.current);
    if (trigger && typeof trigger.focus === 'function') {
      focusRestoreTimerRef.current = window.setTimeout(() => {
        focusRestoreTimerRef.current = 0;
        if (document.contains(trigger)) trigger.focus();
      }, 0);
    }
  }, []);

  const handleSaveEvent = useCallback(async payload => {
    if (!modal) return;
    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setSubmitting(true);
    setModalError('');
    try {
      let result;
      if (modal.mode === 'edit' && modal.event) {
        result = await updateCalendarEvent({
          eventId: modal.event.id,
          patch: payload,
          expectedEventRevision: modal.event.revision,
          expectedVersion: calendarVersion,
          signal: controller.signal,
        });
      } else {
        result = await createCalendarEvent({
          event: payload,
          expectedVersion: calendarVersion,
          signal: controller.signal,
        });
      }
      if (controller.signal.aborted) return;
      if (Number.isSafeInteger(result?.version)) setCalendarVersion(result.version);
      if (result?.event?.id) setSelectedEventId(result.event.id);
      if (result?.undoToken) {
        setUndoState({
          undoToken: result.undoToken,
          label: modal.mode === 'edit' ? `Updated "${payload.title}".` : `Created "${payload.title}".`,
        });
      }
      setSubmitting(false);
      closeModal();
      setRefreshTick(tick => tick + 1);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setSubmitting(false);
      if (error?.code === 'calendar_conflict' || error?.status === 409) {
        setModalError('Your calendar was updated elsewhere. Close and refresh to see the latest schedule.');
      } else {
        setModalError(error?.message || 'Could not save the event. Please try again.');
      }
    }
  }, [modal, calendarVersion, closeModal]);

  const handleDeleteEvent = useCallback(async targetEvent => {
    if (!targetEvent) return;
    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setSubmitting(true);
    setModalError('');
    try {
      const result = await deleteCalendarEvent({
        eventId: targetEvent.id,
        expectedEventRevision: targetEvent.revision,
        expectedVersion: calendarVersion,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (Number.isSafeInteger(result?.version)) setCalendarVersion(result.version);
      setSelectedEventId(null);
      if (result?.undoToken) {
        setUndoState({
          undoToken: result.undoToken,
          label: `Deleted "${targetEvent.title}".`,
        });
      }
      setSubmitting(false);
      closeModal();
      setRefreshTick(tick => tick + 1);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setSubmitting(false);
      if (error?.code === 'calendar_conflict' || error?.status === 409) {
        setModalError('This event changed elsewhere. Refresh before deleting.');
      } else {
        setModalError(error?.message || 'Could not delete the event. Please try again.');
      }
    }
  }, [calendarVersion, closeModal]);

  const handleUndo = useCallback(async () => {
    if (!undoState?.undoToken) return;
    mutationAbortRef.current?.abort();
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setUndoing(true);
    setErrorMessage('');
    try {
      const result = await undoCalendarOperation({
        undoToken: undoState.undoToken,
        expectedVersion: calendarVersion,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (Number.isSafeInteger(result?.version)) setCalendarVersion(result.version);
      setUndoState(null);
      setUndoing(false);
      setRefreshTick(tick => tick + 1);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setUndoing(false);
      setErrorMessage(error?.message || 'Could not undo the last change.');
    }
  }, [undoState, calendarVersion]);

  const exportUrl = useMemo(
    () => getCalendarExportUrl({ start: windowRange.queryStart, end: windowRange.queryEnd }),
    [windowRange.queryStart, windowRange.queryEnd],
  );

  const rangeHeading = useMemo(
    () => formatRangeHeading(anchorDate, view, windowRange.visibleStart, windowRange.visibleEnd),
    [anchorDate, view, windowRange.visibleStart, windowRange.visibleEnd],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const dayIso of windowRange.days) {
      map.set(dayIso, sortedEvents.filter(item => eventOverlapsDate(item, dayIso, timeZone)));
    }
    return map;
  }, [windowRange.days, sortedEvents, timeZone]);

  const providerLabel = serverStatus.provider === 'mcp' ? 'MCP connected' : 'Personal calendar';
  const activeMonthPrefix = anchorDate.slice(0, 7);

  const renderMonthView = () => (
    <div className="calendar-month" role="region" aria-label="Month schedule">
      <div className="calendar-weekday-row" aria-hidden="true">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="calendar-weekday-cell">{label}</div>
        ))}
      </div>
      <div className="calendar-month-grid">
        {windowRange.days.map(dayIso => {
          const dayEvents = eventsByDay.get(dayIso) || [];
          const isToday = dayIso === todayIso;
          const isAnchor = dayIso === anchorDate;
          const isCurrentMonth = dayIso.slice(0, 7) === activeMonthPrefix;
          const dayNum = Number(dayIso.slice(8, 10));
          const fullLabel = formatDayHeading(dayIso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
          const visibleItems = dayEvents.slice(0, 3);
          const overflowCount = dayEvents.length - visibleItems.length;
          return (
            <div
              key={dayIso}
              className={`calendar-day-cell${isToday ? ' is-today' : ''}${isAnchor ? ' is-selected' : ''}${!isCurrentMonth ? ' is-outside' : ''}`}
              data-date={dayIso}
            >
              <div className="calendar-day-cell-top">
                <button
                  type="button"
                  className="calendar-day-number"
                  aria-label={`Select ${fullLabel}`}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => setAnchorDate(dayIso)}
                >
                  {dayNum}
                </button>
                <button
                  type="button"
                  className="calendar-day-add"
                  aria-label={`Add event on ${fullLabel}`}
                  onClick={() => openCreateModal(dayIso)}
                >
                  +
                </button>
              </div>
              <div className="calendar-day-events">
                {visibleItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`calendar-event-chip calendar-color--${item.color || 'default'}${selectedEventId === item.id ? ' is-selected' : ''}`}
                    onClick={() => openEditModal(item)}
                  >
                    <span className="calendar-event-chip-time">{formatShortStartTime(item, timeZone)}</span>
                    <span className="calendar-event-chip-title">{item.title}</span>
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    className="calendar-event-more"
                    onClick={() => {
                      setAnchorDate(dayIso);
                      setView('day');
                    }}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWeekView = () => (
    <div className="calendar-week" role="region" aria-label="Week schedule">
      <div className="calendar-week-grid">
        {windowRange.days.map(dayIso => {
          const dayEvents = eventsByDay.get(dayIso) || [];
          const isToday = dayIso === todayIso;
          const weekdayLabel = formatDayHeading(dayIso, { weekday: 'short' });
          const dateLabel = formatDayHeading(dayIso, { month: 'short', day: 'numeric' });
          const fullLabel = formatDayHeading(dayIso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
          return (
            <section
              key={dayIso}
              className={`calendar-week-col${isToday ? ' is-today' : ''}`}
              aria-label={fullLabel}
            >
              <header className="calendar-week-col-header">
                <div>
                  <span className="calendar-week-weekday">{weekdayLabel}</span>
                  <h3 className="calendar-week-date">{dateLabel}</h3>
                </div>
                <button
                  type="button"
                  className="calendar-day-add"
                  aria-label={`Add event on ${fullLabel}`}
                  onClick={() => openCreateModal(dayIso)}
                >
                  +
                </button>
              </header>
              <div className="calendar-week-col-body">
                {dayEvents.length === 0 ? (
                  <p className="calendar-empty-slot">No events</p>
                ) : (
                  dayEvents.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`calendar-event-card calendar-color--${item.color || 'default'}${selectedEventId === item.id ? ' is-selected' : ''}`}
                      onClick={() => openEditModal(item)}
                    >
                      <span className="calendar-event-card-time">{formatEventTime(item, timeZone)}</span>
                      <span className="calendar-event-card-title">{item.title}</span>
                      {item.location && <span className="calendar-event-card-meta">{item.location}</span>}
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  const renderDayView = () => {
    const dayEvents = eventsByDay.get(anchorDate) || [];
    const allDayItems = dayEvents.filter(item => item.allDay);
    const timedItems = dayEvents.filter(item => !item.allDay);
    return (
      <div className="calendar-day-view" role="region" aria-label="Day schedule">
        {allDayItems.length > 0 && (
          <section className="calendar-allday-strip" aria-label="All-day events">
            <h3 className="calendar-section-label">All day</h3>
            <div className="calendar-allday-list">
              {allDayItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`calendar-event-card calendar-color--${item.color || 'default'}${selectedEventId === item.id ? ' is-selected' : ''}`}
                  onClick={() => openEditModal(item)}
                >
                  <span className="calendar-event-card-title">{item.title}</span>
                  {item.location && <span className="calendar-event-card-meta">{item.location}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="calendar-day-timeline" aria-label="Scheduled events">
          {timedItems.length === 0 && allDayItems.length === 0 ? (
            <div className="calendar-empty-panel">
              <p>Nothing scheduled for this day.</p>
              <button
                type="button"
                className="calendar-btn calendar-btn--primary"
                onClick={() => openCreateModal(anchorDate)}
              >
                Schedule an event
              </button>
            </div>
          ) : timedItems.length === 0 ? (
            <p className="calendar-empty-slot">No timed events for this day.</p>
          ) : (
            <ul className="calendar-agenda-list">
              {timedItems.map(item => (
                <li key={item.id} className="calendar-agenda-row">
                  <button
                    type="button"
                    className={`calendar-event-detail calendar-color--${item.color || 'default'}${selectedEventId === item.id ? ' is-selected' : ''}`}
                    onClick={() => openEditModal(item)}
                  >
                    <span className="calendar-event-detail-time">{formatEventTime(item, timeZone)}</span>
                    <span className="calendar-event-detail-body">
                      <span className="calendar-event-detail-title">{item.title}</span>
                      {item.location && <span className="calendar-event-detail-meta">{item.location}</span>}
                      {item.description && <span className="calendar-event-detail-desc">{item.description}</span>}
                      {Array.isArray(item.attendees) && item.attendees.length > 0 && (
                        <span className="calendar-event-detail-meta">
                          {item.attendees.length} {item.attendees.length === 1 ? 'attendee' : 'attendees'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  };

  const renderAgendaView = () => {
    const grouped = windowRange.days
      .map(dayIso => ({ dayIso, items: eventsByDay.get(dayIso) || [] }))
      .filter(group => group.items.length > 0);

    if (grouped.length === 0) {
      return (
        <div className="calendar-empty-panel" role="region" aria-label="Agenda schedule">
          <p>No upcoming events in the next 30 days.</p>
          <button
            type="button"
            className="calendar-btn calendar-btn--primary"
            onClick={() => openCreateModal(anchorDate)}
          >
            New Event
          </button>
        </div>
      );
    }

    return (
      <div className="calendar-agenda" role="region" aria-label="Agenda schedule">
        {grouped.map(group => (
          <section key={group.dayIso} className="calendar-agenda-group">
            <h3 className="calendar-agenda-date">
              {formatDayHeading(group.dayIso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <ul className="calendar-agenda-list">
              {group.items.map(item => (
                <li key={`${group.dayIso}-${item.id}`} className="calendar-agenda-row">
                  <button
                    type="button"
                    className={`calendar-event-detail calendar-color--${item.color || 'default'}${selectedEventId === item.id ? ' is-selected' : ''}`}
                    onClick={() => openEditModal(item)}
                  >
                    <span className="calendar-event-detail-time">{formatEventTime(item, timeZone)}</span>
                    <span className="calendar-event-detail-body">
                      <span className="calendar-event-detail-title">{item.title}</span>
                      {item.location && <span className="calendar-event-detail-meta">{item.location}</span>}
                      {Array.isArray(item.attendees) && item.attendees.length > 0 && (
                        <span className="calendar-event-detail-meta">
                          {item.attendees.length} {item.attendees.length === 1 ? 'attendee' : 'attendees'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="calendar-page">
      <a className="calendar-skip" href="#calendar-main">Skip to calendar</a>
      <NavMenu standalone />
      <main id="calendar-main" className="calendar-main" tabIndex={-1} aria-labelledby="calendar-title">
        {!signedIn ? (
          <section className="calendar-glass-panel calendar-session" aria-busy={status === 'loading'}>
            <p className="calendar-eyebrow">Popular Consulting / Calendar</p>
            <h1 id="calendar-title">
              {status === 'loading'
                ? 'Opening your calendar.'
                : status === 'unavailable'
                  ? 'Unable to check your session.'
                  : 'Sign in to open your calendar.'}
            </h1>
            <p role="status">
              {status === 'loading'
                ? 'Checking your session…'
                : status === 'unavailable'
                  ? 'Please try again to load your calendar.'
                  : 'Your session has ended or does not have calendar access.'}
            </p>
            <div className="calendar-session-actions">
              {status === 'unavailable' && (
                <button type="button" className="calendar-btn calendar-btn--primary" onClick={refresh}>
                  Try again
                </button>
              )}
              {status !== 'loading' && status !== 'unavailable' && (
                <a className="calendar-btn calendar-btn--primary" href="/login">Sign in</a>
              )}
              {status !== 'loading' && (
                <a className="calendar-btn calendar-btn--ghost" href="/home">Back to workspace</a>
              )}
            </div>
          </section>
        ) : !clientEnabled || (serverStatus.checked && !serverStatus.enabled) ? (
          <section className="calendar-glass-panel calendar-session">
            <p className="calendar-eyebrow">Popular Consulting / Calendar</p>
            <h1 id="calendar-title">Calendar</h1>
            <p role="status">Calendar is currently disabled for this workspace.</p>
            <div className="calendar-session-actions">
              <a className="calendar-btn calendar-btn--ghost" href="/home">Return to workspace</a>
            </div>
          </section>
        ) : (
          <div className="calendar-workspace">
            <header className="calendar-header">
              <div className="calendar-header-copy">
                <p className="calendar-eyebrow">Popular Consulting / Workspace</p>
                <h1 id="calendar-title">Calendar</h1>
              </div>
              <div className="calendar-header-badges">
                <span className="calendar-badge calendar-badge--provider">{providerLabel}</span>
                <span className="calendar-badge calendar-badge--tz">{timeZone}</span>
              </div>
            </header>

            <section className="calendar-glass-panel calendar-toolbar" aria-label="Calendar controls">
              <div className="calendar-nav-group">
                <button type="button" className="calendar-btn calendar-btn--ghost" onClick={() => stepRange(-1)}>
                  Prev
                </button>
                <button type="button" className="calendar-btn calendar-btn--ghost" onClick={jumpToday}>
                  Today
                </button>
                <button type="button" className="calendar-btn calendar-btn--ghost" onClick={() => stepRange(1)}>
                  Next
                </button>
                <h2 className="calendar-range-title">{rangeHeading}</h2>
              </div>

              <div className="calendar-controls-right">
                <div className="calendar-view-switcher" role="group" aria-label="Calendar view">
                  {CALENDAR_VIEWS.map(option => (
                    <button
                      key={option}
                      type="button"
                      className={`calendar-view-btn${view === option ? ' is-active' : ''}`}
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                    >
                      {VIEW_LABELS[option]}
                    </button>
                  ))}
                </div>

                <div className="calendar-action-group">
                  <button
                    type="button"
                    className="calendar-btn calendar-btn--primary"
                    onClick={() => openCreateModal(anchorDate)}
                  >
                    New Event
                  </button>
                  <button
                    type="button"
                    className="calendar-btn calendar-btn--ghost"
                    onClick={triggerRefresh}
                    disabled={loading}
                  >
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <a
                    className="calendar-btn calendar-btn--ghost"
                    href={exportUrl}
                    download="calendar.ics"
                  >
                    Export .ics
                  </a>
                </div>
              </div>
            </section>

            {undoState && (
              <div className="calendar-glass-panel calendar-undo-banner" role="status" aria-live="polite">
                <span>{undoState.label}</span>
                <div className="calendar-undo-actions">
                  <button
                    type="button"
                    className="calendar-btn calendar-btn--primary"
                    disabled={undoing}
                    onClick={handleUndo}
                  >
                    {undoing ? 'Undoing…' : 'Undo'}
                  </button>
                  <button
                    type="button"
                    className="calendar-btn calendar-btn--ghost"
                    disabled={undoing}
                    onClick={() => setUndoState(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="calendar-glass-panel calendar-error-banner" role="alert">
                <span>{errorMessage}</span>
                <button type="button" className="calendar-btn calendar-btn--ghost" onClick={triggerRefresh}>
                  Retry
                </button>
              </div>
            )}

            <section className="calendar-glass-panel calendar-surface" aria-busy={loading}>
              {view === 'month' && renderMonthView()}
              {view === 'week' && renderWeekView()}
              {view === 'day' && renderDayView()}
              {view === 'agenda' && renderAgendaView()}
            </section>
          </div>
        )}

        {modal && (
          <EventModal
            modal={modal}
            timeZone={timeZone}
            submitting={submitting}
            errorMessage={modalError}
            onClose={closeModal}
            onSave={handleSaveEvent}
            onDelete={handleDeleteEvent}
          />
        )}
      </main>
    </div>
  );
}

export default function CalendarPage({ onReady }) {
  return (
    <ThemeProvider enableBackground={false}>
      <CalendarContent onReady={onReady} />
    </ThemeProvider>
  );
}
