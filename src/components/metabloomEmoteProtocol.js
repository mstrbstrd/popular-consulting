// The server and browser use this exact validation boundary. Model output is data.
const {
  MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_SEGMENTS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS,
  METABLOOM_PROTOCOL_VERSION,
  resolveMetabloomEmote,
} = require("./metabloomEmoteLibrary");

const MAX_SERIALIZED_CHARS = 24000;
const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exactKeys = (value, keys) => isPlainObject(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const cloneSegment = ({ emote, response }) => ({ emote, response });
const normalizeSegment = (value) => {
  if (!exactKeys(value, ["emote", "response"])) return null;
  if (!resolveMetabloomEmote(value.emote) || typeof value.response !== "string") return null;
  if (!value.response.trim() || value.response.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS) return null;
  return { emote: value.emote, response: value.response.trim() };
};
const parseMetabloomEmoteEnvelope = (input, { allowMultiple = true } = {}) => {
  let value = input;
  if (typeof value === "string") {
    if (value.length > MAX_SERIALIZED_CHARS) return { ok: false, error: "Response is too long." };
    try { value = JSON.parse(value); } catch { return { ok: false, error: "Invalid response JSON." }; }
  }
  if (exactKeys(value, ["emote", "response"])) {
    value = { version: METABLOOM_PROTOCOL_VERSION, segments: [value] };
  }
  if (!exactKeys(value, ["version", "segments"]) || value.version !== METABLOOM_PROTOCOL_VERSION) {
    return { ok: false, error: "Invalid Metabloom response fields or protocol version." };
  }
  if (!Array.isArray(value.segments) || value.segments.length < 1
    || value.segments.length > (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
    return { ok: false, error: "Invalid response segment count." };
  }
  const segments = Array.from(value.segments, normalizeSegment);
  if (segments.some((segment) => !segment)
    || value.segments.reduce((sum, segment) => sum + segment.response.length, 0) > MAX_METABLOOM_EMOTE_TOTAL_CHARS) {
    return { ok: false, error: "Invalid emote, response text, or total response length." };
  }
  return { ok: true, value: { version: METABLOOM_PROTOCOL_VERSION, segments } };
};

const createMetabloomSegmentStreamDecoder = ({
  allowMultiple = true,
  maxBufferChars = MAX_SERIALIZED_CHARS,
  onDone,
  onError,
  onSegment,
} = {}) => {
  const limit = Number.isInteger(maxBufferChars) && maxBufferChars > 0
    ? Math.min(maxBufferChars, MAX_SERIALIZED_CHARS) : MAX_SERIALIZED_CHARS;
  let buffer = "";
  let receivedChars = 0;
  let totalResponseChars = 0;
  let completed = false;
  let errorMessage = "";
  const segments = [];
  const fail = (message) => {
    if (!errorMessage) {
      errorMessage = message;
      onError?.(new Error(message));
    }
    return false;
  };
  const envelope = () => ({ version: METABLOOM_PROTOCOL_VERSION, segments: segments.map(cloneSegment) });
  const consume = (line) => {
    if (!line.trim()) return true;
    if (completed) return fail("Metabloom stream continued after completion.");
    let event;
    try { event = JSON.parse(line); } catch { return fail("Malformed stream JSON."); }
    if (event?.type === "done") {
      if (!exactKeys(event, ["type", "version"]) || event.version !== METABLOOM_PROTOCOL_VERSION || segments.length === 0) {
        return fail("Invalid or empty stream completion.");
      }
      completed = true;
      onDone?.(envelope());
      return true;
    }
    if (!exactKeys(event, ["type", "index", "emote", "response"])
      || event.type !== "segment" || event.index !== segments.length) {
      return fail("Invalid or out-of-order stream segment.");
    }
    const segment = normalizeSegment({ emote: event.emote, response: event.response });
    if (!segment || segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
      return fail("Invalid stream segment or segment limit exceeded.");
    }
    totalResponseChars += event.response.length;
    if (totalResponseChars > MAX_METABLOOM_EMOTE_TOTAL_CHARS) return fail("Stream text limit exceeded.");
    segments.push(segment);
    onSegment?.(cloneSegment(segment), segments.length - 1);
    return true;
  };
  const drain = () => {
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!consume(line)) return false;
    }
    return true;
  };
  return Object.freeze({
    push(chunk) {
      if (errorMessage) return false;
      if (typeof chunk !== "string") return fail("Stream chunks must be text.");
      receivedChars += chunk.length;
      if (receivedChars > limit) return fail("Stream buffer limit exceeded.");
      buffer += chunk;
      return drain();
    },
    finish() {
      if (!errorMessage && buffer.trim()) consume(buffer);
      buffer = "";
      if (!errorMessage && !completed) fail("Stream ended before its completion record.");
      return errorMessage ? { ok: false, error: errorMessage } : { ok: true, value: envelope() };
    },
    getState() {
      return { bufferLength: buffer.length, completed, failed: Boolean(errorMessage), nextIndex: segments.length, segments: segments.map(cloneSegment) };
    },
  });
};

module.exports = { parseMetabloomEmoteEnvelope, createMetabloomSegmentStreamDecoder };
