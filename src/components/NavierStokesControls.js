import React from "react";
import { navierCoreScales, normalizeNavierProgress } from "./navierStokesModel";
import "./NavierStokesControls.css";

const NavierStokesControls = ({ progress, onProgressChange }) => {
  const value = normalizeNavierProgress(progress);
  const inspecting = value >= 0;
  const scales = navierCoreScales(value);
  return (
    <div className="navier-controls">
      <div className="metabloom-palette-selector" role="group" aria-label="Finite Infinity playback">
        <span className="metabloom-palette-selector-label">Collapse</span>
        <button type="button" className={`metabloom-palette-option${!inspecting ? " is-active" : ""}`}
          aria-pressed={!inspecting} onClick={() => onProgressChange(-1)}>Evolve</button>
        <button type="button" className={`metabloom-palette-option${inspecting ? " is-active" : ""}`}
          aria-pressed={inspecting} onClick={() => onProgressChange(0.5)}>Inspect</button>
      </div>
      {inspecting && <div className="navier-scrubber">
        <label htmlFor="navier-concentration">Concentration <span>{Math.round(value * 100)}%</span></label>
        <input id="navier-concentration" type="range" min="0" max="100" step="1"
          value={Math.round(value * 100)} aria-describedby="navier-scale-note"
          onChange={(event) => onProgressChange(Number(event.target.value) / 100)} />
        <div className="navier-scales" aria-label="Normalized leading-order core scales">
          <span>Radius <strong>{scales.radius.toFixed(3)}×</strong></span>
          <span>Speed <strong>{scales.speed.toFixed(1)}×</strong></span>
          <span>Core energy <strong>{scales.energy.toFixed(3)}×</strong></span>
        </div>
        <p id="navier-scale-note">Leading-order scales, not measured data. Visual proportions are exaggerated.</p>
      </div>}
      <p className="navier-principle">Shrinking core. Rising speed. Finite energy.</p>
      <details className="navier-research">
        <summary>About the result</summary>
        <p>An artistic study of OpenAI’s reported smooth-forcing construction. Iridescent sheets roll inward around a hot axial core; nested folds and curled currents make the concentration visible.</p>
        <p>Both core dimensions shrink. Speed diverges while total energy remains bounded. This is schematic artwork, not a fluid solver or independent proof verification. Replay fades before the singularity.</p>
        <a href="https://openai.com/index/navier-stokes-solution/" target="_blank" rel="noopener noreferrer">OpenAI research ↗</a>
      </details>
    </div>
  );

};
export default NavierStokesControls;
