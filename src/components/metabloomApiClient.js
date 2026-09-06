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
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ allowMultiple: allowMultiple === true, history, message, requestId }),
      signal: controller.signal,
    });
    const contentType = response.headers?.get?.("content-type") || "";
    const isStream = contentType.includes("application/x-ndjson");
    const decoder = createMetabloomSegmentStreamDecoder({
      allowMultiple,
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
        if (bytes > (response.ok ? MAX_RESPONSE_BYTES : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
        const part = textDecoder.decode(chunk.value, { stream: true });
        if (response.ok && isStream) {
          if (!decoder.push(part)) throw new MetabloomApiError("The response stream was interrupted or invalid.", { code: "invalid_response" });
        } else text += part;
      }
      const tail = textDecoder.decode();
      if (response.ok && isStream) decoder.push(tail); else text += tail;
    } else if (typeof response.text === "function") {
      text = await response.text();
      if (text.length > (response.ok ? 24000 : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
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
      const error = new MetabloomApiError("The model request was not completed.", {
        code: typeof payload.code === "string" ? payload.code : "request_failed", status: response.status,
      });
      if (optional && isMetabloomApiUnavailable(error)) return null;
      throw error;
    }
    const result = isStream ? decoder.finish() : parseMetabloomEmoteEnvelope(text, { allowMultiple });
    if (!result.ok) throw new MetabloomApiError(result.error, { code: "invalid_response" });
    // JSON compatibility responses use the same callback, exactly once per segment.
    if (!isStream) result.value.segments.forEach((segment, index) => onSegment?.(segment, index));
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
