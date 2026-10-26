import { TextEncoder } from "util";
import {
  MAX_METABLOOM_RESEARCH_REPORT_BYTES,
  MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS,
  getMetabloomUtf8ByteLength,
  parseMetabloomResearchReport,
} from "./metabloomResearchReport";
import {
  MAX_METABLOOM_STREAM_BYTES,
  MAX_METABLOOM_RESEARCH_STREAM_BYTES,
  createMetabloomSegmentStreamDecoder,
} from "./metabloomEmoteProtocol";

const source = { id: 1, title: "Official evidence", url: "https://example.org/evidence" };
const report = { notes: "# Completed research\n\nA supported finding. [1]", sources: [source] };
const record = (value) => JSON.stringify(value) + "\n";
const input = record({ type: "emote", phase: "input", emote: "curious" });
const selected = input + record({ type: "action", action: "deep-research" });
const searching = record({ type: "research", state: "searching" });
const sourceBatch = (sources = [source]) => record({ type: "research_report_sources", sources });
const noteChunk = (delta = report.notes, index = 0) => record({ type: "research_report_delta", index, delta });
const reportDone = record({ type: "research_report_complete" });
const ordinarySources = record({ type: "sources", sources: [source] });
const synthesis = record({ type: "research", state: "synthesizing" });
const answer = record({ type: "segment", index: 0, response: "A concise answer. [1]" });
const finishAnswer = record({ type: "text_complete" }) + record({ type: "emote", phase: "response", emote: "resolute" })
  + record({ type: "done", version: "2.0.0" });
const reportWire = (value = report) => {
  const events = [];
  for (let index = 0; index < value.sources.length; index += 8) events.push(sourceBatch(value.sources.slice(index, index + 8)));
  for (let index = 0; index < value.notes.length; index += MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS) {
    events.push(noteChunk(value.notes.slice(index, index + MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS), index / MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS));
  }
  return events.join("") + reportDone;
};
const ready = selected + searching;
const completedReport = ready + reportWire();
const complete = ordinarySources + synthesis + answer + finishAnswer;
const envelope = { version: "2.0.0", segments: [{ response: "A concise answer. [1]" }] };
const byteLength = (text) => new TextEncoder().encode(text).byteLength;
const padding = (characters) => {
  const line = " ".repeat(1000) + "\n";
  return line.repeat(Math.floor(characters / line.length)) + " ".repeat(characters % line.length);
};

describe("completed research report boundary", () => {
  test("preserves the full text and source list beyond presentation limits with independent canonical records", () => {
    const original = {
      notes: "  # Complete research\n\n" + "Evidence, not a shortened preview. ".repeat(1000) + "[70]\n",
      sources: Array.from({ length: 70 }, (_, index) => ({ id: index + 1, title: ` Evidence ${index + 1} `, url: `HTTPS://Example.ORG:443/${index + 1}` })),
    };
    const result = parseMetabloomResearchReport(original);
    expect(result.notes).toBe(original.notes);
    expect(result.sources).toHaveLength(70);
    expect(result.sources[69]).toEqual({ id: 70, title: "Evidence 70", url: "https://example.org/70" });
    expect(result).not.toBe(original);
    expect(result.sources).not.toBe(original.sources);
    expect(result.sources[0]).not.toBe(original.sources[0]);
    original.notes = "Changed";
    original.sources[0].title = "Changed";
    expect(result.notes).toContain("not a shortened preview");
    expect(result.sources[0].title).toBe("Evidence 1");
  });

  test("accepts exactly 1 MiB of serialized UTF-8 JSON, including Unicode and escaped text, and rejects excess", () => {
    const notes = "🌍漢é\n\"\\\ud800";
    const base = { notes, sources: [source] };
    const exact = { ...base, notes: notes + "x".repeat(MAX_METABLOOM_RESEARCH_REPORT_BYTES - byteLength(JSON.stringify(base))) };
    expect(byteLength(JSON.stringify(exact))).toBe(MAX_METABLOOM_RESEARCH_REPORT_BYTES);
    expect(parseMetabloomResearchReport(exact)).toEqual(exact);
    expect(parseMetabloomResearchReport({ ...exact, notes: exact.notes + "x" })).toBeNull();
    expect(parseMetabloomResearchReport({ notes: "漢".repeat(MAX_METABLOOM_RESEARCH_REPORT_BYTES / 3), sources: [source] })).toBeNull();
  });

  test.each(["plain", "é漢🌍", "\ud800", "\udc00", "\ud800A", "\udc00\ud800", "a\n\u0000"])
    ("shared UTF-8 accounting matches the platform encoder for %p", (value) => {
      expect(getMetabloomUtf8ByteLength(value)).toBe(byteLength(value));
    });

  test.each([
    null, [], JSON.stringify(report), {}, { ...report, extra: true }, Object.create(report),
    { notes: "", sources: [source] }, { notes: " \n\t", sources: [source] }, { notes: 1, sources: [source] },
    { notes: "Evidence", sources: [] }, { notes: "Evidence", sources: new Array(1) },
    { notes: "Evidence", sources: [{ ...source, id: 2 }] },
    { notes: "Evidence", sources: [source, source] },
    { notes: "Evidence", sources: [{ ...source, url: "data:text/html,unsafe" }] },
    { notes: "Evidence", sources: [{ ...source, url: "https://name:password@example.org/" }] },
    { notes: "Evidence", sources: [{ ...source, title: "Unsafe\nTitle" }] },
  ])("rejects an invalid completed report %p", (value) => {
    expect(parseMetabloomResearchReport(value)).toBeNull();
  });
});

describe("research report stream framing", () => {
  test("exposes a full report once only after validated completion, before the concise answer", () => {
    const onResearchDetails = jest.fn();
    const onSources = jest.fn();
    const onSegment = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails, onSources, onSegment });
    const opening = ready + sourceBatch() + noteChunk(report.notes.slice(0, 12)) + noteChunk(report.notes.slice(12), 1);
    for (let index = 0; index < opening.length; index += 7) expect(decoder.push(opening.slice(index, index + 7))).toBe(true);
    expect(onResearchDetails).not.toHaveBeenCalled();
    expect(decoder.getState().researchDetails).toBeNull();
    expect(onSources).not.toHaveBeenCalled();
    expect(onSegment).not.toHaveBeenCalled();
    expect(decoder.push(reportDone)).toBe(true);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
    expect(onResearchDetails).toHaveBeenCalledWith(report);
    onResearchDetails.mock.calls[0][0].sources[0].title = "Changed";
    const snapshot = decoder.getState();
    expect(snapshot.researchDetails).toEqual(report);
    snapshot.researchDetails.notes = "Changed";
    expect(decoder.getState().researchDetails).toEqual(report);
    expect(decoder.push(complete)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
    expect(onSources).toHaveBeenCalledWith([source]);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
  });

  test("accepts contiguous source batches beyond 64 and 2,048-character deltas without dropping any text", () => {
    const value = { notes: "q".repeat(MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS - 1) + "🌍evidence [70]",
      // The later concise-answer event refers to source 1. Keep that canonical
      // record identical while exercising the much larger full-report list.
      sources: Array.from({ length: 70 }, (_, index) => ({ ...source, id: index + 1,
        url: index === 0 ? source.url : `https://example.org/${index + 1}` })) };
    const onResearchDetails = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails });
    expect(decoder.push(ready + reportWire(value) + complete)).toBe(true);
    expect(onResearchDetails).toHaveBeenCalledWith(value);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test("canonical source batches fit the record limit even with maximal URLs and lone-surrogate titles", () => {
    const prefix = "https://example.org/";
    const value = parseMetabloomResearchReport({
      notes: report.notes,
      sources: Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        title: "\ud800".repeat(200),
        url: prefix + "u".repeat(2048 - prefix.length),
      })),
    });
    expect(value).not.toBeNull();
    expect(value.sources.every((item) => item.title === "\ufffd".repeat(200))).toBe(true);
    const reportSources = sourceBatch(value.sources);
    const conciseSources = record({ type: "sources", sources: value.sources });
    expect(reportSources.length).toBeLessThanOrEqual(24000);
    expect(conciseSources.length).toBeLessThanOrEqual(24000);
    const onResearchDetails = jest.fn();
    const onSources = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails, onSources });
    expect(decoder.push(ready + reportWire(value) + conciseSources + synthesis + answer + finishAnswer)).toBe(true);
    expect(onResearchDetails).toHaveBeenCalledWith(value);
    expect(onSources).toHaveBeenCalledWith(value.sources);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test("keeps a validated report available when writing the concise answer later fails", () => {
    const onResearchDetails = jest.fn();
    const onDone = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails, onDone });
    expect(decoder.push(completedReport + ordinarySources + synthesis)).toBe(true);
    expect(decoder.push(record({ type: "error", code: "answer_timeout", requestRef: "012345abcdef" }))).toBe(false);
    expect(decoder.finish()).toMatchObject({ ok: false, code: "answer_timeout" });
    expect(decoder.getState().researchDetails).toEqual(report);
    expect(onResearchDetails).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  test.each([
    ["without opt-in", false, ready, sourceBatch()],
    ["before input", true, "", sourceBatch()],
    ["before searching", true, selected, sourceBatch()],
    ["after ordinary sources", true, ready + ordinarySources, sourceBatch()],
    ["after synthesis", true, ready + ordinarySources + synthesis, sourceBatch()],
    ["after answer text", true, ready + ordinarySources + synthesis + answer, sourceBatch()],
    ["too many sources in one batch", true, ready, sourceBatch(Array.from({ length: 9 }, (_, index) => ({ ...source, id: index + 1 })))],
    ["a duplicate source ID", true, ready + sourceBatch(), sourceBatch()],
    ["a skipped source ID", true, ready + sourceBatch(), sourceBatch([{ ...source, id: 3 }])],
    ["sources after report text", true, ready + sourceBatch() + noteChunk(), sourceBatch([{ ...source, id: 2 }])],
    ["text before sources", true, ready, noteChunk()],
    ["a skipped text index", true, ready + sourceBatch(), noteChunk("Text", 1)],
    ["a duplicate text index", true, ready + sourceBatch() + noteChunk(), noteChunk()],
    ["a nonnumeric text index", true, ready + sourceBatch(), noteChunk("Text", "0")],
    ["an empty delta", true, ready + sourceBatch(), noteChunk("")],
    ["an oversized delta", true, ready + sourceBatch(), noteChunk("x".repeat(MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS + 1))],
    ["extra source fields", true, ready, record({ type: "research_report_sources", sources: [source], extra: true })],
    ["extra delta fields", true, ready + sourceBatch(), record({ type: "research_report_delta", index: 0, delta: "Text", extra: true })],
    ["completion before sources", true, ready, reportDone],
    ["completion before text", true, ready + sourceBatch(), reportDone],
    ["blank report text", true, ready + sourceBatch() + noteChunk(" \n"), reportDone],
    ["extra completion fields", true, ready + sourceBatch() + noteChunk(), record({ type: "research_report_complete", extra: true })],
    ["ordinary sources before report completion", true, ready + sourceBatch() + noteChunk(), ordinarySources],
    ["a second report", true, completedReport, sourceBatch()],
    ["a late delta", true, completedReport, noteChunk("More", 1)],
    ["duplicate completion", true, completedReport, reportDone],
  ])("rejects %s without exposing partial or additional reports", (_name, allowResearchDetails, prefix, invalid) => {
    const onResearchDetails = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails, onResearchDetails });
    expect(decoder.push(prefix)).toBe(true);
    const completedCount = onResearchDetails.mock.calls.length;
    expect(decoder.push(invalid)).toBe(false);
    expect(decoder.push(reportDone + complete)).toBe(false);
    expect(onResearchDetails).toHaveBeenCalledTimes(completedCount);
    expect(decoder.finish().ok).toBe(false);
  });

  test("truncated or oversized full reports never reach the callback", () => {
    const onResearchDetails = jest.fn();
    const incomplete = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails });
    expect(incomplete.push(ready + sourceBatch() + noteChunk())).toBe(true);
    expect(incomplete.finish().ok).toBe(false);
    const oversized = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails });
    expect(oversized.push(ready + reportWire({ ...report, notes: "x".repeat(MAX_METABLOOM_RESEARCH_REPORT_BYTES) }))).toBe(false);
    expect(oversized.finish().ok).toBe(false);
    expect(onResearchDetails).not.toHaveBeenCalled();
  });

  test("raises the byte ceiling only for opted-in confirmed research, including one large network chunk", () => {
    const largeReport = { ...report, notes: "Complete evidence. ".repeat(22000) };
    const stream = ready + reportWire(largeReport) + complete;
    expect(byteLength(stream)).toBeGreaterThan(MAX_METABLOOM_STREAM_BYTES);
    const onResearchDetails = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails });
    expect(decoder.push(stream)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
    expect(onResearchDetails).toHaveBeenCalledWith(largeReport);

    const ordinary = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
    expect(ordinary.push(selected + padding(MAX_METABLOOM_STREAM_BYTES))).toBe(false);
    const notOptedIn = createMetabloomSegmentStreamDecoder();
    expect(notOptedIn.push(ready + padding(MAX_METABLOOM_STREAM_BYTES))).toBe(false);
  });

  test("enforces the 2 MiB byte ceiling and 24k record cap independently of report size", () => {
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
    const excess = ready + padding(MAX_METABLOOM_RESEARCH_STREAM_BYTES - ready.length + 1);
    expect(decoder.push(excess)).toBe(false);
    const lineLimit = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
    expect(lineLimit.push(ready + " ".repeat(24001))).toBe(false);
    const unicode = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true });
    expect(unicode.push(input + ("　".repeat(1000) + "\n").repeat(110))).toBe(false);
  });

  test("retains compatibility with research responses containing no full-report records", () => {
    const onResearchDetails = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails });
    expect(decoder.push(ready + complete)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
    expect(onResearchDetails).not.toHaveBeenCalled();
  });
});
