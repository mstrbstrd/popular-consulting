import React, { useEffect, useId, useRef, useState } from 'react';
import './MetabloomCompanionPanel.css';

export function compactCompanionBubble(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) return '';
  let excerpt = text;
  if (typeof Intl.Segmenter === 'function') {
    const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)];
    excerpt = sentences.slice(0, 2).map(sentence => sentence.segment).join('').trim();
  } else {
    const boundaries = [...text.matchAll(/[.!?](?:["'’”)\]]+)?(?=\s|$)/g)];
    if (boundaries.length > 1) excerpt = text.slice(0, boundaries[1].index + boundaries[1][0].length);
  }
  const characters = Array.from(excerpt);
  if (characters.length <= 280) return excerpt;
  const bounded = characters.slice(0, 277).join('');
  const lastSpace = bounded.lastIndexOf(' ');
  return `${(lastSpace > 220 ? bounded.slice(0, lastSpace) : bounded).trimEnd()}…`;
}

const Icon = ({ name }) => <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  {name === 'chat' && <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" />}
  {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
  {name === 'collapse' && <path d="m6 9 6 6 6-6" />}
  {name === 'expand' && <path d="M14 3h7v7m0-7-9 9M10 21H3v-7m0 7 9-9" />}
  {name === 'hide' && <path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c5 0 8.5 4.2 9.6 7a13 13 0 0 1-3 4.3M6.2 6.2A13 13 0 0 0 2.4 12c1.1 2.8 4.6 7 9.6 7 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />}
  {name === 'stop' && <rect x="6" y="6" width="12" height="12" rx="2" />}
</svg>;

// This wrapper always retains its children. OrbSection contains the live Orb
// and request owner: hiding/inerting this ancestor would hide the actual Orb.
// The session host separately controls only the chat interface's visibility.
export default function MetabloomCompanionPanel({
  docked = true, open = false, hidden = false, busy = false,
  bubbleText = '', statusText = '', children,
  onToggle, onHide, onShow, onStop, onExpand,
}) {
  const id = useId();
  const root = useRef(null);
  const heading = useRef(null);
  const toggle = useRef(null);
  const launcher = useRef(null);
  const focusIntent = useRef(null);
  const previousBubble = useRef(bubbleText);
  const [dismissedBubble, setDismissedBubble] = useState(null);
  const [unread, setUnread] = useState(false);
  const [viewport, setViewport] = useState({ offset: 0, height: null });
  const expanded = docked && open && !hidden;
  const excerpt = compactCompanionBubble(bubbleText);
  const showBubble = docked && !expanded && !hidden && !busy && excerpt && dismissedBubble !== bubbleText;
  const observedStatus = typeof statusText === 'string' ? statusText.trim() : '';

  useEffect(() => {
    if (expanded || !docked) setUnread(false);
    else if (bubbleText && bubbleText !== previousBubble.current) setUnread(true);
    previousBubble.current = bubbleText;
  }, [bubbleText, expanded, docked]);

  useEffect(() => {
    if (!docked) { focusIntent.current = null; return; }
    const intent = focusIntent.current;
    if (intent === 'open' && expanded) heading.current?.focus({ preventScroll: true });
    else if (intent === 'collapse' && !expanded && !hidden) toggle.current?.focus({ preventScroll: true });
    else if (intent === 'hide' && hidden) launcher.current?.focus({ preventScroll: true });
    else if (intent === 'show' && !hidden) (expanded ? heading : toggle).current?.focus({ preventScroll: true });
    else return;
    focusIntent.current = null;
  }, [docked, expanded, hidden]);

  useEffect(() => {
    if (!docked || !window.visualViewport) return undefined;
    const visual = window.visualViewport;
    let frame = null;
    const measure = () => {
      // Pinch zoom should magnify the current surface, not collapse its layout.
      if (visual.scale && visual.scale > 1.1) return;
      const mobile = window.matchMedia?.('(max-width: 600px)').matches ?? window.innerWidth <= 600;
      const editable = document.activeElement?.matches?.('textarea, [contenteditable="true"], input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"])');
      const keyboard = mobile && editable && (!visual.scale || visual.scale <= 1.1);
      const offset = keyboard ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0;
      setViewport(current => current.offset === offset && current.height === visual.height
        ? current : { offset, height: visual.height });
    };
    const schedule = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { frame = null; measure(); });
    };
    measure();
    visual.addEventListener('resize', schedule);
    visual.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      visual.removeEventListener('resize', schedule);
      visual.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, [docked]);

  const requestToggle = () => {
    focusIntent.current = expanded ? 'collapse' : 'open';
    onToggle?.();
  };
  const requestHide = () => { focusIntent.current = 'hide'; onHide?.(); };
  const requestShow = () => { focusIntent.current = 'show'; onShow?.(); };
  const onKeyDown = event => {
    if (!docked || !expanded || event.key !== 'Escape' || event.defaultPrevented) return;
    // A nested model picker or dialog owns its first Escape.
    if (event.target.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return;
    event.preventDefault(); event.stopPropagation(); requestToggle();
  };

  return <div ref={root} className="metabloom-companion" data-docked={docked ? 'true' : 'false'}
    data-open={expanded ? 'true' : 'false'} data-hidden={hidden ? 'true' : 'false'} data-busy={busy ? 'true' : 'false'}
    onKeyDown={onKeyDown} style={{ '--metabloom-companion-keyboard-offset': `${docked ? viewport.offset : 0}px`,
      ...(viewport.height ? { '--metabloom-companion-visible-height': `${viewport.height}px` } : {}) }}>
    <div id={`${id}-panel`} className="metabloom-companion__panel"
      role={expanded ? 'region' : undefined} aria-labelledby={expanded ? `${id}-heading` : undefined}>
      {/* One title and three distinct actions. Close chat (rightmost, a minimize
          chevron) returns the conversation to the dock; Hide also puts the Orb
          away until shown again. While open, this is the only Close chat: the
          dock's toggle leaves the tree until the panel closes. */}
      <div className="metabloom-companion__header" hidden={!expanded}>
        <h2 ref={heading} tabIndex={-1} id={`${id}-heading`}>Metabloom</h2>
        <div className="metabloom-companion__header-actions">
          {busy && <button type="button" className="metabloom-companion__icon-button metabloom-companion__icon-button--stop" onClick={onStop}
            aria-label="Stop response" title="Stop response"><Icon name="stop" /></button>}
          <button type="button" className="metabloom-companion__icon-button" onClick={requestHide}
            aria-label="Hide assistant" title="Hide assistant"><Icon name="hide" /></button>
          <button type="button" className="metabloom-companion__icon-button" onClick={onExpand}
            aria-label="Open full chat" title="Open full chat"><Icon name="expand" /></button>
          <button type="button" className="metabloom-companion__icon-button" onClick={requestToggle}
            aria-label="Close chat" title="Close chat"><Icon name="collapse" /></button>
        </div>
      </div>
      <div className="metabloom-companion__body">{children}</div>
    </div>
    <div className="metabloom-companion__bubble" hidden={!showBubble}>
      <p>{excerpt}</p>
      <button type="button" className="metabloom-companion__icon-button" onClick={() => {
        setDismissedBubble(bubbleText); toggle.current?.focus({ preventScroll: true });
      }}
        aria-label="Dismiss reply preview" title="Dismiss reply preview"><Icon name="close" /></button>
      <button type="button" className="metabloom-companion__read" onClick={requestToggle}>Read conversation</button>
    </div>
    {/* The dock, while the chat is closed: a chat icon and the Orb, one toggle.
        Its target covers the Orb itself (the canvas never takes input). Opening
        moves the same Orb into the panel header, so the dock steps aside.
        Status is shown while work runs and announced always. */}
    <div className="metabloom-companion__controls" hidden={!docked}>
      <p className="metabloom-companion__status" role="status" aria-live="polite" aria-atomic="true" hidden={!docked || (hidden && !busy)}>
        {busy && <span className="metabloom-companion__activity" aria-hidden="true" />}
        {busy ? observedStatus || 'Working' : unread && !expanded ? 'New reply available' : observedStatus}
      </p>
      {busy && !expanded && <button type="button" className="metabloom-companion__stop" onClick={onStop}>
        <Icon name="stop" /><span>Stop</span>
      </button>}
      <button ref={toggle} type="button" className="metabloom-companion__toggle" hidden={hidden || expanded}
        aria-label={expanded ? 'Close chat' : 'Open chat'} aria-expanded={expanded} aria-controls={`${id}-panel`} onClick={requestToggle}>
        <span className="metabloom-companion__pill metabloom-companion__pill--icon">
          <Icon name="chat" />
          {unread && !expanded && <span className="metabloom-companion__unread" aria-label="New reply" />}
        </span>
        <span className="metabloom-companion__orb-target" aria-hidden="true" />
      </button>
      <button ref={launcher} type="button" className="metabloom-companion__toggle metabloom-companion__toggle--show" hidden={!hidden}
        aria-label="Show Metabloom" onClick={requestShow}>
        <span className="metabloom-companion__pill">
          <Icon name="chat" /><span>Show Metabloom</span>
          {unread && hidden && <span className="metabloom-companion__unread" aria-label="New reply" />}
        </span>
      </button>
    </div>
  </div>;
}
