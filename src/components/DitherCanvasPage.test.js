import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("./RuptureCanvas", () => {
  const ReactModule = require("react");
  return ({
    isDark,
    onRuptureStateChange,
    paused,
    progress,
    resetVersion,
    revealUnderlay,
  }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "rupture-renderer",
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-progress": String(progress),
        "data-reset-version": String(resetVersion),
        "data-reveal-underlay": revealUnderlay ? "true" : "false",
        onClick: () => onRuptureStateChange?.("open"),
      },
      "rupture renderer",
    );
});

jest.mock("./CreatorOSFieldCanvas", () => {
  const ReactModule = require("react");
  return ({
    contourPalette = "terrain",
    isDark,
    metabloomPalette = "spectral",
    mode,
    onFieldStateChange,
    paused,
    resetVersion,
    tidalPalette = "water",
  }) => ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "creatoros-field-renderer",
        "data-mode": String(mode),
        "data-metabloom-palette": metabloomPalette,
        "data-contour-palette": contourPalette,
        "data-tidal-palette": tidalPalette,
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onFieldStateChange?.(
          mode === 4 ? "forming" : mode === 7 ? "propagating" : "resonance",
        ),
      },
      "CreatorOS field renderer",
    );
});

jest.mock("./CreatorOSLavaLampCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "creatoros-lava-renderer",
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onFieldStateChange?.("flowing"),
      },
      "CreatorOS lava renderer",
    );
});

jest.mock("./ProductionThemeCanvas", () => {
  const ReactModule = require("react");
  return ({ theme, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "production-theme-renderer",
        "data-production-theme": theme,
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () =>
          onFieldStateChange?.(theme === "dark" ? "warping" : "radiating"),
      },
      `${theme} production theme renderer`,
    );
});

describe("DitherCanvasPage", () => {
  let scrollPosition;

  const flushScrollFrame = () => {
    act(() => {
      jest.advanceTimersByTime(20);
    });
  };

  const finishStudyTransition = () => {
    act(() => {
      jest.advanceTimersByTime(1100);
    });
  };

  const moveScrollTo = (nextPosition) => {
    scrollPosition = nextPosition;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    flushScrollFrame();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    scrollPosition = 0;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollPosition,
    });

    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 0);
    window.cancelAnimationFrame = (frameId) => window.clearTimeout(frameId);
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
    window.scrollTo = jest.fn(({ top = 0 }) => {
      scrollPosition = top;
      window.dispatchEvent(new Event("scroll"));
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("opens as a twelve-study scroll narrative with Second Surface first", () => {
    render(<DitherCanvasPage />);

    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-progress",
      "0",
    );
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reveal-underlay",
      "true",
    );
    const secondSurfaceSelect = screen.getByRole("combobox", {
      name: "Choose the theme beneath Second Surface",
    });
    expect(secondSurfaceSelect).toHaveValue("metabloom");
    expect(within(secondSurfaceSelect).getAllByRole("option")).toHaveLength(11);
    fireEvent.change(secondSurfaceSelect, { target: { value: "dark-theme" } });
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-production-theme",
      "dark",
    );
    expect(document.querySelectorAll(".dither-scroll-step")).toHaveLength(12);

    const studyNavigation = screen.getByRole("navigation", {
      name: "Dither background studies",
    });
    expect(within(studyNavigation).getAllByRole("button")).toHaveLength(12);
    expect(
      within(studyNavigation).getByRole("button", { name: /Second Surface/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(studyNavigation).getByRole("button", { name: /Forward Pass/ }),
    ).toBeInTheDocument();
    expect(
      within(studyNavigation).getByRole("button", { name: /Radiant Lattice/ }),
    ).toBeInTheDocument();
    expect(
      within(studyNavigation).getByRole("button", { name: /Event Horizon/ }),
    ).toBeInTheDocument();
  });

  test("opens the first surface from page scroll before advancing studies", () => {
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

  test("field controls scroll to a study and preserve the lava lamp entrance", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    const scrollOptions = window.scrollTo.mock.calls[0][0];
    expect(scrollOptions.behavior).toBe("smooth");
    expect(scrollOptions.top).toBeCloseTo(6370, 0);
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Lava Lamp" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("creatoros-lava-renderer")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveClass("dither-transition-idle");
    expect(screen.getByRole("button", { name: "Reheat" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reheat" }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
      "data-reset-version",
      "1",
    );
  });

  test("slows coarse mobile scrolling and keeps toolbar resizing stable", () => {
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

  test("keeps spectral Metabloom by default and offers a liquid-metal finish", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Metabloom" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "0");
    expect(renderer).toHaveAttribute("data-metabloom-palette", "spectral");

    const paletteGroup = screen.getByRole("group", {
      name: "Metabloom material finish",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral fluid for Metabloom",
    });
    const metalbloomOption = within(paletteGroup).getByRole("button", {
      name: "Use liquid metal for Metabloom",
    });
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
    expect(metalbloomOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(metalbloomOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "0",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-metabloom-palette",
      "metalbloom",
    );
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");
    expect(metalbloomOption).toHaveAttribute("aria-pressed", "true");
  });

  test("defaults Tidal Weave to water and keeps spectral as a color-only option", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Tidal Weave/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Tidal Weave" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "1");
    expect(renderer).toHaveAttribute("data-tidal-palette", "water");

    const paletteGroup = screen.getByRole("group", {
      name: "Tidal Weave color scheme",
    });
    const waterOption = within(paletteGroup).getByRole("button", {
      name: "Use water colors for Tidal Weave",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral colors for Tidal Weave",
    });
    expect(waterOption).toHaveAttribute("aria-pressed", "true");
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(spectralOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "1",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-tidal-palette",
      "spectral",
    );
    expect(waterOption).toHaveAttribute("aria-pressed", "false");
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
  });

  test("defaults Contour Drift to terrain and keeps spectral as a color-only option", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Contour Drift/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Contour Drift" }),
    ).toBeInTheDocument();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "3");
    expect(renderer).toHaveAttribute("data-contour-palette", "terrain");

    const paletteGroup = screen.getByRole("group", {
      name: "Contour Drift color scheme",
    });
    const terrainOption = within(paletteGroup).getByRole("button", {
      name: "Use terrain colors for Contour Drift",
    });
    const spectralOption = within(paletteGroup).getByRole("button", {
      name: "Use spectral colors for Contour Drift",
    });
    expect(terrainOption).toHaveAttribute("aria-pressed", "true");
    expect(spectralOption).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(spectralOption);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "3",
    );
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-contour-palette",
      "spectral",
    );
    expect(terrainOption).toHaveAttribute("aria-pressed", "false");
    expect(spectralOption).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps theme, pause, state, and Forward Pass behavior across scroll changes", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Forward Pass/ }));
    flushScrollFrame();
    finishStudyTransition();

    expect(
      screen.getByRole("heading", { name: "Forward Pass" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-mode",
      "7",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByTestId("creatoros-field-renderer"));
    expect(screen.getByText("propagating")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-propagating");
  });

  test.each([
    ["Radiant Lattice", "light", "radiating"],
    ["Event Horizon", "dark", "warping"],
  ])("mounts the production %s study with fixed theme behavior", (
    studyTitle,
    theme,
    fieldState,
  ) => {
    render(<DitherCanvasPage />);

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(studyTitle) }),
    );
    flushScrollFrame();
    finishStudyTransition();

    expect(screen.getByRole("heading", { name: studyTitle })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-theme-mode", theme);
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-production-theme",
      theme,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByTestId("production-theme-renderer"));
    expect(screen.getByText(fieldState)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByTestId("production-theme-renderer")).toHaveAttribute(
      "data-reset-version",
      "1",
    );
  });

  test.each([
    ["Second Surface", "rupture-renderer"],
    ["Metabloom", "creatoros-field-renderer"],
    ["Tidal Weave", "creatoros-field-renderer"],
    ["Moiré Halo", "creatoros-field-renderer"],
    ["Contour Drift", "creatoros-field-renderer"],
    ["Lava Lamp", "creatoros-lava-renderer"],
    ["Morphogen Divide", "creatoros-field-renderer"],
    ["Quasicrystal Chorus", "creatoros-field-renderer"],
    ["Hyperbolic Garden", "creatoros-field-renderer"],
    ["Forward Pass", "creatoros-field-renderer"],
  ])("passes both themes through %s", (studyTitle, rendererTestId) => {
    render(<DitherCanvasPage />);

    if (studyTitle !== "Second Surface") {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(studyTitle) }),
      );
      flushScrollFrame();
      finishStudyTransition();
    }

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );
    expect(screen.getByTestId(rendererTestId)).toHaveAttribute(
      "data-theme-mode",
      "light",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
    expect(screen.getByTestId(rendererTestId)).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

});
