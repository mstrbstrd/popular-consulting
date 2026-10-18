# Metabloom: Jev reactions and actions with streamed replies

## Live conversation protocol 2.0.0

The standard `/api/metabloom` endpoint uses **OpenAI for response text** and
**TypeSafe Jev for the Orb's nonverbal decisions**. A server-only Jev Choice
request reads the latest user message first. Its result (or neutral fallback) is
published as soon as it is available. Automatic scene mode waits for that bounded
decision so the text model knows the selected presentation; explicit modes and
legacy requests start the text model in parallel with input Jev. A
second Choice request starts only after OpenAI's complete text has passed schema
validation. The reply stays a single assistant message regardless of segment count.

```jsonl
{"type":"emote","phase":"input","emote":"curious"}
{"type":"action","action":"deep-research"}
{"type":"text_delta","index":0,"delta":"Let me examine"}
{"type":"text_delta","index":0,"delta":" the evidence."}
{"type":"segment","index":0,"response":"Let me examine the evidence."}
{"type":"text_complete"}
{"type":"emote","phase":"response","emote":"reflective"}
{"type":"done","version":"2.0.0"}
```

Live response segments contain **text only**. The current browser opts into
incremental text with `streamText: true` in the request body. Decoded response
text reaches the client as provider deltas arrive, before its paragraph closes. The
following validated `segment` commits that same paragraph without appending it
again. Its normalized text must exactly match the concatenated text deltas.
Older clients that omit the capability keep receiving complete segments.

The browser also sends `actionMode: "auto"` to request an independent action
choice in the input Jev call. A selected explicit mode (`none`, `deep-research`,
or `under-the-hood`) overrides classification. Only clients sending `actionMode`
receive the single `action` record. It must follow the input emote and precede
all text; unknown IDs, extra fields, duplicate records, and late records fail
validation. Older v2 streams without action records remain supported.

`onAction(action)` opens the request-owned scene. Deep Research begins surfacing
when the first response content arrives and withholds visible text until the
return finishes. It then reveals buffered text progressively and continues the
same streamed reply. Under the Hood holds its reveal during the text and closes
on successful terminal completion. No additional action event or Jev call is
needed. Cancellation and failure discard unpublished text, retire the scene, and
preserve only an already-visible incomplete prefix. The action
catalog and the confirmed external-worker contract are documented in
[decision and activity mappings](metabloom-decisions.md).

The browser dispatches the input
reaction immediately, then dispatches the final reaction **only after verifying
the terminal `done` event**. The research display gate additionally holds that
final reaction until the queued answer has been shown. This prevents interrupted streams from expressing a
premature conclusion. The user sees one growing chat bubble. Partial text remains
provisional until the response completes. An error or cancellation preserves the
visible prefix with an incomplete status and excludes it from history. The old per-paragraph
reactions are not selected by the chat model anymore.

Jev receives a constrained `type: "choice"` question with the same 14 primitive
emotes and four authored chains as the existing Metabloom vocabulary. Unknown or
low-confidence decisions become `neutral`. Each phase has its own abortable,
bounded call, and failures do not prevent successful chat responses from
finishing. No credentials or conversation contents enter Jev diagnostic logs.
Server-only Vercel settings: `TYPESAFE_API_KEY` and `JEV_MODEL` (default
`jev-latest`). Missing Jev configuration produces neutral gestures and `none`
for automatic actions. An explicitly selected presentation mode still applies.

## Legacy demonstration and external adapter protocol 1.0.0

Protocol 1.0.0 carries semantic text/emote pairs. A response request owns exactly one assistant message ID and one history entry, even when the reply contains several emotional segments. The same velocity-aware avatar remains mounted.

```json
{"version":"1.0.0","segments":[{"emote":"whimsy","response":"A playful opening."},{"emote":"reflective","response":"A considered continuation."}]}
```

Legacy emote-response adapters may choose from fourteen primitive emotes and four authored reaction chains. Ordinary requests allow one segment, which may select a single emote or a chain. The live **Allow separate response paragraphs** checkbox permits up to four text segments; legacy demonstrations can still provide a distinct emote for each segment. The shared system prompt explains that segments are consecutive paragraphs of ONE reply, not standalone messages. The model cannot control shader parameters, intensity, duration, or arbitrary animation playlists. See [decision and activity mappings](metabloom-decisions.md) for the choice catalog and Jev adapter contract.

## Streaming path

`api/metabloom.js` requests `stream: true` from the Responses API. Its live output uses protocol 2.0.0. `server/metabloomProviderStream.js` reads provider SSE text deltas with an incremental grammar for the ordered JSON schema. For clients requesting incremental text, it emits only decoded characters from a `response` string as `text_delta` records. Keys, delimiters, incomplete escapes, and incomplete surrogate pairs stay inside the parser. Leading whitespace and potentially trailing whitespace are withheld so the visible text exactly matches the normalized final paragraph. Text and envelope limits apply before additional previews are published. Arbitrary JSON is never repaired.

Each complete paragraph must still pass the exact segment schema and match its visible preview before its `segment` commit is emitted. The full provider envelope must validate before `text_complete` or the final Jev request. The version 1 example below describes the retained legacy path, which emits complete emote/text segments:

```json
{"type":"segment","index":0,"emote":"whimsy","response":"A playful opening."}
{"type":"segment","index":1,"emote":"reflective","response":"A considered continuation."}
{"type":"done","version":"1.0.0"}
```

The browser's HTTP reader invokes `onTextDelta(delta, index)` for progressive v2 text and `onSegment(segment, index)` for validated paragraph commits. `metabloomReplySession.js` keeps one provisional paragraph at its original index and replaces it on commit, preserving one message and one DOM node. Legacy segment emotes are queued once at arrival; the live v2 Jev reactions remain separate. A final envelope must match the received text exactly, including any text still held by the research display gate. Streaming articles use `aria-busy` so the live region can announce the completed or interrupted reply coherently.

Ordinary conversation and Under the Hood update text as provider chunks arrive.
Deep Research has a request-owned presentation gate: the first content starts
the return sequence, text remains hidden until surfacing finishes, and the
buffered prefix is then revealed across visible frames. The gate retains the
existing semantic limits rather than an unbounded list of transport events.
Validation continues while the scene is returning. The visible final status and
response emote wait for the displayed prefix to catch up with a validated final
reply. Provider completion ends its existing deadline without extending network
work while the UI finishes this bounded presentation.

Provider errors after a visible prefix produce an error record without `done`;
the partial message remains explicitly incomplete and cannot fall back to a
successful demo. NDJSON transport is bounded at 320,000 bytes to accommodate
framing for up to 4,800 single-character deltas. Individual decoder records and
its pending buffer stay bounded at 24,000 characters; semantic limits remain
1,600 characters per paragraph and 4,800 total.

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

`push` accepts arbitrarily divided text chunks. `finish` requires terminal completion. `cancel` closes this response. Request adapters can call `onTextDelta(delta, index)` for progressive v2 text, followed by `onSegment(segment, index)` to commit the matching paragraph, then resolve their promise with the matching final envelope. Legacy complete envelopes and v1 demos remain compatible.

## Invariants and verification

New input, stop, reset, deactivation, and unmount abort obsolete network work and reject stale chunks. Partial responses are marked incomplete and excluded from future history. Combined assistant history allows 4,806 characters including paragraph separators, within the existing 16,000-character history and 24,000-byte body budgets. Unknown emotes, extra fields, duplicate provider keys, wrong ordering, excess segments, oversized data, missing completion, inconsistent final text, and provider refusal fail closed.

Origin validation, shared atomic client/project quotas, server-only credentials, bounded body readers, backpressure, and lifetime limits remain enforced. Tests use mocked provider streams without paid requests. Node tests hold the upstream open inside a response string to prove text arrives before paragraph and provider completion. Parser tests split JSON escapes and Unicode, enforce limits, and reject mismatched commits. React tests pin one DOM node, one history entry, cancellation, and incomplete prefix handling. The existing browser workflow also exercises the legacy demos in desktop, mobile dark mode, and reduced motion.

Primary references: OpenAI Responses streaming (`https://developers.openai.com/api/docs/guides/streaming-responses`), Structured Outputs (`https://developers.openai.com/api/docs/guides/structured-outputs`), Vercel Functions streaming (`https://vercel.com/docs/functions/streaming-functions`).
