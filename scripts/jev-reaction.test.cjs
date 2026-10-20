const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { decideMetabloomReaction, decideMetabloomInput, decideMetabloomResponse } = require("../server/jevReactionService");

const savedKey = process.env.TYPESAFE_API_KEY;
const savedModel = process.env.JEV_MODEL;
afterEach(() => {
  if (savedKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = savedKey;
  if (savedModel === undefined) delete process.env.JEV_MODEL;
  else process.env.JEV_MODEL = savedModel;
});
const result = (choice, confidence) => new Response(JSON.stringify({
  model: "jev-latest", usage: { input_tokens: 25, output_tokens: 10 },
  answers: { reaction: { type: "choice", choice, confidence, probabilities: { [choice]: 0.99 } } },
}), { headers: { "content-type": "application/json" } });
const choiceAnswer = (choice, confidence = 0.97) => ({ type: "choice", choice, confidence, probabilities: { [choice]: 0.97 } });
const inputResult = (reaction, action) => Response.json({ answers: { reaction, action } });

test("the API key stays server side and each Jev phase has distinct instructions", async () => {
  process.env.TYPESAFE_API_KEY = "fixture-not-a-real-secret";
  process.env.JEV_MODEL = "jev-latest";
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, ...options, body: JSON.parse(options.body) });
    return result(seen.length === 1 ? "curious" : "resolute", 0.98);
  };
  const first = await decideMetabloomReaction({ phase: "input", state: { latestUserMessage: "Why?" }, fetchImpl });
  const second = await decideMetabloomReaction({ phase: "response", state: { assistantResponse: "Here's why." }, fetchImpl });
  assert.equal(first, "curious"); assert.equal(second, "resolute");
  assert.equal(seen.length, 2);
  for (const request of seen) {
    assert.equal(request.url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(request.body.model, "jev-latest");
    assert.equal(request.headers.Authorization, "Bearer fixture-not-a-real-secret");
    assert.equal(request.body.questions.reaction.type, "choice");
    assert.equal(request.body.questions.reaction.criteria.neutral !== undefined, true);
  }
  assert.notEqual(seen[0].body.questions.reaction.instructions, seen[1].body.questions.reaction.instructions);
});

test("invalid, ambiguous, or missing Jev results safely settle to neutral", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  for (const answer of [result("warm", 0.1), result("unknown", 0.99),
    new Response(JSON.stringify({ answers: { reaction: { type: "choice", choice: "warm", confidence: 1 } } }), { headers: { "content-type": "application/json" } }),
    new Response("not-json", { headers: { "content-type": "application/json" } }),
    new Response("unauthorized", { status: 401 })]) {
    assert.equal(await decideMetabloomReaction({ phase: "input", state: "Hello", fetchImpl: async () => answer }), "neutral");
  }
  delete process.env.TYPESAFE_API_KEY;
  assert.equal(await decideMetabloomReaction({ phase: "input", state: "Hello", fetchImpl: () => { throw Error("called"); } }), "neutral");
});

test("timeouts and cancelled turns never yield a stale reaction", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  const controller = new AbortController();
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  });
  controller.abort();
  assert.equal(await decideMetabloomReaction({ phase: "input", state: "Hello", signal: controller.signal, fetchImpl }), "neutral");
  assert.equal(await decideMetabloomReaction({ phase: "response", state: "Reply", timeoutMs: 5, fetchImpl }), "neutral");
});

test("auto mode batches independent emote and action choices into one input request", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  const requests = [];
  const state = { latestUserMessage: "Show me a trick", recentConversation: [] };
  const decision = await decideMetabloomInput({ actionMode: "auto", state, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return inputResult(choiceAnswer("whimsy"), choiceAnswer("under-the-hood"));
  } });
  assert.deepEqual(decision, { emote: "whimsy", action: "under-the-hood" });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].state, state);
  assert.deepEqual(Object.keys(requests[0].questions), ["reaction", "action"]);
  assert.equal(requests[0].questions.action.type, "choice");
  assert.deepEqual(Object.keys(requests[0].questions.action.criteria), ["none", "deep-research", "under-the-hood"]);
});

test("an invalid action cannot erase a valid emote and an invalid emote cannot erase a valid action", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  for (const action of [undefined, choiceAnswer("unknown"), choiceAnswer("deep-research", 0.69),
    { type: "choice", choice: { toString: null, valueOf: null }, confidence: 0.97, probabilities: {} },
    { type: "choice", choice: "deep-research", confidence: 0.97 }]) {
    assert.deepEqual(await decideMetabloomInput({ state: "Hello", fetchImpl: async () => inputResult(choiceAnswer("warm"), action) }),
      { emote: "warm", action: "none" });
  }
  for (const reaction of [undefined, choiceAnswer("unknown"), choiceAnswer("warm", 0.69),
    { type: "choice", choice: { toString: null, valueOf: null }, confidence: 0.97, probabilities: {} }]) {
    assert.deepEqual(await decideMetabloomInput({ state: "Explain carefully", fetchImpl: async () => inputResult(reaction, choiceAnswer("deep-research", 0.7)) }),
      { emote: "neutral", action: "deep-research" });
  }
});

test("explicit actions omit classification and cannot be overridden by unsolicited Jev answers", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  for (const actionMode of ["none", "deep-research", "under-the-hood"]) {
    let sent;
    const decision = await decideMetabloomInput({ actionMode, state: "Hello", fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return inputResult(choiceAnswer("curious"), choiceAnswer(actionMode === "deep-research" ? "under-the-hood" : "deep-research"));
    } });
    assert.deepEqual(Object.keys(sent.questions), ["reaction"]);
    assert.deepEqual(decision, { emote: "curious", action: actionMode });
  }
});

test("explicit actions survive missing, unavailable, and timed-out Jev while auto falls back to none", async () => {
  const waitingFetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  });
  for (const actionMode of ["auto", "none", "deep-research", "under-the-hood"]) {
    const expected = { emote: "neutral", action: actionMode === "auto" ? "none" : actionMode };
    delete process.env.TYPESAFE_API_KEY;
    assert.deepEqual(await decideMetabloomInput({ actionMode, fetchImpl: () => assert.fail("No unconfigured call") }), expected);
    process.env.TYPESAFE_API_KEY = "fixture";
    assert.deepEqual(await decideMetabloomInput({ actionMode, fetchImpl: async () => new Response("Unavailable", { status: 503 }) }), expected);
    assert.deepEqual(await decideMetabloomInput({ actionMode, timeoutMs: 5, fetchImpl: waitingFetch }), expected);
  }
});

test("cancelled input decisions cannot publish an action even if a transport supplies a late answer", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  const controller = new AbortController();
  let release;
  const decision = decideMetabloomInput({ actionMode: "deep-research", signal: controller.signal,
    fetchImpl: () => new Promise((resolve) => { release = resolve; }) });
  controller.abort();
  release(inputResult(choiceAnswer("celebratory"), choiceAnswer("under-the-hood")));
  assert.deepEqual(await decision, { emote: "neutral", action: "none" });
  assert.deepEqual(await decideMetabloomInput({ actionMode: "auto", signal: controller.signal,
    fetchImpl: () => assert.fail("A cancelled input cannot start Jev") }), { emote: "neutral", action: "none" });
});

test("the existing reaction API remains reaction-only even when passed an action mode", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  for (const phase of ["input", "response"]) {
    let sent;
    const emote = await decideMetabloomReaction({ phase, actionMode: "auto", state: "Hello", fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return inputResult(choiceAnswer("warm"), choiceAnswer("deep-research"));
    } });
    assert.equal(emote, "warm");
    assert.deepEqual(Object.keys(sent.questions), ["reaction"]);
  }
});

test("non-generation intents cannot select a visual even when a caller passes supported kinds", async () => {
  process.env.TYPESAFE_API_KEY = "fixture";
  for (const visualIntent of ["capabilities", "unsupported", "clarification", "visual_status", "text_only", "unknown"]) {
    let sent;
    const decision = await decideMetabloomResponse({
      visualIntent, visualKinds: ["table", "pie-chart"], preferredKinds: ["pie-chart"], requiredKind: "pie-chart",
      state: { latestUserMessage: "I do not see the map.", assistantResponse: "Maps are unavailable here." },
      fetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return Response.json({ answers: { reaction: choiceAnswer("reassuring"), visualization: choiceAnswer("pie-chart") } });
      },
    });
    assert.deepEqual(Object.keys(sent.questions), ["reaction"]);
    assert.equal(decision.emote, "reassuring");
    assert.equal(decision.visualization, "none");
  }
});
