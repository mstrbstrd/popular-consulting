import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("./DitherWorldCanvas", () => {
  const ReactModule = require("react");
  return ({ sceneIndex, paused, passive }) =>
    ReactModule.createElement("div", {
      "data-testid": "dither-world-renderer",
      "data-scene-index": sceneIndex,
      "data-paused": paused ? "true" : "false",
      "data-passive": passive ? "true" : "false",
    });
});

const renderers = () => screen.getAllByTestId("dither-world-renderer");

describe("DitherCanvasPage", () => {
  afterEach(cleanup);

  test("opens on Alpine Dawn with both renderer layers synchronized", () => {
    render(<DitherCanvasPage />);
    expect(screen.getByRole("heading", { name: "Alpine Dawn" })).toBeInTheDocument();
    expect(renderers()).toHaveLength(2);
    renderers().forEach((renderer) => {
      expect(renderer).toHaveAttribute("data-scene-index", "0");
    });
    expect(renderers()[0]).toHaveAttribute("data-passive", "true");
    expect(renderers()[1]).toHaveAttribute("data-passive", "false");
  });

  test("selects newly added worlds from the gallery controls", () => {
    render(<DitherCanvasPage />);
    fireEvent.click(screen.getByRole("button", { name: /Living Topography/ }));
    expect(screen.getByRole("heading", { name: "Living Topography" })).toBeInTheDocument();
    renderers().forEach((renderer) => {
      expect(renderer).toHaveAttribute("data-scene-index", "5");
    });
    expect(screen.getByRole("button", { name: "Auto off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("supports keyboard scene navigation and pauses both layers", () => {
    render(<DitherCanvasPage />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Moonwater" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    renderers().forEach((renderer) => {
      expect(renderer).toHaveAttribute("data-paused", "true");
    });
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("wraps from the last expanded world to the first", () => {
    render(<DitherCanvasPage />);
    fireEvent.click(screen.getByRole("button", { name: /Rain City/ }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Alpine Dawn" })).toBeInTheDocument();
  });

  test("can hide and restore the interface without removing either world layer", () => {
    render(<DitherCanvasPage />);
    const main = screen.getByRole("main");
    fireEvent.click(screen.getByRole("button", { name: "Hide UI" }));
    expect(main).toHaveClass("is-immersive");
    expect(renderers()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show interface" }));
    expect(main).not.toHaveClass("is-immersive");
  });
});
