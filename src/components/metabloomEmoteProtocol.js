// The server and browser use this exact validation boundary. Model output is data.
const {
  MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_SEGMENTS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS,
  METABLOOM_PROTOCOL_VERSION,
  METABLOOM_CHAT_PROTOCOL_VERSION,
  resolveMetabloomEmote,
} = require("./metabloomEmoteLibrary");
const { METABLOOM_ACTION_IDS } = require("./metabloomDecisionMapping");
const { parseMetabloomResearchSources } = require("./metabloomResearchSources");
const { parseMetabloomResearchReferenceMetadata, parseMetabloomResearchAnswerSources,
  MAX_METABLOOM_REUSED_RESEARCH_SOURCES } = require("./metabloomResearchReference");
const { parseMetabloomProgressSource } = require("./metabloomSourceMediaProtocol");
const { MAX_METABLOOM_RESEARCH_REPORT_BYTES, MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS,
  getMetabloomUtf8ByteLength, parseMetabloomResearchReport } = require("./metabloomResearchReport");
const { MAX_METABLOOM_RESEARCH_BRIEF_BYTES, MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS,
  parseMetabloomClientResearchBrief: parseMetabloomResearchBrief } = require("./metabloomResearchBriefProtocol");
const { METABLOOM_STREAM_ERROR_CODES, parseMetabloomRequestError, getMetabloomApiErrorMessage } = require("./metabloomRequestErrors");
const { parseMetabloomAgentActivity, MAX_METABLOOM_AGENT_CALLS } = require('./metabloomAgentTools');

const MAX_SERIALIZED_CHARS = 24000;
// Allow bounded NDJSON framing even when all 4,800 text characters arrive singly.
const MAX_METABLOOM_STREAM_BYTES = 320000;
const MAX_METABLOOM_RESEARCH_STREAM_BYTES = 2 * (MAX_METABLOOM_RESEARCH_REPORT_BYTES + MAX_METABLOOM_RESEARCH_BRIEF_BYTES);
const MAX_METABLOOM_RESEARCH_PROGRESS_CHARS = 200;
const MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS = 24;
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
const cloneResearchSources = (sources) => sources?.map(({ id, title, url }) => ({ id, title, url })) || null;
const cloneResearchReport = (report) => report ? { notes: report.notes, sources: cloneResearchSources(report.sources) } : null;

// Protocol v1 remains supported for previews and external adapters. Live model
// responses use v2: one input emote, optional provisional text deltas committed
// by exact segments, verified text completion, then a final emote and done.
// Research records opt into searching, sources, then synthesis before any text.
const createMetabloomSegmentStreamDecoder = ({
  allowMultiple = true,
  allowResearchDetails = false,
  allowResearchBrief = false,
  allowResearchReuse = false,
  allowTools = false,
  maxBufferChars = MAX_SERIALIZED_CHARS,
  onDone,
  onError,
  onSegment,
  onTextDelta,
  onReaction,
  onAction,
  onResearch,
  onResearchProgress,
  onResearchDetails,
  onResearchBrief,
  onResearchReference,
  onSources,
  onToolActivity,
} = {}) => {
  const limit = Number.isInteger(maxBufferChars) && maxBufferChars > 0
    ? Math.min(maxBufferChars, MAX_SERIALIZED_CHARS) : MAX_SERIALIZED_CHARS;
  let buffer = "";
  let receivedChars = 0;
  let consumedStreamBytes = 0;
  let totalResponseChars = 0;
  let completed = false;
  let errorMessage = "";
  let errorDetails = null;
  let version = null;
  let inputEmote = null;
  let responseEmote = null;
  let textComplete = false;
  let partialResponse = null;
  let action = null;
  let researchState = null;
  let researchSummary = null;
  let researchSource = null;
  let researchProgressCount = 0;
  let researchReportStarted = false;
  let researchReportSources = [];
  let researchReportChunks = [];
  let researchReportChars = 0;
  let researchDetails = null;
  let researchBriefChunks = [];
  let researchBriefChars = 0;
  let researchBrief = null;
  let researchReference = null;
  let researchReused = false;
  let sources = null;
  const toolCalls = new Set();
  let activeTool = null;
  let searched = false;
  const toolTextReady = () => !activeTool && (!searched || sources !== null);
  const segments = [];
  const fail = (message, details = null) => {
    if (!errorMessage) {
      errorMessage = message;
      errorDetails = details ? { ...details } : null;
      const error = new Error(message);
      if (errorDetails) Object.assign(error, errorDetails);
      onError?.(error);
    }
    return false;
  };
  const envelope = () => ({ version: version || METABLOOM_PROTOCOL_VERSION, segments: segments.map(cloneChatSegment) });
  const streamByteLimit = () => allowResearchDetails === true && researchState !== null
    ? MAX_METABLOOM_RESEARCH_STREAM_BYTES : MAX_METABLOOM_STREAM_BYTES;
  const consume = (line) => {
    if (!line.trim()) return true;
    if (completed) return fail("Metabloom stream continued after completion.");
    let event;
    try { event = JSON.parse(line); } catch { return fail("Malformed stream JSON."); }
    if (event?.type === "error") {
      const legacy = exactKeys(event, ["type", "code"]) && event.code === "stream_interrupted";
      if ((!legacy && !exactKeys(event, ["type", "code", "requestRef"]))
        || !METABLOOM_STREAM_ERROR_CODES.includes(event.code)) return fail("Invalid stream error.");
      const details = parseMetabloomRequestError({ code: event.code, ...(!legacy ? { requestRef: event.requestRef } : {}) });
      return details ? fail(getMetabloomApiErrorMessage(details.code), details) : fail("Invalid stream error.");
    }
    if (toolCalls.size && typeof event?.type === 'string' && event.type.startsWith('research')) return fail('Research and chat tool streams cannot be mixed.');
    if (event?.type === 'tool_activity') {
      const activity = parseMetabloomAgentActivity(event);
      if (!allowTools || !activity || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !['none', 'under-the-hood'].includes(action) || researchState !== null || sources !== null
        || segments.length || partialResponse !== null || textComplete) return fail('Invalid tool activity.');
      if (activity.state === 'running') {
        if (activeTool || toolCalls.has(activity.callId) || toolCalls.size >= MAX_METABLOOM_AGENT_CALLS) return fail('Invalid tool execution order.');
        toolCalls.add(activity.callId);
        activeTool = activity;
      } else {
        if (!activeTool || activeTool.callId !== activity.callId || activeTool.name !== activity.name) return fail('Invalid tool completion.');
        if (activity.name === 'search_web' && activity.state === 'complete') searched = true;
        activeTool = null;
      }
      onToolActivity?.(activity);
      return true;
    }
    if (event?.type === 'tool_sources') {
      if (!allowTools || !exactKeys(event, ['type', 'sources']) || !searched || activeTool || sources !== null
        || researchState !== null || segments.length || partialResponse !== null || textComplete) return fail('Invalid tool sources.');
      const parsed = parseMetabloomResearchSources(event.sources);
      if (!parsed) return fail('Invalid tool sources.');
      sources = parsed;
      onSources?.(cloneResearchSources(sources));
      return true;
    }
    if (event?.type === "action") {
      if (!exactKeys(event, ["type", "action"]) || !METABLOOM_ACTION_IDS.includes(event.action)
        || version !== METABLOOM_CHAT_PROTOCOL_VERSION || action !== null
        || toolCalls.size || segments.length || partialResponse !== null || textComplete) {
        return fail("Invalid or out-of-order action choice.");
      }
      action = event.action;
      onAction?.(action);
      return true;
    }
    if (event?.type === "research") {
      if (!exactKeys(event, ["type", "state"]) || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !(action === "deep-research" || (researchReused && action === "none"))
        || segments.length || partialResponse !== null || textComplete
        || !((event.state === "searching" && !researchReused && researchState === null && sources === null)
          || (event.state === "synthesizing" && ["searching", "reusing"].includes(researchState) && sources !== null))) {
        return fail("Invalid or out-of-order research state.");
      }
      researchState = event.state;
      researchSource = null;
      onResearch?.({ state: researchState });
      return true;
    }
    if (event?.type === "research_reuse") {
      const metadata = parseMetabloomResearchReferenceMetadata(event.research);
      if (allowResearchReuse !== true || allowResearchDetails !== true || !exactKeys(event, ["type", "research"])
        || version !== METABLOOM_CHAT_PROTOCOL_VERSION || action !== "none" || researchState !== null
        || researchReference || researchReused || sources || segments.length || partialResponse !== null || textComplete || !metadata)
        return fail("Invalid or out-of-order research reuse.");
      researchReused = true;
      researchState = "reusing";
      researchReference = metadata;
      onResearch?.({ state: "reusing" });
      onResearchReference?.({ ...researchReference });
      return true;
    }
    if (event?.type === "research_reference") {
      const metadata = parseMetabloomResearchReferenceMetadata(event.research);
      if (allowResearchReuse !== true || allowResearchDetails !== true || !exactKeys(event, ["type", "research"])
        || version !== METABLOOM_CHAT_PROTOCOL_VERSION || action !== "deep-research" || researchReused
        || !researchDetails || !metadata || segments.length || partialResponse !== null || textComplete)
        return fail("Invalid or out-of-order research reference.");
      if (researchReference) {
        if (!researchBrief || researchState !== "synthesizing" || researchReference.briefId || !metadata.briefId
          || Object.keys(researchReference).some(key => researchReference[key] !== metadata[key]))
          return fail("Research reference changed.");
      } else if (researchState !== "searching" || sources || metadata.briefId) return fail("Invalid research reference.");
      researchReference = metadata;
      onResearchReference?.({ ...researchReference });
      return true;
    }
    if (event?.type === "research_progress") {
      if (!(exactKeys(event, ["type", "summary"]) || exactKeys(event, ["type", "summary", "source"])) || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !(action === "deep-research" || (researchReused && action === "none"))
        || !["searching", "reusing", "synthesizing"].includes(researchState)
        || segments.length || partialResponse !== null || textComplete
        || typeof event.summary !== "string" || !event.summary.trim()
        || event.summary.length > MAX_METABLOOM_RESEARCH_PROGRESS_CHARS || event.summary !== event.summary.trim()
        || Array.from(event.summary).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
        || researchProgressCount >= MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS) {
        return fail("Invalid or out-of-order research progress.");
      }
      researchProgressCount += 1;
      researchSummary = event.summary;
      researchSource = parseMetabloomProgressSource(event.source);
      onResearchProgress?.({ summary: researchSummary, ...(researchSource ? { source: { ...researchSource } } : {}) });
      return true;
    }
    if (["research_report_sources", "research_report_delta", "research_report_complete"].includes(event?.type)) {
      if (allowResearchDetails !== true || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !(action === "deep-research" || (researchReused && action === "none"))
        || !["searching", "reusing"].includes(researchState) || sources !== null
        || researchDetails !== null || segments.length || partialResponse !== null || textComplete) {
        return fail("Invalid or out-of-order research report.");
      }
      if (event.type === "research_report_sources") {
        if (!exactKeys(event, ["type", "sources"]) || researchReportChunks.length) return fail("Invalid research report sources.");
        const batch = parseMetabloomResearchSources(event.sources, { startId: researchReportSources.length + 1 });
        if (!batch) return fail("Invalid research report sources.");
        researchReportStarted = true;
        researchReportSources.push(...batch);
        return true;
      }
      if (event.type === "research_report_delta") {
        if (!exactKeys(event, ["type", "index", "delta"]) || !researchReportStarted
          || event.index !== researchReportChunks.length || typeof event.delta !== "string" || !event.delta.length
          || event.delta.length > MAX_METABLOOM_RESEARCH_REPORT_CHUNK_CHARS
          || researchReportChars + event.delta.length > MAX_METABLOOM_RESEARCH_REPORT_BYTES) {
          return fail("Invalid or out-of-order research report text.");
        }
        researchReportChars += event.delta.length;
        researchReportChunks.push(event.delta);
        return true;
      }
      if (!exactKeys(event, ["type"]) || !researchReportStarted || !researchReportChunks.length) {
        return fail("Invalid research report completion.");
      }
      const report = parseMetabloomResearchReport({ notes: researchReportChunks.join(""), sources: researchReportSources });
      if (!report) return fail("Invalid research report.");
      researchDetails = report;
      researchReportSources = [];
      researchReportChunks = [];
      onResearchDetails?.(cloneResearchReport(researchDetails));
      return true;
    }
    if (["research_brief_delta", "research_brief_complete"].includes(event?.type)) {
      if (allowResearchBrief !== true || allowResearchDetails !== true || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !(action === "deep-research" || (researchReused && action === "none"))
        || researchState !== "synthesizing" || !researchDetails || !sources
        || researchBrief !== null || segments.length || partialResponse !== null || textComplete) {
        return fail("Invalid or out-of-order research brief.");
      }
      if (event.type === "research_brief_delta") {
        if (!exactKeys(event, ["type", "index", "delta"]) || event.index !== researchBriefChunks.length
          || typeof event.delta !== "string" || !event.delta.length || event.delta.length > MAX_METABLOOM_RESEARCH_BRIEF_CHUNK_CHARS
          || researchBriefChars + event.delta.length > MAX_METABLOOM_RESEARCH_BRIEF_BYTES) return fail("Invalid research brief text.");
        researchBriefChars += event.delta.length;
        researchBriefChunks.push(event.delta);
        return true;
      }
      if (!exactKeys(event, ["type"]) || !researchBriefChunks.length) return fail("Invalid research brief completion.");
      researchBrief = parseMetabloomResearchBrief(researchBriefChunks.join(""), { sources: researchDetails.sources });
      if (!researchBrief) return fail("Invalid research brief.");
      researchBriefChunks = [];
      onResearchBrief?.(parseMetabloomResearchBrief(researchBrief, { sources: researchDetails.sources }));
      return true;
    }
    if (event?.type === "sources") {
      if (!(researchReused ? exactKeys(event, ["type", "sourceIds"]) : exactKeys(event, ["type", "sources"]))
        || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !(action === "deep-research" || (researchReused && action === "none"))
        || !["searching", "reusing"].includes(researchState) || sources !== null
        || (researchReportStarted && researchDetails === null)
        || segments.length || partialResponse !== null || textComplete) {
        return fail("Invalid or out-of-order research sources.");
      }
      let parsedSources;
      if (researchReused) {
        if (!researchDetails || !Array.isArray(event.sourceIds) || !event.sourceIds.length
          || event.sourceIds.length > MAX_METABLOOM_REUSED_RESEARCH_SOURCES
          || event.sourceIds.some(id => !Number.isSafeInteger(id) || id < 1)) return fail("Invalid research sources.");
        parsedSources = parseMetabloomResearchAnswerSources(event.sourceIds.map(id => researchDetails.sources[id - 1]), { report: researchDetails });
      } else parsedSources = parseMetabloomResearchSources(event.sources);
      if (!parsedSources) return fail("Invalid research sources.");
      if (researchDetails && parsedSources.some((source) => {
        const original = researchDetails.sources[source.id - 1];
        return !original || original.url !== source.url || original.title !== source.title;
      })) return fail("Research source map changed.");
      sources = parsedSources;
      onSources?.(cloneResearchSources(sources));
      return true;
    }
    if (event?.type === "text_delta") {
      if (!exactKeys(event, ["type", "index", "delta"]) || version !== METABLOOM_CHAT_PROTOCOL_VERSION
        || !toolTextReady()
        || textComplete || event.index !== segments.length || typeof event.delta !== "string" || !event.delta.length
        || (researchBriefChars > 0 && researchBrief === null)
        || (researchState !== null && researchState !== "synthesizing")
        || segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
        return fail("Invalid or out-of-order text delta.");
      }
      const next = (partialResponse || "") + event.delta;
      if (next.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS
        || totalResponseChars + next.length > MAX_METABLOOM_EMOTE_TOTAL_CHARS) return fail("Stream text limit exceeded.");
      partialResponse = next;
      onTextDelta?.(event.delta, event.index);
      return true;
    }
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
        || !toolTextReady()
        || (researchState !== null && researchState !== "synthesizing")
        || !segments.length || partialResponse !== null || textComplete) return fail("Invalid text completion.");
      textComplete = true;
      return true;
    }
    if (event?.type === "done") {
      if (!exactKeys(event, ["type", "version"]) || !toolTextReady() || !segments.length || event.version !== version) {
        return fail("Invalid or empty stream completion.");
      }
      if (version === METABLOOM_CHAT_PROTOCOL_VERSION && (!textComplete || !responseEmote)) {
        return fail("Jev stream ended without both reactions.");
      }
      if (researchState !== null && (researchState !== "synthesizing" || sources === null)) {
        return fail("Research stream ended before synthesis.");
      }
      if (researchReportStarted && researchDetails === null) return fail("Research report was not completed.");
      if (researchBriefChars > 0 && researchBrief === null) return fail("Research brief was not completed.");
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
      || !toolTextReady()
      || (researchBriefChars > 0 && researchBrief === null)
      || (researchState !== null && researchState !== "synthesizing")
      || (version === METABLOOM_CHAT_PROTOCOL_VERSION && textComplete)) {
      return fail("Invalid or out-of-order stream segment.");
    }
    const segment = version === METABLOOM_CHAT_PROTOCOL_VERSION
      ? normalizeTextSegment({ response: event.response })
      : normalizeSegment({ emote: event.emote, response: event.response });
    if (!segment || segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) {
      return fail("Invalid stream segment or segment limit exceeded.");
    }
    if (partialResponse !== null && segment.response !== partialResponse) {
      return fail("Completed segment did not match the streamed text.");
    }
    totalResponseChars += event.response.length;
    if (totalResponseChars > MAX_METABLOOM_EMOTE_TOTAL_CHARS) return fail("Stream text limit exceeded.");
    partialResponse = null;
    segments.push(segment);
    onSegment?.(cloneChatSegment(segment), segments.length - 1);
    return true;
  };
  const consumeRecord = (line, newlineBytes = 0) => {
    const bytes = getMetabloomUtf8ByteLength(line) + newlineBytes;
    if (consumedStreamBytes + bytes > streamByteLimit()) return fail("Stream size limit exceeded.");
    consumedStreamBytes += bytes;
    return consume(line);
  };
  const drain = () => {
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      if (newline > limit) return fail("Stream record limit exceeded.");
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!consumeRecord(line, 1)) return false;
    }
    if (buffer.length > limit) return fail("Stream buffer limit exceeded.");
    return consumedStreamBytes + getMetabloomUtf8ByteLength(buffer) <= streamByteLimit() || fail("Stream size limit exceeded.");
  };
  return Object.freeze({
    push(chunk) {
      if (errorMessage) return false;
      if (typeof chunk !== "string") return fail("Stream chunks must be text.");
      receivedChars += chunk.length;
      // The record-by-record byte check keeps the ordinary cap until searching
      // is validated, even when one network chunk also contains a large report.
      if (receivedChars > (allowResearchDetails === true ? MAX_METABLOOM_RESEARCH_STREAM_BYTES : MAX_METABLOOM_STREAM_BYTES)) {
        return fail("Stream size limit exceeded.");
      }
      buffer += chunk;
      return drain();
    },
    finish() {
      if (!errorMessage && buffer.trim()) consumeRecord(buffer);
      buffer = "";
      if (!errorMessage && !completed) fail("Stream ended before its completion record.");
      return errorMessage ? { ok: false, error: errorMessage, ...errorDetails } : { ok: true, value: envelope() };
    },
    getState() {
      return { bufferLength: buffer.length, completed, failed: Boolean(errorMessage),
        nextIndex: segments.length, segments: segments.map(cloneChatSegment), version,
        inputEmote, responseEmote, textComplete, action, researchState,
        researchSummary, researchSource: researchSource ? { ...researchSource } : null, researchProgressCount,
        researchDetails: cloneResearchReport(researchDetails),
        researchBrief: researchBrief ? parseMetabloomResearchBrief(researchBrief, { sources: researchDetails.sources }) : null,
        researchReference: researchReference ? { ...researchReference } : null, researchReused,
        sources: cloneResearchSources(sources) };
    },
  });
};

module.exports = { MAX_METABLOOM_STREAM_BYTES, MAX_METABLOOM_RESEARCH_STREAM_BYTES,
  MAX_METABLOOM_RESEARCH_PROGRESS_CHARS, MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS,
  parseMetabloomEmoteEnvelope, parseMetabloomChatEnvelope, createMetabloomSegmentStreamDecoder };
