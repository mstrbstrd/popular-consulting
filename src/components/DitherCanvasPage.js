import React, { useCallback, useMemo, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import DitherWorldCanvas from "./DitherWorldCanvas";
import "./DitherCanvasPage.css";

const PALETTES = Object.freeze([
  {
    id: "natural",
    label: "Natural",
    description: "Sand, reflected sky, dusk heat, and moonlit water.",
  },
  {
    id: "classic",
    label: "Classic",
    description: "The same physical world translated into the site's spectral gradient language.",
  },
]);

const clampPhase = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const describePhase = (phase) => {
  const totalMinutes = Math.round(clampPhase(phase) * 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  let label = "Night";
  if (hours >= 5 && hours < 8) label = "Dawn";
  else if (hours >= 8 && hours < 17) label = "Day";
  else if (hours >= 17 && hours < 20) label = "Dusk";

  return { time, label };
};

const ThemeIcon = ({ isDark }) =>
  isDark ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

const TidalDuneExperience = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [paletteMode, setPaletteMode] = useState("natural");
  const [paused, setPaused] = useState(false);
  const [manualPhase, setManualPhase] = useState(null);
  const [observedPhase, setObservedPhase] = useState(() => (isDark ? 0.89 : 0.66));
  const [initialPhase] = useState(() => (isDark ? 0.89 : 0.66));

  const activePalette = useMemo(
    () => PALETTES.find((palette) => palette.id === paletteMode) ?? PALETTES[0],
    [paletteMode],
  );
  const displayedPhase = manualPhase ?? observedPhase;
  const phaseDescription = describePhase(displayedPhase);

  const handlePhaseChange = useCallback((phase) => {
    setObservedPhase(clampPhase(phase));
  }, []);

  return (
    <main className={`dither-canvas-page palette-${paletteMode}`} aria-label="Tidal Dune generative shader study">
      <DitherWorldCanvas
        initialPhase={initialPhase}
        isDark={isDark}
        onPhaseChange={handlePhaseChange}
        paletteMode={paletteMode}
        paused={paused}
        phaseOverride={manualPhase}
      />

      <div className="dither-canvas-glass" aria-hidden="true" />
      <div className="dither-canvas-grain" aria-hidden="true" />

      <header className="dither-canvas-header">
        <nav className="dither-canvas-nav" aria-label="Tidal Dune controls">
          <a className="dither-canvas-brand" href="/" aria-label="Return to Popular Consulting">
            <img src={logo} alt="" aria-hidden="true" />
            <span>Popular Consulting</span>
          </a>

          <span className="dither-canvas-nav-rule" aria-hidden="true" />

          <div className="dither-canvas-nav-actions">
            <button
              type="button"
              className="dither-canvas-icon-button"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light mode" : "Use dark mode"}
              title={isDark ? "Use light mode" : "Use dark mode"}
            >
              <ThemeIcon isDark={isDark} />
            </button>
            <button
              type="button"
              className="dither-canvas-text-button"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </nav>
      </header>

      <section className="dither-canvas-copy" aria-labelledby="dither-canvas-title">
        <p className="dither-canvas-eyebrow">Generative study · 01</p>
        <h1 id="dither-canvas-title">Tidal Dune</h1>
        <p className="dither-canvas-description">
          Desert wind crosses a shallow inland tide while the sun gives way to a moving moon.
          Your motion stirs the air and unsettles the reflections. Stillness lets the water clear
          and the night become visible.
        </p>
        <p className="dither-canvas-interaction-note">
          Move to shape the wind. Tap sand for a gust, or water for a ripple.
        </p>
      </section>

      <section className="dither-canvas-dock" aria-label="Scene presentation controls">
        <div className="dither-canvas-palette" aria-label="Render language">
          <span className="dither-canvas-control-label">Render</span>
          <div className="dither-canvas-segmented-control">
            {PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                className={palette.id === paletteMode ? "is-active" : ""}
                onClick={() => setPaletteMode(palette.id)}
                aria-pressed={palette.id === paletteMode}
              >
                {palette.label}
              </button>
            ))}
          </div>
          <span className="dither-canvas-palette-description">{activePalette.description}</span>
        </div>

        <span className="dither-canvas-dock-rule" aria-hidden="true" />

        <div className="dither-canvas-time-control">
          <div className="dither-canvas-time-heading">
            <span className="dither-canvas-control-label">Time</span>
            <strong>{phaseDescription.time}</strong>
            <span>{phaseDescription.label}</span>
          </div>
          <input
            className={`dither-canvas-time-range${manualPhase === null ? " is-automatic" : ""}`}
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={displayedPhase}
            onChange={(event) => setManualPhase(clampPhase(event.target.value))}
            aria-label="Time of day"
          />
          <button
            type="button"
            className="dither-canvas-auto-button"
            onClick={() => setManualPhase(null)}
            aria-pressed={manualPhase === null}
          >
            {manualPhase === null ? "Cycling" : "Resume cycle"}
          </button>
        </div>
      </section>

      <p className="visually-hidden" aria-live="polite">
        Tidal Dune is showing {phaseDescription.label.toLowerCase()} at {phaseDescription.time}
        in {activePalette.label.toLowerCase()} render mode.
      </p>
    </main>
  );
};

const DitherCanvasPage = () => (
  <ThemeProvider>
    <TidalDuneExperience />
  </ThemeProvider>
);

export default DitherCanvasPage;
