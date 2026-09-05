import {
  createMetabloomSegmentStreamDecoder,
  parseMetabloomEmoteEnvelope,
} from "./metabloomEmoteProtocol";

describe("Metabloom emote response protocol", () => {
  test("normalizes a single emote and response pair", () => {
    const result = parseMetabloomEmoteEnvelope({
      emote: "reflective",
      response: "  Let us look at the assumption underneath this.  ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        version: "1.0.0",
        segments: [{
          emote: "reflective",
          response: "Let us look at the assumption underneath this.",
        }],
      },
    });
  });

  test("rejects unknown emotes and unknown fields", () => {
    expect(parseMetabloomEmoteEnvelope({
      emote: "chaotic",
      response: "No.",
    }).ok).toBe(false);
    expect(parseMetabloomEmoteEnvelope({
      emote: "warm",
      response: "Hello.",
      intensity: 1,
    }).ok).toBe(false);
  });

  test("decodes split NDJSON chunks in strict order", () => {
    const received = [];
    const decoder = createMetabloomSegmentStreamDecoder({
      onSegment: (segment) => received.push(segment),
    });
    expect(decoder.push('{"type":"segment","index":0,"emote":"whim')).toBe(true);
    expect(decoder.push('sy","response":"A playful start."}\n')).toBe(true);
    expect(decoder.push('{"type":"segment","index":1,"emote":"reflective","response":"A considered finish."}\n')).toBe(true);
    expect(decoder.push('{"type":"done","version":"1.0.0"}\n')).toBe(true);
    const result = decoder.finish();
    expect(result.ok).toBe(true);
    expect(received).toEqual([
      { emote: "whimsy", response: "A playful start." },
      { emote: "reflective", response: "A considered finish." },
    ]);
  });

  test("fails closed on malformed or out-of-order events", () => {
    const malformed = createMetabloomSegmentStreamDecoder();
    expect(malformed.push("{not-json}\n")).toBe(false);
    expect(malformed.finish().ok).toBe(false);

    const outOfOrder = createMetabloomSegmentStreamDecoder();
    expect(outOfOrder.push(
      '{"type":"segment","index":1,"emote":"warm","response":"Hello."}\n',
    )).toBe(false);
  });
});
