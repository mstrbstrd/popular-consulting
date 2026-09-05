import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");
const origin = process.env.METABLOOM_TEST_ORIGIN || "http://localhost:3000";
const endpoint = new URL("/api/metabloom", origin);
if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error("Expected an HTTP origin");
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: endpoint.origin },
  body: JSON.stringify({ message: "Share one thoughtful observation.", history: [], allowMultiple: false }),
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Metabloom endpoint returned HTTP ${response.status}`);
if (!response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("Expected NDJSON");
const decoder = createMetabloomSegmentStreamDecoder({ allowMultiple: false });
const textDecoder = new TextDecoder();
for await (const chunk of response.body) {
  if (!decoder.push(textDecoder.decode(chunk, { stream: true }))) throw new Error("Invalid response stream");
}
decoder.push(textDecoder.decode());
const parsed = decoder.finish();
if (!parsed.ok) throw new Error(parsed.error);
console.log(JSON.stringify(parsed.value, null, 2));
