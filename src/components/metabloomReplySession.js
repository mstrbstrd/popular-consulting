const { parseMetabloomChatEnvelope } = require("./metabloomEmoteProtocol");
const { METABLOOM_PROTOCOL_VERSION, METABLOOM_CHAT_PROTOCOL_VERSION } = require("./metabloomEmoteLibrary");

// One request owns one reply. Completion validates the streamed prefix, never replays it.
const createMetabloomReplySession = ({ allowMultiple = false, onUpdate, onEmote }) => {
  let segments = [];
  let version = null;
  let status = "streaming";
  const snapshot = () => ({
    segments: segments.map((segment) => ({ ...segment })),
    content: segments.map((segment) => segment.response).join("\n\n"),
    emote: segments.at(-1)?.emote || "neutral",
    status,
  });
  const append = (segment, index) => {
    if (status !== "streaming") return false;
    if (index !== segments.length) throw new Error("Unexpected response segment index.");
    const segmentVersion = segment?.emote === undefined ? METABLOOM_CHAT_PROTOCOL_VERSION : METABLOOM_PROTOCOL_VERSION;
    if (version && version !== segmentVersion) throw new Error("Response segment protocol changed.");
    const parsed = parseMetabloomChatEnvelope({ version: segmentVersion, segments: [...segments, segment] }, { allowMultiple });
    if (!parsed.ok) throw new Error(parsed.error);
    version = parsed.value.version;
    segments = parsed.value.segments;
    onUpdate(snapshot());
    if (segments[index].emote !== undefined) onEmote?.(segments[index].emote);
    return true;
  };
  return Object.freeze({
    append,
    snapshot,
    get closed() { return status !== "streaming"; },
    finish(payload) {
      if (status !== "streaming") return false;
      const parsed = parseMetabloomChatEnvelope(payload, { allowMultiple });
      if (!parsed.ok || (version && parsed.value.version !== version)) throw new Error(parsed.error || "Response protocol changed.");
      const final = parsed.value.segments;
      if (segments.length > final.length || segments.some((segment, index) =>
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
      if (segments.length) onUpdate(snapshot());
    },
  });
};
module.exports = { createMetabloomReplySession };
