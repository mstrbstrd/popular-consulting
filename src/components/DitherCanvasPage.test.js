import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      "renderer",
    );
});

describe("DitherCanvasPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("opens as the Second Surface rupture study", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Second Surface" })).toBeInTheDocument();
    expect(screen.getAllByTestId("rupture-renderer")).toHaveLength(1);
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("uses the shared site theme", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

  test("pauses and resumes the rupture simulation", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute(
      "data-paused",
      "false",
    );
  });

  test("heals the accumulated rupture state", () => {
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
  });

  test("announces rupture state changes and updates the page state class", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByTestId("rupture-renderer"));

    expect(screen.getByText("inversion")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("rupture-inversion");
  });
});
