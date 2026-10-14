import React from "react";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import NavierStokesControls from "./NavierStokesControls";
import { encodeNavierOklab, getNavierColorway, NAVIER_COLORWAYS } from "./navierStokesColorways";

afterEach(() => { cleanup(); jest.restoreAllMocks(); });

// Excluded states: altered motion/history, a remounted canvas, unsafe lookup,
// non-finite GPU colors, lost keyboard focus, or an altered default appearance.
test.each([undefined, null, "", "GLACIER", "__proto__", "constructor", 1, NaN, Infinity, {}, []])(
  "unrecognized colorway %p selects the original", value => {
    expect(getNavierColorway(value)).toBe(NAVIER_COLORWAYS[0]);
  },
);

test("seven fixed, immutable materials contain bounded GPU and authored CSS data", () => {
  expect(NAVIER_COLORWAYS).toHaveLength(7);
  expect(new Set(NAVIER_COLORWAYS.map(option => option.id)).size).toBe(7);
  expect(Object.isFrozen(NAVIER_COLORWAYS)).toBe(true);
  for (const [index, option] of NAVIER_COLORWAYS.entries()) {
    expect(getNavierColorway(option.id)).toBe(option);
    expect(option.index).toBe(index);
    expect(option.colors).toHaveLength(24);
    expect(option.colors.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(Object.isFrozen(option)).toBe(true);
    expect(Object.isFrozen(option.colors)).toBe(true);
    expect(Object.isFrozen(option.cssVariables)).toBe(true);
    expect(Object.keys(option.cssVariables)).toHaveLength(3);
    expect(option.gradient).not.toMatch(/url\(|var\(/);
  }
  expect(NAVIER_COLORWAYS.slice(1).every(option => option.swatches.length === 6)).toBe(true);
  expect(new Set(NAVIER_COLORWAYS.slice(1).map(option => option.harmony)).size).toBe(6);

});

test("removing only color overrides exactly recovers the approved original shader", () => {
  const source = fs.readFileSync(path.join(__dirname, "NavierStokesShader.js"), "utf8").replace(/\r\n/g, "\n");
  const original = source.replace(/\n\/\/ ART MATERIAL BEGIN[\s\S]*?\/\/ ART MATERIAL END\n/, "")
    .replace("  if (u_navierColorway > 0) color = navierArtColor(ink, density, slope, diffuse);\n", "")
    .replace("uniform int u_navierColorway;\nuniform vec3 u_navierColors[8];\n", "")
    .replace(/\nvec3 navierColor\(int index, vec3 original\) \{\n {2}return u_navierColorway > 0 \? u_navierColors\[index\] : original;\n\}\n/, "")
    .replace(/navierColor\([0-7], (vec3\([^)]*\))\)/g, "$1");
  const bytes = Buffer.from(original);
  const sha = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  expect(sha).toBe("9e2d7f8c0ac2136e56c6d4c2369d83a8f128e8a4");
});

test("selection is named, pressed, keyboard-focusable and separate from concentration", () => {
  const onProgressChange = jest.fn();
  const onColorwayChange = jest.fn();
  const { container, rerender } = render(<NavierStokesControls progress={0.8}
    colorway="original" onProgressChange={onProgressChange} onColorwayChange={onColorwayChange} />);
  const disclosure = container.querySelector(".navier-colorways");
  disclosure.open = true;
  expect(screen.getByRole("button", { name: "Original", hidden: true })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Eclipse Bloom", hidden: true }));
  expect(onColorwayChange).toHaveBeenCalledTimes(1);
  expect(onColorwayChange).toHaveBeenCalledWith("eclipse-bloom");
  expect(onProgressChange).not.toHaveBeenCalled();
  expect(disclosure.open).toBe(false);
  expect(disclosure.querySelector("summary")).toHaveFocus();
  rerender(<NavierStokesControls progress={0.8} colorway="eclipse-bloom"
    onProgressChange={onProgressChange} onColorwayChange={onColorwayChange} />);
  expect(screen.getByRole("slider", { name: /Concentration/ })).toHaveValue("80");
  expect(screen.getByRole("button", { name: "Eclipse Bloom", hidden: true })).toHaveAttribute("aria-pressed", "true");
  expect(disclosure.querySelector("summary")).toHaveAttribute("aria-label", "Colorway: Eclipse Bloom");
});

test("fallback recolors locally without replacing the canvas or resuming it", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const { container, rerender } = render(<CreatorOSFieldCanvas mode={9} paused navierProgress={0.7} />);
  const shell = container.querySelector(".creatoros-field-shell");
  const canvas = container.querySelector("canvas");
  await waitFor(() => expect(shell).toHaveClass("is-fallback"));
  expect(shell).toHaveAttribute("data-navier-colorway", "original");
  rerender(<CreatorOSFieldCanvas mode={9} paused navierProgress={0.7} navierColorway="verdigris-ember" />);
  expect(shell).toHaveAttribute("data-navier-colorway", "verdigris-ember");
  expect(shell.style.getPropertyValue("--navier-ink-0")).toBe(getNavierColorway("verdigris-ember").cssVariables["--navier-ink-0"]);
  expect(shell).toHaveAttribute("data-navier-progress", "0.7");
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(container.querySelectorAll("canvas")).toHaveLength(1);
  rerender(<CreatorOSFieldCanvas mode={9} paused navierColorway="__proto__" />);
  expect(shell).toHaveAttribute("data-navier-colorway", "original");
});

// The palette encoder is tested independently of the display shader.
test("Oklab encoding has correct neutral axes and reference red", () => {
  expect(encodeNavierOklab([0, 0, 0])).toEqual([0, 0.5, 0.5]);
  const white = encodeNavierOklab([1, 1, 1]);
  [1, 0.5, 0.5].forEach((value, index) => expect(white[index]).toBeCloseTo(value, 6));
  const red = encodeNavierOklab([1, 0, 0]);
  [0.627955, 0.724863, 0.625846].forEach((value, index) => expect(red[index]).toBeCloseTo(value, 5));
});

test("material shading cannot change transport, time, UVs, alpha or core geometry", () => {
  const shader = fs.readFileSync(path.join(__dirname, "NavierStokesShader.js"), "utf8");
  const material = shader.split("// ART MATERIAL BEGIN")[1].split("// ART MATERIAL END")[0];
  expect(material).not.toMatch(/texture\(|texelFetch|u_time|u_seed|u_navierCores|u_navierProgress|opacity|discard|while\s*\(/);
  expect(material).toContain("vec3 navierArtColor");
  expect(material).toContain("vec3 navierArtRgb");
  for (const file of ["navierStokesFluid.js", "navierStokesField.js"]) {
    expect(fs.readFileSync(path.join(__dirname, file), "utf8")).not.toContain("Colorway");
  }
});
