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
  window.__metabloomRequest = (request) => new Promise((finish, reject) => requests.push({ request, finish, reject }));
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
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

test.each(["stop", "replacement"])("%s discards held citations and rejects late research metadata", async (operation) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const previous = requests[0];
  act(() => {
    previous.request.onAction("deep-research");
    previous.request.onResearch({ state: "searching" });
    previous.request.onResearchProgress({ summary: "Checked the published research brief." });
    previous.request.onSources(sources);
    previous.request.onResearch({ state: "synthesizing" });
    previous.request.onTextDelta(answer, 0);
  });
  if (operation === "replacement") send("A different question");
  else fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(previous.request.signal.aborted).toBe(true);
  act(() => {
    expect(previous.request.onResearch({ state: "searching" })).toBe(false);
    expect(previous.request.onSources(sources)).toBe(false);
    expect(previous.request.onResearchProgress({ summary: "Late research update." })).toBe(false);
    previous.request.onTextDelta("Late answer", 0);
  });
  await act(async () => previous.finish(envelope));
  await tick(5000);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(window.__orbState().researchProgress).toBeNull();
  expect(window.__orbState().researchSummary).toBeNull();
});

test("observed progress stays with a backgrounded request and clears when its answer completes", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  act(() => {
    expect(request.onResearchProgress({ summary: "Too early." })).toBe(false);
    request.onAction("deep-research");
    expect(request.onResearchProgress({ summary: "Still too early." })).toBe(false);
    request.onResearch({ state: "searching" });
  });
  await tick(1600);
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Searching sources");
  const searchSummary = "Searched for the published evidence and checked example.org.";
  act(() => expect(request.onResearchProgress({ summary: searchSummary })).toBe(true));
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent(searchSummary);
  expect(screen.getByRole("status", { name: "Research progress" })).not.toHaveTextContent("Searching sources");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(5000);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(request.signal.aborted).toBe(false);
  expect(window.__orbState()).toMatchObject({ pending: true, sceneAction: "deep-research", scenePhase: "deep-research-diving", researchPhase: "diving", theme: "tidal-weave" });
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Diving deep...");
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent(searchSummary);
  expect(requests).toHaveLength(1);
  act(() => {
    request.onSources(sources);
    request.onResearch({ state: "synthesizing" });
  });
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Writing a sourced answer");
  expect(screen.getByRole("status", { name: "Research progress" })).not.toHaveTextContent(searchSummary);
  act(() => expect(request.onResearchProgress({ summary: "Writing an answer from 1 cited source." })).toBe(true));
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent("Writing an answer from 1 cited source.");
  act(() => {
    request.onTextDelta(answer, 0);
    expect(request.onResearchProgress({ summary: "Cannot change status after the answer starts." })).toBe(false);
  });
  await act(async () => finish(envelope));
  expect(window.__orbState().scenePhase).toBe("deep-research-surfacing");
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(2050);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toHaveTextContent(answer);
  expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
  expect(window.__orbState()).toMatchObject({ pending: false, researchProgress: null, researchSummary: null });
});

test("adapter progress accepts only bounded plain summaries and limits updates", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
    [null, {}, { summary: 1 }, { summary: "" }, { summary: " padded " }, { summary: "a\nb" },
      { summary: "x".repeat(201) }, { summary: "A valid sentence.", url: "https://example.org" }]
      .forEach((progress) => expect(request.onResearchProgress(progress)).toBe(false));
  });
  expect(window.__orbState().researchSummary).toBeNull();
  const literalSummary = "Checked <img src=x onerror=alert(1)> as plain text.";
  act(() => expect(request.onResearchProgress({ summary: literalSummary })).toBe(true));
  expect(screen.getByRole("status", { name: "Research progress" })).toHaveTextContent(literalSummary);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  act(() => {
    for (let index = 2; index <= 24; index += 1) {
      expect(request.onResearchProgress({ summary: `Checked source ${index}.` })).toBe(true);
    }
    expect(request.onResearchProgress({ summary: "An extra update." })).toBe(false);
  });
  expect(window.__orbState().researchSummary).toBe("Checked source 24.");
});

test("a research failure shows its safe reason and reference without exposing provider diagnostics", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, reject } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
    request.onResearchProgress({ summary: "Checked the research brief." });
  });
  const error = Object.assign(new Error("Private provider diagnostics: https://private.example/prompt"), {
    code: "research_token_limit", requestRef: "a1b2c3d4e5f6", status: 200,
  });
  await act(async () => reject(error));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("The research reached its output limit before finishing. Try a narrower question.");
  expect(alert).toHaveTextContent("Code: research_token_limit. Reference: a1b2c3d4e5f6.");
  expect(alert).not.toHaveTextContent(/private|local demo|visible reply is incomplete/i);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "Research progress" })).not.toBeInTheDocument();
  expect(window.__orbState()).toMatchObject({ pending: false, researchProgress: null, researchSummary: null });
  expect(errorLog).toHaveBeenCalledTimes(1);
  expect(errorLog).toHaveBeenCalledWith("[Metabloom] Request failed", { code: "research_token_limit", requestRef: "a1b2c3d4e5f6", status: 200 });
  act(() => expect(request.onResearchProgress({ summary: "A stale update." })).toBe(false));
  expect(errorLog).toHaveBeenCalledTimes(1);
});

test("a specific failure after visible text preserves its incomplete prefix", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, reject } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
    request.onSources(sources);
    request.onResearch({ state: "synthesizing" });
    request.onTextDelta(answer, 0);
  });
  await tick(4000);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  expect(reply).toHaveAttribute("data-stream-status", "streaming");
  await act(async () => reject(Object.assign(new Error("Private answer diagnostics."), {
    code: "answer_incomplete", requestRef: "a1b2c3d4e5f6", status: 200,
  })));
  expect(reply).toHaveTextContent(answer);
  expect(reply).toHaveAttribute("data-stream-status", "error");
  expect(reply).toHaveTextContent("Response incomplete");
  expect(screen.getByRole("alert")).toHaveTextContent("The model did not finish the answer. Please try again. Any visible reply is incomplete.");
  expect(screen.getByRole("alert")).not.toHaveTextContent(/private|local demo/i);
  expect(within(reply).queryByRole("group", { name: "Sources for this answer" })).not.toBeInTheDocument();
  expect(errorLog).toHaveBeenCalledTimes(1);
});

test("unrecognized adapter error fields are omitted from the user message and console", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { reject } = requests[0];
  await act(async () => reject(Object.assign(new Error("Private provider response."), {
    code: "https://private.example/prompt", requestRef: "not-a-reference", status: "private status",
  })));
  expect(screen.getByRole("alert")).toHaveTextContent("The response stream was interrupted. Please try again. Code: stream_interrupted.");
  expect(screen.getByRole("alert")).not.toHaveTextContent(/private|reference/i);
  expect(errorLog).toHaveBeenCalledWith("[Metabloom] Request failed", { code: "stream_interrupted", requestRef: null, status: null });
});

test("research metadata and an answer arriving in a hidden tab retain their sources when the tab returns", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
  });
  await tick(1600);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request.onSources(sources)).toBe(true);
    expect(request.onResearch({ state: "synthesizing" })).toBe(true);
  });
  expect(request.signal.aborted).toBe(false);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  act(() => {
    request.onTextDelta(answer, 0);
    request.onSegment({ response: answer }, 0);
  });
  await act(async () => finish(envelope));
  expect(request.signal.aborted).toBe(false);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(200);
  const replies = screen.getAllByRole("article", { name: "Metabloom message" });
  expect(replies).toHaveLength(1);
  expect(replies[0]).toHaveTextContent(answer);
  expect(replies[0]).toHaveAttribute("data-stream-status", "complete");
  expect(within(replies[0]).getByRole("link", { name: "Source 1: Public research brief" })).toHaveAttribute("href", sources[0].url);
  expect(within(replies[0]).getByRole("group", { name: "Sources for this answer" })).toBeInTheDocument();
  expect(window.__orbState()).toMatchObject({ pending: false, sceneAction: "none", researchProgress: null });
});

test.each(["stop", "reset", "replacement", "deactivate", "unmount"])("%s still cancels research while its tab is hidden", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(request.signal.aborted).toBe(false);
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "replacement") send("A different ordinary question");
  else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  expect(request.signal.aborted).toBe(true);
  act(() => {
    expect(request.onSources(sources)).toBe(false);
    expect(request.onResearch({ state: "synthesizing" })).toBe(false);
    request.onTextDelta(answer, 0);
  });
  await act(async () => finish(envelope));
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(5000);
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  if (operation !== "unmount") {
    expect(window.__orbState()).toMatchObject({ sceneAction: "none", scenePhase: null, theme: "metabloom", pending: operation === "replacement" });
    expect(requests).toHaveLength(operation === "replacement" ? 2 : 1);
  }
});

test("the reply watchdog grants confirmed research one absolute deadline", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
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
    expect(request.onResearchProgress({ summary: "Checked another source near the deadline." })).toBe(true);
    expect(request.onSources(sources)).toBe(true);
    expect(request.onResearch({ state: "synthesizing" })).toBe(true);
    expect(request.onResearchProgress({ summary: "Writing an answer from 1 cited source." })).toBe(true);
  });
  await tick(999);
  expect(request.signal.aborted).toBe(false);
  await tick(1);
  expect(request.signal.aborted).toBe(true);
  expect(window.__orbState()).toMatchObject({ pending: false, researchProgress: null });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Code: research_timeout.");
  expect(errorLog).toHaveBeenCalledTimes(1);
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
