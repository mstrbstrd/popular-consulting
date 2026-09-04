import {
  METABLOOM_ACTIONS,
  METABLOOM_ACTION_IDS,
} from "./metabloomActions";

export const MAX_METABLOOM_RESPONSE_CHARS = 4000;
export const MAX_METABLOOM_ACTION_STEPS = 12;
export const MAX_METABLOOM_CHAIN_DURATION_MS = 24000;
export const MIN_METABLOOM_ACTION_DURATION_MS = 160;
export const MAX_METABLOOM_ACTION_DURATION_MS = 6000;
export const MIN_METABLOOM_ACTION_INTENSITY = 0;
export const MAX_METABLOOM_ACTION_INTENSITY = 1;

const MAX_MODEL_JSON_CHARS = 32000;
const ACTION_BY_ID = new Map(
  METABLOOM_ACTIONS.map((action) => [action.id, action]),
);
const ACTION_ID_SET = new Set(METABLOOM_ACTION_IDS);
const TOP_LEVEL_KEYS = new Set(["response", "actionChain"]);
const ACTION_STEP_KEYS = new Set([
  "action",
  "duration",
  "intensity",
  "talking",
]);

export const METABLOOM_MODEL_RESPONSE_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "MetabloomModelResponse",
  type: "object",
  additionalProperties: false,
  required: ["response", "actionChain"],
  properties: {
    response: {
      type: "string",
      minLength: 1,
      maxLength: MAX_METABLOOM_RESPONSE_CHARS,
      description: "The assistant response displayed in the chat interface.",
    },
    actionChain: {
      type: "array",
      minItems: 1,
      maxItems: MAX_METABLOOM_ACTION_STEPS,
      description:
        "A bounded sequence that controls the Metabloom field while the response is presented.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: [...METABLOOM_ACTION_IDS],
          },
          duration: {
            type: "integer",
            minimum: MIN_METABLOOM_ACTION_DURATION_MS,
            maximum: MAX_METABLOOM_ACTION_DURATION_MS,
          },
          intensity: {
            type: "number",
            minimum: MIN_METABLOOM_ACTION_INTENSITY,
            maximum: MAX_METABLOOM_ACTION_INTENSITY,
          },
          talking: {
            type: "boolean",
          },
        },
      },
    },
  },
});

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const failure = (error) => ({ ok: false, error });

const findUnexpectedKey = (value, allowedKeys) =>
  Object.keys(value).find((key) => !allowedKeys.has(key));

const decodePayload = (payload) => {
  if (typeof payload !== "string") return { ok: true, value: payload };

  const source = payload.trim();
  if (!source) return failure("The model response was empty.");
  if (source.length > MAX_MODEL_JSON_CHARS) {
    return failure("The model response exceeded the JSON size limit.");
  }

  try {
    return { ok: true, value: JSON.parse(source) };
  } catch {
    return failure("The model response was not valid JSON.");
  }
};

const normalizeActionStep = (step, index) => {
  if (!isPlainObject(step)) {
    return failure(`Action ${index + 1} must be an object.`);
  }

  const unexpectedKey = findUnexpectedKey(step, ACTION_STEP_KEYS);
  if (unexpectedKey) {
    return failure(`Action ${index + 1} included an unsupported field.`);
  }

  if (typeof step.action !== "string") {
    return failure(`Action ${index + 1} must include an action id.`);
  }

  const actionId = step.action.trim();
  if (!ACTION_ID_SET.has(actionId)) {
    return failure(`Action ${index + 1} used an unsupported action id.`);
  }

  const action = ACTION_BY_ID.get(actionId);
  const duration = step.duration === undefined ? action.duration : step.duration;
  if (
    !Number.isInteger(duration)
    || duration < MIN_METABLOOM_ACTION_DURATION_MS
    || duration > MAX_METABLOOM_ACTION_DURATION_MS
  ) {
    return failure(`Action ${index + 1} used an invalid duration.`);
  }

  const intensity = step.intensity === undefined
    ? action.intensity
    : step.intensity;
  if (
    typeof intensity !== "number"
    || !Number.isFinite(intensity)
    || intensity < MIN_METABLOOM_ACTION_INTENSITY
    || intensity > MAX_METABLOOM_ACTION_INTENSITY
  ) {
    return failure(`Action ${index + 1} used an invalid intensity.`);
  }

  if (step.talking !== undefined && typeof step.talking !== "boolean") {
    return failure(`Action ${index + 1} used an invalid talking value.`);
  }

  return {
    ok: true,
    value: {
      action: actionId,
      duration,
      intensity,
      talking:
        step.talking === undefined ? actionId !== "reform" : step.talking,
    },
  };
};

export const parseMetabloomModelResponse = (payload) => {
  const decoded = decodePayload(payload);
  if (!decoded.ok) return decoded;
  if (!isPlainObject(decoded.value)) {
    return failure("The model response must be an object.");
  }

  const unexpectedKey = findUnexpectedKey(decoded.value, TOP_LEVEL_KEYS);
  if (unexpectedKey) {
    return failure("The model response included an unsupported field.");
  }

  if (typeof decoded.value.response !== "string") {
    return failure("The response field must be text.");
  }
  if (decoded.value.response.length > MAX_METABLOOM_RESPONSE_CHARS) {
    return failure("The response field exceeded the text limit.");
  }

  const response = decoded.value.response.trim();
  if (!response) return failure("The response field was empty.");

  if (!Array.isArray(decoded.value.actionChain)) {
    return failure("The actionChain field must be an array.");
  }
  if (
    decoded.value.actionChain.length < 1
    || decoded.value.actionChain.length > MAX_METABLOOM_ACTION_STEPS
  ) {
    return failure("The actionChain length was outside the allowed range.");
  }

  const actionChain = [];
  for (let index = 0; index < decoded.value.actionChain.length; index += 1) {
    const normalized = normalizeActionStep(
      decoded.value.actionChain[index],
      index,
    );
    if (!normalized.ok) return normalized;
    actionChain.push(normalized.value);
  }

  if (actionChain[actionChain.length - 1].action !== "reform") {
    if (actionChain.length >= MAX_METABLOOM_ACTION_STEPS) {
      return failure(
        "The maximum-length actionChain must end with the reform action.",
      );
    }

    const reform = ACTION_BY_ID.get("reform");
    actionChain.push({
      action: reform.id,
      duration: reform.duration,
      intensity: reform.intensity,
      talking: false,
    });
  }

  const totalDuration = actionChain.reduce(
    (sum, step) => sum + step.duration,
    0,
  );
  if (totalDuration > MAX_METABLOOM_CHAIN_DURATION_MS) {
    return failure("The actionChain exceeded the total duration limit.");
  }

  return {
    ok: true,
    value: {
      response,
      actionChain,
    },
  };
};

export const createMetabloomPreviewResponse = (message) => {
  const normalizedMessage =
    typeof message === "string" ? message.trim().toLowerCase() : "";
  const celebrates = /(celebrat|success|great|win|excited|amazing)/.test(
    normalizedMessage,
  );
  const needsCare = /(sad|hard|difficult|hurt|loss|sorry)/.test(
    normalizedMessage,
  );
  const challenges = /(disagree|wrong|no\b|challenge|push back)/.test(
    normalizedMessage,
  );

  if (celebrates) {
    return {
      response:
        "That sounds worth celebrating. This local preview pairs the written response with an excited, happy, then calm Metabloom action chain.",
      actionChain: [
        { action: "excited", duration: 1420, intensity: 0.72, talking: true },
        { action: "happy", duration: 1180, intensity: 0.62, talking: true },
        { action: "agree", duration: 920, intensity: 0.48, talking: true },
        { action: "reform", duration: 1080, intensity: 0, talking: false },
      ],
    };
  }

  if (needsCare) {
    return {
      response:
        "I hear the weight in that. This local preview lets the response remain readable while the full-page field carries a quieter, more empathetic emotional cadence.",
      actionChain: [
        { action: "sad", duration: 1460, intensity: 0.46, talking: true },
        { action: "thinking", duration: 1320, intensity: 0.40, talking: true },
        { action: "agree", duration: 980, intensity: 0.34, talking: true },
        { action: "reform", duration: 1180, intensity: 0, talking: false },
      ],
    };
  }

  if (challenges) {
    return {
      response:
        "I would pause and examine that claim rather than simply mirror it. The response text and the corrective Metabloom gesture are controlled by separate fields in the same model payload.",
      actionChain: [
        { action: "disagree", duration: 980, intensity: 0.52, talking: true },
        { action: "thinking", duration: 1380, intensity: 0.44, talking: true },
        { action: "agree", duration: 920, intensity: 0.38, talking: true },
        { action: "reform", duration: 1080, intensity: 0, talking: false },
      ],
    };
  }

  return {
    response:
      "I am following. This local interface preview shows the intended contract: readable response text in one field, with a separate bounded action chain controlling the full-page Metabloom avatar.",
    actionChain: [
      { action: "thinking", duration: 1380, intensity: 0.42, talking: false },
      { action: "agree", duration: 920, intensity: 0.42, talking: true },
      { action: "happy", duration: 1160, intensity: 0.50, talking: true },
      { action: "reform", duration: 1080, intensity: 0, talking: false },
    ],
  };
};
