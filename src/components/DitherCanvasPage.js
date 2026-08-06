import React, { useEffect, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import AfterfieldCanvas from "./AfterfieldCanvas";
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

const AfterfieldExperience = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [paused, setPaused] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [fieldState, setFieldState] = useState("braiding");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Afterfield | Popular Consulting";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="dither-canvas-page" aria-label="Afterfield generative study">
      <AfterfieldCanvas
        isDark={isDark}
        onFieldStateChange={setFieldState}
        paused={paused}
        resetVersion={resetVersion}
      />

      <div className="afterfield-glass" aria-hidden="true" />
      <div className="afterfield-grain" aria-hidden="true" />

      <header className="afterfield-header">
        <nav className="afterfield-nav" aria-label="Afterfield controls">
          <a
            className="afterfield-brand"
            href="/"
            aria-label="Return to Popular Consulting"
          >
            <img src={logo} alt="" aria-hidden="true" />
            <span>Popular Consulting</span>
          </a>

          <span className="afterfield-nav-rule" aria-hidden="true" />

          <div className="afterfield-nav-actions">
            <button
              type="button"
              className="afterfield-icon-button"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light mode" : "Use dark mode"}
              title={isDark ? "Use light mode" : "Use dark mode"}
            >
              <ThemeIcon isDark={isDark} />
            </button>
            <button
              type="button"
              className="afterfield-text-button"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="afterfield-text-button"
              onClick={() => setResetVersion((value) => value + 1)}
            >
              Forget
            </button>
          </div>
        </nav>
      </header>

      <section className="afterfield-copy" aria-labelledby="afterfield-title">
        <p className="afterfield-eyebrow">Generative study · 01</p>
        <h1 id="afterfield-title">Afterfield</h1>
        <p className="afterfield-description">
          A chromatic surface that remembers the observer. Motion unthreads it.
          Stillness teaches it how to braid itself again.
        </p>
        <p className="afterfield-instruction">
          Move to write · tap to pin a singularity · wait to watch it heal
        </p>
      </section>

      <p className="afterfield-state" aria-live="polite">
        <span aria-hidden="true" />
        {fieldState}
      </p>
    </main>
  );
};

const DitherCanvasPage = () => (
  <ThemeProvider>
    <AfterfieldExperience />
  </ThemeProvider>
);

export default DitherCanvasPage;
