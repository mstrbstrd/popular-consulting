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
  if (error?.code === 'saved_work_unavailable') return 'Saved work is not available yet. Refresh the list to try again.';
  if (error?.code === 'saved_work_conflict') return 'This item changed elsewhere. Refresh the list before making more changes.';
  if (error?.code === 'saved_work_timeout' && action === 'save') return 'This save could not be confirmed. Retry the same save, or refresh the list to check it.';
  if (error?.code === 'saved_work_source_expired') return 'This temporary result has expired. If a save was interrupted, refresh the list to check whether it completed.';
  if (error?.code?.startsWith('saved_work_') && typeof error.message === 'string' && error.message.length <= 240) return error.message;
  return 'Saved work could not complete this request. Please try again.';
};
const mergeItems = (current, next) => Array.from(new Map([...current, ...next].map(item => [item.artifactId, item])).values());
const updatedDate = value => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));

// The parent mounts this panel only while open. Saved content stays server-owned;
// the panel sends only a source locator and an optional captured input scenario.
export default function MetabloomSavedWorkPanel({ source, onOpen, onSaved, onClose }) {
  const id = React.useId();
  const dialogRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const refreshButtonRef = React.useRef(null);
  const renameInputRef = React.useRef(null);
  const deleteCancelRef = React.useRef(null);
  const restoreActionRef = React.useRef(null);
  const mountedRef = React.useRef(false);
  const closingRef = React.useRef(false);
  const requestRef = React.useRef(null);
  const saveAttemptRef = React.useRef(null);
  const callbacksRef = React.useRef(null);
  callbacksRef.current = { onOpen, onSaved, onClose };
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
      await accept(result, current);
      return current();
    } catch (failure) {
      if (!current()) return false;
      setError(errorText(failure, input.action));
      if (failure?.code === 'saved_work_unavailable') setUnavailable(true);
      if (['saved_work_conflict', 'saved_work_not_found'].includes(failure?.code)) setNeedsRefresh(true);
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
      setNeedsRefresh(false);
    }
  }), [run]);

  React.useEffect(() => { loadList(); }, [loadList]);

  const editingId = editing?.artifactId;
  const deletingId = deleting?.artifactId;
  React.useLayoutEffect(() => {
    if (busy) return;
    if (editingId) {
      renameInputRef.current?.focus({ preventScroll: true });
      renameInputRef.current?.select();
    } else if (deletingId) deleteCancelRef.current?.focus({ preventScroll: true });
    else if (restoreActionRef.current) {
      const target = restoreActionRef.current;
      restoreActionRef.current = null;
      if (target.action === 'refresh') refreshButtonRef.current?.focus({ preventScroll: true });
      else dialogRef.current?.querySelector(`[data-saved-item="${target.artifactId}"] [data-saved-action="${target.action}"]`)?.focus({ preventScroll: true });
    }
  }, [editingId, deletingId, busy]);

  const save = () => {
    if (requestRef.current || savedArtifact || !loaded || unavailable) return;
    if (!saveAttemptRef.current) {
      if (!source?.source || !source.title?.trim() || source.title.trim().length > TITLE_LIMIT) return;
      try {
        const captured = { action: 'save', requestId: newRequestId(), title: source.title.trim(),
          source: { ...source.source }, ...(source.scenario ? { scenario: { inputs: { ...source.scenario.inputs } } } : {}) };
        saveAttemptRef.current = captured;
        setSaveAttempt(captured);
      } catch {
        setError('This save could not be started. Please try again.');
        return;
      }
    }
    // Keep this exact request, including its UUID, across uncertain failures.
    run(saveAttemptRef.current, async (result, current) => {
      setSavedArtifact(result.artifact);
      setItems(previous => [result.artifact, ...previous.filter(item => item.artifactId !== result.artifact.artifactId)]);
      setNotice(`Saved “${result.artifact.title}”.`);
      try { await callbacksRef.current.onSaved?.(result.artifact); }
      catch { if (current()) setError('Your work was saved, but this view could not update. Refresh the list to see it.'); }
    });
  };

  const open = item => run({ action: 'open', artifactId: item.artifactId }, async (result, current) => {
    let accepted = false;
    try { accepted = await callbacksRef.current.onOpen?.(result); } catch { /* The saved copy remains unchanged. */ }
    if (!current()) return;
    if (accepted === true) close();
    else setError('This saved item could not be opened in the current conversation. Your saved copy is unchanged. Please try again.');
  });

  const rename = event => {
    event.preventDefault();
    const title = editing?.title.trim();
    if (!editing || !title || title.length > TITLE_LIMIT || needsRefresh) return;
    run({ action: 'rename', artifactId: editing.artifactId, expectedVersion: editing.version, title }, result => {
      setItems(current => current.map(item => item.artifactId === result.artifact.artifactId ? result.artifact : item));
      setSavedArtifact(current => current?.artifactId === result.artifact.artifactId ? result.artifact : current);
      setEditing(null);
      setNotice(`Renamed to “${result.artifact.title}”.`);
    });
  };

  const remove = () => {
    if (!deleting || needsRefresh) return;
    const item = deleting;
    run({ action: 'delete', artifactId: item.artifactId, expectedVersion: item.version }, result => {
      setItems(current => current.filter(entry => entry.artifactId !== result.artifactId));
      restoreActionRef.current = { action: 'refresh' };
      setDeleting(null);
      if (savedArtifact?.artifactId === result.artifactId) {
        setSavedArtifact(null);
        saveAttemptRef.current = null;
        setSaveAttempt(null);
      }
      setNotice(`Deleted “${item.title}”.`);
    });
  };

  const savingTitle = saveAttempt?.title || source?.title;
  const canSave = Boolean(saveAttempt || (source?.source && source.title?.trim() && source.title.trim().length <= TITLE_LIMIT));
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
        {savingTitle && <section className="metabloom-saved-work__current" aria-labelledby={`${id}-current`}>
          <div><h3 id={`${id}-current`}>Current work</h3><p>{savingTitle}</p></div>
          <button type="button" disabled={!canSave || !loaded || Boolean(busy) || unavailable || Boolean(savedArtifact)} onClick={save}>
            {busy?.action === 'save' ? 'Saving…' : savedArtifact ? 'Saved' : saveAttempt ? 'Retry save' : 'Save current work'}
          </button>
          {source?.hint && <p className="metabloom-saved-work__hint">{source.hint}</p>}
          {saveAttempt && !savedArtifact && !busy && <p className="metabloom-saved-work__hint">Retry keeps the same captured work and inputs.</p>}
        </section>}
        <section aria-labelledby={`${id}-items`} aria-busy={busy?.action === 'list'}>
          <div className="metabloom-saved-work__list-heading">
            <h3 id={`${id}-items`}>Your saved items</h3>
            <button ref={refreshButtonRef} type="button" disabled={Boolean(busy)} onClick={() => loadList()}>Refresh list</button>
          </div>
          {needsRefresh && <p className="metabloom-saved-work__hint">Refresh the list before renaming or deleting saved items.</p>}
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
                <button type="button" data-saved-action="rename" disabled={Boolean(busy) || needsRefresh || Boolean(editing || deleting)} onClick={() => {
                  restoreActionRef.current = { artifactId: item.artifactId, action: 'rename' };
                  setEditing({ artifactId: item.artifactId, version: item.version, title: item.title });
                }} aria-label={`Rename ${item.title}`}>Rename</button>
                <button type="button" data-saved-action="delete" disabled={Boolean(busy) || needsRefresh || Boolean(editing || deleting)} onClick={() => {
                  restoreActionRef.current = { artifactId: item.artifactId, action: 'delete' };
                  setDeleting(item);
                }} aria-label={`Delete ${item.title}`}>Delete</button>
              </div>}
            </li>)}
          </ul>}
          {nextCursor && <button type="button" className="metabloom-saved-work__more" disabled={Boolean(busy)} onClick={() => loadList(nextCursor)}>Load more</button>}
        </section>
      </div>
    </dialog>
  );
}
