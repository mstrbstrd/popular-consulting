import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppNavigationContext } from "../contexts/AppNavigationContext";
import OrbSection from "./OrbSection";

jest.mock("./MetabloomAvatar", () => () => null);
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const sources = [{ id: 1, title: "Public research brief", url: "https://example.org/brief" }];
const answer = "The published evidence supports this finding [1]. An unknown marker stays text [8].";
const envelope = { version: "2.0.0", segments: [{ response: answer }] };
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Investigate the published evidence") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
let requests;
let hiddenDescriptor;

beforeEach(() => {
  jest.useFakeTimers();
  requests = [];
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  window.__metabloomRequest = (request) => new Promise((finish) => requests.push({ request, finish }));
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  window.__metabloomRequest = null;
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
  else delete document.hidden;
});

test("confirmed research stays submerged through source gathering and reveals citations with its owned reply", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  act(() => {
    request.onReaction({ phase: "input", emote: "curious" });
    expect(request.onAction("deep-research")).toBe(true);
    expect(request.onResearch({ state: "searching" })).toBe(true);
  });
  await tick(1600);
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Searching sources");
  const provided = sources.map((source) => ({ ...source }));
  act(() => {
    expect(request.onSources(provided)).toBe(true);
    expect(request.onResearch({ state: "synthesizing" })).toBe(true);
  });
  // eslint-disable-next-line no-script-url -- Deliberately hostile source data must never become a link.
  provided[0].url = "javascript:alert(1)";
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Writing a sourced answer");
  expect(window.__orbState().scenePhase).toBe("deep-research-diving");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await tick(31000);
  expect(window.__orbState().pending).toBe(true);
  expect(request.signal.aborted).toBe(false);
  act(() => {
    request.onTextDelta(answer, 0);
    request.onSegment({ response: answer }, 0);
    request.onReaction({ phase: "response", emote: "resolute" });
  });
  await act(async () => finish(envelope));
  expect(window.__orbState().scenePhase).toBe("deep-research-surfacing");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await tick(1850);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(32);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  expect(reply).toHaveAttribute("data-stream-status", "streaming");
  expect(within(reply).queryByRole("group", { name: "Sources for this answer" })).not.toBeInTheDocument();
  await tick(100);
  expect(reply).toHaveAttribute("data-stream-status", "complete");
  expect(reply).toHaveTextContent(answer);
  const citation = within(reply).getByRole("link", { name: "Source 1: Public research brief" });
  expect(citation).toHaveAttribute("href", sources[0].url);
  expect(citation).toHaveAttribute("target", "_blank");
  expect(citation).toHaveAttribute("rel", "noopener noreferrer");
  expect(within(reply).getByRole("link", { name: "Public research brief" })).toHaveAttribute("href", sources[0].url);
  expect(within(reply).getAllByRole("link")).toHaveLength(2);
  expect(window.__orbState()).toMatchObject({ pending: false, emote: "resolute", researchProgress: null });
  const snapshot = window.__orbMessages();
  snapshot.find((message) => message.role === "assistant").sources[0].url = "https://changed.example/";
  expect(window.__orbMessages().find((message) => message.role === "assistant").sources).toEqual(sources);
});

test.each(["stop", "replacement", "hidden"])("%s discards held citations and rejects late research metadata", async (operation) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const previous = requests[0];
  act(() => {
    previous.request.onAction("deep-research");
    previous.request.onResearch({ state: "searching" });
    previous.request.onSources(sources);
    previous.request.onResearch({ state: "synthesizing" });
    previous.request.onTextDelta(answer, 0);
  });
  if (operation === "replacement") send("A different question");
  else if (operation === "hidden") act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  else fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(previous.request.signal.aborted).toBe(true);
  act(() => {
    expect(previous.request.onResearch({ state: "searching" })).toBe(false);
    expect(previous.request.onSources(sources)).toBe(false);
    previous.request.onTextDelta("Late answer", 0);
  });
  await act(async () => previous.finish(envelope));
  await tick(5000);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(window.__orbState().researchProgress).toBeNull();
});

test("the reply watchdog grants confirmed research one absolute deadline", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = requests[0];
  act(() => request.onAction("deep-research"));
  await tick(29000);
  act(() => expect(request.onResearch({ state: "searching" })).toBe(true));
  await tick(180000);
  expect(window.__orbState().pending).toBe(true);
  act(() => {
    expect(request.onResearch({ state: "searching" })).toBe(false);
    expect(request.onSources(sources)).toBe(true);
    expect(request.onResearch({ state: "synthesizing" })).toBe(true);
  });
  await tick(999);
  expect(request.signal.aborted).toBe(false);
  await tick(1);
  expect(request.signal.aborted).toBe(true);
  expect(window.__orbState()).toMatchObject({ pending: false, researchProgress: null });
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

test.each([
  // eslint-disable-next-line no-script-url -- Restored state must pass the same URL validation as a live reply.
  ["unsafe URL", [{ ...sources[0], url: "javascript:alert(1)" }]],
  ["malformed object", { ...sources[0] }],
  ["malformed string", sources[0].url],
])("restored %s sources cannot create links or crash conversation snapshots", (kind, invalidSources) => {
  const saved = { messages: [{ id: "assistant-1", role: "assistant", content: "A claim [1].", segments: [{ response: "A claim [1]." }],
    status: "complete", source: "model", sources: invalidSources }] };
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByText("A claim [1].")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Sources for this answer" })).not.toBeInTheDocument();
  expect(window.__orbMessages()[0]).not.toHaveProperty("sources");
});
