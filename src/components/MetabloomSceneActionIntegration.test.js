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

test("research completes think, entry, and surfacing before revealing buffered paragraphs, then resumes live deltas", async () => {
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Deep Research" }));
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onReaction({ phase: "input", emote: "curious" });
    expect(request.onAction("deep-research")).toBe(true);
    request.onTextDelta("The first paragraph explores the evidence.", 0);
    request.onSegment({ response: "The first paragraph explores the evidence." }, 0);
    request.onTextDelta("Another perspective", 1);
  });
  expect(state()).toMatchObject({ sceneAction: "deep-research", scenePhase: "think", action: "thinking", activity: "idle" });
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(399);
  expect(mockAvatar.activityTheme).toBe("metabloom");
  await tick(1);
  expect(state()).toMatchObject({ scenePhase: "deep-research-diving", theme: "tidal-weave", researchPhase: "diving" });
  expect(screen.getByLabelText("Metabloom model chat interface", { selector: "section" })).toHaveAttribute("data-scene-phase", "deep-research-diving");
  await tick(1200);
  expect(state()).toMatchObject({ scenePhase: "deep-research-surfacing", pending: true });
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(650);
  expect(state()).toMatchObject({ scenePhase: "deep-research-surfacing", theme: "metabloom" });
  await tick(1200);
  expect(state()).toMatchObject({ sceneAction: "none", scenePhase: null, researchPhase: null, pending: true });
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(16);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(16);
  const firstBubble = screen.getByRole("article", { name: "Metabloom message" });
  const prefix = firstBubble.querySelector("p").textContent;
  expect(prefix.length).toBeGreaterThan(0);
  expect(prefix.length).toBeLessThan("The first paragraph explores the evidence.".length);
  await tick(16);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toBe(firstBubble);
  expect(firstBubble.querySelector("p").textContent.length).toBeGreaterThan(prefix.length);
  await tick(64);
  expect(state().researchDisplayPhase).toBe("live");
  expect(firstBubble).toHaveTextContent("Another perspective");
  act(() => {
    request.onTextDelta(" adds nuance.", 1);
    request.onSegment({ response: "Another perspective adds nuance." }, 1);
    request.onReaction({ phase: "response", emote: "resolute" });
  });
  expect(firstBubble).toHaveTextContent("Another perspective adds nuance.");
  expect(state().emote).not.toBe("resolute");
  expect(firstBubble).toHaveAttribute("data-stream-status", "streaming");
  await act(async () => finish(envelope("The first paragraph explores the evidence.", "Another perspective adds nuance.")));
  expect(state()).toMatchObject({ sceneAction: "none", pending: false, emote: "resolute", researchDisplayPhase: "complete" });
  expect(firstBubble).toHaveAttribute("data-stream-status", "complete");
  expect(window.__orbMessages().filter((message) => message.role === "assistant")).toHaveLength(1);
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
  await tick(320);
  expect(screen.queryByText("Preview response")).not.toBeInTheDocument();
  expect(state().scenePhase).toBe("deep-research-diving");
  expect(state()).toMatchObject({ pending: true, responseSource: "preview" });
  await tick(2730);
  expect(state().sceneAction).toBe("none");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(32);
  expect(screen.getByText("Preview response")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Metabloom message" })).toHaveAttribute("data-stream-status", "streaming");
  await tick(500);
  if (source === "authored demo") expect(screen.getByText(METABLOOM_DEMOS[0].segments[0].response)).toBeInTheDocument();
  expect(state()).toMatchObject({ pending: false, scenePhase: null, responseSource: "preview" });
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

test("a fast under-the-hood reply still displays immediately without a late opening", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onAction("under-the-hood");
    request.onTextDelta("Already answered.", 0);
  });
  expect(screen.getByText("Already answered.")).toBeInTheDocument();
  expect(state().scenePhase).toBe("think");
  await act(async () => finish(envelope("Already answered.")));
  expect(state()).toMatchObject({ pending: false, sceneAction: "none", scenePhase: null });
  await tick(10000);
  expect(mockAvatarHistory.every(({ theme, hood }) => theme === "metabloom" && hood === null)).toBe(true);
});

test("a fast completed research response still enters, surfaces, and reveals multiple prefixes before its final emote", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  const answer = "Evidence and interpretation belong together. ".repeat(25).trim();
  act(() => {
    request.onAction("deep-research");
    request.onTextDelta(answer, 0);
    request.onSegment({ response: answer }, 0);
    request.onReaction({ phase: "response", emote: "resolute" });
  });
  await act(async () => finish(envelope(answer)));
  expect(state()).toMatchObject({ pending: true, scenePhase: "think" });
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(1600);
  expect(state().scenePhase).toBe("deep-research-surfacing");
  await tick(1850);
  expect(state().sceneAction).toBe("none");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(32);
  const bubble = screen.getByRole("article", { name: "Metabloom message" });
  const first = bubble.querySelector("p").textContent;
  expect(first.length).toBeGreaterThan(0);
  expect(first.length).toBeLessThan(answer.length);
  expect(state()).toMatchObject({ pending: true, researchDisplayPhase: "revealing" });
  expect(state().emote).not.toBe("resolute");
  act(() => request.onTextDelta("Late transport data", 0));
  await tick(16);
  const second = bubble.querySelector("p").textContent;
  expect(second.length).toBeGreaterThan(first.length);
  expect(second.length).toBeLessThan(answer.length);
  expect(second).not.toContain("Late transport data");
  await tick(1200);
  expect(bubble.querySelector("p").textContent).toBe(answer);
  expect(bubble).toHaveAttribute("data-stream-status", "complete");
  expect(state()).toMatchObject({ pending: false, emote: "resolute", researchDisplayPhase: "complete" });
});

test.each(["stop", "reset", "message", "deactivate", "unmount"])("%s cancels a validated but still-revealing research reply", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  send();
  await tick(0);
  const previous = latest();
  const answer = "A queued response must remain owned by its request. ".repeat(25).trim();
  act(() => {
    previous.request.onAction("deep-research");
    previous.request.onReaction({ phase: "response", emote: "resolute" });
  });
  await act(async () => previous.finish(envelope(answer)));
  await tick(3482);
  const visible = window.__orbMessages().find((message) => message.role === "assistant");
  expect(visible.content.length).toBeGreaterThan(0);
  expect(visible.content.length).toBeLessThan(answer.length);
  expect(state().pending).toBe(true);
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "message") send("A fresh request");
  else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  expect(previous.request.signal.aborted).toBe(true);
  act(() => {
    previous.request.onTextDelta("This late text must be ignored", 0);
    previous.request.onReaction({ phase: "response", emote: "resolute" });
    expect(previous.request.onAction("deep-research")).toBe(false);
  });
  await tick(2000);
  if (operation === "unmount") expect(jest.getTimerCount()).toBe(0);
  else {
    const interrupted = window.__orbMessages().find((message) => message.id === visible.id);
    expect(interrupted).toMatchObject({ content: visible.content, status: "interrupted" });
    expect(state().emote).not.toBe("resolute");
    expect(state().sceneAction).toBe("none");
  }
});

test.each([
  ["think", 0],
  ["diving", 400],
  ["surfacing", 1600],
  ["revealing", 3482],
])("hiding during research %s keeps its completed answer available after returning", async (phase, elapsed) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  const answer = "The completed answer remains owned by this request. ".repeat(25).trim();
  act(() => request.onAction("deep-research"));
  await act(async () => finish(envelope(answer)));
  await tick(elapsed);
  expect(state().pending).toBe(true);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(request.signal.aborted).toBe(false);
  expect(state().sceneAction).toBe("none");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  // Do not run animation frames while hidden, as a suspended tab may not paint.
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(2000);
  expect(request.signal.aborted).toBe(false);
  expect(state()).toMatchObject({ pending: false, sceneAction: "none", researchDisplayPhase: "complete" });
  const replies = screen.getAllByRole("article", { name: "Metabloom message" });
  expect(replies).toHaveLength(1);
  expect(replies[0]).toHaveTextContent(answer);
  expect(replies[0]).toHaveAttribute("data-stream-status", "complete");
});

test.each(["late action", "completed adapter response"])("returning to a waiting request does not restart a skipped scene from its %s", async (mode) => {
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Deep Research" }));
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(1000);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    if (mode === "late action") expect(request.onAction("deep-research")).toBe(true);
  });
  await act(async () => finish(envelope("The requested answer is ready.")));
  await tick(4000);
  expect(request.signal.aborted).toBe(false);
  expect(state()).toMatchObject({ pending: false, sceneAction: "none", scenePhase: null });
  expect(screen.getByText("The requested answer is ready.")).toBeInTheDocument();
  expect(mockAvatarHistory.every(({ theme, hood }) => theme === "metabloom" && hood === null)).toBe(true);
});

test("research final validation still rejects an inconsistent hidden prefix before any text appears", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onAction("deep-research");
    request.onTextDelta("The validated prefix", 0);
  });
  await act(async () => finish(envelope("A different completed response")));
  expect(state()).toMatchObject({ pending: false, sceneAction: "none" });
  expect(screen.getByRole("alert")).toHaveTextContent("interrupted");
  await tick(10000);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
});

test.each(["complete envelope", "legacy action response"])("an explicit research selection gates an adapter's %s without an action callback", async (format) => {
  render(<OrbSection />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Deep Research" }));
  send();
  await tick(0);
  const answer = format === "legacy action response" ? "Older adapter content still uses its validated size limit. ".repeat(50).trim() : "A complete adapter response must wait for the scene.";
  const payload = format === "legacy action response"
    ? { response: answer, actionChain: [{ action: "curious", duration: 400, intensity: 0.3 }] }
    : envelope(answer);
  await act(async () => latest().finish(payload));
  expect(state()).toMatchObject({ sceneAction: "deep-research", scenePhase: "think", pending: true });
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(3450);
  expect(state().sceneAction).toBe("none");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(32);
  const bubble = screen.getByRole("article", { name: "Metabloom message" });
  expect(bubble.querySelector("p").textContent.length).toBeLessThan(answer.length);
  await tick(2500);
  expect(bubble.querySelector("p").textContent).toBe(answer);
  expect(bubble).toHaveAttribute("data-stream-status", "complete");
  expect(state().pending).toBe(false);
});

test("a provider completion near its deadline is allowed to finish its bounded display queue", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => request.onAction("deep-research"));
  await tick(29500);
  await act(async () => finish(envelope("The provider completed before its existing deadline.")));
  expect(state()).toMatchObject({ pending: true, scenePhase: "deep-research-surfacing" });
  await tick(1850);
  expect(state().sceneAction).toBe("none");
  await tick(300);
  expect(state().pending).toBe(false);
  expect(request.signal.aborted).toBe(false);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an overlapping legacy activity cannot start another return when the research display releases", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = latest();
  act(() => {
    request.onActivity({ activity: "deep-research", state: "running" });
    request.onAction("deep-research");
    request.onTextDelta("This prefix follows the complete return.", 0);
  });
  await tick(3482);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toBeInTheDocument();
  expect(state()).toMatchObject({ activity: "idle", sceneAction: "none", researchPhase: null, theme: "metabloom" });
  expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
});

test.each(["renderer confirmation", "bounded fallback"])("research waits for its final painted return using %s", async (mode) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = latest();
  act(() => request.onAction("deep-research"));
  await tick(1600);
  act(() => request.onTextDelta("The returned orb comes first.", 0));
  await tick(650);
  act(() => mockAvatar.onFieldStateChange("crossfading"));
  await tick(1200);
  expect(state().scenePhase).toBe("deep-research-surfacing");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  if (mode === "renderer confirmation") act(() => mockAvatar.onFieldStateChange("drifting"));
  else {
    await tick(1199);
    expect(state().scenePhase).toBe("deep-research-surfacing");
    await tick(1);
  }
  expect(state().sceneAction).toBe("none");
  await tick(16);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(16);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toBeInTheDocument();
});

test("reduced-motion research keeps its 650 ms surfacing cue before progressive text", async () => {
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} });
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onAction("deep-research");
    request.onTextDelta("A motion-safe answer still begins after surfacing.", 0);
  });
  expect(state().scenePhase).toBe("deep-research-surfacing");
  await tick(649);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(1);
  expect(state().sceneAction).toBe("none");
  await tick(16);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(16);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toHaveAttribute("data-stream-status", "streaming");
  await act(async () => finish(envelope("A motion-safe answer still begins after surfacing.")));
  await tick(100);
  expect(state()).toMatchObject({ pending: false, researchDisplayPhase: "complete" });
});

test("hiding a caught-up research stream keeps ordinary background streaming behavior", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = latest();
  act(() => {
    request.onAction("deep-research");
    request.onTextDelta("A live answer", 0);
  });
  await tick(3550);
  expect(state().researchDisplayPhase).toBe("live");
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    request.onTextDelta(" continues.", 0);
  });
  await act(async () => finish(envelope("A live answer continues.")));
  expect(request.signal.aborted).toBe(false);
  expect(state()).toMatchObject({ pending: false, sceneAction: "none" });
  expect(screen.getByText("A live answer continues.")).toBeInTheDocument();
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
  await tick(1900);
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

test("reduced-motion under the hood keeps its static held scene and readable completion", async () => {
  const action = "under-the-hood";
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
