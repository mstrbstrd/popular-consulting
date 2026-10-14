import React from "react";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import NavierStokesControls from "./NavierStokesControls";
import { getNavierColorway, NAVIER_COLORWAYS } from "./navierStokesColorways";

afterEach(() => { cleanup(); jest.restoreAllMocks(); });

// Excluded states: altered motion/history, a remounted canvas, unsafe lookup,
// non-finite GPU colors, lost keyboard focus, or an altered default appearance.
test.each([undefined, null, "", "GLACIER", "__proto__", "constructor", 1, NaN, Infinity, {}, []])(
  "unrecognized colorway %p selects the original", value => {
    expect(getNavierColorway(value)).toBe(NAVIER_COLORWAYS[0]);
  },
);

test("six fixed, immutable palettes contain bounded GPU and authored CSS data", () => {
  expect(NAVIER_COLORWAYS).toHaveLength(6);
  expect(new Set(NAVIER_COLORWAYS.map(option => option.id)).size).toBe(6);
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
  const silver = getNavierColorway("quicksilver").colors;
  for (let i = 0; i < silver.length; i += 3) {
    expect(silver[i]).toBe(silver[i + 1]);
    expect(silver[i]).toBe(silver[i + 2]);
  }
});

test("removing only color overrides exactly recovers the approved original shader", () => {
  const source = fs.readFileSync(path.join(__dirname, "NavierStokesShader.js"), "utf8");
  const original = source.replace("uniform int u_navierColorway;\nuniform vec3 u_navierColors[8];\n", "")
    .replace(/\nvec3 navierColor\(int index, vec3 original\) \{\n  return u_navierColorway > 0 \? u_navierColors\[index\] : original;\n\}\n/, "")
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
  fireEvent.click(screen.getByRole("button", { name: "Glacier", hidden: true }));
  expect(onColorwayChange).toHaveBeenCalledTimes(1);
  expect(onColorwayChange).toHaveBeenCalledWith("glacier");
  expect(onProgressChange).not.toHaveBeenCalled();
  expect(disclosure.open).toBe(false);
  expect(disclosure.querySelector("summary")).toHaveFocus();
  rerender(<NavierStokesControls progress={0.8} colorway="glacier"
    onProgressChange={onProgressChange} onColorwayChange={onColorwayChange} />);
  expect(screen.getByRole("slider", { name: /Concentration/ })).toHaveValue("80");
  expect(screen.getByRole("button", { name: "Glacier", hidden: true })).toHaveAttribute("aria-pressed", "true");
  expect(disclosure.querySelector("summary")).toHaveAttribute("aria-label", "Colorway: Glacier");
});

test("fallback recolors locally without replacing the canvas or resuming it", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const { container, rerender } = render(<CreatorOSFieldCanvas mode={9} paused navierProgress={0.7} />);
  const shell = container.querySelector(".creatoros-field-shell");
  const canvas = container.querySelector("canvas");
  await waitFor(() => expect(shell).toHaveClass("is-fallback"));
  expect(shell).toHaveAttribute("data-navier-colorway", "original");
  rerender(<CreatorOSFieldCanvas mode={9} paused navierProgress={0.7} navierColorway="ember" />);
  expect(shell).toHaveAttribute("data-navier-colorway", "ember");
  expect(shell.style.getPropertyValue("--navier-ink-0")).toBe(getNavierColorway("ember").cssVariables["--navier-ink-0"]);
  expect(shell).toHaveAttribute("data-navier-progress", "0.7");
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(container.querySelectorAll("canvas")).toHaveLength(1);
  rerender(<CreatorOSFieldCanvas mode={9} paused navierColorway="__proto__" />);
  expect(shell).toHaveAttribute("data-navier-colorway", "original");
});
