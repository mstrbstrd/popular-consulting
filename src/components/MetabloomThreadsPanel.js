import React from 'react';

// The sidebar docks wherever a 760px conversation still fits beside it. The
// thread owner uses the same breakpoint to decide whether a switch closes history.
export const METABLOOM_THREADS_DOCK_MIN_WIDTH = 1100;
const WIDE_QUERY = `(min-width: ${METABLOOM_THREADS_DOCK_MIN_WIDTH}px)`;
const WIDE_FALLBACK = METABLOOM_THREADS_DOCK_MIN_WIDTH;
export const isMetabloomThreadsDocked = () => window.matchMedia?.(WIDE_QUERY)?.matches ?? window.innerWidth >= WIDE_FALLBACK;
const TITLE_LIMIT = 160;
// Sidebar toggle: a panel with its left column marked, as in Claude's layout.
const SidebarIcon = () => <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <rect x="3" y="4" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
  <path d="M8 4v12" stroke="currentColor" strokeWidth="1.4" />
</svg>;
const NewChatIcon = () => <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" />
  <path d="M10 6.75v6.5M6.75 10h6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
</svg>;
const dateLabel = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { label: 'Unknown', full: 'Update time unavailable' };
  return {
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric',
      ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(date),
    full: new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit' }).format(date),
  };
};

// History owns presentation only. The parent owns thread data, persistence,
// request cancellation, and the paired conversation/workspace transition.
export default function MetabloomThreadsPanel({ expanded, onExpandedChange, items = [], activeThreadId,
  loading = false, busy = false, pending = false, error = '', saveStatus = '', onRetry, onRefresh,
  onNew, onOpen, onRename, onDelete, canSaveCopy = false, onSaveCopy }) {
  const id = React.useId();
  const [wide, setWide] = React.useState(() => window.matchMedia?.(WIDE_QUERY).matches ?? window.innerWidth >= WIDE_FALLBACK);
  const [editor, setEditor] = React.useState(null);
  const [title, setTitle] = React.useState('');
  const [operation, setOperation] = React.useState(null);
  const [localError, setLocalError] = React.useState('');
  const panelRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const newRef = React.useRef(null);
  const renameRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const restoreFocusRef = React.useRef(true);
  const moveFocusRef = React.useRef(false);
  const focusFrameRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  const operationRef = React.useRef(null);
  const moreButtonsRef = React.useRef(new Map());
  const latest = React.useRef(null);
  latest.current = { expanded, wide, busy, pending, loading, activeThreadId, onExpandedChange };
  const blocked = Boolean(busy || pending || loading || operation);
  const message = error || localError;

  React.useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current = null;
      window.cancelAnimationFrame(focusFrameRef.current);
    };
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia?.(WIDE_QUERY);
    const resize = () => {
      const next = media?.matches ?? window.innerWidth >= WIDE_FALLBACK;
      if (next === latest.current.wide) return;
      moveFocusRef.current = panelRef.current?.contains(document.activeElement) === true;
      restoreFocusRef.current = false;
      setWide(next);
    };
    media?.addEventListener?.('change', resize);
    window.addEventListener('resize', resize);
    return () => {
      media?.removeEventListener?.('change', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!expanded) return undefined;
    if (wide) {
      if (moveFocusRef.current) (renameRef.current || cancelRef.current || closeRef.current)?.focus({ preventScroll: true });
      moveFocusRef.current = false;
      return undefined;
    }
    const dialog = panelRef.current;
    const focused = document.activeElement;
    if (focused && focused !== document.body && !dialog.contains(focused)) openerRef.current = focused;
    else if (!openerRef.current?.isConnected) openerRef.current = triggerRef.current;
    restoreFocusRef.current = true;
    const viewport = window.visualViewport;
    const position = () => {
      if (viewport?.scale > 1.05) return;
      dialog.style.setProperty('--threads-viewport-width', `${viewport?.width || window.innerWidth}px`);
      dialog.style.setProperty('--threads-viewport-height', `${viewport?.height || window.innerHeight}px`);
      dialog.style.setProperty('--threads-viewport-left', `${viewport?.offsetLeft || 0}px`);
      dialog.style.setProperty('--threads-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    position();
    dialog.showModal();
    (renameRef.current || cancelRef.current || closeRef.current)?.focus({ preventScroll: true });
    moveFocusRef.current = false;
    window.addEventListener('resize', position);
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
      if (dialog.open) dialog.close();
      if (restoreFocusRef.current && openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    };
  }, [expanded, wide]);

  React.useLayoutEffect(() => {
    if (editor?.type === 'rename') { renameRef.current?.focus({ preventScroll: true }); renameRef.current?.select(); }
    if (editor?.type === 'delete') cancelRef.current?.focus({ preventScroll: true });
  }, [editor]);

  React.useEffect(() => {
    if (editor && !items.some(item => item.threadId === editor.threadId)) setEditor(null);
  }, [items, editor]);

  const closeEditor = () => {
    const button = moreButtonsRef.current.get(editor?.threadId);
    setEditor(null);
    setLocalError('');
    window.cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      (button?.isConnected ? button : newRef.current)?.focus({ preventScroll: true });
    });
  };
  const close = (restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    operationRef.current = null;
    setOperation(null);
    setEditor(null);
    setLocalError('');
    latest.current.onExpandedChange(false);
    if (wide && restoreFocus) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = window.requestAnimationFrame(() => {
        if (mountedRef.current && !latest.current.expanded) triggerRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const run = async (action, callback, accept) => {
    if (!mountedRef.current || operationRef.current || latest.current.busy || latest.current.loading
      || (latest.current.pending && action !== 'refresh') || typeof callback !== 'function') return;
    const token = {};
    operationRef.current = token;
    setOperation(action);
    setLocalError('');
    const current = () => mountedRef.current && operationRef.current === token;
    try {
      const accepted = await callback();
      if (!current()) return;
      if (accepted === true) accept?.();
      else setLocalError('This action could not be completed. Please try again.');
    } catch {
      if (current()) setLocalError('This action could not be completed. Please try again.');
    } finally {
      if (current()) { operationRef.current = null; setOperation(null); }
    }
  };
  const openThread = threadId => {
    if (threadId === activeThreadId) return;
    run('open', () => onOpen?.(threadId), () => { setEditor(null); if (!latest.current.wide) close(false); });
  };
  const newThread = () => run('new', onNew, () => { setEditor(null); if (!latest.current.wide) close(false); });
  const expand = event => {
    event.currentTarget.focus({ preventScroll: true });
    openerRef.current = event.currentTarget;
    restoreFocusRef.current = true;
    onExpandedChange(true);
  };
  const keyboard = event => {
    if (event.key !== 'Escape') return;
    if (editor) { event.preventDefault(); event.stopPropagation(); closeEditor(); }
    else if (wide) { event.preventDefault(); close(); }
  };
  const body = <>
    <div className="metabloom-threads__heading">
      {wide && <button ref={closeRef} type="button" className="metabloom-threads__icon metabloom-threads__toggle"
        aria-label="Collapse chats" title="Collapse sidebar" onClick={() => close()}><SidebarIcon /></button>}
      <h2 id={`${id}-title`}>Chats</h2>
      <button type="button" className="metabloom-threads__icon" aria-label="Refresh chats"
        disabled={Boolean(busy || loading || operation)} onClick={() => run('refresh', onRefresh)}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
          <path d="M16 7.5a6.3 6.3 0 1 0 .3 4M16 3.8v4.3h-4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {!wide && <button ref={closeRef} type="button" className="metabloom-threads__icon"
        aria-label="Close chats" onClick={() => close()}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
          <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>}
    </div>
    <div className="metabloom-threads__controls">
      <button ref={newRef} type="button" className="metabloom-threads__new" disabled={blocked} onClick={newThread}>
        <NewChatIcon /><span>New chat</span>
      </button>
      {saveStatus && <p id={`${id}-status`} className="metabloom-threads__status" role="status">{saveStatus}</p>}
      {pending && <p className="metabloom-threads__hint">Finish or stop the response to change chats.</p>}
      {(message || canSaveCopy) && <div className="metabloom-threads__error">
        {message && <p id={`${id}-error`} role="alert">{message}</p>}
        <div className="metabloom-threads__actions">
          {onRetry && <button type="button" disabled={blocked} onClick={() => run('retry', onRetry)}>Retry</button>}
          {canSaveCopy && <button type="button" disabled={blocked} onClick={() => run('copy', onSaveCopy)}>Save as new chat</button>}
        </div>
      </div>}
    </div>
    <div className="metabloom-threads__body" aria-busy={loading}>
      {loading && <p className="metabloom-threads__empty" role="status">Loading chats…</p>}
      {!loading && !message && !items.length && <p className="metabloom-threads__empty">No saved chats yet. Start a new chat to begin.</p>}
      {!!items.length && <p className="metabloom-threads__section" aria-hidden="true">Recents</p>}
      {!!items.length && <table className="metabloom-threads__table">
        <caption className="metabloom-threads__sr-only">Saved chats</caption>
        <colgroup><col /><col className="metabloom-threads__date-column" /><col className="metabloom-threads__actions-column" /></colgroup>
        <thead><tr><th scope="col">Chat</th><th scope="col">Updated</th><th scope="col"><span className="metabloom-threads__sr-only">Actions</span></th></tr></thead>
        <tbody>{items.map(item => {
          const date = dateLabel(item.updatedAt);
          const selected = item.threadId === activeThreadId;
          const editing = editor?.threadId === item.threadId ? editor.type : null;
          return <React.Fragment key={item.threadId}>
            <tr data-current={selected ? 'true' : undefined}>
              <td><button type="button" className="metabloom-threads__open" aria-current={selected ? 'true' : undefined}
                aria-label={`Open chat: ${item.title}`} title={item.title} disabled={blocked} onClick={() => openThread(item.threadId)}>
                <span>{item.title}</span>
              </button></td>
              <td className="metabloom-threads__date"><time dateTime={item.updatedAt} title={date.full} aria-label={`Updated ${date.full}`}>{date.label}</time></td>
              <td><button type="button" className="metabloom-threads__icon" aria-label={`Actions for ${item.title}`}
                aria-expanded={Boolean(editing)} aria-controls={`${id}-${item.threadId}-actions`} disabled={blocked}
                ref={node => { if (node) moreButtonsRef.current.set(item.threadId, node); else moreButtonsRef.current.delete(item.threadId); }}
                onClick={() => { setLocalError(''); setEditor(editing ? null : { threadId: item.threadId, type: 'more' }); }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                  <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
                </svg>
              </button></td>
            </tr>
            {editing && <tr><td colSpan={3} className="metabloom-threads__editing-cell">
              <div id={`${id}-${item.threadId}-actions`} className="metabloom-threads__editing">
                {editing === 'more' && <div className="metabloom-threads__actions">
                  <button type="button" disabled={blocked} onClick={() => { setTitle(item.title); setEditor({ threadId: item.threadId, type: 'rename' }); }}>Rename</button>
                  <button type="button" className="metabloom-threads__danger" disabled={blocked}
                    onClick={() => setEditor({ threadId: item.threadId, type: 'delete' })}>Delete</button>
                </div>}
                {editing === 'rename' && <form onSubmit={event => {
                  event.preventDefault();
                  const value = title.trim();
                  if (value && value.length <= TITLE_LIMIT) run('rename', () => onRename?.(item.threadId, value), closeEditor);
                }}>
                  <label htmlFor={`${id}-rename`}>Chat title</label>
                  <input ref={renameRef} id={`${id}-rename`} value={title} maxLength={TITLE_LIMIT} autoComplete="off"
                    disabled={Boolean(busy || operation)} onChange={event => setTitle(event.target.value)} />
                  <div className="metabloom-threads__actions">
                    <button type="submit" disabled={blocked || !title.trim() || title.trim().length > TITLE_LIMIT}>Save title</button>
                    <button type="button" disabled={Boolean(busy || operation)} onClick={closeEditor}>Cancel</button>
                  </div>
                </form>}
                {editing === 'delete' && <div className="metabloom-threads__confirmation">
                  <p>Delete “{item.title}”?</p><p>This removes the saved chat. Saved work stays in your library.</p>
                  <div className="metabloom-threads__actions">
                    <button ref={cancelRef} type="button" disabled={Boolean(busy || operation)} onClick={closeEditor}>Cancel</button>
                    <button type="button" className="metabloom-threads__danger" disabled={blocked}
                      onClick={() => run('delete', () => onDelete?.(item.threadId), closeEditor)}>Delete chat</button>
                  </div>
                </div>}
              </div>
            </td></tr>}
          </React.Fragment>;
        })}</tbody>
      </table>}
    </div>
  </>;
  const trigger = <button ref={triggerRef} type="button" className="metabloom-threads__trigger" aria-expanded={expanded}
    aria-controls={`${id}-panel`} aria-haspopup={wide ? undefined : 'dialog'} aria-label={wide ? 'Expand chats' : 'Chats'}
    aria-describedby={message ? `${id}-error` : saveStatus ? `${id}-status` : undefined}
    data-error={message ? 'true' : undefined} title={message ? `Chats: ${message}` : wide ? 'Open sidebar' : 'Chats'} onClick={expand}>
    <SidebarIcon />{!wide && <span>Chats</span>}
  </button>;
  return <>
    {wide ? <aside ref={panelRef} id={`${id}-panel`} className="metabloom-threads metabloom-threads__dock"
      data-expanded={expanded ? 'true' : 'false'} aria-label="Chat history" onKeyDown={keyboard}>
      {expanded ? body : <>
        {trigger}
        <button ref={newRef} type="button" className="metabloom-threads__rail-new" aria-label="New chat" title="New chat" disabled={blocked} onClick={newThread}><NewChatIcon /></button>
        {saveStatus && <p id={`${id}-status`} role="status" className="metabloom-threads__sr-only">{saveStatus}</p>}
        {message && <p id={`${id}-error`} role="alert" className="metabloom-threads__sr-only">{message}</p>}
      </>}
    </aside> : <>
      <div className="metabloom-threads__floating">
        {trigger}
        {!expanded && saveStatus && <p id={`${id}-status`} role="status" className="metabloom-threads__sr-only">{saveStatus}</p>}
        {!expanded && message && <p id={`${id}-error`} role="alert" className="metabloom-threads__sr-only">{message}</p>}
      </div>
      {expanded && <dialog ref={panelRef} id={`${id}-panel`} className="metabloom-threads metabloom-threads__drawer"
        aria-label="Chat history" aria-modal="true" onKeyDown={keyboard} onCancel={event => { event.preventDefault(); close(); }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}>{body}</dialog>}
    </>}
  </>;
}
