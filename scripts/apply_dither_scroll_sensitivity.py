from pathlib import Path


def replace_exact(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}.")
    return text.replace(old, new)


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found.")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found.")
    return text[:start] + replacement + text[end:]


page_path = Path("src/components/DitherCanvasPage.js")
page = page_path.read_text(encoding="utf-8")

profile_block = '''const DESKTOP_SCROLL_PROFILE = Object.freeze({
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

'''

page = replace_between(
    page,
    "const FIRST_STUDY_SCROLL_UNITS = 1.35;",
    "const ThemeIcon = ({ isDark }) =>",
    profile_block,
    "scroll profile block",
)

page = replace_exact(
    page,
    '''  const scrollFrameRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const [displayStudyIndex, setDisplayStudyIndex] = useState(0);''',
    '''  const scrollFrameRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const scrollProfileRef = useRef(DESKTOP_SCROLL_PROFILE);
  const viewportHeightRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const displayStudyIndexRef = useRef(0);
  const directNavigationTargetRef = useRef(null);
  const [displayStudyIndex, setDisplayStudyIndex] = useState(0);''',
    "scroll refs",
)

page = replace_exact(
    page,
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const activeStudy = STUDIES[displayStudyIndex];''',
    '''  const [fieldState, setFieldState] = useState(STUDIES[0].initialState);
  const activeStudy = STUDIES[displayStudyIndex];
  displayStudyIndexRef.current = displayStudyIndex;''',
    "display index ref synchronization",
)

scroll_effect = '''  useEffect(() => {
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
  }, []);'''

sync_scroll_index = page.find("    const syncScrollPosition = () => {")
if sync_scroll_index < 0:
    raise SystemExit("scroll synchronization effect: sync marker not found.")
scroll_effect_start = page.rfind("  useEffect(() => {", 0, sync_scroll_index)
scroll_effect_end = page.find(
    '''

  useEffect(() => {
    if (
      transitionPhase !== "idle"''',
    sync_scroll_index,
)
if scroll_effect_start < 0 or scroll_effect_end < 0:
    raise SystemExit("scroll synchronization effect boundaries not found.")
page = page[:scroll_effect_start] + scroll_effect + page[scroll_effect_end:]

navigation_cleanup = '''  useEffect(() => {
    if (
      transitionPhase === "idle"
      && directNavigationTargetRef.current === displayStudyIndex
    ) {
      directNavigationTargetRef.current = null;
    }
  }, [displayStudyIndex, transitionPhase]);

'''

page = replace_exact(
    page,
    "  const scrollToStudy = (index) => {",
    navigation_cleanup + "  const scrollToStudy = (index) => {",
    "direct navigation cleanup",
)

scroll_to_study = '''  const scrollToStudy = (index) => {
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

'''

page = replace_between(
    page,
    "  const scrollToStudy = (index) => {",
    "  const resetActiveStudy = () => {",
    scroll_to_study,
    "scrollToStudy",
)
page_path.write_text(page, encoding="utf-8")

css_path = Path("src/components/DitherScrollNarrative.css")
css = css_path.read_text(encoding="utf-8")
css = replace_exact(
    css,
    '''.dither-scroll-step {
  height: 100dvh;
  min-height: 48rem;
}

.dither-scroll-step.is-opening-step {
  height: 135dvh;
}''',
    '''.dither-scroll-step {
  height: var(--dither-study-scroll-height, 118dvh);
  min-height: var(--dither-study-scroll-height, 118dvh);
}

.dither-scroll-step.is-opening-step {
  height: var(--dither-opening-scroll-height, 155dvh);
  min-height: var(--dither-opening-scroll-height, 155dvh);
}''',
    "scroll step sizing",
)
css_path.write_text(css, encoding="utf-8")

page_test_path = Path("src/components/DitherCanvasPage.test.js")
page_test = page_test_path.read_text(encoding="utf-8")
page_test = replace_exact(
    page_test,
    '''    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
      writable: true,
    });''',
    '''    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
      writable: true,
    });''',
    "test viewport width",
)

first_scroll_test = '''  test("opens the first surface from page scroll before advancing studies", () => {
    render(<DitherCanvasPage />);

    moveScrollTo(540);
    expect(
      Number(screen.getByTestId("rupture-renderer").dataset.progress),
    ).toBeCloseTo(0.5, 1);
    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();

    moveScrollTo(1500);
    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass(
      "dither-transition-idle",
    );

    moveScrollTo(1620);
    expect(screen.getByRole("main")).toHaveClass(
      "dither-transition-exiting",
    );

    act(() => {
      jest.advanceTimersByTime(430);
    });
    expect(
      screen.getByRole("heading", { name: "Metabloom" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "0",
    );
    expect(screen.getByRole("main")).toHaveClass(
      "dither-transition-entering",
    );

    act(() => {
      jest.advanceTimersByTime(630);
    });
    expect(screen.getByRole("main")).toHaveClass("dither-transition-idle");
  });

'''

page_test = replace_between(
    page_test,
    '''  test("opens the first surface from page scroll before advancing studies", () => {''',
    '''  test("field controls scroll to a study and preserve the lava lamp entrance", () => {''',
    first_scroll_test,
    "desktop scroll pacing test",
)

page_test = replace_exact(
    page_test,
    '''    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 5350,
      behavior: "smooth",
    });''',
    '''    const scrollOptions = window.scrollTo.mock.calls[0][0];
    expect(scrollOptions.behavior).toBe("smooth");
    expect(scrollOptions.top).toBeCloseTo(6370, 0);''',
    "study control scroll target",
)

mobile_test = '''  test("slows coarse mobile scrolling and keeps toolbar resizing stable", () => {
    window.innerWidth = 390;
    window.innerHeight = 800;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === "(pointer: coarse)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));

    render(<DitherCanvasPage />);

    const main = screen.getByRole("main");
    expect(
      main.style.getPropertyValue("--dither-opening-scroll-height"),
    ).toBe("1560px");
    expect(
      main.style.getPropertyValue("--dither-study-scroll-height"),
    ).toBe("1240px");

    moveScrollTo(1600);
    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();

    window.innerHeight = 700;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    flushScrollFrame();
    expect(
      main.style.getPropertyValue("--dither-opening-scroll-height"),
    ).toBe("1560px");
    expect(
      main.style.getPropertyValue("--dither-study-scroll-height"),
    ).toBe("1240px");

    moveScrollTo(7000);
    expect(main).toHaveClass("dither-transition-exiting");
    finishStudyTransition();
    expect(
      screen.getByRole("heading", { name: "Metabloom" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Forward Pass" }),
    ).not.toBeInTheDocument();
  });

'''

page_test = replace_exact(
    page_test,
    '''  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    mobile_test
    + '''  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {''',
    "mobile scroll pacing test",
)
page_test_path.write_text(page_test, encoding="utf-8")

narrative_test_path = Path("src/components/DitherScrollNarrative.test.js")
narrative_test = narrative_test_path.read_text(encoding="utf-8")
old_mapping_test = '''  test("maps native page scroll through all ten studies", () => {
    expect(pageSource).toContain("const FIRST_STUDY_SCROLL_UNITS = 1.35");
    expect(pageSource).toContain("const RUPTURE_OPEN_SCROLL_UNITS = 0.92");
    expect(pageSource).toContain("studyIndexForScrollUnits");
    expect(pageSource).toContain('window.addEventListener("scroll", handleScroll');
    expect(pageSource).toContain('className="dither-scroll-sequence"');
    expect(pageSource).toContain("progress={firstSurfaceProgress}");
  });'''
new_mapping_test = '''  test("maps native page scroll through paced desktop and mobile profiles", () => {
    expect(pageSource).toContain("const DESKTOP_SCROLL_PROFILE");
    expect(pageSource).toContain("openingUnits: 1.55");
    expect(pageSource).toContain("studyUnits: 1.18");
    expect(pageSource).toContain("const MOBILE_SCROLL_PROFILE");
    expect(pageSource).toContain("openingUnits: 1.95");
    expect(pageSource).toContain("studyUnits: 1.55");
    expect(pageSource).toContain("limitMomentum: true");
    expect(pageSource).toContain('window.matchMedia?.("(pointer: coarse)")');
    expect(pageSource).toContain("VIEWPORT_WIDTH_CHANGE_THRESHOLD");
    expect(pageSource).toContain("viewportHeightRef");
    expect(pageSource).toContain("directNavigationTargetRef");
    expect(pageSource).toContain("studyIndexForScrollUnits");
    expect(pageSource).toContain('window.addEventListener("scroll", handleScroll');
    expect(pageSource).toContain('className="dither-scroll-sequence"');
    expect(pageSource).toContain("progress={firstSurfaceProgress}");
    expect(narrativeStyles).toContain(
      "height: var(--dither-study-scroll-height, 118dvh)",
    );
    expect(narrativeStyles).toContain(
      "height: var(--dither-opening-scroll-height, 155dvh)",
    );
  });'''
narrative_test = replace_exact(
    narrative_test,
    old_mapping_test,
    new_mapping_test,
    "scroll narrative profile test",
)
narrative_test_path.write_text(narrative_test, encoding="utf-8")
