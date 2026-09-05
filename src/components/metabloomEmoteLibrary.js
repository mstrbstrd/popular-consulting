const protocol = require("./metabloomProtocol.json");

const EMOTE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const rawEmotes = Array.isArray(protocol.emotes) ? protocol.emotes : [];
const seenIds = new Set();

const normalizedEmotes = rawEmotes.map((entry) => {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!EMOTE_ID_PATTERN.test(id) || seenIds.has(id)) {
    throw new Error(`Invalid or duplicate Metabloom emote id: ${id || "<empty>"}`);
  }
  seenIds.add(id);

  const duration = Number(entry.duration);
  const intensity = Number(entry.intensity);
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error(`Invalid duration for Metabloom emote: ${id}`);
  }
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
    throw new Error(`Invalid intensity for Metabloom emote: ${id}`);
  }

  return deepFreeze({
    id,
    label: String(entry.label || id),
    description: String(entry.description || ""),
    action: typeof entry.action === "string" ? entry.action : null,
    duration: Math.round(duration),
    intensity,
  });
});

if (normalizedEmotes.length === 0) {
  throw new Error("Metabloom requires at least one emote definition.");
}

const METABLOOM_PROTOCOL_VERSION = protocol.version;
const MAX_METABLOOM_EMOTE_SEGMENTS = protocol.maxSegments;
const MAX_METABLOOM_EMOTE_RESPONSE_CHARS = protocol.maxResponseChars;
const MAX_METABLOOM_EMOTE_TOTAL_CHARS = protocol.maxTotalResponseChars;
const METABLOOM_EMOTES = deepFreeze(normalizedEmotes);
const METABLOOM_EMOTE_IDS = Object.freeze(
  METABLOOM_EMOTES.map(({ id }) => id),
);

const EMOTE_BY_ID = Object.freeze(
  Object.fromEntries(METABLOOM_EMOTES.map((entry) => [entry.id, entry])),
);

const resolveMetabloomEmote = (value) => {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(EMOTE_BY_ID, value)
    ? EMOTE_BY_ID[value] : null;
};

const LEGACY_ACTION_TO_EMOTE = Object.freeze({
  agree: "reassuring",
  angry: "resolute",
  disagree: "resolute",
  excited: "celebratory",
  happy: "warm",
  reform: "neutral",
  sad: "concerned",
  sleepy: "reflective",
  surprised: "whimsy",
  thinking: "reflective",
});

const mapLegacyActionToEmote = (action) =>
  LEGACY_ACTION_TO_EMOTE[action] || "neutral";

const METABLOOM_EMOTE_RESPONSE_SCHEMA = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["version", "segments"],
  properties: {
    version: { type: "string", enum: [METABLOOM_PROTOCOL_VERSION] },
    segments: {
      type: "array",
      minItems: 1,
      maxItems: MAX_METABLOOM_EMOTE_SEGMENTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emote", "response"],
        properties: {
          emote: { type: "string", enum: [...METABLOOM_EMOTE_IDS] },
          response: {
            type: "string",
            minLength: 1,
            maxLength: MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
          },
        },
      },
    },
  },
});

const buildMetabloomSystemPrompt = ({ allowMultiple = false } = {}) => {
  const modeInstruction = allowMultiple
    ? `You may use between one and ${MAX_METABLOOM_EMOTE_SEGMENTS} segments only when the response genuinely changes emotional or rhetorical stance. Do not split a response merely for visual variety.`
    : "Return exactly one segment. The entire answer receives one simple, subtle emote.";
  const emoteGuide = METABLOOM_EMOTES
    .map(({ id, description }) => `- ${id}: ${description}`)
    .join("\n");

  return [
    protocol.systemPromptBase,
    modeInstruction,
    "Allowed emotes:",
    emoteGuide,
    "Choose the least intense emote that honestly supports the response.",
  ].join("\n\n");
};

module.exports = {
  METABLOOM_PROTOCOL_VERSION,
  MAX_METABLOOM_EMOTE_SEGMENTS,
  MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS,
  METABLOOM_EMOTES,
  METABLOOM_EMOTE_IDS,
  resolveMetabloomEmote,
  mapLegacyActionToEmote,
  METABLOOM_EMOTE_RESPONSE_SCHEMA,
  buildMetabloomSystemPrompt
};
