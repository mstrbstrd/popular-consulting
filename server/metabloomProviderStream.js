const { parseMetabloomEmoteEnvelope } = require("../src/components/metabloomEmoteProtocol");
const { METABLOOM_PROTOCOL_VERSION } = require("../src/components/metabloomEmoteLibrary");

// A deliberately small incremental grammar for the ordered structured-output schema.
// Only complete, validated segment objects escape this boundary. Never repair JSON.
const JSON_STRING = '"(?:[^"\\\\\\u0000-\\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
const SEGMENT = new RegExp(`^\\{\\s*"emote"\\s*:\\s*${JSON_STRING}\\s*,\\s*"response"\\s*:\\s*${JSON_STRING}\\s*\\}$`);
const PREFIX = /^\s*\{\s*"version"\s*:\s*"1\.0\.0"\s*,\s*"segments"\s*:\s*\[/;
const createEnvelopeReader = ({ allowMultiple = false, onSegment }) => {
  let text = "", cursor = 0, state = "prefix", start = 0;
  let inString = false, escape = false, depth = 0;
  const segments = [];
  return {
    async push(delta) {
      if (typeof delta !== "string" || text.length + delta.length > 24000) throw new Error("Invalid output length");
      text += delta;
      if (state === "prefix") {
        const match = text.match(PREFIX);
        if (!match) { if (text.length > 128) throw new Error("Invalid output prefix"); return; }
        cursor = match[0].length;
        state = "segment";
      }
      while (cursor < text.length) {
        const char = text[cursor];
        if (state === "segment") {
          if (/\s/.test(char)) { cursor++; continue; }
          if (char !== "{") throw new Error("Expected a segment");
          start = cursor;
          depth = 0; inString = false; escape = false;
          state = "object";
        }
        if (state === "object") {
          cursor++;
          if (inString) {
            if (escape) escape = false;
            else if (char === "\\") escape = true;
            else if (char === '"') inString = false;
          } else if (char === '"') inString = true;
          else if (char === "{") depth++;
          else if (char === "}") depth--;
          if (depth !== 0 || inString) continue;
          const serialized = text.slice(start, cursor);
          if (!SEGMENT.test(serialized)) throw new Error("Invalid segment grammar");
          const candidate = JSON.parse(serialized);
          const parsed = parseMetabloomEmoteEnvelope({ version: METABLOOM_PROTOCOL_VERSION, segments: [...segments, candidate] }, { allowMultiple });
          if (!parsed.ok) throw new Error(parsed.error);
          segments.push(parsed.value.segments[segments.length]);
          await onSegment(segments[segments.length - 1], segments.length - 1);
          state = "separator";
        } else if (state === "separator") {
          cursor++;
          if (/\s/.test(char)) continue;
          if (char === ",") state = "segment";
          else if (char === "]") state = "suffix";
          else throw new Error("Invalid segment separator");
        } else if (state === "suffix") {
          cursor++;
          if (/\s/.test(char)) continue;
          if (char !== "}") throw new Error("Invalid envelope suffix");
          state = "end";
        } else {
          cursor++;
          if (!/\s/.test(char)) throw new Error("Trailing output");
        }
      }
    },
    finish(finalText) {
      if (state !== "end" || (finalText !== undefined && finalText !== text)) throw new Error("Incomplete or inconsistent output");
      const parsed = parseMetabloomEmoteEnvelope(text, { allowMultiple });
      if (!parsed.ok || JSON.stringify(parsed.value.segments) !== JSON.stringify(segments)) throw new Error("Invalid completed envelope");
      return parsed.value;
    },
  };
};

const streamMetabloomProvider = async (upstream, { allowMultiple = false, onSegment, signal }) => {
  if (!upstream.body?.getReader || !upstream.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Expected provider SSE");
  const reader = upstream.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const envelope = createEnvelopeReader({ allowMultiple, onSegment });
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
