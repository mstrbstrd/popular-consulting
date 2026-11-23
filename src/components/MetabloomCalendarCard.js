import React from 'react';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import {
  confirmCalendarProposal,
  undoCalendarOperation,
} from './metabloomCalendarApiClient';
import { metabloomCalendarBridge } from './metabloomCalendarBridge';
import './MetabloomCalendarCard.css';

function formatIsoDate(dateString) {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString || '';
  const [year, month, day] = dateString.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return dateString;
  }
}

function formatEventSchedule(event) {
  if (!event || !event.start) return '';
  if (event.allDay) {
    const startLabel = formatIsoDate(event.start);
    const endLabel = event.end && event.end !== event.start ? formatIsoDate(event.end) : '';
    return endLabel ? `${startLabel} – ${endLabel} (All day)` : `${startLabel} (All day)`;
  }
  const startMs = Date.parse(event.start);
  const endMs = event.end ? Date.parse(event.end) : NaN;
  if (!Number.isFinite(startMs)) return event.start;
  const tz = event.timeZone || 'UTC';
  try {
    const dateFmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    });
    const timeFmt = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
    const startDate = dateFmt.format(new Date(startMs));
    const startTime = timeFmt.format(new Date(startMs));
    if (!Number.isFinite(endMs)) return `${startDate}, ${startTime} (${tz})`;
    const endDate = dateFmt.format(new Date(endMs));
    const endTime = timeFmt.format(new Date(endMs));
    if (startDate === endDate) return `${startDate}, ${startTime} – ${endTime} (${tz})`;
    return `${startDate} ${startTime} – ${endDate} ${endTime} (${tz})`;
  } catch {
    return event.end ? `${event.start} – ${event.end}` : event.start;
  }
}

function deriveDisplayEvent(proposal, receipt, liveEvent) {
  if (liveEvent) return liveEvent;
  if (receipt?.event) {
    if (proposal?.command === 'update' && proposal.patch) {
      return { ...receipt.event, ...proposal.patch };
    }
    return receipt.event;
  }
  if (proposal?.event) return proposal.event;
  if (proposal?.patch) return proposal.patch;
  return null;
}

function deriveFocusTarget(proposal, receipt, liveEvent) {
  const focus = proposal?.focus || {};
  const sourceEvent = liveEvent || receipt?.event || proposal?.event || null;
  const dateFromEvent = typeof sourceEvent?.start === 'string' && sourceEvent.start.length >= 10
    ? sourceEvent.start.slice(0, 10)
    : null;
  return {
    date: focus.date || dateFromEvent || null,
    view: focus.view || null,
    eventId: liveEvent?.id || receipt?.eventId || focus.eventId || proposal?.eventId || null,
  };
}

function statusPillLabel(status, command) {
  if (status === 'pending_confirmation') {
    if (command === 'delete') return 'Confirm deletion';
    return 'Needs confirmation';
  }
  if (status === 'undone') return 'Undone';
  if (status === 'dismissed' || status === 'cancelled') return 'Dismissed';
  if (status === 'duplicate') return 'Already applied';
  if (status === 'conflict') return 'Conflict';
  if (status === 'failed' || status === 'rejected' || status === 'unavailable') return 'Not applied';
  if (status === 'applied') {
    if (command === 'delete') return 'Deleted';
    if (command === 'update') return 'Updated';
    if (command === 'create') return 'Added';
    return 'Applied';
  }
  return 'Calendar update';
}

function statusTone(status) {
  if (status === 'pending_confirmation') return 'pending';
  if (status === 'applied' || status === 'duplicate') return 'applied';
  if (status === 'undone' || status === 'dismissed' || status === 'cancelled') return 'neutral';
  return 'error';
}

function formatActionError(error, fallback) {
  if (error?.code === 'calendar_conflict') {
    return 'This event changed elsewhere. Open Calendar to review the latest version before retrying.';
  }
  if (error?.code === 'calendar_not_found') {
    return 'This calendar event no longer exists.';
  }
  if (error?.code === 'calendar_undo_unavailable') {
    return 'Undo is no longer available for this change.';
  }
  if (error?.code === 'calendar_disabled') {
    return 'Calendar actions are currently disabled.';
  }
  return fallback;
}

export default function MetabloomCalendarCard({
  proposal = null,
  receipt = null,
  onOpenCalendar = null,
  onStateChange = null,
  disabled = false,
}) {
  const navigation = useAppNavigation();
  const initialStatus = receipt?.status || (proposal?.requiresConfirmation ? 'pending_confirmation' : 'applied');
  const [status, setStatus] = React.useState(initialStatus);
  const [message, setMessage] = React.useState(receipt?.message || '');
  const [undoToken, setUndoToken] = React.useState(receipt?.undoToken || null);
  const [calendarVersion, setCalendarVersion] = React.useState(receipt?.calendarVersion ?? null);
  const [liveEvent, setLiveEvent] = React.useState(receipt?.event || null);
  const [busyAction, setBusyAction] = React.useState(null);
  const [errorText, setErrorText] = React.useState('');
  const abortRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  if (!proposal && !receipt) return null;

  const command = proposal?.command || (receipt?.event ? 'create' : 'focus');
  const displayEvent = deriveDisplayEvent(proposal, receipt, liveEvent);
  const focusTarget = deriveFocusTarget(proposal, receipt, liveEvent);
  const title = displayEvent?.title
    || (command === 'delete'
      ? 'Calendar event'
      : command === 'open' || command === 'focus'
        ? 'Calendar workspace'
        : 'Calendar event');
  const scheduleLabel = formatEventSchedule(displayEvent);
  const locationLabel = displayEvent?.location || '';
  const attendees = Array.isArray(displayEvent?.attendees) ? displayEvent.attendees : [];
  const pillLabel = statusPillLabel(status, command);
  const tone = statusTone(status);
  const canConfirm = status === 'pending_confirmation' && Boolean(proposal);
  const canUndo = (status === 'applied' || status === 'duplicate') && Boolean(undoToken);
  const actionDisabled = disabled || Boolean(busyAction);

  const handleConfirm = async () => {
    if (!canConfirm || actionDisabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyAction('confirm');
    setErrorText('');
    try {
      const result = await confirmCalendarProposal({
        proposal,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const nextStatus = result?.status === 'duplicate' ? 'duplicate' : 'applied';
      const nextEvent = result?.event !== undefined ? result.event : liveEvent;
      const nextUndo = result?.undoToken || null;
      const nextVersion = result?.version ?? calendarVersion;
      const nextMessage = command === 'delete'
        ? 'Event deleted from your calendar.'
        : command === 'update'
          ? 'Calendar event updated.'
          : 'Event added to your calendar.';
      setStatus(nextStatus);
      setLiveEvent(nextEvent);
      setUndoToken(nextUndo);
      setCalendarVersion(nextVersion);
      setMessage(nextMessage);
      const refreshTarget = deriveFocusTarget(proposal, receipt, nextEvent);
      metabloomCalendarBridge.notifyRefresh?.(refreshTarget);
      onStateChange?.({ status: nextStatus, result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const nextStatus = error?.code === 'calendar_conflict' ? 'conflict' : 'failed';
      setStatus(nextStatus);
      setErrorText(formatActionError(error, 'Could not confirm this calendar change. Please try again.'));
      onStateChange?.({ status: nextStatus, error });
    } finally {
      if (mountedRef.current) setBusyAction(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleDismiss = () => {
    if (!canConfirm || actionDisabled) return;
    setStatus('dismissed');
    setErrorText('');
    setMessage('Dismissed without changing your calendar.');
    onStateChange?.({ status: 'dismissed' });
  };

  const handleUndo = async () => {
    if (!canUndo || actionDisabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyAction('undo');
    setErrorText('');
    try {
      const result = await undoCalendarOperation({
        undoToken,
        expectedVersion: calendarVersion,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const nextEvent = result?.event !== undefined ? result.event : null;
      setStatus('undone');
      setUndoToken(null);
      setCalendarVersion(result?.version ?? calendarVersion);
      if (nextEvent) setLiveEvent(nextEvent);
      setMessage('Calendar change undone.');
      const refreshTarget = deriveFocusTarget(proposal, receipt, nextEvent);
      metabloomCalendarBridge.notifyRefresh?.(refreshTarget);
      onStateChange?.({ status: 'undone', result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setErrorText(formatActionError(error, 'Could not undo this calendar change.'));
      onStateChange?.({ status: 'failed', error });
    } finally {
      if (mountedRef.current) setBusyAction(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleOpenCalendar = () => {
    if (disabled) return;
    if (typeof onOpenCalendar === 'function') {
      onOpenCalendar(focusTarget);
      return;
    }
    metabloomCalendarBridge.notifyRefresh?.(focusTarget);
    navigation?.navigate('/calendar');
  };

  return (
    <section
      className="metabloom-calendar-card"
      data-calendar-status={status}
      data-calendar-command={command}
      aria-label={`Calendar card: ${title}`}
    >
      <div className="metabloom-calendar-card__header">
        <div className="metabloom-calendar-card__heading">
          <span className="metabloom-calendar-card__eyebrow">Calendar</span>
          <h3 className="metabloom-calendar-card__title">{title}</h3>
        </div>
        <span
          className={`metabloom-calendar-card__pill metabloom-calendar-card__pill--${tone}`}
          role="status"
        >
          {pillLabel}
        </span>
      </div>

      {(scheduleLabel || locationLabel || attendees.length > 0) && (
        <dl className="metabloom-calendar-card__details">
          {scheduleLabel && (
            <div className="metabloom-calendar-card__detail-row">
              <dt>When</dt>
              <dd>{scheduleLabel}</dd>
            </div>
          )}
          {locationLabel && (
            <div className="metabloom-calendar-card__detail-row">
              <dt>Where</dt>
              <dd>{locationLabel}</dd>
            </div>
          )}
          {attendees.length > 0 && (
            <div className="metabloom-calendar-card__detail-row">
              <dt>Attendees</dt>
              <dd>{attendees.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      {message && (
        <p className="metabloom-calendar-card__summary">{message}</p>
      )}

      {errorText && (
        <p className="metabloom-calendar-card__error" role="alert">
          {errorText}
        </p>
      )}

      <div className="metabloom-calendar-card__actions">
        {canConfirm && (
          <>
            <button
              type="button"
              className="metabloom-calendar-card__btn metabloom-calendar-card__btn--primary"
              disabled={actionDisabled}
              onClick={handleConfirm}
            >
              {busyAction === 'confirm' ? 'Confirming…' : 'Confirm'}
            </button>
            <button
              type="button"
              className="metabloom-calendar-card__btn"
              disabled={actionDisabled}
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          </>
        )}

        {canUndo && (
          <button
            type="button"
            className="metabloom-calendar-card__btn"
            disabled={actionDisabled}
            onClick={handleUndo}
          >
            {busyAction === 'undo' ? 'Undoing…' : 'Undo'}
          </button>
        )}

        <button
          type="button"
          className="metabloom-calendar-card__btn metabloom-calendar-card__btn--link"
          disabled={disabled}
          onClick={handleOpenCalendar}
        >
          Open in Calendar
        </button>
      </div>
    </section>
  );
}
