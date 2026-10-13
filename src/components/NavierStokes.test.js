import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorOSFieldCanvas, { specializeCreatorOSFieldFragmentShader } from "./CreatorOSFieldCanvas";
import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";
import { NAVIER_STOKES_SHADER } from "./NavierStokesShader";
import { navierCoreScales, normalizeNavierProgress } from "./navierStokesModel";
import NavierStokesControls from "./NavierStokesControls";

// Excluded states: non-finite GPU inputs, a second renderer, fabricated proof
// telemetry, infinite forcing, and a claimed numerical passage through T.
describe("Finite Infinity boundaries", () => {
  afterEach(() => { cleanup(); jest.restoreAllMocks(); });
  test.each([undefined, null, "0.5", NaN, Infinity, -Infinity, -0.2, {}, []])(
    "rejects invalid progress %p into the automatic sentinel", value => {
      expect(normalizeNavierProgress(value)).toBe(-1);
    },
  );
  test("bounds finite inspection input", () => {
    expect(normalizeNavierProgress(0)).toBe(0);
    expect(normalizeNavierProgress(0.4)).toBe(0.4);
    expect(normalizeNavierProgress(100)).toBe(1);
  });
  test("both dimensions shrink while speed rises and core energy falls", () => {
    let previous = navierCoreScales(0);
    for (let index = 1; index <= 100; index++) {
      const next = navierCoreScales(index / 100);
      expect(Object.values(next).every(value => Number.isFinite(value) && value > 0)).toBe(true);
      expect(next.radius).toBeLessThan(previous.radius);
      expect(next.length).toBeLessThan(previous.length);
      expect(next.speed).toBeGreaterThan(previous.speed);
      expect(next.energy).toBeLessThan(previous.energy);
      expect(next.length / next.radius).toBeGreaterThan(previous.length / previous.radius);
      expect(next.energy).toBeCloseTo(next.speed ** 2 * next.radius ** 2 * next.length, 10);
      previous = next;
    }
  });
  test("keeps one specialized display and a bounded replay", () => {
    const source = specializeCreatorOSFieldFragmentShader(CREATOROS_FIELD_FRAGMENT_SHADER, 9);
    const start = source.indexOf("vec4 sampleScene");
    expect(source.slice(start, source.indexOf("\n\nvoid main()", start))).toContain("return sceneNavierStokes(uv, time)");
    expect(NAVIER_STOKES_SHADER).toContain("u_navierDye");
    expect(NAVIER_STOKES_SHADER).toContain("u_navierFluidReady");
    expect(NAVIER_STOKES_SHADER).not.toMatch(/while\s*\(/);
    expect(NAVIER_STOKES_SHADER).toContain("1.0 - smoothstep(0.94, 1.0, cycle)");
  });
  test("inspection stays on the same paused canvas, including local fallback", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container, rerender } = render(<CreatorOSFieldCanvas mode={9} paused />);
    const shell = container.querySelector(".creatoros-field-shell");
    const canvas = container.querySelector("canvas");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(shell).toHaveAttribute("data-navier-progress", "-1");
    rerender(<CreatorOSFieldCanvas mode={9} paused navierProgress={0.8} />);
    expect(shell).toHaveAttribute("data-navier-progress", "0.8");
    expect(shell).toHaveAttribute("data-reaction-runtime", "inactive");
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    rerender(<CreatorOSFieldCanvas mode={9} paused navierProgress={Infinity} />);
    expect(shell).toHaveAttribute("data-navier-progress", "-1");
  });
  test("controls expose bounded scales with source and schematic attribution", () => {
    const onProgressChange = jest.fn();
    const { rerender } = render(<NavierStokesControls progress={-1} onProgressChange={onProgressChange} />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(onProgressChange).toHaveBeenLastCalledWith(0.5);
    rerender(<NavierStokesControls progress={0.5} onProgressChange={onProgressChange} />);
    fireEvent.change(screen.getByRole("slider", { name: /Concentration/ }), { target: { value: "80" } });
    expect(onProgressChange).toHaveBeenLastCalledWith(0.8);
    expect(screen.getByText(/Leading-order scales, not measured data/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /OpenAI research/, hidden: true });
    expect(link).toHaveAttribute("href", "https://openai.com/index/navier-stokes-solution/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Evolve" }));
    expect(onProgressChange).toHaveBeenLastCalledWith(-1);
  });
});
