import React from 'react';
import './OrbAppearance.css';

// Settings stay in their original owners. This component only controls their
// disclosure, so opening it never recreates the Orb or the shared background.
const OrbAppearance = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const disposingRef = React.useRef(false);
  const id = React.useId();
  const close = React.useCallback(() => {
    if (panelRef.current?.open) panelRef.current.close();
    setOpen(false);
    if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const navigation = trigger.closest('.nav-pill');
    const page = trigger.closest('.orb-page');
    const viewport = window.visualViewport;
    disposingRef.current = false;
    if (page) page.dataset.appearanceOpen = 'true';
    // Native top-layer placement avoids the transformed navigation's stacking
    // context and makes the rest of the app inert while settings are open.
    panel.showModal();
    let frame = 0;
    const position = () => {
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const safe = getComputedStyle(trigger);
      const leftGutter = Math.max(12, parseFloat(safe.getPropertyValue('--orb-safe-left')) || 0);
      const rightGutter = Math.max(12, parseFloat(safe.getPropertyValue('--orb-safe-right')) || 0);
      const bottomGutter = Math.max(12, parseFloat(safe.getPropertyValue('--orb-safe-bottom')) || 0);
      const bottom = viewportTop + height - bottomGutter;
      const top = Math.min(bottom, Math.max(viewportTop + 12,
        (navigation?.getBoundingClientRect().bottom || trigger.getBoundingClientRect().bottom) + 8));
      panel.style.maxWidth = `${Math.max(0, width - leftGutter - rightGutter)}px`;
      const panelWidth = panel.getBoundingClientRect().width;
      panel.style.left = `${Math.max(viewportLeft + leftGutter,
        Math.min(trigger.getBoundingClientRect().right - panelWidth,
          viewportLeft + width - panelWidth - rightGutter))}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(0, bottom - top)}px`;
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(position);
    };
    position();
    panel.querySelector('button')?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(trigger);
    if (navigation) observer?.observe(navigation);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      disposingRef.current = true;
      if (panel.open) panel.close();
      if (page) delete page.dataset.appearanceOpen;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, [open]);

  return (
    <div className="orb-appearance">
      <button type="button" className="orb-appearance__trigger" ref={triggerRef}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" opacity=".65" />
        </svg>
        <span>Appearance</span>
      </button>
      {open && (
        <dialog ref={panelRef} id={id} className="orb-appearance__dialog" aria-labelledby={`${id}-title`}
          onClose={() => { if (!disposingRef.current) close(); }}
          onCancel={(event) => { event.preventDefault(); close(); }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            // Dismiss only after a completed backdrop click, never pointerdown.
            if (event.clientX < bounds.left || event.clientX > bounds.right
              || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
          }}>
          <div className="orb-appearance__heading">
            <h2 id={`${id}-title`}>Appearance</h2>
            <button type="button" className="orb-appearance__close" onClick={close} aria-label="Close appearance">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="orb-appearance__content">{children}</div>
        </dialog>
      )}
    </div>
  );
};

export default OrbAppearance;
