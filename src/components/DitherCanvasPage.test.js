import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DitherCanvasPage from "./DitherCanvasPage";

jest.mock("./DitherWorldCanvas", () => {
  const ReactModule = require("react");
  return ({ sceneIndex, paused }) =>
    ReactModule.createElement("div", {
      "data-testid": "dither-world-renderer",
      "data-scene-index": sceneIndex,
      "data-paused": paused ? "true" : "false",
    });
});

describe("DitherCanvasPage", () => {
  afterEach(cleanup);

  test("opens on Alpine Dawn with the renderer synchronized", () => {
    render(<DitherCanvasPage />);

    expect(
      screen.getByRole("heading", { name: "Alpine Dawn" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-scene-index",
      "0",
    );
  });

  test("selects a world from the gallery controls", () => {
    render(<DitherCanvasPage />);

    fireEvent.click(screen.getByRole("button", { name: /Moonwater/ }));

    expect(
      screen.getByRole("heading", { name: "Moonwater" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-scene-index",
      "1",
    );
    expect(screen.getByRole("button", { name: "Auto off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("supports keyboard scene navigation and motion pause", () => {
    render(<DitherCanvasPage />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen.getByRole("heading", { name: "Moonwater" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("dither-world-renderer")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  test("can hide and restore the interface without removing the world", () => {
    render(<DitherCanvasPage />);
    const main = screen.getByRole("main");

    fireEvent.click(screen.getByRole("button", { name: "Hide UI" }));
    expect(main).toHaveClass("is-immersive");
    expect(screen.getByTestId("dither-world-renderer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show interface" }));
    expect(main).not.toHaveClass("is-immersive");
  });
});
