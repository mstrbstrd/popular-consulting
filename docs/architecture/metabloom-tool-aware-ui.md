# Tool-aware native UI in Orb

## Scope
This extends the existing native Aetheris visual renderer. It does not execute generated HTML or JavaScript and does not install CopilotKit. The existing ordinary answer, Jev reaction, research, and optional post-answer visual paths remain intact.

Explicit supported UI requests use a forced, single `create_visual` function call through the configured OpenAI Responses API model. The model supplies only a validated kind and bounded brief. The server owns session identity, source context, tool execution, quota, artifact ownership and continuation. The visual builder uses the existing strict native schema and Aetheris styling.

Supported kinds include tables, bar charts, line charts, pie charts, flowcharts and calculators. An explicitly requested kind is also the sole kind in that request's function schema. Pie charts use one unit and 1–12 unique categories with nonnegative finite amounts and a positive total. Their native SVG, keyboard-operable category controls and exact-value table use the host's existing visual design.

## Capability and display contract

`metabloomVisualCapabilities.js` describes the actual formats approved by `METABLOOM_VISUAL_KINDS`. Both capability replies and model instructions use this catalogue. Geographic maps, arbitrary generated applications, unsupported chart types, images, animation exports and downloadable files are not implemented native components. The calculator's **Copy scenario** control copies text; it does not create a downloadable file.

The shared intent classifier receives the current message and bounded conversation history on the client, ordinary API and tool API. Previous user requests can identify a referenced task. Assistant prose cannot establish that a capability exists, that work started, or that a component was generated or mounted. A topic change ends contextual inheritance. Generic confirmations do not automatically regenerate a previously completed component.

| Request | Host behavior |
| --- | --- |
| Ask what generated UI can do | Return the implemented catalogue for the negotiated session. |
| Request an unsupported map, component or export | Return an explicit limitation; do not substitute an unrelated chart or start a provider call. |
| Confirm a previous unsupported request | Preserve its limitation instead of continuing an earlier imaginary promise. |
| Report that a component is missing | Acknowledge the missing display without claiming success or silently retrying paid generation. |
| Explicitly request a supported component | Use the existing tool, validation and mount lifecycle. |
| Give an ambiguous visual confirmation | Ask one focused question instead of inventing a task. |

Capability, unsupported-action, clarification and display-status replies are produced by the host after authentication, request validation and rate limiting. They do not call OpenAI, Jev or research, and cannot produce optional visual offers. The Jev service independently accepts visual selection only for `optional` and `requested` intents.

The ordinary writer has no execution or mounting receipt for its current turn. Its instructions prohibit claims that a visual is created, loading or displayed, and prohibit invented download controls or attachments. Only the tool continuation receives the owned generation result plus a bounded browser observation. `mounted` means the component mounted in the connected transcript, not proof that it is in the user's current viewport. `unknown` and `failed` must retain their uncertainty or failure wording.

These are explicit application boundaries for recognized intents. The deterministic classifier is a bounded language heuristic, and prompt instructions do not mathematically guarantee every sentence a free-form model can produce. Regression tests cover the reported Kelowna conversation, misleading assistant history, source-code exceptions, topic changes, negotiated availability and the absence of provider work for unsupported requests.

When the user requests a generic ingredient pie chart without quantities, the builder may provide an example with `provenance.type=illustrative` and clearly disclosed assumed amounts. Prompt grounding instructs preservation of supplied scalar quantities. For new visuals without a selected attachment, deterministic equality validation applies to the extracted multi-series bar/line data contract; arbitrary free-text quantities are not independently verified. Attached-data conversions additionally enforce every field of the host's canonical target projection before inheriting provenance.

## Availability
The new flow is available only when `METABLOOM_VISUALS_ENABLED=true` and `METABLOOM_UI_TOOLS_ENABLED` is not explicitly `false`. The latter is an independent emergency kill switch. No public client flag grants access. The existing authenticated admin session, same-origin checks, Redis quotas, and paid-provider configuration remain mandatory.

## Request sequence
1. A client identifies an explicit supported visual request using the shared intent contract and claims the existing Orb request event. Ordinary text and research continue through the original adapter.
2. `POST /api/metabloom-tool` with `phase=start` authenticates, verifies explicit intent, claims the request ID, checks visual capacity, and rate-limits before requesting exactly one forced `create_visual` call. It stores a short-lived, session-owned handoff and returns a validated offer and input emote. A quota denial returns before either the tool model or Jev is called.
3. The client reserves an assistant-aligned artifact row immediately after the originating user message and calls the existing `POST /api/metabloom-visual`. The server atomically claims the offer, builds one native specification, and stores the result for one hour. The response contains no executable code.
4. React mounts the artifact and settles its short expansion transition. The current turn anchors the ready visual's reading position, respecting earlier reading and focused controls. The client reports `mounted`, `failed`, or `unknown`. This is a browser observation, not proof of user interaction or external side effects.
5. `POST /api/metabloom-tool` with `phase=continue` atomically claims one continuation, replays the original provider function call plus an actual `function_call_output`, and generates a concise answer with tools disabled. Duplicate continuations reuse a completed response or fail closed without another paid request.
6. The existing Orb reply handler validates the completed answer and plays Jev's final reaction. The same artifact slot moves before the assistant article's text bubble and its temporary row is removed. Alignment, calculator inputs and focused controls are preserved without remounting; the closing explanation arrives below the visual.

## Artifact-aware follow-ups

**Ask about this** attaches one selected part of a native visual to the Orb composer. The attachment is visible, removable, and consumed when its message is submitted. It preserves an existing draft and survives ordinary SPA navigation in the account-owned, tab-only Orb snapshot. Reset and account changes clear the owning draft. Removing a reference returns focus to the composer and sends the next message without artifact context.

| Visual | Referenced data |
| --- | --- |
| Table | One row at its original stored index; sorting and filtering cannot change its identity. |
| Line chart | One observation with its label, unit, and every named series value. |
| Pie chart | One category, its amount, the whole's total, and its calculated share. |
| Flowchart | One stable node ID, its label, and adjacent labelled connections. |
| Calculator | A copy of all valid inputs at the moment Ask is clicked, plus a server-recomputed result. |

Inspection, sorting, filtering, editing controls, attaching, and removing a reference remain local actions. Sending starts the request. Later calculator edits cannot alter an already attached scenario.

The browser sends `artifactContext: {id,version,selector,inputs?}` to either `/api/metabloom` or the start phase of `/api/metabloom-tool`. This is a bounded locator, not client-supplied rows, totals, formulas, or sources. `version` is an immutable server-issued content revision, separate from the visual schema version. Both endpoints authenticate and resolve the same session-owned stored record before paid work. They verify its revision, schema, source catalog, selector range, and exact calculator control set; every calculator input must be finite and within its stored limits. The safe reverse-Polish evaluator recomputes the result.

Missing, foreign, stale, or expired explicit references return `artifact_unavailable`; an incompatible selector or invalid scenario returns `artifact_invalid`. Malformed request shapes fail request validation. Explicit context is never silently dropped. Ordinary explanations suppress optional post-answer visual offers; an explicit conversion uses the existing tool path. Original source IDs remain in the selected artifact's namespace. The ordinary writer is instructed to attribute reused data by stored provenance and source titles. The host keeps original source links on the visual and does not merge their IDs into the current answer's numbered research catalog.

Every new successful generation stores an `artifactVersion`. The generation API returns that field only when the client requests `includeReference: true`, preserving the exact response shape accepted by older clients. Restored legacy visuals remain readable and interactive but cannot offer a versioned Ask action. The ordinary API retains compatibility with old `{id,inputs}` calculator requests; only that legacy optional path retains its historical ignore-on-missing behavior. New composer submissions never use the implicit latest-calculator fallback.

See [artifact follow-up verification](../verification/metabloom-artifact-followups.md) for the conversion contract and checks.

## Safety and failure rules
- The native schema has no executable HTML, JavaScript or CSS fields, arbitrary URL controls, or unsupported fields. Labels and cells render as text; source links use the validated catalog.
- For explicit UI requests, only complete, validated provider function calls can trigger the builder.
- The model cannot choose a format contradicting an explicit supported user request.
- Tool generation and continuation are each single-attempt and separately bounded; no automatic paid retries or repair loops.
- Redis claims are atomic. A claim consumed by an interrupted provider call is not automatically reissued.
- The initial offer expires in ten minutes. Completed native artifacts remain session-bound in Redis for up to one hour, subject to the site's privacy/retention requirements. The server holds only bounded context; no API keys or session tokens are stored in artifact records.
- Offers store tool replay context, and completion stores result data, as opaque JSON fields in Redis. Lua changes lifecycle fields without decoding those payloads, preserving exact numbers and empty arrays. JavaScript readers accept both the new opaque format and older object records. Completion remains write-once; continuation preserves the result's expiry. The original offer deadline does not expire an already completed result.
- A failed continuation does not discard a successfully generated visual. A failed visual produces a fixed, honest error response.
- A visual quota denial occurs before a generation claim and has no terminal generation result. The browser completes that request locally without calling `phase=continue`, replacing the temporary artifact row with one clear limit/reset-time reply. Optional visuals keep their existing text answer and display their own quota message. This also handles a quota race after successful preflight. Unfinished, already-claimed and genuinely expired continuation records retain distinct `tool_invalid`, `tool_claimed` and `tool_expired` errors.
- Old clients continue to use the existing chat protocol. The tool flow uses a separate endpoint rather than weakening strict NDJSON framing.
- The browser's display observation is untrusted and can only affect explanatory wording.
- All diagnostic logging is outcome-based; prompts, responses, artifact IDs and secrets are not logged.

## Visual quotas

The defaults are 30 accepted generations per authenticated subject/hour and 200 per deployment scope/24-hour window. The server-only `METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR` and `METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY` settings allow bounded positive overrides. All six formats share these counters, as do explicit and optional visuals. No admin bypass or reset is added. See the [quota and metadata contract](metabloom-visual-responses.md#redis-handoff-privacy-and-costs) for exact ranges, TTLs and failure accounting.

Preflight is an early rejection, not a reservation. The generation claim always checks and increments both counters in one Lua script. A denied preflight returns `tool_quota`; a denied generation returns `visual_quota`. Both use HTTP 429 with sanitized quota metadata and `Retry-After`. No paid retry is scheduled automatically. General chat/tool-start limits remain separate; continuation does not consume another visual generation.

### Redis quota reply

The preflight script and an exhausted generation claim return one native Redis integer array:

```text
[1, subjectLimit, subjectRemaining, subjectResetDelayMs,
    deploymentLimit, deploymentRemaining, deploymentResetDelayMs]
```

The first integer is the wire version. Each delay is a positive millisecond count bounded by its quota window. The server checks the exact length/version, safe integer values, configured limits, remaining counts, and delay ranges before constructing the public quota metadata. It derives `scope`, explicit `null` values for available capacity, absolute reset times, and `Retry-After` in JavaScript, then applies the unchanged public quota validator. An available array cannot authorize a generation claim; successful claims still return the validated stored offer record.

This avoids CJSON encoding of quota objects and absolute timestamps in Lua. [Upstash documents native array results for EVAL](https://upstash.com/docs/redis/commands/scripting/eval). The inline script and its decoder ship together; the array is a command response, not a persisted format, so existing offer records, counters, and expiries need no migration. Lua validates both counters and their TTLs before incrementing either counter. Existing count text must be the canonical nonnegative integer representation written by Redis `INCR`; malformed counters fail closed before any write.

On November 2, 2026, the former script reproduced the production `quota_schema_invalid` failure on a disposable Upstash fixture with empty fictional counters: its CJSON response omitted the null-valued outer `scope` and `resetAt` fields. Stock Redis 7 preserved those fields, so stock Redis alone did not reproduce the hosted failure. The integer-array response passed seven compatibility checks through Upstash's actual REST interface, including available capacity, all exhausted scopes, denied and accepted claims, duplicates, and invalid counter rejection. The public parser still rejects the captured incomplete JSON shape; a regression test verifies that the new response constructs both required null fields.

### Investigating quota failures

Find the `metabloom_ui_tool` server log using the request reference displayed in the error. A failure at `stage: "visual_quota"` happens after the request claim and before the general request quota or either model call. `tool_unavailable` alone does not mean the visual allowance is exhausted: a valid exhausted allowance returns `tool_quota` and HTTP 429.

Store failures append fixed diagnostic categories to that same log. The visual generation endpoint includes them in its existing `metabloom_visual` log as well. The response sent to the browser keeps its existing code and request reference.

| `storeFailure` | Meaning |
| --- | --- |
| `redis_configuration_invalid`, `quota_limit_invalid` | The connection configuration or a quota limit is invalid. |
| `redis_transport_failed`, `redis_timeout`, `redis_cancelled` | The Redis request failed to connect, exceeded its two-second command budget, or was cancelled. |
| `redis_http_error`, `redis_command_error` | Redis rejected the HTTP request or returned a command error. `storeStatus` contains the HTTP status when available. |
| `redis_response_invalid`, `redis_response_too_large`, `redis_envelope_invalid` | The Redis response could not be decoded within its bounds or lacked the expected result envelope. |
| `quota_state_invalid` | The quota script rejected a stored counter or its expiry. |
| `quota_result_invalid` | The quota reply had an invalid array shape, version, or element type. |
| `quota_schema_invalid` | The quota reply contained an unsafe integer, a limit/count/expiry outside its allowed range, or metadata that failed the public quota contract. |

Older deployments may record `quota_json_invalid` for the former CJSON string response.

Redis command errors may also include an allowlisted `redisCode` such as `NOPERM` or `WRONGTYPE`, and `redisDetail` may distinguish script compilation, script execution, or an unknown command. The diagnostic reader examines at most 4 KiB of an HTTP error body under the same command deadline. It never logs the raw body, message, URL, key, counter value, credential, prompt, or user identity. Unknown error text yields no extra category. Investigate the recorded category before changing limits or stored counters; the existing checks continue to fail closed.

## Time budgets and timeout recovery

The October 20 production failure occurred at the former 24-second application deadline while the first OpenAI call was still pending. It preceded native generation. The stages now share explicit server/browser budgets:

| Stage | Application deadline | Hosting limit |
| --- | --- | --- |
| Tool selection and offer | 50 seconds | 60 seconds |
| Native specification generation | 75 seconds | 90 seconds |
| Closing explanation | 25 seconds | 60 seconds |

These are upper limits, not target response times. The visual client permits 85 seconds and the complete tool turn permits 180 seconds. Up to 2.5 seconds is reserved for terminal persistence after an abort. A generation timeout records a failed result so continuation can report it. An explanation timeout saves a display-aware fallback with a fresh bounded signal; duplicate continuations reuse it without another provider call. Jev failures fall back to neutral without discarding otherwise valid work.

The existing configured models remain authoritative. The original GPT-5 family (including mini, nano and dated snapshots) uses minimal effort for the short tool brief and closing sentence, and low effort for native specification generation. Other model names retain their provider defaults. This follows [OpenAI's GPT-5 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5); reasoning tokens also count toward output limits, as described in the [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).

Provider logs contain the bounded phase, model, duration, usage counts, safe provider metadata and request reference. HTTP and incomplete-output failures keep distinct allowlisted codes. Client error messages retain these codes and validated request references, including a platform 504 returned as HTML, without exposing a provider's raw body.

## Verification
Run:
```sh
node --test scripts/metabloom-api.test.cjs scripts/jev-reaction.test.cjs scripts/metabloom-visual.test.cjs scripts/metabloom-ui-tools.test.cjs scripts/metabloom-visual-quota.test.cjs scripts/metabloom-visual-store-diagnostics.test.cjs scripts/metabloom-artifact-reference.test.cjs
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomVisuals.test.js src/components/MetabloomVisualFollowups.test.js src/components/MetabloomArtifactSelection.test.js src/components/MetabloomArtifactComposer.test.js src/components/metabloomVisualSnapshot.test.js src/components/metabloomVisualIntent.test.js src/components/metabloomVisualCapabilities.test.js src/components/metabloomEmoteLibrary.test.js
CI=true npm run build
```

The Metabloom functional workflow also runs the actual Lua scripts against a Redis 7 service in an independent Ubuntu job. This covers available and exhausted quotas, unchanged expiry deadlines, duplicate and concurrent claims, shared deployment limits across subjects, malformed counter state, ownership/expiry checks, and the full completed-artifact lifecycle with exact decimals, empty arrays, and immutable revisions. To run this suite locally against an isolated Redis 7 fixture bound to `127.0.0.1`:

```sh
METABLOOM_QUOTA_TEST_REDIS_PORT=6379 node --test scripts/metabloom-visual-quota-redis.test.cjs
```

The port is required; the suite never falls back to configured application Redis credentials. It uses unique fictional keys and cleans up only those keys. Real-provider and physical-mobile qualification remain separate from fixture-based checks.
