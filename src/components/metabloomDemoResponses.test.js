import {
  METABLOOM_DEMO_PROMPTS,
  createMetabloomDemoEnvelope,
} from "./metabloomDemoResponses";

describe("Metabloom hardwired demos", () => {
  test("provides three single-emote demos and one stream demo", () => {
    expect(METABLOOM_DEMO_PROMPTS).toHaveLength(4);
    const single = createMetabloomDemoEnvelope(
      "Show me a whimsical response",
    );
    expect(single.segments).toEqual([
      expect.objectContaining({ emote: "whimsy" }),
    ]);
    const stream = createMetabloomDemoEnvelope(
      "Demo a two-part emotional stream",
    );
    expect(stream.segments.map(({ emote }) => emote)).toEqual([
      "whimsy",
      "reflective",
    ]);
  });
});
