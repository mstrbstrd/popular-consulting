import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("../utils/deviceTier", () => ({
  hasHardwareWebGL: true,
  isMobileTier: false,
}));

jest.mock("./BlackHoleBackground", () => {
  const ReactModule = require("react");
  return ({ activeSection }) =>
    ReactModule.createElement("div", {
      "data-testid": "black-hole-index-background",
      "data-active-section": activeSection,
    });
});

jest.mock("./DitherBackground", () => {
  const ReactModule = require("react");
  return ({ activeSection, isDark }) =>
    ReactModule.createElement("div", {
      "data-testid": "classic-index-background",
      "data-active-section": activeSection,
      "data-theme-mode": isDark ? "dark" : "light",
    });
});

jest.mock("./DitherWorldCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, onPhaseChange, paletteMode, paused, phaseOverride }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "dither-world-renderer",
        "data-theme-mode": isDark ? "dark" : "light",
        "data-palette-mode": paletteMode,
        "data-paused": paused ? "true" : "false",
        "data-phase-override": phaseOverride ?? "auto",
        onClick: () => onPhaseChange?.(0.75),
      },
      "renderer",
    );
});

describe("DitherCanvasPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("layers the light index background beneath the Tidal Dune renderer", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Tidal Dune" })).toBeInTheDocument();
    expect(screen.getByTestId("classic-index-background")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );
    expect(screen.queryByTestId("black-hole-index-background")).not.toBeInTheDocument();
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-palette-mode",
      "natural",
    );
  });

  test("switches the same world into the original classic dither language", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Classic" }));

    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-palette-mode",
      "classic",
    );
    expect(screen.getByText(/original block-glyph atlas/i)).toBeInTheDocument();
  });

  test("supports manual time painting and returning to the automatic cycle", () => {
    render(<DitherCanvasPage />);

    fireEvent.change(screen.getByRole("slider", { name: "Time of day" }), {
      target: { value: "0.9" },
    });

    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-phase-override",
      "0.9",
    );
    expect(screen.getByText("21:36")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume cycle" }));
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-phase-override",
      "auto",
    );
  });

  test("switches to the desktop dark index background and preserves motion controls", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(screen.getByTestId("black-hole-index-background")).toHaveAttribute(
      "data-active-section",
      "0",
    );
    expect(screen.queryByTestId("classic-index-background")).not.toBeInTheDocument();
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});
