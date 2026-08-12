import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ResearchDitherCanvas from "./ResearchDitherCanvas";
import {
  REACTION_DIFFUSION_FRAGMENT_SHADER,
  RESEARCH_DITHER_FRAGMENT_SHADER,
  RESEARCH_DITHER_VERTEX_SHADER,
} from "./ResearchDitherShader";

describe("ResearchDitherCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("degrades to a mode-specific CSS field when WebGL2 is unavailable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <ResearchDitherCanvas mode={3} onFieldStateChange={() => {}} />,
    );

    const shell = container.querySelector(".research-dither-shell");
    expect(shell).toHaveClass("research-dither-mode-3");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(container.querySelector(".research-dither-fallback")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  test("keeps feedback simulation inside one canvas and one WebGL context", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "ResearchDitherCanvas.js"),
      "utf8",
    );

    expect(source.match(/getContext\("webgl2"/g)).toHaveLength(1);
    expect(source).toContain("createReactionTargets");
    expect(source).toContain("gl.RGBA8");
    expect(source).toContain("gl.FRAMEBUFFER_COMPLETE");
    expect(source).toContain("reactionTargets.readIndex");
    expect(source).toContain("gl.deleteFramebuffer");
    expect(source).toContain("gl.deleteTexture");
    expect(source).toContain("gl.deleteProgram");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("webglcontextlost");
    expect(source).toContain("webglcontextrestored");
  });

  test("implements a true Gray-Scott feedback step for Morphogen Divide", () => {
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("u * v * v");
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("u_feed");
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("u_kill");
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("laplacian");
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("u_state");
    expect(REACTION_DIFFUSION_FRAGMENT_SHADER).toContain("pointerBrush");
  });

  test("provides lava, morphogen, quasicrystal, and hyperbolic fields", () => {
    expect(RESEARCH_DITHER_VERTEX_SHADER).toContain("#version 300 es");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("sceneLavaLamp");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("sceneMorphogen");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("sceneQuasicrystal");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("sceneHyperbolic");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("mobius");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("u_reaction");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("bayer4[16]");
    expect(RESEARCH_DITHER_FRAGMENT_SHADER).toContain("normalizedLuminance");
  });
});
