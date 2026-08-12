import React, { useEffect, useRef, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import CreatorOSLavaLampCanvas from "./CreatorOSLavaLampCanvas";
import RuptureCanvas from "./RuptureCanvas";
import "./DitherCanvasPage.css";
import "./DitherCanvasVibrance.css";
import "./CreatorOSLavaLampCanvas.css";
import "./CreatorOSFieldCanvas.css";
import "./DitherScrollNarrative.css";

const STUDIES = [
  {
    id: "second-surface",
    number: "01",
    title: "Second Surface",
    type: "rupture",
    kind: "Material",
    initialState: "sealed",
    resetLabel: "Heal",
    description:
      "A second surface waits beneath the page. Scrolling draws the seam apart until the hidden field takes over completely.",
    instruction:
      "Scroll to open the tear · scroll back to close it · choose Heal to seal the surface",
  },
  {
    id: "metabloom",
    number: "02",
    title: "Metabloom",
    type: "creatoros-field",
    kind: "Fluid",
    mode: 0,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "CreatorOS wax physics become an orbital organism: viscous bodies merge, stretch along their motion, and bloom around the observer.",
    instruction:
      "Move to bend the bloom · tap to send a pressure ring through the field",
  },
  {
    id: "tidal-weave",
    number: "03",
    title: "Tidal Weave",
    type: "creatoros-field",
    kind: "Fluid",
    mode: 1,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Two viscous ribbon systems braid into an over-under textile, exchanging depth as the current folds and refracts.",
    instruction:
      "Move to redirect the current · tap to disturb every crossing at once",
  },
  {
    id: "moire-halo",
    number: "04",
    title: "Moiré Halo",
    type: "creatoros-field",
    kind: "Wave",
    mode: 2,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Migrating wavefronts interfere as liquid pigment, forming lenses, rings, and Bayer-quantized radial structures that never settle.",
    instruction:
      "Move to separate the wave origins · tap to launch a third interference ring",
  },
  {
    id: "contour-drift",
    number: "05",
    title: "Contour Drift",
    type: "creatoros-field",
    kind: "Terrain",
    mode: 3,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Procedural terrain flows like suspended pigment, with elevation expressed through viscous spectral contour bands and crisp Bayer cells.",
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
    type: "creatoros-field",
    kind: "Feedback",
    mode: 4,
    initialState: "forming",
    resetLabel: "Reseed",
    description:
      "A live reaction-diffusion system grows cells, fronts, and dividing islands, now rendered as translucent CreatorOS pigment rather than glyphs.",
    instruction:
      "Move to feed the chemistry · tap to seed an expanding reaction front · reseed for a new organism",
  },
  {
    id: "quasicrystal-chorus",
    number: "08",
    title: "Quasicrystal Chorus",
    type: "creatoros-field",
    kind: "Wave",
    mode: 5,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Twelve coupled standing-wave directions assemble a fluid quasicrystal whose spectral ridges shift without becoming periodic.",
    instruction:
      "Move to lens the wave vectors · tap to introduce a travelling phase disturbance",
  },
  {
    id: "hyperbolic-garden",
    number: "09",
    title: "Hyperbolic Garden",
    type: "creatoros-field",
    kind: "Space",
    mode: 6,
    initialState: "drifting",
    resetLabel: "Reseed",
    description:
      "Geodesics grow as translucent pigment inside a conformally warped Poincaré disk, packing more structure toward an unreachable boundary.",
    instruction:
      "Move to relocate the geometric origin · tap to send a pulse across curved space",
  },
  {
    id: "forward-pass",
    number: "10",
    title: "Forward Pass",
    type: "creatoros-field",
    kind: "Transformer",
    mode: 7,
    initialState: "propagating",
    resetLabel: "Reroute",
    description:
      "Five spectral token currents cross four fluid transformer chambers: causal context folds between lanes, gated hidden blooms expand and collapse, and every result rejoins its residual current.",
    instruction:
      "Move to bias the gates · tap to inject a token pulse and watch it propagate through the chambers",
  },
];

const FIRST_STUDY_SCROLL_UNITS = 1.35;
const RUPTURE_OPEN_SCROLL_UNITS = 0.92;
const STUDY_SCROLL_UNITS = 1;
const STUDY_ACTIVATION_LEAD_UNITS = 0.16;
const EXIT_DURATION_MS = 420;
const ENTER_DURATION_MS = 620;

const STUDY_TRANSITIONS = {
  "second-surface": { enter: "second-surface", exit: "second-surface" },
  metabloom: { enter: "metabloom", exit: "metabloom" },
  "tidal-weave": { enter: "tidal-weave", exit: "tidal-weave" },
  "moire-halo": { enter: "moire-halo", exit: "moire-halo" },
  "contour-drift": { enter: "contour-drift", exit: "contour-drift" },
  "lava-lamp": { enter: "native", exit: "lava-lamp" },
  "morphogen-divide": {
    enter: "morphogen-divide",
    exit: "morphogen-divide",
  },
  "quasicrystal-chorus": {
    enter: "quasicrystal-chorus",
    exit: "quasicrystal-chorus",
  },
  "hyperbolic-garden": {
    enter: "hyperbolic-garden",
    exit: "hyperbolic-garden",
  },
  "forward-pass": { enter: "forward-pass", exit: "forward-pass" },
};

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const scrollUnitsForStudy = (index) =>
  index === 0
    ? 0
    : FIRST_STUDY_SCROLL_UNITS + (index - 1) * STUDY_SCROLL_UNITS;

const studyIndexForScrollUnits = (units) => {
  if (units < FIRST_STUDY_SCROLL_UNITS - STUDY_ACTIVATION_LEAD_UNITS) {
    return 0;
  }

  return clamp(
    1
      + Math.floor(
        units
          - FIRST_STUDY_SCROLL_UNITS
          + STUDY_ACTIVATION_LEAD_UNITS,
      ),
    1,
    STUDIES.length - 1,
  );
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

const DitherFieldLab = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const pageRef = useRef(null);
  const pageTopRef = useRef(0);
  const scrollFrameRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const [displayStudyIndex, setDisplayStudyIndex] = useState(0);
  const [requestedStudyIndex, setRequestedStudyIndex] = useState(0);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState(null);
  const [transitionPhase, setTransitionPhase] = useState("idle");
  const [transitionStyle, setTransitionStyle] = useState(
    STUDY_TRANSITIONS[STUDIES[0].id].enter,
  );
  const [transitionDirection, setTransitionDirection] = useState("forward");
  const [firstSurfaceProgress, setFirstSurfaceProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const activeStudy = STUDIES[displayStudyIndex];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Dither Field Lab | Popular Consulting";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      reducedMotionRef.current = Boolean(motionQuery?.matches);
    };

    syncMotionPreference();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncMotionPreference);
    } else {
      motionQuery?.addListener?.(syncMotionPreference);
    }

    return () => {
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", syncMotionPreference);
      } else {
        motionQuery?.removeListener?.(syncMotionPreference);
      }
    };
  }, []);

  useEffect(() => {
    const syncScrollPosition = () => {
      scrollFrameRef.current = 0;
      const page = pageRef.current;
      if (!page) return;

      const viewportHeight = Math.max(window.innerHeight, 1);
      const pageTop = pageTopRef.current;
      const maximumUnits = scrollUnitsForStudy(STUDIES.length - 1);
      const scrollUnits = clamp(
        (window.scrollY - pageTop) / viewportHeight,
        0,
        maximumUnits,
      );
      const nextStudyIndex = studyIndexForScrollUnits(scrollUnits);
      const studyStart = scrollUnitsForStudy(nextStudyIndex);
      const localProgress = clamp(
        (scrollUnits - studyStart) / STUDY_SCROLL_UNITS,
      );
      const ruptureProgress = clamp(
        scrollUnits / RUPTURE_OPEN_SCROLL_UNITS,
      );

      setRequestedStudyIndex(nextStudyIndex);
      setFirstSurfaceProgress((previousProgress) =>
        Math.abs(previousProgress - ruptureProgress) >= 0.002
          ? ruptureProgress
          : previousProgress,
      );
      page.style.setProperty(
        "--dither-study-progress",
        localProgress.toFixed(3),
      );
      page.style.setProperty(
        "--dither-copy-drift",
        `${((0.5 - localProgress) * 8).toFixed(2)}px`,
      );
    };

    const measurePageTop = () => {
      const page = pageRef.current;
      if (!page) return;
      pageTopRef.current = page.getBoundingClientRect().top + window.scrollY;
    };

    const handleScroll = () => {
      if (scrollFrameRef.current) return;
      scrollFrameRef.current = window.requestAnimationFrame(syncScrollPosition);
    };

    const handleResize = () => {
      measurePageTop();
      handleScroll();
    };

    measurePageTop();
    syncScrollPosition();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(scrollFrameRef.current);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (
      transitionPhase !== "idle"
      || requestedStudyIndex === displayStudyIndex
    ) {
      return;
    }

    if (reducedMotionRef.current) {
      const nextStudy = STUDIES[requestedStudyIndex];
      setDisplayStudyIndex(requestedStudyIndex);
      setFieldState(nextStudy.initialState);
      setTransitionStyle(STUDY_TRANSITIONS[nextStudy.id].enter);
      return;
    }

    setTransitionTargetIndex(requestedStudyIndex);
    setTransitionDirection(
      requestedStudyIndex > displayStudyIndex ? "forward" : "backward",
    );
    setTransitionStyle(STUDY_TRANSITIONS[activeStudy.id].exit);
    setTransitionPhase("exiting");
  }, [activeStudy.id, displayStudyIndex, requestedStudyIndex, transitionPhase]);

  useEffect(() => {
    if (transitionPhase !== "exiting" || transitionTargetIndex === null) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const nextStudy = STUDIES[transitionTargetIndex];
      const entranceStyle = STUDY_TRANSITIONS[nextStudy.id].enter;
      setDisplayStudyIndex(transitionTargetIndex);
      setFieldState(nextStudy.initialState);

      if (entranceStyle === "native") {
        setTransitionStyle("native");
        setTransitionPhase("idle");
        setTransitionTargetIndex(null);
        return;
      }

      setTransitionStyle(entranceStyle);
      setTransitionPhase("entering");
    }, EXIT_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [transitionPhase, transitionTargetIndex]);

  useEffect(() => {
    if (transitionPhase !== "entering") return undefined;

    const timer = window.setTimeout(() => {
      setTransitionPhase("idle");
      setTransitionTargetIndex(null);
    }, ENTER_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [transitionPhase]);

  const scrollToStudy = (index) => {
    const page = pageRef.current;
    const viewportHeight = Math.max(window.innerHeight, 1);
    const pageTop = page ? pageTopRef.current : 0;
    const top = pageTop + scrollUnitsForStudy(index) * viewportHeight;

    window.scrollTo({
      top,
      behavior: reducedMotionRef.current ? "auto" : "smooth",
    });
  };

  const resetActiveStudy = () => {
    if (displayStudyIndex === 0) scrollToStudy(0);
    setResetVersion((value) => value + 1);
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
          progress={firstSurfaceProgress}
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

    return (
      <CreatorOSFieldCanvas
        {...sharedProps}
        mode={activeStudy.mode}
        onFieldStateChange={setFieldState}
      />
    );
  };

  return (
    <main
      ref={pageRef}
      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase}`}
      aria-label="Spectral Display dither field lab"
    >
      <div className="dither-fixed-stage">
        <div
          key={activeStudy.id}
          className={`dither-study-scene is-${transitionPhase}`}
          data-transition={transitionStyle}
          data-direction={transitionDirection}
          aria-hidden="true"
        >
          {renderActiveStudy()}
        </div>

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
                onClick={resetActiveStudy}
              >
                {activeStudy.resetLabel}
              </button>
            </div>
          </nav>
        </header>

        <section
          key={`copy-${activeStudy.id}`}
          className={`rupture-copy dither-copy is-${transitionPhase}`}
          data-transition={transitionStyle}
          data-direction={transitionDirection}
          aria-labelledby="rupture-title"
          aria-live="polite"
          aria-atomic="true"
        >
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
            {STUDIES.map((study, index) => {
              const isActive = index === displayStudyIndex;
              const isTargeted = index === requestedStudyIndex;
              return (
                <button
                  key={study.id}
                  type="button"
                  className={`dither-study-option${isActive ? " is-active" : ""}${isTargeted ? " is-targeted" : ""}`}
                  onClick={() => scrollToStudy(index)}
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
      </div>

      <div className="dither-scroll-sequence" aria-hidden="true">
        {STUDIES.map((study, index) => (
          <section
            key={`scroll-${study.id}`}
            className={`dither-scroll-step${index === 0 ? " is-opening-step" : ""}`}
            data-study-index={index}
          />
        ))}
      </div>
    </main>
  );
};

const DitherCanvasPage = () => (
  <ThemeProvider>
    <DitherFieldLab />
  </ThemeProvider>
);

export default DitherCanvasPage;
