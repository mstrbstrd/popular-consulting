# Metabloom native visual responses

## Scope and rollout

This is the first, feature-gated native-rendering milestone of the post-answer visual plan. It implements generated table, bar-chart, ordinal line-chart, pie-chart, small process/relationship diagram, and calculator specifications. It does not install CopilotKit, AG-UI, A2UI, Python agents or Websandbox. OpenIntelligentUI informs the architecture, not a wholesale chat replacement.

Arbitrary generated HTML, CSS and JavaScript are not supported. The later sandbox tier, sandbox theme bridge, external libraries, network-connected widgets, 3D, persistence and in-place artifact editing require separate implementation and qualification. There is no configuration switch that enables unimplemented sandbox execution.

Native generation is OFF unless the server has `METABLOOM_VISUALS_ENABLED=true`. Keep it off until preview qualification passes. The existing authenticated/admin audience remains authoritative. No browser preference can enable an unconfigured server.

Configuration:

| Variable | Behavior |
| --- | --- |
| `METABLOOM_VISUALS_ENABLED` | Exact `true` enables the native tier for already-authorized sessions. Anything else disables it. |
| `METABLOOM_VISUAL_MODEL` | Optional builder model; otherwise `METABLOOM_OPENAI_MODEL`, then the existing `gpt-5-mini` fallback. |
| `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `JEV_MODEL` | Existing provider configuration, kept server-side. No new provider account is required. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Existing shared Redis connection, now also used for short-lived visual handoffs and quotas. |
| Existing `AUTH_*` configuration | Still required, with environment/origin/session checks unchanged. Preview must use its own valid authentication configuration. |

The server flag and client negotiation determine availability. An environment setting cannot enable a format that has no native renderer.

## Ownership and request flow

The steps below describe optional visuals after an ordinary answer. Explicit supported requests use the [tool-aware flow](metabloom-tool-aware-ui.md), which also documents capability replies and unsupported requests.

1. The existing input Jev decision acknowledges the request and selects the optional scene.
2. The original answer and research path runs unchanged. Research citations validate before concise text is released.
3. Once the completed answer validates, the existing final Jev request may include an independent `visualization` question alongside `reaction`.
4. Jev receives the answer, original question, bounded context and available evidence. Application-approved formats map to native renderers. Unknown, missing, low-confidence or failed choices become `none`, independently of the emotion result. The initial confidence threshold is 0.75 and needs provider-backed evaluation; it is not a factual-confidence guarantee.
5. A short-lived, session-owned context record may be created. The chat emits its offer and ends normally. Handoff failure cannot turn a valid answer into an error. Slow ordinary turns and near-deadline research skip this optional work.
6. After the originating assistant message is visibly complete, a separate authenticated `POST /api/metabloom-visual` claims the offer and builds its specification.
7. The server and browser validate the specification. A host-owned React portal attaches the result to the originating assistant article, independently of text/research state.

The offer is negotiated with `X-Metabloom-Visuals: 1`, not a new request-body field. An older server ignores this header and can still accept a new client. An older client does not send the header and receives the original stream. No existing text envelope fields or protocol versions are reinterpreted.

`visual_offer` is permitted between the validated final reaction and `done`. The optional demultiplexer keeps the existing strict text decoder intact. Invalid or duplicate offers are discarded; unknown text records, oversized framing and records after `done` remain errors. A visual offer is dispatched to the UI only after the terminal text record validates.

`MetabloomVisuals` uses the existing `metabloom:user-message` and `__orbMessages` extension points. The optional path leaves the original text request with the model adapter; the explicit tool path claims supported visual requests. Request ID, original AbortSignal, originating user-message ID, exact completed answer, visible assistant-message ID and a unique Orb surface must agree. Repeated identical prompts do not authorize attachment to another reply. Each turn can start its offered visual once, even if its DOM slot disappears later.

The visual slot is a sibling of the text bubble inside the same assistant article. Explicit tool requests begin in an assistant-aligned placeholder row after their originating user message. The same slot moves before the completed assistant reply's text bubble, retaining the visual's alignment, calculator state and keyboard focus. Once the ready component settles, the current turn keeps its reading position instead of scrolling to the closing sentence. A long visual opens below the transcript's fade when the reader is already following the latest response; earlier reading and focused controls are respected. Optional post-answer visuals remain below their answer. This avoids stacking backdrop blur inside the text bubble's blur and does not create another chat surface or WebGL scene.

## Aetheris design contract

`src/aetheris-site.css` remains the source of token values. `metabloomVisualDesign.js` declares approved token names and generation instructions, not a second theme. `MetabloomVisual.css` loads after the other Orb presentation layers and scopes every rule to the new feature.

The application owns translucent surfaces, masked spectral edges, specular highlights, typography, radii, control dimensions, focus indicators and motion. The model supplies structure and data only. Native number inputs use a masked host wrapper because native input pseudo-elements cannot be relied upon. Borders, buttons and slider tracks use the existing spectral recipes; quantitative data marks retain consistent, readable semantic colors.

Theme changes use the existing CSS variables and root `data-theme`. They do not regenerate the specification, remount the calculator, reset inputs or make another provider request. No font files or third-party styling libraries are added; components inherit the existing font setup.

Glass remains a background treatment, not reduced opacity on text. Each chart series has a distinct three-stop gradient within its own hue family, built from the shared vivid cyan, magenta, yellow and violet palette. SVG fills and strokes, CSS bars and their wider legend swatches share stop colors at 0%, 55% and 100%. Pie fills and their swatches default to opaque pastel tints, mixing the existing stops with white at 40%, 50% and 60% color strength respectively. This keeps the hue families identifiable and consistent over both themes while giving each slice a soft light-to-color gradient. Line and bar colors retain their existing strength. Fixed SVG user-space bounds keep constant and all-zero line series visible.

Select a pie category by clicking or tapping its slice or its legend button. Each nonzero slice is also a labelled keyboard button supporting Enter and Space within an accessible SVG group; focus alone does not change selection. Both controls share the same selected state and live amount/share summary. Selected categories use a stronger spectral edge on the category control and a matching vivid 2px spectral outline around the slice's exact perimeter. That decorative outline is painted last, ignores pointer input and is never focusable. Zero-valued categories remain selectable in the legend without acquiring an artificial slice. Native controls use the shared focus halo, while SVG slices have an explicit focus stroke and glow; forced-color mode substitutes system colors for data gradients and retains explicit focus and selection indicators.

Generation uses a subtle panel-tone skeleton shimmer only while work is pending. The card expands from its measured pending height over the shared 240ms motion interval, alongside a short content-opacity reveal. The mount notification follows that bounded expansion so scroll alignment uses the final geometry. Finished visuals have no looping animation. Reduced motion skips both effects; hiding the tab settles an active expansion immediately. Reduced transparency and forced-color modes deliberately substitute accessible surfaces, and backdrop-filter support has a solid-surface fallback. No extra canvas, transformed glass surface or nested blur per control is introduced.

Real-scene compositing, existing transcript masking, deployed fonts and physical-device behavior still need preview qualification. Isolated component rendering is not proof of the complete Orb experience.

## Data and safety invariants

- Model output never executes as parent-document code. No HTML, CSS, handlers, external imports or arbitrary extra fields are accepted.
- Specs are limited to 64 KiB. Tables have at most 8 columns and 100 rows, charts 60 observations, diagrams 16 nodes/32 edges, and calculators 6 controls/32 expression tokens.
- Calculator expressions use bounded reverse-Polish arithmetic, not `eval`, Function, or JavaScript. Blank, non-finite, out-of-range, overflowing and zero-divisor inputs have no valid output.
- Lines use ordinal observation spacing, explicitly labelled as such. They do not imply scaled elapsed time for irregular timestamps. Exact values remain available as a semantic table.
- Provenance distinguishes user data, retrieved sources, calculations, illustrations and conceptual explanations. Referenced source IDs must exist in supplied evidence. Structural validation does not establish that an interpretation is factually correct; evidence agreement requires evaluation.
- Missing evidence or essential inputs yields an unavailable result instead of invented numerical data.
- A failed, cancelled or expired visual changes only its own state. Completed text and research remain intact.
- Starting a new message cancels unfinished visual generation. Ready visuals remain with their original message. Reset, message pruning and unmount clean up requests and portals. Hidden tabs do not deliberately abort visual network requests.
- Local slider/input changes make no model calls. `Copy scenario` copies values as text. The next ordinary message may include bounded calculator inputs; the server resolves the session-owned specification and recomputes the result before using those inputs as context. Changing an input alone never submits a paid follow-up.

## Redis handoff, privacy and costs

The server stores only the context needed to build the visual: question, completed answer, bounded recent conversation and selected evidence. It never stores provider keys or raw session tokens in these records. This is a new transient content-storage use and must be considered in the site's retention/privacy policy before enablement.

An offer expires after ten minutes. Keyed identity digests bind it to the verified session and deployment scope. Quotas use a subject digest so signing in again does not reset them. All claim keys share one Redis hash slot.

One Lua script verifies owner, expiry and offered status; checks both quotas; increments counters; and replaces the context with a claimed tombstone while retaining the TTL. The claimed context is returned only once. There is no in-memory fallback, client-provided context override, or second model call on a duplicate claim.

Initial limits are 5 visual generations per subject per hour and 50 per deployment scope per 24-hour counter window. One builder request allows at most 6,000 output tokens. Generation has a 75-second application deadline inside a 90-second function limit; the visual browser request allows 85 seconds. The [tool-aware timing table](metabloom-tool-aware-ui.md#time-budgets-and-timeout-recovery) covers the other stages. No repair loop, repeated web research or automatic paid retry is performed.

A failed attempt remains claimed. Completed specifications and terminal tool results are session-owned and retained for up to one hour; this does not automatically remount a lost browser component after refresh. A timed-out generation records a failed result for the tool continuation, and a completed continuation is cached to prevent a duplicate paid explanation. An explicit new request is subject to quotas. Cancellation can reduce work but does not establish that already-generated provider tokens were free.

Logs contain bounded outcome/format/timing/usage metadata, not prompts, answers, evidence, generated specs, session tokens, subject IDs or offer IDs. Auth/store failures fail closed. User-visible errors use fixed safe messages.

## Verification and delivery

Run the new built-in Node tests:

```sh
node --test scripts/metabloom-visual.test.cjs
```

With the repository's installed dependencies and Node 24, run the React integration tests and production build:

```sh
npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomVisuals.test.js
npm run build
```

The existing functional workflow is updated to Node 24, includes both new test suites, and runs on the feature branch. Its production-domain checks remain restricted to pushes to main. Provider fixtures do not make paid requests.

See `docs/verification/orb-native-visuals/README.md` for the checks actually run during implementation and outstanding qualification. A commit, passing local fixtures, CI, provider access and a deployed release are distinct states.

## Visual intent harness (October 2026)

The input harness classifies ordinary generation intent as `text_only`, `optional`, or `requested` using bounded deterministic matching. Explicit supported requests carry a preferred renderer and, when a format is named, a required kind. That required kind is enforced by the native tool schema and visual validation. Text-only requests disable the visual route.

The same harness identifies `capabilities`, `unsupported`, `clarification` and `visual_status` requests. These receive host-authored capability or status replies and cannot enter optional visualization. Bounded user history can resolve an explicit contextual request or retain an unsupported request. Assistant history never grants capabilities or proves a render. See the [capability and display contract](metabloom-tool-aware-ui.md#capability-and-display-contract) for the negative constraints and their limits.

The answer model receives presentation awareness and is instructed not to imitate charts with ASCII bars, pseudo-UI or text tables. The original question and completed answer remain the primary builder context. A small structured `dataHints` channel extracts only explicit, comma-separated numeric series supplied in the user message, without another model call. This is intentionally not a general-purpose numerical parser. Unsupported or inconsistent series produce no hints, not invented values.

The native chart contract now supports both the legacy one-series `points` representation and a bounded `labels` plus `series` representation with 2-5 series, up to 24 observations each, and 120 total numeric values. The Aetheris renderer provides distinct series colors, legend, accessible values table and mobile layout. The visual builder checks chart observations against authoritative user-provided data hints when present, rejecting mismatches instead of quietly altering figures. Series ordering may change but labels and numeric observations must agree.

Operational logs report only intent, selected kind and lifecycle outcomes, never the user question, chart values or session identity. `METABLOOM_VISUALS_ENABLED=true` is still required on the server. A production Git push does not enable the feature flag. Visuals remain independent of text completion, research citations and the original Orb animations.

The input classifier is intentionally conservative for ordinary prose, but cannot guarantee perfect semantic intent classification. Future iterations should use measured routing errors before adding another model or broadening the parser.
