const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { decideMetabloomReaction } = require("../server/jevReactionService");

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
