import React from "react";
import NavierStokesColorwaySelector from "./NavierStokesColorwaySelector";
import { navierCoreScales, normalizeNavierProgress } from "./navierStokesModel";
import "./NavierStokesControls.css";

const NavierStokesControls = ({ progress, onProgressChange, colorway = "original", onColorwayChange }) => {
  const value = normalizeNavierProgress(progress);
  const inspecting = value >= 0;
  const scales = navierCoreScales(value);
  return (
    <div className="navier-controls">
      <NavierStokesColorwaySelector colorway={colorway} onColorwayChange={onColorwayChange} />
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
        <p id="navier-scale-note">Leading-order scales, not measured data. Inspect adjusts the core markers, not flow history. Use Pause to freeze it.</p>
      </div>}
      <p className="navier-principle">One fluid. Several tightening cores. No fade-out.</p>
      <details className="navier-research">
        <summary>About the result</summary>
        <p>Inspired by OpenAI’s reported smooth-forcing construction. One continuous 2D pigment field surrounds four vortices, or three on mobile. Their core markers contract toward a tiny visible floor while the surrounding fluid keeps moving. Devices without floating-point render targets use an analytical illustration.</p>
        <p>The multiple cores are an artistic extension, not a claim about simultaneous physical singularities. This bounded 2D flow does not reproduce or verify the reported 3D proof. Reference scales are not live measurements. Pause freezes the flow; Inspect changes only the displayed core concentration.</p>
        <a href="https://openai.com/index/navier-stokes-solution/" target="_blank" rel="noopener noreferrer">OpenAI research ↗</a>
      </details>
    </div>
  );
};
export default NavierStokesControls;
