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

When the user requests a generic ingredient pie chart without quantities, the builder may provide an example with `provenance.type=illustrative` and clearly disclosed assumed amounts. Prompt grounding instructs preservation of supplied scalar quantities. Deterministic equality validation currently applies to the extracted multi-series bar/line data contract; arbitrary free-text quantities are not independently verified.

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
Native calculators publish bounded local input snapshots, not model calls on every change. The next ordinary chat request may include `artifactContext: {id,inputs}`. The server authenticates, loads the session-owned stored specification, validates the exact input set, and recomputes the result with the existing safe reverse-Polish evaluator. Browser-supplied totals and formulas are never trusted. Missing/expired/invalid context is ignored, so normal chat remains available.

## Safety and failure rules
- The native schema prohibits generated code, CSS, HTML, arbitrary URLs, and unsupported fields.
- Only complete, validated provider function calls can trigger the builder.
- The model cannot choose a format contradicting an explicit supported user request.
- Tool generation and continuation are each single-attempt and separately bounded; no automatic paid retries or repair loops.
- Redis claims are atomic. A claim consumed by an interrupted provider call is not automatically reissued.
- The initial offer expires in ten minutes. Completed native artifacts remain session-bound in Redis for up to one hour, subject to the site's privacy/retention requirements. The server holds only bounded context; no API keys or session tokens are stored in artifact records.
- A failed continuation does not discard a successfully generated visual. A failed visual produces a fixed, honest error response.
- A visual quota denial occurs before a generation claim and has no terminal generation result. The browser completes that request locally without calling `phase=continue`, replacing the temporary artifact row with one clear limit/reset-time reply. Optional visuals keep their existing text answer and display their own quota message. This also handles a quota race after successful preflight. Unfinished, already-claimed and genuinely expired continuation records retain distinct `tool_invalid`, `tool_claimed` and `tool_expired` errors.
- Old clients continue to use the existing chat protocol. The tool flow uses a separate endpoint rather than weakening strict NDJSON framing.
- The browser's display observation is untrusted and can only affect explanatory wording.
- All diagnostic logging is outcome-based; prompts, responses, artifact IDs and secrets are not logged.

## Visual quotas

The defaults are 30 accepted generations per authenticated subject/hour and 200 per deployment scope/24-hour window. The server-only `METABLOOM_VISUAL_SUBJECT_LIMIT_PER_HOUR` and `METABLOOM_VISUAL_DEPLOYMENT_LIMIT_PER_DAY` settings allow bounded positive overrides. All six formats share these counters, as do explicit and optional visuals. No admin bypass or reset is added. See the [quota and metadata contract](metabloom-visual-responses.md#redis-handoff-privacy-and-costs) for exact ranges, TTLs and failure accounting.

Preflight is an early rejection, not a reservation. The generation claim always checks and increments both counters in one Lua script. A denied preflight returns `tool_quota`; a denied generation returns `visual_quota`. Both use HTTP 429 with sanitized quota metadata and `Retry-After`. No paid retry is scheduled automatically. General chat/tool-start limits remain separate; continuation does not consume another visual generation.

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
node --test scripts/metabloom-api.test.cjs scripts/jev-reaction.test.cjs scripts/metabloom-visual.test.cjs scripts/metabloom-ui-tools.test.cjs scripts/metabloom-visual-quota.test.cjs
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomVisuals.test.js src/components/MetabloomVisualFollowups.test.js src/components/metabloomVisualIntent.test.js src/components/metabloomVisualCapabilities.test.js src/components/metabloomEmoteLibrary.test.js
CI=true npm run build
```

The Metabloom functional workflow includes these tests. Real-provider and physical-mobile qualification remain separate from fixture-based checks.
