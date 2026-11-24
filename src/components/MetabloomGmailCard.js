import React from 'react';
import {
  confirmGmailProposal,
  discardGmailDraft,
  sendGmailDraft,
  undoGmailAction,
} from './metabloomGmailApiClient';
import './MetabloomGmailCard.css';

const TERMINAL_ERROR_CODES = new Set([
  'gmail_proposal_tampered',
  'gmail_not_found',
  'gmail_disabled',
]);

function normalizeAddressList(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function statusPillLabel(status, command) {
  if (status === 'pending_confirmation') {
    if (command === 'send') return 'Review before sending';
    if (command === 'trash') return 'Confirm Trash';
    return 'Needs confirmation';
  }
  if (status === 'undone') return 'Undone';
  if (status === 'discarded') return 'Discarded';
  if (status === 'dismissed' || status === 'cancelled') return 'Dismissed';
  if (status === 'duplicate') {
    if (command === 'send') return 'Already sent';
    if (command === 'trash') return 'Already trashed';
    return 'Already applied';
  }
  if (status === 'failed' || status === 'rejected' || status === 'unavailable') return 'Not applied';
  if (status === 'applied') {
    if (command === 'send') return 'Sent';
    if (command === 'draft') return 'Draft saved';
    if (command === 'trash') return 'Moved to Trash';
    if (command === 'organize') return 'Updated';
    return 'Applied';
  }
  return 'Gmail update';
}

function statusTone(status) {
  if (status === 'pending_confirmation') return 'pending';
  if (status === 'applied' || status === 'duplicate') return 'applied';
  if (status === 'undone' || status === 'discarded' || status === 'dismissed' || status === 'cancelled') {
    return 'neutral';
  }
  return 'error';
}

function formatActionError(error, fallback) {
  if (error?.code === 'gmail_send_disabled') {
    return 'Sending email is currently disabled on this server. You can save as a draft instead.';
  }
  if (error?.code === 'gmail_proposal_tampered') {
    return 'This email confirmation expired or was modified. Ask Metabloom to prepare it again.';
  }
  if (error?.code === 'gmail_not_connected') {
    return 'Connect your Google account on the Calendar page to access Gmail.';
  }
  if (error?.code === 'gmail_permission_denied') {
    return 'Gmail permission has not been granted yet. Disconnect and sign in with Google again on the Calendar page.';
  }
  if (error?.code === 'gmail_api_disabled') {
    return 'Gmail API is not enabled on your Google Cloud project. Enable Gmail API in Google Cloud Console and retry.';
  }
  if (error?.code === 'gmail_not_found') {
    return 'That email or draft could not be found in Gmail.';
  }
  if (error?.code === 'gmail_undo_unavailable') {
    return 'This email action can no longer be undone.';
  }
  if (error?.code === 'gmail_disabled') {
    return 'Gmail integration is currently disabled.';
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

export default function MetabloomGmailCard({
  proposal = null,
  receipt = null,
  onStateChange = null,
  disabled = false,
}) {
  const initialCommand = proposal?.command || receipt?.command || 'draft';
  const initialStatus = receipt?.status || (proposal?.requiresConfirmation ? 'pending_confirmation' : 'applied');
  const [activeCommand, setActiveCommand] = React.useState(initialCommand);
  const [status, setStatus] = React.useState(initialStatus);
  const [message, setMessage] = React.useState(receipt?.message || '');
  const [draftId, setDraftId] = React.useState(receipt?.draftId || null);
  const [messageId, setMessageId] = React.useState(receipt?.messageId || proposal?.messageId || null);
  const [undoAction, setUndoAction] = React.useState(receipt?.undoAction || null);
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

  const preview = receipt?.preview && typeof receipt.preview === 'object' ? receipt.preview : null;
  const toList = normalizeAddressList(proposal?.to?.length ? proposal.to : preview?.to);
  const ccList = normalizeAddressList(proposal?.cc?.length ? proposal.cc : preview?.cc);
  const fromLabel = typeof preview?.from === 'string' ? preview.from.trim() : '';
  const subject = (typeof proposal?.subject === 'string' && proposal.subject.trim())
    || (typeof preview?.subject === 'string' && preview.subject.trim())
    || '';
  const bodyText = typeof proposal?.body === 'string' && proposal.body.trim() ? proposal.body : '';
  const snippetText = !bodyText && typeof preview?.snippet === 'string' && preview.snippet.trim()
    ? preview.snippet.trim()
    : '';

  const title = subject
    || (activeCommand === 'send'
      ? 'New email'
      : activeCommand === 'draft'
        ? 'Email draft'
        : activeCommand === 'trash'
          ? 'Email message'
          : 'Gmail update');

  const pillLabel = statusPillLabel(status, activeCommand);
  const tone = statusTone(status);
  const canConfirmSend = status === 'pending_confirmation' && Boolean(proposal) && activeCommand === 'send';
  const canConfirmTrash = status === 'pending_confirmation' && Boolean(proposal) && activeCommand === 'trash';
  const canManageDraft = (status === 'applied' || status === 'duplicate') && activeCommand === 'draft' && Boolean(draftId);
  const canUndo = (status === 'applied' || status === 'duplicate')
    && activeCommand === 'organize'
    && Boolean(undoAction)
    && Boolean(messageId);
  const actionDisabled = disabled || Boolean(busyAction);

  const startAbortableAction = (actionName) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyAction(actionName);
    setErrorText('');
    return controller;
  };

  const finishAbortableAction = (controller) => {
    if (mountedRef.current) setBusyAction(null);
    if (abortRef.current === controller) abortRef.current = null;
  };

  const handleConfirmProposal = async ({ saveAsDraft = false } = {}) => {
    if ((!canConfirmSend && !canConfirmTrash) || actionDisabled) return;
    const actionKey = saveAsDraft ? 'save_draft' : activeCommand === 'trash' ? 'trash' : 'send';
    const controller = startAbortableAction(actionKey);
    try {
      const result = await confirmGmailProposal({
        proposal,
        saveAsDraft,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const nextStatus = result?.status === 'duplicate' ? 'duplicate' : 'applied';
      const nextCommand = saveAsDraft || result?.command === 'draft' ? 'draft' : activeCommand;
      const nextMessage = (typeof result?.message === 'string' && result.message.trim())
        || (nextCommand === 'draft'
          ? 'Saved as a draft in Gmail.'
          : nextCommand === 'trash'
            ? 'Email moved to Trash.'
            : 'Email sent.');
      setActiveCommand(nextCommand);
      setStatus(nextStatus);
      if (result?.draftId) setDraftId(result.draftId);
      if (result?.messageId) setMessageId(result.messageId);
      setMessage(nextMessage);
      onStateChange?.({ status: nextStatus, command: nextCommand, result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const isTerminal = TERMINAL_ERROR_CODES.has(error?.code);
      if (isTerminal) setStatus('failed');
      setErrorText(formatActionError(
        error,
        saveAsDraft
          ? 'Could not save this email as a draft. Please try again.'
          : activeCommand === 'trash'
            ? 'Could not move this email to Trash. Please try again.'
            : 'Could not send this email. Please try again.',
      ));
      onStateChange?.({ status: isTerminal ? 'failed' : status, error });
    } finally {
      finishAbortableAction(controller);
    }
  };

  const handleDismiss = () => {
    if ((!canConfirmSend && !canConfirmTrash) || actionDisabled) return;
    setStatus('dismissed');
    setErrorText('');
    setMessage(
      activeCommand === 'trash'
        ? 'Dismissed without moving email to Trash.'
        : 'Dismissed without sending email.',
    );
    onStateChange?.({ status: 'dismissed', command: activeCommand });
  };

  const handleSendDraft = async () => {
    if (!canManageDraft || actionDisabled) return;
    const controller = startAbortableAction('send_draft');
    try {
      const result = await sendGmailDraft({
        draftId,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const nextStatus = result?.status === 'duplicate' ? 'duplicate' : 'applied';
      setActiveCommand('send');
      setStatus(nextStatus);
      setDraftId(null);
      if (result?.messageId) setMessageId(result.messageId);
      setMessage((typeof result?.message === 'string' && result.message.trim()) || 'Draft sent.');
      onStateChange?.({ status: nextStatus, command: 'send', result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setErrorText(formatActionError(error, 'Could not send this draft. Please try again.'));
      onStateChange?.({ status: 'failed', error });
    } finally {
      finishAbortableAction(controller);
    }
  };

  const handleDiscardDraft = async () => {
    if (!canManageDraft || actionDisabled) return;
    const controller = startAbortableAction('discard_draft');
    try {
      const result = await discardGmailDraft({
        draftId,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      setStatus('discarded');
      setDraftId(null);
      setMessage((typeof result?.message === 'string' && result.message.trim()) || 'Draft discarded.');
      onStateChange?.({ status: 'discarded', command: 'draft', result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setErrorText(formatActionError(error, 'Could not discard this draft. Please try again.'));
      onStateChange?.({ status: 'failed', error });
    } finally {
      finishAbortableAction(controller);
    }
  };

  const handleUndo = async () => {
    if (!canUndo || actionDisabled) return;
    const controller = startAbortableAction('undo');
    try {
      const result = await undoGmailAction({
        messageId,
        undoAction,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      setStatus('undone');
      setUndoAction(null);
      setMessage((typeof result?.message === 'string' && result.message.trim()) || 'Email action undone.');
      onStateChange?.({ status: 'undone', command: 'organize', result });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setErrorText(formatActionError(error, 'Could not undo this email action.'));
      onStateChange?.({ status: 'failed', error });
    } finally {
      finishAbortableAction(controller);
    }
  };

  const hasMetadata = toList.length > 0 || ccList.length > 0 || Boolean(fromLabel) || Boolean(subject);
  const hasActions = canConfirmSend || canConfirmTrash || canManageDraft || canUndo;

  return (
    <section
      className="metabloom-gmail-card"
      data-gmail-status={status}
      data-gmail-command={activeCommand}
      aria-label={`Gmail card: ${title}`}
    >
      <div className="metabloom-gmail-card__header">
        <div className="metabloom-gmail-card__heading">
          <span className="metabloom-gmail-card__eyebrow">Gmail</span>
          <h3 className="metabloom-gmail-card__title">{title}</h3>
        </div>
        <span
          className={`metabloom-gmail-card__pill metabloom-gmail-card__pill--${tone}`}
          role="status"
        >
          {pillLabel}
        </span>
      </div>

      {hasMetadata && (
        <dl className="metabloom-gmail-card__details">
          {toList.length > 0 && (
            <div className="metabloom-gmail-card__detail-row">
              <dt>To</dt>
              <dd>{toList.join(', ')}</dd>
            </div>
          )}
          {ccList.length > 0 && (
            <div className="metabloom-gmail-card__detail-row">
              <dt>Cc</dt>
              <dd>{ccList.join(', ')}</dd>
            </div>
          )}
          {fromLabel && (
            <div className="metabloom-gmail-card__detail-row">
              <dt>From</dt>
              <dd>{fromLabel}</dd>
            </div>
          )}
          {subject && (
            <div className="metabloom-gmail-card__detail-row">
              <dt>Subject</dt>
              <dd>{subject}</dd>
            </div>
          )}
        </dl>
      )}

      {bodyText && (
        <div className="metabloom-gmail-card__body-wrap">
          <span className="metabloom-gmail-card__body-label">Message preview</span>
          <div className="metabloom-gmail-card__body">{bodyText}</div>
        </div>
      )}

      {snippetText && (
        <div className="metabloom-gmail-card__body-wrap">
          <span className="metabloom-gmail-card__body-label">Preview</span>
          <p className="metabloom-gmail-card__snippet">{snippetText}</p>
        </div>
      )}

      {message && (
        <p className="metabloom-gmail-card__summary">{message}</p>
      )}

      {errorText && (
        <p className="metabloom-gmail-card__error" role="alert">
          {errorText}
        </p>
      )}

      {hasActions && (
        <div className="metabloom-gmail-card__actions">
          {canConfirmSend && (
            <>
              <button
                type="button"
                className="metabloom-gmail-card__btn metabloom-gmail-card__btn--primary"
                disabled={actionDisabled}
                onClick={() => handleConfirmProposal({ saveAsDraft: false })}
              >
                {busyAction === 'send' ? 'Sending…' : 'Send email'}
              </button>
              <button
                type="button"
                className="metabloom-gmail-card__btn"
                disabled={actionDisabled}
                onClick={() => handleConfirmProposal({ saveAsDraft: true })}
              >
                {busyAction === 'save_draft' ? 'Saving draft…' : 'Save as draft'}
              </button>
              <button
                type="button"
                className="metabloom-gmail-card__btn"
                disabled={actionDisabled}
                onClick={handleDismiss}
              >
                Dismiss
              </button>
            </>
          )}

          {canConfirmTrash && (
            <>
              <button
                type="button"
                className="metabloom-gmail-card__btn metabloom-gmail-card__btn--danger"
                disabled={actionDisabled}
                onClick={() => handleConfirmProposal({ saveAsDraft: false })}
              >
                {busyAction === 'trash' ? 'Moving to Trash…' : 'Move to Trash'}
              </button>
              <button
                type="button"
                className="metabloom-gmail-card__btn"
                disabled={actionDisabled}
                onClick={handleDismiss}
              >
                Dismiss
              </button>
            </>
          )}

          {canManageDraft && (
            <>
              <button
                type="button"
                className="metabloom-gmail-card__btn metabloom-gmail-card__btn--primary"
                disabled={actionDisabled}
                onClick={handleSendDraft}
              >
                {busyAction === 'send_draft' ? 'Sending draft…' : 'Send draft'}
              </button>
              <button
                type="button"
                className="metabloom-gmail-card__btn"
                disabled={actionDisabled}
                onClick={handleDiscardDraft}
              >
                {busyAction === 'discard_draft' ? 'Discarding…' : 'Discard draft'}
              </button>
            </>
          )}

          {canUndo && (
            <button
              type="button"
              className="metabloom-gmail-card__btn"
              disabled={actionDisabled}
              onClick={handleUndo}
            >
              {busyAction === 'undo' ? 'Undoing…' : 'Undo'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
