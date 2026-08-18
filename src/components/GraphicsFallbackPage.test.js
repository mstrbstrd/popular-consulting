import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import GraphicsFallbackPage, {
  buildGraphicsOptInHref,
} from "./GraphicsFallbackPage";

jest.mock("../utils/graphicsPolicy", () => ({
  graphicsPolicy: {
    mode: "css",
    source: "windows-safe-default",
    isWindows: true,
  },
}));

describe("GraphicsFallbackPage", () => {
  test("preserves existing query values while explicitly opting into WebGL", () => {
    expect(
      buildGraphicsOptInHref("/dither-canvas", "?study=metabloom"),
    ).toBe("/dither-canvas?study=metabloom&graphics=webgl");
  });

  test("keeps the field lab reachable without making WebGL mandatory", () => {
    window.history.replaceState({}, "", "/dither-canvas");
    render(<GraphicsFallbackPage />);

    expect(
      screen.getByRole("heading", { name: "The field lab is in safe mode." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try enhanced graphics" })).toHaveAttribute(
      "href",
      "/dither-canvas?graphics=webgl",
    );
    expect(
      screen.getByRole("link", { name: "Return to Popular Consulting" }),
    ).toHaveAttribute("href", "/");
  });
});
