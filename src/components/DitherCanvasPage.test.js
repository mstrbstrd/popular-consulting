import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("./AfterfieldCanvas", () => {
  const ReactModule = require("react");
  return ({ isDark, onFieldStateChange, paused, resetVersion }) =>
    ReactModule.createElement(
      "button",
      {
        type: "button",
        "data-testid": "afterfield-renderer",
        "data-theme-mode": isDark ? "dark" : "light",
        "data-paused": paused ? "true" : "false",
        "data-reset-version": String(resetVersion),
        onClick: () => onFieldStateChange?.("remembering"),
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

  test("opens as the lightweight Afterfield study", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByRole("heading", { name: "Afterfield" })).toBeInTheDocument();
    expect(screen.getAllByTestId("afterfield-renderer")).toHaveLength(1);
    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Classic" })).not.toBeInTheDocument();
  });

  test("uses the shared site theme", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

  test("pauses and resumes the field", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-paused",
      "false",
    );
  });

  test("forgets the accumulated field memory", () => {
    render(<DitherCanvasPage />);

    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-reset-version",
      "0",
    );
    fireEvent.click(screen.getByRole("button", { name: "Forget" }));
    expect(screen.getByTestId("afterfield-renderer")).toHaveAttribute(
      "data-reset-version",
      "1",
    );
  });

  test("announces field state changes", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByTestId("afterfield-renderer"));

    expect(screen.getByText("remembering")).toBeInTheDocument();
  });
});
