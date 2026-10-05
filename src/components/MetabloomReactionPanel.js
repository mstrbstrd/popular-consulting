import React from "react";
import { METABLOOM_ACTIONS, resolveMetabloomAction } from "./metabloomActions";
import "./MetabloomReactionPanel.css";

const MetabloomReactionPanel = ({ onReact, disabled = false, intensity: controlledIntensity, onIntensityChange, children }) => {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState("curious");
  const [localIntensity, setLocalIntensity] = React.useState(0.8);
  const intensity = controlledIntensity ?? localIntensity;
  const setIntensity = onIntensityChange || setLocalIntensity;
  const toggleRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const popoverRef = React.useRef(null);
  const action = resolveMetabloomAction(selected);
  const close = React.useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const anchor = panelRef.current;
    const panel = popoverRef.current;
    const viewport = window.visualViewport;
    const navigation = document.querySelector(".nav-pill");
    let frame = 0;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight - 16;
      // Measure before the first paint: the landing composer is centered, so
      // a viewport-height estimate can put the heading behind navigation.
      const top = Math.min(viewportBottom, Math.max(viewportTop + 16,
        (navigation?.getBoundingClientRect().bottom || 0) + 12));
      const panelBottom = Math.min(bounds.top - 8, viewportBottom);
      const availableAbove = panelBottom - top;
      const compact = availableAbove < 160;
      panel.style.maxWidth = `${Math.max(0, viewportWidth - 32)}px`;
      const width = panel.getBoundingClientRect().width;
      const preferredLeft = bounds.left + bounds.width / 2 > viewportLeft + viewportWidth / 2
        ? bounds.right - width : bounds.left;
      const left = Math.max(viewportLeft + 16, Math.min(preferredLeft, viewportLeft + viewportWidth - width - 16));
      panel.style.left = `${left - bounds.left}px`;
      panel.style.maxHeight = `${Math.max(0, compact ? viewportBottom - top : availableAbove)}px`;
      panel.style.top = compact ? `${top - bounds.top}px` : "auto";
      panel.style.bottom = compact ? "auto" : `${bounds.bottom - panelBottom}px`;
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(position);
    };
    position();
    panel.querySelector("button")?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(anchor);
    const composer = anchor.closest(".metabloom-chat__composer-area");
    if (composer) observer?.observe(composer);
    if (navigation) observer?.observe(navigation);
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  React.useEffect(() => {
    if (disabled) {
      if (panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
      setOpen(false);
    }
  }, [disabled]);

  const play = (id) => {
    if (disabled) return;
    const reaction = resolveMetabloomAction(id);
    if (onReact({ action: id, intensity: id === "reform" ? 0 : intensity, duration: reaction.duration, talking: false })) {
      setSelected(id);
      close();
    }
  };

  return (
    <div className="metabloom-reactions" ref={panelRef} data-reaction-set="2" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="metabloom-reactions__toolbar">
        <button ref={toggleRef} type="button" aria-expanded={open} aria-controls="metabloom-reaction-panel" onClick={() => setOpen(!open)}>
          Reactions <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => play(selected)} aria-label={`Replay ${action.label.toLowerCase()} reaction`}>
          Replay
        </button>
      </div>
      {open && (
        <section ref={popoverRef} id="metabloom-reaction-panel" className="metabloom-reactions__panel" aria-label="Reaction studio">
          <div className="metabloom-reactions__heading">
            <div><strong>Reactions</strong><p>A little body language for the conversation.</p></div>
            <button type="button" onClick={close} aria-label="Close reactions">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="metabloom-reactions__content">
            <div className="metabloom-reactions__grid" role="group" aria-label="Preview a reaction">
              {METABLOOM_ACTIONS.map((reaction) => (
                <button key={reaction.id} type="button" disabled={disabled} onClick={() => play(reaction.id)} title={reaction.intent} aria-label={`Preview ${reaction.label.toLowerCase()} reaction`} aria-pressed={selected === reaction.id} data-selected={selected === reaction.id ? "true" : "false"}>
                  {reaction.label}
                </button>
              ))}
            </div>
            <label className="metabloom-reactions__intensity" htmlFor="metabloom-reaction-intensity">
              <span>Expressiveness <output>{Math.round(intensity * 100)}%</output></span>
              <input id="metabloom-reaction-intensity" type="range" min="0.2" max="1" step="0.05" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
            </label>
            <p className="metabloom-reactions__hint">Applies to previews and conversation reactions.</p>
            {typeof children === "function" ? children({ close }) : children}
            <p className="metabloom-reactions__score"><strong>{action.label}</strong><span>{action.beats.join(" · ")}</span></p>
            {disabled && <p className="metabloom-reactions__waiting">Available when the current reply finishes.</p>}
          </div>
        </section>
      )}
    </div>
  );
};

export default MetabloomReactionPanel;
