import { TextEncoder, TextDecoder } from "util";
import { METABLOOM_RESEARCH_TIMEOUT_MS, getMetabloomApiErrorMessage, requestMetabloomResponse } from "./metabloomApiClient";
import { MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS } from "./metabloomResearchReport";
const first = { emote: "whimsy", response: "A playful 🪴 opening." };
const second = { emote: "reflective", response: "A considered continuation." };
const line = (segment, index) => JSON.stringify({ type: "segment", index, ...segment }) + "\n";
const done = '{"type":"done","version":"1.0.0"}\n';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const transport = ({ status = 200, requestRef = null } = {}) => {
  let provide;
  const reader = {
    read: jest.fn(() => new Promise((resolve) => { provide = resolve; })),
    cancel: jest.fn(async () => {}), releaseLock: jest.fn(),
  };
  return {
    reader,
    fetchImpl: jest.fn(async () => ({ ok: true, status, headers: {
      get: (name) => name.toLowerCase() === "content-type" ? "application/x-ndjson" : requestRef,
    }, body: { getReader: () => reader } })),
    send: async (text) => { provide({ value: new TextEncoder().encode(text), done: false }); await flush(); },
    close: async () => { provide({ done: true }); await flush(); },
  };
};

describe("HTTP segment arrival, not whole-response buffering", () => {
  const previousDecoder = global.TextDecoder;
  beforeAll(() => { global.TextDecoder = TextDecoder; });
  afterAll(() => { global.TextDecoder = previousDecoder; });

  test("onSegment fires while the body is open, and EOF does not replay it", async () => {
    const io = transport(); const onSegment = jest.fn(); let finished = false;
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", allowMultiple: true, onSegment });
    request.then(() => { finished = true; });
    await flush();
    const record = line(first, 0);
    await io.send(record.slice(0, 40));
    expect(onSegment).not.toHaveBeenCalled();
    await io.send(record.slice(40));
    expect(onSegment).toHaveBeenCalledWith(first, 0);
    expect(finished).toBe(false);
    await io.send(line(second, 1));
    expect(onSegment).toHaveBeenCalledTimes(2);
    expect(finished).toBe(false);
    await io.send(done);
    await io.close();
    await expect(request).resolves.toEqual({ version: "1.0.0", segments: [first, second] });
    expect(onSegment).toHaveBeenCalledTimes(2);
    expect(io.reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  test("Jev gestures bracket v2 streaming and the final reaction waits for verified done", async () => {
    const io = transport(); const onSegment = jest.fn(); const onReaction = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onSegment, onReaction });
    await flush();
    await io.send('{"type":"emote","phase":"input","emote":"curious"}\n');
    expect(onReaction).toHaveBeenCalledWith({ phase: "input", emote: "curious" });
    await io.send('{"type":"segment","index":0,"response":"The answer starts now."}\n');
    expect(onSegment).toHaveBeenCalledWith({ response: "The answer starts now." }, 0);
    await io.send('{"type":"text_complete"}\n');
    await io.send('{"type":"emote","phase":"response","emote":"resolute"}\n');
    expect(onReaction).toHaveBeenCalledTimes(1);
    await io.send('{"type":"done","version":"2.0.0"}\n');
    expect(onReaction).toHaveBeenCalledWith({ phase: "response", emote: "resolute" });
    await io.close();
    await expect(request).resolves.toEqual({ version: "2.0.0", segments: [{ response: "The answer starts now." }] });
    expect(onReaction).toHaveBeenCalledTimes(2);
  });

  test("a disconnect after a valid prefix never becomes a successful demo response", async () => {
    const io = transport({ requestRef: "abcdef012345" }); const onSegment = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", allowMultiple: true, onSegment, optional: true });
    const failure = request.catch((error) => error);
    await flush(); await io.send(line(first, 0)); await io.close();
    expect(await failure).toMatchObject({ code: "invalid_response", requestRef: "abcdef012345", status: 200 });
    expect(onSegment).toHaveBeenCalledTimes(1);
  });

  test("a cancelled request does not emit a late segment", async () => {
    const io = transport(); const controller = new AbortController(); const onSegment = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onSegment, signal: controller.signal });
    const failure = request.catch((error) => error);
    await flush(); controller.abort(); await io.send(line(first, 0));
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onSegment).not.toHaveBeenCalled();
  });
});

describe("confirmed research metadata and request deadlines", () => {
  const previousDecoder = global.TextDecoder;
  const sources = [{ id: 1, title: "Published evidence", url: "https://example.org/evidence" }];
  const researchStart = '{"type":"emote","phase":"input","emote":"curious"}\n'
    + '{"type":"action","action":"deep-research"}\n';
  const metadata = JSON.stringify({ type: "sources", sources }) + '\n{"type":"research","state":"synthesizing"}\n';
  const report = { notes: "A complete research finding. [1]", sources };
  const reportRecords = (value = report) => {
    const records = [JSON.stringify({ type: "research_report_sources", sources: value.sources })];
    for (let index = 0; index < value.notes.length; index += MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS) {
      records.push(JSON.stringify({ type: "research_report_delta", index: index / MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS,
        delta: value.notes.slice(index, index + MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS) }));
    }
    return records.join("\n") + "\n";
  };
  const reportComplete = '{"type":"research_report_complete"}\n';
  beforeAll(() => { global.TextDecoder = TextDecoder; });
  afterAll(() => { global.TextDecoder = previousDecoder; });
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test("a scene choice alone keeps the ordinary thirty-second HTTP deadline", async () => {
    const io = transport();
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", actionMode: "deep-research" }).catch((error) => error);
    await flush();
    await io.send(researchStart);
    const signal = io.fetchImpl.mock.calls[0][1].signal;
    jest.advanceTimersByTime(29999);
    expect(signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    await io.close();
    expect(await failure).toMatchObject({ code: "cancelled" });
  });

  test("searching extends once from request start; reports, progress, sources and synthesis do not renew the deadline", async () => {
    const io = transport();
    const onResearch = jest.fn();
    const onSources = jest.fn();
    const onResearchProgress = jest.fn();
    const onResearchDetails = jest.fn();
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", onResearch, onSources, onResearchProgress, onResearchDetails }).catch((error) => error);
    await flush();
    await io.send(researchStart);
    jest.advanceTimersByTime(20000);
    await io.send('{"type":"research","state":"searching"}\n');
    expect(onResearch).toHaveBeenCalledWith({ state: "searching" });
    const signal = io.fetchImpl.mock.calls[0][1].signal;
    jest.advanceTimersByTime(METABLOOM_RESEARCH_TIMEOUT_MS - 20001);
    expect(signal.aborted).toBe(false);
    await io.send(reportRecords() + reportComplete + '{"type":"research_progress","summary":"Checked: example.org"}\n' + metadata
      + '{"type":"research_progress","summary":"Writing an answer from 1 cited source."}\n');
    expect(onSources).toHaveBeenCalledWith(sources);
    expect(onResearch).toHaveBeenLastCalledWith({ state: "synthesizing" });
    expect(onResearchProgress).toHaveBeenCalledTimes(2);
    expect(onResearchDetails).toHaveBeenCalledWith(report);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    await io.close();
    expect(await failure).toMatchObject({ code: "cancelled" });
  });

  test("a sourced research reply can finish after the ordinary chat deadline", async () => {
    const io = transport();
    const onSources = jest.fn();
    const onSegment = jest.fn();
    const onResearchProgress = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", onSources, onSegment, onResearchProgress });
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n');
    jest.advanceTimersByTime(45000);
    await io.send('{"type":"research_progress","summary":"Searching: published evidence"}\n');
    expect(onResearchProgress).toHaveBeenCalledWith({ summary: "Searching: published evidence" });
    await io.send(metadata + '{"type":"research_progress","summary":"Writing an answer from 1 cited source."}\n');
    expect(onSegment).not.toHaveBeenCalled();
    expect(onResearchProgress).toHaveBeenLastCalledWith({ summary: "Writing an answer from 1 cited source." });
    await io.send('{"type":"text_delta","index":0,"delta":"A supported finding [1]."}\n'
      + '{"type":"segment","index":0,"response":"A supported finding [1]."}\n'
      + '{"type":"text_complete"}\n{"type":"emote","phase":"response","emote":"resolute"}\n'
      + '{"type":"done","version":"2.0.0"}\n');
    await io.close();
    await expect(request).resolves.toEqual({ version: "2.0.0", segments: [{ response: "A supported finding [1]." }] });
    expect(onSources).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("cancellation prevents late progress and sources from reaching the reply", async () => {
    const io = transport();
    const controller = new AbortController();
    const onSources = jest.fn();
    const onResearchProgress = jest.fn();
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", signal: controller.signal, onSources, onResearchProgress }).catch((error) => error);
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n');
    controller.abort();
    await io.send('{"type":"research_progress","summary":"Searching: late evidence"}\n' + metadata);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onSources).not.toHaveBeenCalled();
    expect(onResearchProgress).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("stopping inside a progress callback blocks later records already in the same chunk", async () => {
    const io = transport();
    const controller = new AbortController();
    const onSources = jest.fn();
    const onResearchProgress = jest.fn(() => controller.abort());
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", signal: controller.signal, onSources, onResearchProgress }).catch((error) => error);
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n'
      + '{"type":"research_progress","summary":"Searching: published evidence"}\n'
      + '{"type":"research_progress","summary":"Checked: example.org"}\n' + metadata);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onResearchProgress).toHaveBeenCalledTimes(1);
    expect(onSources).not.toHaveBeenCalled();
    expect(io.reader.cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(["research_timeout", "research_token_limit", "model_configuration_error", "provider_rate_limited"])
    ("surfaces %s immediately with its reference and no successful reply", async (code) => {
      const requestRef = "012345abcdef";
      const io = transport({ requestRef });
      const onSegment = jest.fn();
      const onReaction = jest.fn();
      const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", onSegment, onReaction, optional: true }).catch((error) => error);
      await flush();
      await io.send(researchStart + '{"type":"research","state":"searching"}\n');
      const errorRecord = JSON.stringify({ type: "error", code, requestRef }) + "\n";
      await io.send(errorRecord.slice(0, 20));
      expect(io.reader.releaseLock).not.toHaveBeenCalled();
      await io.send(errorRecord.slice(20));
      expect(await failure).toMatchObject({ name: "MetabloomApiError", code, requestRef, status: 200, message: getMetabloomApiErrorMessage(code) });
      expect(onSegment).not.toHaveBeenCalled();
      expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
      expect(io.reader.cancel).toHaveBeenCalledTimes(1);
      expect(io.reader.releaseLock).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });

  test("rejects an untrusted error record while retaining only the valid header reference", async () => {
    const requestRef = "abcdef012345";
    const io = transport({ requestRef });
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate" }).catch((error) => error);
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n'
      + JSON.stringify({ type: "error", code: "research_timeout", requestRef: "untrusted", message: "Private provider diagnostic" }) + "\n");
    expect(await failure).toMatchObject({ code: "invalid_response", requestRef, status: 200, message: getMetabloomApiErrorMessage("invalid_response") });
  });

  test("delivers a large completed report while the connection is open and retains it across a writer error", async () => {
    const io = transport({ requestRef: "012345abcdef" });
    const onResearchDetails = jest.fn();
    const onSources = jest.fn();
    const onSegment = jest.fn();
    const full = { ...report, notes: "Complete paid research. ".repeat(16000) + "[1]" };
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", onResearchDetails, onSources, onSegment }).catch((error) => error);
    await flush();
    // The first network chunk may contain both the confirming state and a report
    // larger than ordinary chat's transport budget.
    await io.send(researchStart + '{"type":"research","state":"searching"}\n' + reportRecords(full));
    expect(onResearchDetails).not.toHaveBeenCalled();
    expect(onSources).not.toHaveBeenCalled();
    await io.send(reportComplete);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
    expect(onResearchDetails).toHaveBeenCalledWith(full);
    expect(io.reader.releaseLock).not.toHaveBeenCalled();
    await io.send(metadata + '{"type":"error","code":"provider_rate_limited","requestRef":"012345abcdef"}\n');
    expect(await failure).toMatchObject({ code: "provider_rate_limited", requestRef: "012345abcdef" });
    expect(onResearchDetails.mock.calls[0][0]).toEqual(full);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
    expect(onSegment).not.toHaveBeenCalled();
    expect(io.reader.cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("stopping during report delivery prevents a later completion callback", async () => {
    const io = transport();
    const controller = new AbortController();
    const onResearchDetails = jest.fn();
    const onSources = jest.fn();
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", signal: controller.signal, onResearchDetails, onSources }).catch((error) => error);
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n' + reportRecords());
    controller.abort();
    await io.send(reportComplete + metadata);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onResearchDetails).not.toHaveBeenCalled();
    expect(onSources).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("stopping in the report callback prevents buffered answer metadata from continuing", async () => {
    const io = transport();
    const controller = new AbortController();
    const onResearchDetails = jest.fn(() => controller.abort());
    const onSources = jest.fn();
    const failure = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Investigate", signal: controller.signal, onResearchDetails, onSources }).catch((error) => error);
    await flush();
    await io.send(researchStart + '{"type":"research","state":"searching"}\n' + reportRecords() + reportComplete + metadata);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onResearchDetails).toHaveBeenCalledWith(report);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
    expect(onSources).not.toHaveBeenCalled();
  });
});
