import React, { useRef } from "react";
import { getNavierColorway, NAVIER_COLORWAYS } from "./navierStokesColorways";

const NavierStokesColorwaySelector = ({ colorway, onColorwayChange }) => {
  const selected = getNavierColorway(colorway);
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);
  const chooseColorway = id => {
    onColorwayChange?.(id);
    if (detailsRef.current) detailsRef.current.open = false;
    summaryRef.current?.focus();
  };
  return (
    <details className="navier-colorways" ref={detailsRef}>
      <summary ref={summaryRef} aria-label={`Colorway: ${selected.label}`}>
        <span className="navier-colorway-summary">
          <span>Colorway</span>
          <span className="navier-colorway-current">
            <span className="navier-colorway-swatch" style={{ background: selected.gradient }} aria-hidden="true" />
            <strong>{selected.label}</strong>
          </span>
        </span>
      </summary>
      <div className="navier-colorway-grid" role="group" aria-label="Finite Infinity colorways">
        {NAVIER_COLORWAYS.map(option => (
          <button key={option.id} type="button" className="navier-colorway-option"
            aria-label={option.label} aria-pressed={selected.id === option.id}
            title={option.description} onClick={() => chooseColorway(option.id)}>
            <span className="navier-colorway-swatch" style={{ background: option.gradient }} aria-hidden="true" />
            <span>{option.label}</span>
            <span className="navier-colorway-check" aria-hidden="true">{selected.id === option.id ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <p className="navier-colorway-hint">Change the pigment, keep the flow.</p>
    </details>
  );
};

export default NavierStokesColorwaySelector;
