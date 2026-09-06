const { test, afterEach } = require("node:test");
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
  global.fetch = oldFetch;
  for (const key of ["VERCEL_ENV", "OPENAI_API_KEY"]) {
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
  process.env.VERCEL_ENV="development";process.env.OPENAI_API_KEY="test-not-a-credential";
  let upstream, sent;
  global.fetch=async (_url,options)=>{sent=JSON.parse(options.body);return new Response(new ReadableStream({start(c){upstream=c;}}),{headers:{"content-type":"text/event-stream"}});};
  const res=response();const running=handler(request(),res);
  await waitFor(()=>Boolean(upstream));
  const prefix='{"version":"1.0.0","segments":['+JSON.stringify(first);
  const bytes=sse(delta(prefix));
  for(let i=0;i<bytes.length;i+=3) upstream.enqueue(bytes.slice(i,i+3));
  await waitFor(()=>res.body.includes('"whimsy"'));
  assert.equal(res.writableEnded,undefined);assert.equal(res.body.includes('"reflective"'),false);
  assert.equal(sent.stream,true);
  const suffix=','+JSON.stringify(second)+']}';
  upstream.enqueue(sse(delta(suffix)));upstream.enqueue(sse(completed(prefix+suffix)));
  await running;
  const decoder=createMetabloomSegmentStreamDecoder();decoder.push(res.body);
  assert.deepEqual(decoder.finish().value,envelope([first,second]));
});
test("a failed upstream after one segment signals an incomplete stream, not a successful response", async () => {
  process.env.VERCEL_ENV="development";process.env.OPENAI_API_KEY="test-not-a-credential";
  global.fetch=async ()=>new Response(new ReadableStream({start(c){
    c.enqueue(sse(delta('{"version":"1.0.0","segments":['+JSON.stringify(first))));
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
