const {
  METABLOOM_INPUT_REACTION_QUESTION,
  METABLOOM_REACTION_QUESTION,
  resolveMetabloomDecision,
} = require("../src/components/metabloomDecisionMapping");

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

const decideMetabloomReaction = async ({ phase, state, signal, timeoutMs = 1000, fetchImpl = globalThis.fetch } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(QUESTIONS, phase)) return "neutral";
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  const model = process.env.JEV_MODEL?.trim() || "jev-latest";
  if (!apiKey || typeof fetchImpl !== "function") return "neutral";
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(1, Math.min(timeoutMs, 2000)));
  try {
    if (controller.signal.aborted) return "neutral";
    const response = await fetchImpl(JEV_ENDPOINT, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, state, questions: { reaction: QUESTIONS[phase] } }),
    });
    if (!response.ok || !response.headers?.get?.("content-type")?.includes("application/json")) {
      report(phase, "upstream_unavailable", startedAt);
      return "neutral";
    }
    const payload = await readBoundedJson(response);
    const answer = payload?.answers?.reaction;
    if (answer?.type !== "choice" || !answer.probabilities
      || typeof answer.probabilities !== "object"
      || !Object.prototype.hasOwnProperty.call(answer.probabilities, answer.choice)
      || !Number.isFinite(answer.probabilities[answer.choice])) {
      report(phase, "invalid_answer", startedAt);
      return "neutral";
    }
    const emote = resolveMetabloomDecision({ choice: answer.choice, confidence: answer.confidence });
    report(phase, emote === "neutral" ? "neutral" : "selected", startedAt, answer.confidence);
    return emote;
  } catch {
    if (!signal?.aborted) report(phase, controller.signal.aborted ? "timeout" : "unavailable", startedAt);
    return "neutral";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};

module.exports = { decideMetabloomReaction };
