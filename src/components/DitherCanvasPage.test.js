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
        onClick: () => onRuptureStateChange?.("open"),
      },
      "rupture renderer",
    );
});

jest.mock("./CreatorOSFieldCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, mode, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "creatoros-field-renderer",
        "data-mode": String(mode),
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

  test("opens as a ten-study scroll narrative with Second Surface first", () => {
    render(<DitherCanvasPage />);

    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-progress",
      "0",
    );
    expect(document.querySelectorAll(".dither-scroll-step")).toHaveLength(10);

    const studyNavigation = screen.getByRole("navigation", {
      name: "Dither background studies",
    });
    expect(within(studyNavigation).getAllByRole("button")).toHaveLength(10);
    expect(
      within(studyNavigation).getByRole("button", { name: /Second Surface/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(studyNavigation).getByRole("button", { name: /Forward Pass/ }),
    ).toBeInTheDocument();
  });

  test("opens the first surface from page scroll before advancing studies", () => {
    render(<DitherCanvasPage />);

    moveScrollTo(460);
    expect(
      Number(screen.getByTestId("rupture-renderer").dataset.progress),
    ).toBeCloseTo(0.5, 1);
    expect(
      screen.getByRole("heading", { name: "Second Surface" }),
    ).toBeInTheDocument();

    moveScrollTo(1200);
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
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 5350,
      behavior: "smooth",
    });
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
});
