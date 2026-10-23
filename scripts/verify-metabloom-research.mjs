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
const output = path.join(os.tmpdir(), "metabloom-research-browser");
const buildRoot = path.resolve("build");
assert(fs.existsSync(path.join(buildRoot, "index.html")), "Run npm run build before this verification script.");
fs.mkdirSync(output, { recursive: true });

const sourceList = [
  { id: 1, title: "Fictional orchard sensor release notes", url: "https://example.com/orchard-release" },
  { id: 2, title: "Fictional orchard calibration study", url: "https://example.org/orchard-study" },
];
const researchedParagraphs = [
  "The fictional orchard sensor now measures soil moisture once per minute. The release notes also describe a calibration step before comparing readings from different rows. This fixture demonstrates a claim linked to its supporting document [1].",
  "The fictional study recommends checking readings against a reference measurement after installation. Together, the two documents support recording both the sensor version and calibration date before interpreting a change in moisture [2].",
];
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
  const summary = "The fictional release notes describe one-minute moisture readings. The fictional study describes reference calibration.";
  const text = summary + "\n\n" + Array.from({ length: 180 }, (_, index) =>
    `Fictional research detail ${index + 1}: record the orchard row, sensor version and calibration date together so the imaginary team can compare its observations consistently.`
  ).join("\n\n") + "\n\nEnd of the complete fictional orchard research report.";
  const boundary = summary.indexOf(" The fictional study");
  return {
    status: "completed",
    usage: { input_tokens: 450, output_tokens: 7900, output_tokens_details: { reasoning_tokens: 40 } },
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "fictional orchard sensor release", sources: [{ type: "url", url: sourceList[0].url }] } },
      { type: "web_search_call", status: "completed", action: { type: "open_page", url: sourceList[0].url } },
      { type: "web_search_call", status: "completed", action: { type: "search", query: "fictional orchard reference calibration", sources: [{ type: "url", url: sourceList[1].url }] } },
      ...Array.from({ length: 3 }, (_, index) => ({ type: "web_search_call", status: "completed",
        action: { type: "open_page", url: sourceList[index % sourceList.length].url } })),
      // A seventh terminal tool record must not discard the completed report.
      { type: "web_search_call", status: "incomplete", action: { type: "open_page", url: "https://example.com/unavailable" } },
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

const envKeys = ["OPENAI_API_KEY", "METABLOOM_OPENAI_MODEL", "METABLOOM_RESEARCH_MODEL", "TYPESAFE_API_KEY", "VERCEL", "VERCEL_ENV", "NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalAuth = metabloomAuth.requireMetabloomSession;
const unexpectedProviderRequests = [];
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
  const fixture = fixtures.get(body.input?.at(-1)?.content);
  assert(fixture, "Provider request must belong to a registered fictional question.");
  const research = Boolean(body.tools);
  const call = { phase: research ? "research" : "writer", model: body.model, stream: body.stream,
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
        fixture.reportSearch = () => emit({ type: "response.output_item.done", output_index: 0,
          item: researchDocument().output[0] });
        fixture.releaseResearch = () => {
          try {
            const value = researchDocument();
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
  assert.equal(body.stream, true);
  assert.equal(body.tools, undefined);
  assert.equal(body.text?.format?.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.name, "metabloom_chat_response");
  assert.equal(body.max_output_tokens, fixture.kind === "ordinary" ? 2400 : 6000);
  if (fixture.kind !== "ordinary") {
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert(sourceList.every(({ url: sourceUrl }) => JSON.stringify(body.input).includes(sourceUrl)), "Synthesis must receive provider-attested sources.");
    const evidence = body.input.find((item) => item.content.startsWith("Research evidence for the following question."));
    assert(evidence && JSON.parse(evidence.content.slice(evidence.content.indexOf("\n") + 1)).notes.length <= 16000,
      "The full report must not expand the paid writer context.");
  } else assert.equal(fixture.calls.length, 1);
  if (fixture.kind === "writer-failure") {
    fixture.writerRequested.resolve();
    return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
      status: 429, headers: { "content-type": "application/json", "x-request-id": "fictional-writer-rate-limit" },
    });
  }
  const response = new Response(new ReadableStream({
    start(controller) {
      fixture.releaseWriter = () => {
        controller.enqueue(new TextEncoder().encode(writerEvents(fixture.kind === "ordinary" ? [ordinaryAnswer] : researchedParagraphs)));
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
  csrfToken: "b".repeat(64), expiresAt: Date.now() + 3600000 }) });
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
      assert(fixture, "Only registered fictional requests may reach the verification handler.");
      fixture.api = { actionMode: request.body.actionMode, allowMultiple: request.body.allowMultiple,
        streamText: request.body.streamText, streamResearchDetails: request.body.streamResearchDetails,
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
    };
    if (row.chars && row.researchPhase) audit.earlyText = true;
    if (row.sourceGroups && row.statuses.some((status) => status !== "complete")) audit.earlySourceList = true;
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
    rows: [], last: "", earlyText: false, earlySourceList: false,
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
  status: fixture.status, wire: fixture.wire, researchAborted: fixture.researchAborted });

let browser;
let page;
let activePageErrors = [];
const requestedProfile = process.env.METABLOOM_VERIFY_PROFILE || "all";
const captureScreenshots = process.env.METABLOOM_VERIFY_SCREENSHOTS === "1";
assert(["all", "desktop", "mobile"].includes(requestedProfile), "METABLOOM_VERIFY_PROFILE must be all, desktop or mobile.");
const report = { mode: "built UI and actual API handler with fictional localhost auth and mocked OpenAI only", captureScreenshots, scenarios: [] };
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
  ].filter((profile) => requestedProfile === "all" || profile.id === requestedProfile)) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.isMobile, deviceScaleFactor: 1, reducedMotion: "reduce" });
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

    const research = makeFixture(`${profile.id}-research`, "research", `Compare the fictional orchard sensor release and calibration study for the ${profile.id} fixture.`);
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
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return { color: style.color, background: style.backgroundColor, left: rect.left, right: rect.right, viewport: innerWidth };
    });
    assert(!["transparent", "rgba(0, 0, 0, 0)"].includes(progressStyle.background));
    assert.notEqual(progressStyle.color, progressStyle.background);
    assert(progressStyle.left >= 0 && progressStyle.right <= progressStyle.viewport);
    assert.equal(research.releaseResearch(), true);
    await waitFor(research.writerRequested.promise, "schema-constrained synthesis request");
    await page.getByText("Writing an answer from 2 cited sources.", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await messages.count(), 0, "Synthesis must stay private until verified text returns.");
    research.releaseWriter();
    await waitFor(research.finished.promise, "completed research API handler");
    await completedCount(page, 1);
    assert.equal(await messages.count(), 1, "Multiple research paragraphs must remain one reply bubble.");
    assert.deepEqual(await messages.first().locator("p[data-segment-index]").allTextContents(), researchedParagraphs);
    const citations = await messages.first().locator("a.metabloom-chat__citation").evaluateAll((nodes) => nodes.map((node) => ({
      text: node.textContent, href: node.href, target: node.target, rel: node.rel, label: node.getAttribute("aria-label"),
    })));
    assert.deepEqual(citations, sourceList.map((source) => ({ text: `[${source.id}]`, href: source.url,
      target: "_blank", rel: "noopener noreferrer", label: `Source ${source.id}: ${source.title}` })));
    assert.deepEqual(await messages.first().locator(".metabloom-chat__sources li a").allTextContents(), sourceList.map((source) => source.title));
    assert.deepEqual(await messages.first().locator(".metabloom-chat__sources li a").evaluateAll((nodes) => nodes.map((node) => ({
      href: node.href, target: node.target, rel: node.rel,
    }))), sourceList.map((source) => ({ href: source.url, target: "_blank", rel: "noopener noreferrer" })));
    const researchAudit = await readAudit(page);
    assert.equal(researchAudit.earlyText, false, "Research text appeared before the scene returned.");
    assert.equal(researchAudit.earlySourceList, false);
    assert(researchAudit.rows.some((row) => row.chars > 0 && row.chars < researchedParagraphs.join("").length), "The completed research should reveal a progressive text prefix.");
    assert.deepEqual(research.calls.map((call) => call.phase), ["research", "writer"]);
    assert.deepEqual(research.wire.filter((event) => ["research", "sources"].includes(event.type)).map((event) => event.type === "research" ? event.state : event.type), ["searching", "sources", "synthesizing"]);
    assert.equal(research.wire.at(-1)?.type, "done");
    assert.equal(research.api.streamResearchDetails, true);
    assert.equal(research.wire.filter((event) => event.type === "research_report_complete").length, 1);
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
    assert.equal(await page.locator(".metabloom-chat__sources").count(), 1, "Stopping research must not leak another source list.");
    assert.deepEqual(cancelled.calls.map((call) => call.phase), ["research"]);
    assert(!cancelled.wire.some((event) => ["sources", "text_delta", "segment", "done"].includes(event.type)));
    const cancelledAudit = await readAudit(page);
    assert(cancelledAudit.rows.every((row) => row.messageCount === 0 && row.sourceGroups === 0));

    const background = makeFixture(`${profile.id}-background`, "research", `Research the fictional orchard while this ${profile.id} tab is hidden.`);
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
    assert.deepEqual(await messages.last().locator("p[data-segment-index]").allTextContents(), researchedParagraphs);
    assert.equal(await messages.last().locator("a.metabloom-chat__citation").count(), 2);
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

    const writerFailed = makeFixture(`${profile.id}-writer-failed`, "writer-failure", `Preserve the fictional orchard report when the ${profile.id} short writer fails.`);
    await toggle.check();
    await send(page, writerFailed.question);
    await waitFor(writerFailed.researchRequested.promise, "research before writer failure");
    assert.equal(writerFailed.releaseResearch(), true);
    await waitFor(writerFailed.writerRequested.promise, "failing short writer");
    await waitFor(writerFailed.finished.promise, "writer error after completed report delivery");
    const writerFailure = writerFailed.wire.at(-1);
    assert.equal(writerFailure.type, "error");
    assert.equal(writerFailure.code, "provider_rate_limited");
    assert.equal(writerFailed.wire.filter((event) => event.type === "research_report_complete").length, 1);
    assert(!writerFailed.wire.some((event) => ["text_delta", "segment", "done"].includes(event.type)));
    await page.getByText(new RegExp(writerFailure.requestRef)).waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.querySelectorAll('article[aria-label="Metabloom message"]').length === 4
      && document.querySelector('article[aria-label="Metabloom message"]:last-of-type')?.dataset.streamStatus === "error"
      && document.querySelector('.metabloom-chat')?.dataset.chatPhase === "ready");
    assert.equal(await messages.last().locator("p[data-segment-index]").count(), 0, "Writer failure must not manufacture short-answer text.");
    const retainedReport = messages.last().locator(".metabloom-chat__full-research");
    await retainedReport.locator("summary").click();
    await retainedReport.locator(".metabloom-chat__research-report-text").waitFor({ state: "visible" });
    assert.equal(await retainedReport.locator(".metabloom-chat__research-report-text").textContent(), displayedReport);
    assert.deepEqual(writerFailed.calls.map((call) => call.phase), ["research", "writer"]);
    await retainedReport.locator(":scope > summary").click();
    const geometry = await page.locator(".metabloom-chat__composer").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, "Composer exceeds the viewport.");
    assert(geometry.pageWidth <= geometry.viewport + 1, "The page has horizontal overflow.");
    assert.deepEqual(errors, []);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(unexpectedProviderRequests, []);
    report.scenarios.push({ profile, reducedMotion: true, geometry, reportGeometry, displayedReportChars: displayedReport.length,
      progressStyle, research: snapshotFixture(research),
      researchAudit, cancelled: snapshotFixture(cancelled), cancelledAudit, background: snapshotFixture(background),
      invalid: snapshotFixture(invalid), ordinary: snapshotFixture(ordinary), writerFailed: snapshotFixture(writerFailed), pageErrors: errors });
    fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
    console.log(`PASS ${profile.id}: long full report, bounded writer, writer-failure recovery, progress, citations, visibility, cancellation, ordinary recovery`);
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
  metabloomAuth.requireMetabloomSession = originalAuth;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  handler._internals.localBuckets.clear();
}
