import React from 'react';
import { requestMetabloomSavedWork } from './metabloomSavedWorkApiClient';
import './MetabloomSavedWorkPanel.css';

const TITLE_LIMIT = 160;
const PAGE_SIZE = 20;
const newRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const errorText = (error, action) => {
  if (['revise', 'restore'].includes(action) && ['saved_work_timeout', 'saved_work_unavailable'].includes(error?.code))
    return 'This revision update could not be confirmed. Check History before trying again.';
  if (['revise', 'restore'].includes(action) && error?.code === 'saved_work_invalid')
    return 'This content could not be saved as a new revision. It may already be current.';
  if (error?.code === 'saved_work_unavailable') return 'Saved work is not available yet. Refresh the list to try again.';
  if (error?.code === 'saved_work_conflict') return 'This item changed elsewhere. Refresh the list before making more changes.';
  if (error?.code === 'saved_work_timeout' && action === 'save') return 'This save could not be confirmed. Retry the same save, or refresh the list to check it.';
  if (error?.code === 'saved_work_source_expired') return 'This temporary result has expired. If a save was interrupted, refresh the list to check whether it completed.';
  if (error?.code?.startsWith('saved_work_') && typeof error.message === 'string' && error.message.length <= 240) return error.message;
  return 'Saved work could not complete this request. Please try again.';
};
const mergeItems = (current, next) => Array.from(new Map([...current, ...next].map(item => [item.artifactId, item])).values());
const updatedDate = value => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
const revisionDate = value => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const copySource = source => ({ source: { ...source.source }, ...(source.scenario ? { scenario: { inputs: { ...source.scenario.inputs } } } : {}) });

// The parent mounts this panel only while open. Saved content stays server-owned;
// the panel sends only a source locator and an optional captured input scenario.
export default function MetabloomSavedWorkPanel({ source, saveContext, activeArtifact, onOpen, onSaved, onRevisionSaved, onRenamed, onDeleted, onClose }) {
  const id = React.useId();
  const dialogRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const refreshButtonRef = React.useRef(null);
  const renameInputRef = React.useRef(null);
  const deleteCancelRef = React.useRef(null);
  const restoreCancelRef = React.useRef(null);
  const receiptRef = React.useRef(null);
  const restoreActionRef = React.useRef(null);
  const mountedRef = React.useRef(false);
  const closingRef = React.useRef(false);
  const requestRef = React.useRef(null);
  const saveAttemptRef = React.useRef(null);
  const refreshRequiredRef = React.useRef(null);
  const callbacksRef = React.useRef(null);
  callbacksRef.current = { onOpen, onSaved, onRevisionSaved, onRenamed, onDeleted, onClose };
  const [items, setItems] = React.useState([]);
  const [nextCursor, setNextCursor] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [unavailable, setUnavailable] = React.useState(false);
  const [needsRefresh, setNeedsRefresh] = React.useState(false);
  const [saveAttempt, setSaveAttempt] = React.useState(null);
  const [savedArtifact, setSavedArtifact] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);
  const [history, setHistory] = React.useState(null);
  const [restoreTarget, setRestoreTarget] = React.useState(null);
  const [receipt, setReceipt] = React.useState(null);
  const [deletedIds, setDeletedIds] = React.useState(() => new Set());

  const close = React.useCallback(() => {
    if (!mountedRef.current || closingRef.current) return;
    closingRef.current = true;
    requestRef.current?.abort();
    if (dialogRef.current?.open) dialogRef.current.close();
    callbacksRef.current.onClose?.();
  }, []);

  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const viewport = window.visualViewport;
    const position = () => {
      if (viewport?.scale > 1.05) return;
      dialog.style.setProperty('--saved-work-viewport-width', `${viewport?.width || window.innerWidth}px`);
      dialog.style.setProperty('--saved-work-viewport-height', `${viewport?.height || window.innerHeight}px`);
      dialog.style.setProperty('--saved-work-viewport-left', `${viewport?.offsetLeft || 0}px`);
      dialog.style.setProperty('--saved-work-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    mountedRef.current = true;
    closingRef.current = false;
    position();
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      mountedRef.current = false;
      closingRef.current = true;
      requestRef.current?.abort();
      requestRef.current = null;
      window.removeEventListener('resize', position);
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const run = React.useCallback(async (input, accept) => {
    if (!mountedRef.current || closingRef.current || requestRef.current) return false;
    const controller = new AbortController();
    requestRef.current = controller;
    const current = () => mountedRef.current && !closingRef.current
      && requestRef.current === controller && !controller.signal.aborted;
    setBusy({ action: input.action, artifactId: input.artifactId });
    setError('');
    setNotice('');
    try {
      const result = await requestMetabloomSavedWork(input, { signal: controller.signal });
      if (!current()) return false;
      setUnavailable(false);
      await accept(result, current, controller.signal);
      return current();
    } catch (failure) {
      if (!current()) return false;
      setError(errorText(failure, input.action));
      if (failure?.code === 'saved_work_unavailable') setUnavailable(true);
      if (['saved_work_conflict', 'saved_work_not_found'].includes(failure?.code)
        || (['revise', 'restore'].includes(input.action) && ['saved_work_timeout', 'saved_work_unavailable'].includes(failure?.code))) {
        refreshRequiredRef.current = input.artifactId || null;
        setNeedsRefresh(true);
      }
      return false;
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current && !closingRef.current) setBusy(null);
      }
    }
  }, []);

  const loadList = React.useCallback((after = null) => run({ action: 'list', limit: PAGE_SIZE, ...(after ? { after } : {}) }, result => {
    setItems(current => after ? mergeItems(current, result.items) : result.items);
    setNextCursor(result.nextCursor);
    setLoaded(true);
    if (!after) {
      restoreActionRef.current = null;
      setEditing(null);
      setDeleting(null);
      setRestoreTarget(null);
      setHistory(null);
      refreshRequiredRef.current = null;
      setNeedsRefresh(false);
    }
  }), [run]);

  React.useEffect(() => { loadList(); }, [loadList]);

  const editingId = editing?.artifactId;
  const deletingId = deleting?.artifactId;
  const restoreKey = restoreTarget && `${restoreTarget.artifactId}:${restoreTarget.revision}`;
  React.useLayoutEffect(() => {
    if (busy) return;
    if (editingId) {
      renameInputRef.current?.focus({ preventScroll: true });
      renameInputRef.current?.select();
    } else if (deletingId) deleteCancelRef.current?.focus({ preventScroll: true });
    else if (restoreKey) restoreCancelRef.current?.focus({ preventScroll: true });
    else if (restoreActionRef.current) {
      const target = restoreActionRef.current;
      restoreActionRef.current = null;
      if (target.action === 'refresh') refreshButtonRef.current?.focus({ preventScroll: true });
      else if (target.action === 'receipt') receiptRef.current?.focus({ preventScroll: true });
      else dialogRef.current?.querySelector(`[data-saved-item="${target.artifactId}"] [data-saved-action="${target.action}"]`)?.focus({ preventScroll: true });
    }
  }, [editingId, deletingId, restoreKey, busy]);

  const rememberArtifact = artifact => {
    setItems(current => current.some(item => item.artifactId === artifact.artifactId)
      ? current.map(item => item.artifactId === artifact.artifactId ? artifact : item) : [artifact, ...current]);
    setSavedArtifact(current => current?.artifactId === artifact.artifactId ? artifact : current);
    setHistory(current => current?.artifact.artifactId === artifact.artifactId ? { ...current, artifact } : current);
  };

  const loadHistory = (artifactId, beforeRevision = null) => run({ action: 'history', artifactId, limit: PAGE_SIZE,
    ...(beforeRevision ? { beforeRevision } : {}) }, result => {
    rememberArtifact(result.artifact);
    setHistory(current => ({ ...result, items: beforeRevision && current?.artifact.artifactId === artifactId
      ? Array.from(new Map([...current.items, ...result.items].map(entry => [entry.revision, entry])).values()).sort((a, b) => b.revision - a.revision)
      : result.items }));
    if (!beforeRevision) {
      setRestoreTarget(null);
      if (refreshRequiredRef.current === artifactId) {
        refreshRequiredRef.current = null;
        setNeedsRefresh(false);
      }
    }
  });

  const sendCapturedSave = captured => {
    // Keep the request, UUID, and opaque origin together across uncertain
    // failures, even when a later revision is opened while this modal stays up.
    run(captured.request, async (result, current) => {
      setSavedArtifact(result.artifact);
      setItems(previous => [result.artifact, ...previous.filter(item => item.artifactId !== result.artifact.artifactId)]);
      setNotice(`Saved “${result.artifact.title}”.`);
      try {
        if (captured.context === undefined) await callbacksRef.current.onSaved?.(result.artifact);
        else await callbacksRef.current.onSaved?.(result.artifact, captured.context);
      }
      catch { if (current()) setError('Your work was saved, but this view could not update. Refresh the list to see it.'); }
    });
  };

  const save = () => {
    const previous = saveAttemptRef.current;
    if (requestRef.current || !loaded || unavailable || (previous && !savedArtifact)
      || (savedArtifact && previous?.context === saveContext)) return;
    if (!source?.source || !source.title?.trim() || source.title.trim().length > TITLE_LIMIT) return;
    try {
      const captured = { context: saveContext,
        request: { action: 'save', requestId: newRequestId(), title: source.title.trim(), ...copySource(source) } };
      saveAttemptRef.current = captured;
      setSaveAttempt(captured);
      setSavedArtifact(null);
      sendCapturedSave(captured);
    } catch {
      setError('This save could not be started. Please try again.');
    }
  };

  const retrySave = () => {
    if (!saveAttemptRef.current || savedArtifact || !loaded || unavailable) return;
    sendCapturedSave(saveAttemptRef.current);
  };

  const open = (item, revision) => run({ action: 'open', artifactId: item.artifactId, ...(revision ? { revision } : {}) }, async (result, current) => {
    rememberArtifact(result.artifact);
    let accepted = false;
    try { accepted = await callbacksRef.current.onOpen?.(result); } catch { /* The saved copy remains unchanged. */ }
    if (!current()) return;
    if (accepted === true) close();
    else setError('This saved item could not be opened in the current conversation. Your saved copy is unchanged. Please try again.');
  });

  const acceptRevisionOpen = async (result, current, confirmed) => {
    rememberArtifact(result.artifact);
    let accepted = false;
    try { accepted = await callbacksRef.current.onOpen?.(result); } catch { /* The confirmed mutation is retained. */ }
    if (!current()) return;
    setReceipt(value => value?.artifact.artifactId === confirmed.artifact.artifactId
      && value.artifact.headRevision === confirmed.artifact.headRevision ? { ...value, hydration: accepted === true ? 'ready' : 'failed' } : value);
    if (accepted !== true) setError(`Revision ${confirmed.artifact.headRevision} is saved, but it could not be opened in the current conversation. Retry open to continue.`);
  };

  const reviseOrRestore = (input, operation) => run(input, async (result, current, signal) => {
    const confirmed = { artifact: result.artifact, undo: result.undo, operation, restoredRevision: input.revision, hydration: 'opening' };
    setReceipt(confirmed);
    rememberArtifact(result.artifact);
    setHistory(null);
    setRestoreTarget(null);
    restoreActionRef.current = { action: 'receipt' };
    // This callback reports only the durable mutation. It does not imply that
    // the visible renderer has accepted the separately hydrated revision.
    try { await callbacksRef.current.onRevisionSaved?.(result.artifact); } catch { /* Open can still establish the confirmed content. */ }
    if (!current()) return;
    setBusy({ action: 'open', artifactId: result.artifact.artifactId });
    try {
      const reopened = await requestMetabloomSavedWork({ action: 'open', artifactId: result.artifact.artifactId,
        revision: result.artifact.headRevision }, { signal });
      if (current()) await acceptRevisionOpen(reopened, current, confirmed);
    } catch {
      if (!current()) return;
      setReceipt(value => value === confirmed ? { ...value, hydration: 'failed' } : value);
      setError(`Revision ${result.artifact.headRevision} is saved, but it could not be opened. Retry open to continue.`);
    }
  });

  const retryRevisionOpen = () => {
    if (!receipt) return;
    const confirmed = receipt;
    run({ action: 'open', artifactId: confirmed.artifact.artifactId, revision: confirmed.artifact.headRevision },
      (result, current) => acceptRevisionOpen(result, current, confirmed));
  };

  const rename = event => {
    event.preventDefault();
    const title = editing?.title.trim();
    if (!editing || !title || title.length > TITLE_LIMIT || needsRefresh) return;
    run({ action: 'rename', artifactId: editing.artifactId, expectedVersion: editing.version, title }, async (result, current) => {
      rememberArtifact(result.artifact);
      setEditing(null);
      setNotice(`Renamed to “${result.artifact.title}”.`);
      try { await callbacksRef.current.onRenamed?.(result.artifact); }
      catch { if (current()) setError('The saved item was renamed, but this view could not update. Refresh the list to continue.'); }
    });
  };

  const remove = () => {
    if (!deleting || needsRefresh) return;
    const item = deleting;
    run({ action: 'delete', artifactId: item.artifactId, expectedVersion: item.version }, async (result, current) => {
      setItems(current => current.filter(entry => entry.artifactId !== result.artifactId));
      restoreActionRef.current = { action: 'refresh' };
      setDeleting(null);
      setDeletedIds(previous => new Set([...previous, result.artifactId]));
      setHistory(value => value?.artifact.artifactId === result.artifactId ? null : value);
      setReceipt(value => value?.artifact.artifactId === result.artifactId ? null : value);
      if (savedArtifact?.artifactId === result.artifactId) {
        setSavedArtifact(null);
        saveAttemptRef.current = null;
        setSaveAttempt(null);
      }
      setNotice(`Deleted “${item.title}”.`);
      try { await callbacksRef.current.onDeleted?.(result.artifactId); }
      catch { if (current()) setError('The saved copy was deleted, but this view could not update. Refresh the list to continue.'); }
    });
  };

  const pendingSave = Boolean(saveAttempt && !savedArtifact);
  const sameSaveContext = Boolean(saveAttempt && saveAttempt.context === saveContext);
  const currentWorkSaved = Boolean(savedArtifact && sameSaveContext);
  const canSave = Boolean(source?.source && source.title?.trim() && source.title.trim().length <= TITLE_LIMIT);
  const associated = activeArtifact && !deletedIds.has(activeArtifact.artifactId)
    && activeArtifact.kind === source?.source?.kind ? activeArtifact : null;
  const associatedLatest = associated && items.find(item => item.artifactId === associated.artifactId);
  const associationStale = associatedLatest && associatedLatest.version > associated.version;
  const associatedHead = associated && Math.max(associated.headRevision, associatedLatest?.headRevision || 0);
  const hydrationPending = Boolean(receipt && associated && receipt.artifact.artifactId === associated.artifactId && receipt.hydration !== 'ready');
  const knownUndoVersion = receipt && Math.max(receipt.artifact.version,
    ...items.filter(item => item.artifactId === receipt.artifact.artifactId).map(item => item.version),
    ...(activeArtifact?.artifactId === receipt.artifact.artifactId ? [activeArtifact.version] : []));
  const undoStale = receipt?.undo && knownUndoVersion !== receipt.undo.expectedVersion;
  return (
    <dialog ref={dialogRef} className="metabloom-saved-work" aria-labelledby={`${id}-title`}
      onClose={event => { if (!event.currentTarget.open) close(); }} onCancel={event => { event.preventDefault(); close(); }}>
      <header className="metabloom-saved-work__header">
        <h2 id={`${id}-title`}>Saved work</h2>
        <button ref={closeButtonRef} type="button" onClick={close} aria-label="Close saved work">×</button>
      </header>
      {(error || notice) && <div className="metabloom-saved-work__feedback">
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>}
      <div className="metabloom-saved-work__body">
        {source?.title && <section className="metabloom-saved-work__current" aria-labelledby={`${id}-current`}>
          <div><h3 id={`${id}-current`}>Current work</h3><p>{source.title}</p></div>
          <div className="metabloom-saved-work__actions">
            {associated && <button type="button" disabled={!loaded || Boolean(busy) || unavailable || needsRefresh || hydrationPending || associationStale} onClick={() => {
              reviseOrRestore({ action: 'revise', artifactId: associated.artifactId, expectedVersion: associated.version, ...copySource(source) }, 'revise');
            }}>{busy?.action === 'revise' ? 'Saving changes…' : 'Save changes'}</button>}
            <button type="button" disabled={!canSave || !loaded || Boolean(busy) || unavailable || pendingSave || currentWorkSaved} onClick={save}>
              {busy?.action === 'save' && sameSaveContext ? 'Saving…' : currentWorkSaved ? 'Saved' : associated ? 'Save as new' : 'Save current work'}
            </button>
          </div>
          {source?.hint && <p className="metabloom-saved-work__hint">{source.hint}</p>}
          {associated && <p className="metabloom-saved-work__hint">Save changes to “{associatedLatest?.title || associated.title}”. You are working from revision {associated.revision}{associated.revision !== associatedHead ? `; the latest is revision ${associatedHead}` : ''}.</p>}
          {associationStale && <p className="metabloom-saved-work__hint">A newer saved version is available. Open it or save this work as new.</p>}
          {pendingSave && !sameSaveContext && <p className="metabloom-saved-work__hint">Complete the captured save before saving a new copy of this work.</p>}
        </section>}
        {pendingSave && <section className="metabloom-saved-work__current" aria-labelledby={`${id}-captured-save`}>
          <div><h3 id={`${id}-captured-save`}>Captured save</h3><p>{saveAttempt.request.title}</p></div>
          <button type="button" disabled={!loaded || Boolean(busy) || unavailable} onClick={retrySave}>Retry captured save: {saveAttempt.request.title}</button>
          {!busy && <p className="metabloom-saved-work__hint">Retry keeps the same captured work and inputs.</p>}
        </section>}
        {receipt && <section ref={receiptRef} tabIndex={-1} className="metabloom-saved-work__receipt" aria-label="Confirmed revision">
          <h3>{items.find(item => item.artifactId === receipt.artifact.artifactId)?.title || receipt.artifact.title}</h3>
          <p role="status">{receipt.operation === 'undo' ? 'Undo saved' : receipt.operation === 'restore' ? `Restored revision ${receipt.restoredRevision}` : 'Changes saved'} as revision {receipt.artifact.headRevision}.
            {receipt.hydration === 'opening' ? ' Opening this revision…' : receipt.hydration === 'ready' ? ' This revision is now open.' : ' You can retry opening this revision.'}</p>
          <div className="metabloom-saved-work__actions">
            {receipt.operation !== 'undo' && <button type="button" disabled={Boolean(busy) || needsRefresh || undoStale} onClick={() => {
              reviseOrRestore({ action: 'restore', ...receipt.undo }, 'undo');
            }}>Undo last saved change</button>}
            {receipt.hydration !== 'ready' && <button type="button" disabled={Boolean(busy)} onClick={retryRevisionOpen}>Retry open</button>}
            {receipt.hydration === 'ready' && <button type="button" disabled={Boolean(busy)} onClick={close}>Continue editing</button>}
          </div>
          {undoStale && receipt.operation !== 'undo' && <p className="metabloom-saved-work__hint">A newer change prevents Undo. You can choose an earlier revision in History.</p>}
        </section>}
        <section aria-labelledby={`${id}-items`} aria-busy={busy?.action === 'list'}>
          <div className="metabloom-saved-work__list-heading">
            <h3 id={`${id}-items`}>Your saved items</h3>
            <button ref={refreshButtonRef} type="button" disabled={Boolean(busy)} onClick={() => loadList()}>Refresh list</button>
          </div>
          {needsRefresh && <p className="metabloom-saved-work__hint">Refresh the list or this item's History before making more saved changes.</p>}
          {busy?.action === 'list' && <p role="status">{loaded ? 'Loading saved work…' : 'Loading your saved work…'}</p>}
          {loaded && !items.length && !error && <p className="metabloom-saved-work__empty">No saved work yet.</p>}
          {items.length > 0 && <ul className="metabloom-saved-work__items">
            {items.map(item => <li key={item.artifactId} data-saved-item={item.artifactId}>
              <h4>{item.title}</h4>
              <p className="metabloom-saved-work__metadata">{item.kind === 'research' ? 'Research' : 'Component'} · Updated <time dateTime={item.updatedAt}>{updatedDate(item.updatedAt)}</time></p>
              {editingId === item.artifactId ? <form onSubmit={rename} aria-label={`Rename ${item.title}`}>
                <label htmlFor={`${id}-rename`}>New name</label>
                <input ref={renameInputRef} id={`${id}-rename`} type="text" value={editing.title} maxLength={TITLE_LIMIT}
                  disabled={Boolean(busy)} onChange={event => setEditing(current => ({ ...current, title: event.target.value }))} />
                <div className="metabloom-saved-work__actions">
                  <button type="submit" disabled={Boolean(busy) || needsRefresh || !editing.title.trim() || editing.title.trim() === item.title}>{busy?.action === 'rename' ? 'Renaming…' : 'Save name'}</button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => setEditing(null)}>Cancel rename</button>
                </div>
              </form> : deletingId === item.artifactId ? <div className="metabloom-saved-work__confirmation" role="group" aria-label={`Confirm deletion of ${item.title}`}>
                <p>Delete this saved copy? It will be removed from Saved work.</p>
                <div className="metabloom-saved-work__actions">
                  <button type="button" disabled={Boolean(busy) || needsRefresh} onClick={remove}>{busy?.action === 'delete' ? 'Deleting…' : 'Delete saved copy'}</button>
                  <button ref={deleteCancelRef} type="button" disabled={Boolean(busy)} onClick={() => setDeleting(null)}>Keep saved copy</button>
                </div>
              </div> : <div className="metabloom-saved-work__actions">
                <button type="button" disabled={Boolean(busy)} onClick={() => open(item)} aria-label={`Open ${item.title}`}>{busy?.action === 'open' && busy.artifactId === item.artifactId ? 'Opening…' : 'Open'}</button>
                <button type="button" data-saved-action="history" disabled={Boolean(busy) || Boolean(editing || deleting || restoreTarget)} aria-expanded={history?.artifact.artifactId === item.artifactId} onClick={() => {
                  if (history?.artifact.artifactId === item.artifactId) setHistory(null);
                  else loadHistory(item.artifactId);
                }} aria-label={`${history?.artifact.artifactId === item.artifactId ? 'Hide history of' : 'History of'} ${item.title}`}>History</button>
                <button type="button" data-saved-action="rename" disabled={Boolean(busy) || needsRefresh || Boolean(editing || deleting || restoreTarget)} onClick={() => {
                  restoreActionRef.current = { artifactId: item.artifactId, action: 'rename' };
                  setEditing({ artifactId: item.artifactId, version: item.version, title: item.title });
                }} aria-label={`Rename ${item.title}`}>Rename</button>
                <button type="button" data-saved-action="delete" disabled={Boolean(busy) || needsRefresh || Boolean(editing || deleting || restoreTarget)} onClick={() => {
                  restoreActionRef.current = { artifactId: item.artifactId, action: 'delete' };
                  setDeleting(item);
                }} aria-label={`Delete ${item.title}`}>Delete</button>
              </div>}
              {busy?.action === 'history' && busy.artifactId === item.artifactId && <p role="status">Loading revision history…</p>}
              {history?.artifact.artifactId === item.artifactId && <section className="metabloom-saved-work__history" aria-label={`History of ${item.title}`}>
                <div className="metabloom-saved-work__list-heading"><h5>Revision history</h5>
                  <button type="button" disabled={Boolean(busy)} onClick={() => loadHistory(item.artifactId)}>Refresh history</button>
                </div>
                <p className="metabloom-saved-work__hint">Current revision: {history.artifact.headRevision}. Opening history does not replace it.</p>
                <ol>
                  {history.items.map(entry => <li key={entry.revision}>
                    <div><strong>Revision {entry.revision}{entry.revision === history.artifact.headRevision ? ' · Current' : ''}</strong>
                      <time dateTime={entry.createdAt}>{revisionDate(entry.createdAt)}</time></div>
                    <div className="metabloom-saved-work__actions">
                      <button type="button" disabled={Boolean(busy)} onClick={() => open(item, entry.revision)} aria-label={`Open revision ${entry.revision} of ${item.title}`}>Open revision</button>
                      {entry.revision !== history.artifact.headRevision && <button type="button" data-saved-action={`restore-${entry.revision}`} disabled={Boolean(busy) || needsRefresh || Boolean(editing || deleting || restoreTarget)} onClick={() => {
                        restoreActionRef.current = { artifactId: item.artifactId, action: `restore-${entry.revision}` };
                        setRestoreTarget({ artifactId: item.artifactId, revision: entry.revision, expectedVersion: history.artifact.version });
                      }} aria-label={`Restore revision ${entry.revision} of ${item.title}`}>Restore</button>}
                    </div>
                    {restoreTarget?.artifactId === item.artifactId && restoreTarget.revision === entry.revision && <div className="metabloom-saved-work__confirmation" role="group" aria-label={`Confirm restore of revision ${entry.revision}`}>
                      <p>Make revision {entry.revision} current? This creates a new revision and keeps the existing history.</p>
                      <div className="metabloom-saved-work__actions">
                        <button type="button" disabled={Boolean(busy) || needsRefresh} onClick={() => reviseOrRestore({ action: 'restore', ...restoreTarget }, 'restore')}>Restore as current</button>
                        <button ref={restoreCancelRef} type="button" disabled={Boolean(busy)} onClick={() => setRestoreTarget(null)}>Cancel restore</button>
                      </div>
                    </div>}
                  </li>)}
                </ol>
                {history.nextBeforeRevision && <button type="button" disabled={Boolean(busy)} onClick={() => loadHistory(item.artifactId, history.nextBeforeRevision)}>Load older revisions</button>}
              </section>}
            </li>)}
          </ul>}
          {nextCursor && <button type="button" className="metabloom-saved-work__more" disabled={Boolean(busy)} onClick={() => loadList(nextCursor)}>Load more</button>}
        </section>
      </div>
    </dialog>
  );
}
