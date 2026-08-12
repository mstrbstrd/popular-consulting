import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("./RuptureCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, onRuptureStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "rupture-renderer",
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onRuptureStateChange?.("inversion"),
      },
      "rupture renderer",
    );
});

jest.mock("./SpectralDitherCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, mode, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "spectral-renderer",
        "data-mode": String(mode),
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onFieldStateChange?.("resonance"),
      },
      "spectral renderer",
    );
});

describe("DitherCanvasPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("opens as a five-study field lab without replacing Second Surface", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Second Surface" })).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.queryByTestId("spectral-renderer")).not.toBeInTheDocument();
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );

    const studyNavigation = screen.getByRole("navigation", {
      name: "Dither background studies",
    });
    expect(within(studyNavigation).getAllByRole("button")).toHaveLength(5);
    expect(within(studyNavigation).getByRole("button", { name: /Second Surface/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("switches among the new shader studies through one spectral renderer", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));

    expect(screen.getByRole("heading", { name: "Metabloom" })).toBeInTheDocument();
    expect(screen.queryByTestId("rupture-renderer")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("spectral-renderer")).toHaveLength(1);
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute("data-mode", "0");
    expect(screen.getByRole("button", { name: "Reseed" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tidal Weave/ }));

    expect(screen.getByRole("heading", { name: "Tidal Weave" })).toBeInTheDocument();
    expect(screen.getAllByTestId("spectral-renderer")).toHaveLength(1);
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute("data-mode", "1");
    expect(screen.getByRole("button", { name: /Tidal Weave/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("uses the shared site theme for either renderer", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: /Moiré Halo/ }));
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

  test("pauses and resumes the active study", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /Contour Drift/ }));
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute(
      "data-paused",
      "false",
    );
  });

  test("resets the active renderer without remounting a second canvas", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reset-version",
      "0",
    );
    fireEvent.click(screen.getByRole("button", { name: "Heal" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-reset-version",
      "1",
    );

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reseed" }));
    expect(screen.getAllByTestId("spectral-renderer")).toHaveLength(1);
    expect(screen.getByTestId("spectral-renderer")).toHaveAttribute(
      "data-reset-version",
      "2",
    );
  });

  test("announces renderer state changes and updates the page state class", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByTestId("rupture-renderer"));
    expect(screen.getByText("inversion")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-inversion");

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    fireEvent.click(screen.getByTestId("spectral-renderer"));
    expect(screen.getByText("resonance")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-resonance");
  });
});
