import { ReadableStream } from "stream/web";
import { TextDecoder, TextEncoder } from "util";
import { requestMetabloomResponse } from "./metabloomApiClient";
import { createMetabloomSegmentStreamDecoder } from "./metabloomEmoteProtocol";

const record = (value) => `${JSON.stringify(value)}\n`;
const input = record({ type: "emote", phase: "input", emote: "curious" });
const action = (value) => record({ type: "action", action: value });
const delta = (value) => record({ type: "text_delta", index: 0, delta: value });
const segment = (response = "A complete answer.") => record({ type: "segment", index: 0, response });
const textComplete = record({ type: "text_complete" });
const finalReaction = record({ type: "emote", phase: "response", emote: "resolute" });
const done = record({ type: "done", version: "2.0.0" });
const completion = segment() + textComplete + finalReaction + done;
const envelope = { version: "2.0.0", segments: [{ response: "A complete answer." }] };
const legacySegment = { emote: "warm", response: "A legacy answer." };
const legacyEnvelope = { version: "1.0.0", segments: [legacySegment] };
const legacy = record({ type: "segment", index: 0, ...legacySegment })
  + record({ type: "done", version: "1.0.0" });
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

// Bytes arrive through an actual open stream, without timers or a buffered body.
const transport = () => {
  let controller;
  const cancel = jest.fn();
  const body = new ReadableStream({
    start(value) { controller = value; },
    cancel,
  });
  return {
    body,
    cancel,
    fetchImpl: jest.fn(async () => ({
      ok: true,
      headers: { get: () => "application/x-ndjson" },
      body,
    })),
    async send(text) {
      controller.enqueue(new TextEncoder().encode(text));
      await flush();
    },
    async close() { controller.close(); await flush(); },
  };
};

describe("Metabloom scene action protocol", () => {
  test.each(["none", "deep-research", "under-the-hood"])("dispatches %s once before text and retains terminal validation", (choice) => {
    const events = [];
    const onDone = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({
      onReaction: (value) => events.push(["reaction", value.phase, value.emote]),
      onAction: (value) => events.push(["action", value]),
      onTextDelta: (value) => events.push(["text", value]),
      onDone,
    });

    expect(decoder.push(input + action(choice) + delta("A complete"))).toBe(true);
    expect(events).toEqual([
      ["reaction", "input", "curious"],
      ["action", choice],
      ["text", "A complete"],
    ]);
    expect(decoder.getState().completed).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(decoder.push(delta(" answer.") + segment() + textComplete + finalReaction)).toBe(true);
    expect(events.filter(([type]) => type === "action")).toEqual([["action", choice]]);
    expect(events.filter(([type]) => type === "reaction")).toHaveLength(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(decoder.push(done)).toBe(true);
    expect(onDone).toHaveBeenCalledWith(envelope);
    expect(decoder.finish()).toEqual({ ok: true, value: envelope });
  });

  test.each([
    ["unknown action", input, action("deep-research-diving")],
    ["non-string action", input, action(1)],
    ["extra fields", input, record({ type: "action", action: "deep-research", extra: true })],
    ["duplicate action", input + action("none"), action("deep-research")],
    ["before the input emote", "", action("deep-research")],
    ["after provisional text", input + delta("An opening"), action("deep-research")],
    ["after a complete segment", input + segment(), action("under-the-hood")],
    ["after text completion", input + segment() + textComplete, action("deep-research")],
    ["inside a legacy stream", record({ type: "segment", index: 0, ...legacySegment }), action("under-the-hood")],
    ["after terminal completion", input + completion, action("deep-research")],
  ])("rejects %s without dispatching that action", (_name, prefix, invalid) => {
    const onAction = jest.fn();
    const decoder = createMetabloomSegmentStreamDecoder({ onAction });
    expect(decoder.push(prefix)).toBe(true);
    const callsBeforeInvalid = onAction.mock.calls.length;
    expect(decoder.push(invalid)).toBe(false);
    expect(onAction).toHaveBeenCalledTimes(callsBeforeInvalid);
    expect(decoder.push(action("under-the-hood") + completion)).toBe(false);
    expect(onAction).toHaveBeenCalledTimes(callsBeforeInvalid);
    expect(decoder.finish().ok).toBe(false);
  });

  test("v1 and v2 streams without action records retain their original envelopes", () => {
    const onAction = jest.fn();
    const v1 = createMetabloomSegmentStreamDecoder({ onAction });
    expect(v1.push(legacy)).toBe(true);
    expect(v1.finish()).toEqual({ ok: true, value: legacyEnvelope });
    const v2 = createMetabloomSegmentStreamDecoder({ onAction });
    expect(v2.push(input + completion)).toBe(true);
    expect(v2.finish()).toEqual({ ok: true, value: envelope });
    expect(onAction).not.toHaveBeenCalled();
  });

  test("an action cannot replace text completion, the final emote, or the done record", () => {
    const incomplete = [
      segment() + finalReaction + done,
      segment() + textComplete + done,
      segment() + textComplete + finalReaction,
    ];
    for (const ending of incomplete) {
      const onDone = jest.fn();
      const onReaction = jest.fn();
      const decoder = createMetabloomSegmentStreamDecoder({ onDone, onReaction });
      expect(decoder.push(input + action("deep-research"))).toBe(true);
      decoder.push(ending);
      expect(decoder.finish().ok).toBe(false);
      expect(onDone).not.toHaveBeenCalled();
      expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
    }
  });
});

describe("Metabloom scene action HTTP delivery", () => {
  const previousDecoder = global.TextDecoder;
  beforeAll(() => { global.TextDecoder = TextDecoder; });
  afterAll(() => { global.TextDecoder = previousDecoder; });

  test("defaults to auto and starts the action while the stream and paragraph remain open", async () => {
    const io = transport();
    const events = [];
    const onSegment = jest.fn();
    let settled = false;
    const request = requestMetabloomResponse({
      fetchImpl: io.fetchImpl,
      message: "Take a deep dive into this topic.",
      onReaction: ({ phase }) => events.push(phase),
      onAction: (value) => events.push(value),
      onTextDelta: (value) => events.push(value),
      onSegment,
    });
    request.then(() => { settled = true; }, () => { settled = true; });
    await flush();
    expect(JSON.parse(io.fetchImpl.mock.calls[0][1].body)).toMatchObject({ actionMode: "auto", streamText: true });

    await io.send(input + action("deep-research") + delta("A complete"));
    expect(events).toEqual(["input", "deep-research", "A complete"]);
    expect(onSegment).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(io.body.locked).toBe(true);

    await io.send(delta(" answer.") + segment() + textComplete + finalReaction);
    expect(events).toEqual(["input", "deep-research", "A complete", " answer."]);
    expect(settled).toBe(false);
    await io.send(done);
    expect(events[events.length - 1]).toBe("response");
    await io.close();
    await expect(request).resolves.toEqual(envelope);
    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(io.body.locked).toBe(false);
  });

  test.each(["none", "deep-research", "under-the-hood"])("sends explicit %s mode and forwards its action as a string", async (choice) => {
    const io = transport();
    const onAction = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", actionMode: choice, onAction });
    await flush();
    expect(JSON.parse(io.fetchImpl.mock.calls[0][1].body).actionMode).toBe(choice);
    await io.send(input + action(choice) + completion);
    await io.close();
    await expect(request).resolves.toEqual(envelope);
    expect(onAction.mock.calls).toEqual([[choice]]);
  });

  test("rejects an invalid requested mode before making an HTTP request", async () => {
    const fetchImpl = jest.fn();
    await expect(requestMetabloomResponse({ fetchImpl, message: "Hello", actionMode: "deep-research-diving" }))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("cancellation rejects a later action and releases the open body", async () => {
    const io = transport();
    const controller = new AbortController();
    const onAction = jest.fn();
    const onSegment = jest.fn();
    const request = requestMetabloomResponse({
      fetchImpl: io.fetchImpl, message: "Hello", signal: controller.signal, onAction, onSegment,
    });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input);
    controller.abort();
    await io.send(action("under-the-hood") + completion);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onAction).not.toHaveBeenCalled();
    expect(onSegment).not.toHaveBeenCalled();
    expect(io.cancel).toHaveBeenCalledTimes(1);
    expect(io.body.locked).toBe(false);
  });

  test("an input callback can cancel an action already queued in the same byte chunk", async () => {
    const io = transport();
    const controller = new AbortController();
    const onAction = jest.fn();
    const onTextDelta = jest.fn();
    const onReaction = jest.fn(() => controller.abort());
    const request = requestMetabloomResponse({
      fetchImpl: io.fetchImpl, message: "Hello", signal: controller.signal,
      onReaction, onAction, onTextDelta,
    });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input + action("deep-research") + delta("A complete answer.") + completion);
    expect(await failure).toMatchObject({ code: "cancelled" });
    expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
    expect(onAction).not.toHaveBeenCalled();
    expect(onTextDelta).not.toHaveBeenCalled();
    expect(io.body.locked).toBe(false);
  });

  test("a malformed record prevents later actions in the same chunk from running", async () => {
    const io = transport();
    const onAction = jest.fn();
    const onReaction = jest.fn();
    const onSegment = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onAction, onReaction, onSegment });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input + record({ type: "text_delta", index: 0, delta: 17 }) + action("deep-research") + completion);
    expect(await failure).toMatchObject({ code: "invalid_response" });
    expect(onAction).not.toHaveBeenCalled();
    expect(onSegment).not.toHaveBeenCalled();
    expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
    expect(io.body.locked).toBe(false);
  });

  test.each([legacyEnvelope, envelope])("JSON compatibility remains action-free for version $version", async (value) => {
    const onAction = jest.fn();
    const onSegment = jest.fn();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(value),
    }));
    await expect(requestMetabloomResponse({ fetchImpl, message: "Hello", onAction, onSegment })).resolves.toEqual(value);
    expect(onAction).not.toHaveBeenCalled();
    expect(onSegment.mock.calls).toEqual([[value.segments[0], 0]]);
  });

  test("EOF after a valid action still rejects an unfinished reply", async () => {
    const io = transport();
    const onAction = jest.fn();
    const onReaction = jest.fn();
    const request = requestMetabloomResponse({ fetchImpl: io.fetchImpl, message: "Hello", onAction, onReaction });
    const failure = request.catch((error) => error);
    await flush();
    await io.send(input + action("deep-research") + segment() + textComplete + finalReaction);
    await io.close();
    expect(await failure).toMatchObject({ code: "invalid_response" });
    expect(onAction.mock.calls).toEqual([["deep-research"]]);
    expect(onReaction.mock.calls).toEqual([[{ phase: "input", emote: "curious" }]]);
    expect(io.body.locked).toBe(false);
  });
});
