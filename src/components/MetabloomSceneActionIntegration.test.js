import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppNavigationContext } from "../contexts/AppNavigationContext";
import { resolveMetabloomEmote } from "./metabloomEmoteLibrary";
import { METABLOOM_DEMOS } from "./metabloomDemoResponses";
import OrbSection from "./OrbSection";

let mockAvatar;
let mockAvatarHistory;
jest.mock("./MetabloomAvatar", () => (props) => {
  mockAvatar = props;
  mockAvatarHistory.push({ theme: props.activityTheme, hood: props.underHoodPhase });
  return null;
});
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const envelope = (...responses) => ({ version: "2.0.0", segments: responses.map((response) => ({ response })) });
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Explore this question in depth") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
const state = () => window.__orbState();
let requests;
let originalMatchMedia;
let hiddenDescriptor;
const latest = () => requests[requests.length - 1];

beforeEach(() => {
  jest.useFakeTimers();
  requests = [];
  mockAvatarHistory = [];
  originalMatchMedia = window.matchMedia;
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  window.__metabloomRequest = (request) => new Promise((finish, reject) => {
    requests.push({ request, finish, reject });
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  window.matchMedia = originalMatchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
  else delete document.hidden;
  window.__metabloomRequest = null;
});

test("Deep Research is a visible saved option; ordinary requests keep their existing paragraph mode", async () => {
  const saveToolState = jest.fn();
  const navigation = { getToolState: () => null, saveToolState };
  const { unmount } = render(<AppNavigationContext.Provider value={navigation}><OrbSection /></AppNavigationContext.Provider>);
  const toggle = screen.getByRole("checkbox", { name: "Deep Research" });
  expect(toggle).toBeVisible();
  expect(toggle).not.toBeChecked();
  expect(screen.getByRole("button", { name: /Reactions/ })).toBeVisible();
  send("An ordinary greeting");
  await tick(0);
  expect(latest().request).toMatchObject({ actionMode: "auto", allowMultiple: false });
  expect(toggle).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(toggle).toBeEnabled();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  send();
  await tick(0);
  expect(latest().request).toMatchObject({ actionMode: "deep-research", allowMultiple: true });
  const previous = latest().request;
  send("A replacement question");
  await tick(0);
  expect(previous.signal.aborted).toBe(true);
  expect(latest().request).toMatchObject({ actionMode: "deep-research", allowMultiple: true });
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  unmount();
  expect(saveToolState).toHaveBeenCalledWith("orb", expect.objectContaining({ deepResearch: true, pending: false }));
  const saved = saveToolState.mock.calls[0][1];
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByRole("checkbox", { name: "Deep Research" })).toBeChecked();
});

test("a research action holds through progressive paragraphs and the final emote until validated completion", async () => {
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Deep Research" }));
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onReaction({ phase: "input", emote: "curious" });
    expect(request.onAction("deep-research")).toBe(true);
  });
  expect(state()).toMatchObject({ sceneAction: "deep-research", scenePhase: "think", action: "thinking", activity: "idle" });
  await tick(399);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  await tick(1);
  expect(state()).toMatchObject({ scenePhase: "deep-research-diving", theme: "tidal-weave", researchPhase: "diving" });
  expect(screen.getByLabelText("Metabloom model chat interface", { selector: "section" })).toHaveAttribute("data-scene-phase", "deep-research-diving");
  act(() => request.onTextDelta("The first", 0));
  const firstBubble = screen.getByRole("article", { name: "Metabloom message" });
  expect(firstBubble).toHaveTextContent("The first");
  act(() => {
    request.onTextDelta(" paragraph.", 0);
    request.onSegment({ response: "The first paragraph." }, 0);
    request.onTextDelta("Another perspective.", 1);
  });
  expect(screen.getByRole("article", { name: "Metabloom message" })).toBe(firstBubble);
  expect(firstBubble).toHaveTextContent("Another perspective.");
  await tick(7000);
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Diving deep");
  act(() => {
    request.onSegment({ response: "Another perspective." }, 1);
    request.onReaction({ phase: "response", emote: "resolute" });
  });
  expect(state()).toMatchObject({ scenePhase: "deep-research-diving", pending: true, emote: "resolute" });
  await act(async () => finish(envelope("The first paragraph.", "Another perspective.")));
  expect(state()).toMatchObject({ scenePhase: "deep-research-surfacing", pending: false, emote: "resolute" });
  expect(firstBubble).toHaveAttribute("data-stream-status", "complete");
  expect(window.__orbMessages().filter((message) => message.role === "assistant")).toHaveLength(1);
  await tick(650);
  expect(state()).toMatchObject({ scenePhase: "deep-research-surfacing", theme: "metabloom" });
  await tick(1200);
  expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, researchPhase: null });
});

test.each(["authored demo", "unconfigured fallback"])("Deep Research also selects the scene for an %s without changing its preview response", async (source) => {
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Deep Research" }));
  send(source === "authored demo" ? METABLOOM_DEMOS[0].prompt : "An original greeting");
  await tick(0);
  if (source === "unconfigured fallback") await act(async () => latest().finish(null));
  expect(requests).toHaveLength(source === "authored demo" ? 0 : 1);
  expect(state()).toMatchObject({ sceneAction: "deep-research", scenePhase: "think", responseSource: "preview" });
  await tick(400);
  expect(mockAvatar.activityTheme).toBe("tidal-weave");
  await tick(120);
  expect(screen.getByText("Preview response")).toBeInTheDocument();
  if (source === "authored demo") expect(screen.getByText(METABLOOM_DEMOS[0].segments[0].response)).toBeInTheDocument();
  expect(state().scenePhase).toBe("deep-research-diving");
  await tick(200);
  expect(state()).toMatchObject({ pending: false, scenePhase: "deep-research-surfacing", responseSource: "preview" });
});

test("under the hood stays open across the input chain, ordinary emotes, and a held response", async () => {
  render(<OrbSection />);
  send("Show me a trick");
  await tick(0);
  const { request, finish } = latest();
  expect(request.actionMode).toBe("auto");
  act(() => {
    request.onReaction({ phase: "input", emote: "explore-and-consider" });
    expect(request.onAction("under-the-hood")).toBe(true);
  });
  await tick(400);
  expect(mockAvatar.underHoodPhase).toBe("seam");
  await tick(700);
  expect(state()).toMatchObject({ scenePhase: "under-the-hood-opening", underHoodPhase: "open" });
  await tick(Math.max(0, resolveMetabloomEmote("curious").duration - 1100));
  expect(state().emote).toBe("reflective");
  expect(mockAvatar.underHoodPhase).toBe("open");
  act(() => request.onTextDelta("Here is the trick.", 0));
  await tick(8000);
  expect(screen.getByText("Here is the trick.")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Scene progress" })).toHaveTextContent("Forward Pass scene");
  expect(mockAvatar.underHoodPhase).toBe("open");
  act(() => {
    request.onSegment({ response: "Here is the trick." }, 0);
    request.onReaction({ phase: "response", emote: "whimsy" });
  });
  expect(mockAvatar.underHoodPhase).toBe("open");
  await act(async () => finish(envelope("Here is the trick.")));
  expect(state()).toMatchObject({ scenePhase: "under-the-hood-closing", underHoodPhase: "closing", pending: false });
  await tick(1599);
  expect(mockAvatar.underHoodPhase).toBe("closing");
  await tick(1);
  expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, underHoodPhase: null });
});

test.each(["deep-research", "under-the-hood"])("a fast %s reply never delays text or opens after completion", async (action) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onAction(action);
    request.onTextDelta("Already answered.", 0);
  });
  expect(screen.getByText("Already answered.")).toBeInTheDocument();
  expect(state().scenePhase).toBe("think");
  await act(async () => finish(envelope("Already answered.")));
  expect(state()).toMatchObject({ pending: false, sceneAction: "none", scenePhase: null });
  await tick(10000);
  expect(mockAvatarHistory.every(({ theme, hood }) => theme === "metabloom" && hood === null)).toBe(true);
});

test("completion during the hood seam cancels the pending opening step", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => request.onAction("under-the-hood"));
  await tick(500);
  expect(mockAvatar.underHoodPhase).toBe("seam");
  await act(async () => finish(envelope("A quick reveal.")));
  expect(mockAvatar.underHoodPhase).toBe("closing");
  await tick(1600);
  expect(mockAvatar.underHoodPhase).toBeNull();
  expect(mockAvatarHistory.some(({ hood }) => hood === "open")).toBe(false);
});

test.each(["deep-research", "under-the-hood"])("Stop during the %s think lead prevents delayed entry", async (action) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = latest();
  act(() => request.onAction(action));
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  await tick(10000);
  expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, pending: false });
  expect(mockAvatarHistory.every(({ theme, hood }) => theme === "metabloom" && hood === null)).toBe(true);
});

describe.each(["deep-research", "under-the-hood"])("%s request ownership", (action) => {
  test.each(["stop", "reset", "message", "deactivate", "unmount", "error", "hidden"])("%s clears a held scene and rejects late action events", async (operation) => {
    const { rerender, unmount } = render(<OrbSection />);
    send();
    await tick(0);
    const previous = latest();
    act(() => previous.request.onAction(action));
    await tick(1100);
    act(() => previous.request.onTextDelta("A visible prefix", 0));
    if (operation === "unmount") unmount();
    else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
    else if (operation === "message") send("A new request");
    else if (operation === "error") await act(async () => previous.reject(new Error("Provider interrupted")));
    else if (operation === "hidden") act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
    act(() => expect(previous.request.onAction(action)).toBe(false));
    expect(previous.request.signal.aborted).toBe(operation !== "hidden");
    if (operation === "hidden") act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => previous.finish(envelope("A visible prefix")));
    await tick(10000);
    if (operation === "unmount") expect(jest.getTimerCount()).toBe(0);
    else {
      expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, theme: "metabloom", underHoodPhase: null });
      expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "Scene progress" })).not.toBeInTheDocument();
    }
  });
});

test("an old surfacing timer cannot clear a newer scene", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const previous = latest();
  act(() => previous.request.onAction("deep-research"));
  await tick(400);
  await act(async () => previous.finish(envelope("First answer.")));
  await tick(700);
  send("Show me a trick next");
  await tick(0);
  act(() => latest().request.onAction("under-the-hood"));
  await tick(2000);
  expect(state()).toMatchObject({ sceneAction: "under-the-hood", scenePhase: "under-the-hood-opening", underHoodPhase: "open", pending: true });
  act(() => expect(previous.request.onAction("deep-research")).toBe(false));
});

test("invalid final text cancels the scene without a success exit", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => request.onAction("under-the-hood"));
  await tick(1100);
  act(() => request.onTextDelta("Only this prefix", 0));
  await act(async () => finish(envelope("An inconsistent final response")));
  expect(state()).toMatchObject({ sceneAction: "none", underHoodPhase: null, pending: false });
  expect(screen.getByRole("alert")).toHaveTextContent("interrupted");
  expect(mockAvatarHistory.some(({ hood }) => hood === "closing")).toBe(false);
  await tick(10000);
  expect(mockAvatar.underHoodPhase).toBeNull();
});

test("unknown, duplicate, none, and late actions cannot replace a request's decision", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = latest();
  act(() => {
    expect(request.onAction("unknown")).toBe(false);
    expect(request.onAction({ toString: () => "deep-research" })).toBe(false);
    expect(request.onAction("none")).toBe(true);
    expect(request.onAction("deep-research")).toBe(false);
  });
  expect(state().sceneAction).toBe("none");
  send("Another ordinary question");
  await tick(0);
  act(() => {
    latest().request.onTextDelta("The reply has already started", 0);
    expect(latest().request.onAction("under-the-hood")).toBe(false);
  });
  expect(state().sceneAction).toBe("none");
});

test.each(["deep-research", "under-the-hood"])("reduced motion gives %s a static held scene and readable completion", async (action) => {
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} });
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => request.onAction(action));
  expect(state().scenePhase).toBe(action === "deep-research" ? "deep-research-diving" : "under-the-hood-opening");
  expect(mockAvatar).toMatchObject(action === "deep-research" ? { activityTheme: "tidal-weave" } : { underHoodPhase: "open" });
  act(() => request.onTextDelta("A motion-safe answer.", 0));
  await tick(5000);
  expect(state().sceneAction).toBe(action);
  await act(async () => finish(envelope("A motion-safe answer.")));
  expect(state()).toMatchObject({ pending: false, scenePhase: action === "deep-research" ? "deep-research-surfacing" : "under-the-hood-closing" });
  await tick(649);
  expect(state().sceneAction).toBe(action);
  await tick(1);
  expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, theme: "metabloom", underHoodPhase: null });
});
