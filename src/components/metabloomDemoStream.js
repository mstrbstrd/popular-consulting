import { createMetabloomDemoEnvelope } from "./metabloomDemoResponses";
import { createMetabloomSegmentStreamDecoder } from "./metabloomEmoteProtocol";

// Simulated network chunks, not a post-response animation playlist. The same
// strict decoder and onSegment path are used by the actual HTTP client.
export const streamMetabloomDemoResponse = ({ message, allowMultiple = false, signal, onSegment }) =>
  new Promise((resolve, reject) => {
    const envelope = createMetabloomDemoEnvelope(message);
    const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple, onSegment });
    const records = envelope.segments.map((segment, index) => JSON.stringify({ type: "segment", index, ...segment }) + "\n");
    const chunks = records.flatMap((record, index) => {
      const split = Math.floor(record.length / 2);
      return [
        { text: record.slice(0, split), delay: index === 0 ? 260 : 1280 },
        { text: record.slice(split), delay: 260 },
      ];
    });
    chunks.push({ text: JSON.stringify({ type: "done", version: envelope.version }) + "\n", delay: 200 });
    let timer = 0;
    let settled = false;
    const close = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => close(new Error("Demo stream cancelled."));
    const next = () => {
      if (signal?.aborted) { abort(); return; }
      const chunk = chunks.shift();
      if (!chunk) {
        const result = decoder.finish();
        close(result.ok ? null : new Error(result.error), result.value);
        return;
      }
      timer = setTimeout(() => {
        try {
          if (!decoder.push(chunk.text)) throw new Error("Invalid demo stream.");
          next();
        } catch (error) { close(error); }
      }, chunk.delay);
    };
    signal?.addEventListener("abort", abort, { once: true });
    next();
  });
