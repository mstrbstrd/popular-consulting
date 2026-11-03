import React from 'react';
import './OrbAppearance.css';

// Settings stay in their original owners. This disclosure never recreates the
// Orb, takes focus on hover, or makes the conversation inert.
const OrbAppearance = ({ children }) => {
  const [openMode, setOpenMode] = React.useState(null);
  const open = openMode !== null;
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const id = React.useId();
  const close = React.useCallback((restoreFocus = true) => {
    const ownsFocus = rootRef.current?.contains(document.activeElement);
    setOpenMode(null);
    if (restoreFocus && ownsFocus && triggerRef.current?.isConnected) {
      triggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  React.useLayoutEffect(() => {
    if (openMode === 'explicit') panelRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [openMode]);

  React.useEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    const page = root.closest('.orb-page');
    if (page) page.dataset.appearanceOpen = 'true';
    const outside = event => { if (!root.contains(event.target)) close(false); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      if (root.contains(document.activeElement)) event.preventDefault();
      close();
    };
    const resize = () => close(false);
    const viewport = window.visualViewport;
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    viewport?.addEventListener('resize', resize);
    return () => {
      if (page) delete page.dataset.appearanceOpen;
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
    };
  }, [open, close]);

  return (
    <div className="orb-appearance" ref={rootRef}
      onPointerEnter={event => {
        if (!open && event.pointerType === 'mouse'
          && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setOpenMode('hover');
      }}
      onPointerLeave={() => {
        if (openMode === 'hover' && !panelRef.current?.contains(document.activeElement)) close(false);
      }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(false); }}>
      <button type="button" className="orb-appearance__trigger" ref={triggerRef}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        onClick={() => { if (openMode === 'explicit') close(); else setOpenMode('explicit'); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" opacity=".65" />
        </svg>
        <span>Theme</span>
      </button>
      {open && (
        <dialog open ref={panelRef} id={id} className="orb-appearance__dialog" aria-modal="false" aria-labelledby={`${id}-title`}
          onCancel={event => { event.preventDefault(); close(); }}>
          <div className="orb-appearance__heading">
            <h2 id={`${id}-title`}>Theme</h2>
            <button type="button" className="orb-appearance__close" onClick={() => close()} aria-label="Close theme">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="orb-appearance__content">{typeof children === 'function' ? children({ close }) : children}</div>
        </dialog>
      )}
    </div>
  );
};

export default OrbAppearance;
