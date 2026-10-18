const { test, beforeEach, afterEach, mock } = require("node:test");
const metabloomAuth = require("../server/metabloomAuth");
// Provider tests assume a verified session; orb-access.test.mjs tests the real gate.
beforeEach(() => mock.method(metabloomAuth, "requireMetabloomSession", async () => null));
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const handler = require("../api/metabloom");
const { parseMetabloomEmoteEnvelope, createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");
const { buildMetabloomChatSystemPrompt } = require("../src/components/metabloomEmoteLibrary");
const originalFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  global.fetch = originalFetch;
  for (const key of ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_MODEL", "TYPESAFE_API_KEY", "JEV_MODEL", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
  handler._internals.localBuckets.clear();
});
const segment = (emote = "reflective", response = "A careful thought.") => ({ emote, response });
const envelope = (...segments) => ({ version: "1.0.0", segments });
const request = (body = { message: "Hello", history: [] }) => ({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" }, body });
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k] = v; }, write(s) { this.body += s; return true; }, end(s = "") { this.body += s; this.writableEnded = true; } });
const local = () => { process.env.VERCEL_ENV = "development"; process.env.OPENAI_API_KEY = "test-only-not-a-credential"; delete process.env.TYPESAFE_API_KEY; };
const reply = (value) => {
  const text = JSON.stringify(value);
  const events = [
    { type: "response.output_text.delta", item_id: "m1", output_index: 0, content_index: 0, delta: text },
    { type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
};

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
const textEnvelope = (...responses) => ({ version: "2.0.0", segments: responses.map((response) => ({ response })) });
const jevReply = (emote, confidence = 0.97, action, actionConfidence = 0.97) => new Response(JSON.stringify({
  model: "jev-latest", answers: { reaction: {
    type: "choice", choice: emote, confidence,
    probabilities: { [emote]: 0.97 },
  }, ...(action === undefined ? {} : { action: {
    type: "choice", choice: action, confidence: actionConfidence, probabilities: { [action]: 0.97 },
  } }) }, usage: { input_tokens: 40, output_tokens: 10 },
}), { headers: { "content-type": "application/json" } });

test("live endpoint streams response-only paragraphs with two neutral fallbacks when Jev is unconfigured", async () => {
  local(); let sent;
  global.fetch = async (url, options) => { assert.match(String(url), /openai/); sent = JSON.parse(options.body); return reply(textEnvelope("A careful thought.")); };
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sent.input, [{ role: "user", content: "Hello" }]);
  assert.equal(sent.instructions, buildMetabloomChatSystemPrompt());
  assert.equal(sent.stream, true);
  assert.equal(sent.text.format.schema.properties.segments.maxItems, 1);
  assert.deepEqual(sent.text.format.schema.properties.segments.items.required, ["response"]);
  const phases = [];
  const d = createMetabloomSegmentStreamDecoder({ allowMultiple: false, onReaction: (event) => phases.push(event) });
  assert.equal(d.push(res.body), true);
  assert.deepEqual(d.finish().value, textEnvelope("A careful thought."));
  assert.deepEqual(phases, [{ phase: "input", emote: "neutral" }, { phase: "response", emote: "neutral" }]);
  assert.equal(res.body.includes("test-only"), false);
});

test("provider-specific OpenAI model config selects the requested model and ignores the legacy name", async () => {
  local();
  process.env.METABLOOM_MODEL = "legacy-model-is-ignored";
  let sent;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).host, "api.openai.com");
    sent = JSON.parse(options.body);
    return reply(textEnvelope("A careful thought."));
  };
  process.env.METABLOOM_OPENAI_MODEL = "gpt-5-nano";
  const configuredResponse = response();
  await handler(request(), configuredResponse);
  assert.equal(configuredResponse.statusCode, 200);
  assert.equal(sent.model, "gpt-5-nano");
  delete process.env.METABLOOM_OPENAI_MODEL;
  const fallbackResponse = response();
  await handler(request(), fallbackResponse);
  assert.equal(fallbackResponse.statusCode, 200);
  assert.equal(sent.model, "gpt-5-mini");
});

test("Jev runs twice, selecting different emotes before and after the validated chat text", async () => {
  local(); process.env.TYPESAFE_API_KEY = "test-only-jev-credential"; process.env.JEV_MODEL = "jev-latest";
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body), headers: options.headers });
    if (String(url).includes("typesafe.ai")) {
      const state = JSON.parse(options.body).state;
      return jevReply(state.assistantResponse ? "resolute" : "curious");
    }
    return reply(textEnvelope("This is the complete assistant answer."));
  };
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  const records = res.body.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.type), ["emote", "segment", "text_complete", "emote", "done"]);
  assert.deepEqual(records.filter((record) => record.type === "emote").map((record) => [record.phase, record.emote]),
    [["input", "curious"], ["response", "resolute"]]);
  const jev = requests.filter((record) => record.url.includes("typesafe.ai"));
  assert.equal(jev.length, 2);
  assert.equal(jev[0].body.questions.reaction.type, "choice");
  assert.equal(jev[0].body.model, "jev-latest");
  assert.deepEqual(jev[1].body.state.assistantResponse, "This is the complete assistant answer.");
  assert.equal(jev.every((record) => record.headers.Authorization === "Bearer test-only-jev-credential"), true);
  assert.equal(res.body.includes("test-only-jev-credential"), false);
});

test("ordinary live chats fail closed on unauthorized extra paragraphs", async () => {
  local(); global.fetch = async () => reply(textEnvelope("One paragraph.", "An unwanted second."));
  const res = response(); await handler(request(), res);
  const d = createMetabloomSegmentStreamDecoder({ allowMultiple: false });
  d.push(res.body);
  assert.equal(d.finish().ok, false);
  assert.equal(res.body.includes('"type":"done"'), false);
});
test("disconnect cancels provider work before sending a stale response", async () => {
  local(); let started; const ready = new Promise((resolve) => { started = resolve; }); let signal;
  global.fetch = async (_url, options) => { signal = options.signal; started(); return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); };
  const res = response(); const pending = handler(request(), res); await ready;
  res.destroyed = true; res.emit("close"); await pending;
  assert.equal(signal.aborted, true);
  assert.equal(res.body.includes('"type":"segment"'), false);
  assert.equal(res.body.includes('"type":"done"'), false);
});

test("invalid action modes fail validation before quota or provider work", async () => {
  local();
  global.fetch = async () => assert.fail("Invalid modes cannot invoke providers");
  for (const actionMode of [null, true, 1, {}, [], "", "research", "constructor"]) {
    const res = response();
    await handler(request({ message: "Hello", actionMode }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(res.body), { code: "invalid_request" });
  }
  assert.equal(handler._internals.localBuckets.size, 0);
});

test("auto waits for its selected scene before starting OpenAI and preserves stream ordering", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  const requests = [];
  let releaseInput, inputSignal, inputStarted;
  const started = new Promise((resolve) => { inputStarted = resolve; });
  global.fetch = async (url, options) => {
    const sent = JSON.parse(options.body);
    requests.push({ url: String(url), body: sent });
    if (String(url).includes("typesafe.ai")) {
      if (sent.state.assistantResponse) return jevReply("resolute");
      inputSignal = options.signal;
      inputStarted();
      return new Promise((resolve, reject) => {
        releaseInput = resolve;
        options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    }
    return reply(textEnvelope("A considered answer."));
  };
  const res = response();
  const running = handler(request({ message: "Please examine this carefully", actionMode: "auto", streamText: true }), res);
  await started;
  assert.equal(inputSignal.aborted, false);
  assert.equal(requests.some((entry) => entry.url.includes("openai.com")), false);
  assert.equal(res.body, "");
  releaseInput(jevReply("curious", 0.97, "deep-research"));
  await running;
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.map((entry) => entry.type), ["emote", "action", "text_delta", "segment", "text_complete", "emote", "done"]);
  assert.deepEqual(records[1], { type: "action", action: "deep-research" });
  const jev = requests.filter((entry) => entry.url.includes("typesafe.ai"));
  assert.equal(jev.length, 2);
  const openai = requests.filter((entry) => entry.url.includes("openai.com"));
  assert.equal(openai.length, 1);
  assert.equal(openai[0].body.instructions, buildMetabloomChatSystemPrompt({ presentationAction: "deep-research" }));
  assert.deepEqual(Object.keys(jev[0].body.questions), ["reaction", "action"]);
  assert.deepEqual(Object.keys(jev[1].body.questions), ["reaction"]);
  assert.equal(jev[1].body.state.assistantResponse, "A considered answer.");
  const actions = [];
  const decoder = createMetabloomSegmentStreamDecoder({ onAction: (action) => actions.push(action) });
  assert.equal(decoder.push(res.body), true);
  assert.deepEqual(decoder.finish().value, textEnvelope("A considered answer."));
  assert.deepEqual(actions, ["deep-research"]);
});

test("missing Jev preserves explicit scenes and gives auto the ordinary presentation", async () => {
  local();
  for (const actionMode of ["auto", "none", "deep-research", "under-the-hood"]) {
    const selectedAction = actionMode === "auto" ? "none" : actionMode;
    let sent;
    global.fetch = async (url, options) => {
      assert.equal(new URL(url).host, "api.openai.com");
      sent = JSON.parse(options.body);
      return reply(textEnvelope("One careful paragraph.", "A useful continuation."));
    };
    const res = response();
    await handler(request({ message: "Explain the idea", actionMode, allowMultiple: true }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.deepEqual(records.map((entry) => entry.type), ["emote", "action", "segment", "segment", "text_complete", "emote", "done"]);
    assert.deepEqual(records[1], { type: "action", action: selectedAction });
    assert.deepEqual(records.filter((entry) => entry.type === "emote").map((entry) => entry.emote), ["neutral", "neutral"]);
    assert.equal(sent.text.format.schema.properties.segments.maxItems, 4);
    assert.equal(Object.prototype.hasOwnProperty.call(sent, "tools"), false);
    assert.equal(sent.instructions, buildMetabloomChatSystemPrompt({ allowMultiple: true, presentationAction: selectedAction }));
  }
});

test("an action survives into an incomplete stream without a false final reaction or completion", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  let decisions = 0;
  global.fetch = async (url) => {
    if (String(url).includes("typesafe.ai")) { decisions++; return jevReply("whimsy", 0.97, "under-the-hood"); }
    const events = [
      { type: "response.output_text.delta", item_id: "m1", output_index: 0, content_index: 0,
        delta: '{"version":"2.0.0","segments":[{"response":"A visible prefix' },
      { type: "response.failed", message: "Private provider failure" },
    ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  };
  const res = response();
  await handler(request({ message: "Show me a trick", actionMode: "auto", streamText: true }), res);
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.map((entry) => entry.type), ["emote", "action", "text_delta", "error"]);
  assert.equal(records[1].action, "under-the-hood");
  assert.equal(records[2].delta, "A visible prefix");
  assert.equal(decisions, 1);
  assert.equal(res.body.includes("Private provider failure"), false);
});

test("disconnect cancels both an explicit-mode reaction and parallel provider before any action can arrive", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  const signals = [];
  let providerStarted;
  const started = new Promise((resolve) => { providerStarted = resolve; });
  global.fetch = async (url, options) => {
    signals.push(options.signal);
    if (String(url).includes("openai.com")) providerStarted();
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  };
  const res = response();
  const running = handler(request({ message: "Research this", actionMode: "deep-research" }), res);
  await started;
  res.destroyed = true; res.emit("close");
  await running;
  assert.equal(signals.length, 2);
  assert.equal(signals.every((signal) => signal.aborted), true);
  assert.equal(res.body, "");
});

test("explicit and legacy requests start OpenAI while the input reaction is still pending", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  for (const actionMode of [undefined, "none", "deep-research", "under-the-hood"]) {
    let releaseInput, inputSignal, inputQuestions, openaiRequest, providerStarted;
    const started = new Promise((resolve) => { providerStarted = resolve; });
    global.fetch = async (url, options) => {
      const sent = JSON.parse(options.body);
      if (String(url).includes("typesafe.ai")) {
        if (sent.state.assistantResponse) return jevReply("resolute");
        inputSignal = options.signal;
        inputQuestions = sent.questions;
        return new Promise((resolve, reject) => {
          releaseInput = resolve;
          options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        });
      }
      openaiRequest = sent;
      providerStarted();
      return reply(textEnvelope("Here is the answer."));
    };
    const res = response();
    const running = handler(request({ message: "Show me a trick", actionMode }), res);
    await started;
    assert.equal(inputSignal.aborted, false);
    assert.deepEqual(Object.keys(inputQuestions), ["reaction"]);
    assert.equal(openaiRequest.instructions, buildMetabloomChatSystemPrompt({ presentationAction: actionMode || "none" }));
    assert.equal(res.body, "");
    releaseInput(jevReply("warm", 0.97, "under-the-hood"));
    await running;
    const actions = res.body.trim().split("\n").map(JSON.parse).filter((record) => record.type === "action");
    assert.deepEqual(actions, actionMode === undefined ? [] : [{ type: "action", action: actionMode }]);
  }
});

test("auto prompt context matches the validated action rather than words in the request or history", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  for (const { message, action, confidence = 0.97, emote = "warm", selected } of [
    { message: "Please do a deep dive", action: "under-the-hood", selected: "under-the-hood" },
    { message: "Show me a trick", action: "deep-research", selected: "deep-research" },
    { message: "Research this deeply", action: "none", selected: "none" },
    { message: "Research this deeply", action: "unknown", selected: "none" },
    { message: "Research this deeply", action: "deep-research", confidence: 0.69, selected: "none" },
    { message: "Show me a trick", action: undefined, selected: "none" },
    { message: "Hello", action: "under-the-hood", emote: "unknown", selected: "under-the-hood" },
  ]) {
    let sent;
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).includes("typesafe.ai")) {
        return body.state.assistantResponse ? jevReply("resolute") : jevReply(emote, 0.97, action, confidence);
      }
      sent = body;
      return reply(textEnvelope("A grounded reply."));
    };
    const res = response();
    await handler(request({ message, actionMode: "auto", history: [{ role: "user", content: "The Orb is diving and opening its hood." }] }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.deepEqual(records[1], { type: "action", action: selected });
    assert.equal(records[0].emote, emote === "unknown" ? "neutral" : emote);
    assert.equal(sent.instructions, buildMetabloomChatSystemPrompt({ presentationAction: selected }));
    assert.equal(sent.tools, undefined);
    assert.equal(records.at(-1).type, "done");
  }
});

test("an auto decision timeout gives OpenAI the same ordinary presentation as the wire fallback", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  let inputSignal, sent, decisions = 0;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes("typesafe.ai")) {
      decisions++;
      if (body.state.assistantResponse) return jevReply("resolute");
      inputSignal = options.signal;
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    }
    assert.equal(inputSignal.aborted, true);
    sent = body;
    return reply(textEnvelope("Here is what we can establish."));
  };
  const res = response();
  await handler(request({ message: "Research this deeply", actionMode: "auto", streamText: true }), res);
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records[0], { type: "emote", phase: "input", emote: "neutral" });
  assert.deepEqual(records[1], { type: "action", action: "none" });
  assert.equal(sent.instructions, buildMetabloomChatSystemPrompt({ presentationAction: "none" }));
  assert.equal(decisions, 2);
  assert.equal(records.at(-1).type, "done");
});

test("an auto request cancelled before its decision cannot start OpenAI even if Jev answers late", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  const calls = [];
  let inputSignal, releaseInput, inputStarted;
  const started = new Promise((resolve) => { inputStarted = resolve; });
  global.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("typesafe.ai")) {
      inputSignal = options.signal;
      inputStarted();
      // A late transport result must not revive a cancelled request.
      return new Promise((resolve) => { releaseInput = resolve; });
    }
    return reply(textEnvelope("This answer must never be requested."));
  };
  const res = response();
  const running = handler(request({ message: "Show me a trick", actionMode: "auto" }), res);
  await started;
  res.destroyed = true;
  res.emit("close");
  releaseInput(jevReply("whimsy", 0.97, "under-the-hood"));
  await running;
  assert.equal(inputSignal.aborted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("typesafe.ai"), true);
  assert.equal(res.body, "");
});
