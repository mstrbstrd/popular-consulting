import React from "react";
import MetabloomAvatar from "./MetabloomAvatar";
import MetabloomPaletteContext from "../contexts/MetabloomPaletteContext";
import { act, cleanup, render } from "@testing-library/react";
import CreatorOSFieldCanvas, { specializeCreatorOSFieldFragmentShader } from "./CreatorOSFieldCanvas";
import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";
import { createDitherCanvasContext, createDitherCanvasCadence, getDitherCanvasSize } from "../utils/ditherCanvasRuntime";

let mockGl, mockFrame, mockCadence, mockMotion, mockWebGLAllowed;
const originalMatchMedia = window.matchMedia;
jest.mock("../utils/deviceTier", () => ({ isMobileTier: false }));
jest.mock("../utils/graphicsPolicy", () => ({
  get shouldAttemptWebGL() { return mockWebGLAllowed; },
}));
jest.mock("../utils/ditherCanvasRuntime", () => ({
  createDitherCanvasContext: jest.fn(),
  createDitherCanvasCadence: jest.fn(),
  ditherCanvasRuntimeProfile: { id: "desktop" },
  getDitherCanvasFrameInterval: (value) => value,
  getDitherCanvasSize: jest.fn(() => ({ width: 400, height: 300 })),
}));
const frame = (count = 1) => act(() => { for (let i = 0; i < count; i++) mockFrame({ deltaMs: 100 }); });
const uniform = (method, name) => mockGl[method].mock.calls.filter(([key]) => key === name).at(-1)?.slice(1);
const field = (mode, paused = false) => <CreatorOSFieldCanvas mode={mode} metabloomAvatarEnabled metabloomSceneTransitions paused={paused} />;

beforeEach(() => {
  jest.clearAllMocks();
  mockWebGLAllowed = true;
  getDitherCanvasSize.mockReturnValue({ width: 400, height: 300 });
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

test("slow frames cannot stretch scene previews beyond their presentation timers", () => {
  const { rerender } = render(field(0));
  frame();
  rerender(field(1));
  act(() => mockFrame({ deltaMs: 600 }));
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0.5, 0.5, 0]);
  act(() => mockFrame({ deltaMs: 600 }));
  expect(uniform("uniform3f", "u_activityWeights")).toEqual([0, 1, 0]);
  rerender(<CreatorOSFieldCanvas metabloomSceneTransitions metabloomAvatarEnabled metabloomUnderHoodPhase="open" />);
  const time = uniform("uniform1f", "u_time")[0];
  act(() => mockFrame({ deltaMs: 1700 }));
  expect(uniform("uniform2f", "u_underHood")).toEqual([1, 1]);
  // The fluid simulation still advances in bounded steps after a stall.
  expect(uniform("uniform1f", "u_time")[0] - time).toBeLessThanOrEqual(0.101);
  rerender(<CreatorOSFieldCanvas metabloomSceneTransitions metabloomAvatarEnabled metabloomUnderHoodPhase="closing" />);
  act(() => mockFrame({ deltaMs: 1600 }));
  uniform("uniform2f", "u_underHood").forEach((value) => expect(value).toBeCloseTo(0));
});

test("CSS graphics policy preserves scene changes without creating a WebGL context", () => {
  mockWebGLAllowed = false;
  const { container, rerender } = render(field(0));
  expect(container.querySelector(".creatoros-field-fallback")).toBeInTheDocument();
  rerender(field(1));
  expect(container.querySelector(".creatoros-field-shell")).toHaveClass("is-fallback", "creatoros-field-mode-1");
  expect(createDitherCanvasContext).not.toHaveBeenCalled();
  expect(createDitherCanvasCadence).not.toHaveBeenCalled();
});

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

test("the activity sampler keeps the optional seam reveal inside the Metabloom scene", () => {
  const source = specializeCreatorOSFieldFragmentShader(CREATOROS_FIELD_FRAGMENT_SHADER, 0, true);
  const sampler = source.slice(source.indexOf("uniform vec3 u_activityWeights"), source.indexOf("\n\nvoid main()", source.indexOf("vec4 sampleScene")));
  expect(sampler).toContain("sceneMetabloomUnderHood(uv, time)");
  expect(sampler).toContain("if (u_underHood.y <= 0.0) return sceneMetabloom(uv, time)");
  expect(sampler).toContain("if (inside > 0.0)");
  expect(sampler).toContain("sceneForwardPass(uv, time)");
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


test("the seam opens and closes in the existing program without resetting its clock or seed", () => {
  const hood = (phase) => <CreatorOSFieldCanvas metabloomSceneTransitions metabloomAvatarEnabled metabloomUnderHoodPhase={phase} />;
  const { rerender, container } = render(hood(null));
  const canvas = container.querySelector("canvas");
  frame(8);
  const seed = uniform("uniform1f", "u_seed")[0];
  const time = uniform("uniform1f", "u_time")[0];
  rerender(hood("seam"));
  frame(7);
  expect(uniform("uniform2f", "u_underHood")).toEqual([0, 1]);
  rerender(hood("open"));
  frame(8);
  expect(uniform("uniform2f", "u_underHood")[0]).toBeGreaterThan(0);
  expect(uniform("uniform2f", "u_underHood")[0]).toBeLessThan(1);
  frame(10);
  expect(uniform("uniform2f", "u_underHood")).toEqual([1, 1]);
  rerender(hood("closing"));
  frame(8);
  expect(uniform("uniform2f", "u_underHood")[0]).toBeCloseTo(0.5);
  rerender(hood(null));
  frame();
  expect(uniform("uniform2f", "u_underHood")).toEqual([0, 0]);
  expect(uniform("uniform1f", "u_seed")[0]).toBe(seed);
  expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
  expect(createDitherCanvasCadence).toHaveBeenCalledTimes(1);
});

test("reduced motion shows a static network and clears it without scheduling animation", () => {
  mockMotion.matches = true;
  const { rerender } = render(<CreatorOSFieldCanvas metabloomSceneTransitions metabloomUnderHoodPhase="open" />);
  expect(uniform("uniform2f", "u_underHood")).toEqual([1, 1]);
  rerender(<CreatorOSFieldCanvas metabloomSceneTransitions />);
  expect(uniform("uniform2f", "u_underHood")).toEqual([0, 0]);
  expect(mockCadence.schedule).not.toHaveBeenCalled();
});

test.each(["spectral", "metalbloom", "nova", "metalnova"])(
  "passive %s Orb scenes ignore pointer gestures while animation and commanded pulses continue", (palette) => {
    const passiveField = (mode, externalPulseVersion = 0) => <CreatorOSFieldCanvas
      mode={mode} metabloomPalette={palette} metabloomAvatarEnabled metabloomSceneTransitions
      pointerReactive={false} externalPulseVersion={externalPulseVersion} />;
    const { container, rerender } = render(passiveField(0));
    const shell = container.querySelector(".creatoros-field-shell");
    for (const mode of [0, 1, 3]) {
      rerender(passiveField(mode));
      frame(12);
      const time = uniform("uniform1f", "u_time")[0];
      mockCadence.schedule.mockClear();
      act(() => {
        shell.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 80, clientY: 20 }));
        shell.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 80, clientY: 20 }));
      });
      expect(mockCadence.schedule).not.toHaveBeenCalled();
      frame();
      expect(uniform("uniform2f", "u_pointer")).toEqual([0.52, 0.52]);
      expect(uniform("uniform1f", "u_energy")).toEqual([0]);
      expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
    }
    rerender(passiveField(3, 1));
    frame();
    expect(uniform("uniform1f", "u_energy")[0]).toBeGreaterThan(0);
    expect(uniform("uniform2f", "u_pulseOrigin")).toEqual([0.52, 0.52]);
    expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
  },
);

test("disabling pointer response clears previous hover state without replacing the live field", () => {
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 });
  const { container, rerender } = render(<CreatorOSFieldCanvas />);
  const canvas = container.querySelector("canvas"), shell = container.querySelector(".creatoros-field-shell");
  const move = (x, y) => act(() => shell.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y })));
  move(80, 20);
  frame();
  expect(uniform("uniform2f", "u_pointer")).toEqual([0.8, 0.8]);
  expect(uniform("uniform1f", "u_energy")[0]).toBeGreaterThan(0);
  const time = uniform("uniform1f", "u_time")[0];
  rerender(<CreatorOSFieldCanvas pointerReactive={false} />);
  move(10, 90);
  frame();
  expect(uniform("uniform2f", "u_pointer")).toEqual([0.52, 0.52]);
  expect(uniform("uniform1f", "u_energy")).toEqual([0]);
  expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
  rerender(<CreatorOSFieldCanvas pointerReactive />);
  move(30, 60);
  frame();
  expect(uniform("uniform2f", "u_pointer")).toEqual([0.3, 0.4]);
  expect(uniform("uniform1f", "u_energy")[0]).toBeGreaterThan(0);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
});


test.each(["spectral", "metalbloom", "nova", "metalnova"])(
  "provider colours transition in the same %s renderer without resetting time or seed", (finish) => {
    const avatar = provider => <MetabloomPaletteContext.Provider value={finish}>
      <MetabloomAvatar provider={provider} />
    </MetabloomPaletteContext.Provider>;
    const { container, rerender } = render(avatar(null));
    frame(8);
    expect(uniform("uniform1f", "u_metabloomProviderMix")).toEqual([0]);
    const canvas = container.querySelector("canvas");
    const time = uniform("uniform1f", "u_time")[0];
    const seed = uniform("uniform1f", "u_seed")[0];
    for (const [provider, color] of [["anthropic", [217, 102, 56]], ["openai", [22, 167, 122]], ["deepseek", [56, 107, 255]]]) {
      const previous = uniform("uniform3f", "u_avatarColorA");
      rerender(avatar(provider));
      frame();
      const transitioning = uniform("uniform3f", "u_avatarColorA");
      expect(transitioning).not.toEqual(previous);
      expect(transitioning).not.toEqual(color.map(value => value / 255));
      frame(30);
      uniform("uniform3f", "u_avatarColorA").forEach((value, i) => expect(value).toBeCloseTo(color[i] / 255, 4));
      expect(uniform("uniform1f", "u_metabloomProviderMix")[0]).toBeCloseTo(1, 4);
      expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
      expect(uniform("uniform1f", "u_seed")[0]).toBe(seed);
      expect(container.querySelector("canvas")).toBe(canvas);
    }
    expect(uniform("uniform1f", "u_metabloomPaletteMix")).toEqual([finish.startsWith("metal") ? 1 : 0]);
    expect(uniform("uniform1f", "u_metabloomNovaMix")).toEqual([finish.includes("nova") ? 1 : 0]);
    expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
    expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
  },
);

test.each(["paused", "reduced-motion"])("provider colours redraw a %s Orb without advancing motion", state => {
  mockMotion.matches = state === "reduced-motion";
  const avatar = provider => <MetabloomAvatar provider={provider} paused={state === "paused"} />;
  const { rerender } = render(avatar("openai"));
  if (!mockMotion.matches) frame();
  const time = uniform("uniform1f", "u_time")[0];
  rerender(avatar("anthropic"));
  if (!mockMotion.matches) act(() => expect(mockFrame({ deltaMs: 100 })).toBe(false));
  expect(uniform("uniform3f", "u_avatarColorA")).toEqual([217 / 255, 102 / 255, 56 / 255]);
  expect(uniform("uniform1f", "u_metabloomProviderMix")).toEqual([1]);
  expect(uniform("uniform1f", "u_time")[0]).toBe(time);
  expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
  if (mockMotion.matches) expect(mockCadence.schedule).not.toHaveBeenCalled();
});

test("context restoration keeps the latest provider colour", () => {
  const { container, rerender } = render(<MetabloomAvatar provider="openai" paused />);
  frame();
  const canvas = container.querySelector("canvas");
  act(() => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  const draws = mockGl.drawArrays.mock.calls.length;
  rerender(<MetabloomAvatar provider="anthropic" paused />);
  frame();
  expect(mockGl.drawArrays).toHaveBeenCalledTimes(draws);
  act(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
  frame();
  expect(uniform("uniform3f", "u_avatarColorA")).toEqual([217 / 255, 102 / 255, 56 / 255]);
  expect(uniform("uniform1f", "u_metabloomProviderMix")).toEqual([1]);
  expect(container.querySelector("canvas")).toBe(canvas);
});

test.each(["spectral", "metalbloom", "nova", "metalnova"])(
  "three council seats reuse one %s context, program and draw per frame", finish => {
    const speaker = provider => ({ provider, round: "Critique", state: "running", key: provider });
    const avatar = (council, provider = null) => <MetabloomPaletteContext.Provider value={finish}>
      <MetabloomAvatar council={council} councilSpeaker={provider ? speaker(provider) : null} />
    </MetabloomPaletteContext.Provider>;
    const { container, rerender } = render(avatar(false));
    frame(8);
    const canvas = container.querySelector("canvas"), seed = uniform("uniform1f", "u_seed")[0];
    const time = uniform("uniform1f", "u_time")[0];
    expect(uniform("uniform1f", "u_councilLayout")).toEqual([0]);
    rerender(avatar(true)); frame(5);
    expect(uniform("uniform1f", "u_councilLayout")[0]).toBeGreaterThan(0);
    expect(uniform("uniform1f", "u_councilLayout")[0]).toBeLessThan(1);
    frame(10);
    expect(uniform("uniform1f", "u_councilLayout")).toEqual([1]);
    for (const [provider, seat] of [["openai", 1], ["deepseek", 0], ["anthropic", 2]]) {
      rerender(avatar(true, provider)); frame(30);
      const gestures = uniform("uniform4fv", "u_councilGesture[0]")[0];
      expect(gestures[seat * 4 + 3]).toBeGreaterThan(0);
      const draws = mockGl.drawArrays.mock.calls.length;
      frame();
      expect(mockGl.drawArrays).toHaveBeenCalledTimes(draws + 1);
    }
    rerender(avatar(false)); frame(15);
    expect(uniform("uniform1f", "u_councilLayout")).toEqual([0]);
    expect(uniform("uniform1f", "u_metabloomProviderMix")).toEqual([0]);
    expect(uniform("uniform1f", "u_seed")[0]).toBe(seed);
    expect(uniform("uniform1f", "u_time")[0]).toBeGreaterThan(time);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
    expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
  },
);

test.each(["paused", "reduced-motion"])("%s council switches seats statically and never speaks", state => {
  mockMotion.matches = state === "reduced-motion";
  const avatar = council => <MetabloomAvatar council={council} paused={state === "paused"}
    councilSpeaker={{ provider: "anthropic", state: "running", round: "Opening", key: "2" }} />;
  const { rerender } = render(avatar(false));
  if (!mockMotion.matches) frame();
  const time = uniform("uniform1f", "u_time")[0];
  rerender(avatar(true));
  if (!mockMotion.matches) act(() => expect(mockFrame({ deltaMs: 100 })).toBe(false));
  expect(uniform("uniform1f", "u_councilLayout")).toEqual([1]);
  const gestures = uniform("uniform4fv", "u_councilGesture[0]")[0];
  [3, 7, 11].forEach(index => expect(gestures[index]).toBe(0));
  expect(uniform("uniform1f", "u_time")[0]).toBe(time);
  if (mockMotion.matches) expect(mockCadence.schedule).not.toHaveBeenCalled();
  expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
});

test("hidden council updates wait for visibility and context recovery retains the latest roster", () => {
  let hidden = false;
  jest.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
  const { container, rerender } = render(<MetabloomAvatar council />);
  frame(15);
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  const draws = mockGl.drawArrays.mock.calls.length;
  rerender(<MetabloomAvatar council councilSpeaker={{ provider: "deepseek", state: "running", round: "Opening", key: "1" }} />);
  frame(20);
  expect(mockGl.drawArrays).toHaveBeenCalledTimes(draws);
  hidden = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  frame(20);
  expect(uniform("uniform4fv", "u_councilGesture[0]")[0][3]).toBeGreaterThan(0);
  const canvas = container.querySelector("canvas");
  act(() => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  rerender(<MetabloomAvatar council paused />);
  act(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
  frame();
  expect(uniform("uniform1f", "u_councilLayout")).toEqual([1]);
  [3, 7, 11].forEach(index => expect(uniform("uniform4fv", "u_councilGesture[0]")[0][index]).toBe(0));
  expect(container.querySelector("canvas")).toBe(canvas);
});


test.each(["moving", "paused", "reduced-motion"])("%s council resize retains the previous buffer until its replacement draw", state => {
  const OriginalObserver = global.ResizeObserver;
  let resize;
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  };
  try {
    mockMotion.matches = state === "reduced-motion";
    const { container, rerender, unmount } = render(<MetabloomAvatar paused={state === "paused"} />);
    if (!mockMotion.matches) frame();
    const canvas = container.querySelector("canvas");
    expect(canvas.width).toBe(400);
    const widthWrites = jest.spyOn(HTMLCanvasElement.prototype, "width", "set");
    const heightWrites = jest.spyOn(HTMLCanvasElement.prototype, "height", "set");
    const seed = uniform("uniform1f", "u_seed")[0];
    rerender(<MetabloomAvatar council paused={state === "paused"} />);
    // CSS emits several ResizeObserver records between cadence ticks. They may
    // invalidate a frame, but cannot erase the already-presented image.
    mockGl.drawArrays.mockClear(); widthWrites.mockClear(); heightWrites.mockClear();
    const notifyResize = resize;
    for (const width of [380, 360, 340]) {
      getDitherCanvasSize.mockReturnValue({ width, height: 300 });
      act(notifyResize);
      if (mockMotion.matches) {
        expect(canvas.width).toBe(width);
        expect(mockGl.drawArrays).toHaveBeenCalledTimes((400 - width) / 20);
      } else {
        expect(canvas.width).toBe(400);
        expect(widthWrites).not.toHaveBeenCalled();
        expect(mockGl.drawArrays).not.toHaveBeenCalled();
      }
    }
    if (!mockMotion.matches) {
      frame();
      expect(canvas.width).toBe(340);
      expect(widthWrites).toHaveBeenCalledTimes(1);
      expect(mockGl.drawArrays).toHaveBeenCalledTimes(1);
    }
    expect(widthWrites.mock.invocationCallOrder.at(-1)).toBeLessThan(mockGl.drawArrays.mock.invocationCallOrder.at(-1));
    expect(heightWrites.mock.invocationCallOrder.at(-1)).toBeLessThan(mockGl.drawArrays.mock.invocationCallOrder.at(-1));
    expect(uniform("uniform1f", "u_seed")[0]).toBe(seed);
    expect(createDitherCanvasContext).toHaveBeenCalledTimes(1);
    expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
    let hidden = true;
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    mockGl.drawArrays.mockClear(); widthWrites.mockClear();
    getDitherCanvasSize.mockReturnValue({ width: 320, height: 300 });
    act(notifyResize);
    frame();
    expect(canvas.width).toBe(340);
    expect(widthWrites).not.toHaveBeenCalled();
    expect(mockGl.drawArrays).not.toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    if (!mockMotion.matches) frame();
    expect(canvas.width).toBe(320);
    expect(mockGl.drawArrays).toHaveBeenCalledTimes(1);
    unmount();
  } finally { global.ResizeObserver = OriginalObserver; }
});

test("the buffer follows the layout box, not a presentation transform", () => {
  // The companion animates the field between /orb and the dock with a FLIP
  // transform. A resize record arrives while the transform still shows the old
  // size; the buffer must take the new layout size and aspect anyway.
  const OriginalObserver = global.ResizeObserver;
  let resize;
  global.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() {} };
  const rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 96, height: 96 });
  const width = jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  const height = jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(480);
  try {
    render(<MetabloomAvatar />);
    frame();
    getDitherCanvasSize.mockClear();
    act(resize);
    frame();
    expect(getDitherCanvasSize).toHaveBeenCalledWith(640, 480, expect.any(Number));
    expect(getDitherCanvasSize).not.toHaveBeenCalledWith(96, 96, expect.any(Number));
  } finally {
    rect.mockRestore(); width.mockRestore(); height.mockRestore();
    global.ResizeObserver = OriginalObserver;
  }
});
