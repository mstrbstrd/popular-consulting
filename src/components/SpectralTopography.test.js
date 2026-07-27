import React from "react";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import SpectralTopography from "./SpectralTopography";

describe("SpectralTopography", () => {
  afterEach(cleanup);

  test("renders a decorative canvas that degrades safely without WebGL", () => {
    // jsdom has no WebGL: the component must mount, bail quietly, and leave
    // the CSS ambient gradient as the visible fallback (canvas stays at
    // opacity 0 because the ready class is only added after a real frame).
    const { container, unmount } = render(<SpectralTopography />);

    const canvas = container.querySelector("canvas.work-page__backdrop");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas.classList.contains("work-page__backdrop--ready")).toBe(false);

    expect(() => unmount()).not.toThrow();
  });

  test("keeps the shader inside the kit's discipline", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(__dirname, "SpectralTopography.js"), "utf8");

    // Family signature and accessibility contract.
    expect(source).toContain("bayer8");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("visibilitychange");
    expect(source).toContain('powerPreference: "low-power"');

    const css = fs.readFileSync(path.join(__dirname, "WorkPage.css"), "utf8");
    expect(css).toContain("image-rendering: pixelated");

    // Spectral palette stops match the CSS tokens.
    expect(source).toContain("vec3(0.0, 0.933, 1.0)");
    expect(source).toContain("vec3(0.616, 0.0, 1.0)");
  });
});
