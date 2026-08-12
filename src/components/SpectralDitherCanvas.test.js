import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import SpectralDitherCanvas from "./SpectralDitherCanvas";
import {
  SPECTRAL_DITHER_FRAGMENT_SHADER,
  SPECTRAL_DITHER_VERTEX_SHADER,
} from "./SpectralDitherShader";

describe("SpectralDitherCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("degrades to the study-specific CSS field when WebGL2 is unavailable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <SpectralDitherCanvas mode={2} onFieldStateChange={() => {}} />,
    );

    const shell = container.querySelector(".spectral-dither-shell");
    expect(shell).toHaveClass("spectral-dither-mode-2");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(container.querySelector(".spectral-dither-fallback")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  test("keeps all studies inside one bounded shader and rendering lifecycle", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "SpectralDitherCanvas.js"),
      "utf8",
    );

    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("webglcontextlost");
    expect(source).toContain("webglcontextrestored");
    expect(source).toContain('root.addEventListener("pointermove"');
    expect(source).toContain('root.removeEventListener("pointermove"');
    expect(source).toContain("MODE_TRANSITION_SECONDS");
    expect(source).toContain("gl.deleteTexture");
    expect(source).toContain("gl.deleteBuffer");
    expect(source).toContain("gl.deleteProgram");
  });

  test("provides four distinct spectral fields with shared glyph and Bayer output", () => {
    expect(SPECTRAL_DITHER_VERTEX_SHADER).toContain("#version 300 es");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("sceneMetabloom");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("sceneTidalWeave");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("sceneMoireHalo");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("sceneContourDrift");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("u_modeMix");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("sampler2D u_atlas");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("bayer4[16]");
    expect(SPECTRAL_DITHER_FRAGMENT_SHADER).toContain("normalizedLuminance");
  });
});
