# Metabloom: one reply, streamed emotional segments

Protocol 1.0.0 carries semantic text/emote pairs. A response request owns exactly one assistant message ID and one history entry, even when the reply contains several emotional segments. The same velocity-aware avatar remains mounted.

```json
{"version":"1.0.0","segments":[{"emote":"whimsy","response":"A playful opening."},{"emote":"reflective","response":"A considered continuation."}]}
```

The model chooses from nine restrained presets: neutral, warm, whimsy, reflective, curious, reassuring, concerned, celebratory, and resolute. Ordinary requests allow one segment. The checkbox **Allow emote changes within one reply** explicitly permits up to four. The shared system prompt explains that segments are consecutive paragraphs of ONE reply, not standalone messages. The model cannot control shader parameters, intensity, duration, or animation playlists.

## Streaming path

`api/metabloom.js` requests `stream: true` from the Responses API. `server/metabloomProviderStream.js` incrementally reads provider SSE text deltas, recognizing the ordered JSON schema. A complete segment must pass the exact emote/text schema and aggregate limits before it is emitted as NDJSON. Incomplete JSON never reaches the UI, and arbitrary JSON is never repaired. The parser handles chunk boundaries, escaped strings, nested-looking text, and UTF-8 splits.

```json
{"type":"segment","index":0,"emote":"whimsy","response":"A playful opening."}
{"type":"segment","index":1,"emote":"reflective","response":"A considered continuation."}
{"type":"done","version":"1.0.0"}
```

The browser's HTTP reader invokes `onSegment` immediately when each record validates, before network completion. `metabloomReplySession.js` accumulates those paragraphs into one message. The matching emote is triggered once at arrival. There is no reading-delay scheduler, no second assistant bubble, and no replay at completion. A final envelope must match the already visible prefix exactly.

This is **validated segment streaming**, not character-by-character display: a paragraph arrives when its complete emote/response object is available. The server emits it before later segments and the final envelope finish. Provider errors after a visible prefix produce an error record without `done`; the partial message remains explicitly incomplete. It is not relabelled as a successful demo.

## Local demonstration and integration

The four demo controls require no key. The two-part demo sends fragmented NDJSON through the same decoder and reply session, with simulated transport delays. The first paragraph appears with Whimsy while the stream is open. The second paragraph extends the same bubble with Reflective. Completion changes only the reply status.

For an external integration:

```js
const stream = window.__metabloomProtocol.createStream({ allowMultiple: true });
stream.push('{"type":"segment","index":0,"emote":"whimsy","response":"First paragraph."}\n');
// Later, as the next transport chunk arrives:
stream.push('{"type":"segment","index":1,"emote":"reflective","response":"Second paragraph."}\n');
stream.push('{"type":"done","version":"1.0.0"}\n');
stream.finish();
```

`push` accepts arbitrarily divided text chunks. `finish` requires terminal completion. `cancel` closes this response. The existing request adapter can instead call the provided `onSegment(segment, index)` callback as data arrives and resolve its promise with the matching final envelope. Legacy complete envelopes remain compatible, but cannot retroactively simulate streaming.

## Invariants and verification

New input, stop, reset, deactivation, and unmount abort obsolete network work and reject stale chunks. Partial responses are marked incomplete and excluded from future history. Combined assistant history allows 4,806 characters including paragraph separators, within the existing 16,000-character history and 24,000-byte body budgets. Unknown emotes, extra fields, duplicate provider keys, wrong ordering, excess segments, oversized data, missing completion, inconsistent final text, and provider refusal fail closed.

Origin validation, shared atomic client/project quotas, server-only credentials, bounded body readers, backpressure, and lifetime limits remain enforced. CI uses mocked provider streams without paid requests. Node tests hold the upstream stream open to prove the first segment is actually emitted early. React tests pin one DOM node, one history entry, exact emote counts, cancellation, and partial failure. The browser workflow exercises the actual demos in desktop, mobile dark mode, and reduced motion; on main it also checks the production domain.

Primary references: OpenAI Responses streaming (`https://developers.openai.com/api/docs/guides/streaming-responses`), Structured Outputs (`https://developers.openai.com/api/docs/guides/structured-outputs`), Vercel Functions streaming (`https://vercel.com/docs/functions/streaming-functions`).
