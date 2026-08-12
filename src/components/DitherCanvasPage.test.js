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
        onClick: () => onFieldStateChange?.(mode === 4 ? "forming" : "resonance"),
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
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("opens as a ten-study field lab without replacing Second Surface", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Second Surface" })).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.queryByTestId("creatoros-field-renderer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creatoros-lava-renderer")).not.toBeInTheDocument();
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );

    const studyNavigation = screen.getByRole("navigation", {
      name: "Dither background studies",
    });
    expect(within(studyNavigation).getAllByRole("button")).toHaveLength(10);
    expect(within(studyNavigation).getByRole("button", { name: /Second Surface/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(studyNavigation).getByRole("button", { name: /Lava Lamp/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Morphogen Divide/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Quasicrystal Chorus/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Hyperbolic Garden/ })).toBeInTheDocument();
    expect(within(studyNavigation).getByRole("button", { name: /Forward Pass/ })).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("routes every refined variant through one CreatorOS field renderer", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Metabloom/ }));
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "0");
    expect(screen.getByRole("main")).toHaveClass("dither-renderer-creatoros-field");

    fireEvent.click(screen.getByRole("button", { name: /Tidal Weave/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "1");

    fireEvent.click(screen.getByRole("button", { name: /Moiré Halo/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "2");

    fireEvent.click(screen.getByRole("button", { name: /Contour Drift/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "3");

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "4");

    fireEvent.click(screen.getByRole("button", { name: /Quasicrystal Chorus/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "5");

    fireEvent.click(screen.getByRole("button", { name: /Hyperbolic Garden/ }));
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "6");

    fireEvent.click(screen.getByRole("button", { name: /Forward Pass/ }));
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "7");
  });

  test("keeps the exact CreatorOS lava lamp on its dedicated renderer", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));

    expect(screen.getByRole("heading", { name: "Lava Lamp" })).toBeInTheDocument();
    expect(screen.getAllByTestId("creatoros-lava-renderer")).toHaveLength(1);
    expect(screen.queryByTestId("creatoros-field-renderer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reheat" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("dither-renderer-creatoros-lava");
  });

  test("uses the shared site theme for every renderer family", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: /Moiré Halo/ }));
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
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
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByTestId("creatoros-lava-renderer")).toHaveAttribute(
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
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
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
    expect(screen.getAllByTestId("creatoros-field-renderer")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute(
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
    fireEvent.click(screen.getByTestId("creatoros-field-renderer"));
    expect(screen.getByText("resonance")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-resonance");

    fireEvent.click(screen.getByRole("button", { name: /Morphogen Divide/ }));
    fireEvent.click(screen.getByTestId("creatoros-field-renderer"));
    expect(screen.getByText("forming")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-forming");

    fireEvent.click(screen.getByRole("button", { name: /Lava Lamp/ }));
    fireEvent.click(screen.getByTestId("creatoros-lava-renderer"));
    expect(screen.getByText("flowing")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-flowing");
  });
});
