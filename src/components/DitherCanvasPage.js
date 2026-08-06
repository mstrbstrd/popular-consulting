import React, { useEffect, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import RuptureCanvas from "./RuptureCanvas";
import "./DitherCanvasPage.css";

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

const SecondSurfaceExperience = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [paused, setPaused] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [ruptureState, setRuptureState] = useState("tension");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Second Surface | Popular Consulting";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main
      className={`dither-canvas-page rupture-${ruptureState}`}
      aria-label="Second Surface generative study"
    >
      <RuptureCanvas
        isDark={isDark}
        onRuptureStateChange={setRuptureState}
        paused={paused}
        resetVersion={resetVersion}
      />

      <div className="rupture-glass" aria-hidden="true" />
      <div className="rupture-grain" aria-hidden="true" />

      <header className="rupture-header">
        <nav className="rupture-nav" aria-label="Second Surface controls">
          <a
            className="rupture-brand"
            href="/"
            aria-label="Return to Popular Consulting"
          >
            <img src={logo} alt="" aria-hidden="true" />
            <span>Popular Consulting</span>
          </a>

          <span className="rupture-nav-rule" aria-hidden="true" />

          <div className="rupture-nav-actions">
            <button
              type="button"
              className="rupture-icon-button"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light mode" : "Use dark mode"}
              title={isDark ? "Use light mode" : "Use dark mode"}
            >
              <ThemeIcon isDark={isDark} />
            </button>
            <button
              type="button"
              className="rupture-text-button"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="rupture-text-button"
              onClick={() => setResetVersion((value) => value + 1)}
            >
              Heal
            </button>
          </div>
        </nav>
      </header>

      <section className="rupture-copy" aria-labelledby="rupture-title">
        <p className="rupture-eyebrow">Generative study · 01</p>
        <h1 id="rupture-title">Second Surface</h1>
        <p className="rupture-description">
          The page is under tension. Motion opens it. Stillness leaves a scar.
        </p>
        <p className="rupture-instruction">
          Move to stress the surface · tap to branch the fault · wait to watch it heal
        </p>
      </section>

      <p className="rupture-state" aria-live="polite">
        <span aria-hidden="true" />
        {ruptureState}
      </p>
    </main>
  );
};

const DitherCanvasPage = () => (
  <ThemeProvider>
    <SecondSurfaceExperience />
  </ThemeProvider>
);

export default DitherCanvasPage;
