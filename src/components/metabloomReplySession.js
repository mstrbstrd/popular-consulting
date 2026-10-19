const { parseMetabloomChatEnvelope } = require("./metabloomEmoteProtocol");
const { parseMetabloomResearchSources } = require("./metabloomResearchSources");
const {
  METABLOOM_PROTOCOL_VERSION, METABLOOM_CHAT_PROTOCOL_VERSION,
  MAX_METABLOOM_EMOTE_SEGMENTS, MAX_METABLOOM_EMOTE_RESPONSE_CHARS, MAX_METABLOOM_EMOTE_TOTAL_CHARS,
} = require("./metabloomEmoteLibrary");

// One request owns one reply. Completion validates the streamed prefix, never replays it.
const createMetabloomReplySession = ({ allowMultiple = false, onUpdate, onEmote }) => {
  let segments = [];
  let partialResponse = null;
  let version = null;
  let status = "streaming";
  let sources = null;
  const snapshot = () => {
    const visible = segments.map((segment) => ({ ...segment }));
    if (partialResponse !== null) visible.push({ response: partialResponse });
    return { segments: visible, content: visible.map((segment) => segment.response).join("\n\n"),
      emote: segments.at(-1)?.emote || "neutral", status,
      ...(sources ? { sources: sources.map((source) => ({ ...source })) } : {}) };
  };
  const appendText = (delta, index) => {
    if (status !== "streaming") return false;
    if (index !== segments.length || typeof delta !== "string" || !delta.length
      || (version && version !== METABLOOM_CHAT_PROTOCOL_VERSION)
      || segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) throw new Error("Unexpected response text delta.");
    const next = (partialResponse || "") + delta;
    if (next.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS
      || segments.reduce((total, segment) => total + segment.response.length, 0) + next.length > MAX_METABLOOM_EMOTE_TOTAL_CHARS) {
      throw new Error("Response text limit exceeded.");
    }
    version = METABLOOM_CHAT_PROTOCOL_VERSION;
    partialResponse = next;
    onUpdate(snapshot());
    return true;
  };
  const append = (segment, index) => {
    if (status !== "streaming") return false;
    if (index !== segments.length) throw new Error("Unexpected response segment index.");
    const segmentVersion = segment?.emote === undefined ? METABLOOM_CHAT_PROTOCOL_VERSION : METABLOOM_PROTOCOL_VERSION;
    if (version && version !== segmentVersion) throw new Error("Response segment protocol changed.");
    const parsed = parseMetabloomChatEnvelope({ version: segmentVersion, segments: [...segments, segment] }, { allowMultiple });
    if (!parsed.ok) throw new Error(parsed.error);
    if (partialResponse !== null && parsed.value.segments[index].response !== partialResponse) {
      throw new Error("Completed segment did not match the visible stream.");
    }
    version = parsed.value.version;
    segments = parsed.value.segments;
    partialResponse = null;
    onUpdate(snapshot());
    if (segments[index].emote !== undefined) onEmote?.(segments[index].emote);
    return true;
  };
  return Object.freeze({
    attachSources(value) {
      if (status !== "streaming") return false;
      if (sources || segments.length || partialResponse !== null) throw new Error("Unexpected research sources.");
      const parsed = parseMetabloomResearchSources(value);
      if (!parsed) throw new Error("Invalid research sources.");
      // Metadata alone must not create a reply or request the surfacing scene.
      sources = parsed;
      return true;
    },
    append,
    appendText,
    snapshot,
    get closed() { return status !== "streaming"; },
    finish(payload) {
      if (status !== "streaming") return false;
      const parsed = parseMetabloomChatEnvelope(payload, { allowMultiple });
      if (!parsed.ok || (version && parsed.value.version !== version)) throw new Error(parsed.error || "Response protocol changed.");
      const final = parsed.value.segments;
      if (segments.length > final.length || (partialResponse !== null && !final[segments.length]) || segments.some((segment, index) =>
        segment.emote !== final[index].emote || segment.response !== final[index].response)) {
        throw new Error("Completed response did not match the visible stream.");
      }
      // Backward-compatible complete envelopes may not have emitted callbacks.
      for (let index = segments.length; index < final.length; index++) append(final[index], index);
      status = "complete";
      onUpdate(snapshot());
      return true;
    },
    interrupt(reason = "interrupted") {
      if (status !== "streaming") return;
      status = reason === "error" ? "error" : "interrupted";
      if (segments.length || partialResponse !== null) onUpdate(snapshot());
    },
  });
};
module.exports = { createMetabloomReplySession };
