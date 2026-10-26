import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppNavigationContext } from "../contexts/AppNavigationContext";
import OrbSection from "./OrbSection";

jest.mock("./MetabloomAvatar", () => () => null);
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const answer = "The published evidence supports this concise answer [1].";
const envelope = { version: "2.0.0", segments: [{ response: answer }] };
const reportFor = (count = 9) => ({
  notes: `Opening evidence [1].\n\n${"The completed report retains its detailed findings and qualifications. ".repeat(300)}\nFinal evidence [${count}]. An unknown marker [999999] stays plain text. <img src=x onerror=alert(1)>`,
  sources: Array.from({ length: count }, (_, index) => ({
    id: index + 1, title: `Research source ${index + 1}`, url: `https://example.org/evidence-${index + 1}`,
  })),
});
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Investigate the published report") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
};
const beginResearch = (request, report) => act(() => {
  request.onAction("deep-research");
  request.onResearch({ state: "searching" });
  if (report) expect(request.onResearchDetails(report)).toBe(true);
});
const beginWriter = (request, report) => act(() => {
  expect(request.onSources([report.sources[0]])).toBe(true);
  expect(request.onResearch({ state: "synthesizing" })).toBe(true);
});
const openResearch = async () => {
  const summary = screen.getByText("Full research", { selector: "summary" });
  if (!summary.parentElement.open) {
    fireEvent.click(summary);
    // jsdom schedules native toggle delivery outside Jest's fake timer clock.
    fireEvent(summary.parentElement, new Event("toggle"));
  }
  await tick(0);
  return screen.getByRole("group", { name: "Completed research" });
};
const expectRetainedReport = (research, report) => {
  // The full report now renders semantic blocks. Keep its exact source text in
  // the saved message while checking every displayed paragraph, including the end.
  const text = research.querySelector(".metabloom-chat__research-report-text");
  for (const paragraph of report.notes.split(/\n[ \t]*\n/)) expect(text).toHaveTextContent(paragraph.replace(/\s+/g, " ").trim());
  const saved = window.__orbMessages().find((message) => message.role === "assistant"
    && message.researchDetails?.notes === report.notes);
  expect(saved?.researchDetails).toEqual(report);
};
let requests;
let hiddenDescriptor;
let matchMedia;

beforeEach(() => {
  jest.useFakeTimers();
  requests = [];
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} });
  window.__metabloomRequest = (request) => new Promise((finish, reject) => requests.push({ request, finish, reject }));
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.__metabloomRequest = null;
  window.matchMedia = matchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
  else delete document.hidden;
});

test.each([9, 65])("a completed report above 16000 characters with %s sources is retained behind a collapsed disclosure", async (sourceCount) => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  const report = reportFor(sourceCount);
  const original = reportFor(sourceCount);
  expect(original.notes.length).toBeGreaterThan(16000);
  beginResearch(request, report);
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  act(() => expect(request.onResearchDetails(report)).toBe(false));
  report.notes = "An outside mutation must not replace the research.";
  // eslint-disable-next-line no-script-url -- Mutation must not replace a completed report's canonical source.
  report.sources[sourceCount - 1].url = "javascript:alert(1)";
  beginWriter(request, original);
  await act(async () => finish(envelope));
  expect(window.__orbState().researchPhase).toBe("surfacing");
  await tick(649);
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  await tick(101);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  expect(reply).toHaveTextContent(answer);
  expect(reply).toHaveAttribute("data-stream-status", "complete");
  expect(screen.getByText("Full research", { selector: "summary" }).parentElement).not.toHaveAttribute("open");
  expect(screen.queryByRole("group", { name: "Completed research" })).not.toBeInTheDocument();
  const research = await openResearch();
  expectRetainedReport(research, original);
  const citation = within(research).getByRole("link", { name: `Source ${sourceCount}: Research source ${sourceCount}` });
  expect(citation).toHaveAttribute("href", original.sources[sourceCount - 1].url);
  expect(citation).toHaveAttribute("target", "_blank");
  expect(citation).toHaveAttribute("rel", "noopener noreferrer");
  expect(within(research).queryByRole("img")).not.toBeInTheDocument();
  expect(within(research).getAllByRole("link")).toHaveLength(2);
  const sourceSummary = within(research).getByText(`Research sources (${sourceCount})`, { selector: "summary" });
  fireEvent.click(sourceSummary);
  fireEvent(sourceSummary.parentElement, new Event("toggle"));
  await tick(0);
  expect(research.querySelectorAll("ol li a")).toHaveLength(Math.min(sourceCount, 20));
  while (within(research).queryByRole("button", { name: /more sources/ })) {
    fireEvent.click(within(research).getByRole("button", { name: /more sources/ }));
  }
  expect(research.querySelectorAll("ol li a")).toHaveLength(sourceCount);
  const snapshot = window.__orbMessages().find((message) => message.role === "assistant");
  expect(snapshot.researchDetails).toEqual(original);
  snapshot.researchDetails.notes = "Changed snapshot";
  snapshot.researchDetails.sources[0].url = "https://changed.example/";
  expect(window.__orbMessages().find((message) => message.role === "assistant").researchDetails).toEqual(original);
  send("A follow-up about the concise answer");
  await tick(0);
  expect(requests[1].request.history.find((message) => message.role === "assistant").content).toBe(answer);
  expect(JSON.stringify(requests[1].request.history)).not.toContain(original.notes);
  expect(requests).toHaveLength(2);
});

test("writer failure preserves a completed report without manufacturing a short answer or replaying research", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish, reject } = requests[0];
  const report = reportFor(65);
  beginResearch(request, report);
  await act(async () => reject(Object.assign(new Error("Private writer diagnostic"), {
    code: "answer_invalid", requestRef: "a1b2c3d4e5f6", status: 200,
  })));
  expect(window.__orbState()).toMatchObject({ pending: true, researchPhase: "surfacing" });
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
  await tick(650);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  expect(reply).toHaveTextContent("Research completed. The short answer could not be prepared.");
  expect(reply).not.toHaveTextContent(/Response incomplete|Short answer incomplete/);
  expect(reply).toHaveAttribute("data-stream-status", "error");
  expect(window.__orbMessages().find((message) => message.role === "assistant").content).toBe("");
  expect(window.__orbState().pending).toBe(false);
  expect(screen.getByText("Full research", { selector: "summary" }).parentElement).toHaveAttribute("open");
  const research = await openResearch();
  expectRetainedReport(research, report);
  expect(screen.getByRole("alert")).toHaveTextContent("The completed research is retained. Code: answer_invalid. Reference: a1b2c3d4e5f6.");
  expect(errorLog).toHaveBeenCalledWith("[Metabloom] Request failed", { code: "answer_invalid", requestRef: "a1b2c3d4e5f6", status: 200 });
  act(() => {
    expect(request.onResearchDetails(report)).toBe(false);
    request.onTextDelta("A stale answer must not replace the report.", 0);
  });
  await act(async () => finish(envelope));
  expect(screen.getAllByRole("article", { name: "Metabloom message" })).toHaveLength(1);
  expect(requests).toHaveLength(1);
  send("Continue after the writer failure");
  await tick(0);
  expect(requests[1].request.history.some((message) => message.role === "assistant")).toBe(false);
  expect(JSON.stringify(requests[1].request.history)).not.toContain(report.notes);
});

test.each(["held", "visible"])("a writer failure keeps the full report while treating its %s answer prefix separately", async (presentation) => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, reject } = requests[0];
  const report = reportFor();
  beginResearch(request, report);
  beginWriter(request, report);
  const prefix = "An answer prefix whose final response is not yet validated.";
  act(() => request.onTextDelta(prefix, 0));
  if (presentation === "visible") await tick(750);
  await act(async () => reject(Object.assign(new Error("Invalid final writer response"), { code: "answer_invalid" })));
  await tick(750);
  const reply = screen.getByRole("article", { name: "Metabloom message" });
  if (presentation === "held") {
    expect(reply).not.toHaveTextContent(prefix);
    expect(reply).not.toHaveTextContent("Short answer incomplete");
  } else {
    expect(reply).toHaveTextContent(prefix);
    expect(reply).toHaveTextContent("Short answer incomplete");
  }
  expectRetainedReport(await openResearch(), report);
});

test.each(["stop", "reset", "replacement", "deactivate", "unmount"])("%s rejects stale report callbacks and discards a still-held artifact", async (operation) => {
  const { rerender, unmount } = render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish } = requests[0];
  const report = reportFor();
  beginResearch(request, report);
  if (operation === "unmount") unmount();
  else if (operation === "deactivate") rerender(<OrbSection isActive={false} />);
  else if (operation === "replacement") send("A different research request");
  else act(() => operation === "reset" ? window.__orbReset() : window.__orbStop());
  expect(request.signal.aborted).toBe(true);
  act(() => {
    expect(request.onResearchDetails(report)).toBe(false);
    request.onTextDelta("A stale answer", 0);
  });
  await act(async () => finish(envelope));
  await tick(1000);
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Metabloom message" })).not.toBeInTheDocument();
});

test("Stop preserves a completed report that is already safely displayed", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = requests[0];
  const report = reportFor();
  beginResearch(request, report);
  beginWriter(request, report);
  act(() => request.onTextDelta(answer, 0));
  await tick(750);
  expect(screen.getByText("Full research", { selector: "summary" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(request.signal.aborted).toBe(true);
  expect(screen.getByRole("article", { name: "Metabloom message" })).toHaveTextContent("Research completed. The short answer was stopped.");
  expectRetainedReport(await openResearch(), report);
  act(() => expect(request.onResearchDetails(report)).toBe(false));
});

test.each(["answer", "writer failure"])("a report received while hidden remains available after its %s", async (outcome) => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  render(<OrbSection />);
  send();
  await tick(0);
  const { request, finish, reject } = requests[0];
  const report = reportFor();
  beginResearch(request);
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request.onResearchDetails(report)).toBe(true);
  });
  expect(request.signal.aborted).toBe(false);
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  beginWriter(request, report);
  if (outcome === "answer") await act(async () => finish(envelope));
  else await act(async () => reject(Object.assign(new Error("Writer unavailable"), { code: "provider_unavailable" })));
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(200);
  expect(window.__orbState()).toMatchObject({ pending: false, sceneAction: "none" });
  expectRetainedReport(await openResearch(), report);
  if (outcome === "answer") expect(request.signal.aborted).toBe(false);
});

test("only valid completed report metadata is accepted in the research callback", async () => {
  render(<OrbSection />);
  send();
  await tick(0);
  const { request } = requests[0];
  const report = reportFor();
  act(() => expect(request.onResearchDetails(report)).toBe(false));
  beginResearch(request);
  act(() => {
    expect(request.onResearchDetails({ notes: "An unfinished report" })).toBe(false);
    expect(request.onResearchDetails({ ...report, reasoning: "Private reasoning is not a report." })).toBe(false);
    expect(request.onResearchDetails(report)).toBe(true);
  });
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  expect(screen.queryByText(/Private reasoning/)).not.toBeInTheDocument();
});

test("completed research survives conversation restoration and independent message snapshots", async () => {
  const report = reportFor(65);
  const saved = { messages: [{ id: "assistant-1", role: "assistant", content: answer, status: "complete",
    source: "model", segments: [{ response: answer }], researchDetails: report }] };
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  expectRetainedReport(await openResearch(), report);
  expect(window.__orbMessages()[0].researchDetails).toEqual(report);
  window.__orbMessages()[0].researchDetails.sources[0].url = "https://changed.example/";
  expect(window.__orbMessages()[0].researchDetails.sources[0].url).toBe(report.sources[0].url);
});

test("full research displays semantic headings and lists while preserving its exact saved source text", async () => {
  const report = { ...reportFor(), notes: "# Research findings\n\nThe initial finding is supported [1].\n\n- A first supporting detail [1].\n- A second supporting detail [9].\n\n1. Check the published methods.\n2. Compare the final evidence [9].\n\nThe final qualification remains visible." };
  const saved = { messages: [{ id: "assistant-1", role: "assistant", content: answer, status: "complete",
    source: "model", segments: [{ response: answer }], researchDetails: report }] };
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  const research = await openResearch();
  expect(within(research).getByRole("heading", { name: "Research findings", level: 4 })).toBeInTheDocument();
  const lists = within(research).getAllByRole("list");
  expect(lists.map((list) => list.tagName)).toEqual(["UL", "OL"]);
  expect(within(lists[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "A first supporting detail [1].", "A second supporting detail [9].",
  ]);
  expect(within(lists[1]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Check the published methods.", "Compare the final evidence [9].",
  ]);
  expect(research).toHaveTextContent("The final qualification remains visible.");
  expect(within(research).getAllByRole("link")).toHaveLength(4);
  expect(window.__orbMessages()[0].researchDetails).toEqual(report);
});

test.each([
  { notes: "Untrusted report text", sources: "not an array" },
  // eslint-disable-next-line no-script-url -- Restored unsafe sources must be omitted rather than becoming links.
  { notes: "Untrusted report text", sources: [{ id: 1, title: "Unsafe source", url: "javascript:alert(1)" }] },
])("invalid restored report metadata cannot render or survive a snapshot", (researchDetails) => {
  const saved = { messages: [{ id: "assistant-1", role: "assistant", content: answer, status: "complete", researchDetails }] };
  render(<AppNavigationContext.Provider value={{ getToolState: () => saved }}><OrbSection /></AppNavigationContext.Provider>);
  expect(screen.getByText(answer)).toBeInTheDocument();
  expect(screen.queryByText("Full research")).not.toBeInTheDocument();
  expect(screen.queryByText("Untrusted report text")).not.toBeInTheDocument();
  expect(window.__orbMessages()[0]).not.toHaveProperty("researchDetails");
});
