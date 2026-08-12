import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import {
  CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} from "./CreatorOSFieldShader";

describe("CreatorOSFieldCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("degrades to a mode-specific CSS field when WebGL2 is unavailable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <CreatorOSFieldCanvas mode={5} onFieldStateChange={() => {}} />,
    );

    const shell = container.querySelector(".creatoros-field-shell");
    expect(shell).toHaveClass("creatoros-field-mode-5");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(container.querySelector(".creatoros-field-fallback")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  test("inherits the CreatorOS fluid rendering contract", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.css"),
      "utf8",
    );

    expect(source).toContain("const RENDER_SCALE = 0.5");
    expect(source).toContain("const FRAME_INTERVAL_MS = 1000 / 30");
    expect(source).toContain("const INTRO_DURATION_SECONDS = 3.2");
    expect(source.match(/getContext\("webgl2"/g)).toHaveLength(1);
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('powerPreference: "low-power"');
    expect(css).toContain("image-rendering: pixelated");
    expect(css).toContain(".dither-renderer-creatoros-field .rupture-glass");
    expect(css).toContain("backdrop-filter: none");
  });

  test("uses the exact CreatorOS palette, Bayer-8 output, and viscous material model", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("#define bayer8");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(0.0, 0.933, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(1.0, 0.0, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(1.0, 0.933, 0.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(0.616, 0.0, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("viscousWarp");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("fluidMaterial");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "local.y /= 1.0 + 10.0 * speed",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "local.x *= 1.0 + 3.8 * speed",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(color * alpha, alpha)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain("u_atlas");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain("sampleGlyph");
  });

  test("keeps every refined study distinct inside one renderer", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMetabloom");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneTidalWeave");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMoireHalo");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneContourDrift");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMorphogen");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneQuasicrystal");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneHyperbolic");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("mobius");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("u_modeMix");
  });

  test("preserves bounded Gray-Scott feedback and complete lifecycle cleanup", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.js"),
      "utf8",
    );

    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("u * v * v");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("laplacian");
    expect(source).toContain("createReactionTargets");
    expect(source).toContain("reactionTargets.readIndex");
    expect(source).toContain("gl.FRAMEBUFFER_COMPLETE");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("webglcontextlost");
    expect(source).toContain("webglcontextrestored");
    expect(source).toContain("gl.deleteFramebuffer");
    expect(source).toContain("gl.deleteTexture");
    expect(source).toContain("gl.deleteBuffer");
    expect(source).toContain("gl.deleteProgram");
  });
});
