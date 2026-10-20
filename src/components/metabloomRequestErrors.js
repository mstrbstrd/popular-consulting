// Only this vocabulary crosses the API boundary. Provider messages stay private.
const METABLOOM_REQUEST_ERROR_MESSAGES = Object.freeze({
  stream_interrupted: "The response stream was interrupted. Please try again.",
  research_timeout: "The research took too long to complete. Try a narrower question.",
  research_token_limit: "The research reached its output limit before finishing. Try a narrower question.",
  research_incomplete: "The research did not finish. Please try again.",
  research_no_sources: "The research did not return usable sources. Try a more specific question.",
  research_invalid_citations: "The research returned citations that could not be verified. Please try again.",
  research_response_too_large: "The provider response exceeded the app’s data safety limit.",
  provider_authentication_failed: "The model service could not authenticate. Its connection needs to be checked.",
  model_configuration_error: "The selected model or research tool is unavailable with the current configuration.",
  provider_rate_limited: "The model service is busy or has reached a usage limit. Please try again later.",
  provider_unavailable: "The model service is temporarily unavailable. Please try again.",
  answer_timeout: "Writing the answer took too long. Please try again.",
  answer_incomplete: "The model did not finish the answer. Please try again.",
  answer_invalid: "The answer could not be validated. Please try again.",
  quota_unavailable: "The request limit could not be checked. Please try again.",
  not_configured: "The model service is not configured.",
  authentication_required: "Please sign in again to continue.",
  authentication_unavailable: "Your session could not be verified. Please try again.",
  origin_not_allowed: "This request could not be verified. Reload the page and try again.",
  method_not_allowed: "This request method is not supported.",
  invalid_content_type: "The request format was not supported. Reload the page and try again.",
  invalid_request: "The message could not be sent in this format. Please try again.",
  visual_tool_required: "This request needs the interactive visual tool. Reload the page and try again; no code-only substitute was generated.",
  rate_limited: "The request limit has been reached. Please wait a moment and try again.",
  upstream_unavailable: "The model service is temporarily unavailable. Please try again.",
  cancelled: "The request was stopped or timed out.",
  invalid_response: "The response stream could not be validated. Please try again.",
  network_error: "The connection to the model service was interrupted. Please try again.",
  request_failed: "The model request could not be completed. Please try again.",
});
const METABLOOM_STREAM_ERROR_CODES = Object.freeze([
  "stream_interrupted", "research_timeout", "research_token_limit", "research_incomplete",
  "research_no_sources", "research_invalid_citations", "research_response_too_large",
  "provider_authentication_failed", "model_configuration_error", "provider_rate_limited",
  "provider_unavailable", "answer_timeout", "answer_incomplete", "answer_invalid", "quota_unavailable",
]);
const knownCode = (code) => typeof code === "string"
  && Object.prototype.hasOwnProperty.call(METABLOOM_REQUEST_ERROR_MESSAGES, code);
const parseMetabloomRequestRef = (value) => typeof value === "string" && value.length === 12 && /^[a-f0-9]{12}$/.test(value) ? value : null;
const getMetabloomApiErrorMessage = (code) => METABLOOM_REQUEST_ERROR_MESSAGES[knownCode(code) ? code : "request_failed"];

// HTTP compatibility permits code-only errors. The stream decoder additionally
// requires a reference on new terminal errors and its narrower stream vocabulary.
const parseMetabloomRequestError = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || !Object.prototype.hasOwnProperty.call(value, "code") || !knownCode(value.code)) return null;
  const hasRef = Object.prototype.hasOwnProperty.call(value, "requestRef");
  if (Object.keys(value).length !== (hasRef ? 2 : 1)) return null;
  const requestRef = hasRef ? parseMetabloomRequestRef(value.requestRef) : null;
  if (hasRef && !requestRef) return null;
  return { code: value.code, ...(requestRef ? { requestRef } : {}) };
};

module.exports = {
  METABLOOM_REQUEST_ERROR_MESSAGES,
  METABLOOM_STREAM_ERROR_CODES,
  parseMetabloomRequestError,
  parseMetabloomRequestRef,
  getMetabloomApiErrorMessage,
};
