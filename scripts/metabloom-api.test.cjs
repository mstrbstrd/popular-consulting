const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const handler = require("../api/metabloom");
const { parseMetabloomEmoteEnvelope, createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");
const { buildMetabloomSystemPrompt } = require("../src/components/metabloomEmoteLibrary");
const originalFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ["OPENAI_API_KEY", "METABLOOM_MODEL", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
  handler._internals.localBuckets.clear();
});
const segment = (emote = "reflective", response = "A careful thought.") => ({ emote, response });
const envelope = (...segments) => ({ version: "1.0.0", segments });
const request = (body = { message: "Hello", history: [] }) => ({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, body });
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k] = v; }, write(s) { this.body += s; }, end(s = "") { this.body += s; this.writableEnded = true; } });
const local = () => { process.env.VERCEL_ENV = "development"; process.env.OPENAI_API_KEY = "test-only-not-a-credential"; };
const reply = (text) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(text) }] }] }), { headers: { "content-type": "application/json" } });

test("one segment, exact enum, required version, no extra controls", () => {
  assert.equal(parseMetabloomEmoteEnvelope(envelope(segment())).ok, true);
  for (const value of [envelope(), { segments: [segment()] }, envelope(segment("constructor")), envelope({ ...segment(), intensity: 1 }), envelope(segment("warm"), segment("reflective"))]) {
    assert.equal(parseMetabloomEmoteEnvelope(value, { allowMultiple: false }).ok, false);
  }
});
test("NDJSON requires ordered segments, terminal version, aggregate bounds, and done", () => {
  const line = (index, emote = "warm", text = "Hello") => JSON.stringify({ type: "segment", index, ...segment(emote, text) }) + "\n";
  const done = '{"type":"done","version":"1.0.0"}\n';
  for (const text of [done, line(0), line(1) + done, line(0) + done + line(1), [0, 1, 2, 3].map((i) => line(i, "warm", "a".repeat(1600))).join("") + done]) {
    const d = createMetabloomSegmentStreamDecoder(); d.push(text); assert.equal(d.finish().ok, false);
  }
  const valid = line(0, "whimsy") + line(1, "reflective") + done;
  const d = createMetabloomSegmentStreamDecoder(); for (const char of valid) assert.equal(d.push(char), true);
  assert.equal(d.finish().value.segments.length, 2);
});
test("POST validates parsed-object size and exact full origin", async () => {
  local(); let calls = 0; global.fetch = async () => { calls++; throw new Error("Unexpected call"); };
  const req = request({ message: "Hello", history: [], extra: "x".repeat(30000) });
  const res = response(); await handler(req, res); assert.equal(res.statusCode, 400);
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  assert.equal(handler._internals.requestOriginIsAllowed(request()), false);
  const insecure = request(); insecure.headers.origin = "http://example.com"; insecure.headers.host = "example.com";
  assert.equal(handler._internals.requestOriginIsAllowed(insecure), false);
  assert.equal(calls, 0);
});
test("an API key alone does not open a billable serverless endpoint", async () => {
  process.env.OPENAI_API_KEY = "test-only-not-a-credential";
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const req = request(); req.headers.origin = "https://localhost:3000";
  let calls = 0; global.fetch = async () => { calls++; };
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 503); assert.equal(calls, 0);
});
test("shared atomic quota is checked before provider work and fails closed", async () => {
  local(); process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  process.env.UPSTASH_REDIS_REST_URL = "https://quota.example.com"; process.env.UPSTASH_REDIS_REST_TOKEN = "test-only-quota-token";
  const req = request(); req.headers.origin = "https://localhost:3000";
  const calls = [];
  global.fetch = async (url, options) => { calls.push([String(url), JSON.parse(options.body)]); return new Response('{"result":0}'); };
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 429); assert.equal(calls.length, 1); assert.equal(calls[0][1][0], "EVAL");
  global.fetch = async () => { throw new Error("Quota down"); };
  const failed = response(); await handler(req, failed); assert.equal(failed.statusCode, 502);
});
test("server uses shared prompt/schema and sends the current turn once", async () => {
  local(); let sent;
  global.fetch = async (url, options) => { sent = JSON.parse(options.body); return reply(envelope(segment())); };
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sent.input, [{ role: "user", content: "Hello" }]);
  assert.equal(sent.instructions, buildMetabloomSystemPrompt());
  assert.equal(sent.text.format.schema.properties.segments.maxItems, 1);
  const d = createMetabloomSegmentStreamDecoder({ allowMultiple: false }); d.push(res.body);
  assert.equal(d.finish().ok, true); assert.equal(res.body.includes("test-only"), false);
});
test("ordinary replies reject extra segments instead of silently truncating them", async () => {
  local(); global.fetch = async () => reply(envelope(segment("warm"), segment("reflective")));
  const res = response(); await handler(request(), res); assert.equal(res.statusCode, 502);
});
test("disconnect cancels provider work before sending a stale response", async () => {
  local(); let started; const ready = new Promise((resolve) => { started = resolve; }); let signal;
  global.fetch = async (_url, options) => { signal = options.signal; started(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); };
  const res = response(); const pending = handler(request(), res); await ready;
  res.destroyed = true; res.emit("close"); await pending;
  assert.equal(signal.aborted, true); assert.equal(res.body, "");
});
