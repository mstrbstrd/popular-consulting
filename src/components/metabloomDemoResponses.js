import { METABLOOM_PROTOCOL_VERSION } from "./metabloomEmoteLibrary";

const DEMOS = Object.freeze([
  Object.freeze({
    id: "whimsy",
    prompt: "Show me a whimsical response",
    segments: Object.freeze([
      Object.freeze({
        emote: "whimsy",
        response: "A useful idea can arrive sideways: what if the interface treats uncertainty as a place to explore, rather than something to hide?",
      }),
    ]),
  }),
  Object.freeze({
    id: "reflective",
    prompt: "Give me a reflective response",
    segments: Object.freeze([
      Object.freeze({
        emote: "reflective",
        response: "The important question may not be what the system can do, but what kind of attention it encourages from the person using it.",
      }),
    ]),
  }),
  Object.freeze({
    id: "reassuring",
    prompt: "Offer a reassuring response",
    segments: Object.freeze([
      Object.freeze({
        emote: "reassuring",
        response: "We can make this dependable by keeping the emotional vocabulary small, legible, and consistent across every response.",
      }),
    ]),
  }),
  Object.freeze({
    id: "stream",
    prompt: "Demo a two-part emotional stream",
    segments: Object.freeze([
      Object.freeze({
        emote: "whimsy",
        response: "Start with a playful possibility: the avatar can react like punctuation, not performance.",
      }),
      Object.freeze({
        emote: "reflective",
        response: "Then let the response settle into thought, so the physical change follows the meaning instead of competing with it.",
      }),
    ]),
  }),
]);

export const METABLOOM_DEMOS = DEMOS;
export const METABLOOM_DEMO_PROMPTS = Object.freeze(
  DEMOS.map(({ prompt }) => prompt),
);

const cloneSegments = (segments) =>
  segments.map(({ emote, response }) => ({ emote, response }));

export const resolveMetabloomDemo = (message) => {
  const normalized = typeof message === "string"
    ? message.trim().toLowerCase()
    : "";
  const exact = DEMOS.find(
    ({ prompt }) => prompt.toLowerCase() === normalized,
  );
  if (exact) return exact;
  if (/celebrat|small win|progress|success/.test(normalized)) {
    return {
      id: "celebratory-fallback",
      segments: [{
        emote: "celebratory",
        response: "That is real progress. That is worth celebrating, and worth understanding so we can build on it.",
      }],
    };
  }
  if (/worr|concern|difficult|hard|risk/.test(normalized)) {
    return {
      id: "concerned-fallback",
      segments: [{
        emote: "concerned",
        response: "That concern deserves to be taken seriously. We can separate the immediate risk from the assumptions around it and work through both carefully.",
      }],
    };
  }
  if (/why|think|reflect|consider|nuance/.test(normalized)) {
    return DEMOS.find(({ id }) => id === "reflective");
  }
  if (/idea|creative|play|imagin|whim/.test(normalized)) {
    return DEMOS.find(({ id }) => id === "whimsy");
  }
  return {
    id: "warm-fallback",
    segments: [{
      emote: "warm",
      response: "This local demo is ready. Add the server-side API key to replace the hardwired response while keeping the same bounded emote protocol.",
    }],
  };
};

export const createMetabloomDemoEnvelope = (message) => {
  const demo = resolveMetabloomDemo(message);
  return {
    version: METABLOOM_PROTOCOL_VERSION,
    segments: cloneSegments(demo.segments),
  };
};
