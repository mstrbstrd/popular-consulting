import {
  MAX_METABLOOM_RESEARCH_PROGRESS_CHARS,
  MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS,
  createMetabloomSegmentStreamDecoder,
} from "./metabloomEmoteProtocol";
import {
  MAX_METABLOOM_RESEARCH_SOURCES,
  MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS,
  MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS,
  parseMetabloomResearchSources,
} from "./metabloomResearchSources";

const source = { id: 1, title: "Official documentation", url: "https://example.com/docs" };
// eslint-disable-next-line no-script-url -- This fixture must be rejected at the citation boundary.
const unsafeScriptUrl = "javascript:alert(1)";
const record = (value) => `${JSON.stringify(value)}\n`;
const input = record({ type: "emote", phase: "input", emote: "curious" });
const action = (choice) => record({ type: "action", action: choice });
const research = (state) => record({ type: "research", state });
const searching = research("searching");
const progress = (summary = "Searching: published evidence") => record({ type: "research_progress", summary });
const sources = (value = [source]) => record({ type: "sources", sources: value });
const synthesizing = research("synthesizing");
const delta = (text, index = 0) => record({ type: "text_delta", index, delta: text });
const segment = (text = "A supported answer [1].", index = 0) => record({ type: "segment", index, response: text });
const textComplete = record({ type: "text_complete" });
const finalReaction = record({ type: "emote", phase: "response", emote: "resolute" });
const done = record({ type: "done", version: "2.0.0" });
const selected = input + action("deep-research");
const ready = selected + searching + sources() + synthesizing;
const completion = segment() + textComplete + finalReaction + done;
const envelope = { version: "2.0.0", segments: [{ response: "A supported answer [1]." }] };

describe("Metabloom research source validation", () => {
  test("returns copied sources with trimmed titles and canonical HTTP(S) URLs", () => {
    const original = [{ id: 1, title: "  Official documentation  ", url: "HTTPS://Example.COM:443/docs" }];
    const parsed = parseMetabloomResearchSources(original);
    expect(parsed).toEqual([source]);
    expect(parsed).not.toBe(original);
    expect(parsed[0]).not.toBe(original[0]);
    original[0].url = unsafeScriptUrl;
    expect(parsed[0].url).toBe(source.url);
    expect(parseMetabloomResearchSources([{ ...source, url: "http://example.com" }]))
      .toEqual([{ ...source, url: "http://example.com/" }]);
  });

  test("accepts exact count and length limits", () => {
    const prefix = "https://example.com/";
    const bounded = Array.from({ length: MAX_METABLOOM_RESEARCH_SOURCES }, (_, index) => ({
      id: index + 1,
      title: "t".repeat(MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS),
      url: prefix + "u".repeat(MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS - prefix.length),
    }));
    expect(parseMetabloomResearchSources(bounded)).toEqual(bounded);
  });

  test("canonicalizes lone surrogate title units while preserving valid Unicode pairs", () => {
    const original = [{ ...source, title: "  Good 🌍 high \ud800 low \udc00  " }];
    expect(parseMetabloomResearchSources(original))
      .toEqual([{ ...source, title: "Good 🌍 high \ufffd low \ufffd" }]);
    expect(original[0].title).toBe("  Good 🌍 high \ud800 low \udc00  ");
  });

  test("trusted options allow a larger source set and contiguous later batches without changing the default", () => {
    const larger = Array.from({ length: 70 }, (_, index) => ({ ...source, id: index + 1 }));
    expect(parseMetabloomResearchSources(larger)).toBeNull();
    expect(parseMetabloomResearchSources(larger, { maxSources: larger.length })).toEqual(larger);
    expect(parseMetabloomResearchSources(larger.slice(64), { startId: 65 })).toEqual(larger.slice(64));
    expect(parseMetabloomResearchSources(larger.slice(64), { startId: 64 })).toBeNull();
  });

  test.each([
    { maxSources: 0 }, { maxSources: -1 }, { maxSources: 1.5 }, { maxSources: Infinity },
    { maxSources: "8" }, { startId: 0 }, { startId: 1.5 }, { startId: "1" },
  ])("rejects invalid trusted source limits %p", (options) => {
    expect(parseMetabloomResearchSources([source], options)).toBeNull();
  });

  test.each([
    ["a missing list", null],
    ["an object instead of a list", source],
    ["an empty list", []],
    ["a sparse list", new Array(1)],
    ["too many sources", Array.from({ length: MAX_METABLOOM_RESEARCH_SOURCES + 1 }, (_, index) => ({ ...source, id: index + 1 }))],
    ["a missing source", [null]],
    ["extra fields", [{ ...source, trusted: true }]],
    ["missing fields", [{ id: 1, url: source.url }]],
    ["an inherited source", [Object.create(source)]],
    ["zero ID", [{ ...source, id: 0 }]],
    ["a string ID", [{ ...source, id: "1" }]],
    ["a fractional ID", [{ ...source, id: 1.5 }]],
    ["a skipped ID", [source, { ...source, id: 3 }]],
    ["a duplicate ID", [source, { ...source }]],
    ["an empty title", [{ ...source, title: "  " }]],
    ["a non-text title", [{ ...source, title: 1 }]],
    ["an oversized title", [{ ...source, title: "t".repeat(MAX_METABLOOM_RESEARCH_SOURCE_TITLE_CHARS + 1) }]],
    ["a control character in a title", [{ ...source, title: "A\nB" }]],
    ["a non-text URL", [{ ...source, url: 1 }]],
    ["an oversized URL", [{ ...source, url: source.url + "u".repeat(MAX_METABLOOM_RESEARCH_SOURCE_URL_CHARS) }]],
    ["a URL exceeding its limit after canonicalization", [{ ...source, url: `${source.url}/${"é".repeat(400)}` }]],
  ])("rejects %s", (_name, value) => {
    expect(parseMetabloomResearchSources(value)).toBeNull();
  });

  test.each([
    "", unsafeScriptUrl, "data:text/html,test", "file:///tmp/document", "ftp://example.com/file",
    "/relative", "//example.com/docs", "https:example.com", "https:///example.com", "https://",
    "https://name:password@example.com", "https://name@example.com", "https://@example.com",
    " https://example.com", "https://example.com ", "https://exa\nmple.com", "https://example.com/\u0000",
    "https://example.com/\u007f", "https://example.com\\@evil.com", "https://invalid host.com", "https://example.com:99999",
  ])("rejects an unsafe or malformed citation URL %p", (url) => {
    expect(parseMetabloomResearchSources([{ ...source, url }])).toBeNull();
  });
});

describe("Metabloom research stream protocol", () => {
  test("delivers verified sources and research states before text, with the existing final envelope", () => {
    const events = [];
    const decoder = createMetabloomSegmentStreamDecoder({
      onReaction: ({ phase }) => events.push(phase),
      onAction: (value) => events.push(value),
      onResearch: (value) => events.push(value),
      onSources: (value) => events.push(value),
      onTextDelta: (value) => events.push(value),
      onSegment: (value) => events.push(value),
      onDone: (value) => events.push(value),
    });
    const stream = ready + delta("A supported") + delta(" answer [1].") + completion;
    for (let index = 0; index < stream.length; index += 7) {
      expect(decoder.push(stream.slice(index, index + 7))).toBe(true);
    }
    expect(events).toEqual([
      "input", "deep-research", { state: "searching" }, [source], { state: "synthesizing" },
      "A supported", " answer [1].", { response: "A supported answer [1]." }, "response", envelope,
    ]);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
    expect(decoder.getState()).toMatchObject({ completed: true, researchState: "synthesizing", sources: [source] });
  });

  test("source callbacks and snapshots cannot mutate retained metadata", () => {
    const decoder = createMetabloomSegmentStreamDecoder({
      onResearch: (value) => { value.state = "changed"; },
      onSources: (value) => { value[0].url = unsafeScriptUrl; value.push(source); },
    });
    expect(decoder.push(selected + searching + sources())).toBe(true);
    const snapshot = decoder.getState();
    expect(snapshot).toMatchObject({ researchState: "searching", sources: [source] });
    snapshot.sources[0].title = "Changed";
    snapshot.sources.length = 0;
    expect(decoder.getState().sources).toEqual([source]);
    expect(decoder.push(synthesizing + completion)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test("progress replaces its summary while searching and before synthesis text without changing the reply", () => {
    const onResearchProgress = jest.fn();
    const onSegment = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearchProgress, onSegment });
    const updates = ["Searching: published evidence", "Checked: example.com", "Writing an answer from 1 cited source."];
    const opening = selected + searching + progress(updates[0]) + sources() + progress(updates[1])
      + synthesizing + progress(updates[2]);
    for (let index = 0; index < opening.length; index += 9) {
      expect(decoder.push(opening.slice(index, index + 9))).toBe(true);
    }
    expect(onResearchProgress.mock.calls).toEqual(updates.map((summary) => [{ summary }]));
    expect(onSegment).not.toHaveBeenCalled();
    expect(decoder.getState()).toMatchObject({ researchSummary: updates[2], researchProgressCount: 3 });
    onResearchProgress.mock.calls[2][0].summary = "Changed";
    expect(decoder.getState().researchSummary).toBe(updates[2]);
    expect(decoder.push(completion)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test("progress accepts its exact length and count bounds, then stops on excess", () => {
    const onResearchProgress = jest.fn();
    const onSegment = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearchProgress, onSegment });
    expect(decoder.push(selected + searching)).toBe(true);
    for (let index = 0; index < MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS; index++) {
      expect(decoder.push(progress("q".repeat(MAX_METABLOOM_RESEARCH_PROGRESS_CHARS)))).toBe(true);
    }
    expect(onResearchProgress).toHaveBeenCalledTimes(MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS);
    expect(decoder.push(progress())).toBe(false);
    expect(decoder.push(sources() + synthesizing + completion)).toBe(false);
    expect(onResearchProgress).toHaveBeenCalledTimes(MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS);
    expect(onSegment).not.toHaveBeenCalled();
    expect(decoder.finish().ok).toBe(false);
  });

  test("source decorations follow their progress update and clear on generic progress and synthesis", () => {
    const onResearchProgress = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearchProgress });
    const iconSource = { url: source.url, token: "fixture-source-token-" + "a".repeat(80) };
    const reading = record({ type: "research_progress", summary: "Reading: example.com", source: iconSource });
    expect(decoder.push(selected + searching + reading)).toBe(true);
    expect(onResearchProgress).toHaveBeenLastCalledWith({ summary: "Reading: example.com", source: iconSource });
    onResearchProgress.mock.calls[0][0].source.url = "https://changed.example/";
    expect(decoder.getState().researchSource).toEqual(iconSource);
    expect(decoder.push(progress("Searching for another source."))).toBe(true);
    expect(decoder.getState().researchSource).toBeNull();
    expect(decoder.push(reading + sources() + synthesizing)).toBe(true);
    expect(decoder.getState().researchSource).toBeNull();
    expect(decoder.push(completion)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test("unusable source decorations do not discard valid research progress or the answer", () => {
    const onResearchProgress = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearchProgress });
    expect(decoder.push(selected + searching)).toBe(true);
    for (const decoration of [null, {}, { url: unsafeScriptUrl, token: "a".repeat(80) },
      { url: source.url, token: "invalid?url=elsewhere" }, { url: source.url, token: "a".repeat(4097) }]) {
      expect(decoder.push(record({ type: "research_progress", summary: "Reading published evidence.", source: decoration }))).toBe(true);
      expect(onResearchProgress).toHaveBeenLastCalledWith({ summary: "Reading published evidence." });
      expect(decoder.getState().researchSource).toBeNull();
    }
    expect(decoder.push(sources() + synthesizing + completion)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test.each([
    ["before any input", "", progress()],
    ["without an action", input, progress()],
    ["without a research state", selected, progress()],
    ["on an ordinary action", input + action("none"), progress()],
    ["after a text delta", ready + delta("Started"), progress()],
    ["after a segment", ready + segment(), progress()],
    ["after text completion", ready + segment() + textComplete, progress()],
    ["after done", ready + completion, progress()],
    ["inside a legacy stream", record({ type: "segment", index: 0, emote: "warm", response: "Legacy" }), progress()],
    ["with an empty summary", selected + searching, progress("")],
    ["with only whitespace", selected + searching, progress("  ")],
    ["with leading whitespace", selected + searching, progress(" Searching")],
    ["with trailing whitespace", selected + searching, progress("Searching ")],
    ["with a line break", selected + searching, progress("Searching\nagain")],
    ["with a control character", selected + searching, progress("Search\u0000")],
    ["with a delete character", selected + searching, progress("Search\u007f")],
    ["with a non-string summary", selected + searching, progress({ text: "Search" })],
    ["with an oversized summary", selected + searching, progress("s".repeat(MAX_METABLOOM_RESEARCH_PROGRESS_CHARS + 1))],
    ["with extra fields", selected + searching, record({ type: "research_progress", summary: "Search", stage: "imagined" })],
  ])("rejects progress %s", (_name, prefix, invalid) => {
    const onResearchProgress = jest.fn();
    const onError = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearchProgress, onError });
    expect(decoder.push(prefix)).toBe(true);
    expect(decoder.push(invalid)).toBe(false);
    expect(decoder.push(progress())).toBe(false);
    expect(onResearchProgress).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(decoder.finish().ok).toBe(false);
  });

  test("progress cannot replace verified sources, synthesis or completion", () => {
    const onDone = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onDone });
    expect(decoder.push(selected + searching + progress())).toBe(true);
    expect(decoder.push(segment())).toBe(false);
    expect(decoder.finish().ok).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  test.each([
    ["searching before the input emote", "", searching],
    ["searching without an action", input, searching],
    ["searching on no action", input + action("none"), searching],
    ["searching on under-the-hood", input + action("under-the-hood"), searching],
    ["sources without a research action", input + action("none"), sources()],
    ["sources before searching", selected, sources()],
    ["synthesis before searching", selected, synthesizing],
    ["synthesis before sources", selected + searching, synthesizing],
    ["a duplicate search state", selected + searching, searching],
    ["searching again after sources", selected + searching + sources(), searching],
    ["duplicate sources", selected + searching + sources(), sources()],
    ["sources after synthesis", ready, sources()],
    ["duplicate synthesis", ready, synthesizing],
    ["an unknown research state", selected, research("complete")],
    ["extra research fields", selected, record({ type: "research", state: "searching", extra: true })],
    ["extra sources fields", selected + searching, record({ type: "sources", sources: [source], extra: true })],
    ["invalid source metadata", selected + searching, sources([{ ...source, url: unsafeScriptUrl }])],
    ["text deltas during searching", selected + searching, delta("Premature")],
    ["segments during searching", selected + searching, segment()],
    ["text deltas before synthesis", selected + searching + sources(), delta("Premature")],
    ["segments before synthesis", selected + searching + sources(), segment()],
    ["research after provisional text", selected + delta("An opening"), searching],
    ["research after a complete segment", selected + segment(), searching],
    ["research after text completion", selected + segment() + textComplete, searching],
    ["research inside a legacy stream", record({ type: "segment", index: 0, emote: "warm", response: "Legacy" }), searching],
    ["a final reaction before text completion", ready + segment(), finalReaction],
    ["done without a final reaction", ready + segment() + textComplete, done],
  ])("rejects %s and stops dispatching subsequent records", (_name, prefix, invalid) => {
    const callbacks = Array.from({ length: 6 }, () => jest.fn());
    const [onResearch, onSources, onTextDelta, onSegment, onReaction, onDone] = callbacks;
    const onError = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({
      onResearch, onSources, onTextDelta, onSegment, onReaction, onDone, onError,
    });
    expect(decoder.push(prefix)).toBe(true);
    const counts = callbacks.map((callback) => callback.mock.calls.length);
    expect(decoder.push(invalid)).toBe(false);
    expect(decoder.push(ready + completion)).toBe(false);
    expect(callbacks.map((callback) => callback.mock.calls.length)).toEqual(counts);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(decoder.finish().ok).toBe(false);
  });

  test.each([
    selected + searching,
    selected + searching + sources(),
    ready,
    ready + delta("A supported"),
    ready + segment() + textComplete + finalReaction,
  ])("incomplete research never dispatches a final reaction or success", (stream) => {
    const onReaction = jest.fn();
    const onDone = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onReaction, onDone });
    expect(decoder.push(stream)).toBe(true);
    expect(decoder.finish().ok).toBe(false);
    expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
    expect(onDone).not.toHaveBeenCalled();
  });

  test("presentation-only deep-research streams remain compatible without research records", () => {
    const onResearch = jest.fn();
    const onSources = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onResearch, onSources });
    expect(decoder.push(selected + completion)).toBe(true);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
    expect(onResearch).not.toHaveBeenCalled();
    expect(onSources).not.toHaveBeenCalled();
    expect(decoder.getState()).toMatchObject({ researchState: null, sources: null });
  });
});
