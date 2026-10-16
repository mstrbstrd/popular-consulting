const { parseMetabloomEmoteEnvelope, parseMetabloomChatEnvelope } = require("../src/components/metabloomEmoteProtocol");
const {
  METABLOOM_PROTOCOL_VERSION, METABLOOM_CHAT_PROTOCOL_VERSION,
  MAX_METABLOOM_EMOTE_SEGMENTS, MAX_METABLOOM_EMOTE_RESPONSE_CHARS, MAX_METABLOOM_EMOTE_TOTAL_CHARS,
} = require("../src/components/metabloomEmoteLibrary");

// A deliberately small incremental grammar for the ordered structured-output schema.
// Text previews are incomplete until their strict segment and envelope commits. Never repair JSON.
const JSON_STRING = '"(?:[^"\\\\\\u0000-\\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
const SEGMENT = new RegExp(`^\\{\\s*"emote"\\s*:\\s*${JSON_STRING}\\s*,\\s*"response"\\s*:\\s*${JSON_STRING}\\s*\\}$`);
const PREFIX = /^\s*\{\s*"version"\s*:\s*"1\.0\.0"\s*,\s*"segments"\s*:\s*\[/;
const TEXT_SEGMENT = new RegExp(`^\\{\\s*"response"\\s*:\\s*${JSON_STRING}\\s*\\}$`);
const CHAT_PREFIX = /^[ \t\r\n]*\{[ \t\r\n]*"version"[ \t\r\n]*:[ \t\r\n]*"2\.0\.0"[ \t\r\n]*,[ \t\r\n]*"segments"[ \t\r\n]*:[ \t\r\n]*\[/;
const JSON_WHITESPACE = /[ \t\r\n]/;
const JSON_ESCAPES = Object.freeze({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" });

const createEnvelopeReader = ({ allowMultiple = false, onSegment, onTextDelta, textOnly = false }) => {
  const expectedVersion = textOnly ? METABLOOM_CHAT_PROTOCOL_VERSION : METABLOOM_PROTOCOL_VERSION;
  const segmentGrammar = textOnly ? TEXT_SEGMENT : SEGMENT;
  const prefixGrammar = textOnly ? CHAT_PREFIX : PREFIX;
  const validate = textOnly ? parseMetabloomChatEnvelope : parseMetabloomEmoteEnvelope;
  let text = "", cursor = 0, state = "prefix", start = 0;
  let inString = false, escape = false, depth = 0;
  const previewEnabled = textOnly && typeof onTextDelta === "function";
  let textState = "key", keyCursor = 0, unicodeDigits = null;
  let responsePreview = "", previewCursor = 0, trailingWhitespace = "", highSurrogate = "";
  let responseChars = 0, totalChars = 0;
  const segments = [];
  const appendResponseUnit = (unit) => {
    responseChars += unit.length;
    totalChars += unit.length;
    if (responseChars > MAX_METABLOOM_EMOTE_RESPONSE_CHARS || totalChars > MAX_METABLOOM_EMOTE_TOTAL_CHARS) {
      throw new Error("Response text limit exceeded");
    }
    const code = unit.charCodeAt(0);
    if (highSurrogate) {
      if (code < 0xdc00 || code > 0xdfff) throw new Error("Unpaired response surrogate");
      unit = highSurrogate + unit;
      highSurrogate = "";
    } else if (code >= 0xd800 && code <= 0xdbff) {
      highSurrogate = unit;
      return;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("Unpaired response surrogate");
    // The final schema trims each paragraph. Keep a possible trailing run private
    // until a following character proves it belongs inside the visible text.
    if (!unit.trim()) {
      if (responsePreview) trailingWhitespace += unit;
    } else {
      responsePreview += trailingWhitespace + unit;
      trailingWhitespace = "";
    }
  };
  const flushPreview = async () => {
    if (!previewEnabled || previewCursor === responsePreview.length) return;
    const end = responsePreview.length;
    await onTextDelta(responsePreview.slice(previewCursor, end), segments.length);
    previewCursor = end;
  };
  return {
    async push(delta) {
      if (typeof delta !== "string" || text.length + delta.length > 24000) throw new Error("Invalid output length");
      text += delta;
      if (state === "prefix") {
        const match = text.match(prefixGrammar);
        if (!match) { if (text.length > 128) throw new Error("Invalid output prefix"); return; }
        cursor = match[0].length;
        state = "segment";
      }
      while (cursor < text.length) {
        const char = text[cursor];
        if (state === "segment") {
          if (JSON_WHITESPACE.test(char)) { cursor++; continue; }
          if (char !== "{") throw new Error("Expected a segment");
          if (segments.length >= (allowMultiple ? MAX_METABLOOM_EMOTE_SEGMENTS : 1)) throw new Error("Too many response segments");
          start = cursor;
          depth = 0; inString = false; escape = false;
          textState = "key"; keyCursor = 0; unicodeDigits = null;
          responsePreview = ""; previewCursor = 0; trailingWhitespace = ""; highSurrogate = ""; responseChars = 0;
          state = "object";
        }
        if (state === "object") {
          cursor++;
          if (previewEnabled) {
            if (cursor - 1 === start) { depth = 1; continue; }
            if (textState === "key") {
              if (!keyCursor && JSON_WHITESPACE.test(char)) continue;
              if (char !== '"response"'[keyCursor++]) throw new Error("Invalid response field");
              if (keyCursor === '"response"'.length) textState = "colon";
              continue;
            }
            if (textState === "colon" || textState === "value") {
              if (JSON_WHITESPACE.test(char)) continue;
              if (char !== (textState === "colon" ? ":" : '"')) throw new Error("Invalid response value");
              textState = textState === "colon" ? "value" : "text";
              continue;
            }
            if (textState === "text") {
              if (unicodeDigits !== null) {
                if (!/[0-9a-fA-F]/.test(char)) throw new Error("Invalid Unicode escape");
                unicodeDigits += char;
                if (unicodeDigits.length === 4) {
                  appendResponseUnit(String.fromCharCode(parseInt(unicodeDigits, 16)));
                  unicodeDigits = null;
                }
              } else if (escape) {
                escape = false;
                if (char === "u") unicodeDigits = "";
                else {
                  if (!Object.prototype.hasOwnProperty.call(JSON_ESCAPES, char)) throw new Error("Invalid response escape");
                  appendResponseUnit(JSON_ESCAPES[char]);
                }
              } else if (char === "\\") escape = true;
              else if (char === '"') {
                if (highSurrogate) throw new Error("Unpaired response surrogate");
                textState = "end";
              } else {
                if (char.charCodeAt(0) < 0x20) throw new Error("Unescaped response control character");
                appendResponseUnit(char);
              }
              continue;
            }
            if (JSON_WHITESPACE.test(char)) continue;
            if (char !== "}") throw new Error("Invalid segment grammar");
            depth = 0;
          } else if (inString) {
            if (escape) escape = false;
            else if (char === "\\") escape = true;
            else if (char === '"') inString = false;
          } else if (char === '"') inString = true;
          else if (char === "{") depth++;
          else if (char === "}") depth--;
          if (depth !== 0 || inString) continue;
          const serialized = text.slice(start, cursor);
          if (!segmentGrammar.test(serialized)) throw new Error("Invalid segment grammar");
          const candidate = JSON.parse(serialized);
          const parsed = validate({ version: expectedVersion, segments: [...segments, candidate] }, { allowMultiple });
          if (!parsed.ok) throw new Error(parsed.error);
          if (previewEnabled && parsed.value.segments[segments.length].response !== responsePreview) throw new Error("Inconsistent response preview");
          await flushPreview();
          segments.push(parsed.value.segments[segments.length]);
          await onSegment(segments[segments.length - 1], segments.length - 1);
          state = "separator";
        } else if (state === "separator") {
          cursor++;
          if (JSON_WHITESPACE.test(char)) continue;
          if (char === ",") state = "segment";
          else if (char === "]") state = "suffix";
          else throw new Error("Invalid segment separator");
        } else if (state === "suffix") {
          cursor++;
          if (JSON_WHITESPACE.test(char)) continue;
          if (char !== "}") throw new Error("Invalid envelope suffix");
          state = "end";
        } else {
          cursor++;
          if (!JSON_WHITESPACE.test(char)) throw new Error("Trailing output");
        }
      }
      await flushPreview();
    },
    finish(finalText) {
      if (state !== "end" || (finalText !== undefined && finalText !== text)) throw new Error("Incomplete or inconsistent output");
      const parsed = validate(text, { allowMultiple });
      if (!parsed.ok || JSON.stringify(parsed.value.segments) !== JSON.stringify(segments)) throw new Error("Invalid completed envelope");
      return parsed.value;
    },
  };
};

const streamMetabloomProvider = async (upstream, { allowMultiple = false, onSegment, onTextDelta, signal, textOnly = false }) => {
  if (!upstream.body?.getReader || !upstream.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Expected provider SSE");
  const reader = upstream.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const envelope = createEnvelopeReader({ allowMultiple, onSegment, onTextDelta, textOnly });
  let buffer = "", data = [], bytes = 0, completed = false, outputKey = null;
  let outputTextDone;
  let result;
  const consume = async () => {
    if (!data.length) return;
    const serialized = data.join("\n"); data = [];
    if (serialized === "[DONE]") { if (!completed) throw new Error("Premature SSE completion"); return; }
    const event = JSON.parse(serialized);
    if (["error", "response.failed", "response.incomplete", "response.refusal.delta", "response.refusal.done"].includes(event.type)) throw new Error("Provider did not complete safely");
    if (event.type === "response.output_text.delta" || event.type === "response.output_text.done") {
      const key = `${event.item_id}:${event.output_index}:${event.content_index}`;
      if (outputKey !== null && key !== outputKey) throw new Error("Multiple output channels");
      outputKey = key;
      if (event.type.endsWith(".delta")) {
        if (outputTextDone !== undefined) throw new Error("Text continued after done");
        await envelope.push(event.delta);
      } else outputTextDone = event.text;
    }
    if (event.type === "response.completed") {
      if (event.response?.status !== "completed") throw new Error("Incomplete provider response");
      const content = (event.response.output || []).filter((item) => item.type === "message").flatMap((item) => item.content || []);
      if (content.some((part) => part.type === "refusal")) throw new Error("Provider refusal");
      const finalText = content.filter((part) => part.type === "output_text").map((part) => part.text).join("");
      if (outputTextDone !== undefined && outputTextDone !== finalText) throw new Error("Inconsistent final text");
      result = envelope.finish(finalText);
      completed = true;
    }
  };
  try {
    while (!completed) {
      const chunk = await reader.read();
      if (signal?.aborted) throw new Error("Cancelled");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256000) throw new Error("Provider stream too large");
      buffer += utf8.decode(chunk.value, { stream: true });
      let newline;
      while (!completed && (newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line) await consume();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (!completed) throw new Error("Provider stream ended without completion");
    return result;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
module.exports = { createEnvelopeReader, streamMetabloomProvider };
