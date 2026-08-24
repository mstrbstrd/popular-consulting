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

    expect(source).toContain("const MODE_COUNT = 8");
    expect(source).toContain("const RENDER_SCALE = 0.5");
    expect(source).toContain("const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30");
    expect(source).toContain("getDitherCanvasFrameInterval(");
    expect(source).toContain("const INTRO_DURATION_SECONDS = 3.2");
    expect(source).toContain("createDitherCanvasContext({");
    expect(source).toContain('contextType: "webgl2"');
    expect(source).toContain("getDitherCanvasSize(");
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('data-context-recovery="local"');
    expect(css).toContain("image-rendering: pixelated");
    expect(css).toContain(".dither-renderer-creatoros-field .rupture-glass");
    expect(css).toContain("backdrop-filter: none");
  });

  test("uses the exact CreatorOS palette, Bayer-8 output, and fluid material model", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("#define bayer8");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(0.0, 0.933, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(1.0, 0.0, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(1.0, 0.933, 0.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3(0.616, 0.0, 1.0)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("viscousWarp");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("fluidMaterial");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(color * alpha, alpha)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain("u_atlas");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).not.toContain("sampleGlyph");
  });

  test("restores Metabloom's compact merging and dividing topology", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("float potential = 0.0");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "time * (0.16 + layer * 0.009)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "p = viscousWarp(p, time, 0.08)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("potential * 4.4");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("float materialField");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "smoothstep(0.36, 2.65, potential)",
    );
  });

  test("gives Morphogen Divide autonomous transport, recurrent fronts, and visible activity", () => {
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("vortexFlow");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("sampleUv = clamp");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("float heartbeat");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("float migratingSeed");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain("centerState.b");
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).not.toContain(
      "u_paintMode",
    );
    expect(CREATOROS_REACTION_FRAGMENT_SHADER).toContain(
      "fragColor = vec4(sat(u), sat(v), activity, 1.0)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("float activity = chemical.b");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("float cleavage");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("float transport");
  });

  test("defaults Tidal Weave to water and preserves spectral as a palette-only option", () => {
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
    const tidalStart = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneTidalWeave",
    );
    const tidalEnd = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
      "vec4 sceneMoireHalo",
    );
    const tidalScene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(
      tidalStart,
      tidalEnd,
    );
  const outlineStart = tidalScene.indexOf(
    "// Keep a continuous spectral gradient",
  );
  const outlineEnd = tidalScene.indexOf(
    "\nvec3 tint = mix(",
    outlineStart,
  );
  const tidalOutline = tidalScene.slice(outlineStart, outlineEnd);

    expect(source).toContain('tidalPalette = "water"');
    expect(source).toContain("resolveTidalPaletteMix");
    expect(source).toContain('"u_tidalPaletteMix"');
    expect(source).toContain("creatoros-field-palette-");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "uniform float u_tidalPaletteMix",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "vec3 tidalWaterPalette",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 deepTropical");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 lagoonTeal");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 turquoise");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec3 crystalAqua");
    expect(tidalScene).toContain("vec3 tint = mix(");
    expect(tidalScene).toContain("waterTint,");
    expect(tidalScene).toContain("spectralTint,");
    expect(tidalScene).toContain("sat(u_tidalPaletteMix)");
    expect(tidalScene).not.toContain("vec3 waterTintA");
    expect(tidalScene).toContain("float causticSignal");
    expect(tidalScene).toContain("vec3 causticGray");
    expect(tidalScene).toContain("vec3(1.280, 1.320, 1.300)");
    expect(tidalScene).toContain("vec3(1.340, 1.370, 1.350)");
    expect(tidalScene).toContain("fwidth(bandA)");
    expect(tidalScene).toContain("fwidth(bandB)");
  expect(tidalScene).toContain("float outlineLevel = 0.72");
  expect(tidalScene).not.toContain("abs(bandA - 0.30)");
  expect(tidalScene).toContain("vec3 outlineSpectralA");
  expect(tidalScene).toContain("vec3 outlineSpectralB");
  expect(tidalScene).toContain("p.x * 0.120");
  expect(tidalScene).toContain("outlineTintA * outlineA");
  expect(tidalScene).toContain("outlineTintB * outlineB");
  expect(outlineStart).toBeGreaterThanOrEqual(0);
  expect(outlineEnd).toBeGreaterThan(outlineStart);
  expect(tidalOutline).not.toContain("crossing *");
    expect(tidalScene).toContain("float spectralOutline");
    expect(tidalScene).toContain("vec3 spectralOutlineTint");
    expect(tidalScene).toContain("float outlineChroma");
    expect(tidalScene).toContain("mix(0.48, 0.42, u_light)");
    expect(tidalScene).toContain("float outlineFloor");
    expect(tidalScene).toContain("mix(0.70, 0.78, u_light)");
    expect(tidalScene).toContain("float spectralOutlineStrength");
    expect(tidalScene).toContain("mix(0.92, 0.90, u_light)");
    expect(tidalScene).toContain(
      "spectralOutline * spectralOutlineStrength",
    );
    expect(tidalScene).toContain(
      "waterTint = mix(causticGray, refractedLight, causticLift)",
    );
    expect(tidalScene).toContain("weave * 1.18");
    expect(tidalScene).toContain(
      "return fluidMaterial(field, tint, 0.34, 0.22, 0.94)",
    );
    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-water",
    );
    expect(css).toContain("linear-gradient(145deg, #bdfcf0");
    expect(css).toContain("linear-gradient(145deg, #021a22");
    expect(css).toContain(
      ".creatoros-field-mode-1.creatoros-field-palette-spectral",
    );
  });

  test("keeps every refined study distinct inside one renderer", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMetabloom");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneTidalWeave");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMoireHalo");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneContourDrift");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneMorphogen");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneQuasicrystal");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneHyperbolic");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("sceneForwardPass");
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
    expect(source).toContain("paintReactionProgram");
    expect(source).toContain("paintReactionUniforms");
    expect(source).toContain("activeReactionProgram");
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
