const {
  METABLOOM_INPUT_REACTION_QUESTION,
  METABLOOM_REACTION_QUESTION,
  METABLOOM_ACTION_IDS,
  METABLOOM_ACTION_QUESTION,
  resolveMetabloomDecision,
  resolveMetabloomActionDecision,
} = require("../src/components/metabloomDecisionMapping");
const { createMetabloomVisualizationQuestion } = require("../src/components/metabloomVisualDesign");
const { METABLOOM_VISUAL_KINDS } = require("../src/components/metabloomVisualProtocol");

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MAX_RESPONSE_BYTES = 16384;
const QUESTIONS = Object.freeze({
  input: METABLOOM_INPUT_REACTION_QUESTION,
  response: METABLOOM_REACTION_QUESTION,
});

const readBoundedJson = async (response) => {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("Oversized Jev response");
  let text = "";
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error("Oversized Jev response");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else {
    text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Oversized Jev response");
  }
  return JSON.parse(text);
};

// No user text, model output, tokens, request IDs, or credentials enter telemetry.
const report = (phase, outcome, startedAt, confidence) => {
  console.info("metabloom_jev", JSON.stringify({
    phase, outcome, latencyMs: Date.now() - startedAt,
    ...(Number.isFinite(confidence) ? { confidence } : {}),
  }));
};

const isChoiceAnswer = (answer) => answer?.type === "choice" && typeof answer.choice === "string" && answer.probabilities
  && typeof answer.probabilities === "object"
  && Object.prototype.hasOwnProperty.call(answer.probabilities, answer.choice)
  && Number.isFinite(answer.probabilities[answer.choice]);

const decideMetabloomChoices = async ({ phase, state, actionMode, visualKinds, signal, timeoutMs = 1000, fetchImpl = globalThis.fetch } = {}) => {
  const allowedVisuals = phase === "response" && Array.isArray(visualKinds)
    ? METABLOOM_VISUAL_KINDS.filter((kind) => visualKinds.includes(kind)) : [];
  let visualization = "none";
  const withVisual = (value) => allowedVisuals.length ? { ...value, visualization } : value;
  const explicitAction = phase === "input" && METABLOOM_ACTION_IDS.includes(actionMode) ? actionMode : "none";
  const fallback = () => { visualization = "none"; return withVisual({ emote: "neutral", action: signal?.aborted ? "none" : explicitAction }); };
  if (!Object.prototype.hasOwnProperty.call(QUESTIONS, phase)) return fallback();
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  const model = process.env.JEV_MODEL?.trim() || "jev-latest";
  if (!apiKey || typeof fetchImpl !== "function") return fallback();
  const classifyAction = phase === "input" && actionMode === "auto";
  const questions = { reaction: QUESTIONS[phase] };
  if (classifyAction) questions.action = METABLOOM_ACTION_QUESTION;
  if (allowedVisuals.length) questions.visualization = createMetabloomVisualizationQuestion(allowedVisuals);
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(1, Math.min(timeoutMs, 2000)));
  try {
    if (controller.signal.aborted) return fallback();
    const response = await fetchImpl(JEV_ENDPOINT, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state, questions }),
    });
    if (!response.ok || !response.headers?.get?.("content-type")?.includes("application/json")) {
      report(phase, "upstream_unavailable", startedAt);
      return fallback();
    }
    const payload = await readBoundedJson(response);
    if (controller.signal.aborted) return fallback();
    const visualAnswer = payload?.answers?.visualization;
    const visualChoices = ["none", ...allowedVisuals];
    if (allowedVisuals.length && isChoiceAnswer(visualAnswer) && visualChoices.includes(visualAnswer.choice)
      && Number.isFinite(visualAnswer.confidence) && visualAnswer.confidence >= 0.75 && visualAnswer.confidence <= 1
      && !Array.isArray(visualAnswer.probabilities) && Object.entries(visualAnswer.probabilities).every(([key, value]) =>
        visualChoices.includes(key) && Number.isFinite(value) && value >= 0 && value <= 1)) visualization = visualAnswer.choice;
    const answer = payload?.answers?.reaction;
    const actionAnswer = payload?.answers?.action;
    const action = classifyAction && isChoiceAnswer(actionAnswer)
      ? resolveMetabloomActionDecision({ choice: actionAnswer.choice, confidence: actionAnswer.confidence })
      : explicitAction;
    // Each question has its own validation and fallback. A bad action cannot
    // discard an emote, and an invalid emote cannot erase a valid action.
    if (!isChoiceAnswer(answer)) {
      report(phase, "invalid_answer", startedAt);
      return withVisual({ emote: "neutral", action });
    }
    const emote = resolveMetabloomDecision({ choice: answer.choice, confidence: answer.confidence });
    report(phase, emote === "neutral" ? "neutral" : "selected", startedAt, answer.confidence);
    return withVisual({ emote, action });
  } catch {
    if (!signal?.aborted) report(phase, controller.signal.aborted ? "timeout" : "unavailable", startedAt);
    return fallback();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};

// Existing reaction callers keep their string result and reaction-only request.
const decideMetabloomReaction = async (options) => (await decideMetabloomChoices({ ...options, actionMode: undefined, visualKinds: undefined })).emote;
const decideMetabloomInput = ({ actionMode = "auto", ...options } = {}) =>
  decideMetabloomChoices({ ...options, phase: "input", actionMode });
const decideMetabloomResponse = async (options = {}) => {
  const result = await decideMetabloomChoices({ ...options, phase: "response", actionMode: undefined });
  return { emote: result.emote, visualization: result.visualization || "none" };
};

module.exports = { decideMetabloomReaction, decideMetabloomInput, decideMetabloomResponse };
