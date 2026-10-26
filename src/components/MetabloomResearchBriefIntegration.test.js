import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppNavigationContext } from "../contexts/AppNavigationContext";
import OrbSection from "./OrbSection";

jest.mock("./MetabloomAvatar", () => () => null);
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const answer = "The research supports three of the five requested stories. The brief and full report are below.";
const envelope = { version: "2.0.0", segments: [{ response: answer }] };
const reportFor = () => ({
  notes: "The fictional coastal program was announced on 2026-10-23 [1].\n\nThe council published its assessment on 2026-10-23 [5].\n\nThe harbour trial was announced on 2026-10-23 [9].\n\nEnd of the retained research report.",
  sources: Array.from({ length: 9 }, (_, index) => ({ id: index + 1,
    title: `Fictional research source ${index + 1}`, url: `https://example.org/research-${index + 1}` })),
});
const briefFor = () => ({
  version: "metabloom-research-brief-v1", kind: "news", title: "Fictional coastal news",
  scope: "New public-service developments today", asOf: "2026-10-23T15:00:00.000Z", timeZone: "UTC",
  localDate: "2026-10-23", windowStart: "2026-10-23", windowEnd: "2026-10-23",
  coverage: { requestedCount: 5, returnedCount: 3, status: "partial",
    limitations: ["Only three developments have dated evidence in the requested interval."] },
  items: [1, 5, 9].map((id) => ({
    headline: `Fictional coastal development ${id}`, summary: `The agency announced a local public-service trial described in source ${id}.`,
    sourceIds: [id], background: [{ text: `The source describes the context for trial ${id}.`, sourceIds: [id] }],
    whyItMatters: "The trial may change how the service is delivered locally.",
    uncertainty: ["The effect of the trial is not yet established."], watchNext: ["Watch for the published evaluation."],
    developmentDate: "2026-10-23", scheduledDate: null,
    dateEvidence: { sourceId: id, quote: "The trial was announced on 2026-10-23." }, evidenceStatus: "announced",
  })),
  sourceDetails: [1, 5, 9].map((sourceId) => ({ sourceId, publisher: "", publishedDate: null,
    dateEvidence: "", sourceType: "unknown" })),
});
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Give me a deep dive into the top 5 coastal news stories today") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
const beginResearch = (request, report = reportFor()) => act(() => {
  request.onAction("deep-research");
  expect(request.onResearch({ state: "searching" })).toBe(true);
  expect(request.onResearchDetails(report)).toBe(true);
  expect(request.onSources(report.sources.slice(0, 8))).toBe(true);
  expect(request.onResearch({ state: "synthesizing" })).toBe(true);
});
const attachBrief = (request, brief = briefFor()) => act(() => expect(request.onResearchBrief(brief)).toBe(true));
const openResearch = async () => {
  const summary = screen.getByText("Full research", { selector: "summary" });
  fireEvent.click(summary);
  fireEvent(summary.parentElement, new Event("toggle"));
  await tick(0);
  return screen.getByRole("group", { name: "Completed research" });
};
let requests;
let hiddenDescriptor;
let matchMedia;

beforeEach(() => {
  jest.useFakeTimers(); requests = [];
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} });
  window.__metabloomRequest = (request) => new Promise((finish, reject) => requests.push({ request, finish, reject }));
});
afterEach(() => {
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
  window.__metabloomRequest = null; window.matchMedia = matchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor); else delete document.hidden;
});

test("all brief content and source links wait for surfacing and use the full canonical source list", async () => {
  render(<OrbSection />); send(); await tick(0);
  const { request, finish } = requests[0];
  const report = reportFor(), brief = briefFor(), expected = briefFor();
  beginResearch(request, report); attachBrief(request, brief);
  expect(screen.queryByRole("region", { name: brief.title })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Source 9: Fictional research source 9" })).not.toBeInTheDocument();
  act(() => expect(request.onResearchBrief(brief)).toBe(false));
  brief.items[2].headline = "An outside mutation must not replace the brief.";
  brief.items[2].sourceIds = [1];
  report.sources[8].url = "https://changed.example/";
  await act(async () => finish(envelope));
  expect(window.__orbState().researchPhase).toBe("surfacing");
  await tick(649);
  expect(screen.queryByRole("region", { name: expected.title })).not.toBeInTheDocument();
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  await tick(251);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  expect(reply).toHaveAttribute("data-stream-status", "complete");
  const region = within(reply).getByRole("region", { name: expected.title });
  expect(region).toHaveAttribute("data-coverage-status", "partial");
  expect(region).toHaveTextContent("3 of 5 stories");
  expect(region).toHaveTextContent("Partial coverage");
  expect(within(region).getAllByRole("heading", { level: 4 })).toHaveLength(1);
  expect(within(region).getByRole("combobox", { name: "Choose a story" })).toHaveDisplayValue("Story 1 of 3");
  expect(within(region).getByText(expected.coverage.limitations[0])).not.toBeVisible();
  fireEvent.change(within(region).getByRole("combobox", { name: "Choose a story" }), { target: { value: "2" } });
  expect(within(region).getByRole("heading", { level: 4 })).toHaveTextContent(expected.items[2].headline);
  const citations = within(region).getAllByRole("link", { name: "Source 9: Fictional research source 9" });
  for (const citation of citations) {
    expect(citation).toHaveAttribute("href", "https://example.org/research-9");
    expect(citation).toHaveAttribute("target", "_blank"); expect(citation).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(screen.queryByText(/An outside mutation/)).not.toBeInTheDocument();
  expect(screen.getByText("Full research", { selector: "summary" }).parentElement).not.toHaveAttribute("open");
  const snapshot = window.__orbMessages().find((message) => message.role === "assistant");
  expect(snapshot.researchBrief).toEqual(expected);
  snapshot.researchBrief.items[0].headline = "Changed returned snapshot";
  snapshot.researchBrief.items[0].sourceIds[0] = 9;
  expect(window.__orbMessages().find((message) => message.role === "assistant").researchBrief).toEqual(expected);
  expect(requests).toHaveLength(1);
  send("Tell me more about the trials"); await tick(0);
  const history = requests[1].request.history.find((message) => message.role === "assistant").content;
  expect(history.startsWith(answer)).toBe(true);
  expect(history).toContain("Stories in the research brief:");
  expected.items.forEach((item, index) => expect(history).toContain(`${index + 1}. ${item.headline}`));
  expect(history).not.toContain(reportFor().notes);
  expect(history).not.toContain(expected.items[0].summary);
  expect(history).not.toContain('"media"');
});

test("brief metadata must follow completed evidence and rejected formatting leaves the full report available", async () => {
  render(<OrbSection />); send(); await tick(0);
  const { request, finish } = requests[0];
  const brief = briefFor();
  act(() => expect(request.onResearchBrief(brief)).toBe(false));
  beginResearch(request);
  const invalid = briefFor(); invalid.items[0].sourceIds = [999];
  act(() => expect(request.onResearchBrief(invalid)).toBe(false));
  await act(async () => finish(envelope)); await tick(1000);
  expect(screen.queryByRole("region", { name: brief.title })).not.toBeInTheDocument();
  const report = await openResearch();
  for (const paragraph of reportFor().notes.split("\n\n")) expect(report).toHaveTextContent(paragraph);
  const snapshot = window.__orbMessages().find((message) => message.role === "assistant");
  expect(snapshot.researchDetails).toEqual(reportFor());
  expect(snapshot).not.toHaveProperty("researchBrief");
  expect(requests).toHaveLength(1);
});

test.each(['news', 'research'])("an empty %s brief opens the retained report after surfacing and keeps notes collapsed", async (kind) => {
  const view = render(<OrbSection />); send(); await tick(0);
  const { request, finish } = requests[0];
  const empty = { ...briefFor(), kind, title: 'Brief could not be prepared', items: [], sourceDetails: [],
    coverage: { requestedCount: 5, returnedCount: 0, status: 'unavailable',
      limitations: ['The structured summary could not establish the requested coverage.'] } };
  beginResearch(request); attachBrief(request, empty);
  expect(screen.queryByText('Full research')).not.toBeInTheDocument();
  await act(async () => finish({ version: '2.0.0', segments: [{ response: 'The research report is shown below.' }] }));
  await tick(649);
  expect(screen.queryByRole('group', { name: 'Completed research' })).not.toBeInTheDocument();
  await tick(251);
  const report = screen.getByRole('group', { name: 'Completed research' });
  for (const paragraph of reportFor().notes.split('\n\n')) expect(report).toHaveTextContent(paragraph);
  expect(within(report).getByRole('link', { name: 'Source 9: Fictional research source 9' }))
    .toHaveAttribute('href', 'https://example.org/research-9');
  const summary = screen.getByText('Full research', { selector: 'summary' });
  expect(summary.parentElement).toHaveAttribute('open');
  expect(summary.parentElement).toHaveAttribute('data-research-fallback', 'true');
  expect(screen.getByText('Briefing notes', { selector: 'summary' }).parentElement).not.toHaveAttribute('open');
  expect(screen.getByText(empty.coverage.limitations[0])).not.toBeVisible();
  expect(screen.queryByText(/0 of 5|Coverage unavailable/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: empty.title })).not.toBeInTheDocument();
  expect(window.__orbMessages().find(message => message.role === 'assistant').researchBrief).toEqual(empty);

  fireEvent.click(summary); fireEvent(summary.parentElement, new Event('toggle')); await tick(0);
  expect(summary.parentElement).not.toHaveAttribute('open');
  view.rerender(<OrbSection />); fireEvent(window, new Event('resize')); await tick(1000);
  expect(summary.parentElement).not.toHaveAttribute('open');
  expect(screen.queryByRole('group', { name: 'Completed research' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});

test.each(["stop", "reset", "replacement", "deactivate", "unmount"])("%s discards a held brief and rejects stale brief callbacks", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />); send(); await tick(0);
  const { request, finish } = requests[0];
  beginResearch(request); attachBrief(request);
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "replacement") send("A new research request");
  else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  expect(request.signal.aborted).toBe(true);
  act(() => expect(request.onResearchBrief(briefFor())).toBe(false));
  await act(async () => finish(envelope)); await tick(1000);
  expect(screen.queryByRole("region", { name: briefFor().title })).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
});

test("a hidden tab completes the same brief without aborting research or replaying the scene", async () => {
  render(<OrbSection />); send(); await tick(0);
  const { request, finish } = requests[0];
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  beginResearch(request); attachBrief(request);
  await act(async () => finish(envelope));
  expect(request.signal.aborted).toBe(false);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(250);
  expect(window.__orbState()).toMatchObject({ pending: false, sceneAction: "none" });
  expect(screen.getByRole("region", { name: briefFor().title })).toHaveTextContent("3 of 5 stories");
  expect(window.__orbMessages().find((message) => message.role === "assistant").researchBrief).toEqual(briefFor());
  expect(requests).toHaveLength(1);
});

test("restored brief metadata is independently validated and cloned with its report", () => {
  const report = reportFor(), brief = briefFor();
  const saved = { messages: [{ id: "assistant-1", role: "assistant", content: answer, status: "complete", source: "model",
    segments: [{ response: answer }], researchDetails: report, researchBrief: brief }] };
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByRole("region", { name: brief.title })).toHaveTextContent(brief.items[2].headline);
  expect(window.__orbMessages()[0].researchBrief).toEqual(brief);
  brief.items[2].sourceIds = [1];
  expect(window.__orbMessages()[0].researchBrief.items[2].sourceIds).toEqual([9]);
  const snapshot = window.__orbMessages(); snapshot[0].researchBrief.coverage.limitations.length = 0;
  expect(window.__orbMessages()[0].researchBrief.coverage.limitations).toHaveLength(1);
});

test.each(["missing report", "unknown source", "outside interval", "coverage mismatch"])("%s cannot restore a brief beside an otherwise valid answer", (invalidity) => {
  const researchBrief = briefFor(), researchDetails = reportFor();
  if (invalidity === "unknown source") researchBrief.items[0].sourceIds = [999];
  if (invalidity === "outside interval") researchBrief.items[0].developmentDate = "2026-10-22";
  if (invalidity === "coverage mismatch") researchBrief.coverage.returnedCount = 5;
  const message = { id: "assistant-1", role: "assistant", content: answer, status: "complete", researchBrief,
    ...(invalidity !== "missing report" ? { researchDetails } : {}) };
  render(<AppNavigationContext.Provider value={{ getToolState: () => ({ messages: [message] }) }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByText(answer)).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: researchBrief.title })).not.toBeInTheDocument();
  expect(window.__orbMessages()[0]).not.toHaveProperty("researchBrief");
  expect(requests).toHaveLength(0);
});
