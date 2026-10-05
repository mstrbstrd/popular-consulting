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
    if (popoverRef.current?.open) popoverRef.current.close();
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const anchor = panelRef.current;
    const panel = popoverRef.current;
    const viewport = window.visualViewport;
    const navigation = document.querySelector(".nav-pill");
    const page = anchor.closest(".orb-page");
    if (page) page.dataset.reactionsOpen = "true";
    // A native modal lives above transformed glass/composer layers and makes
    // the controls underneath inert, including Safari's touch hit testing.
    panel.showModal();
    let frame = 0;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const safeArea = getComputedStyle(anchor);
      const leftGutter = Math.max(16, parseFloat(safeArea.getPropertyValue("--orb-safe-left")) || 0);
      const rightGutter = Math.max(16, parseFloat(safeArea.getPropertyValue("--orb-safe-right")) || 0);
      const bottomGutter = Math.max(16, parseFloat(safeArea.getPropertyValue("--orb-safe-bottom")) || 0);
      const viewportBottom = viewportTop + viewportHeight - bottomGutter;
      // Measure before the first paint: the landing composer is centered, so
      // a viewport-height estimate can put the heading behind navigation.
      const top = Math.min(viewportBottom, Math.max(viewportTop + 16,
        (navigation?.getBoundingClientRect().bottom || 0) + 12));
      const panelBottom = Math.min(bounds.top - 8, viewportBottom);
      const availableAbove = panelBottom - top;
      // Phones use the space below navigation as a sheet, not a tiny slice
      // above the centered landing composer. Desktop keeps its anchored popover.
      const compact = viewportWidth <= 720 || availableAbove < 160;
      panel.style.maxWidth = `${Math.max(0, viewportWidth - leftGutter - rightGutter)}px`;
      const width = panel.getBoundingClientRect().width;
      const preferredLeft = bounds.left + bounds.width / 2 > viewportLeft + viewportWidth / 2
        ? bounds.right - width : bounds.left;
      const left = Math.max(viewportLeft + leftGutter, Math.min(preferredLeft, viewportLeft + viewportWidth - width - rightGutter));
      const maxHeight = Math.max(0, compact ? viewportBottom - top : availableAbove);
      panel.style.left = `${left}px`;
      panel.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(panel.getBoundingClientRect().height, maxHeight);
      panel.style.top = `${compact ? top : panelBottom - height}px`;
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
      if (panel.open) panel.close();
      if (page) delete page.dataset.reactionsOpen;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [open]);

  React.useEffect(() => {
    if (disabled && popoverRef.current) close();
  }, [disabled, close]);

  const play = (id) => {
    if (disabled) return;
    const reaction = resolveMetabloomAction(id);
    if (onReact({ action: id, intensity: id === "reform" ? 0 : intensity, duration: reaction.duration, talking: false })) {
      setSelected(id);
      close();
    }
  };

  return (
    <div className="metabloom-reactions" ref={panelRef} data-reaction-set="2">
      <div className="metabloom-reactions__toolbar">
        <button ref={toggleRef} type="button" aria-expanded={open} aria-controls="metabloom-reaction-panel" onClick={() => setOpen(!open)}>
          Reactions <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => play(selected)} aria-label={`Replay ${action.label.toLowerCase()} reaction`}>
          Replay
        </button>
      </div>
      {open && (
        <dialog ref={popoverRef} id="metabloom-reaction-panel" className="metabloom-reactions__panel" aria-label="Reaction studio" onClose={close} onCancel={(event) => {
          event.preventDefault();
          close();
        }} onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          // Dismiss on a completed backdrop click, never on pointerdown. The
          // same gesture must not reach a newly uncovered demo or composer.
          if (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}>
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
        </dialog>
      )}
    </div>
  );
};

export default MetabloomReactionPanel;
