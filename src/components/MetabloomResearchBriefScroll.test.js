import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrbSection from "./OrbSection";

jest.mock("./MetabloomAvatar", () => () => null);
jest.mock("../contexts/ThemeContext", () => ({ useThemeMode: () => ({ isDark: false }) }));

const answer = "The completed research brief is below.";
const report = {
  notes: "The fictional agency announced a local trial on 2026-10-23 [1].",
  sources: [{ id: 1, title: "Fictional agency announcement", url: "https://example.org/trial" }],
};
const brief = {
  version: "metabloom-research-brief-v1", kind: "news", title: "Fictional coastal news",
  scope: "A public-service development today", asOf: "2026-10-23T15:00:00.000Z", timeZone: "UTC",
  localDate: "2026-10-23", windowStart: "2026-10-23", windowEnd: "2026-10-23",
  coverage: { requestedCount: 1, returnedCount: 1, status: "complete", limitations: [] },
  items: [{
    headline: "Coastal service trial announced", summary: "The agency announced a local public-service trial.",
    sourceIds: [1], background: [{ text: "The announcement describes the local trial.", sourceIds: [1] }],
    whyItMatters: "The trial may change local service delivery.",
    uncertainty: ["The outcome is not yet established."], watchNext: ["Watch for the evaluation."],
    developmentDate: "2026-10-23", scheduledDate: null,
    dateEvidence: { sourceId: 1, quote: "The trial was announced on 2026-10-23." }, evidenceStatus: "announced",
  }],
  sourceDetails: [{ sourceId: 1, publisher: "", publishedDate: null, dateEvidence: "", sourceType: "unknown" }],
};
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = "Research the top coastal story today") => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: message } });
  fireEvent.submit(screen.getByRole("form", { name: "Message Metabloom" }));
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
  window.__metabloomRequest = (request) => new Promise((finish) => requests.push({ request, finish }));
});
afterEach(() => {
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
  window.__metabloomRequest = null; window.matchMedia = matchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor); else delete document.hidden;
});

const setupScrollport = () => {
  const transcript = screen.getByRole("log", { name: "Conversation" });
  let scrollTop = 0;
  Object.defineProperties(transcript, {
    scrollHeight: { configurable: true, value: 4000 },
    clientHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, get: () => scrollTop,
      set: (value) => { scrollTop = Math.max(0, Math.min(3400, value)); } },
  });
  transcript.style.setProperty("mask-image", "linear-gradient(transparent, black)");
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect() {
    if (this === transcript) return { top: 100, bottom: 700, left: 0, right: 500, height: 600, width: 500 };
    if (this.classList.contains("metabloom-research-brief")) {
      const top = 2500 - scrollTop;
      return { top, bottom: top + 1800, left: 0, right: 500, height: 1800, width: 500 };
    }
    if (this.classList.contains("metabloom-chat__full-research")) {
      const top = 2580 - scrollTop;
      return { top, bottom: top + 1800, left: 0, right: 500, height: 1800, width: 500 };
    }
    return originalRect.call(this);
  });
  return transcript;
};
const completeResearch = async (nextBrief = brief) => {
  const { request, finish } = requests[0];
  act(() => {
    request.onAction("deep-research");
    request.onResearch({ state: "searching" });
    request.onResearchDetails(report);
    request.onSources(report.sources);
    request.onResearch({ state: "synthesizing" });
    expect(request.onResearchBrief(nextBrief)).toBe(true);
  });
  await act(async () => finish({ version: "2.0.0", segments: [{ response: answer }] }));
  await tick(1000);
};

test("a completed long brief opens at its beginning once and ordinary chat can resume following latest", async () => {
  render(<OrbSection />);
  const transcript = setupScrollport();
  send(); await tick(0);
  expect(transcript.scrollTop).toBe(3400);
  await completeResearch();
  const region = screen.getByRole("region", { name: brief.title });
  // Keep the opening below the top 12% fade and within the top 20% of the log.
  expect(region.getBoundingClientRect().top).toBeGreaterThanOrEqual(172);
  expect(region.getBoundingClientRect().top).toBeLessThan(220);
  const openingPosition = transcript.scrollTop;
  fireEvent(window, new Event("resize")); await tick(1000);
  expect(transcript.scrollTop).toBe(openingPosition);

  fireEvent.click(screen.getByRole("button", { name: "Latest message ↓" }));
  expect(transcript.scrollTop).toBe(3400);
  fireEvent(window, new Event("resize")); await tick(1000);
  expect(transcript.scrollTop).toBe(3400);

  transcript.scrollTop = openingPosition;
  fireEvent.scroll(transcript);
  send("Thanks, tell me something else"); await tick(0);
  expect(transcript.scrollTop).toBe(3400);
  expect(requests).toHaveLength(2);
});

test("a newly completed brief does not move someone reading earlier messages", async () => {
  render(<OrbSection />);
  const transcript = setupScrollport();
  send(); await tick(0);
  transcript.scrollTop = 100;
  fireEvent.scroll(transcript);
  await completeResearch();
  expect(screen.getByRole("region", { name: brief.title })).toBeInTheDocument();
  expect(transcript.scrollTop).toBe(100);
  fireEvent(window, new Event("resize")); await tick(1000);
  expect(transcript.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole("button", { name: "Latest message ↓" }));
  expect(transcript.scrollTop).toBe(3400);
});

test.each([false, true])("an empty brief opens at the report start once while respecting earlier reading: %s", async (readingEarlier) => {
  render(<OrbSection />);
  const transcript = setupScrollport();
  send(); await tick(0);
  if (readingEarlier) { transcript.scrollTop = 100; fireEvent.scroll(transcript); }
  const empty = { ...brief, items: [], sourceDetails: [], coverage: {
    requestedCount: 5, returnedCount: 0, status: 'unavailable', limitations: ['The timing needs verification.'],
  } };
  await completeResearch(empty);
  const summary = screen.getByText('Full research', { selector: 'summary' });
  const disclosure = summary.parentElement;
  expect(disclosure).toHaveAttribute('open');
  if (readingEarlier) expect(transcript.scrollTop).toBe(100);
  else {
    expect(disclosure.getBoundingClientRect().top).toBeGreaterThanOrEqual(172);
    expect(disclosure.getBoundingClientRect().top).toBeLessThan(220);
  }
  const openingPosition = transcript.scrollTop;
  fireEvent.click(summary); fireEvent(disclosure, new Event('toggle')); await tick(0);
  fireEvent(window, new Event('resize')); await tick(1000);
  expect(disclosure).not.toHaveAttribute('open');
  expect(transcript.scrollTop).toBe(openingPosition);
  expect(requests).toHaveLength(1);
});
