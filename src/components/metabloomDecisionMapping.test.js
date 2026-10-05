import {
  METABLOOM_REACTION_QUESTION, METABLOOM_DECISION_SCHEMA,
  resolveMetabloomDecision, parseMetabloomActivity,
} from "./metabloomDecisionMapping";
import { METABLOOM_EMOTE_IDS } from "./metabloomEmoteLibrary";

test("a decision model can choose every primitive or authored chain", () => {
  expect(Object.keys(METABLOOM_REACTION_QUESTION.criteria)).toEqual(METABLOOM_EMOTE_IDS);
  expect(METABLOOM_REACTION_QUESTION.type).toBe("choice");
  expect(METABLOOM_DECISION_SCHEMA.properties.choice.enum).toEqual(METABLOOM_EMOTE_IDS);
  expect(resolveMetabloomDecision({ choice: "support-and-reassure", confidence: 0.7 })).toBe("support-and-reassure");
  expect(resolveMetabloomDecision({ choice: "warm", confidence: 1 })).toBe("warm");
});

test.each([
  null, [], {}, { choice: "warm" },
  { choice: "constructor", confidence: 1 },
  { choice: "warm", confidence: 0.69 },
  { choice: "warm", confidence: 1.1 },
  { choice: "warm", confidence: NaN },
  { choice: "warm", confidence: "0.9" },
  { choice: "warm", confidence: 0.9, duration: 999999 },
])("uncertain or invalid decision %j settles to neutral", (decision) => {
  expect(resolveMetabloomDecision(decision)).toBe("neutral");
});

test.each([
  null, {}, [], { activity: "idle", state: "running" },
  { activity: "constructor", state: "running" },
  { activity: ["analysis"], state: "running" },
  { activity: "deep-research", state: "planned" },
  { activity: "deep-research", state: "running", mode: 4 },
])("invalid or merely planned activity %j cannot change the scene", (event) => {
  expect(parseMetabloomActivity(event)).toBeNull();
});

test("only known activity lifecycle events are accepted", () => {
  expect(parseMetabloomActivity({ activity: "deep-research", state: "running" }))
    .toEqual({ activity: "deep-research", state: "running" });
  expect(parseMetabloomActivity({ activity: "analysis", state: "complete" }))
    .toEqual({ activity: "analysis", state: "complete" });
});
