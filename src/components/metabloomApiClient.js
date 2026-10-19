import { MAX_METABLOOM_STREAM_BYTES, createMetabloomSegmentStreamDecoder, parseMetabloomChatEnvelope } from "./metabloomEmoteProtocol";
import { METABLOOM_ACTION_MODES } from "./metabloomDecisionMapping";
import { METABLOOM_REQUEST_ERROR_MESSAGES, parseMetabloomRequestError, parseMetabloomRequestRef, getMetabloomApiErrorMessage } from "./metabloomRequestErrors";

export { getMetabloomApiErrorMessage } from "./metabloomRequestErrors";

const MAX_RESPONSE_BYTES = 96000;
export const METABLOOM_RESEARCH_TIMEOUT_MS = 210000;
export class MetabloomApiError extends Error {
  constructor(message, { code = "request_failed", status = 0, requestRef = null } = {}) {
    super(message);
    this.name = "MetabloomApiError";
    this.code = typeof code === "string" && Object.prototype.hasOwnProperty.call(METABLOOM_REQUEST_ERROR_MESSAGES, code) ? code : "request_failed";
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.requestRef = parseMetabloomRequestRef(requestRef);
  }
}
export const isMetabloomApiUnavailable = (error) => error instanceof MetabloomApiError
  && (error.code === "not_configured" || error.status === 404);

export const requestMetabloomResponse = async ({
  actionMode = "auto",
  allowMultiple = false,
  fetchImpl = globalThis.fetch,
  history = [],
  message,
  onSegment,
  onTextDelta,
  onReaction,
  onAction,
  onResearch,
  onResearchProgress,
  onSources,
  optional = false,
  requestId,
  signal,
} = {}) => {
  if (!METABLOOM_ACTION_MODES.includes(actionMode)) {
    throw new MetabloomApiError("Unknown presentation mode.", { code: "invalid_request" });
  }
  if (typeof fetchImpl !== "function") {
    if (optional) return null;
    throw new MetabloomApiError("Fetch is unavailable.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const startedAt = Date.now();
  let researchStarted = false;
  let timeout = setTimeout(abort, 30000);
  let reader;
  let responseStatus = 0;
  let responseRequestRef = null;
  try {
    const response = await fetchImpl("/api/metabloom", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ actionMode, allowMultiple: allowMultiple === true, streamText: true, streamResearchProgress: true, history, message, requestId }),
      signal: controller.signal,
    });
    const contentType = response.headers?.get?.("content-type") || "";
    responseStatus = response.status;
    responseRequestRef = parseMetabloomRequestRef(response.headers?.get?.("X-Metabloom-Request-Ref"));
    const isStream = contentType.includes("application/x-ndjson");
    let streamError = null;
    const decoder = createMetabloomSegmentStreamDecoder({
      allowMultiple,
      onError: (error) => {
        const code = error.code || "invalid_response";
        streamError = new MetabloomApiError(getMetabloomApiErrorMessage(code), {
          code, status: responseStatus, requestRef: error.requestRef || responseRequestRef,
        });
      },
      onAction: (action) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onAction?.(action);
      },
      onResearch: (research) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        if (research.state === "searching" && !researchStarted) {
          researchStarted = true;
          clearTimeout(timeout);
          timeout = setTimeout(abort, Math.max(0, startedAt + METABLOOM_RESEARCH_TIMEOUT_MS - Date.now()));
        }
        onResearch?.(research);
      },
      onResearchProgress: (progress) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onResearchProgress?.(progress);
      },
      onSources: (sources) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onSources?.(sources);
      },
      onTextDelta: (delta, index) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onTextDelta?.(delta, index);
      },
      onReaction: (reaction) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onReaction?.(reaction);
      },
      onSegment: (segment, index) => {
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        onSegment?.(segment, index);
      },
    });
    let text = "";
    let bytes = 0;
    if (response.ok && !isStream && !contentType.includes("application/json")) {
      throw new MetabloomApiError("Unexpected model response format.");
    }
    if (response.body?.getReader) {
      reader = response.body.getReader();
      const textDecoder = new TextDecoder("utf-8", { fatal: true });
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > (response.ok ? (isStream ? MAX_METABLOOM_STREAM_BYTES : MAX_RESPONSE_BYTES) : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
        const part = textDecoder.decode(chunk.value, { stream: true });
        if (response.ok && isStream) {
          if (!decoder.push(part)) throw streamError;
        } else text += part;
      }
      const tail = textDecoder.decode();
      if (response.ok && isStream) decoder.push(tail); else text += tail;
    } else if (typeof response.text === "function") {
      text = await response.text();
      if (text.length > (response.ok ? (isStream ? MAX_METABLOOM_STREAM_BYTES : 24000) : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
      if (response.ok && isStream) decoder.push(text);
    } else if (!response.ok && typeof response.json === "function") {
      // Minimal test transports; real HTTP responses use the bounded reader above.
      text = JSON.stringify(await response.json());
      if (text.length > 4096) throw new MetabloomApiError("Response exceeded its size limit.");
    }
    if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
    if (!response.ok) {
      let payload = {};
      try { payload = JSON.parse(text); } catch { /* Static host may return HTML. */ }
      // Older HTTP handlers may include a message field. Never copy its text;
      // validate only the same safe code and reference used by stream errors.
      const details = parseMetabloomRequestError({ code: payload?.code,
        ...(payload?.requestRef !== undefined ? { requestRef: payload.requestRef } : {}) });
      const code = details?.code || "request_failed";
      const error = new MetabloomApiError(getMetabloomApiErrorMessage(code), {
        code, status: responseStatus, requestRef: details?.requestRef || responseRequestRef,
      });
      if (optional && isMetabloomApiUnavailable(error)) return null;
      throw error;
    }
    const result = isStream ? decoder.finish() : parseMetabloomChatEnvelope(text, { allowMultiple });
    if (!result.ok) throw streamError || new MetabloomApiError(getMetabloomApiErrorMessage("invalid_response"), {
      code: "invalid_response", status: responseStatus, requestRef: responseRequestRef,
    });
    // JSON compatibility responses use the same callback, exactly once per segment.
    if (!isStream) result.value.segments.forEach((segment, index) => onSegment?.(segment, index));
    return result.value;
  } catch (error) {
    if (controller.signal.aborted) throw new MetabloomApiError(getMetabloomApiErrorMessage("cancelled"), {
      code: "cancelled", status: responseStatus, requestRef: responseRequestRef,
    });
    if (error instanceof MetabloomApiError) throw error;
    throw new MetabloomApiError(getMetabloomApiErrorMessage("network_error"), {
      code: "network_error", status: responseStatus, requestRef: responseRequestRef,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    if (reader) {
      try { await reader.cancel(); } catch { /* Already closed or aborted. */ }
      reader.releaseLock();
    }
  }
};
