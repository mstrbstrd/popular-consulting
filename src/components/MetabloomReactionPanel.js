import React from "react";
import { METABLOOM_ACTIONS, resolveMetabloomAction } from "./metabloomActions";
import "./MetabloomReactionPanel.css";

const MetabloomReactionPanel = ({ onReact, disabled = false }) => {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState("curious");
  const [intensity, setIntensity] = React.useState(0.65);
  const toggleRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const action = resolveMetabloomAction(selected);
  const close = React.useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

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
        <section id="metabloom-reaction-panel" className="metabloom-reactions__panel" aria-label="Reaction studio">
          <div className="metabloom-reactions__heading">
            <div><strong>A little body language</strong><p>Choose a reaction and watch it unfold.</p></div>
            <button type="button" onClick={close} aria-label="Close reactions">×</button>
          </div>
          <div className="metabloom-reactions__grid" role="group" aria-label="Preview a reaction">
            {METABLOOM_ACTIONS.map((reaction) => (
              <button key={reaction.id} type="button" disabled={disabled} onClick={() => play(reaction.id)} title={reaction.intent} aria-label={`Preview ${reaction.label.toLowerCase()} reaction`} data-selected={selected === reaction.id ? "true" : "false"}>
                {reaction.label}
              </button>
            ))}
          </div>
          <label className="metabloom-reactions__intensity" htmlFor="metabloom-reaction-intensity">
            <span>Expressiveness <output>{Math.round(intensity * 100)}%</output></span>
            <input id="metabloom-reaction-intensity" type="range" min="0.2" max="1" step="0.05" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
          </label>
          <p className="metabloom-reactions__score"><strong>{action.label}</strong><span>{action.beats.join(" · ")}</span></p>
          {disabled && <p className="metabloom-reactions__waiting">Available when the current reply finishes.</p>}
        </section>
      )}
    </div>
  );
};

export default MetabloomReactionPanel;
