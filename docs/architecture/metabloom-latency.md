# Metabloom answer latency

How long a Metabloom answer takes, split into named phases, so latency work is measured before and after every change.

## Recording a session

1. Open `/orb?metabloom-trace=1` (or run `__metabloomLatency.enable()` in the console). The flag is remembered in `localStorage` under `metabloom-trace`; `?metabloom-trace=0` or `__metabloomLatency.disable()` turns it off.
2. Send messages as usual. Each turn logs one `metabloom_latency` line at `console.debug` level.
3. Read the results in the console:

| Call | Returns |
|---|---|
| `__metabloomLatency.table()` | One row per turn with the derived phases (also printed with `console.table`) |
| `__metabloomLatency.summary()` | n, p50, p95, max and mean per phase across completed turns |
| `__metabloomLatency.last()` | The derived phases of the newest turn |
| `__metabloomLatency.turns()` | Copies of the raw turns: browser marks plus the server trace |
| `__metabloomLatency.export()` | JSON of every turn (raw and derived) for saving or comparing |
| `__metabloomLatency.clear()` | Forget the recorded turns |

The recorder keeps the last 50 turns in memory only.

## What is recorded

### Browser marks (ms from submit)

`submit`, `probe_start`/`probe_end` (workspace availability probe), `dispatch`, `fetch_start`, `headers`, `first_chunk`, `event:<kind>` (first of each stream event kind, emotes split into `emote_input`/`emote_response`), `first_text`, `painted_text` (the first animation frame after text reached the transcript), `text_complete`, `done`, `finished`.

### Server trace (ms from the handler entering)

`server/metabloomTrace.js` creates one trace per `/api/metabloom` request and carries it through `AsyncLocalStorage`, so the agent, providers, Jev and stores add spans without new parameters. Spans:

| Span | Covers |
|---|---|
| `session`, `rate_limit`, `model_catalog` | Request setup |
| `artifact_context`, `research_context` | Saved-work and research context loading |
| `jev` (`phase: input|response`) | Each Jev reaction call, with its outcome |
| `wait_input_decision` | Time the agent waited for the input Jev before starting |
| `agent` | The whole `runMetabloomAgent` call |
| `store_read` (`store`) | Each Redis read during agent setup |
| `model` / `model_retry` (`round`) | Each provider call: `headersMs`, token counts, outcome |
| `search_model` | Web-search model calls |
| `tool` (`tool`, `round`) | Each tool execution with its status |
| `tool_media`, `tool_images`, `research`, `research_brief` | Other answer paths |

Marks: `stream_open` (first byte flushed) and `sent:<type>` (first of each event type sent).

Every request writes one `metabloom_latency` JSON line to the server log (`requestRef`, outcome, status and the trace), traced or not, so the Vercel logs can be aggregated without a browser.

### Derived phases

`describeMetabloomTurn` turns marks and spans into the numbers to optimise. The headline is `toFirstText` (submit to first answer text). It is broken down into:

- `clientPrep`: submit to fetch (includes `workspaceProbe`)
- `requestToHeaders`: fetch to response headers
- `serverBeforeStream`: server time before the first byte
- `networkAndPlatform`: browser wait not explained by server time
- `jevInput`, `waitInputDecision`, `agent`, `storeReads`, `modelCalls`, `modelTotal`, `modelFirstHeaders`, `tools`, `outputTokens`, `reasoningTokens`
- `textCompleteToDone` and `jevResponse`: the tail after the answer is written

## Answer streaming

On OpenAI, the agent streams every model round (`stream: true` on the Responses
API). When a round begins its answer, the agent reports `validating` and the
host forwards `text_delta` events as the model writes, then commits each
`segment` when its JSON object closes. The browser protocol is unchanged.

- The answer passes through the same incremental grammar as plain chat
  (`createEnvelopeReader`). The completed message must equal exactly what was
  shown, and the whole envelope is validated before `text_complete`.
- A round that must show sources or photos before its text is not streamed, so
  citations are still checked against the sources before display. A streamed
  answer containing a citation fails.
- A round that writes text and then calls a tool fails the turn: shown text
  cannot be followed by more work.
- DeepSeek keeps whole answers because of its format retry. Claude is not
  streamed because it can write text and call a tool in the same response.
- Clients that do not send `streamText` keep whole answers. A provider that
  returns a whole JSON body is read as an ordinary response.
- Model spans record `stream` and, when streamed, `firstByteMs`: the time to the
  first answer text.

## Protocol

- The browser sends `X-Metabloom-Trace: 1` only while recording.
- The server then sends exactly one `{ "type": "trace", "trace": { version, totalMs, marks, spans, dropped? } }` event immediately before `done`.
- `metabloomLatencyProtocol.js` validates it strictly: version 1, bounded span and mark counts (96 and 48), lowercase names, `end >= start`, and detail keys from a fixed allowlist.
- A trace the browser did not ask for, an invalid trace or a second trace fails the stream like any other protocol violation. Untraced requests are unchanged.

## Privacy

Traces carry names, durations, counts and provider/model ids. Detail values are filtered through the allowlist (phase, outcome, provider, tool, store, status, model, round, attempt, token counts, bytes, events, firstByteMs, headersMs, stream). Messages, answers, tool arguments and results are never recorded, on either side.

## Rules for latency changes

- Record a baseline with a fixed prompt set before changing anything, then record again with the same prompts.
- Compare p50 and p95 of `toFirstText` and `toDone`, not single turns.
- New server work that can take noticeable time gets a span. Add new detail keys to the allowlist in the protocol and its tests.

## Measurements

Production, gpt-5-mini, six prompts (greeting, clock, arithmetic, two short answers, second greeting).

| Date | Change | toFirstText p50 / max | Notes |
|---|---|---|---|
| 2026-11-25 | Baseline | 3.9 s / 8.4 s | Model calls 3.1 s p50; answers are not streamed, so first text arrives with the whole answer. Workspace probe 0.31 s p50; three sequential Redis reads 0.21 s; cold model catalog 1.2 s; an `express_orb` call costs a second model round. |
| 2026-11-25 | Setup fixes, streaming, answer expressions | 2.8 s / 4.0 s | toDone 3.2 s p50 (was 4.0 s). Workspace probe 0 ms; submit to fetch 5 ms (was 311 ms). "Hi!" makes one model call (was two). Model time to first text 0.85–1.9 s is now most of the wait. |

Changes since the baseline:

- The browser checks invoice-workspace access before the first message and reuses the answer for five minutes per session (denials for one minute; timeouts are never reused). Opening and applying still check for themselves.
- The agent reads its saved states concurrently.
- The model catalog lookup overlaps the rate-limit check, and a catalog validated in the last 30 minutes answers at once while it refreshes in the background.
- Answers stream on OpenAI (see Answer streaming).
- The model's expression choice is a field of the answer (expression protocol 2), so it no longer costs an extra model round.
