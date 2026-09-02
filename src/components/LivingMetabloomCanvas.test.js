import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import LivingMetabloomCanvas from "./LivingMetabloomCanvas";
import { LIVING_METABLOOM_FRAGMENT_SHADER } from "./LivingMetabloomShader";

describe("LivingMetabloomCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("skips WebGL entirely when capability policy selects the fallback", () => {
    const contextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

    const { container, unmount } = render(
      <LivingMetabloomCanvas
        enabled={false}
        expression="excited"
        form="bloom"
        pulseVersion={1}
        talking
      />,
    );

    const shell = container.querySelector(".living-metabloom-canvas");
    expect(contextSpy).not.toHaveBeenCalled();
    expect(shell).toHaveClass("is-fallback");
    expect(shell).toHaveAttribute("data-renderer-state", "fallback");
    expect(shell).toHaveAttribute("data-fallback-expression", "excited");
    expect(shell).toHaveAttribute("data-fallback-talking", "true");
    expect(
      container.querySelectorAll(".living-metabloom-canvas__fallback-blob"),
    ).toHaveLength(5);
    expect(
      container.querySelector(".living-metabloom-canvas__fallback-pulse"),
    ).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  test("uses the same complete fallback after a local WebGL2 failure", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <LivingMetabloomCanvas
        expression="sad"
        form="drift"
        onFieldStateChange={() => {}}
        pulseVersion={2}
      />,
    );

    const shell = container.querySelector(".living-metabloom-canvas");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(shell).toHaveAttribute("data-fallback-expression", "sad");
    expect(shell).toHaveAttribute("data-field-form", "drift");
    expect(
      container.querySelectorAll(".living-metabloom-canvas__fallback-blob"),
    ).toHaveLength(5);
    expect(
      container.querySelector(".living-metabloom-canvas__fallback-face"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".living-metabloom-canvas__fallback-pulse"),
    ).toBeInTheDocument();
    expect(shell).toHaveAttribute("data-context-recovery", "local");
    expect(() => unmount()).not.toThrow();
  });

  test("updates fallback moods and remounts pulse feedback", () => {
    const { container, rerender } = render(
      <LivingMetabloomCanvas
        enabled={false}
        expression="happy"
        pulseVersion={1}
      />,
    );
    const shell = container.querySelector(".living-metabloom-canvas");
    const firstPulse = container.querySelector(
      ".living-metabloom-canvas__fallback-pulse",
    );

    [
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ].forEach((expression, index) => {
      rerender(
        <LivingMetabloomCanvas
          enabled={false}
          expression={expression}
          pulseVersion={index + 2}
          talking={expression === "thinking"}
        />,
      );
      expect(shell).toHaveAttribute("data-fallback-expression", expression);
    });

    const secondPulse = container.querySelector(
      ".living-metabloom-canvas__fallback-pulse",
    );
    expect(secondPulse).toBeInTheDocument();
    expect(secondPulse).not.toBe(firstPulse);
  });

  test("keeps one bounded draw with complete local lifecycle ownership", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomCanvas.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomCanvas.css"),
      "utf8",
    );

    expect(source).toContain("const RENDER_SCALE = 0.5;");
    expect(source).toContain("enabled = true");
    expect(source).toContain("if (!enabled) {");
    expect(source).toContain("getDitherCanvasFrameInterval(");
    expect(source).toContain("createDitherCanvasCadence({");
    expect(source).toContain('rendererId: "living-metabloom"');
    expect(source).toContain('contextType: "webgl2"');
    expect(source.match(/gl\.drawArrays/g)).toHaveLength(1);
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('"(prefers-reduced-motion: reduce)"');
    expect(source).toContain('"webglcontextlost"');
    expect(source).toContain('"webglcontextrestored"');
    expect(source).toContain("gl.deleteBuffer(positionBuffer)");
    expect(source).toContain("gl.deleteProgram(program)");
    expect(css).toContain("image-rendering: pixelated");
    expect(css).toContain("@keyframes livingMetabloomFallbackPulse");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("constructs silhouette, emotion, gaze, speech, and face from the field itself", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("uniform int u_expressionA");
    expect(shader).toContain("uniform int u_expressionB");
    expect(shader).toContain("uniform int u_formA");
    expect(shader).toContain("uniform int u_formB");
    expect(shader).toContain("uniform float u_talking");
    expect(shader).toContain("void addMetaball(");
    expect(shader).toContain("for (int index = 0; index < 9; index++)");
    expect(shader).toContain("float droop = sad");
    expect(shader).toContain("float tension = focus");
    expect(shader).toContain("vec2 gaze = clamp(pointer");
    expect(shader).toContain("float faceVoid");
    expect(shader).toContain("alpha *= 1.0 - faceVoid");
    expect(shader).toContain("float talkOpen = u_talking");
    expect(shader).toContain("float heartbeat");
    expect(shader).not.toContain("sampler2D");
    expect(shader).not.toContain("texture(");
  });

  test("inherits the Metabloom spectral material and premultiplied Bayer output", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("#define bayer8");
    expect(shader).toContain("vec3(0.0, 0.933, 1.0)");
    expect(shader).toContain("vec3(1.0, 0.0, 1.0)");
    expect(shader).toContain("vec3(1.0, 0.933, 0.0)");
    expect(shader).toContain("vec3(0.616, 0.0, 1.0)");
    expect(shader).toContain("potential * 4.4");
    expect(shader).toContain("float membrane");
    expect(shader).toContain("fragColor = vec4(color * alpha, alpha)");
  });
});
