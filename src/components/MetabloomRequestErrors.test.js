import { createMetabloomSegmentStreamDecoder } from "./metabloomEmoteProtocol";
import {
  METABLOOM_STREAM_ERROR_CODES,
  getMetabloomApiErrorMessage,
  parseMetabloomRequestError,
  parseMetabloomRequestRef,
} from "./metabloomRequestErrors";

const requestRef = "012345abcdef";
const terminal = (value) => JSON.stringify({ type: "error", ...value }) + "\n";
const start = '{"type":"emote","phase":"input","emote":"curious"}\n'
  + '{"type":"action","action":"deep-research"}\n{"type":"research","state":"searching"}\n';

describe("safe Metabloom request errors", () => {
  test("copies only an exact known code and valid request reference", () => {
    const error = { code: "research_timeout", requestRef };
    const parsed = parseMetabloomRequestError(error);
    expect(parsed).toEqual(error);
    expect(parsed).not.toBe(error);
    error.code = "private_provider_message";
    expect(parsed.code).toBe("research_timeout");
    expect(parseMetabloomRequestError({ code: "not_configured" })).toEqual({ code: "not_configured" });
    expect(parseMetabloomRequestError(Object.assign(Object.create(null), parsed))).toEqual(parsed);
  });

  test.each([
    null, [], "research_timeout", {}, { code: "unknown" }, { code: "constructor" },
    Object.create({ code: "research_timeout" }),
    { code: "research_timeout", message: "Private provider diagnostic" },
    { code: "research_timeout", requestRef: null },
    { code: "research_timeout", requestRef: "012345ABCDEf" },
    { code: "research_timeout", requestRef, extra: true },
  ])("rejects malformed error details %p", (value) => {
    expect(parseMetabloomRequestError(value)).toBeNull();
  });

  test.each([null, 123, "", "abcdef01234", "abcdef0123456", "ABCDEF012345", "abcdef01234g", "abcdef012345\n"])
    ("rejects an invalid request reference %p", (value) => {
      expect(parseMetabloomRequestRef(value)).toBeNull();
    });

  test("returns only local safe messages, including unknown-code fallback", () => {
    expect(parseMetabloomRequestRef(requestRef)).toBe(requestRef);
    expect(getMetabloomApiErrorMessage("research_timeout")).toContain("research took too long");
    for (const code of [null, "private diagnostic", "__proto__", { code: "research_timeout" }]) {
      expect(getMetabloomApiErrorMessage(code)).toBe(getMetabloomApiErrorMessage("request_failed"));
    }
  });
});

describe("terminal Metabloom stream errors", () => {
  test.each(METABLOOM_STREAM_ERROR_CODES)("retains %s and its safe reference without dispatching completion", (code) => {
    const onError = jest.fn();
    const onDone = jest.fn();
    const onReaction = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onError, onDone, onReaction });
    expect(decoder.push(start)).toBe(true);
    expect(decoder.push(terminal({ code, requestRef }))).toBe(false);
    expect(decoder.finish()).toEqual({ ok: false, error: getMetabloomApiErrorMessage(code), code, requestRef });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code, requestRef, message: getMetabloomApiErrorMessage(code) });
    onError.mock.calls[0][0].code = "changed";
    expect(decoder.finish().code).toBe(code);
    expect(decoder.push('{"type":"done","version":"2.0.0"}\n')).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(onReaction).toHaveBeenCalledTimes(1);
  });

  test("accepts a terminal failure before input and the legacy interruption record", () => {
    const early = createMetabloomSegmentStreamDecoder();
    expect(early.push(terminal({ code: "quota_unavailable", requestRef }))).toBe(false);
    expect(early.finish()).toMatchObject({ ok: false, code: "quota_unavailable", requestRef });
    const legacy = createMetabloomSegmentStreamDecoder();
    expect(legacy.push(start + terminal({ code: "stream_interrupted" }))).toBe(false);
    expect(legacy.finish()).toEqual({ ok: false, code: "stream_interrupted", error: getMetabloomApiErrorMessage("stream_interrupted") });
  });

  test("retains a fragmented final error record without a trailing newline", () => {
    const decoder = createMetabloomSegmentStreamDecoder();
    const text = terminal({ code: "research_token_limit", requestRef }).trimEnd();
    expect(decoder.push(start)).toBe(true);
    expect(decoder.push(text.slice(0, 17))).toBe(true);
    expect(decoder.push(text.slice(17))).toBe(true);
    expect(decoder.finish()).toMatchObject({ ok: false, code: "research_token_limit", requestRef });
  });

  test.each([
    { code: "research_timeout" },
    { code: "research_timeout", requestRef: "012345ABCDEf" },
    { code: "research_timeout", requestRef: "short" },
    { code: "research_timeout", requestRef: null },
    { code: "research_timeout", requestRef, message: "Private provider diagnostic" },
    { code: "unknown", requestRef },
    { code: "not_configured", requestRef },
    { code: "constructor", requestRef },
  ])("classifies malformed terminal records as protocol failures %p", (value) => {
    const onError = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onError });
    expect(decoder.push(start + terminal(value))).toBe(false);
    expect(decoder.finish()).toEqual({ ok: false, error: "Invalid stream error." });
    expect(onError.mock.calls[0][0].code).toBeUndefined();
    expect(onError.mock.calls[0][0].requestRef).toBeUndefined();
  });
});
