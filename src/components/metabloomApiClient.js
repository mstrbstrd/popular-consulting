import { createMetabloomSegmentStreamDecoder, parseMetabloomEmoteEnvelope } from "./metabloomEmoteProtocol";

const MAX_RESPONSE_BYTES = 96000;
export class MetabloomApiError extends Error {
  constructor(message, { code = "request_failed", status = 0 } = {}) {
    super(message);
    this.name = "MetabloomApiError";
    this.code = code;
    this.status = status;
  }
}
export const isMetabloomApiUnavailable = (error) => error instanceof MetabloomApiError
  && (error.code === "not_configured" || error.status === 404);

export const requestMetabloomResponse = async ({
  allowMultiple = false,
  fetchImpl = globalThis.fetch,
  history = [],
  message,
  onSegment,
  optional = false,
  requestId,
  signal,
} = {}) => {
  if (typeof fetchImpl !== "function") {
    if (optional) return null;
    throw new MetabloomApiError("Fetch is unavailable.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  let reader;
  try {
    const response = await fetchImpl("/api/metabloom", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowMultiple: allowMultiple === true, history, message, requestId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch { /* Missing static-host endpoint. */ }
      const error = new MetabloomApiError("The model request was not completed.", {
        code: typeof payload.code === "string" ? payload.code : "request_failed",
        status: response.status,
      });
      if (optional && isMetabloomApiUnavailable(error)) return null;
      throw error;
    }
    const contentType = response.headers?.get?.("content-type") || "";
    const isStream = contentType.includes("application/x-ndjson");
    if (!isStream && !contentType.includes("application/json")) {
      throw new MetabloomApiError("Unexpected model response format.");
    }
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple, onSegment });
    let text = "";
    let bytes = 0;
    if (response.body?.getReader) {
      reader = response.body.getReader();
      const textDecoder = new TextDecoder("utf-8", { fatal: true });
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new MetabloomApiError("Response exceeded its size limit.");
        const part = textDecoder.decode(chunk.value, { stream: true });
        if (isStream) {
          if (!decoder.push(part)) throw new MetabloomApiError("Invalid response stream.");
        } else text += part;
      }
      const tail = textDecoder.decode();
      if (isStream) decoder.push(tail); else text += tail;
    } else {
      // Test transports and non-streaming implementations remain bounded too.
      text = await response.text();
      if (text.length > 24000) throw new MetabloomApiError("Response exceeded its size limit.");
      if (isStream) decoder.push(text);
    }
    const result = isStream ? decoder.finish() : parseMetabloomEmoteEnvelope(text, { allowMultiple });
    if (!result.ok) throw new MetabloomApiError(result.error, { code: "invalid_response" });
    return result.value;
  } catch (error) {
    if (controller.signal.aborted) throw new MetabloomApiError("The model request was cancelled or timed out.", { code: "cancelled" });
    if (error instanceof MetabloomApiError) throw error;
    throw new MetabloomApiError("The model service could not be reached.", { code: "network_error" });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    if (reader) {
      try { await reader.cancel(); } catch { /* Already closed or aborted. */ }
      reader.releaseLock();
    }
  }
};
