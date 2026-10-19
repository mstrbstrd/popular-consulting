import {
  MAX_METABLOOM_EMOTE_SEGMENTS,
  MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
  MAX_METABLOOM_EMOTE_TOTAL_CHARS,
} from "./metabloomEmoteLibrary";
import { MAX_METABLOOM_RESPONSE_CHARS } from "./metabloomResponseContract";

export const RESEARCH_REVEAL_GRAPHEMES_PER_FRAME = 24;

const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const graphemes = (text) => segmenter
  ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
const textLength = (snapshot) => snapshot?.segments.reduce((total, segment) => total + segment.response.length, 0) || 0;
const hasDisplayContent = (snapshot) => textLength(snapshot) > 0 || Boolean(snapshot?.researchDetails && snapshot.status === "error");
const cloneSnapshot = (snapshot) => ({ ...snapshot, segments: snapshot.segments.map((segment) => ({ ...segment })),
  ...(snapshot.sources ? { sources: snapshot.sources.map((source) => ({ ...source })) } : {}),
  ...(snapshot.researchDetails ? { researchDetails: { notes: snapshot.researchDetails.notes,
    sources: snapshot.researchDetails.sources.map((source) => ({ ...source })) } } : {}) });

// The reply session remains the authority for parsing and final validation. This
// view holds one bounded, coalesced target instead of retaining every tiny delta.
export const createMetabloomResearchDisplayGate = ({
  onUpdate,
  onFirstContent,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (frame) => window.cancelAnimationFrame(frame),
}) => {
  let enabled = false;
  let released = false;
  let cancelled = false;
  let finished = false;
  let frame = 0;
  let firstFrame = true;
  let target = null;
  let visible = null;
  let visibleLengths = [];
  let completion = null;
  const reactions = new Map();
  const hasBacklog = () => Boolean(target?.segments.some((segment, index) =>
    (visibleLengths[index] || 0) < segment.response.length));
  const publish = (snapshot) => {
    visible = cloneSnapshot(snapshot);
    onUpdate(visible);
  };
  const publishPrefix = () => {
    const segments = [];
    target.segments.forEach((segment, index) => {
      const length = visibleLengths[index] || 0;
      if (!length) return;
      segments.push(length === segment.response.length
        ? { ...segment } : { response: segment.response.slice(0, length) });
    });
    if (!segments.length) return;
    publish({
      ...target,
      segments,
      content: segments.map((segment) => segment.response).join("\n\n"),
      emote: segments.at(-1).emote || "neutral",
      status: "streaming",
    });
  };
  const finishIfReady = () => {
    if (!completion || !released || hasBacklog() || cancelled || finished) return false;
    finished = true;
    publish(target);
    const callback = completion;
    completion = null;
    const readyReactions = [...reactions.values()];
    reactions.clear();
    readyReactions.forEach((react) => react());
    callback();
    return true;
  };
  const schedule = () => {
    if (!frame && released && hasBacklog() && !cancelled && !finished) frame = requestFrame(reveal);
  };
  const reveal = () => {
    frame = 0;
    if (cancelled || finished || !released || !target) return;
    const previousLength = textLength(visible);
    let budget = RESEARCH_REVEAL_GRAPHEMES_PER_FRAME;
    if (firstFrame) {
      const available = target.segments.reduce((total, segment) => total + graphemes(segment.response).length, 0);
      // Even a short, already-complete reply gets a visible prefix before its end.
      budget = Math.min(budget, Math.max(1, Math.ceil(available / 2)));
      firstFrame = false;
    }
    for (let index = 0; index < target.segments.length && budget > 0; index += 1) {
      const response = target.segments[index].response;
      const start = visibleLengths[index] || 0;
      const parts = graphemes(response.slice(start));
      let take = Math.min(budget, parts.length);
      // An upstream chunk may stop between the UTF-16 halves of an emoji.
      // Keep that unfinished character buffered until its continuation arrives.
      if (take && /[\uD800-\uDBFF]$/.test(parts[take - 1]) && target.status !== "complete") take -= 1;
      visibleLengths[index] = start + parts.slice(0, take).join("").length;
      budget -= take;
      if (visibleLengths[index] < response.length) break;
    }
    publishPrefix();
    if (!finishIfReady() && textLength(visible) > previousLength) schedule();
  };

  return Object.freeze({
    hold() {
      if (cancelled || finished || textLength(visible)) return false;
      enabled = true;
      return true;
    },
    update(snapshot, { legacy = false, incremental = false, researchFailure = false } = {}) {
      if (cancelled || finished) return false;
      if (researchFailure) {
        // A writer failure may reveal its completed report, but not answer text
        // that was still held for validation. Keep any already-visible prefix.
        snapshot = { ...snapshot, segments: visible?.segments || [],
          content: visible?.content || "", emote: visible?.emote || "neutral" };
      }
      if (!enabled) {
        target = cloneSnapshot(snapshot);
        publish(snapshot);
        return true;
      }
      if (snapshot.segments.length > MAX_METABLOOM_EMOTE_SEGMENTS
        || snapshot.segments.some((segment) => segment.response.length > (legacy ? MAX_METABLOOM_RESPONSE_CHARS : MAX_METABLOOM_EMOTE_RESPONSE_CHARS))
        || textLength(snapshot) > MAX_METABLOOM_EMOTE_TOTAL_CHARS) throw new Error("Research display limit exceeded.");
      const firstContent = !hasDisplayContent(target) && hasDisplayContent(snapshot);
      const wasCaughtUp = released && !frame && !hasBacklog();
      target = cloneSnapshot(snapshot);
      if (firstContent) onFirstContent();
      if (cancelled) return false;
      const lastSegment = target.segments.at(-1);
      // Once caught up, real provider deltas retain their normal immediate path.
      // Whole legacy paragraphs still reveal over frames instead of appearing at once.
      if (wasCaughtUp && (!hasBacklog() || (incremental && !/[\uD800-\uDBFF]$/.test(lastSegment?.response || "")))) {
        visibleLengths = target.segments.map((segment) => segment.response.length);
        publishPrefix();
      }
      if (!finishIfReady()) schedule();
      return true;
    },
    deferReaction(key, callback) {
      if (!enabled) { callback(); return true; }
      if (cancelled || finished || reactions.has(key) || reactions.size >= MAX_METABLOOM_EMOTE_SEGMENTS + 1) return false;
      reactions.set(key, callback);
      return true;
    },
    complete(callback) {
      if (cancelled || finished || completion) return false;
      if (!enabled) { finished = true; callback(); return true; }
      completion = callback;
      if (!finishIfReady()) schedule();
      return true;
    },
    release() {
      if (!enabled || cancelled || finished || released) return false;
      released = true;
      // Leave a paint with the returned orb before the first text update. The
      // following frame starts revealing, even when the provider is already done.
      if (!finishIfReady()) frame = requestFrame(() => { frame = 0; schedule(); });
      return true;
    },
    cancel(reason = "interrupted") {
      if (cancelled || finished) return;
      cancelled = true;
      cancelFrame(frame);
      frame = 0;
      target = null;
      completion = null;
      reactions.clear();
      if (enabled && textLength(visible)) publish({ ...visible, status: reason === "error" ? "error" : "interrupted" });
    },
    get enabled() { return enabled; },
    get hasContent() { return hasDisplayContent(target) || hasDisplayContent(visible); },
    get blocked() { return enabled && !cancelled && !finished && (!released || hasBacklog()); },
    get phase() { return cancelled ? "cancelled" : finished ? "complete" : !enabled ? "immediate" : !released ? "surfacing" : hasBacklog() ? "revealing" : "live"; },
    get bufferedChars() { return Math.max(0, textLength(target) - textLength(visible)); },
  });
};
