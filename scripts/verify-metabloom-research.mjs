// Local built-app verification only. This fictional session and provider must
// never be imported by deployed application code. No paid provider calls occur.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createBuildServer } from "./auth-invoice-test-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const metabloomAuth = require("../server/metabloomAuth");
const handler = require("../api/metabloom");
const { buildMetabloomResearchDateEvidenceCatalog } = require("../server/metabloomResearchBrief");
const productionOutput = require("./fixtures/metabloom-research-output-20261023.cjs");
const output = path.join(os.tmpdir(), "metabloom-research-browser");
const buildRoot = path.resolve("build");
assert(fs.existsSync(path.join(buildRoot, "index.html")), "Run npm run build before this verification script.");
fs.mkdirSync(output, { recursive: true });

const sourceList = [
  { id: 1, title: "Fictional orchard sensor release notes", url: "https://example.com/orchard-release" },
  { id: 2, title: "Fictional orchard calibration study", url: "https://example.org/orchard-study" },
];
const verificationDate = productionOutput.asOf.slice(0, 10);
const verificationTimeZone = productionOutput.timeZone;
const developmentQuotes = [
  `On ${verificationDate}, the fictional orchard team announced one-minute moisture readings.`,
  `On ${verificationDate}, the fictional study team published its reference calibration trial results.`,
];
const briefCandidate = () => ({
  title: "Fictional orchard news", scope: "Orchard technology developments today", limitations: [],
  items: sourceList.map((source, index) => ({
    headline: index === 0 ? "Orchard team announces one-minute moisture readings" : "Study team publishes calibration trial results",
    summary: index === 0 ? "The fictional release introduces one-minute soil moisture readings with an initial calibration step."
      : "The fictional study describes checking the installed sensor against a reference measurement.",
    sourceIds: [source.id], background: [{ text: index === 0
      ? "The release notes describe calibration before comparing readings from different orchard rows."
      : "The trial uses a reference measurement after installation to check the sensor readings.", sourceIds: [source.id] }],
    whyItMatters: "Recording the sensor version and calibration date can help the fictional team interpret changes consistently.",
    uncertainty: ["The supplied documents do not establish the effect in every orchard."],
    watchNext: ["Watch for the next published evaluation of the trial."], developmentDate: verificationDate, scheduledDate: null,
    dateEvidence: { sourceId: source.id, reportExcerpt: developmentQuotes[index] }, evidenceStatus: index === 0 ? "announced" : "reported", dateBasis: "research-excerpt",
  })), sourceDetails: [],
});
// Retain readable historical fixture dates/quotes, but send only the current
// private contract. Selection must match the intended source, date and passage;
// a null or unsupported evidence basis never borrows another catalog entry.
const withReferences = (value, catalog) => ({ ...value, items: value.items.map(entry => {
  const { developmentDate, dateBasis, dateEvidence, ...item } = entry;
  const selected = dateBasis === "research-excerpt" && dateEvidence && catalog.find(option =>
    option.sourceId === dateEvidence.sourceId && option.date === developmentDate
      && option.excerpt.includes(dateEvidence.reportExcerpt));
  return { ...item, dateEvidence: selected ? { evidenceId: selected.id } : null };
}) });
const ordinaryAnswer = "Hello to the imaginary orchard team. This ordinary reply uses one writer request and does not start a research pass.";
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const waitFor = async (promise, label, timeoutMs = 20000) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
};
const fixtures = new Map();
const makeFixture = (id, kind, question) => {
  const fixture = {
    id, kind, question, calls: [], wire: [], researchRequested: deferred(), writerRequested: deferred(),
    finished: deferred(), aborted: deferred(), readerCancelled: deferred(), researchAborted: false,
  };
  fixtures.set(question, fixture);
  return fixture;
};
const researchDocument = () => {
  const firstFinding = `${developmentQuotes[0]} The release notes describe calibration before comparing readings from different orchard rows.`;
  const secondFinding = `${developmentQuotes[1]} The trial checks readings against a reference measurement after installation and records the sensor version and calibration date.`;
  const summary = `${firstFinding} ${secondFinding}`;
  const text = summary + "\n\n" + Array.from({ length: 180 }, (_, index) =>
    `Fictional research detail ${index + 1}: record the orchard row, sensor version and calibration date together so the imaginary team can compare its observations consistently.`
  ).join("\n\n") + "\n\nEnd of the complete fictional orchard research report.";
  const boundary = firstFinding.length;
  return {
    status: "completed",
    usage: { input_tokens: 450, output_tokens: 7900, output_tokens_details: { reasoning_tokens: 40 } },
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "fictional orchard sensor release", sources: [{ type: "url", url: sourceList[0].url }] } },
      { type: "web_search_call", status: "completed", action: { type: "open_page", url: sourceList[0].url } },
      { type: "web_search_call", status: "completed", action: { type: "search", query: "fictional orchard reference calibration", sources: [{ type: "url", url: sourceList[1].url }] } },
      ...Array.from({ length: 3 }, (_, index) => ({ type: "web_search_call", status: "completed",
        action: { type: "search", query: `fictional orchard related finding ${index + 1}` } })),
      // Synthetic pending-status variant: the observed production log exposed
      // five completed searches, but did not expose each auxiliary status.
      { type: "web_search_call", status: "in_progress", action: { type: "open_page", url: "https://example.com/unavailable" } },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [
        { type: "url_citation", title: sourceList[0].title, url: sourceList[0].url, start_index: 0, end_index: boundary },
        { type: "url_citation", title: sourceList[1].title, url: sourceList[1].url, start_index: boundary + 1, end_index: summary.length },
      ] }] },
    ],
  };
};
const writerEvents = (paragraphs) => {
  const text = JSON.stringify({ version: "2.0.0", segments: paragraphs.map((response) => ({ response })) });
  const channel = { item_id: "fictional-writer-message", output_index: 0, content_index: 0 };
  const midpoint = Math.floor(text.length / 2);
  return [
    { type: "response.output_text.delta", ...channel, delta: text.slice(0, midpoint) },
    { type: "response.output_text.delta", ...channel, delta: text.slice(midpoint) },
    { type: "response.output_text.done", ...channel, text },
    { type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
};
const briefResponse = (candidate) => new Response(JSON.stringify({ status: "completed", output: [
  { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(candidate) }] },
] }), { headers: { "content-type": "application/json", "x-request-id": "req_fictional_browser_brief" } });

const envKeys = ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_RESEARCH_MODEL", "TYPESAFE_API_KEY", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalAuth = metabloomAuth.requireMetabloomSession;
const originalDateNow = Date.now;
const unexpectedProviderRequests = [];
// Pin the server's calendar context for the pasted-output regression. Browser
// animation timers remain real; only server-owned timestamps are fixed.
Date.now = () => Date.parse(productionOutput.asOf);
process.env.OPENAI_API_KEY = "fictional-local-verification-key";
process.env.METABLOOM_OPENAI_MODEL = "gpt-5-mini";
process.env.METABLOOM_RESEARCH_MODEL = "gpt-5-mini";
process.env.VERCEL_ENV = "development";
process.env.NODE_ENV = "test";
for (const key of ["TYPESAFE_API_KEY", "VERCEL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[key];

// There is no passthrough to real fetch, including for unexpected provider hosts.
globalThis.fetch = async (url, options = {}) => {
  if (String(url) !== "https://api.openai.com/v1/responses") {
    unexpectedProviderRequests.push(String(url));
    throw new Error("Verification blocked an unexpected provider request.");
  }
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Authorization, "Bearer fictional-local-verification-key");
  assert(options.signal instanceof AbortSignal);
  const body = JSON.parse(options.body);
  const lastInput = body.input?.at(-1)?.content;
  let fixture = fixtures.get(lastInput);
  if (!fixture) {
    try { fixture = fixtures.get(JSON.parse(lastInput).request); } catch { /* Exact legacy question matching remains available. */ }
  }
  assert(fixture, "Provider request must belong to a registered local fixture.");
  const research = Boolean(body.tools);
  const structured = body.text?.format?.name === "metabloom_research_brief";
  const call = { phase: research ? "research" : structured ? "brief" : "writer", model: body.model, stream: body.stream,
    store: body.store, maxOutputTokens: body.max_output_tokens, maxToolCalls: body.max_tool_calls,
    reasoning: body.reasoning, at: Date.now() };
  fixture.calls.push(call);
  assert.equal(body.store, false);
  if (research) {
    assert.notEqual(fixture.kind, "ordinary");
    assert.equal(fixture.calls.length, 1);
    assert.equal(body.stream, true);
    assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "medium" }]);
    assert.equal(body.tool_choice, "required");
    assert.equal(body.include, undefined);
    assert.equal(body.max_tool_calls, 6);
    assert.equal(body.max_output_tokens, 10000);
    assert.deepEqual(body.reasoning, { effort: "medium" });
    options.signal.addEventListener("abort", () => {
      fixture.researchAborted = true;
      fixture.aborted.resolve();
    }, { once: true });
    const response = new Response(new ReadableStream({
      start(controller) {
        const emit = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        const fixtureDocument = () => fixture.kind === "production" ? productionOutput.researchDocument() : researchDocument();
        fixture.reportSearch = () => emit({ type: "response.output_item.done", output_index: 0,
          item: fixtureDocument().output[0] });
        fixture.releaseResearch = () => {
          try {
            const value = fixtureDocument();
            if (fixture.kind === "invalid") value.output.at(-1).content[0].annotations = [];
            emit({ type: "response.completed", response: value });
            controller.close();
            return true;
          } catch { return false; }
        };
      },
      cancel() { fixture.readerCancelled.resolve(); },
    }), { headers: { "content-type": "text/event-stream" } });
    fixture.researchRequested.resolve();
    return response;
  }
  assert.equal(body.tools, undefined);
  assert.equal(body.text?.format?.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.stream, fixture.kind === "ordinary");
  assert.equal(body.text.format.name, fixture.kind === "ordinary" ? "metabloom_chat_response" : "metabloom_research_brief");
  assert.equal(body.max_output_tokens, fixture.kind === "ordinary" ? 2400 : 6000);
  const evidence = structured ? JSON.parse(body.input.at(-1).content) : null;
  if (fixture.kind !== "ordinary") {
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(body.reasoning, { effort: "low" });
    const expectedSources = fixture.kind === "production" ? productionOutput.sources : sourceList;
    assert(expectedSources.every(({ id }) => evidence.report.sources.some((source) => source.id === id)), "Synthesis must retain canonical source IDs.");
    assert(evidence.report.notes.length <= 16000, "The full report must not expand the paid writer context.");
    if (fixture.kind === "production") assert.equal(evidence.report.notes, productionOutput.report.notes);
    assert.equal(evidence.temporalContext.timeZone, verificationTimeZone);
    assert.equal(evidence.temporalContext.localDate, verificationDate);
    const canonicalReport = { notes: evidence.report.notes,
      sources: expectedSources.filter(source => evidence.report.sources.some(entry => entry.id === source.id)) };
    assert.deepEqual(evidence.dateEvidenceCatalog, buildMetabloomResearchDateEvidenceCatalog(canonicalReport));
  } else assert.equal(fixture.calls.length, 1);
  if (fixture.kind === "writer-failure") {
    fixture.writerRequested.resolve();
    return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
      status: 429, headers: { "content-type": "application/json", "x-request-id": "fictional-writer-rate-limit" },
    });
  }
  if (structured) {
    const response = new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => { fixture.formatterAborted = true; reject(new Error("Fictional formatter cancelled.")); }, { once: true });
      fixture.releaseWriter = () => resolve(briefResponse(withReferences(fixture.kind === "production"
        ? fixture.emptyCoverage ? productionOutput.observedCandidate() : productionOutput.candidate({ unicodeOnly: true })
        : briefCandidate(), evidence.dateEvidenceCatalog)));
    });
    fixture.writerRequested.resolve();
    return response;
  }
  const response = new Response(new ReadableStream({
    start(controller) {
      fixture.releaseWriter = () => {
        controller.enqueue(new TextEncoder().encode(writerEvents([ordinaryAnswer])));
        controller.close();
      };
    },
  }), { headers: { "content-type": "text/event-stream" } });
  fixture.writerRequested.resolve();
  return response;
};

const fictionalCookie = "metabloom-research-fixture=fictional-local-session";
const server = createBuildServer({ buildRoot, getSession: () => ({ authenticated: true,
  user: { id: "a".repeat(64), role: "admin", name: "Fictional research verifier" },
  csrfToken: "b".repeat(64), expiresAt: originalDateNow() + 3600000 }) });
let origin;
metabloomAuth.requireMetabloomSession = async (request) => {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket?.remoteAddress);
  if (!local || request.headers.host !== new URL(origin).host
    || !request.headers.cookie?.split(/;\s*/).includes(fictionalCookie)) {
    return { status: 401, code: "authentication_required" };
  }
  return null;
};
const serve = server.listeners("request")[0];
server.removeAllListeners("request");
const serverErrors = [];
server.on("request", async (request, response) => {
  if (new URL(request.url, "http://127.0.0.1").pathname !== "/api/metabloom") return serve(request, response);
  let fixture;
  try {
    if (request.method === "POST") {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 24000) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      fixture = fixtures.get(request.body.message);
      assert(fixture, "Only registered local fixture requests may reach the verification handler.");
      fixture.api = { actionMode: request.body.actionMode, allowMultiple: request.body.allowMultiple,
        streamText: request.body.streamText, streamResearchDetails: request.body.streamResearchDetails,
        streamResearchBrief: request.body.streamResearchBrief, timeZone: request.body.timeZone,
        historyLength: request.body.history.length, at: Date.now() };
      let wire = "";
      const capture = (chunk) => {
        if (chunk) wire += String(chunk);
        assert(wire.length <= 2 * 1048576, "Verification wire capture exceeded the protocol bound.");
      };
      const write = response.write.bind(response);
      const end = response.end.bind(response);
      response.write = (chunk, ...args) => { capture(chunk); return write(chunk, ...args); };
      response.end = (chunk, ...args) => { capture(chunk); return end(chunk, ...args); };
      fixture.readWire = () => wire.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    }
    await handler(request, response);
    if (fixture) {
      fixture.wire = fixture.readWire();
      fixture.status = response.statusCode;
    }
  } catch (error) {
    serverErrors.push(error.message);
    if (!response.destroyed && !response.writableEnded) { response.statusCode = 500; response.end(); }
  } finally { fixture?.finished.resolve(); }
});

const installObserver = () => {
  localStorage.setItem("popcon-theme", "dark");
  window.__researchVerification = null;
  const sample = () => {
    const audit = window.__researchVerification;
    const chat = document.querySelector(".metabloom-chat");
    if (!audit || !chat) return;
    const messages = [...chat.querySelectorAll('article[aria-label="Metabloom message"]')]
      .filter((message) => !audit.baseline.includes(message.dataset.messageId));
    const row = {
      scene: chat.dataset.sceneAction || null, phase: chat.dataset.scenePhase || null,
      researchPhase: chat.dataset.researchPhase || null, theme: chat.dataset.activityTheme,
      messageCount: messages.length,
      chars: messages.reduce((sum, message) => sum + [...message.querySelectorAll("p")].reduce((count, p) => count + p.textContent.length, 0), 0),
      statuses: messages.map((message) => message.dataset.streamStatus),
      citations: messages.reduce((sum, message) => sum + message.querySelectorAll(".metabloom-chat__citation").length, 0),
      sourceGroups: messages.reduce((sum, message) => sum + message.querySelectorAll(".metabloom-chat__sources").length, 0),
      briefs: messages.reduce((sum, message) => sum + message.querySelectorAll(".metabloom-research-brief").length, 0),
      briefLinks: messages.reduce((sum, message) => sum + message.querySelectorAll(".metabloom-research-brief a").length, 0),
    };
    if (row.chars && row.researchPhase) audit.earlyText = true;
    if (row.sourceGroups && row.statuses.some((status) => status !== "complete")) audit.earlySourceList = true;
    if ((row.briefs || row.briefLinks) && (row.researchPhase || row.statuses.some((status) => status !== "complete"))) audit.earlyBrief = true;
    const serialized = JSON.stringify(row);
    if (serialized !== audit.last) {
      audit.rows.push({ at: performance.now(), ...row });
      audit.last = serialized;
    }
  };
  const observe = () => {
    new MutationObserver(sample).observe(document.documentElement, { childList: true, characterData: true,
      subtree: true, attributes: true, attributeFilter: ["data-scene-action", "data-scene-phase", "data-research-phase", "data-activity-theme", "data-stream-status"] });
  };
  if (document.documentElement) observe(); else document.addEventListener("DOMContentLoaded", observe, { once: true });
};
const beginAudit = (page) => page.evaluate(() => {
  window.__researchVerification = {
    baseline: [...document.querySelectorAll('article[aria-label="Metabloom message"]')].map((node) => node.dataset.messageId),
    rows: [], last: "", earlyText: false, earlySourceList: false, earlyBrief: false,
  };
});
const readAudit = (page) => page.evaluate(() => {
  const { last, ...audit } = window.__researchVerification;
  return audit;
});
const send = async (page, question) => {
  await page.getByPlaceholder("Message Metabloom", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
};
const completedCount = (page, count) => page.waitForFunction((expected) =>
  document.querySelectorAll('article[aria-label="Metabloom message"][data-stream-status="complete"]').length === expected
  && document.querySelector('.metabloom-chat')?.dataset.chatPhase === "ready", count);
const snapshotFixture = (fixture) => ({ id: fixture.id, api: fixture.api, calls: fixture.calls,
  status: fixture.status, wire: fixture.wire, researchAborted: fixture.researchAborted,
  formatterAborted: fixture.formatterAborted === true });

let browser;
let page;
let activePageErrors = [];
const requestedProfile = process.env.METABLOOM_VERIFY_PROFILE || "all";
const captureScreenshots = process.env.METABLOOM_VERIFY_SCREENSHOTS === "1";
assert(["all", "regression", "desktop", "mobile", "narrow-mobile"].includes(requestedProfile),
  "METABLOOM_VERIFY_PROFILE must be all, regression, desktop, mobile or narrow-mobile.");
const report = { mode: "built UI and actual API handler with fictional localhost auth and mocked OpenAI only",
  asOf: productionOutput.asOf, timeZone: verificationTimeZone, captureScreenshots, scenarios: [] };
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-background-networking"] });
  for (const profile of [
    { id: "desktop", viewport: { width: 1280, height: 850 }, isMobile: false },
    { id: "mobile", viewport: { width: 375, height: 812 }, isMobile: true },
    { id: "narrow-mobile", viewport: { width: 320, height: 812 }, isMobile: true },
  ].filter((profile) => requestedProfile === "all" || profile.id === requestedProfile
    || (requestedProfile === "regression" && ["desktop", "narrow-mobile"].includes(profile.id)))) {
    // Viewport runs are independent verification sessions, not one user sending
    // all fixture turns inside the local per-minute quota window.
    handler._internals.localBuckets.clear();
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.isMobile, deviceScaleFactor: 1, reducedMotion: "reduce", timezoneId: verificationTimeZone });
    await context.addCookies([{ name: "metabloom-research-fixture", value: "fictional-local-session", url: origin, httpOnly: true, sameSite: "Strict" }]);
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(installObserver);
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    activePageErrors = errors;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/orb?graphics=webgl`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const outlet = document.querySelector(".app-outlet");
      return outlet?.dataset.phase === "idle" && getComputedStyle(outlet).opacity === "1"
        && document.querySelector('.metabloom-chat input[type="checkbox"]');
    });
    const toggle = page.getByRole("checkbox", { name: "Deep Research", exact: true });
    const messages = page.locator('article[aria-label="Metabloom message"]');

    const research = makeFixture(`${profile.id}-research`, "research", `Give me a deep dive into the top 5 fictional orchard news stories today for the ${profile.id} fixture.`);
    await toggle.check();
    await beginAudit(page);
    await send(page, research.question);
    await waitFor(research.researchRequested.promise, "research provider request");
    await page.getByText("Searching sources", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await messages.count(), 0, "Searching must not manufacture an answer bubble.");
    assert.equal(await page.locator(".metabloom-chat__sources").count(), 0);
    research.reportSearch();
    await page.getByText("Searched: fictional orchard sensor release", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await messages.count(), 0, "Observed progress must not become an answer.");
    // Verify the new detail's contrast surface and bounds without forcing a GPU
    // readback while Tidal Weave is continuously rendering in software Chromium.
    const progressStyle = await page.getByText("Searched: fictional orchard sensor release", { exact: true }).evaluate((node) => {
      const surface = node.closest(".metabloom-research-status__detail");
      const style = getComputedStyle(surface), rect = surface.getBoundingClientRect();
      return { color: style.color, background: style.backgroundColor, left: rect.left, right: rect.right, viewport: innerWidth };
    });
    assert(!["transparent", "rgba(0, 0, 0, 0)"].includes(progressStyle.background));
    assert.notEqual(progressStyle.color, progressStyle.background);
    assert(progressStyle.left >= 0 && progressStyle.right <= progressStyle.viewport);
    assert.equal(research.releaseResearch(), true);
    await waitFor(research.writerRequested.promise, "schema-constrained brief request");
    assert(research.readWire().some((event) => event.type === "research" && event.state === "synthesizing"));
    assert.equal(await messages.count(), 0, "Synthesis must stay private until the brief validates.");
    assert.equal(await page.locator(".metabloom-research-brief").count(), 0);
    research.releaseWriter();
    await waitFor(research.finished.promise, "completed research API handler");
    await completedCount(page, 1);
    assert.equal(await messages.count(), 1, "The brief and its introduction must remain one reply bubble.");
    const intro = research.wire.filter((event) => event.type === "segment").map((event) => event.response);
    assert(intro.length > 0);
    assert.deepEqual(await messages.first().locator("p[data-segment-index]").allTextContents(), intro);
    const brief = messages.first().locator(".metabloom-research-brief");
    assert.equal(await brief.getAttribute("data-coverage-status"), "partial");
    assert.equal(await brief.getAttribute("data-research-brief-kind"), "news");
    assert((await brief.locator("h3").textContent()).trim().length > 0);
    assert.doesNotMatch(await brief.locator("h3").textContent(), /top\s*(?:5|five)/i);
    assert.equal(await brief.locator("h4").count(), 2);
    assert.equal(await brief.locator(".metabloom-research-brief__item:not([hidden]) h4").count(), 1);
    assert.match(await brief.locator(".metabloom-research-brief__coverage-heading").textContent(), /^2 stories\s*Partial coverage$/);
    const briefingDetails = brief.locator(".metabloom-research-brief__briefing-details");
    assert.equal(await briefingDetails.getAttribute("open"), null);
    assert.equal(await briefingDetails.locator("dt", { hasText: "Briefing target" }).evaluate((node) => node.nextElementSibling.textContent), "5");
    assert.equal(await briefingDetails.locator("dt", { hasText: "Included" }).evaluate((node) => node.nextElementSibling.textContent), "2");
    const briefOpening = await brief.locator("h3").evaluate((node) => {
      const heading = node.getBoundingClientRect();
      const transcript = node.closest(".metabloom-chat__messages").getBoundingClientRect();
      return { top: heading.top, bottom: heading.bottom, transcriptTop: transcript.top, transcriptBottom: transcript.bottom };
    });
    assert(briefOpening.top >= briefOpening.transcriptTop && briefOpening.bottom <= briefOpening.transcriptBottom,
      "A newly completed brief must open with its header inside the transcript viewport.");
    if (captureScreenshots) await page.screenshot({ path: `${output}/${profile.id}-brief-opening.png`, timeout: 45000 });
    const citations = await brief.locator(".metabloom-research-brief__overview a").evaluateAll((nodes) => nodes.map((node) => ({
      text: node.textContent, href: node.href, target: node.target, rel: node.rel, label: node.getAttribute("aria-label"),
    })));
    assert.deepEqual(citations, sourceList.map((source) => ({ text: `[${source.id}]`, href: source.url,
      target: "_blank", rel: "noopener noreferrer", label: `Source ${source.id}: ${source.title}` })));
    assert.deepEqual(await brief.locator(".metabloom-research-brief__source-list li a").allTextContents(), sourceList.map((source) => source.title));
    assert.deepEqual(await brief.locator(".metabloom-research-brief__source-list li a").evaluateAll((nodes) => nodes.map((node) => ({
      href: node.href, target: node.target, rel: node.rel,
    }))), sourceList.map((source) => ({ href: source.url, target: "_blank", rel: "noopener noreferrer" })));
    const researchAudit = await readAudit(page);
    assert.equal(researchAudit.earlyText, false, "Research text appeared before the scene returned.");
    assert.equal(researchAudit.earlySourceList, false);
    assert.equal(researchAudit.earlyBrief, false, "Brief content or source links appeared before surfacing and completion.");
    assert(researchAudit.rows.some((row) => row.chars > 0 && row.chars < intro.join("").length), "The completed research should reveal a progressive introduction.");
    assert.deepEqual(research.calls.map((call) => call.phase), ["research", "brief"]);
    assert.deepEqual(research.wire.filter((event) => ["research", "sources"].includes(event.type)).map((event) => event.type === "research" ? event.state : event.type), ["searching", "sources", "synthesizing"]);
    assert.equal(research.wire.at(-1)?.type, "done");
    assert.equal(research.api.streamResearchDetails, true);
    assert.equal(research.api.streamResearchBrief, true);
    assert.equal(research.api.timeZone, verificationTimeZone);
    assert.equal(research.wire.filter((event) => event.type === "research_report_complete").length, 1);
    assert.equal(research.wire.filter((event) => event.type === "research_brief_complete").length, 1);
    const storySelector = brief.getByRole("combobox", { name: "Choose a story", exact: true });
    assert.equal(await storySelector.isVisible(), true);
    await brief.getByRole("button", { name: "Next story", exact: true }).click();
    assert.equal(await brief.locator(".metabloom-research-brief__item:not([hidden]) h4").textContent(), briefCandidate().items[1].headline);
    assert.equal(await storySelector.inputValue(), "1");
    assert.equal((await storySelector.locator("option:checked").textContent()).trim(), "Story 2 of 2");
    await brief.getByRole("button", { name: "Previous story", exact: true }).click();
    assert.equal(await brief.locator(".metabloom-research-brief__item:not([hidden]) h4").textContent(), briefCandidate().items[0].headline);
    assert.equal(await storySelector.inputValue(), "0");
    await storySelector.selectOption("1");
    assert.equal(await brief.locator(".metabloom-research-brief__item:not([hidden]) h4").textContent(), briefCandidate().items[1].headline);
    await storySelector.selectOption("0");
    const firstAnalysis = brief.locator(".metabloom-research-brief__item details").first();
    const analysisSummary = firstAnalysis.locator(":scope > summary");
    assert.equal(await firstAnalysis.getAttribute("open"), null);
    await analysisSummary.focus();
    await page.keyboard.press("Enter");
    await firstAnalysis.locator(".metabloom-research-brief__depth").waitFor({ state: "visible" });
    assert.notEqual(await firstAnalysis.getAttribute("open"), null, "Native summary must open from the keyboard.");
    await page.keyboard.press("Enter");
    await firstAnalysis.locator(".metabloom-research-brief__depth").waitFor({ state: "hidden" });
    const briefGeometry = await brief.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth, viewport: innerWidth };
    });
    assert(briefGeometry.left >= 0 && briefGeometry.right <= briefGeometry.viewport);
    assert(briefGeometry.scrollWidth <= briefGeometry.width + 1, "Brief cards must not introduce horizontal overflow.");
    const fullResearch = messages.first().locator(".metabloom-chat__full-research");
    assert.equal(await fullResearch.getAttribute("open"), null, "The full report should start collapsed.");
    await fullResearch.locator("summary").click();
    const reportText = fullResearch.locator(".metabloom-chat__research-report-text");
    await reportText.waitFor({ state: "visible" });
    const displayedReport = await reportText.textContent();
    assert(displayedReport.length > 16000, "The prior notes limit must not hide completed research.");
    assert(displayedReport.endsWith("End of the complete fictional orchard research report."));
    assert.equal(await reportText.locator("a.metabloom-chat__citation").count(), 2);
    const reportGeometry = await reportText.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: innerWidth };
    });
    assert(reportGeometry.left >= 0 && reportGeometry.right <= reportGeometry.viewport);
    await fullResearch.locator(":scope > summary").click();
    await reportText.waitFor({ state: "detached" });
    if (captureScreenshots) await page.screenshot({ path: `${output}/${profile.id}-completed.png`, timeout: 45000 });

    const cancelled = makeFixture(`${profile.id}-cancelled`, "cancelled", `Investigate the fictional orchard ledger for the ${profile.id} cancellation fixture.`);
    await beginAudit(page);
    await send(page, cancelled.question);
    await waitFor(cancelled.researchRequested.promise, "open research to cancel");
    await page.getByText("Searching sources", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Stop response", exact: true }).click();
    await waitFor(cancelled.aborted.promise, "browser Stop aborts backend research");
    await waitFor(cancelled.readerCancelled.promise, "backend cancels open research reader");
    await waitFor(cancelled.finished.promise, "cancelled API handler settles");
    assert.equal(cancelled.releaseResearch(), false, "Cancelled research must reject a stale provider body.");
    await page.getByRole("button", { name: "Stop response", exact: true }).waitFor({ state: "detached" });
    assert.equal(await messages.count(), 1, "Stopping research must not add a stale assistant bubble.");
    assert.equal(await page.locator(".metabloom-research-brief").count(), 1, "Stopping research must not leak another brief.");
    assert.deepEqual(cancelled.calls.map((call) => call.phase), ["research"]);
    assert(!cancelled.wire.some((event) => ["sources", "text_delta", "segment", "done"].includes(event.type)));
    const cancelledAudit = await readAudit(page);
    assert(cancelledAudit.rows.every((row) => row.messageCount === 0 && row.sourceGroups === 0 && row.briefs === 0));

    const background = makeFixture(`${profile.id}-background`, "research", `Give me the top 5 fictional orchard news stories today while this ${profile.id} tab is hidden.`);
    await send(page, background.question);
    await waitFor(background.researchRequested.promise, "research before tab visibility changes");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(background.releaseResearch(), true);
    await waitFor(background.writerRequested.promise, "hidden-tab research proceeds to synthesis");
    background.releaseWriter();
    await waitFor(background.finished.promise, "hidden-tab answer completes");
    assert.equal(background.researchAborted, false, "Tab hiding must not abort research.");
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await completedCount(page, 2);
    assert.deepEqual(await messages.last().locator("p[data-segment-index]").allTextContents(), intro);
    assert.equal(await messages.last().locator(".metabloom-research-brief__overview a").count(), 2);
    assert.equal(await messages.last().locator(".metabloom-research-brief").getAttribute("data-coverage-status"), "partial");
    assert.equal(background.wire.at(-1)?.type, "done");

    const invalid = makeFixture(`${profile.id}-invalid`, "invalid", `Return an uncited fictional orchard research brief for ${profile.id}.`);
    await send(page, invalid.question);
    await waitFor(invalid.researchRequested.promise, "research with unusable evidence");
    assert.equal(invalid.releaseResearch(), true);
    await waitFor(invalid.finished.promise, "invalid evidence returns a safe error");
    const failure = invalid.wire.at(-1);
    assert.equal(failure.type, "error");
    assert.equal(failure.code, "research_no_sources");
    assert.match(failure.requestRef, /^[a-f0-9]{12}$/);
    await page.getByText(new RegExp(failure.requestRef)).waitFor({ state: "visible" });
    assert.equal(await messages.count(), 2, "Failed research must not create an answer bubble.");
    assert.equal(invalid.calls.length, 1, "Unusable evidence must not trigger a writer or automatic retry.");

    const ordinary = makeFixture(`${profile.id}-ordinary`, "ordinary", `Say hello to the imaginary orchard team for the ${profile.id} recovery fixture.`);
    await toggle.uncheck();
    await send(page, ordinary.question);
    await waitFor(ordinary.writerRequested.promise, "ordinary writer request");
    ordinary.releaseWriter();
    await waitFor(ordinary.finished.promise, "ordinary API handler");
    await completedCount(page, 3);
    assert.equal(await messages.count(), 3);
    assert.equal(await messages.last().locator("p[data-segment-index]").textContent(), ordinaryAnswer);
    assert.equal(await messages.last().locator("a").count(), 0);
    assert.deepEqual(ordinary.calls.map((call) => call.phase), ["writer"]);
    assert(!ordinary.wire.some((event) => ["research", "sources"].includes(event.type)));
    assert.equal(ordinary.api.actionMode, "auto");
    assert.equal(research.api.actionMode, "deep-research");

    const writerFailed = makeFixture(`${profile.id}-writer-failed`, "writer-failure", `Preserve the fictional orchard report when the ${profile.id} brief formatter fails.`);
    await toggle.check();
    await beginAudit(page);
    await send(page, writerFailed.question);
    await waitFor(writerFailed.researchRequested.promise, "research before writer failure");
    assert.equal(writerFailed.releaseResearch(), true);
    await waitFor(writerFailed.writerRequested.promise, "failing brief formatter");
    await waitFor(writerFailed.finished.promise, "deterministic fallback after completed report delivery");
    assert.equal(writerFailed.wire.at(-1).type, "done");
    assert.equal(writerFailed.wire.filter((event) => event.type === "research_report_complete").length, 1);
    assert.equal(writerFailed.wire.filter((event) => event.type === "research_brief_complete").length, 1);
    assert(!writerFailed.wire.some((event) => event.type === "error"));
    const failedBrief = JSON.parse(writerFailed.wire.filter(event => event.type === "research_brief_delta")
      .map(event => event.delta).join(""));
    assert.deepEqual(failedBrief.items, []);
    assert.equal(failedBrief.coverage.status, "unavailable");
    await completedCount(page, 4);
    const failedNotes = messages.last().locator(".metabloom-research-brief--fallback");
    assert.equal(await failedNotes.count(), 1);
    assert.equal(await failedNotes.getAttribute("open"), null, "Formatter-failure notes start collapsed.");
    assert.equal(await failedNotes.locator(":scope > summary").textContent(), "Briefing notes");
    assert.equal(await failedNotes.locator("h3, .metabloom-research-brief__coverage-heading").count(), 0);
    assert.equal(await messages.last().locator("p[data-segment-index]").count(), 1);
    assert.match(await messages.last().locator("p[data-segment-index]").textContent(), /research|report/i);
    assert.equal(writerFailed.calls.length, 2, "Formatter failure must not cause a paid retry or legacy writer.");
    const retainedReport = messages.last().locator(".metabloom-chat__full-research");
    assert.equal(await retainedReport.getAttribute("data-research-fallback"), "true");
    assert.notEqual(await retainedReport.getAttribute("open"), null, "The retained report opens after the surfacing gate.");
    await retainedReport.locator(".metabloom-chat__research-report-text").waitFor({ state: "visible" });
    assert.equal(await retainedReport.locator(".metabloom-chat__research-report-text").textContent(), displayedReport);
    const writerFailedAudit = await readAudit(page);
    assert.equal(writerFailedAudit.earlyBrief, false);
    assert.equal(writerFailedAudit.earlyText, false);
    assert.equal(writerFailedAudit.earlySourceList, false);
    assert.deepEqual(writerFailed.calls.map((call) => call.phase), ["research", "brief"]);
    await retainedReport.locator(":scope > summary").click();

    // This independent regression session keeps the original pasted question
    // and exact date/citation typography without consuming the earlier session's
    // local rate allowance. Every provider response still comes from this file.
    handler._internals.localBuckets.clear();
    const productionCases = [];
    for (const emptyCoverage of [false, true]) {
      const id = emptyCoverage ? "empty" : "current";
      const pasted = makeFixture(`${profile.id}-production-${id}`, "production", productionOutput.question);
      pasted.emptyCoverage = emptyCoverage;
      await beginAudit(page);
      await send(page, pasted.question);
      await waitFor(pasted.researchRequested.promise, "pasted-output research request");
      assert.equal(pasted.releaseResearch(), true);
      await waitFor(pasted.writerRequested.promise, "pasted-output formatter request");
      assert.equal(await messages.count(), emptyCoverage ? 5 : 4);
      pasted.releaseWriter();
      await waitFor(pasted.finished.promise, "pasted-output API completion");
      await completedCount(page, emptyCoverage ? 6 : 5);
      assert.deepEqual(pasted.calls.map((call) => call.phase), ["research", "brief"]);
      assert.equal(pasted.api.timeZone, productionOutput.timeZone);
      const last = messages.last(), productionBrief = last.locator(".metabloom-research-brief");
      assert.equal(await productionBrief.getAttribute("data-coverage-status"), emptyCoverage ? "unavailable" : "partial");
      assert.equal(await productionBrief.locator("h4").count(), emptyCoverage ? 0 : 1);
      if (emptyCoverage) {
        assert.equal(await productionBrief.getAttribute("open"), null, "Empty-coverage notes start collapsed.");
        assert.equal(await productionBrief.locator(":scope > summary").textContent(), "Briefing notes");
        assert.equal(await productionBrief.locator("h3, .metabloom-research-brief__coverage-heading").count(), 0,
          "An empty briefing does not lead with a zero-story card.");
      } else {
        assert.match(await productionBrief.locator(".metabloom-research-brief__coverage-heading").textContent(), /^1 story\s*Partial coverage$/);
        assert.doesNotMatch(await productionBrief.locator("h3").textContent(), /top\s*(?:5|five)|five news/i);
        assert.equal(await productionBrief.locator(".metabloom-research-brief__item:not([hidden]) h4").count(), 1);
      }
      const publicText = await productionBrief.textContent();
      assert.doesNotMatch(publicText, /report\.notes|report\.sources|developmentDate|dateEvidence|dateBasis|publishedDate|sourceDetails|reportExcerpt|evidenceId/);
      assert.doesNotMatch(publicText, /summarizing five major developments/);
      if (!emptyCoverage) {
        assert.equal(await productionBrief.locator("h4").textContent(), productionOutput.sections[4].headline);
        assert.deepEqual(await productionBrief.locator(".metabloom-research-brief__overview a").evaluateAll((nodes) => nodes.map((node) => node.href)),
          productionOutput.sources.slice(7).map((source) => source.url));
      }
      const openingTarget = emptyCoverage ? last.locator(".metabloom-chat__full-research > summary") : productionBrief.locator("h3");
      const opening = await openingTarget.evaluate((node) => {
        const rect = node.getBoundingClientRect(), transcript = node.closest(".metabloom-chat__messages").getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, transcriptTop: transcript.top, transcriptBottom: transcript.bottom };
      });
      assert(opening.top >= opening.transcriptTop && opening.bottom <= opening.transcriptBottom,
        "The brief or retained report must open at its reading header.");
      const savedReport = await page.evaluate(() => window.__orbMessages().filter((message) => message.role === "assistant").at(-1).researchDetails);
      assert.deepEqual(savedReport, productionOutput.report, "Safe display formatting must not mutate the saved research.");
      const savedBrief = await page.evaluate(() => window.__orbMessages().filter((message) => message.role === "assistant").at(-1).researchBrief);
      assert.equal(savedBrief.items.length, emptyCoverage ? 0 : 1);
      if (!emptyCoverage) {
        assert.equal(savedBrief.items[0].developmentDate, verificationDate);
        assert.equal(savedBrief.items[0].dateEvidence.sourceId, 8);
        assert(savedBrief.items[0].dateEvidence.quote.includes(productionOutput.unicodeOnlyCurrentExcerpt));
        assert(savedReport.notes.includes(savedBrief.items[0].dateEvidence.quote));
      }
      const audit = await readAudit(page);
      assert.equal(audit.earlyBrief, false); assert.equal(audit.earlyText, false); assert.equal(audit.earlySourceList, false);
      if (captureScreenshots) await page.screenshot({ path: `${output}/${profile.id}-production-${id}.png`, timeout: 45000 });
      const full = last.locator(".metabloom-chat__full-research");
      if (emptyCoverage) {
        assert.notEqual(await full.getAttribute("open"), null, "An empty briefing opens the completed report automatically.");
        assert.equal(await full.getAttribute("data-research-fallback"), "true");
      } else {
        assert.equal(await full.getAttribute("open"), null);
        await full.locator(":scope > summary").click();
      }
      const fullText = full.locator(".metabloom-chat__research-report-text");
      await fullText.waitFor({ state: "visible" });
      const displayed = await fullText.textContent();
      assert.doesNotMatch(displayed, /https?:\/\//, "Known Markdown destinations should be shown through canonical citations.");
      for (const section of productionOutput.sections) assert(displayed.includes(section.reportExcerpt));
      assert.equal(await fullText.locator("a.metabloom-chat__citation").count(), 10,
        "Each existing canonical marker must appear once after its matching Markdown label.");
      assert.deepEqual(await fullText.locator("a").evaluateAll((nodes) => nodes.map((node) => ({ href: node.href, target: node.target, rel: node.rel }))),
        [1, 2, 3, 4, 5, 5, 6, 7, 8, 9].map((sourceId) => ({ href: productionOutput.sources[sourceId - 1].url,
          target: "_blank", rel: "noopener noreferrer" })));
      await full.locator(":scope > summary").click();
      const layout = await productionBrief.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth, viewport: innerWidth };
      });
      assert(layout.left >= 0 && layout.right <= layout.viewport && layout.scrollWidth <= layout.width + 1);
      productionCases.push({ emptyCoverage, opening, layout, audit, fixture: snapshotFixture(pasted) });
    }
    const geometry = await page.locator(".metabloom-chat__composer").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, "Composer exceeds the viewport.");
    assert(geometry.pageWidth <= geometry.viewport + 1, "The page has horizontal overflow.");
    assert.deepEqual(errors, []);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(unexpectedProviderRequests, []);
    report.scenarios.push({ profile, reducedMotion: true, geometry, briefOpening, briefGeometry, reportGeometry, displayedReportChars: displayedReport.length,
      progressStyle, research: snapshotFixture(research),
      researchAudit, cancelled: snapshotFixture(cancelled), cancelledAudit, background: snapshotFixture(background),
      invalid: snapshotFixture(invalid), ordinary: snapshotFixture(ordinary), writerFailed: snapshotFixture(writerFailed), writerFailedAudit, productionCases, pageErrors: errors });
    fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
    console.log(`PASS ${profile.id}: evidence-reference fixtures, one visible carousel story, next/previous, dated partial coverage, empty and formatter-failure report fallback, safe Markdown citations, native keyboard disclosure, bounded formatter, surfacing, visibility, cancellation, ordinary recovery`);
    await context.close();
    page = null;
  }
  report.result = "PASS";
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: "PASS", scenarios: report.scenarios.length, paidProviderCalls: 0, evidence: output }));
} catch (error) {
  report.result = "FAIL";
  report.error = error.message;
  report.serverErrors = serverErrors;
  report.activePageErrors = activePageErrors;
  report.fixtures = [...fixtures.values()].map(snapshotFixture);
  if (page) {
    report.dom = await page.locator("body").innerText().catch(() => "Unavailable");
    report.controls = await page.locator('.metabloom-chat input[type="checkbox"]').evaluateAll((nodes) => nodes.map((node) => ({
      label: node.closest("label")?.textContent, disabled: node.disabled,
      blockedAncestor: node.closest('[hidden], [inert], [aria-hidden="true"]')?.outerHTML.slice(0, 500) || null,
      visibility: getComputedStyle(node).visibility, display: getComputedStyle(node).display,
    }))).catch(() => null);
    report.audit = await readAudit(page).catch(() => null);
    if (captureScreenshots) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  }
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  metabloomAuth.requireMetabloomSession = originalAuth;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  handler._internals.localBuckets.clear();
}
