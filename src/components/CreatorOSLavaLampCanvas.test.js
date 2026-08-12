import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSLavaLampCanvas from "./CreatorOSLavaLampCanvas";

describe("CreatorOSLavaLampCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("degrades to a luminous static field when WebGL is unavailable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <CreatorOSLavaLampCanvas onFieldStateChange={() => {}} />,
    );

    const shell = container.querySelector(".creatoros-lava-shell");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(container.querySelector(".creatoros-lava-fallback")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  test("preserves the defining CreatorOS lava rendering model", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "CreatorOSLavaLampCanvas.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "CreatorOSLavaLampCanvas.css"),
      "utf8",
    );

    expect(source).toContain("const RENDER_SCALE = 0.5;");
    expect(source).toContain("const FRAME_INTERVAL_MS = 1000 / 30;");
    expect(source).toContain("#define bayer8");
    expect(source).toContain("vec2 p = uv + warp * 0.42;");
    expect(source).toContain("for (int i = 0; i < 8; i++)");
    expect(source).toContain("d.y /= 1.0 + 12.0 * abs(vy);");
    expect(source).toContain("d.x *= 1.0 + 4.0 * abs(vy);");
    expect(source).toContain("y = mix(-1.7, y, bloom);");
    expect(source).toContain("gl_FragColor = vec4(col * alpha, alpha);");
    expect(css).toContain("image-rendering: pixelated;");
  });

  test("keeps the transparent low-power canvas lifecycle bounded", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "CreatorOSLavaLampCanvas.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "CreatorOSLavaLampCanvas.css"),
      "utf8",
    );

    expect(source.match(/getContext\("webgl"/g)).toHaveLength(1);
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('powerPreference: "low-power"');
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("webglcontextlost");
    expect(source).toContain("webglcontextrestored");
    expect(source).toContain("gl.deleteBuffer");
    expect(source).toContain("gl.deleteProgram");
    expect(source).toContain("gl.deleteShader");
    expect(css).toContain(".dither-study-lava-lamp .rupture-glass");
    expect(css).toContain("backdrop-filter: none;");
  });
});
