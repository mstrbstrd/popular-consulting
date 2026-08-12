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

jest.mock("./ResearchDitherCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, mode, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "research-renderer",
        "data-mode": String(mode),
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onFieldStateChange?.("forming"),
      },
      "research renderer",
    );
});

describe("DitherCanvasPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("opens as a nine-study field lab without replacing Second Surface", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Second Surface" })).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.queryByTestId("spectral-renderer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creatoros-lava-renderer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("research-renderer")).not.toBeInTheDocument();
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );

    const studyNavigation = screen.getByRole("navigation", {
      name: "Dither background studies",
    });
    expect(within(studyNavigation).getAllByRole("button")).toHaveLength(9);
    expect(within(studyNavigation).getByRole("button", { name: /Second Surface/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(studyNavigation).getByRole("button", { name: /Lava Lamp/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Morphogen Divide/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Quasicrystal Chorus/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Hyperbolic Garden/ })).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("switches among the original shader studies through one spectral renderer", () => {
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

  test("uses the CreatorOS source effect for Lava Lamp and research renderer for researched systems", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    expect(screen.getByRole("heading", { name: "Lava Lamp" })).toBeInTheDocument();
    expect(screen.getAllByTestId("creatoros-lava-renderer")).toHaveLength(1);
    expect(screen.queryByTestId("research-renderer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spectral-renderer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reheat" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    expect(screen.queryByTestId("creatoros-lava-renderer")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("research-renderer")).toHaveLength(1);
    expect(screen.getByTestId("research-renderer")).toHaveAttribute("data-mode", "1");
    expect(screen.getByText("forming")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Quasicrystal Chorus/ }));
    expect(screen.getAllByTestId("research-renderer")).toHaveLength(1);
    expect(screen.getByTestId("research-renderer")).toHaveAttribute("data-mode", "2");

    fireEvent.click(screen.getByRole("button", { name: /Hyperbolic Garden/ }));
    expect(screen.getAllByTestId("research-renderer")).toHaveLength(1);
    expect(screen.getByTestId("research-renderer")).toHaveAttribute("data-mode", "3");
  });

  test("uses the shared site theme for every renderer family", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: /Hyperbolic Garden/ }));
    expect(screen.getByTestId("research-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

  test("pauses and resumes the active study across renderer families", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    expect(screen.getByTestId("research-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByTestId("research-renderer")).toHaveAttribute(
      "data-paused",
      "false",
    );
  });

  test("resets the active renderer without mounting a second canvas", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reheat" }));
    expect(screen.getAllByTestId("creatoros-lava-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
      "data-reset-version",
      "3",
    );

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reseed" }));
    expect(screen.getAllByTestId("research-renderer")).toHaveLength(1);
    expect(screen.getByTestId("research-renderer")).toHaveAttribute(
      "data-reset-version",
      "4",
    );
  });

  test("announces state changes and updates the page state class", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByTestId("rupture-renderer"));
    expect(screen.getByText("inversion")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-inversion");

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    fireEvent.click(screen.getByTestId("spectral-renderer"));
    expect(screen.getByText("resonance")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-resonance");

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    fireEvent.click(screen.getByTestId("creatoros-lava-renderer"));
    expect(screen.getByText("flowing")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-flowing");
  });
});
