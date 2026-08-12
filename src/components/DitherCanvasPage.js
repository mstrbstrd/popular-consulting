import React, { useEffect, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import CreatorOSLavaLampCanvas from "./CreatorOSLavaLampCanvas";
import ResearchDitherCanvas from "./ResearchDitherCanvas";
import RuptureCanvas from "./RuptureCanvas";
import SpectralDitherCanvas from "./SpectralDitherCanvas";
import "./DitherCanvasPage.css";
import "./ResearchDitherCanvas.css";
import "./DitherCanvasVibrance.css";
import "./CreatorOSLavaLampCanvas.css";

const STUDIES = [
  {
    id: "second-surface",
    number: "01",
    title: "Second Surface",
    type: "rupture",
    kind: "Material",
    initialState: "tension",
    resetLabel: "Heal",
    description:
      "The page is under tension. Motion opens it. Stillness leaves a scar.",
    instruction:
      "Move to stress the surface · tap to branch the fault · wait to watch it heal",
  },
  {
    id: "metabloom",
    number: "02",
    title: "Metabloom",
    type: "spectral",
    kind: "Field",
    mode: 0,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Lava-lamp motion becomes a living membrane of orbiting forms that merge, divide, and bend around the observer.",
    instruction:
      "Move to bend the bloom · tap to send a pressure ring through the field",
  },
  {
    id: "tidal-weave",
    number: "03",
    title: "Tidal Weave",
    type: "spectral",
    kind: "Field",
    mode: 1,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Counterflowing ribbons braid into an over-under textile, continuously exchanging depth as the current turns.",
    instruction:
      "Move to redirect the current · tap to disturb every crossing at once",
  },
  {
    id: "moire-halo",
    number: "04",
    title: "Moiré Halo",
    type: "spectral",
    kind: "Field",
    mode: 2,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Two migrating wavefronts interfere into lenses, rings, and impossible radial structures that never quite repeat.",
    instruction:
      "Move to separate the wave origins · tap to launch a third interference ring",
  },
  {
    id: "contour-drift",
    number: "05",
    title: "Contour Drift",
    type: "spectral",
    kind: "Field",
    mode: 3,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Procedural terrain is reduced to a drifting topographic signal, with elevation expressed through spectral glyph density.",
    instruction:
      "Move to lift the terrain · tap to push a circular depression across the map",
  },
  {
    id: "lava-lamp",
    number: "06",
    title: "Lava Lamp",
    type: "creatoros-lava",
    kind: "CreatorOS",
    initialState: "warming",
    resetLabel: "Reheat",
    description:
      "The CreatorOS fluid backdrop returns intact: viscous spectral wax rises, stretches with velocity, merges, and settles into crisp Bayer-dithered colour.",
    instruction:
      "Watch the wax warm, stretch, merge, and hover · choose Reheat to restart the lamp",
  },
  {
    id: "morphogen-divide",
    number: "07",
    title: "Morphogen Divide",
    type: "research",
    kind: "Feedback",
    mode: 1,
    initialState: "forming",
    resetLabel: "Reseed",
    description:
      "A live reaction-diffusion system grows cells, fronts, and dividing islands from local chemical feedback rather than a predetermined animation.",
    instruction:
      "Move to feed the chemistry · tap to seed an expanding reaction front · reseed for a new organism",
  },
  {
    id: "quasicrystal-chorus",
    number: "08",
    title: "Quasicrystal Chorus",
    type: "research",
    kind: "Wave",
    mode: 2,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Twelve coupled standing-wave directions assemble a fluid quasicrystal whose local symmetries shift without becoming periodic.",
    instruction:
      "Move to lens the wave vectors · tap to introduce a travelling phase disturbance",
  },
  {
    id: "hyperbolic-garden",
    number: "09",
    title: "Hyperbolic Garden",
    type: "research",
    kind: "Space",
    mode: 3,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Geodesics grow inside a conformally warped Poincaré disk, packing more structure toward a boundary that can never be reached.",
    instruction:
      "Move to relocate the geometric origin · tap to send a pulse across curved space",
  },
];

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

const DitherFieldLab = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const [activeStudyId, setActiveStudyId] = useState(STUDIES[0].id);
  const [paused, setPaused] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const activeStudy =
    STUDIES.find((study) => study.id === activeStudyId) || STUDIES[0];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Dither Field Lab | Popular Consulting";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const selectStudy = (study) => {
    if (study.id === activeStudy.id) return;
    setActiveStudyId(study.id);
    setFieldState(study.initialState);
  };

  const renderActiveStudy = () => {
    const sharedProps = {
      isDark,
      paused,
      resetVersion,
    };

    if (activeStudy.type === "rupture") {
      return (
        <RuptureCanvas
          {...sharedProps}
          onRuptureStateChange={setFieldState}
        />
      );
    }

    if (activeStudy.type === "creatoros-lava") {
      return (
        <CreatorOSLavaLampCanvas
          {...sharedProps}
          onFieldStateChange={setFieldState}
        />
      );
    }

    if (activeStudy.type === "research") {
      return (
        <ResearchDitherCanvas
          {...sharedProps}
          mode={activeStudy.mode}
          onFieldStateChange={setFieldState}
        />
      );
    }

    return (
      <SpectralDitherCanvas
        {...sharedProps}
        mode={activeStudy.mode}
        onFieldStateChange={setFieldState}
      />
    );
  };

  return (
    <main
      className={`dither-canvas-page dither-study-${activeStudy.id} rupture-${fieldState}`}
      aria-label="Spectral Display dither field lab"
    >
      {renderActiveStudy()}

      <div className="rupture-glass" aria-hidden="true" />
      <div className="rupture-grain" aria-hidden="true" />

      <header className="rupture-header">
        <nav className="rupture-nav" aria-label="Dither field controls">
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
              {activeStudy.resetLabel}
            </button>
          </div>
        </nav>
      </header>

      <section className="rupture-copy" aria-labelledby="rupture-title">
        <p className="rupture-eyebrow">
          Spectral Display · Study {activeStudy.number}
        </p>
        <h1 id="rupture-title">{activeStudy.title}</h1>
        <p className="rupture-description">{activeStudy.description}</p>
        <p className="rupture-instruction">{activeStudy.instruction}</p>
      </section>

      <nav className="dither-study-switcher" aria-label="Dither background studies">
        <p className="dither-study-switcher-label">Field studies</p>
        <div className="dither-study-options">
          {STUDIES.map((study) => {
            const isActive = study.id === activeStudy.id;
            return (
              <button
                key={study.id}
                type="button"
                className={`dither-study-option${isActive ? " is-active" : ""}`}
                onClick={() => selectStudy(study)}
                aria-pressed={isActive}
              >
                <span className="dither-study-number" aria-hidden="true">
                  {study.number}
                </span>
                <span className="dither-study-title">{study.title}</span>
                <span className="dither-study-kind" aria-hidden="true">
                  {study.kind}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <p className="rupture-state" aria-live="polite">
        <span aria-hidden="true" />
        {fieldState}
      </p>
    </main>
  );
};

const DitherCanvasPage = () => (
  <ThemeProvider>
    <DitherFieldLab />
  </ThemeProvider>
);

export default DitherCanvasPage;
