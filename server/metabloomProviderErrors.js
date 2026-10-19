// Operational details are selected here. Never forward a provider's raw error
// message, request body, prompt, or arbitrary response fields to logs or clients.
const PROVIDER_CODES = new Set([
  "invalid_api_key", "invalid_request_error", "model_not_found", "unsupported_value",
  "unsupported_parameter", "insufficient_quota", "rate_limit_exceeded", "server_error",
  "context_length_exceeded", "invalid_value", "invalid_type", "permission_denied",
]);
const createMetabloomProviderError = (code, reason, details = {}) => Object.assign(new Error(reason), { code, reason }, details);
const providerDetails = (value) => ({
  ...(PROVIDER_CODES.has(value?.code) ? { providerCode: value.code } : {}),
  ...(typeof value?.param === "string" && value.param.length <= 100 && /^(?:model|tools|tool_choice|max_tool_calls|max_output_tokens|reasoning|text|input)(?:\.[a-z_]+|\[\d{1,2}\]){0,5}$/.test(value.param)
    ? { providerParam: value.param } : {}),
});
const providerRequestId = (response) => {
  const value = response.headers.get("x-request-id");
  return typeof value === "string" && /^req_[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;
};
const readMetabloomProviderError = async (response, signal) => {
  const status = response.status;
  const code = [401, 403].includes(status) ? "provider_authentication_failed"
    : [400, 404, 422].includes(status) ? "model_configuration_error"
      : status === 429 ? "provider_rate_limited" : "provider_unavailable";
  let details = {};
  if (response.body?.getReader) {
    const reader = response.body.getReader(), parts = [];
    const abort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      let bytes = 0;
      while (!signal?.aborted) {
        const chunk = await reader.read();
        if (signal?.aborted || chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096) throw new Error("Error body exceeded limit");
        parts.push(Buffer.from(chunk.value));
      }
      details = providerDetails(JSON.parse(Buffer.concat(parts).toString("utf8"))?.error);
    } catch { /* HTTP status remains useful even when the error body is unusable. */ }
    finally {
      signal?.removeEventListener("abort", abort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else await response.body?.cancel?.().catch(() => {});
  const id = providerRequestId(response);
  return createMetabloomProviderError(code, "provider_http_error", {
    providerStatus: status, ...details, ...(id ? { providerRequestId: id } : {}),
  });
};

module.exports = { createMetabloomProviderError, readMetabloomProviderError, providerDetails, providerRequestId };
