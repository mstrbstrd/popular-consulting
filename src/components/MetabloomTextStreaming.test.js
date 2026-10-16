import { TextDecoder, TextEncoder } from "util";
import { requestMetabloomResponse } from "./metabloomApiClient";
import { createMetabloomSegmentStreamDecoder } from "./metabloomEmoteProtocol";
import { createMetabloomReplySession } from "./metabloomReplySession";

const record = (value) => `${JSON.stringify(value)}\n`;
const input = record({ type: "emote", phase: "input", emote: "curious" });
const delta = (text, index = 0) => record({ type: "text_delta", index, delta: text });
const segment = (text, index = 0) => record({ type: "segment", index, response: text });
const textComplete = record({ type: "text_complete" });
const finalReaction = record({ type: "emote", phase: "response", emote: "resolute" });
const done = record({ type: "done", version: "2.0.0" });
const envelope = (...responses) => ({
  version: "2.0.0",
  segments: responses.map((response) => ({ response })),
});
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

// Controlled byte arrivals keep the HTTP body open until the test closes it.
const transport = () => {
  const queue = [];
  let waiting = null;
  const provide = (chunk) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(chunk);
    } else queue.push(chunk);
  };
  const reader = {
    read: jest.fn(() => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => { waiting = resolve; })),
    cancel: jest.fn(async () => { provide({ done: true }); }),
    releaseLock: jest.fn(),
  };
  return {
    reader,
    fetchImpl: jest.fn(async () => ({
      ok: true,
      headers: { get: () => "application/x-ndjson" },
      body: { getReader: () => reader },
    })),
    async sendBytes(value) { provide({ value, done: false }); await flush(); },
    async send(text) { provide({ value: new TextEncoder().encode(text), done: false }); await flush(); },
    async close() { provide({ done: true }); await flush(); },
  };
};

describe("progressive Metabloom text", () => {
  test("a provisional paragraph grows before commit and commits without duplicated text or emotes", () => {
    const updates = [];
    const onEmote = jest.fn();
    const reply = createMetabloomReplySession({ onUpdate: (value) => updates.push(value), onEmote });

    expect(reply.appendText("A growing", 0)).toBe(true);
    expect(reply.snapshot()).toMatchObject({
      content: "A growing",
      segments: [{ response: "A growing" }],
      status: "streaming",
    });
    reply.appendText(" thought 🪴.", 0);
    reply.append({ response: "A growing thought 🪴." }, 0);
    expect(reply.snapshot().segments).toEqual([{ response: "A growing thought 🪴." }]);
    reply.finish(envelope("A growing thought 🪴."));

    expect(reply.snapshot()).toMatchObject({ content: "A growing thought 🪴.", status: "complete" });
    expect(updates[0].content).toBe("A growing");
    expect(onEmote).not.toHaveBeenCalled();
    expect(reply.appendText("Late text", 1)).toBe(false);
    expect(reply.finish(envelope("A growing thought 🪴."))).toBe(false);
  });

  test("separate progressive paragraphs remain one reply in their original order", () => {
    const reply = createMetabloomReplySession({ allowMultiple: true, onUpdate: jest.fn() });
    reply.appendText("First", 0);
    reply.append({ response: "First" }, 0);
    reply.appendText("Second", 1);
    expect(reply.snapshot().content).toBe("First\n\nSecond");
    expect(reply.snapshot().segments).toHaveLength(2);
    reply.appendText(" paragraph", 1);
    reply.append({ response: "Second paragraph" }, 1);
    reply.finish(envelope("First", "Second paragraph"));
    expect(reply.snapshot()).toMatchObject({
      content: "First\n\nSecond paragraph",
      segments: [{ response: "First" }, { response: "Second paragraph" }],
      status: "complete",
    });
  });

  test.each(["interrupted", "error"])("an %s draft keeps its visible prefix and rejects late text", (reason) => {
    const onUpdate = jest.fn();
    const reply = createMetabloomReplySession({ onUpdate });
    reply.appendText("Only a partial answer", 0);
    reply.interrupt(reason);

    expect(reply.snapshot()).toMatchObject({ content: "Only a partial answer", status: reason });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: reason }));
    expect(reply.appendText(" must not appear", 0)).toBe(false);
    expect(reply.append({ response: "Only a partial answer must not appear" }, 0)).toBe(false);
    expect(reply.finish(envelope("Only a partial answer"))).toBe(false);
    expect(reply.snapshot().content).toBe("Only a partial answer");
  });

  test("out-of-order text and mismatched commits cannot rewrite a visible draft", () => {
    const reply = createMetabloomReplySession({ allowMultiple: true, onUpdate: jest.fn() });
    expect(() => reply.appendText("Skipped paragraph", 1)).toThrow();
    reply.appendText("Visible prefix", 0);
    expect(() => reply.append({ response: "A different answer" }, 0)).toThrow();
    expect(() => reply.finish(envelope("A different answer"))).toThrow();
    expect(reply.snapshot().content).toBe("Visible prefix");
    reply.append({ response: "Visible prefix" }, 0);
    expect(() => reply.appendText("Stale extension", 0)).toThrow();
    expect(reply.snapshot().content).toBe("Visible prefix");
  });

  test("decoded text arrives before commit and the final reaction waits for terminal verification", () => {
    const onTextDelta = jest.fn();
    const onSegment = jest.fn();
    const onReaction = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onTextDelta, onSegment, onReaction });

    expect(decoder.push(input + delta("A thought"))).toBe(true);
    expect(onTextDelta).toHaveBeenCalledWith("A thought", 0);
    expect(onSegment).not.toHaveBeenCalled();
    expect(onReaction).toHaveBeenCalledTimes(1);
    expect(decoder.getState().completed).toBe(false);
    expect(decoder.push(delta(" in motion.") + segment("A thought in motion."))).toBe(true);
    expect(onSegment).toHaveBeenCalledWith({ response: "A thought in motion." }, 0);
    expect(decoder.push(textComplete + finalReaction)).toBe(true);
    expect(onReaction).toHaveBeenCalledTimes(1);
    expect(decoder.push(done)).toBe(true);
    expect(onReaction).toHaveBeenLastCalledWith({ phase: "response", emote: "resolute" });
    expect(decoder.finish()).toEqual({ ok: true, value: envelope("A thought in motion.") });
  });

  test.each([
    ["before the input reaction", "", delta("Hello")],
    ["empty text", input, delta("")],
    ["non-text delta", input, record({ type: "text_delta", index: 0, delta: 1 })],
    ["extra fields", input, record({ type: "text_delta", index: 0, delta: "Hello", extra: true })],
    ["negative index", input, delta("Hello", -1)],
    ["fractional index", input, delta("Hello", 0.5)],
    ["skipped index", input, delta("Hello", 1)],
    ["already committed paragraph", input + segment("Hello"), delta("Again", 0)],
    ["mismatched commit", input + delta("Hello"), segment("Goodbye")],
    ["uncommitted text completion", input + delta("Hello"), textComplete],
    ["early final reaction", input + delta("Hello"), finalReaction],
    ["after text completion", input + segment("Hello") + textComplete, delta("Again", 1)],
    ["after terminal completion", input + segment("Hello") + textComplete + finalReaction + done, delta("Again", 1)],
    ["mixed into a legacy stream", record({ type: "segment", index: 0, emote: "warm", response: "Hello" }), delta("Again", 1)],
  ])("rejects progressive records %s", (_name, prefix, invalid) => {
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: true });
    expect(decoder.push(prefix)).toBe(true);
    expect(decoder.push(invalid)).toBe(false);
    expect(decoder.finish().ok).toBe(false);
  });

  test("a failed stream preserves its provisional text and never emits a final reaction", () => {
    const onReaction = jest.fn();
    const reply = createMetabloomReplySession({ onUpdate: jest.fn() });
    const decoder = createMetabloomSegmentStreamDecoder({
      onTextDelta: (text, index) => reply.appendText(text, index),
      onSegment: (value, index) => reply.append(value, index),
      onReaction,
      onError: () => reply.interrupt("error"),
    });
    expect(decoder.push(input + delta("An unfinished thought"))).toBe(true);
    expect(decoder.push(record({ type: "error", code: "stream_interrupted" }))).toBe(false);
    expect(decoder.finish().ok).toBe(false);
    expect(reply.snapshot()).toMatchObject({ content: "An unfinished thought", status: "error" });
    expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
  });

  test("every NDJSON split preserves literal quotes, backslashes, newlines, and Unicode", () => {
    const text = 'A "quoted" path \\ and a line\nwith 🪴, λ, and 日本語.';
    const wire = input + delta(text) + segment(text) + textComplete + finalReaction + done;
    for (let split = 1; split < wire.length; split++) {
      const received = [];
      const decoder = createMetabloomSegmentStreamDecoder({ onTextDelta: (value) => received.push(value) });
      expect(decoder.push(wire.slice(0, split))).toBe(true);
      expect(decoder.push(wire.slice(split))).toBe(true);
      expect(received.join("")).toBe(text);
      expect(decoder.finish()).toEqual({ ok: true, value: envelope(text) });
    }
  });

  test("the maximum legal reply still streams when every delta contains one character", () => {
    const responses = ["a".repeat(1600), "b".repeat(1600), "c".repeat(1600)];
    const chunks = [input];
    responses.forEach((text, index) => {
      for (const character of text) chunks.push(delta(character, index));
      chunks.push(segment(text, index));
    });
    chunks.push(textComplete, finalReaction, done);
    const onTextDelta = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: true, onTextDelta });
    for (const chunk of chunks) expect(decoder.push(chunk)).toBe(true);
    expect(onTextDelta).toHaveBeenCalledTimes(4800);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope(...responses) });
  });

  test("paragraph and overall limits apply before oversized draft text is exposed", () => {
    const onTextDelta = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: true, onTextDelta });
    expect(decoder.push(input + delta("a".repeat(1600)))).toBe(true);
    expect(decoder.push(delta("b"))).toBe(false);
    expect(onTextDelta).toHaveBeenCalledTimes(1);

    const total = createMetabloomSegmentStreamDecoder({ allowMultiple: true, onTextDelta });
    expect(total.push(input)).toBe(true);
    for (let index = 0; index < 3; index++) {
      const text = "x".repeat(1600);
      expect(total.push(delta(text, index) + segment(text, index))).toBe(true);
    }
    onTextDelta.mockClear();
    expect(total.push(delta("Too much", 3))).toBe(false);
    expect(onTextDelta).not.toHaveBeenCalled();
  });

  test("the selected paragraph limit also applies to a new provisional paragraph", () => {
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: false });
    expect(decoder.push(input + segment("One paragraph"))).toBe(true);
    expect(decoder.push(delta("A second paragraph", 1))).toBe(false);

    const reply = createMetabloomReplySession({ onUpdate: jest.fn() });
    reply.append({ response: "One paragraph" }, 0);
    expect(() => reply.appendText("A second paragraph", 1)).toThrow();
    expect(reply.snapshot().content).toBe("One paragraph");
  });

  test("legacy complete segments still finish without delta callbacks", () => {
    const onTextDelta = jest.fn();
    const v2 = createMetabloomSegmentStreamDecoder({ onTextDelta });
    expect(v2.push(input + segment("Complete answer") + textComplete + finalReaction + done)).toBe(true);
    expect(v2.finish()).toEqual({ ok: true, value: envelope("Complete answer") });
    const v1 = createMetabloomSegmentStreamDecoder({ onTextDelta });
    const oldSegment = { emote: "warm", response: "Legacy answer" };
    expect(v1.push(record({ type: "segment", index: 0, ...oldSegment })
      + record({ type: "done", version: "1.0.0" }))).toBe(true);
    expect(v1.finish()).toEqual({ ok: true, value: { version: "1.0.0", segments: [oldSegment] } });
    expect(onTextDelta).not.toHaveBeenCalled();
  });
});

describe("progressive Metabloom HTTP delivery", () => {
  const previousDecoder = global.TextDecoder;
  beforeAll(() => { global.TextDecoder = TextDecoder; });
  afterAll(() => { global.TextDecoder = previousDecoder; });

  test("the UI callback receives decoded text while the HTTP body and paragraph are still open", async () => {
    const io = transport();
    const onTextDelta = jest.fn();
    const onSegment = jest.fn();
    let settled = false;
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onTextDelta, onSegment });
    request.then(() => { settled = true; }, () => { settled = true; });
    await flush();
    expect(JSON.parse(io.fetchImpl.mock.calls[0][1].body)).toMatchObject({ streamText: true });
    await io.send(input + delta("A growing"));
    expect(onTextDelta).toHaveBeenCalledWith("A growing", 0);
    expect(onSegment).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    const emoji = new TextEncoder().encode(delta(" thought 🪴."));
    for (const byte of emoji) await io.sendBytes(Uint8Array.of(byte));
    expect(onTextDelta).toHaveBeenLastCalledWith(" thought 🪴.", 0);
    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    await io.send(segment("A growing thought 🪴.") + textComplete + finalReaction + done);
    await io.close();
    await expect(request).resolves.toEqual(envelope("A growing thought 🪴."));
    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(io.reader.cancel).toHaveBeenCalledTimes(1);
    expect(io.reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  test("cancellation suppresses later deltas and releases the body reader", async () => {
    const io = transport();
    const controller = new AbortController();
    const onTextDelta = jest.fn();
    const request = requestMetabloomResponse({
      fetchImpl: io.fetchImpl, message: "Hello", onTextDelta, signal: controller.signal,
    });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input + delta("Visible prefix"));
    controller.abort();
    await io.send(delta(" must not appear"));
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onTextDelta.mock.calls).toEqual([["Visible prefix", 0]]);
    expect(io.reader.cancel).toHaveBeenCalled();
    expect(io.reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  test("the HTTP byte budget accepts a full reply delivered through thousands of small deltas", async () => {
    const io = transport();
    const onTextDelta = jest.fn();
    const responses = ["a".repeat(1600), "b".repeat(1600), "c".repeat(1600)];
    const records = [input];
    responses.forEach((text, index) => {
      for (const character of text) records.push(delta(character, index));
      records.push(segment(text, index));
    });
    records.push(textComplete, finalReaction, done);
    const request = requestMetabloomResponse({
      fetchImpl: io.fetchImpl, message: "Give a full explanation", allowMultiple: true, onTextDelta,
    });
    await flush();
    await io.send(records.join(""));
    expect(onTextDelta).toHaveBeenCalledTimes(4800);
    await io.close();
    await expect(request).resolves.toEqual(envelope(...responses));
  });

  test("an EOF inside a paragraph rejects without discarding the delivered prefix", async () => {
    const io = transport();
    const onTextDelta = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onTextDelta, optional: true });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input + delta("An unfinished answer"));
    await io.close();
    expect(await failure).toMatchObject({ code: "invalid_response" });
    expect(onTextDelta.mock.calls).toEqual([["An unfinished answer", 0]]);
  });
});
