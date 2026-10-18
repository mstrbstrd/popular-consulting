const { createHmac } = require("node:crypto");
const { once } = require("node:events");
const metabloomAuth = require("../server/metabloomAuth");
const { METABLOOM_CHAT_PROTOCOL_VERSION, METABLOOM_EMOTE_IDS, METABLOOM_CHAT_RESPONSE_SCHEMA, buildMetabloomChatSystemPrompt } = require("../src/components/metabloomEmoteLibrary");
const { METABLOOM_ACTION_MODES } = require("../src/components/metabloomDecisionMapping");
const { decideMetabloomReaction, decideMetabloomInput } = require("../server/jevReactionService");
const { streamMetabloomProvider } = require("../server/metabloomProviderStream");
const MAX_BODY_BYTES = 24000;
const localBuckets = new Map();
// Atomic quotas across serverless instances, including a project-wide cost ceiling.
const QUOTA_SCRIPT = `
local client = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if client >= 12 or total >= 300 then return 0 end
if redis.call('INCR', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if redis.call('INCR', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
return 1`;
const exactKeys = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value)
  && required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const isLocal = (request) => (process.env.VERCEL_ENV === "development" || (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production"))
  && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket?.remoteAddress);
const configured = (request) => Boolean(process.env.OPENAI_API_KEY)
  && (isLocal(request) || Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN));
const requestOriginIsAllowed = (request) => {
  const origin = request.headers?.origin;
  if (!origin) return isLocal(request);
  const host = request.headers?.host;
  if (typeof host !== "string" || /[\s,/@\\]/.test(host)) return false;
  const protocol = request.socket?.encrypted || (process.env.VERCEL === "1" && !isLocal(request)) ? "https" : "http";
  try { return new URL(origin).origin === origin && origin === `${protocol}://${host}`; } catch { return false; }
};
const parseBody = (request) => {
  const declared = request.headers?.["content-length"];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > MAX_BODY_BYTES)) return null;
  try {
    const text = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return null;
    const value = JSON.parse(text);
    if (!exactKeys(value, ["message"], ["requestId", "history", "allowMultiple", "streamText", "actionMode"])) return null;
    if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 1600) return null;
    if (value.allowMultiple !== undefined && typeof value.allowMultiple !== "boolean") return null;
    if (value.streamText !== undefined && typeof value.streamText !== "boolean") return null;
    if (value.actionMode !== undefined && !METABLOOM_ACTION_MODES.includes(value.actionMode)) return null;
    if (value.requestId !== undefined && (typeof value.requestId !== "string" || !/^[a-zA-Z0-9-]{1,160}$/.test(value.requestId))) return null;
    const history = value.history === undefined ? [] : value.history;
    if (!Array.isArray(history) || history.length > 12) return null;
    let total = 0;
    for (const item of history) {
      if (!exactKeys(item, ["role", "content"]) || !["user", "assistant"].includes(item.role)
        || typeof item.content !== "string" || !item.content.trim()
        || item.content.length > (item.role === "assistant" ? 4806 : 1600)) return null;
      total += item.content.length;
    }
    if (total > 16000) return null;
    return { ...value, history, message: value.message.trim(), allowMultiple: value.allowMultiple === true };
  } catch { return null; }
};
const readBoundedJson = async (response, limit) => {
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const parts = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) throw new Error("Response size exceeded");
        parts.push(Buffer.from(chunk.value));
      }
      text = Buffer.concat(parts).toString("utf8");
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } else {
    text = await response.text();
    if (Buffer.byteLength(text) > limit) throw new Error("Response size exceeded");
  }
  return JSON.parse(text);
};
const consumeRateLimit = async (request, signal) => {
  if (isLocal(request)) {
    const key = request.socket.remoteAddress;
    const now = Date.now();
    for (const [id, value] of localBuckets) if (value.until <= now) localBuckets.delete(id);
    const bucket = localBuckets.get(key) || { count: 0, until: now + 60000 };
    localBuckets.set(key, bucket);
    return ++bucket.count <= 12;
  }
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid quota configuration");
  const address = request.headers?.["x-vercel-forwarded-for"] || request.headers?.["x-forwarded-for"] || request.socket?.remoteAddress || "unknown";
  const key = createHmac("sha256", process.env.UPSTASH_REDIS_REST_TOKEN).update(String(address).split(",")[0].trim()).digest("hex");
  const result = await fetch(url, {
    method: "POST", redirect: "error", signal,
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", QUOTA_SCRIPT, "2", `metabloom:{quota}:client:${key}`, "metabloom:{quota}:daily"]),
  });
  if (!result.ok) throw new Error("Quota service unavailable");
  const data = await readBoundedJson(result, 4096);
  if (data.result !== 0 && data.result !== 1) throw new Error("Invalid quota result");
  return data.result === 1;
};
const sendJson = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};
const handler = async (request, response) => {
  response.setHeader("Cache-Control", "private, no-store, no-transform");
  response.setHeader("CDN-Cache-Control", "no-store");
  response.setHeader("Vercel-CDN-Cache-Control", "no-store");
  response.setHeader("Vary", "Cookie");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Metabloom-Protocol", METABLOOM_CHAT_PROTOCOL_VERSION);
  // No metadata, quota consumption, OpenAI request, or Jev decision without a live session.
  const denial = await metabloomAuth.requireMetabloomSession(request);
  if (denial) return sendJson(response, denial.status, { code: denial.code });
  if (response.destroyed || request.aborted) return;
  if (request.method === "GET") return sendJson(response, 200, {
    version: METABLOOM_CHAT_PROTOCOL_VERSION, release: "jev-dual-reactions-v2", presentation: "single-message-stream",
    streaming: "validated-text-and-reactions", configured: configured(request),
    jevConfigured: Boolean(process.env.TYPESAFE_API_KEY), emotes: METABLOOM_EMOTE_IDS,
  });
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { code: "method_not_allowed" });
  }
  if (!requestOriginIsAllowed(request)) return sendJson(response, 403, { code: "origin_not_allowed" });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers?.["content-type"] || "")) return sendJson(response, 415, { code: "invalid_content_type" });
  const body = parseBody(request);
  if (!body) return sendJson(response, 400, { code: "invalid_request" });
  if (!configured(request)) return sendJson(response, 503, { code: "not_configured" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const onClose = () => { if (!response.writableEnded) controller.abort(); };
  response.on?.("close", onClose);
  let stage = "quota";
  let streaming = false;
  let initialReactionPromise = Promise.resolve();
  try {
    if (!(await consumeRateLimit(request, controller.signal))) {
      response.setHeader("Retry-After", "60");
      return sendJson(response, 429, { code: "rate_limited" });
    }
    if (controller.signal.aborted) throw new Error("Cancelled");
    stage = "provider";
    const sendStreamEvent = async (event) => {
      if (controller.signal.aborted || response.destroyed) throw new Error("Cancelled");
      if (!streaming) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        response.flushHeaders?.();
        streaming = true;
      }
      if (response.write(JSON.stringify(event) + "\n") === false) {
        await once(response, "drain", { signal: controller.signal });
      }
    };
    // The same bounded Jev call supplies the input reaction and optional action.
    // Auto waits for its actual scene choice; explicit and legacy modes already
    // know their presentation and can start the chat provider in parallel.
    const inputDecision = {
      phase: "input",
      state: { latestUserMessage: body.message, recentConversation: body.history.slice(-4) },
      signal: controller.signal, timeoutMs: 950,
    };
    const inputDecisionPromise = body.actionMode === undefined
      ? decideMetabloomReaction(inputDecision).then((emote) => ({ emote }))
      : decideMetabloomInput({ ...inputDecision, actionMode: body.actionMode });
    initialReactionPromise = inputDecisionPromise.then(async ({ emote, action }) => {
      await sendStreamEvent({ type: "emote", phase: "input", emote });
      if (body.actionMode !== undefined) await sendStreamEvent({ type: "action", action });
    });
    const presentationAction = body.actionMode === "auto"
      ? (await inputDecisionPromise).action : body.actionMode || "none";
    if (controller.signal.aborted || response.destroyed || request.aborted) throw new Error("Cancelled");
    const schema = JSON.parse(JSON.stringify(METABLOOM_CHAT_RESPONSE_SCHEMA));
    schema.properties.segments.maxItems = body.allowMultiple ? 4 : 1;
    const instructions = buildMetabloomChatSystemPrompt({ allowMultiple: body.allowMultiple, presentationAction });
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.METABLOOM_OPENAI_MODEL || "gpt-5-mini",
        instructions,
        input: [...body.history, { role: "user", content: body.message }],
        max_output_tokens: 2400, store: false, stream: true,
        text: { format: { type: "json_schema", name: "metabloom_chat_response", strict: true, schema } },
      }),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel?.();
      throw new Error("Chat provider unavailable");
    }
    const finalReply = await streamMetabloomProvider(upstream, {
      textOnly: true, allowMultiple: body.allowMultiple,
      signal: controller.signal,
      // Older cached clients keep receiving complete segments until they opt in.
      onTextDelta: body.streamText === true ? async (delta, index) => {
        await initialReactionPromise;
        await sendStreamEvent({ type: "text_delta", index, delta });
      } : undefined,
      onSegment: async (segment, index) => {
        await initialReactionPromise;
        await sendStreamEvent({ type: "segment", index, ...segment });
      },
    });
    await initialReactionPromise;
    if (controller.signal.aborted || response.destroyed) return;
    // The full provider envelope is validated before Jev ever reads the answer.
    await sendStreamEvent({ type: "text_complete" });
    // OpenAI has completed successfully. Its 25-second generation deadline must
    // not abort an otherwise good reply during Jev's separately bounded final choice.
    clearTimeout(timeout);
    const finalEmote = await decideMetabloomReaction({
      phase: "response",
      state: { latestUserMessage: body.message, assistantResponse: finalReply.segments.map((segment) => segment.response).join("\n\n") },
      signal: controller.signal, timeoutMs: 1200,
    });
    await sendStreamEvent({ type: "emote", phase: "response", emote: finalEmote });
    response.end(JSON.stringify({ type: "done", version: METABLOOM_CHAT_PROTOCOL_VERSION }) + "\n");
  } catch {
    const timedOut = controller.signal.aborted;
    controller.abort();
    await initialReactionPromise.catch(() => {});
    if (response.destroyed) return;
    // Once bytes have been sent, never append a JSON error to a successful
    // envelope or claim completion. Preserve the visible prefix as incomplete.
    if (streaming) return response.end(JSON.stringify({ type: "error", code: "stream_interrupted" }) + "\n");
    return sendJson(response, timedOut ? 504 : 502, { code: stage === "quota" ? "quota_unavailable" : "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
    response.off?.("close", onClose);
  }
};
module.exports = handler;
module.exports._internals = { parseBody, requestOriginIsAllowed, consumeRateLimit, configured, localBuckets };
