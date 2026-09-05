import {
  METABLOOM_EMOTE_IDS,
  METABLOOM_EMOTE_RESPONSE_SCHEMA,
  METABLOOM_EMOTES,
  buildMetabloomSystemPrompt,
  resolveMetabloomEmote,
} from "./metabloomEmoteLibrary";

describe("Metabloom emote library", () => {
  test("publishes a compact frozen semantic enum", () => {
    expect(METABLOOM_EMOTE_IDS).toEqual([
      "neutral",
      "warm",
      "whimsy",
      "reflective",
      "curious",
      "reassuring",
      "concerned",
      "celebratory",
      "resolute",
    ]);
    expect(Object.isFrozen(METABLOOM_EMOTES)).toBe(true);
    expect(new Set(METABLOOM_EMOTE_IDS).size).toBe(
      METABLOOM_EMOTE_IDS.length,
    );
  });

  test("keeps raw motion controls out of the model schema", () => {
    const serialized = JSON.stringify(METABLOOM_EMOTE_RESPONSE_SCHEMA);
    expect(serialized).toContain("whimsy");
    expect(serialized).not.toContain("intensity");
    expect(serialized).not.toContain("duration");
    expect(serialized).not.toContain("action");
  });

  test("builds single and multi-segment system prompt modes", () => {
    expect(buildMetabloomSystemPrompt()).toContain("exactly one segment");
    expect(
      buildMetabloomSystemPrompt({ allowMultiple: true }),
    ).toContain("genuinely changes emotional or rhetorical stance");
    expect(buildMetabloomSystemPrompt()).toContain("reflective:");
  });

  test("resolves only exact enum values", () => {
    expect(resolveMetabloomEmote("whimsy")?.action).toBe("surprised");
    expect(resolveMetabloomEmote("Whimsy")).toBeNull();
    expect(resolveMetabloomEmote("unknown")).toBeNull();
  });
});
