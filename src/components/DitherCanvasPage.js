import React, { useCallback, useEffect, useRef, useState } from "react";
import logo from "../assets/icons/logo2026_128.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import { canAttemptHighFidelityMobileGraphics } from "../utils/mobileGraphicsCapability";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import CreatorOSLavaLampCanvas from "./CreatorOSLavaLampCanvas";
import ProductionThemeCanvas from "./ProductionThemeCanvas";
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
      "CreatorOS wax physics become an orbital organism: spectral pigment or mirror-bright liquid metal merges, stretches, and blooms around the observer.",
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
      "A functional relief map drifts beneath indexed white contour lines. Hypsometric elevation bands and hillshade reveal the terrain, while a hairline spectral gradient traces every contour edge.",
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
  {
    id: "light-theme",
    number: "11",
    title: "Radiant Lattice",
    type: "production-theme",
    theme: "light",
    kind: "Production",
    initialState: "radiating",
    resetLabel: "Restart",
    description:
      "The production light field enters the lab intact: responsive glyph ripples, spectral flow, and a full-resolution dither composite driven by the optimized field pass.",
    instruction:
      "Move through the field · tap to launch a ripple · choose Restart to rebuild the light runtime",
  },
  {
    id: "dark-theme",
    number: "12",
    title: "Event Horizon",
    type: "production-theme",
    theme: "dark",
    kind: "Production",
    initialState: "warping",
    resetLabel: "Restart",
    description:
      "The production dark field brings its geodesic horizon into the lab, reusing the optimized transport map and material pass without duplicating the black-hole shader.",
    instruction:
      "Move to bend the horizon · choose Restart to rebuild the dark transport",
  },
];

const ORIGINAL_SECOND_SURFACE = Object.freeze({
  id: "original-second-surface",
  title: "Original Second Surface",
});
const SECOND_SURFACE_STUDIES = STUDIES.filter(
  (study) => study.id !== "second-surface",
);
const SECOND_SURFACE_OPTIONS = Object.freeze([
  ORIGINAL_SECOND_SURFACE,
  ...SECOND_SURFACE_STUDIES,
]);

const DESKTOP_SCROLL_PROFILE = Object.freeze({
  openingUnits: 1.55,
  ruptureOpenUnits: 1.08,
  studyUnits: 1.18,
  activationOffsetUnits: 0.06,
  limitMomentum: false,
});

const MOBILE_SCROLL_PROFILE = Object.freeze({
  openingUnits: 1.95,
  ruptureOpenUnits: 1.35,
  studyUnits: 1.55,
  activationOffsetUnits: 0.12,
  limitMomentum: true,
});

const MOBILE_SCROLL_MAX_WIDTH = 820;
const STUDY_TARGET_PADDING_UNITS = 0.04;
const VIEWPORT_WIDTH_CHANGE_THRESHOLD = 48;
const METABLOOM_PALETTE_SPECTRAL = "spectral";
const METABLOOM_PALETTE_METALBLOOM = "metalbloom";
const TIDAL_PALETTE_WATER = "water";
const TIDAL_PALETTE_SPECTRAL = "spectral";
const CONTOUR_PALETTE_TERRAIN = "terrain";
const CONTOUR_PALETTE_SPECTRAL = "spectral";
const MORPHOGEN_EXPERIENCE_ORGANISM = "organism";
const MORPHOGEN_EXPERIENCE_PAINT = "paint";
const MORPHOGEN_TOOL_DRAW = "draw";
const MORPHOGEN_TOOL_ERASE = "erase";
const MORPHOGEN_BRUSH_FINE = "fine";
const MORPHOGEN_BRUSH_MEDIUM = "medium";
const MORPHOGEN_BRUSH_BROAD = "broad";
const MORPHOGEN_GRADIENT_FLOW = "flow";
const MORPHOGEN_GRADIENT_LINEAR = "linear";
const MORPHOGEN_GRADIENT_RADIAL = "radial";
const MORPHOGEN_COLOR_A_DEFAULT = "#24ccff";
const MORPHOGEN_COLOR_B_DEFAULT = "#ff56d6";
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
  "light-theme": { enter: "production-theme", exit: "production-theme" },
  "dark-theme": { enter: "production-theme", exit: "production-theme" },
};

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const resolveScrollProfile = () => {
  if (typeof window === "undefined") return DESKTOP_SCROLL_PROFILE;

  const hasCoarsePointer = Boolean(
    window.matchMedia?.("(pointer: coarse)")?.matches,
  );
  return hasCoarsePointer || window.innerWidth <= MOBILE_SCROLL_MAX_WIDTH
    ? MOBILE_SCROLL_PROFILE
    : DESKTOP_SCROLL_PROFILE;
};

const scrollUnitsForStudy = (index, profile) =>
  index === 0
    ? 0
    : profile.openingUnits + (index - 1) * profile.studyUnits;

const totalScrollUnits = (profile) =>
  profile.openingUnits + (STUDIES.length - 1) * profile.studyUnits;

const scrollTargetUnitsForStudy = (index, profile) =>
  index === 0
    ? 0
    : scrollUnitsForStudy(index, profile)
      + profile.activationOffsetUnits
      + STUDY_TARGET_PADDING_UNITS;

const studyIndexForScrollUnits = (units, profile) => {
  const firstActivation =
    profile.openingUnits + profile.activationOffsetUnits;
  if (units < firstActivation) return 0;

  return clamp(
    1 + Math.floor((units - firstActivation) / profile.studyUnits),
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
  const scrollProfileRef = useRef(DESKTOP_SCROLL_PROFILE);
  const viewportHeightRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const displayStudyIndexRef = useRef(0);
  const directNavigationTargetRef = useRef(null);
  const syncedThemeStudyRef = useRef(null);
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
  const [mobileLightRuntimeFailed, setMobileLightRuntimeFailed] = useState(false);
  const [secondSurfaceStudyId, setSecondSurfaceStudyId] = useState(
    ORIGINAL_SECOND_SURFACE.id,
  );
  const [metabloomPalette, setMetabloomPalette] = useState(
    METABLOOM_PALETTE_SPECTRAL,
  );
  const [tidalPalette, setTidalPalette] = useState(TIDAL_PALETTE_WATER);
  const [contourPalette, setContourPalette] = useState(
    CONTOUR_PALETTE_TERRAIN,
  );
  const [morphogenExperience, setMorphogenExperience] = useState(
    MORPHOGEN_EXPERIENCE_ORGANISM,
  );
  const [morphogenTool, setMorphogenTool] = useState(MORPHOGEN_TOOL_DRAW);
  const [morphogenBrushSize, setMorphogenBrushSize] = useState(
    MORPHOGEN_BRUSH_MEDIUM,
  );
  const [morphogenGradient, setMorphogenGradient] = useState(
    MORPHOGEN_GRADIENT_FLOW,
  );
  const [morphogenColorA, setMorphogenColorA] = useState(
    MORPHOGEN_COLOR_A_DEFAULT,
  );
  const [morphogenColorB, setMorphogenColorB] = useState(
    MORPHOGEN_COLOR_B_DEFAULT,
  );
  const activeStudy = STUDIES[displayStudyIndex];
  const secondSurfaceOption = SECOND_SURFACE_OPTIONS.find(
    (study) => study.id === secondSurfaceStudyId,
  ) || ORIGINAL_SECOND_SURFACE;
  const secondSurfaceStudy =
    secondSurfaceOption.id === ORIGINAL_SECOND_SURFACE.id
      ? null
      : secondSurfaceOption;
  const usesExternalSecondSurface = secondSurfaceStudy !== null;
  const highFidelityMobileLight =
    activeStudy.id === "light-theme"
    && hasHardwareWebGL
    && isMobileTier
    && !mobileLightRuntimeFailed
    && canAttemptHighFidelityMobileGraphics({
      hardwareConcurrency:
        typeof navigator === "undefined" ? null : navigator.hardwareConcurrency,
      deviceMemory:
        typeof navigator === "undefined" ? null : navigator.deviceMemory,
      saveData:
        typeof navigator !== "undefined"
        && navigator.connection?.saveData === true,
    });
  const isMorphogenPaintMode =
    activeStudy.id === "morphogen-divide"
    && morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT;
  const activeDescription = activeStudy.id === "second-surface"
    ? usesExternalSecondSurface
      ? `A second surface waits beneath the page. The tear now reveals ${secondSurfaceStudy.title} as a live field beneath the original material.`
      : activeStudy.description
    : isMorphogenPaintMode
      ? "A living sand canvas turns reaction-diffusion pigment into a drawable material. Every stroke settles, diffuses, and glints with the colors you choose."
      : activeStudy.description;
  const activeInstruction = activeStudy.id === "second-surface"
    ? "Choose a surface below · scroll to open the tear · scroll back to close it · choose Heal to seal the surface"
    : isMorphogenPaintMode
      ? "Drag anywhere to paint · switch to erase for corrections · choose two colors and a gradient · Clear starts fresh"
      : activeStudy.instruction;
  const activeResetLabel = isMorphogenPaintMode
    ? "Clear"
    : activeStudy.resetLabel;
  displayStudyIndexRef.current = displayStudyIndex;

  const ignoreFieldStateChange = useCallback(() => {}, []);

  const handleProductionThemeStateChange = useCallback((state) => {
    if (state === "fallback" && highFidelityMobileLight) {
      setMobileLightRuntimeFailed(true);
      return;
    }
    setFieldState(state);
  }, [highFidelityMobileLight]);

  // Sand Paint is opt-in for the current Morphogen visit. Leaving the study
  // restores the original autonomous organism while preserving paint settings.
  useEffect(() => {
    if (
      activeStudy.id !== "morphogen-divide"
      && morphogenExperience !== MORPHOGEN_EXPERIENCE_ORGANISM
    ) {
      setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM);
    }
  }, [activeStudy.id, morphogenExperience]);

  useEffect(() => {
    const forcedTheme = activeStudy.theme;
    if (!forcedTheme) {
      syncedThemeStudyRef.current = null;
      return;
    }
    if (syncedThemeStudyRef.current === activeStudy.id) return;

    syncedThemeStudyRef.current = activeStudy.id;
    const shouldUseDarkTheme = forcedTheme === "dark";
    if (isDark !== shouldUseDarkTheme) toggleTheme();
  }, [activeStudy.id, activeStudy.theme, isDark, toggleTheme]);

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
    const updateScrollGeometry = ({ forceViewportHeight = false } = {}) => {
      const page = pageRef.current;
      if (!page) return;

      const previousProfile = scrollProfileRef.current;
      const nextProfile = resolveScrollProfile();
      const nextWidth = Math.max(window.innerWidth || 0, 1);
      const nextHeight = Math.max(window.innerHeight || 0, 1);
      const widthChanged =
        viewportWidthRef.current === 0
        || Math.abs(nextWidth - viewportWidthRef.current)
          >= VIEWPORT_WIDTH_CHANGE_THRESHOLD;
      const profileChanged = previousProfile !== nextProfile;
      const shouldRefreshViewportHeight =
        forceViewportHeight
        || viewportHeightRef.current === 0
        || !nextProfile.limitMomentum
        || widthChanged
        || profileChanged;

      if (shouldRefreshViewportHeight) {
        viewportHeightRef.current = nextHeight;
      }
      viewportWidthRef.current = nextWidth;
      scrollProfileRef.current = nextProfile;
      pageTopRef.current = page.getBoundingClientRect().top + window.scrollY;
      page.style.setProperty(
        "--dither-opening-scroll-height",
        `${Math.round(
          nextProfile.openingUnits * viewportHeightRef.current,
        )}px`,
      );
      page.style.setProperty(
        "--dither-study-scroll-height",
        `${Math.round(
          nextProfile.studyUnits * viewportHeightRef.current,
        )}px`,
      );
    };

    const syncScrollPosition = () => {
      scrollFrameRef.current = 0;
      const page = pageRef.current;
      if (!page) return;

      const profile = scrollProfileRef.current;
      const viewportHeight = Math.max(viewportHeightRef.current, 1);
      const pageTop = pageTopRef.current;
      const scrollUnits = clamp(
        (window.scrollY - pageTop) / viewportHeight,
        0,
        totalScrollUnits(profile),
      );
      const rawStudyIndex = studyIndexForScrollUnits(
        scrollUnits,
        profile,
      );
      const directTarget = directNavigationTargetRef.current;
      const currentIndex = displayStudyIndexRef.current;
      const nextStudyIndex = directTarget !== null
        ? directTarget
        : profile.limitMomentum
          ? clamp(rawStudyIndex, currentIndex - 1, currentIndex + 1)
          : rawStudyIndex;
      const studyStart = scrollUnitsForStudy(nextStudyIndex, profile);
      const studySpan = nextStudyIndex === 0
        ? profile.openingUnits
        : profile.studyUnits;
      const localProgress = clamp(
        (scrollUnits - studyStart) / studySpan,
      );
      const ruptureProgress = clamp(
        scrollUnits / profile.ruptureOpenUnits,
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

    const handleScroll = () => {
      if (scrollFrameRef.current) return;
      scrollFrameRef.current = window.requestAnimationFrame(
        syncScrollPosition,
      );
    };

    const handleResize = () => {
      updateScrollGeometry();
      handleScroll();
    };

    updateScrollGeometry({ forceViewportHeight: true });
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

  useEffect(() => {
    if (
      transitionPhase === "idle"
      && directNavigationTargetRef.current === displayStudyIndex
    ) {
      directNavigationTargetRef.current = null;
    }
  }, [displayStudyIndex, transitionPhase]);

  const scrollToStudy = (index) => {
    const page = pageRef.current;
    const profile = scrollProfileRef.current;
    const viewportHeight = Math.max(
      viewportHeightRef.current || window.innerHeight,
      1,
    );
    const pageTop = page ? pageTopRef.current : 0;
    const targetUnits = scrollTargetUnitsForStudy(index, profile);
    const top = pageTop + targetUnits * viewportHeight;

    directNavigationTargetRef.current =
      index === displayStudyIndexRef.current ? null : index;
    window.scrollTo({
      top,
      behavior: reducedMotionRef.current ? "auto" : "smooth",
    });
  };

  const resetActiveStudy = () => {
    if (displayStudyIndex === 0) scrollToStudy(0);
    if (activeStudy.id === "light-theme") {
      setMobileLightRuntimeFailed(false);
    }
    setResetVersion((value) => value + 1);
  };

  const renderStudy = (study, { asSecondSurface = false } = {}) => {
    const sharedPaused = paused || transitionPhase === "exiting";
    // A selected underlay runs behind the sealed first surface so the seam
    // reveals an already-moving field rather than triggering a second entrance.
    const rendererPaused = sharedPaused;
    const stateHandler = asSecondSurface
      ? ignoreFieldStateChange
      : setFieldState;

    if (study.type === "creatoros-lava") {
      return (
        <CreatorOSLavaLampCanvas
          isDark={isDark}
          paused={rendererPaused}
          resetVersion={resetVersion}
          onFieldStateChange={stateHandler}
        />
      );
    }

    if (study.type === "production-theme") {
      return (
        <ProductionThemeCanvas
          paused={rendererPaused}
          resetVersion={resetVersion}
          theme={study.theme}
          highFidelityLight={asSecondSurface ? false : highFidelityMobileLight}
          runtimeScope={asSecondSurface ? "dither-canvas-second-surface" : "dither-canvas-lab"}
          onFieldStateChange={
            asSecondSurface ? ignoreFieldStateChange : handleProductionThemeStateChange
          }
        />
      );
    }

    return (
      <CreatorOSFieldCanvas
        isDark={isDark}
        paused={rendererPaused}
        resetVersion={resetVersion}
        mode={study.mode}
        metabloomPalette={metabloomPalette}
        contourPalette={contourPalette}
        tidalPalette={tidalPalette}
        morphogenExperience={morphogenExperience}
        morphogenTool={morphogenTool}
        morphogenBrushSize={morphogenBrushSize}
        morphogenGradient={morphogenGradient}
        morphogenColorA={morphogenColorA}
        morphogenColorB={morphogenColorB}
        onFieldStateChange={stateHandler}
      />
    );
  };

  const renderActiveStudy = () => {
    if (activeStudy.type === "rupture") {
      return (
        <div
          className="second-surface-stack"
          data-second-surface-study={secondSurfaceOption.id}
        >
          {usesExternalSecondSurface && (
            <div
              key={`second-surface-underlay-${secondSurfaceStudy.id}`}
              className="second-surface-underlay"
            >
              {renderStudy(secondSurfaceStudy, { asSecondSurface: true })}
            </div>
          )}
          <div className="second-surface-rupture">
            <RuptureCanvas
              isDark={isDark}
              paused={paused || transitionPhase === "exiting"}
              resetVersion={resetVersion}
              progress={firstSurfaceProgress}
              revealUnderlay={usesExternalSecondSurface}
              onRuptureStateChange={setFieldState}
            />
          </div>
        </div>
      );
    }

    return renderStudy(activeStudy);
  };

  return (
    <main
      ref={pageRef}
      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase}${isMorphogenPaintMode ? " dither-morphogen-paint" : ""}`}
      data-active-study={activeStudy.id}
      data-theme-mode={isDark ? "dark" : "light"}
      data-mobile-light-detail={
        activeStudy.id === "light-theme"
          ? highFidelityMobileLight
            ? "high-fidelity"
            : mobileLightRuntimeFailed
              ? "compatibility-fallback"
              : "compatibility"
          : "inactive"
      }
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
                {activeResetLabel}
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
          <p className="rupture-description">{activeDescription}</p>
          <p className="rupture-instruction">{activeInstruction}</p>
        </section>

        <nav className="dither-study-switcher" aria-label="Dither background studies">
          <p className="dither-study-switcher-label">Field studies</p>
          {activeStudy.id === "second-surface" && (
            <label className="second-surface-selector">
              <span className="second-surface-selector-label">Surface</span>
              <select
                value={secondSurfaceOption.id}
                onChange={(event) => setSecondSurfaceStudyId(event.target.value)}
                aria-label="Choose the theme beneath Second Surface"
              >
                {SECOND_SURFACE_OPTIONS.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {activeStudy.id === "metabloom" && (
            <div
              className="metabloom-palette-selector"
              role="group"
              aria-label="Metabloom material finish"
            >
              <span className="metabloom-palette-selector-label">Finish</span>
              <button
                type="button"
                className={`metabloom-palette-option${
                  metabloomPalette === METABLOOM_PALETTE_SPECTRAL
                    ? " is-active"
                    : ""
                }`}
                data-palette="spectral"
                onClick={() => setMetabloomPalette(METABLOOM_PALETTE_SPECTRAL)}
                aria-pressed={metabloomPalette === METABLOOM_PALETTE_SPECTRAL}
                aria-label="Use spectral fluid for Metabloom"
              >
                Spectral
              </button>
              <button
                type="button"
                className={`metabloom-palette-option${
                  metabloomPalette === METABLOOM_PALETTE_METALBLOOM
                    ? " is-active"
                    : ""
                }`}
                data-palette="metalbloom"
                onClick={() => setMetabloomPalette(METABLOOM_PALETTE_METALBLOOM)}
                aria-pressed={
                  metabloomPalette === METABLOOM_PALETTE_METALBLOOM
                }
                aria-label="Use liquid metal for Metabloom"
              >
                Metalbloom
              </button>
            </div>
          )}
          {activeStudy.id === "morphogen-divide" && (
            <div
              className="morphogen-experience-selector"
              role="group"
              aria-label="Morphogen Divide experience"
            >
              <span className="morphogen-experience-selector-label">
                Experience
              </span>
              <button
                type="button"
                className={`morphogen-experience-option${
                  morphogenExperience === MORPHOGEN_EXPERIENCE_ORGANISM
                    ? " is-active"
                    : ""
                }`}
                data-experience="organism"
                onClick={() =>
                  setMorphogenExperience(MORPHOGEN_EXPERIENCE_ORGANISM)
                }
                aria-pressed={
                  morphogenExperience === MORPHOGEN_EXPERIENCE_ORGANISM
                }
                aria-label="Use autonomous organism mode for Morphogen Divide"
              >
                Organism
              </button>
              <button
                type="button"
                className={`morphogen-experience-option${
                  morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT
                    ? " is-active"
                    : ""
                }`}
                data-experience="paint"
                onClick={() =>
                  setMorphogenExperience(MORPHOGEN_EXPERIENCE_PAINT)
                }
                aria-pressed={
                  morphogenExperience === MORPHOGEN_EXPERIENCE_PAINT
                }
                aria-label="Use sand paint mode for Morphogen Divide"
              >
                Paint
              </button>
            </div>
          )}
          {activeStudy.id === "tidal-weave" && (
            <div
              className="tidal-palette-selector"
              role="group"
              aria-label="Tidal Weave color scheme"
            >
              <span className="tidal-palette-selector-label">Color</span>
              <button
                type="button"
                className={`tidal-palette-option${
                  tidalPalette === TIDAL_PALETTE_WATER ? " is-active" : ""
                }`}
                data-palette="water"
                onClick={() => setTidalPalette(TIDAL_PALETTE_WATER)}
                aria-pressed={tidalPalette === TIDAL_PALETTE_WATER}
                aria-label="Use water colors for Tidal Weave"
              >
                Water
              </button>
              <button
                type="button"
                className={`tidal-palette-option${
                  tidalPalette === TIDAL_PALETTE_SPECTRAL ? " is-active" : ""
                }`}
                data-palette="spectral"
                onClick={() => setTidalPalette(TIDAL_PALETTE_SPECTRAL)}
                aria-pressed={tidalPalette === TIDAL_PALETTE_SPECTRAL}
                aria-label="Use spectral colors for Tidal Weave"
              >
                Spectral
              </button>
            </div>
          )}
          {activeStudy.id === "contour-drift" && (
            <div
              className="contour-palette-selector"
              role="group"
              aria-label="Contour Drift color scheme"
            >
              <span className="contour-palette-selector-label">Color</span>
              <button
                type="button"
                className={`contour-palette-option${
                  contourPalette === CONTOUR_PALETTE_TERRAIN ? " is-active" : ""
                }`}
                data-palette="terrain"
                onClick={() => setContourPalette(CONTOUR_PALETTE_TERRAIN)}
                aria-pressed={contourPalette === CONTOUR_PALETTE_TERRAIN}
                aria-label="Use terrain colors for Contour Drift"
              >
                Terrain
              </button>
              <button
                type="button"
                className={`contour-palette-option${
                  contourPalette === CONTOUR_PALETTE_SPECTRAL ? " is-active" : ""
                }`}
                data-palette="spectral"
                onClick={() => setContourPalette(CONTOUR_PALETTE_SPECTRAL)}
                aria-pressed={contourPalette === CONTOUR_PALETTE_SPECTRAL}
                aria-label="Use spectral colors for Contour Drift"
              >
                Spectral
              </button>
            </div>
          )}
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

        {isMorphogenPaintMode && (
          <aside
            className="morphogen-paint-toolbar"
            role="toolbar"
            aria-label="Morphogen sand paint tools"
          >
            <div
              className="morphogen-paint-group"
              role="group"
              aria-label="Paint tool"
            >
              <span className="morphogen-paint-group-label">Tool</span>
              <button
                type="button"
                className={`morphogen-paint-option${
                  morphogenTool === MORPHOGEN_TOOL_DRAW ? " is-active" : ""
                }`}
                data-tool="draw"
                onClick={() => setMorphogenTool(MORPHOGEN_TOOL_DRAW)}
                aria-pressed={morphogenTool === MORPHOGEN_TOOL_DRAW}
              >
                Draw
              </button>
              <button
                type="button"
                className={`morphogen-paint-option${
                  morphogenTool === MORPHOGEN_TOOL_ERASE ? " is-active" : ""
                }`}
                data-tool="erase"
                onClick={() => setMorphogenTool(MORPHOGEN_TOOL_ERASE)}
                aria-pressed={morphogenTool === MORPHOGEN_TOOL_ERASE}
              >
                Erase
              </button>
            </div>

            <div
              className="morphogen-paint-group"
              role="group"
              aria-label="Brush size"
            >
              <span className="morphogen-paint-group-label">Brush</span>
              {[
                [MORPHOGEN_BRUSH_FINE, "S", "Fine brush"],
                [MORPHOGEN_BRUSH_MEDIUM, "M", "Medium brush"],
                [MORPHOGEN_BRUSH_BROAD, "L", "Broad brush"],
              ].map(([value, label, ariaLabel]) => (
                <button
                  key={value}
                  type="button"
                  className={`morphogen-paint-option is-compact${
                    morphogenBrushSize === value ? " is-active" : ""
                  }`}
                  data-brush={value}
                  onClick={() => setMorphogenBrushSize(value)}
                  aria-pressed={morphogenBrushSize === value}
                  aria-label={ariaLabel}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="morphogen-paint-group"
              role="group"
              aria-label="Sand gradient"
            >
              <span className="morphogen-paint-group-label">Gradient</span>
              {[
                [MORPHOGEN_GRADIENT_FLOW, "Flow"],
                [MORPHOGEN_GRADIENT_LINEAR, "Linear"],
                [MORPHOGEN_GRADIENT_RADIAL, "Radial"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`morphogen-paint-option${
                    morphogenGradient === value ? " is-active" : ""
                  }`}
                  data-gradient={value}
                  onClick={() => setMorphogenGradient(value)}
                  aria-pressed={morphogenGradient === value}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="morphogen-color-group"
              role="group"
              aria-label="Sand colors"
            >
              <span className="morphogen-paint-group-label">Colors</span>
              <label className="morphogen-color-control">
                <span>A</span>
                <input
                  type="color"
                  value={morphogenColorA}
                  onChange={(event) => setMorphogenColorA(event.target.value)}
                  aria-label="Choose first sand color"
                />
              </label>
              <label className="morphogen-color-control">
                <span>B</span>
                <input
                  type="color"
                  value={morphogenColorB}
                  onChange={(event) => setMorphogenColorB(event.target.value)}
                  aria-label="Choose second sand color"
                />
              </label>
            </div>
          </aside>
        )}

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
