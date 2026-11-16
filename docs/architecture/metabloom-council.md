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

Before sending, the UI explains that council uses seven model calls, shares the bounded conversation across the three providers, and has no live search. It deliberates on supplied text. Attached artifact/research references require removal and relevant text supplied in the question; they are never silently ignored or converted into cross-account access. Live browsing, external actions, expression tools, generated visuals, iterative/unbounded debate and automatic retries are outside this version.

## Structural invariants

| Invariant | Enforcement |
| --- | --- |
| Every seat is the account's actual default. | Authenticated account identity loads one preference snapshot. All three catalog resolutions finish before quota/generation. `default` and `latest` become concrete IDs once. Client-supplied rosters, endpoints or model overrides are rejected. |
| No silent replacement or fabricated member. | Missing preferences, unavailable providers or rejected models stop the request. No reduced two-member council, provider fallback or demo reply. |
| Critiques have equal context. | Three openings share identical inputs; all critiques see exactly those three openings. Synthesis sees all openings and critiques. Private reasoning is neither forwarded nor displayed. |
| Work is finite and quota-accounted. | Exactly seven sequential generations maximum, no tools or retries. Seven units are reserved atomically against the existing per-client and project-wide quota. Contributions are bounded to 400/450/1100 characters. |
| Progress reflects real execution. | The host awaits each running event before its model request; complete requires validated public output. A shared ordered decoder rejects duplicates, missing starts, unexpected fields, invented citations and premature completion. |
| Stop owns the whole request. | One 150-second server deadline and 165-second client deadline; no progress renewal. The same abort signal covers preferences, catalog, quota and all generations. Browser request ownership rejects late events. |
| Failure is not consensus. | A failed member ends the discussion without synthesis or `council_done`. Completed contributions remain visibly provisional in the current view. They are not committed as a successful saved answer. |
| Conversation survives normal storage. | The final discussion fits the existing four-segment, 1600-character-per-segment and 4800-character-total validators even with maximum-length model IDs. It is saved through the existing thread lifecycle, with no new database schema. |
| Text is data. | Peer contributions are explicitly untrusted. No model output can name a new tool, call another member, change rounds or select a model. React renders contributions as text, not HTML. |

The progress panel uses native expandable details, polite status updates, normal document flow and existing Stop behavior. It does not move focus. After success, the ordinary saved chat reply includes the entire bounded discussion and synthesis. Partial discussions remain transient and labelled incomplete after failure or Stop.

## Verification

- `scripts/metabloom-council.test.cjs`: real adapter requests with fictional providers, round isolation, default resolution, auth/origin/body gates, quota, cancellation, bounded envelopes and failure handling.
- `MetabloomCouncil.test.js`: automatic/manual routing, disclosure, streamed speaker status, Stop and late results, final discussion rendering.
- `metabloomCouncilClient.test.js`: ordered stream completion, interruption, duplicate/oversized records and cancellation.
- Full existing API and React suites, lint and production build.

Deterministic tests establish the execution contract, not the quality of agreement or live provider reliability. No live council has been submitted as part of implementation verification.

Implementation validation passed: 503 API tests, 2,518 UI tests across 241 suites, lint and production build. The full UI suite was run in groups to fit runner memory. The desktop/mobile browser verification script is registered in functional CI, but its local execution was blocked by the runner's Chromium socket restrictions. Visual behavior and live-provider reliability remain unverified by this implementation run.
