# Council mode

## Plan and delivered flow

1. Reuse account model preferences and provider adapters. Resolve all three defaults on the server before generation. The saved preferred provider chairs the synthesis using its saved default, not the composer's temporary model selection.
2. Collect three independent opening views. Each sees the same bounded conversation and question, with no access to the other openings.
3. Collect three critiques. Each receives the same complete opening round and addresses both peers, including weaknesses, strengths and revisions to its own position.
4. Have the chair synthesize all six contributions, preserving disagreements and uncertainties rather than treating agreement as proof.
5. Stream real speaker start/completion events. Save the three labelled opening/critique pairs and the synthesis as one ordinary four-segment chat reply.
6. Test the orchestration, API gates, stream boundary, cancellation, UI and persistence bounds; register the server tests in functional CI.

## Invocation and scope

The `/orb` composer has a Council toggle. The current user message automatically selects council mode when it contains `ask the council`, `asking the council`, or `ask council`, case-insensitively. Explicit negatives such as `do not ask the council` suppress automatic activation. History, peer output and assistant messages never activate the mode. The client routes the request to `/api/metabloom-council`; no model can trigger delegation by emitting prose. Council takes precedence over the Deep Research checkbox for an automatically matched message; manual toggles are mutually exclusive.

Before sending, the UI explains that council uses seven model calls plus up to two format corrections, shares the bounded conversation across the three providers, and has no live search. It deliberates on supplied text. Attached artifact/research references require removal and relevant text supplied in the question; they are never silently ignored or converted into cross-account access. Live browsing, external actions, model-invoked expression tools, generated visuals and iterative/unbounded debate are outside this version.

## Structural invariants

| Invariant | Enforcement |
| --- | --- |
| Every seat is the account's actual default. | Authenticated account identity loads one preference snapshot. All three catalog resolutions finish before quota/generation. `default` and `latest` become concrete IDs once. Client-supplied rosters, endpoints or model overrides are rejected. |
| No silent replacement or fabricated member. | Missing preferences, unavailable providers or rejected models stop the request. No reduced two-member council, provider fallback or demo reply. |
| Critiques have equal context. | Three openings share identical inputs; all critiques see exactly those three openings. Synthesis sees all openings and critiques. Private reasoning is neither forwarded nor displayed. |
| Work is finite and quota-accounted. | Seven sequential contributions plus at most two format corrections, with at most one correction per contribution. Seven units are reserved atomically against the existing per-client and project-wide quota; each correction reserves one additional unit before generation. Contributions remain bounded to 400/450/1100 characters. No tool execution, model replacement or deadline renewal. |
| The host owns structure. | Each provider generates a plain-text contribution. OpenAI/DeepSeek use `text.format.type = text`; Claude omits the optional structured-output configuration. The host validates the text and constructs every stream event and saved JSON envelope. Model text cannot supply event names, speaker IDs or completion metadata. Ordinary chat/tool calls retain their existing structured-output contracts. |
| Invalid drafts cannot become peer evidence. | Only completed public text with empty content, excess length or unsupported citation syntax can be regenerated. The same member receives the original context and fixed validation diagnostics, never the rejected draft. Invalid text is not truncated, displayed, persisted or forwarded to peers. Refusals, incomplete responses, transport errors and tool calls are not retried. |
| Progress reflects real execution. | The host awaits each running or correcting event before its model request; complete requires validated public output. A shared ordered decoder enforces correction budgets and rejects duplicates, missing starts, unexpected fields, invented citations and premature completion. Failures name the interrupted round and provider in the current view. |
| Stop owns the whole request. | One 150-second server deadline and 165-second client deadline; no progress renewal. The same abort signal covers preferences, catalog, quota and all generations. Browser request ownership rejects late events. |
| Failure is not consensus. | A failed member ends the discussion without synthesis or `council_done`. Completed contributions remain visibly provisional in the current view. They are not committed as a successful saved answer. |
| Conversation survives normal storage. | The final discussion fits the existing four-segment, 1600-character-per-segment and 4800-character-total validators even with maximum-length model IDs. It is saved through the existing thread lifecycle, with no new database schema. |
| Text is data. | Peer contributions are explicitly untrusted. No model output can name a new tool, call another member, change rounds or select a model. React renders contributions as text, not HTML. |

The progress panel uses native expandable details, polite status updates, normal document flow and existing Stop behavior. It does not move focus. After success, the ordinary saved chat reply includes the entire bounded discussion and synthesis. Partial discussions remain transient and labelled incomplete after failure or Stop.

## Council scene

Regular chat uses the original full-size Orb and native expression colours. Selecting Council or drafting an affirmative council request shrinks the centre Orb and brings two smaller Orbs inward from outside the field. The seats are stable: DeepSeek left (blue/indigo), OpenAI centre (jade/teal), Claude right (orange/amber). Automatic invocation retains the scene while the request and final presentation are pending; manual mode keeps the resting council until disabled. Leaving the mode reverses the entrance.

Only accepted `council_step` running/repairing events identify the active member, with the actual server-selected chair for synthesis. The active member uses the existing curious, thinking or resolute motion with speaking modulation; peers use listening poses and turn toward that member. Correcting a response shows thinking without speech. These are host presentation cues for observed work, not model-chosen emotions, assertions of agreement, or private reasoning. Complete, Stop, errors, reset and stale events cannot continue a speaking turn.

The existing canvas, WebGL context, program, render cadence and draw count are retained. One field evaluation per pixel selects the closest seat, and its glow is feathered before the seat boundary. Each member has a bounded instance of the existing motion runtime. Desktop council bounds account for the docked sidebar; mobile sizes use the available width. No faces, shells, overlay creatures, extra canvases, artificial progress timers or extra model calls are added. The selected material finish is preserved.

Pause, reduced motion and inactive views draw static seats without motion or speech. Disabling model expressions or setting expressiveness to zero suppresses the conversational gestures while leaving the council visible. Hidden pages stop rendering; context restoration uses the latest state. Without WebGL, the existing CSS fallback displays three static provider-coloured forms and the textual progress panel continues normally. The accessible description names seat positions and the actual active member, so colour is never the sole indication.

## Verification

- `scripts/metabloom-council.test.cjs`: real adapter requests with fictional providers, round isolation, default resolution, auth/origin/body gates, quota, cancellation, bounded envelopes and failure handling.
- `MetabloomCouncil.test.js`: automatic/manual routing, disclosure, streamed speaker status, Stop and late results, final discussion rendering.
- `metabloomCouncilClient.test.js`: ordered stream completion, interruption, duplicate/oversized records and cancellation.
- `metabloomCouncilScene.test.js`, `CreatorOSActivityTransition.test.js`, avatar/model-picker/sidebar tests: native styling restoration, bounded seat transitions, actual speaker/chair routing, single-context/draw ownership, expression controls, hidden/pause/reduced-motion behavior and context recovery.
- `scripts/verify-council-orbs.mjs`: native WebGL compilation and rendered seat colours for desktop/mobile, light/dark and all four finishes; registered beside the built council browser fixture in functional CI.
- Full existing API and React suites, lint and production build.

Deterministic tests establish the execution contract, not the quality of agreement or live provider reliability. No live council has been submitted as part of implementation verification.

Implementation validation passed: 503 API tests, 2,518 UI tests across 241 suites, lint and production build. The full UI suite was run in groups to fit runner memory. The desktop/mobile browser verification script is registered in functional CI, but its local execution was blocked by the runner's Chromium socket restrictions. Visual behavior and live-provider reliability remain unverified by this implementation run.

## Completed-response validation incident

Production request `d71f5cd5daed` completed four contributions before rejecting DeepSeek's critique. Provider logs recorded a completed response with 316 output tokens, below the 2,200-token allowance; the request ended after 16,607 ms, below its 150-second deadline. This establishes a host-side answer-validation failure, not token exhaustion or timeout. The original logging did not preserve the validation subtype or raw answer, so the exact defect cannot be recovered. The 450-character critique cap is a likely cause, alongside JSON/field formatting.

Correction regression tests reproduce completed overlength text at that same fifth step, as well as invalid JSON, wrong fields, empty text and unsupported citations. The host now logs only the fixed validation reason, provider/model, round/index, attempt, response character count and limit. No prompt, peer text, rejected text or private reasoning is logged. The built desktop/mobile browser fixture includes the fifth-step correction, checks its visible status and quota charge, and saves its screenshots as functional CI artifacts.

Correction validation passed: 541 API tests, 2,543 UI tests across 243 suites, client/server lint and production build. The new browser scenario could not run locally because Chromium's socket creation was denied by the runner. This fix has not been verified against live provider generations or a deployment.

## JSON-generation dependency removed

On November 17, production request `06dcd844c562` failed during DeepSeek's opening. Both completed responses failed JSON parsing (`council_json`), with raw lengths of 342 and 316 characters against a 400-character limit. They used 188 and 149 output tokens respectively; the request ended after 10,170 ms. This failure was malformed or blank JSON, not length, token exhaustion or timeout. Retrying the same JSON requirement did not resolve it.

Council needs one string per contribution, so the model no longer generates its own JSON wrapper. The host now owns that serialization and still validates nonempty completed text, per-round character limits, citations and native output types before sharing or saving it. The fixed speaker/round sequence, strict browser stream decoder, correction quota and cancellation remain in force. No invalid JSON is salvaged or parsed permissively.

DeepSeek documents both [native text mode](https://api-docs.deepseek.com/api/create-response/) and [completed blank content in JSON mode](https://api-docs.deepseek.com/guides/json_mode/). The production logs do not establish whether these particular responses were blank, because raw content was intentionally not logged. Regression fixtures cover the documented blank-JSON behavior synthetically, enforce text-mode requests through all three real adapters, and verify quoted text, line breaks and JSON-looking prose remain literal data through stream and saved-thread validation. Claude's optional [output format](https://platform.claude.com/docs/en/api/http/messages) is omitted only for text requests; existing structured chat/tool tests remain required.

Text-mode validation passed: 544 API tests and the full UI suite (2,554 tests across 245 suites). The concurrent answer-photo update was then incorporated, its 26 media tests passed, and lint plus the production build passed on the combined tree. The updated browser fixture still cannot launch Chromium because runner socket creation is denied. No live provider generation or deployment verification was performed for this change.
