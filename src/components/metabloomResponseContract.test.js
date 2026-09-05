import {
  MAX_METABLOOM_ACTION_STEPS,
  MAX_METABLOOM_CHAIN_DURATION_MS,
  MAX_METABLOOM_RESPONSE_CHARS,
  METABLOOM_MODEL_RESPONSE_SCHEMA,
  createMetabloomPreviewResponse,
  parseMetabloomModelResponse,
} from "./metabloomResponseContract";
import { METABLOOM_ACTION_IDS } from "./metabloomActions";

describe("Metabloom model response contract", () => {
  test("publishes exactly one response field and one action chain field", () => {
    expect(METABLOOM_MODEL_RESPONSE_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["response", "actionChain"],
    });
    expect(Object.keys(METABLOOM_MODEL_RESPONSE_SCHEMA.properties)).toEqual([
      "response",
      "actionChain",
    ]);
    expect(
      METABLOOM_MODEL_RESPONSE_SCHEMA.properties.actionChain.items.properties
        .action.enum,
    ).toEqual(METABLOOM_ACTION_IDS);
  });

  test("normalizes a valid object and safely reforms the field at the end", () => {
    const parsed = parseMetabloomModelResponse({
      response: "I agree with that direction.",
      actionChain: [
        { action: "thinking", duration: 700, talking: false },
        { action: "agree", talking: true },
      ],
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        response: "I agree with that direction.",
        actionChain: [
          {
            action: "thinking",
            duration: 700,
            intensity: 0.46,
            talking: false,
          },
          {
            action: "agree",
            duration: 920,
            intensity: 0.46,
            talking: true,
          },
          {
            action: "reform",
            duration: 980,
            intensity: 0,
            talking: false,
          },
        ],
      },
    });
  });

  test("accepts JSON text and preserves an explicit final reform action", () => {
    const parsed = parseMetabloomModelResponse(
      JSON.stringify({
        response: "A compact response.",
        actionChain: [
          { action: "happy", duration: 600 },
          { action: "reform", duration: 500 },
        ],
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.value.actionChain).toEqual([
      {
        action: "happy",
        duration: 600,
        intensity: 0.44,
        talking: true,
      },
      {
        action: "reform",
        duration: 500,
        intensity: 0,
        talking: false,
      },
    ]);
  });

  test("rejects unsupported fields, aliases, and malformed action values", () => {
    expect(
      parseMetabloomModelResponse({
        response: "No hidden fields.",
        actionChain: [{ action: "agree" }],
        systemPrompt: "not allowed",
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Aliases are not part of the strict model schema.",
        actionChain: [{ action: "curious" }],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "No unknown step fields.",
        actionChain: [{ action: "agree", strength: 100 }],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Durations remain bounded.",
        actionChain: [{ action: "agree", duration: 90000 }],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Intensity remains bounded.",
        actionChain: [{ action: "agree", intensity: 1.01 }],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Intensity must remain finite.",
        actionChain: [{ action: "agree", intensity: Number.NaN }],
      }),
    ).toMatchObject({ ok: false });
  });

  test("rejects oversized response text and unbounded chains", () => {
    expect(
      parseMetabloomModelResponse({
        response: "x".repeat(MAX_METABLOOM_RESPONSE_CHARS + 1),
        actionChain: [{ action: "reform" }],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Too many actions.",
        actionChain: Array.from(
          { length: MAX_METABLOOM_ACTION_STEPS + 1 },
          () => ({ action: "agree" }),
        ),
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseMetabloomModelResponse({
        response: "Too much total motion.",
        actionChain: Array.from({ length: 5 }, () => ({
          action: "happy",
          duration: Math.floor(MAX_METABLOOM_CHAIN_DURATION_MS / 4),
        })),
      }),
    ).toMatchObject({ ok: false });
  });

  test("rejects invalid JSON without exposing parser internals", () => {
    const parsed = parseMetabloomModelResponse('{"response":');

    expect(parsed).toEqual({
      ok: false,
      error: "The model response was not valid JSON.",
    });
  });

  test("keeps the local review response inside the production contract", () => {
    const preview = createMetabloomPreviewResponse("Celebrate a small win");
    const parsed = parseMetabloomModelResponse(preview);

    expect(parsed.ok).toBe(true);
    expect(parsed.value.response).toMatch(/worth celebrating/i);
    expect(parsed.value.actionChain.map((step) => step.action)).toEqual([
      "excited",
      "happy",
      "agree",
      "reform",
    ]);
  });
});
