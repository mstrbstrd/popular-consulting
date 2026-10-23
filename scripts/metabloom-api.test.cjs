const { test, beforeEach, afterEach, mock } = require("node:test");
const metabloomAuth = require("../server/metabloomAuth");
// Provider tests assume a verified session; orb-access.test.mjs tests the real gate.
beforeEach(() => mock.method(metabloomAuth, "requireMetabloomSession", async () => null));
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const handler = require("../api/metabloom");
const { parseMetabloomEmoteEnvelope, createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");
const { buildMetabloomChatSystemPrompt } = require("../src/components/metabloomEmoteLibrary");
const { getMetabloomVisualCapabilityResponse } = require("../src/components/metabloomVisualCapabilities");
const originalFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  global.fetch = originalFetch;
  for (const key of ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_RESEARCH_MODEL", "METABLOOM_MODEL", "TYPESAFE_API_KEY", "JEV_MODEL", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "METABLOOM_VISUALS_ENABLED", "METABLOOM_UI_TOOLS_ENABLED"]) {
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
const researchSources = [{ id: 1, title: "Official source", url: "https://example.com/official" }];
const researchDocument = () => {
  const text = "The official source confirms this finding. Source.";
  return {
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "research fixture", sources: [{ type: "url", url: researchSources[0].url }] } },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [
        { type: "url_citation", url: researchSources[0].url, title: researchSources[0].title, start_index: text.indexOf("Source."), end_index: text.length },
      ] }] },
    ],
  };
};
const researchReply = (value = researchDocument()) => new Response(`data: ${JSON.stringify({ type: "response.completed", response: value })}\n\n`, { headers: { "content-type": "text/event-stream" } });
const largeResearchDocument = () => {
  const value = researchDocument();
  const paragraphs = Array.from({ length: 65 }, (_, index) =>
    `Finding ${index + 1}: ${"This fictional evidence belongs in the full report. ".repeat(12)}`.trim());
  const text = paragraphs.join("\n\n");
  let offset = 0;
  const annotations = paragraphs.map((paragraph, index) => {
    const annotation = { type: "url_citation", title: `Research source ${index + 1}`,
      url: `https://example.com/research-source-${index + 1}`, start_index: offset, end_index: offset + paragraph.length };
    offset += paragraph.length + 2;
    return annotation;
  });
  value.output[1].content = [{ type: "output_text", text, annotations }];
  // Synthetic pending-status variant of the observed seven-record response:
  // five completed searches, a completed report, and auxiliary tool metadata.
  value.output.splice(1, 0, ...Array.from({ length: 6 }, (_, index) => ({
    id: `ws_report_${index}`, type: "web_search_call", status: index === 5 ? "in_progress" : "completed",
    action: index < 4 ? { type: "search", query: `fictional evidence question ${index + 1}` }
      : { type: "open_page", url: index === 5 ? "https://example.com/unavailable" : researchSources[0].url },
  })));
  value.output.unshift({ type: "reasoning", summary: [{ text: "private-reasoning-fixture" }] });
  return value;
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
test("tool-capable clients cannot silently replace requested UI with generated HTML text", async () => {
  local();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("The text model must not be invoked"); };
  const req = request({ message: "Create an interactive project-price calculator with editable hours and rate.", history: [] });
  req.headers["x-metabloom-ui-tools"] = "1";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(JSON.parse(res.body), { code: "visual_tool_required" });
  assert.equal(calls, 0);
  const sourceRequest = request({ message: "Please write HTML code for a calculator.", history: [] });
  sourceRequest.headers["x-metabloom-ui-tools"] = "1";
  assert.equal(require("../src/components/metabloomVisualIntent").classifyMetabloomVisualIntent(sourceRequest.body.message).mode, "optional");
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
  local(); let sent; let calls = 0;
  global.fetch = async (url, options) => { calls++; assert.match(String(url), /openai/); sent = JSON.parse(options.body); return reply(textEnvelope("A careful thought.")); };
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sent.input, [{ role: "user", content: "Hello" }]);
  assert.equal(sent.instructions, buildMetabloomChatSystemPrompt());
  assert.equal(sent.stream, true);
  assert.equal(calls, 1);
  assert.equal(sent.tools, undefined);
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

test("invalid research capabilities fail validation before quota or provider work", async () => {
  local();
  let calls = 0;
  global.fetch = async () => { calls++; assert.fail("Invalid capability cannot invoke providers"); };
  for (const field of ["streamResearchProgress", "streamResearchDetails"]) {
    for (const value of [null, 0, 1, "true", "false", {}, []]) {
      const res = response();
      await handler(request({ message: "Research this", actionMode: "deep-research", [field]: value }), res);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(JSON.parse(res.body), { code: "invalid_request" });
    }
  }
  assert.equal(calls, 0);
  assert.equal(handler._internals.localBuckets.size, 0);
});

test("research progress is sent only to clients that explicitly opt in", async () => {
  local();
  for (const streamResearchProgress of [undefined, false, true]) {
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      if (JSON.parse(options.body).tools) {
        const events = [
          { type: "response.web_search_call.searching", item_id: "ws_fixture", output_index: 0 },
          { type: "response.completed", response: researchDocument() },
        ];
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
          { headers: { "content-type": "text/event-stream" } });
      }
      return reply(textEnvelope("A supported answer for this client. [1]"));
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research",
      ...(streamResearchProgress !== undefined ? { streamResearchProgress } : {}),
    }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    const progress = streamResearchProgress === true ? ["research_progress"] : [];
    assert.deepEqual(records.map((record) => record.type), [
      "emote", "action", "research", ...progress, "sources", "research", ...progress,
      "segment", "text_complete", "emote", "done",
    ]);
    assert.deepEqual(records.find((record) => record.type === "sources").sources, researchSources);
    assert.equal(calls, 2);
  }
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
    return Boolean(sent.tools) ? researchReply() : reply(textEnvelope("A considered answer. [1]"));
  };
  const res = response();
  const running = handler(request({ message: "Please examine this carefully", actionMode: "auto", streamText: true, streamResearchProgress: true }), res);
  await started;
  assert.equal(inputSignal.aborted, false);
  assert.equal(requests.some((entry) => entry.url.includes("openai.com")), false);
  assert.equal(res.body, "");
  releaseInput(jevReply("curious", 0.97, "deep-research"));
  await running;
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.map((entry) => entry.type), ["emote", "action", "research", "sources", "research", "research_progress", "text_delta", "segment", "text_complete", "emote", "done"]);
  assert.deepEqual(records[1], { type: "action", action: "deep-research" });
  assert.deepEqual(records.slice(2, 5), [
    { type: "research", state: "searching" },
    { type: "sources", sources: researchSources },
    { type: "research", state: "synthesizing" },
  ]);
  const jev = requests.filter((entry) => entry.url.includes("typesafe.ai"));
  assert.equal(jev.length, 2);
  const openai = requests.filter((entry) => entry.url.includes("openai.com"));
  assert.equal(openai.length, 2);
  assert.equal(openai[0].body.stream, true);
  assert.equal(openai[1].body.stream, true);
  assert.equal(openai[1].body.instructions, buildMetabloomChatSystemPrompt({ presentationAction: "deep-research", researchEnabled: true }));
  assert.deepEqual(Object.keys(jev[0].body.questions), ["reaction", "action"]);
  assert.deepEqual(Object.keys(jev[1].body.questions), ["reaction"]);
  assert.equal(jev[1].body.state.assistantResponse, "A considered answer. [1]");
  const actions = [];
  const decoder = createMetabloomSegmentStreamDecoder({ onAction: (action) => actions.push(action) });
  assert.equal(decoder.push(res.body), true);
  assert.deepEqual(decoder.finish().value, textEnvelope("A considered answer. [1]"));
  assert.deepEqual(actions, ["deep-research"]);
});

test("missing Jev preserves explicit scenes and gives auto the ordinary presentation", async () => {
  local();
  for (const actionMode of ["auto", "none", "deep-research", "under-the-hood"]) {
    const selectedAction = actionMode === "auto" ? "none" : actionMode;
    const requests = [];
    global.fetch = async (url, options) => {
      assert.equal(new URL(url).host, "api.openai.com");
      const sent = JSON.parse(options.body);
      requests.push(sent);
      if (Boolean(sent.tools)) return researchReply();
      return reply(textEnvelope(selectedAction === "deep-research" ? "One careful paragraph. [1]" : "One careful paragraph.", "A useful continuation."));
    };
    const res = response();
    await handler(request({ message: "Explain the idea", actionMode, allowMultiple: true, streamResearchProgress: true }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.deepEqual(records.map((entry) => entry.type), ["emote", "action", ...(selectedAction === "deep-research" ? ["research", "sources", "research", "research_progress"] : []), "segment", "segment", "text_complete", "emote", "done"]);
    assert.deepEqual(records[1], { type: "action", action: selectedAction });
    assert.deepEqual(records.filter((entry) => entry.type === "emote").map((entry) => entry.emote), ["neutral", "neutral"]);
    assert.equal(requests.length, selectedAction === "deep-research" ? 2 : 1);
    const sent = requests.at(-1);
    assert.equal(sent.text.format.schema.properties.segments.maxItems, 4);
    assert.equal(Object.prototype.hasOwnProperty.call(sent, "tools"), false);
    assert.equal(sent.instructions, buildMetabloomChatSystemPrompt({ allowMultiple: true, presentationAction: selectedAction, researchEnabled: selectedAction === "deep-research" }));
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
  const running = handler(request({ message: "Show me a trick", actionMode: "under-the-hood" }), res);
  await started;
  res.destroyed = true; res.emit("close");
  await running;
  assert.equal(signals.length, 2);
  assert.equal(signals.every((signal) => signal.aborted), true);
  assert.equal(res.body, "");
});

test("explicit and legacy requests start OpenAI while the input reaction is still pending", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  for (const actionMode of [undefined, "none", "under-the-hood"]) {
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
    const requests = [];
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).includes("typesafe.ai")) {
        return body.state.assistantResponse ? jevReply("resolute") : jevReply(emote, 0.97, action, confidence);
      }
      requests.push(body);
      if (Boolean(body.tools)) return researchReply();
      return reply(textEnvelope(selected === "deep-research" ? "A grounded reply. [1]" : "A grounded reply."));
    };
    const res = response();
    await handler(request({ message, actionMode: "auto", history: [{ role: "user", content: "The Orb is diving and opening its hood." }] }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.deepEqual(records[1], { type: "action", action: selected });
    assert.equal(records[0].emote, emote === "unknown" ? "neutral" : emote);
    assert.equal(requests.length, selected === "deep-research" ? 2 : 1);
    const sent = requests.at(-1);
    assert.equal(sent.instructions, buildMetabloomChatSystemPrompt({ presentationAction: selected, researchEnabled: selected === "deep-research" }));
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

test("explicit research searches with bounded tools before its schema-constrained writer can run", async () => {
  local();
  process.env.METABLOOM_RESEARCH_MODEL = "research-fixture-model";
  process.env.METABLOOM_OPENAI_MODEL = "writer-fixture-model";
  const history = [{ role: "user", content: "We are comparing API features." }];
  const calls = [];
  let releaseResearch, researchStarted;
  const started = new Promise((resolve) => { researchStarted = resolve; });
  const res = response();
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), body, options });
    if (Boolean(body.tools)) {
      assert.deepEqual(res.body.trim().split("\n").map(JSON.parse), [
        { type: "emote", phase: "input", emote: "neutral" },
        { type: "action", action: "deep-research" },
        { type: "research", state: "searching" },
      ]);
      researchStarted();
      return new Promise((resolve) => { releaseResearch = resolve; });
    }
    return reply(textEnvelope("Here is the verified finding. [1]"));
  };
  const running = handler(request({ message: "Research the current API", history, actionMode: "deep-research", streamText: true }), res);
  await started;
  assert.equal(calls.length, 1);
  assert.equal(res.body.includes('"type":"text_delta"'), false);
  const research = calls[0];
  assert.equal(research.url, "https://api.openai.com/v1/responses");
  assert.equal(research.options.redirect, "error");
  assert.equal(research.body.model, "research-fixture-model");
  assert.equal(research.body.store, false);
  assert.deepEqual(research.body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.equal(research.body.tool_choice, "required");
  assert.equal(research.body.include, undefined);
  assert.equal(research.body.max_tool_calls, 6);
  assert.equal(research.body.max_output_tokens, 10000);
  releaseResearch(researchReply());
  await running;
  assert.equal(calls.length, 2);
  const writer = calls[1].body;
  assert.equal(writer.model, "writer-fixture-model");
  assert.equal(writer.stream, true);
  assert.equal(writer.store, false);
  assert.equal(writer.tools, undefined);
  assert.equal(writer.text.format.type, "json_schema");
  assert.equal(writer.text.format.strict, true);
  assert.equal(writer.text.format.schema.properties.segments.maxItems, 1);
  assert.deepEqual(writer.input.slice(0, history.length), history);
  assert.deepEqual(writer.input.at(-1), { role: "user", content: "Research the current API" });
  const evidence = writer.input[history.length];
  assert.equal(evidence.role, "user");
  assert.match(evidence.content, /untrusted source material/i);
  assert.match(evidence.content, /Official source/);
  assert.match(evidence.content, /https:\/\/example\.com\/official/);
  assert.match(evidence.content, /\[1\]/);
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.find((record) => record.type === "sources"), { type: "sources", sources: researchSources });
  assert.ok(records.findIndex((record) => record.type === "sources") < records.findIndex((record) => record.type === "text_delta"));
  assert.equal(records.at(-1).type, "done");
});

test("research cannot begin before its initial reaction and action reach the stream", async () => {
  local(); process.env.TYPESAFE_API_KEY = "fixture";
  let releaseInput, inputStarted;
  const started = new Promise((resolve) => { inputStarted = resolve; });
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(String(url));
    if (String(url).includes("typesafe.ai")) {
      if (body.state.assistantResponse) return jevReply("resolute");
      inputStarted();
      return new Promise((resolve) => { releaseInput = resolve; });
    }
    return Boolean(body.tools) ? researchReply() : reply(textEnvelope("The source supports this finding. [1]"));
  };
  const res = response();
  const running = handler(request({ message: "Research the current facts", actionMode: "deep-research" }), res);
  await started;
  assert.equal(calls.length, 1);
  assert.equal(res.body, "");
  releaseInput(jevReply("curious"));
  await running;
  assert.equal(calls.filter((url) => url.includes("openai.com")).length, 2);
  assert.deepEqual(res.body.trim().split("\n").slice(0, 3).map(JSON.parse), [
    { type: "emote", phase: "input", emote: "curious" },
    { type: "action", action: "deep-research" },
    { type: "research", state: "searching" },
  ]);
});

test("disconnect during research aborts provider work and never starts synthesis", async () => {
  local();
  let researchStarted, signal;
  const started = new Promise((resolve) => { researchStarted = resolve; });
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    assert.equal(body.stream, true); assert.ok(body.tools);
    signal = options.signal;
    researchStarted();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  };
  const res = response();
  const running = handler(request({ message: "Research this", actionMode: "deep-research" }), res);
  await started;
  res.destroyed = true; res.emit("close");
  await running;
  assert.equal(signal.aborted, true);
  assert.equal(calls.length, 1);
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.equal(records.some((record) => ["sources", "text_delta", "segment", "text_complete", "done"].includes(record.type)), false);
  assert.equal(records.some((record) => record.state === "synthesizing" || record.phase === "response"), false);
});

test("unverified research fails without invoking a writer or claiming completion", async () => {
  local();
  for (const alter of [
    (value) => { value.status = "incomplete"; },
    (value) => { value.output[0].status = "failed"; },
    (value) => { value.output.shift(); },
    (value) => { value.output[1].content[0].annotations = []; },
  ]) {
    const value = researchDocument(); alter(value);
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      assert.equal(JSON.parse(options.body).stream, true); assert.ok(JSON.parse(options.body).tools);
      return researchReply(value);
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research" }), res);
    assert.equal(calls, 1);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(records.at(-1).type, "error");
    assert.equal(records.some((record) => ["sources", "text_complete", "done"].includes(record.type) || record.phase === "response"), false);
  }
});

test("completed cited research survives pending, unknown, missing and incomplete auxiliary tool statuses without retries", async () => {
  local();
  for (const status of ["in_progress", "searching", "future_status", undefined, "incomplete"]) {
    const value = largeResearchDocument();
    const auxiliary = value.output.find((item) => item.id === "ws_report_5");
    if (status === undefined) delete auxiliary.status;
    else auxiliary.status = status;
    const calls = [];
    const res = response();
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.tools) {
        assert.equal(body.max_tool_calls, 6);
        assert.equal(body.max_output_tokens, 10000);
        return researchReply(value);
      }
      const alreadySent = res.body.trim().split("\n").map(JSON.parse);
      assert.equal(alreadySent.filter((event) => event.type === "research_report_complete").length, 1);
      assert.equal(alreadySent.some((event) => ["text_delta", "segment", "text_complete", "done"].includes(event.type)), false);
      return reply(textEnvelope("The completed research supports this answer. [1]"));
    };
    await handler(request({ message: "Research this", actionMode: "deep-research", streamText: true, streamResearchDetails: true }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(calls.length, 2, "One research request and one writer request, without retries.");
    assert.equal(calls.filter((body) => Boolean(body.tools)).length, 1);
    assert.equal(records.at(-1).type, "done");
    assert.equal(records.some((record) => record.type === "error"), false);
    assert.equal(records.find((record) => record.type === "segment").response, "The completed research supports this answer. [1]");
    const reports = [];
    const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails: (report) => reports.push(report) });
    assert.equal(decoder.push(res.body), true);
    assert.equal(decoder.finish().ok, true);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].sources.length, 65);
    assert.match(reports[0].notes, /Finding 65:.*\[65\]/);
    assert.equal(reports[0].sources.some((source) => source.url === auxiliary.action.url), false);
  }
});

test("pending auxiliary tools never substitute for completed research, successful searches, completed messages or citations", async () => {
  local();
  for (const [alter, code] of [
    [(value) => { value.status = "incomplete"; }, "research_incomplete"],
    [(value) => { value.status = "failed"; }, "research_incomplete"],
    [(value) => { value.output.forEach((item) => { if (item.action?.type === "search") item.status = "in_progress"; }); }, "research_no_sources"],
    [(value) => { value.output.find((item) => item.type === "message").status = "in_progress"; }, "research_incomplete"],
    [(value) => { delete value.output.find((item) => item.type === "message").status; }, "research_incomplete"],
    [(value) => { value.output.find((item) => item.type === "message").content[0].annotations = []; }, "research_no_sources"],
    [(value) => { value.output.find((item) => item.type === "message").content[0].annotations[0].end_index = -1; }, "research_invalid_citations"],
  ]) {
    const value = largeResearchDocument();
    alter(value);
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      assert.ok(JSON.parse(options.body).tools, "Unvalidated research must not start its writer.");
      return researchReply(value);
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research", streamText: true, streamResearchDetails: true }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(calls, 1, "One research request, without a retry or writer request.");
    assert.equal(records.at(-1).type, "error");
    assert.equal(records.at(-1).code, code);
    assert.equal(records.some((record) => record.type.startsWith("research_report")
      || ["sources", "text_delta", "segment", "text_complete", "done"].includes(record.type)
      || record.state === "synthesizing" || record.phase === "response"), false);
  }
});

test("research writer requires actual source IDs before final text completion", async () => {
  local();
  for (const text of ["An uncited claim.", "A fabricated citation. [99]", "One real and one invented source. [1] [2]"]) {
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      return Boolean(JSON.parse(options.body).tools) ? researchReply() : reply(textEnvelope(text));
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research", streamText: true }), res);
    assert.equal(calls, 2);
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.deepEqual(records.find((record) => record.type === "sources").sources, researchSources);
    assert.equal(records.some((record) => ["text_delta", "segment", "text_complete", "done"].includes(record.type) || record.phase === "response"), false);
    assert.equal(records.at(-1).type, "error");
  }
});

test("research text stays private until both the writer's final envelope and citations validate", async () => {
  local();
  let upstream, writerStarted;
  const started = new Promise((resolve) => { writerStarted = resolve; });
  global.fetch = async (_url, options) => {
    if (Boolean(JSON.parse(options.body).tools)) return researchReply();
    return new Response(new ReadableStream({ start(controller) { upstream = controller; writerStarted(); } }), { headers: { "content-type": "text/event-stream" } });
  };
  const res = response();
  const running = handler(request({ message: "Research this", actionMode: "deep-research", streamText: true }), res);
  await started;
  const text = JSON.stringify(textEnvelope("A supported answer. [1]"));
  const send = (event) => upstream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  send({ type: "response.output_text.delta", item_id: "m1", output_index: 0, content_index: 0, delta: text });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.body.includes('"type":"text_delta"'), false);
  assert.equal(res.body.includes('"type":"segment"'), false);
  assert.equal(res.writableEnded, undefined);
  send({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] } });
  upstream.close();
  await running;
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.filter((record) => record.type === "text_delta"), [{ type: "text_delta", index: 0, delta: "A supported answer. [1]" }]);
  assert.equal(records.at(-1).type, "done");
});

test("seven returned research tool records can yield a cited answer with the six-call request budget", async () => {
  local();
  const value = researchDocument();
  value.output.unshift(...Array.from({ length: 6 }, (_, index) => ({
    id: `ws_fixture_${index}`, type: "web_search_call", status: "completed",
    action: { type: "open_page", url: researchSources[0].url },
  })));
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.tools) {
      assert.equal(body.max_tool_calls, 6);
      assert.equal(body.max_output_tokens, 10000);
      return researchReply(value);
    }
    return reply(textEnvelope("The completed sources support this finding. [1]"));
  };
  const res = response();
  await handler(request({ message: "Research this", actionMode: "deep-research", streamText: true }), res);
  assert.equal(calls.length, 2, "One research call and one writer call, without retries");
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.find((record) => record.type === "sources").sources, researchSources);
  assert.equal(records.at(-1).type, "done");
  assert.equal(records.some((record) => record.type === "error"), false);
  assert.equal(records.find((record) => record.type === "segment").response, "The completed sources support this finding. [1]");
});

test("research HTTP failures expose only a safe code and reference while preserving server diagnostics", async (t) => {
  local();
  const logs = [];
  for (const method of ["info", "warn", "error"]) t.mock.method(console, method, (...args) => logs.push(args));
  for (const [status, code] of [[400, "model_configuration_error"], [429, "provider_rate_limited"]]) {
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      assert.ok(JSON.parse(options.body).tools);
      return new Response(JSON.stringify({ error: {
        message: "Private model configuration detail that cannot reach the client", code: "unsupported_parameter", param: "tools",
      } }), { status, headers: { "content-type": "application/json", "x-request-id": "req_fixture_provider" } });
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research" }), res);
    const records = res.body.trim().split("\n").map(JSON.parse);
    const error = records.at(-1);
    assert.equal(error.type, "error");
    assert.equal(error.code, code);
    assert.match(error.requestRef, /^[a-f0-9]{12}$/);
    assert.equal(res.headers["X-Metabloom-Request-Ref"], error.requestRef);
    assert.deepEqual(Object.keys(error).sort(), ["code", "requestRef", "type"]);
    assert.equal(calls, 1);
    assert.equal(res.body.includes("Private model configuration"), false);
    assert.equal(res.body.includes("unsupported_parameter"), false);
    assert.equal(records.some((record) => ["sources", "segment", "text_delta", "text_complete", "done"].includes(record.type)), false);
    assert.equal(records.some((record) => record.state === "synthesizing"), false);
  }
  const logged = JSON.stringify(logs);
  assert.equal(logged.includes("Private model configuration detail"), false);
  assert.ok(logged.includes("unsupported_parameter"));
  assert.ok(logged.includes("providerStatus"));
  assert.ok(logged.includes("req_fixture_provider"));
});

test("completed long research survives synthetic pending auxiliary metadata and reaches the client before its bounded writer", async () => {
  local();
  const value = largeResearchDocument();
  const toolRecords = value.output.filter((item) => item.type === "web_search_call");
  assert.equal(toolRecords.length, 7);
  assert.equal(toolRecords.filter((item) => item.status === "completed").length, 6);
  assert.equal(toolRecords.filter((item) => item.status === "completed" && item.action.type === "search").length, 5);
  assert.equal(toolRecords.at(-1).status, "in_progress");
  const calls = [];
  const res = response();
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.tools) {
      assert.equal(body.max_tool_calls, 6);
      assert.equal(body.max_output_tokens, 10000);
      return researchReply(value);
    }
    const alreadySent = res.body.trim().split("\n").map(JSON.parse);
    assert.ok(alreadySent.some((event) => event.type === "research_report_complete"));
    assert.equal(alreadySent.some((event) => event.type === "segment"), false);
    const supplied = body.input.find((item) => item.content.startsWith("Research evidence"));
    const evidence = JSON.parse(supplied.content.slice(supplied.content.indexOf("\n") + 1));
    assert.ok(evidence.notes.length <= 16000);
    assert.equal(evidence.sources.length, 8);
    assert.equal(evidence.notes.includes("Finding 65"), false);
    assert.equal(evidence.notes.includes("[9]"), false);
    assert.match(body.instructions, /selection of complete passages/);
    assert.equal(body.max_output_tokens, 6000);
    return reply(textEnvelope("The selected findings support this short answer. [1]"));
  };
  await handler(request({ message: "Research a broad question", actionMode: "deep-research", streamText: true,
    streamResearchDetails: true, streamResearchProgress: true }), res);
  assert.equal(calls.length, 2, "One research request and one bounded writer request, without retries.");
  assert.equal(calls.filter((body) => Boolean(body.tools)).length, 1);
  const events = res.body.trim().split("\n").map(JSON.parse);
  const allSources = events.filter((event) => event.type === "research_report_sources").flatMap((event) => event.sources);
  const textParts = events.filter((event) => event.type === "research_report_delta");
  const notes = textParts.map((event, index) => {
    assert.equal(event.index, index);
    assert.ok(event.delta.length <= 2048);
    return event.delta;
  }).join("");
  assert.equal(allSources.length, 65);
  assert.ok(notes.length > 16000);
  assert.match(notes, /Finding 65:.*\[65\]/);
  assert.equal(res.body.includes("private-reasoning-fixture"), false);
  assert.ok(res.body.trim().split("\n").every((line) => line.length <= 24000));
  assert.ok(events.findIndex((event) => event.type === "research_report_complete") < events.findIndex((event) => event.type === "sources"));
  const reports = [];
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails: (report) => reports.push(report) });
  assert.equal(decoder.push(res.body), true);
  assert.equal(decoder.finish().ok, true);
  assert.deepEqual(reports, [{ notes, sources: allSources }]);
});

test("cached clients receive a bounded cited answer without new report records", async () => {
  local();
  for (const streamResearchDetails of [undefined, false]) {
    let calls = 0;
    global.fetch = async (_url, options) => {
      calls++;
      return JSON.parse(options.body).tools ? researchReply(largeResearchDocument())
        : reply(textEnvelope("A concise finding from the available evidence. [1]"));
    };
    const res = response();
    await handler(request({ message: "Research this", actionMode: "deep-research",
      ...(streamResearchDetails === undefined ? {} : { streamResearchDetails }) }), res);
    const events = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(events.some((event) => event.type.startsWith("research_report")), false);
    assert.equal(events.find((event) => event.type === "sources").sources.length, 8);
    assert.equal(events.at(-1).type, "done");
    const decoder = createMetabloomSegmentStreamDecoder();
    assert.equal(decoder.push(res.body), true);
    assert.equal(decoder.finish().ok, true);
    assert.equal(calls, 2);
  }
});

test("a writer failure retains the full report despite pending auxiliary research metadata, without retries", async () => {
  local();
  const calls = [];
  const res = response();
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.tools) {
      assert.equal(body.max_tool_calls, 6);
      assert.equal(body.max_output_tokens, 10000);
      return researchReply(largeResearchDocument());
    }
    const alreadySent = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(alreadySent.filter((event) => event.type === "research_report_complete").length, 1);
    assert.equal(alreadySent.some((event) => ["text_delta", "segment", "text_complete", "done"].includes(event.type)), false);
    return new Response(JSON.stringify({ error: { message: "Private provider detail" } }), { status: 429, headers: { "content-type": "application/json" } });
  };
  await handler(request({ message: "Research this", actionMode: "deep-research", streamResearchDetails: true }), res);
  const reports = [];
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails: (report) => reports.push(report) });
  assert.equal(decoder.push(res.body), false);
  assert.equal(decoder.finish().code, "provider_rate_limited");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].sources.length, 65);
  assert.match(reports[0].notes, /Finding 65/);
  assert.equal(calls.length, 2, "One research request and one writer request, without retries.");
  assert.equal(calls.filter((body) => Boolean(body.tools)).length, 1);
  assert.equal(res.body.includes("Private provider detail"), false);
  assert.equal(res.body.includes('"type":"segment"'), false);
  assert.equal(res.body.includes('"type":"text_complete"'), false);
  assert.equal(res.body.includes('"type":"done"'), false);
});

test("a completed report with no small cited passage can be delivered without a writer call", async () => {
  local();
  let calls = 0;
  const value = researchDocument();
  const content = value.output[1].content[0];
  content.text = "Long complete research finding. ".repeat(700);
  content.annotations[0].start_index = 0;
  content.annotations[0].end_index = content.text.length;
  global.fetch = async (_url, options) => {
    calls++;
    assert.ok(JSON.parse(options.body).tools, "No extra model request is needed to expose completed research.");
    return researchReply(value);
  };
  const res = response();
  await handler(request({ message: "Research this", actionMode: "deep-research", streamResearchDetails: true }), res);
  const events = res.body.trim().split("\n").map(JSON.parse);
  assert.equal(calls, 1);
  assert.ok(events.some((event) => event.type === "research_report_complete"));
  assert.match(events.find((event) => event.type === "segment").response, /Open Full research/);
  assert.equal(events.at(-1).type, "done");
});

test("cancelling report delivery cannot expose a partial report or start a writer", async () => {
  local();
  let calls = 0;
  global.fetch = async () => { calls++; return researchReply(largeResearchDocument()); };
  const res = response();
  res.write = function (chunk) {
    this.body += chunk;
    if (chunk.includes('"type":"research_report_delta"')) {
      this.destroyed = true;
      this.emit("close");
    }
    return true;
  };
  await handler(request({ message: "Research this", actionMode: "deep-research", streamResearchDetails: true }), res);
  assert.equal(calls, 1);
  assert.equal(res.body.includes('"type":"research_report_complete"'), false);
  assert.equal(res.body.includes('"type":"sources"'), false);
  const reports = [];
  const decoder = createMetabloomSegmentStreamDecoder({ allowResearchDetails: true, onResearchDetails: (report) => reports.push(report) });
  decoder.push(res.body);
  assert.equal(decoder.finish().ok, false);
  assert.deepEqual(reports, []);
});

const visualIdentity = { owner: "a".repeat(64), subject: "b".repeat(64), scope: "c".repeat(64) };
const enableVisualSession = () => {
  local();
  process.env.METABLOOM_VISUALS_ENABLED = "true";
  delete process.env.METABLOOM_UI_TOOLS_ENABLED;
  mock.method(metabloomAuth, "requireMetabloomSession", async (_request, options) => {
    options.onIdentity?.(visualIdentity);
    return null;
  });
};
const visualRequest = (message, history = []) => {
  const req = request({ message, history, actionMode: "auto", streamText: true, requestId: "capability-request" });
  req.headers["x-metabloom-visuals"] = "1";
  req.headers["x-metabloom-ui-tools"] = "1";
  return req;
};

test("capability questions use the actual host catalogue without a model or visual offer", async () => {
  enableVisualSession();
  process.env.TYPESAFE_API_KEY = "test-only-jev-credential";
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("Capability answers must not invoke a provider"); };
  const req = visualRequest("What kind of UI can you create?", [
    { role: "assistant", content: "I can build interactive maps, export PDFs and render any application you imagine." },
  ]);
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 0);
  const expected = getMetabloomVisualCapabilityResponse({ mode: "capabilities" }, { enabled: true });
  const decoder = createMetabloomSegmentStreamDecoder();
  assert.equal(decoder.push(res.body), true);
  assert.deepEqual(decoder.finish().value, textEnvelope(expected));
  const records = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(records.map(record => record.type), ["emote", "action", "text_delta", "segment", "text_complete", "emote", "done"]);
  assert.equal(records.find(record => record.type === "action").action, "none");
  assert.ok(!records.some(record => ["visual_offer", "research", "sources"].includes(record.type)));
});

test("unsupported maps and poisoned follow-ups cannot become fictional successful executions", async () => {
  enableVisualSession();
  process.env.TYPESAFE_API_KEY = "test-only-jev-credential";
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("No map tool or text writer should execute"); };
  const poisoned = [
    { role: "user", content: "Create an interactive map of wineries in Kelowna." },
    { role: "assistant", content: "Done. I am displaying your interactive map now, with live zoom and PDF exports." },
  ];
  for (const [message, history] of [
    ["Create an interactive map of wineries in Kelowna.", []],
    ["let's go", poisoned],
    ["all three one at a time", poisoned],
    ["Where is it?", poisoned],
  ]) {
    const res = response();
    await handler(visualRequest(message, history), res);
    assert.equal(res.statusCode, 200, message);
    const decoder = createMetabloomSegmentStreamDecoder();
    assert.equal(decoder.push(res.body), true, message);
    const result = decoder.finish();
    assert.equal(result.ok, true, message);
    assert.match(result.value.segments[0].response, /map|display|render/i);
    assert.doesNotMatch(result.value.segments[0].response, /I am displaying|Done\.|your interactive map is ready/i);
    assert.equal(res.body.includes('"type":"visual_offer"'), false);
  }
  assert.equal(calls, 0);
});

test("an ambiguous confirmation after supported visual work asks for clarification without regenerating", async () => {
  enableVisualSession();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("A vague confirmation does not authorize a duplicate generation"); };
  const res = response();
  await handler(visualRequest("let's go", [
    { role: "user", content: "Create a pie chart of apple pie ingredients." },
    { role: "assistant", content: "Your pie chart is ready. I can also make maps and exports. Shall we continue?" },
  ]), res);
  const decoder = createMetabloomSegmentStreamDecoder();
  assert.equal(res.statusCode, 200);
  assert.equal(decoder.push(res.body), true);
  assert.deepEqual(decoder.finish().value, textEnvelope(getMetabloomVisualCapabilityResponse({ mode: "clarification" }, { enabled: true })));
  assert.equal(calls, 0);
  assert.equal(res.body.includes('"type":"visual_offer"'), false);
});

test("the complete reported map conversation stays on truthful host replies despite poisoned assistant history", async () => {
  enableVisualSession();
  process.env.TYPESAFE_API_KEY = "test-only-jev-credential";
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("Reported capability and unsupported-map turns must not invoke OpenAI or Jev"); };
  const messages = [
    "what else can you do with gen ui?",
    "can you show me a map of kelowna bc?",
    "i shouldn't have to, just pick yourself please",
    "let's do all three one at a time",
    "i want it visible in the gen ui",
    "lets go",
    "nope",
    "i don't see any of that",
  ];
  const poisonedReplies = [
    "I can create interactive maps, dashboards, arbitrary app UIs and PDF exports.",
    "I can make a tourist map, a winery map and a restaurant map of Kelowna. Which would you like?",
    "I picked all three maps. I will render each with zoom, filters and export controls.",
    "Done. I am displaying the tourist map now; the other two are next.",
    "The interactive map is visible in the Gen UI panel now.",
    "Done. All three maps are displaying with their controls.",
    "I have refreshed the maps, and they are now visible.",
    "Everything is displayed successfully.",
  ];
  const history = [];
  const mapReplies = ["unsupported", "visual_status"].map(mode =>
    getMetabloomVisualCapabilityResponse({ mode, unsupportedKind: "map" }, { enabled: true }));
  for (const [index, message] of messages.entries()) {
    const res = response();
    await handler(visualRequest(message, history.slice(-12)), res);
    assert.equal(res.statusCode, 200, message);
    const decoder = createMetabloomSegmentStreamDecoder();
    assert.equal(decoder.push(res.body), true, message);
    const result = decoder.finish();
    assert.equal(result.ok, true, message);
    const answer = result.value.segments[0].response;
    if (index === 0) {
      assert.equal(answer, getMetabloomVisualCapabilityResponse({ mode: "capabilities" }, { enabled: true }));
    } else {
      assert.ok(mapReplies.includes(answer), message + ": " + answer);
    }
    const records = res.body.trim().split("\n").map(JSON.parse);
    assert.equal(records.find(record => record.type === "action").action, "none", message);
    assert.ok(!records.some(record => ["visual_offer", "research", "sources"].includes(record.type)), message);
    assert.equal(calls, 0, message);
    history.push({ role: "user", content: message }, { role: "assistant", content: poisonedReplies[index] });
  }
});

test("explicit supported render follow-ups retain the native-tool boundary", async () => {
  enableVisualSession();
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("The text writer must not replace a supported visual request"); };
  const res = response();
  await handler(visualRequest("Render that pie chart again.", [
    { role: "user", content: "Create a pie chart: apples 75, crust 20, sugar 5." },
    { role: "assistant", content: "I created the pie chart, a geographic map and a PDF export." },
  ]), res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(JSON.parse(res.body), { code: "visual_tool_required" });
  assert.equal(calls, 0);
});

test("capability availability requires negotiated rendering, an owned session and enabled server tools", async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("An unavailable capability must not call a provider"); };
  for (const unavailable of ["visuals-disabled", "tools-disabled", "missing-visual-header", "missing-tool-header", "missing-request-id", "missing-identity", "missing-model-key"]) {
    enableVisualSession();
    const req = visualRequest("What kind of UI can you create?");
    if (unavailable === "visuals-disabled") process.env.METABLOOM_VISUALS_ENABLED = "false";
    if (unavailable === "tools-disabled") process.env.METABLOOM_UI_TOOLS_ENABLED = "false";
    if (unavailable === "missing-visual-header") delete req.headers["x-metabloom-visuals"];
    if (unavailable === "missing-tool-header") delete req.headers["x-metabloom-ui-tools"];
    if (unavailable === "missing-request-id") delete req.body.requestId;
    if (unavailable === "missing-identity") mock.method(metabloomAuth, "requireMetabloomSession", async () => null);
    if (unavailable === "missing-model-key") delete process.env.OPENAI_API_KEY;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 200, unavailable);
    const decoder = createMetabloomSegmentStreamDecoder();
    assert.equal(decoder.push(res.body), true, unavailable);
    assert.deepEqual(decoder.finish().value, textEnvelope(getMetabloomVisualCapabilityResponse({ mode: "capabilities" }, { enabled: false })), unavailable);
  }
  assert.equal(calls, 0);
});

test("authenticated metadata does not advertise native tools without their provider configuration", async () => {
  enableVisualSession();
  global.fetch = async () => { assert.fail("Metadata must not invoke paid work"); };
  const req = request();
  req.method = "GET";
  const enabled = response();
  await handler(req, enabled);
  assert.equal(JSON.parse(enabled.body).uiToolsEnabled, true);
  delete process.env.OPENAI_API_KEY;
  const disabled = response();
  await handler(req, disabled);
  assert.equal(JSON.parse(disabled.body).uiToolsEnabled, false);
});

test("fixed capability replies still enforce authentication, exact origin, validation and atomic quota", async () => {
  enableVisualSession();
  const calls = [];
  global.fetch = async (url, options) => { calls.push([String(url), JSON.parse(options.body)]); return Response.json({ result: 0 }); };
  mock.method(metabloomAuth, "requireMetabloomSession", async () => ({ status: 401, code: "authentication_required" }));
  const unauthenticated = response();
  await handler(visualRequest("What kind of UI can you create?"), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  enableVisualSession();
  const crossOrigin = visualRequest("What kind of UI can you create?");
  crossOrigin.headers.origin = "https://attacker.example";
  const denied = response();
  await handler(crossOrigin, denied);
  assert.equal(denied.statusCode, 403);
  const invalid = visualRequest("What kind of UI can you create?");
  invalid.body.capabilities = ["map"];
  const malformed = response();
  await handler(invalid, malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(calls.length, 0);
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  process.env.UPSTASH_REDIS_REST_URL = "https://quota.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-only-quota-token";
  const req = visualRequest("What kind of UI can you create?");
  req.headers.origin = "https://localhost:3000";
  const limited = response();
  await handler(req, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://quota.example.com/");
  assert.equal(calls[0][1][0], "EVAL");
});

test("an authenticated fixed capability reply consumes shared quota without paid or artifact work", async () => {
  enableVisualSession();
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "production";
  process.env.TYPESAFE_API_KEY = "test-only-jev-credential";
  process.env.UPSTASH_REDIS_REST_URL = "https://quota.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-only-quota-token";
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push([String(url), body]);
    assert.equal(String(url), "https://quota.example.com/");
    assert.equal(body[0], "EVAL");
    return Response.json({ result: 1 });
  };
  const req = visualRequest("What kind of UI can you create?");
  req.headers.origin = "https://localhost:3000";
  req.body.actionMode = "deep-research";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  const decoder = createMetabloomSegmentStreamDecoder();
  assert.equal(decoder.push(res.body), true);
  assert.equal(decoder.finish().ok, true);
  assert.equal(calls.length, 1);
  assert.equal(res.body.includes('"type":"research"'), false);
  assert.equal(res.body.includes('"type":"visual_offer"'), false);
});

test("ordinary writer receives renderer context only when the client can actually accept visuals", async () => {
  enableVisualSession();
  const sent = [];
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).host, "api.openai.com");
    sent.push(JSON.parse(options.body));
    return reply(textEnvelope("Sunlight is scattered by the atmosphere."));
  };
  const unnegotiated = request({ message: "Why is the sky blue?", history: [], requestId: "text-only-client" });
  await handler(unnegotiated, response());
  await handler(visualRequest("Why is the sky blue?"), response());
  assert.equal(sent.length, 2);
  assert.equal(sent[0].instructions, buildMetabloomChatSystemPrompt({ visualMode: "disabled" }));
  assert.equal(sent[1].instructions, buildMetabloomChatSystemPrompt({ visualMode: "optional" }));
  assert.ok(sent.every(payload => payload.tools === undefined));
});

test("an explicit request for map source code remains an ordinary unexecuted code answer", async () => {
  enableVisualSession();
  let calls = 0, payload;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).host, "api.openai.com");
    payload = JSON.parse(options.body);
    return reply(textEnvelope("Example source code, unexecuted: const marker = { latitude: 49.88, longitude: -119.49 };"));
  };
  const message = "Please write JavaScript source code for an interactive map of Kelowna.";
  const res = response();
  await handler(visualRequest(message), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(payload.input.at(-1).content, message);
  assert.equal(payload.tools, undefined);
  const decoder = createMetabloomSegmentStreamDecoder();
  assert.equal(decoder.push(res.body), true);
  assert.match(decoder.finish().value.segments[0].response, /unexecuted/);
  assert.equal(res.body.includes('"type":"visual_offer"'), false);
});

test("explicit deep research can retain its supported visual request without a conflicting tool guard", async () => {
  local();
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    return JSON.parse(options.body).tools ? researchReply() : reply(textEnvelope("The supplied evidence supports the comparison. [1]"));
  };
  const req = visualRequest("Research this and create a bar chart of the supplied observations.");
  req.body.actionMode = "deep-research";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  const decoder = createMetabloomSegmentStreamDecoder();
  assert.equal(decoder.push(res.body), true);
  assert.equal(decoder.finish().ok, true);
  assert.equal(calls, 2);
  assert.equal(res.body.includes("visual_tool_required"), false);
});
