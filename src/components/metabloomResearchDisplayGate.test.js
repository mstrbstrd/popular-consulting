import { createMetabloomResearchDisplayGate, RESEARCH_REVEAL_GRAPHEMES_PER_FRAME } from "./metabloomResearchDisplayGate";
import { MAX_METABLOOM_EMOTE_RESPONSE_CHARS, MAX_METABLOOM_EMOTE_TOTAL_CHARS } from "./metabloomEmoteLibrary";

const snapshot = (responses, status = "streaming") => ({
  segments: responses.map((response) => typeof response === "string" ? { response } : response),
  content: responses.map((response) => typeof response === "string" ? response : response.response).join("\n\n"),
  emote: "neutral", status,
});
const setup = () => {
  const updates = [];
  const callbacks = new Map();
  let nextFrame = 0;
  const onFirstContent = jest.fn();
  const gate = createMetabloomResearchDisplayGate({
    onUpdate: (value) => updates.push(value), onFirstContent,
    requestFrame: (callback) => { callbacks.set(++nextFrame, callback); return nextFrame; },
    cancelFrame: (id) => callbacks.delete(id),
  });
  const frame = () => {
    const pending = [...callbacks.entries()];
    callbacks.clear();
    pending.forEach(([, callback]) => callback());
  };
  const drain = () => {
    let count = 0;
    while (callbacks.size && count++ < 1000) frame();
    expect(callbacks.size).toBe(0);
  };
  return { gate, updates, callbacks, onFirstContent, frame, drain };
};

test("ordinary replies retain their immediate updates and reactions", () => {
  const { gate, updates, callbacks } = setup();
  const react = jest.fn();
  const done = jest.fn();
  gate.update(snapshot(["Ordinary content"]));
  gate.deferReaction("response", react);
  gate.update(snapshot(["Ordinary content"], "complete"));
  gate.complete(done);
  expect(updates[0].content).toBe("Ordinary content");
  expect(updates[1].status).toBe("complete");
  expect(react).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(0);
});

test("a completed reply remains hidden until release and drains before final status, emote, and completion", () => {
  const { gate, updates, onFirstContent, frame, drain } = setup();
  const response = "A complete answer with several details. ".repeat(20);
  const react = jest.fn(() => expect(updates.at(-1)).toMatchObject({ content: response, status: "complete" }));
  const done = jest.fn(() => expect(react).toHaveBeenCalledTimes(1));
  gate.hold();
  gate.update(snapshot([response.slice(0, 20)]), { incremental: true });
  gate.update(snapshot([response]));
  gate.deferReaction("response", react);
  gate.update(snapshot([response], "complete"));
  gate.complete(done);
  expect(onFirstContent).toHaveBeenCalledTimes(1);
  expect(updates).toHaveLength(0);
  expect(gate.bufferedChars).toBe(response.length);
  gate.release();
  expect(updates).toHaveLength(0);
  frame();
  expect(updates).toHaveLength(0);
  frame();
  expect(updates.at(-1)).toMatchObject({ content: response.slice(0, RESEARCH_REVEAL_GRAPHEMES_PER_FRAME), status: "streaming" });
  expect(react).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  frame();
  expect(updates.at(-1).content.length).toBeGreaterThan(RESEARCH_REVEAL_GRAPHEMES_PER_FRAME);
  expect(updates.at(-1).content.length).toBeLessThan(response.length);
  drain();
  expect(done).toHaveBeenCalledTimes(1);
  expect(gate.phase).toBe("complete");
  expect(gate.bufferedChars).toBe(0);
});

test("coalesced updates preserve paragraphs, Unicode graphemes, and legacy commits", () => {
  const { gate, updates, frame, drain } = setup();
  const first = "👨🏽‍👩🏾‍👧🏻‍👦🏿 cafe\u0301 🇨🇦 ".repeat(8);
  const second = "A second paragraph 🪴.";
  const complete = snapshot([{ response: first, emote: "reflective" }, { response: second, emote: "warm" }], "complete");
  gate.hold();
  gate.update(snapshot([{ response: first, emote: "reflective" }]));
  gate.update(complete);
  gate.complete(jest.fn());
  gate.release();
  frame();
  frame();
  expect(updates.at(-1).segments).toHaveLength(1);
  expect(updates.at(-1).segments[0].emote).toBeUndefined();
  expect(updates.at(-1).content).not.toMatch(/[\uD800-\uDBFF]$/);
  drain();
  expect(updates.at(-1)).toEqual(complete);
});

test("after catch-up only real deltas are immediate; a later whole paragraph still reveals over frames", () => {
  const { gate, updates, frame, drain, callbacks } = setup();
  gate.hold();
  gate.update(snapshot(["First"]), { incremental: true });
  gate.release();
  drain();
  expect(gate.phase).toBe("live");
  gate.update(snapshot(["First live delta"]), { incremental: true });
  expect(updates.at(-1).content).toBe("First live delta");
  expect(callbacks.size).toBe(0);
  const paragraph = "A later complete paragraph. ".repeat(30);
  gate.update(snapshot(["First live delta", paragraph]));
  expect(updates.at(-1).content).toBe("First live delta");
  frame();
  expect(updates.at(-1).segments[1].response.length).toBe(RESEARCH_REVEAL_GRAPHEMES_PER_FRAME);
  expect(updates.at(-1).segments[1].response).not.toBe(paragraph);
  drain();
  expect(updates.at(-1).content).toBe(`First live delta\n\n${paragraph}`);
});

test("an unfinished surrogate waits without spinning frames and resumes correctly", () => {
  const { gate, updates, frame, callbacks, drain } = setup();
  gate.hold();
  gate.update(snapshot(["\uD83E"]), { incremental: true });
  gate.release();
  frame();
  frame();
  expect(updates).toHaveLength(0);
  expect(callbacks.size).toBe(0);
  gate.update(snapshot(["\uD83E\uDEB4"]), { incremental: true });
  drain();
  expect(updates.at(-1).content).toBe("🪴");
  expect(gate.phase).toBe("live");
});

test.each(["interrupted", "error"])("%s preserves only the visible prefix and drops queued effects and completion", (reason) => {
  const { gate, updates, frame, callbacks } = setup();
  const response = "Only part of this complete reply should appear. ".repeat(20);
  const react = jest.fn();
  const done = jest.fn();
  gate.hold();
  gate.update(snapshot([response], "complete"));
  gate.deferReaction("response", react);
  gate.complete(done);
  gate.release();
  frame();
  frame();
  const prefix = updates.at(-1).content;
  gate.cancel(reason);
  expect(callbacks.size).toBe(0);
  expect(updates.at(-1)).toMatchObject({ content: prefix, status: reason });
  expect(gate.update(snapshot(["Late text"]))).toBe(false);
  expect(gate.release()).toBe(false);
  expect(react).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
});

test("cancelling before release publishes no hidden text", () => {
  const { gate, updates, callbacks } = setup();
  gate.hold();
  gate.update(snapshot(["Never display this"]));
  gate.cancel();
  expect(updates).toHaveLength(0);
  expect(callbacks.size).toBe(0);
  expect(gate.bufferedChars).toBe(0);
});

test("snapshots and deferred effects stay within the existing semantic limits", () => {
  const { gate, drain } = setup();
  gate.hold();
  expect(() => gate.update(snapshot(["x".repeat(MAX_METABLOOM_EMOTE_RESPONSE_CHARS + 1)]))).toThrow("limit");
  expect(() => gate.update(snapshot(Array(4).fill("x".repeat(MAX_METABLOOM_EMOTE_RESPONSE_CHARS))))).toThrow("limit");
  const total = ["x".repeat(1600), "y".repeat(1600), "z".repeat(1600)];
  gate.update(snapshot(total));
  expect(gate.bufferedChars).toBe(MAX_METABLOOM_EMOTE_TOTAL_CHARS);
  const react = jest.fn();
  for (let index = 0; index < 5; index++) expect(gate.deferReaction(`reaction-${index}`, react)).toBe(true);
  expect(gate.deferReaction("overflow", react)).toBe(false);
  expect(gate.deferReaction("reaction-0", react)).toBe(false);
  gate.release();
  drain();
  expect(gate.bufferedChars).toBe(0);
});
