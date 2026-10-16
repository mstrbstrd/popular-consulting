// The server and browser use this exact validation boundary. Model output is data.
const {
  MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_SEGMENTS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS,
  METABLOOM_PROTOCOL_VERSION,
  METABLOOM_CHAT_PROTOCOL_VERSION,
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

const normalizeTextSegment = (value) => {
  if (!exactKeys(value, ["response"]) || typeof value.response !== "string"
    || !value.response.trim() || value.response.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS) return null;
  return { response: value.response.trim() };
};

const parseMetabloomChatEnvelope = (input, { allowMultiple = true } = {}) => {
  let value = input;
  if (typeof value === "string") {
    if (value.length > MAX_SERIALIZED_CHARS) return { ok: false, error: "Response is too long." };
    try { value = JSON.parse(value); } catch { return { ok: false, error: "Invalid response JSON." }; }
  }
  if (value?.version !== METABLOOM_CHAT_PROTOCOL_VERSION) {
    return parseMetabloomEmoteEnvelope(value, { allowMultiple });
  }
  if (!exactKeys(value, ["version", "segments"]) || !Array.isArray(value.segments)
    || value.segments.length < 1 || value.segments.length > (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
    return { ok: false, error: "Invalid chat response fields or segment count." };
  }
  const segments = value.segments.map(normalizeTextSegment);
  if (segments.some((segment) => !segment)
    || value.segments.reduce((sum, segment) => sum + (typeof segment?.response === "string" ? segment.response.length : 0), 0) > MAX_METABLOOM_EMOTE_TOTAL_CHARS) {
    return { ok: false, error: "Invalid chat response text or total length." };
  }
  return { ok: true, value: { version: METABLOOM_CHAT_PROTOCOL_VERSION, segments } };
};

const cloneChatSegment = (segment) => segment.emote === undefined
  ? { response: segment.response } : cloneSegment(segment);

// Protocol v1 remains supported for previews and external adapters. Live model
// responses use v2: exactly one input emote, text segments, a verified text
// completion, and one final emote before the terminal done record.
const createMetabloomSegmentStreamDecoder = ({
  allowMultiple = true,
  maxBufferChars = MAX_SERIALIZED_CHARS,
  onDone,
  onError,
  onSegment,
  onReaction,
} = {}) => {
  const limit = Number.isInteger(maxBufferChars) && maxBufferChars > 0
    ? Math.min(maxBufferChars, MAX_SERIALIZED_CHARS) : MAX_SERIALIZED_CHARS;
  let buffer = "";
  let receivedChars = 0;
  let totalResponseChars = 0;
  let completed = false;
  let errorMessage = "";
  let version = null;
  let inputEmote = null;
  let responseEmote = null;
  let textComplete = false;
  const segments = [];
  const fail = (message) => {
    if (!errorMessage) {
      errorMessage = message;
      onError?.(new Error(message));
    }
    return false;
  };
  const envelope = () => ({ version: version || METABLOOM_PROTOCOL_VERSION, segments: segments.map(cloneChatSegment) });
  const consume = (line) => {
    if (!line.trim()) return true;
    if (completed) return fail("Metabloom stream continued after completion.");
    let event;
    try { event = JSON.parse(line); } catch { return fail("Malformed stream JSON."); }
    if (event?.type === "emote") {
      if (!exactKeys(event, ["type", "phase", "emote"]) || !resolveMetabloomEmote(event.emote)) return fail("Invalid Jev emote.");
      if (event.phase === "input" && version === null && segments.length === 0) {
        version = METABLOOM_CHAT_PROTOCOL_VERSION;
        inputEmote = event.emote;
        onReaction?.({ phase: "input", emote: event.emote });
        return true;
      }
      if (event.phase === "response" && version === METABLOOM_CHAT_PROTOCOL_VERSION
        && inputEmote && textComplete && !responseEmote) {
        responseEmote = event.emote;
        return true;
      }
      return fail("Unexpected or duplicate Jev reaction.");
    }
    if (event?.type === "text_complete") {
      if (!exactKeys(event, ["type"]) || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !segments.length || textComplete) return fail("Invalid text completion.");
      textComplete = true;
      return true;
    }
    if (event?.type === "done") {
      if (!exactKeys(event, ["type", "version"]) || !segments.length || event.version !== version) {
        return fail("Invalid or empty stream completion.");
      }
      if (version === METABLOOM_CHAT_PROTOCOL_VERSION && (!textComplete || !responseEmote)) {
        return fail("Jev stream ended without both reactions.");
      }
      completed = true;
      // Only dispatch the final emote once the terminal record is verified.
      if (version === METABLOOM_CHAT_PROTOCOL_VERSION) onReaction?.({ phase: "response", emote: responseEmote });
      onDone?.(envelope());
      return true;
    }
    const v1 = version === null && exactKeys(event, ["type", "index", "emote", "response"]);
    if (v1) version = METABLOOM_PROTOCOL_VERSION;
    const expectedKeys = version === METABLOOM_CHAT_PROTOCOL_VERSION
      ? ["type", "index", "response"] : ["type", "index", "emote", "response"];
    if (!exactKeys(event, expectedKeys) || event.type !== "segment" || event.index !== segments.length
      || (version === METABLOOM_CHAT_PROTOCOL_VERSION && textComplete)) {
      return fail("Invalid or out-of-order stream segment.");
    }
    const segment = version === METABLOOM_CHAT_PROTOCOL_VERSION
      ? normalizeTextSegment({ response: event.response })
      : normalizeSegment({ emote: event.emote, response: event.response });
    if (!segment || segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
      return fail("Invalid stream segment or segment limit exceeded.");
    }
    totalResponseChars += event.response.length;
    if (totalResponseChars > MAX_METABLOOM_EMOTE_TOTAL_CHARS) return fail("Stream text limit exceeded.");
    segments.push(segment);
    onSegment?.(cloneChatSegment(segment), segments.length - 1);
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
      return { bufferLength: buffer.length, completed, failed: Boolean(errorMessage),
        nextIndex: segments.length, segments: segments.map(cloneChatSegment), version,
        inputEmote, responseEmote, textComplete };
    },
  });
};

module.exports = { parseMetabloomEmoteEnvelope, parseMetabloomChatEnvelope, createMetabloomSegmentStreamDecoder };
