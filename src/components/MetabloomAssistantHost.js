import React from 'react';
import OrbPage from './OrbPage';
import MetabloomCompanionPanel from './MetabloomCompanionPanel';
import { MetabloomSessionContext } from './MetabloomSessionProvider';
import './MetabloomAssistantHost.css';

export default function MetabloomAssistantHost({ onReady }) {
  const session = React.useContext(MetabloomSessionContext);
  const { full, open, collapse } = session;
  const root = React.useRef(null);
  const previousRect = React.useRef(null);
  const motion = React.useRef(null);
  const [editing, setEditing] = React.useState(false);
  React.useLayoutEffect(() => {
    const field = root.current?.querySelector('.metabloom-chat__field');
    if (!field) return undefined;
    motion.current?.cancel();
    const next = field.getBoundingClientRect();
    const previous = previousRect.current;
    previousRect.current = next;
    if (previous?.width && previous?.height && next.width && next.height && field.animate
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Resize once, then animate the field's presentation transform. Never
      // recreate the canvas or resize its drawing buffer every animation frame.
      motion.current = field.animate([
        { transformOrigin: '0 0', transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], { duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (!motion.current || motion.current.playState === 'finished') previousRect.current = field.getBoundingClientRect();
    }) : null;
    observer?.observe(field);
    return () => { observer?.disconnect(); motion.current?.cancel(); };
  }, [full]);
  React.useEffect(() => {
    if (full) { setEditing(false); return undefined; }
    let frame = 0;
    const focus = event => {
      const target = event.target;
      const field = target?.closest?.('.invoice-page') && target.matches?.('input, textarea, select, button, [contenteditable="true"]');
      setEditing(Boolean(field));
      if (!field || !root.current) return;
      const overlaps = element => {
        if (!element || element.hidden || window.getComputedStyle(element).visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect(), input = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left < input.right && rect.right > input.left
          && rect.top < input.bottom && rect.bottom > input.top;
      };
      if (open && overlaps(root.current.querySelector('.metabloom-chat__interface'))) collapse();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
        if (['.metabloom-chat__field', '.metabloom-companion__controls'].some(selector => overlaps(root.current?.querySelector(selector))))
          target.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      });
    };
    document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('focusin', focus); window.cancelAnimationFrame(frame); };
  }, [full, open, collapse]);
  return <div ref={root} className="metabloom-assistant-host"
    data-assistant-presentation={full ? 'full' : 'docked'}
    data-assistant-open={open ? 'true' : 'false'}
    data-assistant-editing={editing ? 'true' : 'false'}
    data-assistant-hidden={session.hidden ? 'true' : 'false'}>
    <MetabloomCompanionPanel docked={!full} open={open} hidden={session.hidden}
      busy={session.busy} bubbleText={session.bubbleText} statusText={session.statusText}
      onToggle={session.toggle} onHide={session.hide} onShow={session.show} onStop={session.stop} onExpand={session.expand}>
      <OrbPage hosted onReady={onReady} />
    </MetabloomCompanionPanel>
  </div>;
}
