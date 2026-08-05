import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

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

  test("opens as one natural-light Tidal Dune study", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Tidal Dune" })).toBeInTheDocument();
    expect(screen.getAllByTestId("dither-world-renderer")).toHaveLength(1);
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-palette-mode",
      "natural",
    );
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
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

  test("uses the shared site theme and motion controls", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
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
