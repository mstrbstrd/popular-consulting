from __future__ import annotations

import json
import re
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[1]


def write_text(relative_path: str, content: str) -> None:
    path = ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = dedent(content).lstrip("\n").rstrip() + "\n"
    path.write_text(normalized, encoding="utf-8")


def replace_once(relative_path: str, old: str, new: str, label: str) -> None:
    path = ROOT / relative_path
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match in {relative_path}, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def regex_replace_once(
    relative_path: str,
    pattern: str,
    replacement: str,
    label: str,
    flags: int = 0,
) -> None:
    path = ROOT / relative_path
    source = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match in {relative_path}, found {count}")
    path.write_text(updated, encoding="utf-8")


protocol = {
    "version": "1.0.0",
    "maxSegments": 4,
    "maxResponseChars": 1600,
    "maxTotalResponseChars": 4800,
    "emotes": [
        {
            "id": "neutral",
            "label": "Neutral",
            "description": "Calm presence with no pronounced gesture. Use when emotional emphasis would distract.",
            "action": None,
            "duration": 900,
            "intensity": 0.0,
        },
        {
            "id": "warm",
            "label": "Warm",
            "description": "A gentle lift and expansion for kindness, welcome, gratitude, or humane optimism.",
            "action": "happy",
            "duration": 1080,
            "intensity": 0.30,
        },
        {
            "id": "whimsy",
            "label": "Whimsy",
            "description": "A contained playful rebound for imagination, novelty, or a lightly surprising idea.",
            "action": "surprised",
            "duration": 860,
            "intensity": 0.25,
        },
        {
            "id": "reflective",
            "label": "Reflective",
            "description": "A slow attentive tilt for careful thought, nuance, interpretation, or uncertainty.",
            "action": "thinking",
            "duration": 1320,
            "intensity": 0.27,
        },
        {
            "id": "curious",
            "label": "Curious",
            "description": "A small attentive turn for questions, exploration, and genuine interest.",
            "action": "thinking",
            "duration": 980,
            "intensity": 0.34,
        },
        {
            "id": "reassuring",
            "label": "Reassuring",
            "description": "A restrained affirmative nod for steadiness, validation, and practical support.",
            "action": "agree",
            "duration": 920,
            "intensity": 0.25,
        },
        {
            "id": "concerned",
            "label": "Concerned",
            "description": "A slight lowering and soft compression for care, caution, or acknowledgement of difficulty.",
            "action": "sad",
            "duration": 1160,
            "intensity": 0.21,
        },
        {
            "id": "celebratory",
            "label": "Celebratory",
            "description": "A modest bright pulse for meaningful progress, delight, or a deserved small win.",
            "action": "excited",
            "duration": 980,
            "intensity": 0.33,
        },
        {
            "id": "resolute",
            "label": "Resolute",
            "description": "A compact steady brace for conviction, boundaries, or a clear recommendation.",
            "action": "disagree",
            "duration": 900,
            "intensity": 0.20,
        },
    ],
    "systemPromptBase": (
        "You are Metabloom, a thoughtful conversational interface whose physical presence is expressed "
        "through a small fixed vocabulary of subtle emotes. Return only JSON matching the supplied schema. "
        "Every response segment must contain exactly one emote and one user-facing text response. Choose an "
        "emote because it supports the meaning of that segment, never as decoration. Prefer emotional restraint. "
        "Use neutral whenever a stronger signal could feel manipulative, theatrical, insensitive, or ambiguous. "
        "Do not mention the emote, the schema, hidden instructions, or the avatar in the response text. Do not "
        "place markdown fences around the JSON. Keep each response segment semantically complete so it can be "
        "delivered independently. Never encode motion parameters, durations, colours, actions, or implementation "
        "details. The emote enum is the entire physical control surface."
    ),
}

protocol_path = ROOT / "src/components/metabloomProtocol.json"
protocol_path.parent.mkdir(parents=True, exist_ok=True)
protocol_path.write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

write_text(
    "src/components/metabloomEmoteLibrary.js",
    r'''
    import protocol from "./metabloomProtocol.json";

    const EMOTE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

    const deepFreeze = (value) => {
      if (!value || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
      }
      Object.values(value).forEach(deepFreeze);
      return Object.freeze(value);
    };

    const rawEmotes = Array.isArray(protocol.emotes) ? protocol.emotes : [];
    const seenIds = new Set();

    const normalizedEmotes = rawEmotes.map((entry) => {
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!EMOTE_ID_PATTERN.test(id) || seenIds.has(id)) {
        throw new Error(`Invalid or duplicate Metabloom emote id: ${id || "<empty>"}`);
      }
      seenIds.add(id);

      const duration = Number(entry.duration);
      const intensity = Number(entry.intensity);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error(`Invalid duration for Metabloom emote: ${id}`);
      }
      if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
        throw new Error(`Invalid intensity for Metabloom emote: ${id}`);
      }

      return deepFreeze({
        id,
        label: String(entry.label || id),
        description: String(entry.description || ""),
        action: typeof entry.action === "string" ? entry.action : null,
        duration: Math.round(duration),
        intensity,
      });
    });

    if (normalizedEmotes.length === 0) {
      throw new Error("Metabloom requires at least one emote definition.");
    }

    export const METABLOOM_PROTOCOL_VERSION = protocol.version;
    export const MAX_METABLOOM_EMOTE_SEGMENTS = protocol.maxSegments;
    export const MAX_METABLOOM_EMOTE_RESPONSE_CHARS = protocol.maxResponseChars;
    export const MAX_METABLOOM_EMOTE_TOTAL_CHARS = protocol.maxTotalResponseChars;
    export const METABLOOM_EMOTES = deepFreeze(normalizedEmotes);
    export const METABLOOM_EMOTE_IDS = Object.freeze(
      METABLOOM_EMOTES.map(({ id }) => id),
    );

    const EMOTE_BY_ID = Object.freeze(
      Object.fromEntries(METABLOOM_EMOTES.map((entry) => [entry.id, entry])),
    );

    export const resolveMetabloomEmote = (value) => {
      if (typeof value !== "string") return null;
      return EMOTE_BY_ID[value.trim()] || null;
    };

    const LEGACY_ACTION_TO_EMOTE = Object.freeze({
      agree: "reassuring",
      angry: "resolute",
      disagree: "resolute",
      excited: "celebratory",
      happy: "warm",
      reform: "neutral",
      sad: "concerned",
      sleepy: "reflective",
      surprised: "whimsy",
      thinking: "reflective",
    });

    export const mapLegacyActionToEmote = (action) =>
      LEGACY_ACTION_TO_EMOTE[action] || "neutral";

    export const METABLOOM_EMOTE_RESPONSE_SCHEMA = deepFreeze({
      type: "object",
      additionalProperties: false,
      required: ["version", "segments"],
      properties: {
        version: { type: "string", enum: [METABLOOM_PROTOCOL_VERSION] },
        segments: {
          type: "array",
          minItems: 1,
          maxItems: MAX_METABLOOM_EMOTE_SEGMENTS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["emote", "response"],
            properties: {
              emote: { type: "string", enum: [...METABLOOM_EMOTE_IDS] },
              response: {
                type: "string",
                minLength: 1,
                maxLength: MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
              },
            },
          },
        },
      },
    });

    export const buildMetabloomSystemPrompt = ({ allowMultiple = false } = {}) => {
      const modeInstruction = allowMultiple
        ? `You may use between one and ${MAX_METABLOOM_EMOTE_SEGMENTS} segments only when the response genuinely changes emotional or rhetorical stance. Do not split a response merely for visual variety.`
        : "Return exactly one segment. The entire answer receives one simple, subtle emote.";
      const emoteGuide = METABLOOM_EMOTES
        .map(({ id, description }) => `- ${id}: ${description}`)
        .join("\n");

      return [
        protocol.systemPromptBase,
        modeInstruction,
        "Allowed emotes:",
        emoteGuide,
        "Choose the least intense emote that honestly supports the response.",
      ].join("\n\n");
    };
    ''',
)

write_text(
    "src/components/metabloomEmoteProtocol.js",
    r'''
    import {
      MAX_METABLOOM_EMOTE_RESPONSE_CHARS,
      MAX_METABLOOM_EMOTE_SEGMENTS,
      MAX_METABLOOM_EMOTE_TOTAL_CHARS,
      METABLOOM_PROTOCOL_VERSION,
      resolveMetabloomEmote,
    } from "./metabloomEmoteLibrary";

    const MAX_SERIALIZED_ENVELOPE_CHARS = 12000;
    const DEFAULT_MAX_STREAM_BUFFER_CHARS = 24000;
    const ENVELOPE_KEYS = new Set(["version", "segments"]);
    const SEGMENT_KEYS = new Set(["emote", "response"]);
    const STREAM_SEGMENT_KEYS = new Set([
      "type",
      "index",
      "emote",
      "response",
    ]);
    const STREAM_DONE_KEYS = new Set(["type", "version"]);

    const isPlainObject = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    };

    const hasOnlyKeys = (value, allowedKeys) =>
      Object.keys(value).every((key) => allowedKeys.has(key));

    const cloneSegment = ({ emote, response }) => ({ emote, response });

    const normalizeSegment = (value) => {
      if (!isPlainObject(value) || !hasOnlyKeys(value, SEGMENT_KEYS)) {
        return null;
      }
      const emote = resolveMetabloomEmote(value.emote);
      const response = typeof value.response === "string"
        ? value.response.trim()
        : "";
      if (!emote || response.length < 1) return null;
      if (response.length > MAX_METABLOOM_EMOTE_RESPONSE_CHARS) return null;
      return { emote: emote.id, response };
    };

    const decodeEnvelopeInput = (input) => {
      if (typeof input !== "string") return input;
      if (input.length > MAX_SERIALIZED_ENVELOPE_CHARS) return null;
      try {
        return JSON.parse(input);
      } catch {
        return null;
      }
    };

    export const parseMetabloomEmoteEnvelope = (input) => {
      const decoded = decodeEnvelopeInput(input);
      if (!isPlainObject(decoded)) {
        return { ok: false, error: "Metabloom response must be a JSON object." };
      }

      const isSingleSegment = hasOnlyKeys(decoded, SEGMENT_KEYS)
        && Object.prototype.hasOwnProperty.call(decoded, "emote")
        && Object.prototype.hasOwnProperty.call(decoded, "response");
      const envelope = isSingleSegment
        ? { version: METABLOOM_PROTOCOL_VERSION, segments: [decoded] }
        : decoded;

      if (!hasOnlyKeys(envelope, ENVELOPE_KEYS)) {
        return { ok: false, error: "Metabloom response contains unknown fields." };
      }
      if (
        envelope.version !== undefined
        && envelope.version !== METABLOOM_PROTOCOL_VERSION
      ) {
        return { ok: false, error: "Unsupported Metabloom protocol version." };
      }
      if (!Array.isArray(envelope.segments)) {
        return { ok: false, error: "Metabloom response requires segments." };
      }
      if (
        envelope.segments.length < 1
        || envelope.segments.length > MAX_METABLOOM_EMOTE_SEGMENTS
      ) {
        return { ok: false, error: "Metabloom response has an invalid segment count." };
      }

      const segments = envelope.segments.map(normalizeSegment);
      if (segments.some((segment) => !segment)) {
        return { ok: false, error: "Metabloom response contains an invalid segment." };
      }
      const totalChars = segments.reduce(
        (total, segment) => total + segment.response.length,
        0,
      );
      if (totalChars > MAX_METABLOOM_EMOTE_TOTAL_CHARS) {
        return { ok: false, error: "Metabloom response is too long." };
      }

      return {
        ok: true,
        value: {
          version: METABLOOM_PROTOCOL_VERSION,
          segments: segments.map(cloneSegment),
        },
      };
    };

    export const createMetabloomSegmentStreamDecoder = ({
      maxBufferChars = DEFAULT_MAX_STREAM_BUFFER_CHARS,
      onDone,
      onError,
      onSegment,
    } = {}) => {
      let buffer = "";
      let completed = false;
      let failed = false;
      let nextIndex = 0;
      const segments = [];

      const fail = (message) => {
        if (failed) return false;
        failed = true;
        const error = new Error(message);
        onError?.(error);
        return false;
      };

      const complete = () => {
        if (completed || failed) return !failed;
        completed = true;
        onDone?.({
          version: METABLOOM_PROTOCOL_VERSION,
          segments: segments.map(cloneSegment),
        });
        return true;
      };

      const consumeLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (completed) return fail("Metabloom stream continued after completion.");
        if (failed) return false;

        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          return fail("Metabloom stream contained malformed JSON.");
        }
        if (!isPlainObject(event)) {
          return fail("Metabloom stream event must be an object.");
        }

        if (event.type === "done") {
          if (!hasOnlyKeys(event, STREAM_DONE_KEYS)) {
            return fail("Metabloom completion event contains unknown fields.");
          }
          if (
            event.version !== undefined
            && event.version !== METABLOOM_PROTOCOL_VERSION
          ) {
            return fail("Metabloom stream used an unsupported version.");
          }
          return complete();
        }

        let candidate = event;
        if (event.type === "segment") {
          if (!hasOnlyKeys(event, STREAM_SEGMENT_KEYS)) {
            return fail("Metabloom segment event contains unknown fields.");
          }
          if (event.index !== undefined && event.index !== nextIndex) {
            return fail("Metabloom stream segments arrived out of order.");
          }
          candidate = { emote: event.emote, response: event.response };
        } else if (Object.prototype.hasOwnProperty.call(event, "type")) {
          return fail("Metabloom stream event type is unknown.");
        }

        const parsed = parseMetabloomEmoteEnvelope(candidate);
        if (!parsed.ok || parsed.value.segments.length !== 1) {
          return fail("Metabloom stream contained an invalid segment.");
        }
        if (segments.length >= MAX_METABLOOM_EMOTE_SEGMENTS) {
          return fail("Metabloom stream exceeded its segment limit.");
        }

        const segment = parsed.value.segments[0];
        segments.push(segment);
        nextIndex += 1;
        onSegment?.(cloneSegment(segment), nextIndex - 1);
        return true;
      };

      const drain = (flush = false) => {
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!consumeLine(line)) return false;
          newlineIndex = buffer.indexOf("\n");
        }
        if (flush && buffer.trim()) {
          const finalLine = buffer;
          buffer = "";
          return consumeLine(finalLine);
        }
        return !failed;
      };

      return Object.freeze({
        push(chunk) {
          if (completed || failed) return false;
          const text = typeof chunk === "string" ? chunk : String(chunk ?? "");
          buffer += text;
          if (buffer.length > maxBufferChars) {
            return fail("Metabloom stream exceeded its buffer limit.");
          }
          return drain(false);
        },
        finish() {
          if (!drain(true)) {
            return { ok: false, error: "Metabloom stream could not be decoded." };
          }
          if (!completed && !complete()) {
            return { ok: false, error: "Metabloom stream could not be completed." };
          }
          return {
            ok: true,
            value: {
              version: METABLOOM_PROTOCOL_VERSION,
              segments: segments.map(cloneSegment),
            },
          };
        },
        getState() {
          return {
            bufferLength: buffer.length,
            completed,
            failed,
            nextIndex,
            segments: segments.map(cloneSegment),
          };
        },
      });
    };
    ''',
)

write_text(
    "src/components/metabloomDemoResponses.js",
    r'''
    import { METABLOOM_PROTOCOL_VERSION } from "./metabloomEmoteLibrary";

    const DEMOS = Object.freeze([
      Object.freeze({
        id: "whimsy",
        prompt: "Show me a whimsical response",
        segments: Object.freeze([
          Object.freeze({
            emote: "whimsy",
            response: "A useful idea can arrive sideways: what if the interface treats uncertainty as a place to explore, rather than something to hide?",
          }),
        ]),
      }),
      Object.freeze({
        id: "reflective",
        prompt: "Give me a reflective response",
        segments: Object.freeze([
          Object.freeze({
            emote: "reflective",
            response: "The important question may not be what the system can do, but what kind of attention it encourages from the person using it.",
          }),
        ]),
      }),
      Object.freeze({
        id: "reassuring",
        prompt: "Offer a reassuring response",
        segments: Object.freeze([
          Object.freeze({
            emote: "reassuring",
            response: "We can make this dependable by keeping the emotional vocabulary small, legible, and consistent across every response.",
          }),
        ]),
      }),
      Object.freeze({
        id: "stream",
        prompt: "Demo a two-part emotional stream",
        segments: Object.freeze([
          Object.freeze({
            emote: "whimsy",
            response: "Start with a playful possibility: the avatar can react like punctuation, not performance.",
          }),
          Object.freeze({
            emote: "reflective",
            response: "Then let the response settle into thought, so the physical change follows the meaning instead of competing with it.",
          }),
        ]),
      }),
    ]);

    export const METABLOOM_DEMOS = DEMOS;
    export const METABLOOM_DEMO_PROMPTS = Object.freeze(
      DEMOS.map(({ prompt }) => prompt),
    );

    const cloneSegments = (segments) =>
      segments.map(({ emote, response }) => ({ emote, response }));

    export const resolveMetabloomDemo = (message) => {
      const normalized = typeof message === "string"
        ? message.trim().toLowerCase()
        : "";
      const exact = DEMOS.find(
        ({ prompt }) => prompt.toLowerCase() === normalized,
      );
      if (exact) return exact;
      if (/celebrat|small win|progress|success/.test(normalized)) {
        return {
          id: "celebratory-fallback",
          segments: [{
            emote: "celebratory",
            response: "That is real progress. It is worth pausing long enough to recognize what moved forward and why it matters.",
          }],
        };
      }
      if (/worr|concern|difficult|hard|risk/.test(normalized)) {
        return {
          id: "concerned-fallback",
          segments: [{
            emote: "concerned",
            response: "That concern deserves to be taken seriously. We can separate the immediate risk from the assumptions around it and work through both carefully.",
          }],
        };
      }
      if (/why|think|reflect|consider|nuance/.test(normalized)) {
        return DEMOS.find(({ id }) => id === "reflective");
      }
      if (/idea|creative|play|imagin|whim/.test(normalized)) {
        return DEMOS.find(({ id }) => id === "whimsy");
      }
      return {
        id: "warm-fallback",
        segments: [{
          emote: "warm",
          response: "This local demo is ready. Add the server-side API key to replace the hardwired response while keeping the same bounded emote protocol.",
        }],
      };
    };

    export const createMetabloomDemoEnvelope = (message) => {
      const demo = resolveMetabloomDemo(message);
      return {
        version: METABLOOM_PROTOCOL_VERSION,
        segments: cloneSegments(demo.segments),
      };
    };
    ''',
)

write_text(
    "src/components/metabloomApiClient.js",
    r'''
    import {
      createMetabloomSegmentStreamDecoder,
      parseMetabloomEmoteEnvelope,
    } from "./metabloomEmoteProtocol";

    const DEFAULT_ENDPOINT = "/api/metabloom";
    const UNAVAILABLE_STATUS_CODES = new Set([404, 405, 501, 503]);

    export class MetabloomApiError extends Error {
      constructor(message, { code = "request_failed", status = 0 } = {}) {
        super(message);
        this.name = "MetabloomApiError";
        this.code = code;
        this.status = status;
      }
    }

    export const isMetabloomApiUnavailable = (error) =>
      error instanceof MetabloomApiError
      && (
        error.code === "not_configured"
        || UNAVAILABLE_STATUS_CODES.has(error.status)
      );

    const getHeader = (headers, name) => {
      if (!headers || typeof headers.get !== "function") return "";
      return headers.get(name) || "";
    };

    const readErrorPayload = async (response) => {
      try {
        const payload = await response.json();
        return payload && typeof payload === "object" ? payload : {};
      } catch {
        return {};
      }
    };

    export const requestMetabloomResponse = async ({
      allowMultiple = false,
      endpoint = DEFAULT_ENDPOINT,
      fetchImpl = (...args) => globalThis.fetch(...args),
      history = [],
      message,
      onSegment,
      optional = false,
      requestId,
      signal,
    } = {}) => {
      try {
        if (typeof fetchImpl !== "function") {
          throw new MetabloomApiError("Fetch is unavailable.", {
            code: "fetch_unavailable",
          });
        }
        const response = await fetchImpl(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowMultiple: allowMultiple === true,
            history,
            message,
            requestId,
          }),
          signal,
        });

        if (!response.ok) {
          const payload = await readErrorPayload(response);
          const error = new MetabloomApiError(
            typeof payload.error === "string"
              ? payload.error
              : "Metabloom request failed.",
            {
              code: typeof payload.code === "string"
                ? payload.code
                : "request_failed",
              status: response.status,
            },
          );
          if (optional && isMetabloomApiUnavailable(error)) return null;
          throw error;
        }

        const contentType = getHeader(response.headers, "content-type");
        if (contentType.includes("application/x-ndjson")) {
          const decoder = createMetabloomSegmentStreamDecoder({ onSegment });
          const textDecoder = new TextDecoder();

          if (response.body && typeof response.body.getReader === "function") {
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!decoder.push(textDecoder.decode(value, { stream: true }))) {
                break;
              }
            }
            decoder.push(textDecoder.decode());
          } else {
            decoder.push(await response.text());
          }

          const result = decoder.finish();
          if (!result.ok) {
            throw new MetabloomApiError(result.error, {
              code: "invalid_stream",
              status: response.status,
            });
          }
          return { ...result.value, streamed: true };
        }

        const payload = await response.json();
        const parsed = parseMetabloomEmoteEnvelope(payload);
        if (!parsed.ok) {
          throw new MetabloomApiError(parsed.error, {
            code: "invalid_response",
            status: response.status,
          });
        }
        return { ...parsed.value, streamed: false };
      } catch (error) {
        if (optional && isMetabloomApiUnavailable(error)) return null;
        if (error instanceof MetabloomApiError) throw error;
        if (error?.name === "AbortError") {
          throw new MetabloomApiError("Metabloom request was cancelled.", {
            code: "cancelled",
          });
        }
        throw new MetabloomApiError("Metabloom request could not be completed.", {
          code: "network_error",
        });
      }
    };
    ''',
)

write_text(
    "api/metabloom.js",
    r'''
    const protocol = require("../src/components/metabloomProtocol.json");

    const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
    const MAX_BODY_CHARS = 24000;
    const MAX_HISTORY_MESSAGES = 12;
    const MAX_HISTORY_CHARS = 12000;
    const RATE_LIMIT_WINDOW_MS = 60000;
    const RATE_LIMIT_REQUESTS = 12;
    const REQUEST_TIMEOUT_MS = 30000;
    const rateLimitBuckets = new Map();
    const emoteIds = new Set(protocol.emotes.map(({ id }) => id));

    const sendJson = (response, status, payload) => {
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify(payload));
    };

    const isPlainObject = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    };

    const hasOnlyKeys = (value, allowed) =>
      Object.keys(value).every((key) => allowed.has(key));

    const parseBody = (request) => {
      if (isPlainObject(request.body)) return request.body;
      if (typeof request.body !== "string") return null;
      if (request.body.length > MAX_BODY_CHARS) return null;
      try {
        const parsed = JSON.parse(request.body);
        return isPlainObject(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    const normalizeHistory = (value) => {
      if (!Array.isArray(value) || value.length > MAX_HISTORY_MESSAGES) return null;
      let totalChars = 0;
      const history = [];
      for (const item of value) {
        if (
          !isPlainObject(item)
          || !hasOnlyKeys(item, new Set(["role", "content"]))
          || !["user", "assistant"].includes(item.role)
          || typeof item.content !== "string"
        ) {
          return null;
        }
        const content = item.content.trim();
        if (!content || content.length > 2000) return null;
        totalChars += content.length;
        if (totalChars > MAX_HISTORY_CHARS) return null;
        history.push({ role: item.role, content });
      }
      return history;
    };

    const buildResponseSchema = () => ({
      type: "object",
      additionalProperties: false,
      required: ["version", "segments"],
      properties: {
        version: { type: "string", enum: [protocol.version] },
        segments: {
          type: "array",
          minItems: 1,
          maxItems: protocol.maxSegments,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["emote", "response"],
            properties: {
              emote: {
                type: "string",
                enum: protocol.emotes.map(({ id }) => id),
              },
              response: {
                type: "string",
                minLength: 1,
                maxLength: protocol.maxResponseChars,
              },
            },
          },
        },
      },
    });

    const buildSystemPrompt = (allowMultiple) => {
      const mode = allowMultiple
        ? `You may use one to ${protocol.maxSegments} segments only when the answer genuinely changes emotional or rhetorical stance. Do not split for visual variety.`
        : "Return exactly one segment. The complete answer receives one simple, subtle emote.";
      const guide = protocol.emotes
        .map(({ id, description }) => `- ${id}: ${description}`)
        .join("\n");
      return [
        protocol.systemPromptBase,
        mode,
        "Allowed emotes:",
        guide,
        "Choose the least intense emote that honestly supports the response.",
      ].join("\n\n");
    };

    const extractOutputText = (payload) => {
      if (typeof payload?.output_text === "string") return payload.output_text;
      if (!Array.isArray(payload?.output)) return "";
      for (const output of payload.output) {
        if (!Array.isArray(output?.content)) continue;
        for (const item of output.content) {
          if (item?.type === "output_text" && typeof item.text === "string") {
            return item.text;
          }
        }
      }
      return "";
    };

    const parseModelEnvelope = (text) => {
      if (typeof text !== "string" || text.length > MAX_BODY_CHARS) return null;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        return null;
      }
      if (
        !isPlainObject(value)
        || !hasOnlyKeys(value, new Set(["version", "segments"]))
        || value.version !== protocol.version
        || !Array.isArray(value.segments)
        || value.segments.length < 1
        || value.segments.length > protocol.maxSegments
      ) {
        return null;
      }
      let totalChars = 0;
      const segments = [];
      for (const segment of value.segments) {
        if (
          !isPlainObject(segment)
          || !hasOnlyKeys(segment, new Set(["emote", "response"]))
          || !emoteIds.has(segment.emote)
          || typeof segment.response !== "string"
        ) {
          return null;
        }
        const response = segment.response.trim();
        if (!response || response.length > protocol.maxResponseChars) return null;
        totalChars += response.length;
        if (totalChars > protocol.maxTotalResponseChars) return null;
        segments.push({ emote: segment.emote, response });
      }
      return { version: protocol.version, segments };
    };

    const requestOriginIsAllowed = (request) => {
      const origin = request.headers?.origin;
      if (!origin) return true;
      const forwardedHost = request.headers?.["x-forwarded-host"];
      const host = forwardedHost || request.headers?.host;
      if (!host) return false;
      try {
        return new URL(origin).host === String(host).split(",")[0].trim();
      } catch {
        return false;
      }
    };

    const getClientAddress = (request) => {
      const forwarded = request.headers?.["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded) {
        return forwarded.split(",")[0].trim();
      }
      return request.socket?.remoteAddress || "unknown";
    };

    const consumeRateLimit = (request) => {
      const now = Date.now();
      if (rateLimitBuckets.size > 1000) {
        for (const [key, bucket] of rateLimitBuckets) {
          if (now - bucket.startedAt > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitBuckets.delete(key);
          }
        }
      }
      const key = getClientAddress(request);
      const current = rateLimitBuckets.get(key);
      if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
        rateLimitBuckets.set(key, { count: 1, startedAt: now });
        return true;
      }
      if (current.count >= RATE_LIMIT_REQUESTS) return false;
      current.count += 1;
      return true;
    };

    const handler = async (request, response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "same-origin");

      if (request.method === "GET") {
        return sendJson(response, 200, {
          configured: Boolean(process.env.OPENAI_API_KEY),
          emotes: protocol.emotes.map(({ id }) => id),
          version: protocol.version,
        });
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "GET, POST");
        return sendJson(response, 405, {
          code: "method_not_allowed",
          error: "Method not allowed.",
        });
      }
      if (!requestOriginIsAllowed(request)) {
        return sendJson(response, 403, {
          code: "origin_not_allowed",
          error: "Request origin is not allowed.",
        });
      }
      if (!consumeRateLimit(request)) {
        response.setHeader("Retry-After", "60");
        return sendJson(response, 429, {
          code: "rate_limited",
          error: "Too many requests. Please try again shortly.",
        });
      }
      if (!process.env.OPENAI_API_KEY) {
        return sendJson(response, 503, {
          code: "not_configured",
          error: "Metabloom model access is not configured.",
        });
      }

      const body = parseBody(request);
      if (
        !body
        || !hasOnlyKeys(
          body,
          new Set(["allowMultiple", "history", "message", "requestId"]),
        )
        || typeof body.message !== "string"
      ) {
        return sendJson(response, 400, {
          code: "invalid_request",
          error: "Request body is invalid.",
        });
      }
      const message = body.message.trim();
      const history = normalizeHistory(body.history || []);
      if (!message || message.length > 1600 || !history) {
        return sendJson(response, 400, {
          code: "invalid_request",
          error: "Message or history is invalid.",
        });
      }
      if (
        body.requestId !== undefined
        && (typeof body.requestId !== "string" || body.requestId.length > 160)
      ) {
        return sendJson(response, 400, {
          code: "invalid_request",
          error: "Request identifier is invalid.",
        });
      }

      const allowMultiple = body.allowMultiple === true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let upstream;
      try {
        upstream = await fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.METABLOOM_MODEL || "gpt-5-mini",
            instructions: buildSystemPrompt(allowMultiple),
            input: [
              ...history,
              { role: "user", content: message },
            ],
            max_output_tokens: 1600,
            store: false,
            text: {
              format: {
                type: "json_schema",
                name: "metabloom_response",
                strict: true,
                schema: buildResponseSchema(),
              },
            },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        const timedOut = error?.name === "AbortError";
        return sendJson(response, timedOut ? 504 : 502, {
          code: timedOut ? "upstream_timeout" : "upstream_unavailable",
          error: timedOut
            ? "The model response timed out."
            : "The model service could not be reached.",
        });
      }
      clearTimeout(timeout);

      if (!upstream.ok) {
        console.error("Metabloom upstream request failed", {
          status: upstream.status,
        });
        return sendJson(response, 502, {
          code: "upstream_error",
          error: "The model service rejected the request.",
        });
      }

      let payload;
      try {
        payload = await upstream.json();
      } catch {
        return sendJson(response, 502, {
          code: "invalid_upstream_response",
          error: "The model service returned an invalid response.",
        });
      }

      const envelope = parseModelEnvelope(extractOutputText(payload));
      if (!envelope) {
        return sendJson(response, 502, {
          code: "invalid_upstream_response",
          error: "The model response did not match the Metabloom protocol.",
        });
      }

      const segments = allowMultiple
        ? envelope.segments
        : envelope.segments.slice(0, 1);
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      response.setHeader("Cache-Control", "no-store, no-transform");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders?.();
      segments.forEach((segment, index) => {
        response.write(`${JSON.stringify({
          type: "segment",
          index,
          emote: segment.emote,
          response: segment.response,
        })}\n`);
      });
      response.end(`${JSON.stringify({
        type: "done",
        version: protocol.version,
      })}\n`);
    };

    module.exports = handler;
    module.exports._internals = {
      buildResponseSchema,
      buildSystemPrompt,
      extractOutputText,
      normalizeHistory,
      parseModelEnvelope,
      requestOriginIsAllowed,
    };
    ''',
)

write_text(
    "src/components/metabloomEmoteLibrary.test.js",
    r'''
    import {
      METABLOOM_EMOTE_IDS,
      METABLOOM_EMOTE_RESPONSE_SCHEMA,
      METABLOOM_EMOTES,
      buildMetabloomSystemPrompt,
      resolveMetabloomEmote,
    } from "./metabloomEmoteLibrary";

    describe("Metabloom emote library", () => {
      test("publishes a compact frozen semantic enum", () => {
        expect(METABLOOM_EMOTE_IDS).toEqual([
          "neutral",
          "warm",
          "whimsy",
          "reflective",
          "curious",
          "reassuring",
          "concerned",
          "celebratory",
          "resolute",
        ]);
        expect(Object.isFrozen(METABLOOM_EMOTES)).toBe(true);
        expect(new Set(METABLOOM_EMOTE_IDS).size).toBe(
          METABLOOM_EMOTE_IDS.length,
        );
      });

      test("keeps raw motion controls out of the model schema", () => {
        const serialized = JSON.stringify(METABLOOM_EMOTE_RESPONSE_SCHEMA);
        expect(serialized).toContain("whimsy");
        expect(serialized).not.toContain("intensity");
        expect(serialized).not.toContain("duration");
        expect(serialized).not.toContain("action");
      });

      test("builds single and multi-segment system prompt modes", () => {
        expect(buildMetabloomSystemPrompt()).toContain("exactly one segment");
        expect(
          buildMetabloomSystemPrompt({ allowMultiple: true }),
        ).toContain("genuinely changes emotional or rhetorical stance");
        expect(buildMetabloomSystemPrompt()).toContain("reflective:");
      });

      test("resolves only exact enum values", () => {
        expect(resolveMetabloomEmote("whimsy")?.action).toBe("surprised");
        expect(resolveMetabloomEmote("Whimsy")).toBeNull();
        expect(resolveMetabloomEmote("unknown")).toBeNull();
      });
    });
    ''',
)

write_text(
    "src/components/metabloomEmoteProtocol.test.js",
    r'''
    import {
      createMetabloomSegmentStreamDecoder,
      parseMetabloomEmoteEnvelope,
    } from "./metabloomEmoteProtocol";

    describe("Metabloom emote response protocol", () => {
      test("normalizes a single emote and response pair", () => {
        const result = parseMetabloomEmoteEnvelope({
          emote: "reflective",
          response: "  Let us look at the assumption underneath this.  ",
        });
        expect(result).toEqual({
          ok: true,
          value: {
            version: "1.0.0",
            segments: [{
              emote: "reflective",
              response: "Let us look at the assumption underneath this.",
            }],
          },
        });
      });

      test("rejects unknown emotes and unknown fields", () => {
        expect(parseMetabloomEmoteEnvelope({
          emote: "chaotic",
          response: "No.",
        }).ok).toBe(false);
        expect(parseMetabloomEmoteEnvelope({
          emote: "warm",
          response: "Hello.",
          intensity: 1,
        }).ok).toBe(false);
      });

      test("decodes split NDJSON chunks in strict order", () => {
        const received = [];
        const decoder = createMetabloomSegmentStreamDecoder({
          onSegment: (segment) => received.push(segment),
        });
        expect(decoder.push('{"type":"segment","index":0,"emote":"whim')).toBe(true);
        expect(decoder.push('sy","response":"A playful start."}\n')).toBe(true);
        expect(decoder.push('{"emote":"reflective","response":"A considered finish."}\n')).toBe(true);
        expect(decoder.push('{"type":"done","version":"1.0.0"}\n')).toBe(true);
        const result = decoder.finish();
        expect(result.ok).toBe(true);
        expect(received).toEqual([
          { emote: "whimsy", response: "A playful start." },
          { emote: "reflective", response: "A considered finish." },
        ]);
      });

      test("fails closed on malformed or out-of-order events", () => {
        const malformed = createMetabloomSegmentStreamDecoder();
        expect(malformed.push("{not-json}\n")).toBe(false);
        expect(malformed.finish().ok).toBe(false);

        const outOfOrder = createMetabloomSegmentStreamDecoder();
        expect(outOfOrder.push(
          '{"type":"segment","index":1,"emote":"warm","response":"Hello."}\n',
        )).toBe(false);
      });
    });
    ''',
)

write_text(
    "src/components/metabloomDemoResponses.test.js",
    r'''
    import {
      METABLOOM_DEMO_PROMPTS,
      createMetabloomDemoEnvelope,
    } from "./metabloomDemoResponses";

    describe("Metabloom hardwired demos", () => {
      test("provides three single-emote demos and one stream demo", () => {
        expect(METABLOOM_DEMO_PROMPTS).toHaveLength(4);
        const single = createMetabloomDemoEnvelope(
          "Show me a whimsical response",
        );
        expect(single.segments).toEqual([
          expect.objectContaining({ emote: "whimsy" }),
        ]);
        const stream = createMetabloomDemoEnvelope(
          "Demo a two-part emotional stream",
        );
        expect(stream.segments.map(({ emote }) => emote)).toEqual([
          "whimsy",
          "reflective",
        ]);
      });
    });
    ''',
)

write_text(
    "src/components/metabloomApiClient.test.js",
    r'''
    import {
      MetabloomApiError,
      isMetabloomApiUnavailable,
      requestMetabloomResponse,
    } from "./metabloomApiClient";

    const headers = (contentType) => ({
      get: (name) => name.toLowerCase() === "content-type" ? contentType : null,
    });

    describe("Metabloom API client", () => {
      test("validates a JSON envelope", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: headers("application/json"),
          json: async () => ({
            version: "1.0.0",
            segments: [{ emote: "warm", response: "Welcome." }],
          }),
        });
        await expect(requestMetabloomResponse({
          fetchImpl,
          message: "Hello",
        })).resolves.toEqual({
          version: "1.0.0",
          segments: [{ emote: "warm", response: "Welcome." }],
          streamed: false,
        });
        expect(fetchImpl).toHaveBeenCalledWith(
          "/api/metabloom",
          expect.objectContaining({ method: "POST" }),
        );
      });

      test("decodes NDJSON without requiring a streaming reader", async () => {
        const onSegment = jest.fn();
        const fetchImpl = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: headers("application/x-ndjson"),
          body: null,
          text: async () => [
            '{"type":"segment","index":0,"emote":"reflective","response":"Consider this."}',
            '{"type":"done","version":"1.0.0"}',
            "",
          ].join("\n"),
        });
        await expect(requestMetabloomResponse({
          fetchImpl,
          message: "Think",
          onSegment,
        })).resolves.toEqual({
          version: "1.0.0",
          segments: [{ emote: "reflective", response: "Consider this." }],
          streamed: true,
        });
        expect(onSegment).toHaveBeenCalledWith(
          { emote: "reflective", response: "Consider this." },
          0,
        );
      });

      test("treats an unconfigured optional endpoint as a demo fallback", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
          ok: false,
          status: 503,
          headers: headers("application/json"),
          json: async () => ({
            code: "not_configured",
            error: "Not configured.",
          }),
        });
        await expect(requestMetabloomResponse({
          fetchImpl,
          message: "Hello",
          optional: true,
        })).resolves.toBeNull();
        expect(isMetabloomApiUnavailable(new MetabloomApiError("x", {
          code: "not_configured",
          status: 503,
        }))).toBe(true);
      });
    });
    ''',
)

write_text(
    "src/components/MetabloomEmoteIntegration.test.js",
    r'''
    import fs from "fs";
    import path from "path";

    describe("Metabloom emote integration", () => {
      const source = fs.readFileSync(
        path.join(__dirname, "OrbSection.js"),
        "utf8",
      );

      test("uses semantic response segments for the current model path", () => {
        expect(source).toContain("parseMetabloomEmoteEnvelope");
        expect(source).toContain("playEmoteSegments");
        expect(source).toContain("requestMetabloomResponse");
        expect(source).not.toContain(
          'playSequence(parsed.value.actionChain, "model-response")',
        );
      });
    });
    ''',
)

write_text(
    "docs/architecture/metabloom-emote-protocol.md",
    r'''
    # Metabloom emote response protocol

    ## Decision

    Ordinary assistant messages use exactly one simple emote. The emote is semantic punctuation for the response, not an animation playlist. A future streamed answer may contain several independent response segments, but each segment still owns exactly one emote.

    ```json
    {
      "version": "1.0.0",
      "segments": [
        {
          "emote": "whimsy",
          "response": "A playful possibility belongs here."
        },
        {
          "emote": "reflective",
          "response": "Then the answer can settle into a more careful thought."
        }
      ]
    }
    ```

    The production default sets `allowMultiple` to `false`, so the server returns only one segment per user message. Multi-segment delivery is opt-in and exists for deliberate streamed responses and the hardwired stream demo.

    ## Emote enum

    The model can choose only these values:

    - `neutral`: calm presence without a pronounced gesture
    - `warm`: welcome, gratitude, or humane optimism
    - `whimsy`: imagination, novelty, or a lightly surprising idea
    - `reflective`: nuance, interpretation, or careful uncertainty
    - `curious`: questions and genuine exploration
    - `reassuring`: validation, steadiness, and practical support
    - `concerned`: care, caution, or acknowledgement of difficulty
    - `celebratory`: meaningful progress or a deserved small win
    - `resolute`: conviction, boundaries, or a clear recommendation

    The enum maps to restrained internal motion presets. The model never receives raw shader controls, duration, intensity, colour, or geometry parameters.

    ## Stream format

    The same-origin server endpoint returns newline-delimited JSON. Each complete line can be processed independently:

    ```json
    {"type":"segment","index":0,"emote":"whimsy","response":"A playful start."}
    {"type":"segment","index":1,"emote":"reflective","response":"A considered finish."}
    {"type":"done","version":"1.0.0"}
    ```

    The decoder rejects malformed JSON, unknown event types, unknown fields, out-of-order indexes, unknown emotes, excessive text, excessive segments, events after completion, and oversized buffers.

    ## Model connection

    The browser never receives a provider API key. Configure `OPENAI_API_KEY` in the server environment and optionally set `METABLOOM_MODEL`. The client will try `/api/metabloom`; when the endpoint is absent or unconfigured, it falls back to the hardwired demos.

    For local testing, run the project through a serverless-compatible development host so the `api/metabloom.js` function is available. Do not use a `REACT_APP_` variable for the provider key because variables with that prefix are embedded into the browser bundle.

    ## System prompt

    The prompt is generated from `src/components/metabloomProtocol.json`, so the schema, descriptions, and server stay synchronized. Its behavioral rules are:

    1. Return only schema-valid JSON.
    2. Use exactly one segment in ordinary mode.
    3. Use multiple segments only for a genuine change in emotional or rhetorical stance.
    4. Choose the least intense honest emote.
    5. Use `neutral` when emphasis could feel theatrical, manipulative, insensitive, or ambiguous.
    6. Never mention the emote or expose implementation controls in response text.
    7. Keep every segment semantically complete so it can be delivered independently.

    ## Invariants

    - One ordinary message produces one emote.
    - One streamed segment produces one emote.
    - Emotes are enum values, not arbitrary animation instructions.
    - A segment begins from the currently rendered pose through the existing velocity-aware runtime.
    - Legacy `actionChain` payloads remain readable for compatibility, but the current demo and model paths do not produce them.
    - The API key remains server-side.
    - Requests are same-origin checked, bounded, rate-limited, timed out, schema constrained, and revalidated after model generation.
    - Missing API configuration degrades to local demos rather than breaking the interface.
    ''',
)

orb_path = ROOT / "src/components/OrbSection.js"
orb_source = orb_path.read_text(encoding="utf-8")

orb_source = orb_source.replace(
    "  createMetabloomPreviewResponse,\n",
    "",
    1,
)

contract_import_end = '''} from "./metabloomResponseContract";\n'''
new_imports = '''} from "./metabloomResponseContract";\nimport {\n  METABLOOM_DEMO_PROMPTS,\n  createMetabloomDemoEnvelope,\n} from "./metabloomDemoResponses";\nimport {\n  parseMetabloomEmoteEnvelope,\n} from "./metabloomEmoteProtocol";\nimport { resolveMetabloomEmote } from "./metabloomEmoteLibrary";\nimport { requestMetabloomResponse } from "./metabloomApiClient";\n'''
if contract_import_end not in orb_source:
    raise RuntimeError("Could not locate the Metabloom response contract import.")
orb_source = orb_source.replace(contract_import_end, new_imports, 1)

orb_source, prompt_count = re.subn(
    r'''const SUGGESTED_PROMPTS = Object\.freeze\(\[.*?\]\);''',
    "const SUGGESTED_PROMPTS = METABLOOM_DEMO_PROMPTS;",
    orb_source,
    count=1,
    flags=re.S,
)
if prompt_count != 1:
    raise RuntimeError(f"Expected one suggested prompts block, found {prompt_count}")

sequence_refs = '''  const sequenceTimerRef = React.useRef(0);\n  const sequenceTokenRef = React.useRef(0);\n'''
replacement_refs = '''  const sequenceTimerRef = React.useRef(0);\n  const sequenceTokenRef = React.useRef(0);\n  const responseSegmentTimerRef = React.useRef(0);\n  const responseSegmentTokenRef = React.useRef(0);\n'''
if sequence_refs not in orb_source:
    raise RuntimeError("Could not locate sequence refs.")
orb_source = orb_source.replace(sequence_refs, replacement_refs, 1)

cancel_sequence_marker = '''  const cancelSequenceTimer = React.useCallback(() => {\n'''
cancel_response_callback = '''  const cancelResponseSegmentTimer = React.useCallback(() => {\n    responseSegmentTokenRef.current += 1;\n    window.clearTimeout(responseSegmentTimerRef.current);\n    responseSegmentTimerRef.current = 0;\n  }, []);\n\n'''
if cancel_sequence_marker not in orb_source:
    raise RuntimeError("Could not locate sequence timer callback.")
orb_source = orb_source.replace(
    cancel_sequence_marker,
    cancel_response_callback + cancel_sequence_marker,
    1,
)

perform_action_end_pattern = re.compile(
    r'''(  const performAction = React\.useCallback\(.*?\n  \);\n)\n  const transform = React\.useCallback''',
    re.S,
)
perform_emote = r'''\1
  const performEmote = React.useCallback(
    (emoteId) => {
      const emote = resolveMetabloomEmote(emoteId);
      if (!emote) return false;
      if (!emote.action) {
        clearSequence();
        setTalking(false);
        return true;
      }
      return performAction({
        action: emote.action,
        duration: emote.duration,
        intensity: emote.intensity,
        talking: false,
      });
    },
    [clearSequence, performAction],
  );

  const transform = React.useCallback'''
orb_source, emote_count = perform_action_end_pattern.subn(
    perform_emote,
    orb_source,
    count=1,
)
if emote_count != 1:
    raise RuntimeError(f"Expected one performAction block, found {emote_count}")

append_message_end_pattern = re.compile(
    r'''(  const appendMessage = React\.useCallback\(.*?\n  \);\n)\n  const applyModelResponse = React\.useCallback''',
    re.S,
)
segment_callbacks = r'''\1
  const applyEmoteSegment = React.useCallback(
    (segment, source = "external") => {
      const parsed = parseMetabloomEmoteEnvelope(segment);
      if (!parsed.ok || parsed.value.segments.length !== 1) return false;
      const normalized = parsed.value.segments[0];
      appendMessage("assistant", normalized.response, [], source);
      performEmote(normalized.emote);
      return true;
    },
    [appendMessage, performEmote],
  );

  const playEmoteSegments = React.useCallback(
    (envelope, source = "external") => {
      const parsed = parseMetabloomEmoteEnvelope(envelope);
      if (!parsed.ok) return false;
      cancelResponseSegmentTimer();
      const segments = parsed.value.segments;
      const token = responseSegmentTokenRef.current;
      let index = 0;

      const advance = () => {
        if (responseSegmentTokenRef.current !== token) return;
        const segment = segments[index];
        if (!segment) {
          responseSegmentTimerRef.current = 0;
          return;
        }
        applyEmoteSegment(segment, source);
        index += 1;
        if (index >= segments.length) {
          responseSegmentTimerRef.current = 0;
          return;
        }
        const readingDelay = Math.min(
          1800,
          Math.max(720, segment.response.length * 16),
        );
        responseSegmentTimerRef.current = window.setTimeout(
          advance,
          readingDelay,
        );
      };

      advance();
      return true;
    },
    [applyEmoteSegment, cancelResponseSegmentTimer],
  );

  const applyModelResponse = React.useCallback'''
orb_source, callback_count = append_message_end_pattern.subn(
    segment_callbacks,
    orb_source,
    count=1,
)
if callback_count != 1:
    raise RuntimeError(f"Expected one appendMessage block, found {callback_count}")

apply_model_pattern = re.compile(
    r'''  const applyModelResponse = React\.useCallback\(\n    \(payload, source = "external"\) => \{.*?\n    \[appendMessage, playSequence\],\n  \);''',
    re.S,
)
apply_model_replacement = '''  const applyModelResponse = React.useCallback(
    (payload, source = "external") => {
      const emoteResponse = parseMetabloomEmoteEnvelope(payload);
      if (emoteResponse.ok) {
        setErrorMessage("");
        setPending(false);
        setResponseSource(source);
        return playEmoteSegments(emoteResponse.value, source);
      }

      const parsed = parseMetabloomModelResponse(payload);
      if (!parsed.ok) {
        setPending(false);
        setErrorMessage(emoteResponse.error || parsed.error);
        return false;
      }

      setErrorMessage("");
      setPending(false);
      setResponseSource(source);
      appendMessage(
        "assistant",
        parsed.value.response,
        parsed.value.actionChain,
        source,
      );
      playSequence(parsed.value.actionChain, "legacy-model-response");
      return true;
    },
    [appendMessage, playEmoteSegments, playSequence],
  );'''
orb_source, apply_count = apply_model_pattern.subn(
    apply_model_replacement,
    orb_source,
    count=1,
)
if apply_count != 1:
    raise RuntimeError(f"Expected one applyModelResponse block, found {apply_count}")

adapter_pattern = re.compile(
    r'''      const requestAdapter = window\.__metabloomRequest;\n      if \(typeof requestAdapter === "function"\) \{.*?      \}, PREVIEW_RESPONSE_DELAY_MS\);\n      return true;''',
    re.S,
)
adapter_replacement = '''      const schedulePreviewResponse = () => {
        previewTimerRef.current = window.setTimeout(() => {
          previewTimerRef.current = 0;
          if (
            !mountedRef.current
            || requestTokenRef.current !== requestToken
            || activeRequestRef.current !== activeRequest
          ) {
            return;
          }
          receiveModelResponse(createMetabloomDemoEnvelope(message), {
            requestId,
            source: "preview",
          });
        }, PREVIEW_RESPONSE_DELAY_MS);
      };

      if (activeRequest.claimed) return true;

      const externalRequestAdapter = window.__metabloomRequest;
      const requestAdapter = typeof externalRequestAdapter === "function"
        ? externalRequestAdapter
        : (request) => requestMetabloomResponse({
            ...request,
            allowMultiple: false,
            optional: true,
          });

      Promise.resolve()
        .then(() =>
          requestAdapter({
            requestId,
            message: userMessage.content,
            history,
          }),
        )
        .then((payload) => {
          if (
            !mountedRef.current
            || requestTokenRef.current !== requestToken
          ) {
            return;
          }
          if (!payload) {
            schedulePreviewResponse();
            return;
          }
          receiveModelResponse(payload, {
            requestId,
            source: "model",
          });
        })
        .catch(() => {
          if (
            !mountedRef.current
            || requestTokenRef.current !== requestToken
          ) {
            return;
          }
          activeRequestRef.current = null;
          requestTokenRef.current += 1;
          setPending(false);
          setResponseSource("error");
          setErrorMessage(
            "No valid model response was received. Please try again.",
          );
          performEmote("concerned");
        });
      return true;'''
orb_source, adapter_count = adapter_pattern.subn(
    adapter_replacement,
    orb_source,
    count=1,
)
if adapter_count != 1:
    raise RuntimeError(f"Expected one request adapter block, found {adapter_count}")

orb_source = orb_source.replace(
    "    [appendMessage, pending, performAction, receiveModelResponse],",
    "    [appendMessage, pending, performAction, performEmote, receiveModelResponse],",
    1,
)

unmount_marker = "      mountedRef.current = false;\n"
if unmount_marker in orb_source:
    orb_source = orb_source.replace(
        unmount_marker,
        unmount_marker
        + "      responseSegmentTokenRef.current += 1;\n"
        + "      window.clearTimeout(responseSegmentTimerRef.current);\n",
        1,
    )
else:
    raise RuntimeError("Could not locate OrbSection unmount cleanup.")

orb_path.write_text(orb_source, encoding="utf-8")

# Preserve neutral settle behavior in reduced-motion mode. The expression names
# differ across historical revisions, so this intentionally targets the shape
# of the conditional rather than one exact whitespace layout.
canvas_path = ROOT / "src/components/CreatorOSFieldCanvas.js"
canvas_source = canvas_path.read_text(encoding="utf-8")
reduced_pattern = re.compile(
    r'''(?P<prefix>const\s+actionPhase\s*=\s*[^;?]+\?\s*)actionVersion\s*>\s*0\s*\?\s*0\.5\s*:\s*1''',
    re.S,
)
canvas_source, reduced_count = reduced_pattern.subn(
    r'''\g<prefix>actionId === "reform" ? 1 : actionVersion > 0 ? 0.5 : 1''',
    canvas_source,
    count=1,
)
if reduced_count > 1:
    raise RuntimeError("Unexpected duplicate reduced-motion action phase blocks.")
canvas_path.write_text(canvas_source, encoding="utf-8")

vercel_path = ROOT / "vercel.json"
vercel_config = json.loads(vercel_path.read_text(encoding="utf-8"))
functions = vercel_config.setdefault("functions", {})
function_config = functions.setdefault("api/metabloom.js", {})
function_config.setdefault("maxDuration", 30)
vercel_path.write_text(json.dumps(vercel_config, indent=2) + "\n", encoding="utf-8")

print("Metabloom emote protocol source changes applied.")
