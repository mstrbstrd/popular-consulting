# Tool-aware native UI in Orb

## Scope
This extends the existing native Aetheris visual renderer. It does not execute generated HTML or JavaScript and does not install CopilotKit. The existing ordinary answer, Jev reaction, research, and optional post-answer visual paths remain intact.

Explicit supported UI requests use a forced, single `create_visual` function call through the configured OpenAI Responses API model. The model supplies only a validated kind and bounded brief. The server owns session identity, source context, tool execution, quota, artifact ownership and continuation. The visual builder uses the existing strict native schema and Aetheris styling.

Supported kinds include tables, bar charts, line charts, pie charts, flowcharts and calculators. An explicitly requested kind is also the sole kind in that request's function schema. Pie charts use one unit and 1–12 unique categories with nonnegative finite amounts and a positive total. Their native SVG, keyboard-operable category controls and exact-value table use the host's existing visual design.

When the user requests a generic ingredient pie chart without quantities, the builder may provide an example with `provenance.type=illustrative` and clearly disclosed assumed amounts. Prompt grounding instructs preservation of supplied scalar quantities. Deterministic equality validation currently applies to the extracted multi-series bar/line data contract; arbitrary free-text quantities are not independently verified.

## Availability
The new flow is available only when `METABLOOM_VISUALS_ENABLED=true` and `METABLOOM_UI_TOOLS_ENABLED` is not explicitly `false`. The latter is an independent emergency kill switch. No public client flag grants access. The existing authenticated admin session, same-origin checks, Redis quotas, and paid-provider configuration remain mandatory.

## Request sequence
1. A client identifies an explicit supported visual request using the shared intent contract and claims the existing Orb request event. Ordinary text and research continue through the original adapter.
2. `POST /api/metabloom-tool` with `phase=start` authenticates, rate-limits, verifies explicit intent, requests exactly one forced `create_visual` call, and stores a short-lived, session-owned handoff. It returns a validated offer and input emote.
3. The client reserves an artifact slot beside the originating user message and calls the existing `POST /api/metabloom-visual`. The server atomically claims the offer, builds one native specification, and stores the result for one hour. The response contains no executable code.
4. React mounts the artifact. The client reports `mounted`, `failed`, or `unknown`. This is a browser observation, not proof of user interaction or external side effects.
5. `POST /api/metabloom-tool` with `phase=continue` atomically claims one continuation, replays the original provider function call plus an actual `function_call_output`, and generates a concise answer with tools disabled. Duplicate continuations reuse a completed response or fail closed without another paid request.
6. The existing Orb reply handler validates the completed answer and plays Jev's final reaction. The artifact moves into the assistant article without remounting.

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
- Old clients continue to use the existing chat protocol. The tool flow uses a separate endpoint rather than weakening strict NDJSON framing.
- The browser's display observation is untrusted and can only affect explanatory wording.
- All diagnostic logging is outcome-based; prompts, responses, artifact IDs and secrets are not logged.

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
node --test scripts/metabloom-visual.test.cjs scripts/metabloom-ui-tools.test.cjs
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomVisuals.test.js
CI=true npm run build
```

The Metabloom functional workflow includes these tests. Real-provider and physical-mobile qualification remain separate from fixture-based checks.
