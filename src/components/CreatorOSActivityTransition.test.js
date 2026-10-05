import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import CreatorOSFieldCanvas, { specializeCreatorOSFieldFragmentShader } from "./CreatorOSFieldCanvas";
import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";
import { createDitherCanvasContext, createDitherCanvasCadence } from "../utils/ditherCanvasRuntime";

let mockGl, mockFrame, mockCadence, mockMotion;
const originalMatchMedia = window.matchMedia;
jest.mock("../utils/deviceTier", () => ({ isMobileTier: false }));
jest.mock("../utils/ditherCanvasRuntime", () => ({
  createDitherCanvasContext: jest.fn(),
  createDitherCanvasCadence: jest.fn(),
  ditherCanvasRuntimeProfile: { id: "desktop" },
  getDitherCanvasFrameInterval: (value) => value,
  getDitherCanvasSize: () => ({ width: 400, height: 300 }),
}));
const frame = (count = 1) => act(() => { for (let i = 0; i < count; i++) mockFrame({ deltaMs: 100 }); });
const uniform = (method, name) => mockGl[method].mock.calls.filter(([key]) => key === name).at(-1)?.slice(1);
const field = (mode, paused = false) => <CreatorOSFieldCanvas mode={mode} metabloomAvatarEnabled metabloomSceneTransitions paused={paused} />;

beforeEach(() => {
  jest.clearAllMocks();
  mockGl = new Proxy({
    createShader: jest.fn(() => ({})), createProgram: jest.fn(() => ({})),
    createBuffer: jest.fn(() => ({})), createTexture: jest.fn(() => ({})),
    getShaderParameter: jest.fn(() => true), getProgramParameter: jest.fn(() => true),
    getAttribLocation: jest.fn(() => 0), getUniformLocation: jest.fn((_, name) => name),
  }, { get(target, key) {
    if (!(key in target)) target[key] = /^[A-Z_0-9]+$/.test(key) ? 0 : jest.fn();
    return target[key];
  } });
  mockMotion = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => mockMotion);
  createDitherCanvasContext.mockImplementation(() => mockGl);
  createDitherCanvasCadence.mockImplementation(({ onFrame }) => {
    mockFrame = onFrame;
    mockCadence = { schedule: jest.fn(), reset: jest.fn(), cancel: jest.fn(), dispose: jest.fn() };
    return mockCadence;
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); window.matchMedia = originalMatchMedia; });

test("Orb theme changes preserve one program, clock, canvas and cadence", () => {
  const { container, rerender, unmount } = render(field(0));
  const canvas = container.querySelector("canvas");
  frame(8);
  const time = uniform("uniform1f", "u_time")[0];
  const seed = uniform("uniform1f", "u_seed")[0];
  rerender(field(1));
  frame(6);
  const weights = uniform("uniform3f", "u_activityWeights");
  expect(weights[0]).toBeCloseTo(0.5);
  expect(weights[1]).toBeCloseTo(0.5);
  expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
  expect(uniform("uniform1f", "u_seed")[0]).toBe(seed);
  expect(uniform("uniform1f", "u_avatarEnabled")).toEqual([1]);
  rerender(field(3));
  frame();
  expect(uniform("uniform3f", "u_activityWeights")[0]).toBeGreaterThan(0);
  expect(uniform("uniform3f", "u_activityWeights")[1]).toBeGreaterThan(0);
  frame(12);
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 0, 1]);
  expect(uniform("uniform1f", "u_avatarEnabled")).toEqual([0]);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
  expect(createDitherCanvasCadence).toHaveBeenCalledTimes(1);
  expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
  unmount();
  expect(mockGl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(mockGl.deleteTexture).toHaveBeenCalledTimes(1);
  expect(mockCadence.dispose).toHaveBeenCalledTimes(1);
});

test("reduced motion and pause settle without leaving a partial scene", () => {
  mockMotion.matches = true;
  const { rerender } = render(field(0));
  rerender(field(1));
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 1, 0]);
  expect(mockCadence.schedule).not.toHaveBeenCalled();
  mockMotion.matches = false;
  act(() => mockMotion.addEventListener.mock.calls.find(([name]) => name === "change")[1]());
  rerender(field(3, true));
  frame();
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 0, 1]);
  expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
});

test("other field pages keep their existing single-scene program lifecycle", () => {
  const { rerender } = render(<CreatorOSFieldCanvas mode={0} />);
  rerender(<CreatorOSFieldCanvas mode={1} />);
  expect(mockGl.createProgram).toHaveBeenCalledTimes(2);
  expect(mockGl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(uniform("uniform3f", "u_activityWeights")).toBeUndefined();
});

test("a hidden document resumes at the latest scene without replaying transitions", () => {
  let hidden = false;
  jest.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
  const { rerender } = render(field(0));
  rerender(field(1));
  frame(3);
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(mockCadence.cancel).toHaveBeenCalled();
  rerender(field(3));
  hidden = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  frame();
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 0, 1]);
});

test("the activity sampler exposes only three scenes and blends premultiplied colors", () => {
  const source = specializeCreatorOSFieldFragmentShader(CREATOROS_FIELD_FRAGMENT_SHADER, 0, true);
  const sampler = source.slice(source.indexOf("uniform vec3 u_activityWeights"), source.indexOf("\n\nvoid main()", source.indexOf("vec4 sampleScene")));
  expect(sampler).toContain("sceneMetabloom(uv, time)");
  expect(sampler).toContain("sceneTidalWeave(uv, time)");
  expect(sampler).toContain("sceneContourDrift(uv, time)");
  expect(sampler).not.toContain("sceneMorphogen");
  expect(sampler).toContain("scene.rgb * scene.a");
  expect(sampler).toContain("if (u_activityWeights[0] > 0.0)");
});

test("context loss stops drawing, releases blend styles and restores the requested scene", () => {
  const { container, rerender } = render(field(0));
  rerender(field(1));
  frame(4);
  const canvas = container.querySelector("canvas");
  const shell = container.querySelector(".creatoros-field-shell");
  act(() => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  expect(shell).toHaveClass("is-fallback");
  expect(shell.style.getPropertyValue("--field-tidal-weight")).toBe("");
  const draws = mockGl.drawArrays.mock.calls.length;
  rerender(field(3));
  frame();
  expect(mockGl.drawArrays).toHaveBeenCalledTimes(draws);
  act(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
  frame();
  expect(shell).not.toHaveClass("is-fallback");
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 0, 1]);
  expect(mockGl.createProgram).toHaveBeenCalledTimes(2);
});
