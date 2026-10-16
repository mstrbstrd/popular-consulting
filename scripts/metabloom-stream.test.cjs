const { test, beforeEach, afterEach, mock } = require("node:test");
const metabloomAuth = require("../server/metabloomAuth");
// Provider tests assume a verified session; orb-access.test.mjs tests the real gate.
beforeEach(() => mock.method(metabloomAuth, "requireMetabloomSession", async () => null));
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const handler = require("../api/metabloom");
const { createEnvelopeReader, streamMetabloomProvider } = require("../server/metabloomProviderStream");
const { createMetabloomReplySession } = require("../src/components/metabloomReplySession");
const { createMetabloomSegmentStreamDecoder } = require("../src/components/metabloomEmoteProtocol");
const oldFetch = global.fetch;
const env = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  global.fetch = oldFetch;
  for (const key of ["VERCEL_ENV", "OPENAI_API_KEY", "TYPESAFE_API_KEY", "JEV_MODEL"]) {
    if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  }
  handler._internals.localBuckets.clear();
});
const first = { emote: "whimsy", response: 'A playful {thought} with "quotes" and 🪴.' };
const second = { emote: "reflective", response: "A reflective continuation of the same reply." };
const envelope = (segments) => ({ version: "1.0.0", segments });
const delta = (text) => ({ type: "response.output_text.delta", item_id: "message", output_index: 0, content_index: 0, delta: text });
const completed = (text) => ({ type: "response.completed", response: { status: "completed", output: [{type:"message",content:[{type:"output_text",text}]}] } });
const sse = (event) => new TextEncoder().encode(`event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`);
const request = () => ({ method:"POST", headers:{host:"localhost:3000",origin:"http://localhost:3000","content-type":"application/json"}, socket:{remoteAddress:"127.0.0.1"}, body:{message:"Hello",allowMultiple:true} });
const response = () => Object.assign(new EventEmitter(), {
  statusCode:0, headers:{}, body:"", setHeader(k,v){this.headers[k]=v;},
  flushHeaders(){this.headersSent=true;}, write(s){this.body+=s; this.emit("chunk",s);return true;},
  end(s=""){this.body+=s;this.writableEnded=true;},
});
const waitFor = async (predicate) => { for(let i=0;i<100;i++){if(predicate())return;await delay(5);}assert.fail("Timed out waiting for incremental output"); };

test("complete segments escape before the final JSON or provider completion", async () => {
  const seen=[]; const reader=createEnvelopeReader({allowMultiple:true,onSegment:s=>seen.push(s)});
  const prefix='{"version":"1.0.0","segments":['+JSON.stringify(first);
  for(const char of prefix) await reader.push(char);
  assert.deepEqual(seen,[first]); assert.throws(()=>reader.finish());
  await reader.push(','+JSON.stringify(second)+']}');
  assert.deepEqual(reader.finish(),envelope([first,second]));
});
test("one reply accumulates two segments and completion cannot replay emotes", () => {
  const updates=[], emotes=[];
  const reply=createMetabloomReplySession({allowMultiple:true,onUpdate:s=>updates.push(s),onEmote:e=>emotes.push(e)});
  reply.append(first,0); assert.equal(reply.snapshot().status,"streaming");
  reply.append(second,1); reply.finish(envelope([first,second]));
  assert.deepEqual(emotes,["whimsy","reflective"]);
  assert.equal(reply.snapshot().content,first.response+'\n\n'+second.response);
  assert.equal(reply.finish(envelope([first,second])),false);
  assert.equal(reply.append(second,2),false);
  assert.equal(updates.at(-1).status,"complete");
});
test("unknown, duplicate, oversized or out-of-order segments cannot change the visible prefix", async () => {
  for(const bad of ['{"emote":"whimsy","emote":"reflective","response":"x"}',JSON.stringify({emote:"unknown",response:"x"}),JSON.stringify({...first,intensity:1}),JSON.stringify({...first,response:'x'.repeat(1601)})]){
    const seen=[];const reader=createEnvelopeReader({onSegment:s=>seen.push(s)});
    await assert.rejects(reader.push('{"version":"1.0.0","segments":['+bad+']}'));
    assert.equal(seen.length,0);
  }
  const r=createMetabloomReplySession({onUpdate:()=>{},onEmote:()=>{}});
  assert.throws(()=>r.append(first,1));r.append(first,0);
  assert.throws(()=>r.append(second,1));
  assert.throws(()=>r.finish(envelope([second])));
  r.interrupt("error");assert.equal(r.snapshot().status,"error");assert.deepEqual(r.snapshot().segments,[first]);
});
test("the actual server writes the first segment while the upstream stream is still open", async () => {
  process.env.VERCEL_ENV="development";process.env.OPENAI_API_KEY="test-not-a-credential";delete process.env.TYPESAFE_API_KEY;
  let upstream, sent;
  global.fetch=async (_url,options)=>{sent=JSON.parse(options.body);return new Response(new ReadableStream({start(c){upstream=c;}}),{headers:{"content-type":"text/event-stream"}});};
  const res=response();const running=handler(request(),res);
  await waitFor(()=>Boolean(upstream));
  const prefix='{"version":"2.0.0","segments":['+JSON.stringify({response:first.response});
  const bytes=sse(delta(prefix));
  for(let i=0;i<bytes.length;i+=3) upstream.enqueue(bytes.slice(i,i+3));
  await waitFor(()=>res.body.includes('"type":"segment"'));
  assert.equal(res.writableEnded,undefined);assert.equal(res.body.includes(second.response),false);
  assert.equal(sent.stream,true);
  const suffix=','+JSON.stringify({response:second.response})+']}';
  upstream.enqueue(sse(delta(suffix)));upstream.enqueue(sse(completed(prefix+suffix)));
  await running;
  const decoder=createMetabloomSegmentStreamDecoder();decoder.push(res.body);
  assert.deepEqual(decoder.finish().value,{version:"2.0.0",segments:[{response:first.response},{response:second.response}]});
});
test("a failed upstream after one segment signals an incomplete stream, not a successful response", async () => {
  process.env.VERCEL_ENV="development";process.env.OPENAI_API_KEY="test-not-a-credential";delete process.env.TYPESAFE_API_KEY;
  global.fetch=async ()=>new Response(new ReadableStream({start(c){
    c.enqueue(sse(delta('{"version":"2.0.0","segments":['+JSON.stringify({response:first.response}))));
    c.enqueue(sse({type:"error",message:"Private upstream diagnostic"}));c.close();
  }}),{headers:{"content-type":"text/event-stream"}});
  const res=response();await handler(request(),res);
  assert.match(res.body,/"type":"segment"/);assert.match(res.body,/"type":"error"/);
  assert.equal(res.body.includes('"type":"done"'),false);assert.equal(res.body.includes("Private upstream"),false);
  const decoder=createMetabloomSegmentStreamDecoder();decoder.push(res.body);assert.equal(decoder.finish().ok,false);
});
test("disconnect cancels an open provider reader and history accepts one merged assistant reply", async () => {
  const controller=new AbortController();let cancelled=false;
  const upstream=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"text/event-stream"}});
  const running=streamMetabloomProvider(upstream,{onSegment:()=>{},signal:controller.signal});
  controller.abort();await assert.rejects(running);assert.equal(cancelled,true);
  const req=request();req.body.history=[{role:"assistant",content:'x'.repeat(3202)}];
  assert.ok(handler._internals.parseBody(req));req.body.history[0].content='x'.repeat(4807);
  assert.equal(handler._internals.parseBody(req),null);
});

test("the opted-in server streams decoded text while the response string and provider remain open", async () => {
  process.env.VERCEL_ENV = "development"; process.env.OPENAI_API_KEY = "test-not-a-credential"; delete process.env.TYPESAFE_API_KEY;
  let upstream;
  global.fetch = async () => new Response(new ReadableStream({ start(controller) { upstream = controller; } }), { headers: { "content-type": "text/event-stream" } });
  const req = request(); req.body.streamText = true;
  const res = response(); const running = handler(req, res);
  await waitFor(() => Boolean(upstream));
  const prefix = '{"version":"2.0.0","segments":[{"response":"  Real incremental';
  upstream.enqueue(sse(delta(prefix)));
  await waitFor(() => res.body.includes('"type":"text_delta"'));
  const earlyEvents = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(earlyEvents, [
    { type: "emote", phase: "input", emote: "neutral" },
    { type: "text_delta", index: 0, delta: "Real incremental" },
  ]);
  assert.equal(res.writableEnded, undefined);
  assert.equal(res.body.includes('"type":"segment"'), false);
  const suffix = ' output.  "}]}';
  upstream.enqueue(sse(delta(suffix)));
  upstream.enqueue(sse(completed(prefix + suffix)));
  await running;
  const previews = [];
  const decoder = createMetabloomSegmentStreamDecoder({ onTextDelta: (text, index) => previews.push({ text, index }) });
  assert.equal(decoder.push(res.body), true);
  assert.deepEqual(decoder.finish().value, { version: "2.0.0", segments: [{ response: "Real incremental output." }] });
  assert.deepEqual(previews.map((entry) => entry.index), [0, 0]);
  assert.equal(previews.map((entry) => entry.text).join(""), "Real incremental output.");
});

test("text preview callbacks apply backpressure before segment commits", async () => {
  const seen = [], commits = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const reader = createEnvelopeReader({
    textOnly: true,
    onTextDelta: async (text, index) => { seen.push({ text, index }); await blocked; },
    onSegment: (segment) => commits.push(segment),
  });
  const final = '{"version":"2.0.0","segments":[{"response":"Visible before commit"}]}';
  let finished = false;
  const pushing = reader.push(final).then(() => { finished = true; });
  await waitFor(() => seen.length === 1);
  assert.equal(finished, false);
  assert.deepEqual(commits, []);
  release();
  await pushing;
  assert.deepEqual(commits, [{ response: "Visible before commit" }]);
  assert.deepEqual(reader.finish(final).segments, commits);
});

test("split JSON escapes, Unicode pairs and whitespace produce exactly the canonical paragraph", async () => {
  const serialized = String.raw`{"version":"2.0.0","segments":[{"response":" \tA \"quoted\" \\ path \/ caf\u00e9 \ud83e\udeb4 \n next \u00a0 "}]}`;
  const expected = JSON.parse(serialized).segments[0].response.trim();
  const deltas = [], commits = [];
  const reader = createEnvelopeReader({
    textOnly: true, onTextDelta: (text, index) => deltas.push({ text, index }),
    onSegment: (segment) => commits.push(segment),
  });
  for (const char of serialized) await reader.push(char);
  assert.equal(deltas.map((entry) => entry.text).join(""), expected);
  assert.equal(deltas.every(({ text, index }) => text && text.isWellFormed() && index === 0), true);
  assert.deepEqual(commits, [{ response: expected }]);
  assert.deepEqual(reader.finish(serialized).segments, commits);

  const raw = JSON.stringify({ version: "2.0.0", segments: [{ response: "First 🪴 last" }] });
  const split = raw.indexOf("🪴") + 1;
  const rawDeltas = [];
  const rawReader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => rawDeltas.push(text), onSegment: () => {} });
  await rawReader.push(raw.slice(0, split));
  assert.deepEqual(rawDeltas, ["First"]);
  await rawReader.push(raw.slice(split));
  assert.equal(rawDeltas.join(""), "First 🪴 last");
  assert.equal(rawDeltas.every((text) => text.isWellFormed()), true);
  rawReader.finish(raw);
});

test("trailing whitespace stays private until it becomes internal text", async () => {
  const deltas = [];
  const reader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => deltas.push(text), onSegment: () => {} });
  await reader.push(String.raw`{"version":"2.0.0","segments":[{"response":"  \t`);
  assert.deepEqual(deltas, []);
  await reader.push(String.raw`First \n`);
  assert.deepEqual(deltas, ["First"]);
  await reader.push("next  ");
  assert.equal(deltas.join(""), "First \nnext");
  await reader.push('"}]}');
  assert.equal(deltas.join(""), reader.finish().segments[0].response);
});

test("malformed escapes, raw controls, unpaired surrogates and duplicate fields never extend a safe preview", async () => {
  for (const suffix of [
    String.raw`\q"}]}`, String.raw`\u12x4"}]}`, '\n"}]}',
    String.raw`\ud83e"}]}`, String.raw`\udeb4"}]}`, String.raw`\ud83eA"}]}`,
    '","response":"PRIVATE FIELD"}]}', '","emote":"PRIVATE FIELD"}]}',
  ]) {
    const deltas = [], commits = [];
    const reader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => deltas.push(text), onSegment: (segment) => commits.push(segment) });
    await reader.push('{"version":"2.0.0","segments":[{"response":"Safe prefix');
    await assert.rejects(reader.push(suffix));
    assert.deepEqual(deltas, ["Safe prefix"]);
    assert.deepEqual(commits, []);
    assert.throws(() => reader.finish());
  }
  for (const segment of [
    '{"emote":"PRIVATE FIELD","response":"text"}', '{"response":123}',
    '{"response":{"private":"PRIVATE FIELD"}}', '{"responze":"PRIVATE FIELD"}',
  ]) {
    const deltas = [];
    const reader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => deltas.push(text), onSegment: () => {} });
    await assert.rejects(reader.push('{"version":"2.0.0","segments":[' + segment + ']}'));
    assert.deepEqual(deltas, []);
  }
});

test("preview limits apply before any excess segment or total text escapes", async () => {
  const deltas = [];
  const reader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => deltas.push(text), onSegment: () => {} });
  await reader.push('{"version":"2.0.0","segments":[{"response":"' + "x".repeat(1600));
  assert.equal(deltas.join("").length, 1600);
  await assert.rejects(reader.push("x"));
  assert.equal(deltas.join("").length, 1600);

  const whitespace = [];
  const whitespaceReader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => whitespace.push(text), onSegment: () => {} });
  await whitespaceReader.push('{"version":"2.0.0","segments":[{"response":"' + " ".repeat(1600));
  await assert.rejects(whitespaceReader.push("x"));
  assert.deepEqual(whitespace, []);

  const totalDeltas = [], commits = [];
  const totalReader = createEnvelopeReader({ allowMultiple: true, textOnly: true, onTextDelta: (text, index) => totalDeltas.push({ text, index }), onSegment: (segment) => commits.push(segment) });
  const paragraph = JSON.stringify({ response: "x".repeat(1600) });
  await totalReader.push('{"version":"2.0.0","segments":[' + [paragraph, paragraph, paragraph].join(","));
  await assert.rejects(totalReader.push(',{"response":"EXCESS'));
  assert.equal(totalDeltas.map((entry) => entry.text).join("").length, 4800);
  assert.equal(commits.length, 3);

  const singleDeltas = [];
  const singleReader = createEnvelopeReader({ textOnly: true, onTextDelta: (text) => singleDeltas.push(text), onSegment: () => {} });
  await singleReader.push('{"version":"2.0.0","segments":[{"response":"First"}');
  await assert.rejects(singleReader.push(',{"response":"EXCESS'));
  assert.deepEqual(singleDeltas, ["First"]);
  const counted = [];
  const countReader = createEnvelopeReader({ allowMultiple: true, textOnly: true, onTextDelta: (text) => counted.push(text), onSegment: () => {} });
  await countReader.push('{"version":"2.0.0","segments":[' + Array(4).fill('{"response":"Allowed"}').join(","));
  await assert.rejects(countReader.push(',{"response":"EXCESS'));
  assert.deepEqual(counted, Array(4).fill("Allowed"));
  const oversizedEnvelope = createEnvelopeReader({ textOnly: true, onTextDelta: () => assert.fail("No oversized preview"), onSegment: () => {} });
  await assert.rejects(oversizedEnvelope.push(" ".repeat(24001)));
});

test("provider final text must exactly match the streamed envelope and SSE bytes remain bounded", async () => {
  const serialized = '{"version":"2.0.0","segments":[{"response":"Verified prefix"}]}';
  const previews = [], commits = [];
  const inconsistent = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(sse(delta(serialized)));
    controller.enqueue(sse(completed(serialized.replace("Verified prefix", "Different text"))));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(streamMetabloomProvider(inconsistent, {
    textOnly: true, onTextDelta: (text) => previews.push(text), onSegment: (segment) => commits.push(segment),
  }), /Incomplete or inconsistent output/);
  assert.deepEqual(previews, ["Verified prefix"]);
  assert.deepEqual(commits, [{ response: "Verified prefix" }]);

  let cancelled = false;
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(256001)); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(streamMetabloomProvider(oversized, {
    textOnly: true, onTextDelta: () => assert.fail("No oversized preview"), onSegment: () => {},
  }), /Provider stream too large/);
  assert.equal(cancelled, true);
});

test("an invalid final provider envelope preserves only an incomplete preview and never emits done", async () => {
  process.env.VERCEL_ENV = "development"; process.env.OPENAI_API_KEY = "test-not-a-credential"; delete process.env.TYPESAFE_API_KEY;
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(sse(delta('{"version":"2.0.0","segments":[{"response":"Incomplete preview')));
    controller.enqueue(sse(completed('{"version":"2.0.0","segments":[{"response":"Different final text"}]}')));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
  const req = request(); req.body.streamText = true;
  const res = response(); await handler(req, res);
  const events = res.body.trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.filter((event) => event.type === "text_delta"), [{ type: "text_delta", index: 0, delta: "Incomplete preview" }]);
  assert.equal(events.some((event) => event.type === "segment" || event.type === "done" || event.phase === "response"), false);
  assert.equal(events.at(-1).type, "error");
  assert.equal(res.body.includes("Different final text"), false);
});

test("legacy v1 and non-opted-in chat retain complete-segment-only delivery", async () => {
  const v1Seen = [], v1Previews = [];
  const v1 = createEnvelopeReader({ onTextDelta: (text) => v1Previews.push(text), onSegment: (segment) => v1Seen.push(segment) });
  await v1.push('{"version":"1.0.0","segments":[{"emote":"warm","response":"Partial');
  assert.deepEqual(v1Seen, []); assert.deepEqual(v1Previews, []);
  await v1.push(' text"}]}');
  assert.deepEqual(v1Seen, [{ emote: "warm", response: "Partial text" }]);
  assert.deepEqual(v1Previews, []); v1.finish();

  process.env.VERCEL_ENV = "development"; process.env.OPENAI_API_KEY = "test-not-a-credential"; delete process.env.TYPESAFE_API_KEY;
  const final = '{"version":"2.0.0","segments":[{"response":"Complete paragraph"}]}';
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(sse(delta(final))); controller.enqueue(sse(completed(final))); controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
  for (const flag of [undefined, false]) {
    const req = request(); if (flag !== undefined) req.body.streamText = flag;
    const res = response(); await handler(req, res);
    assert.equal(res.body.includes('"type":"text_delta"'), false);
    assert.match(res.body, /"type":"segment"/);
    assert.match(res.body, /"type":"done"/);
  }
});
