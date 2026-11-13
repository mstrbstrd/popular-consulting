# Metabloom expression loop

## Goal and scope

Let the ordinary conversation model deliberately choose the Orb's existing body
language and inspect a bounded report from the browser. This implements the
first expression loop discussed on 2026-11-13. The model can demonstrate an
expression instead of incorrectly denying all influence over the interface.
The renderer, native visual tools, saved artifacts and provider adapters remain
the foundation. This change does not grant application editing or account access.

## Invariant-led execution plan

| Invariant | Enforcement | Required evidence |
| --- | --- | --- |
| Described capabilities equal enabled capabilities. | A shared expression registry derives the enum and descriptions from the existing emote catalogue. Only negotiated ordinary turns receive the tools; a server kill switch and the user's preference can remove the action. | Tool inventory and capability-prompt tests, including disabled and cached clients. |
| Intent is semantic and bounded. | `express_orb({ emote })` accepts exactly one existing primitive or authored chain, at most once per turn inside the existing four-call budget. No shader, duration, intensity, script, URL or arbitrary sequence is accepted. | Unknown values, extra keys, duplicate attempts and budget tests. |
| One owner chooses the final gesture. | An accepted model choice overrides the response Jev decision. Jev still selects input/default reactions. | API test proves the explicit choice survives and no second selector overrides it. |
| A queued choice is not a visible result. | The tool returns `queued` and `display: unconfirmed`. The negotiated stream identifies its source and request. Only validated terminal completion releases the gesture. | Decoder tests for partial, mismatched, duplicate, stale and failed streams. |
| The human controls motion. | Playback checks current pause, page visibility, background and model-expression preference. Reduced motion uses the existing static final pose. Settings can interrupt active playback. | React tests for pause, hidden page, disabled expression, reduced motion and changes during a chain. |
| Previous work cannot mutate a new turn. | Existing request generation and cancellation own the cue and its observation. Reset/navigation remove transient observations; restored chats never replay them. | Replacement, stop, reset, unmount and saved-state tests. |
| Feedback describes only observed runtime state. | `get_orb_state()` reads a strict, bounded browser snapshot captured for this request, including the last expression receipt. Applied/finished refer to runtime scheduling, not pixels seen by the human or task success. | Parser tests and an end-to-end follow-up that receives the actual prior receipt. |
| Client observations are not authority. | Snapshot fields are fixed booleans, enums and bounded identifiers; unknown fields fail validation before paid work. They cannot supply tools, prompts, endpoints, credentials or permissions. | Malformed/injected context, auth/origin and source-isolation tests. |
| Expression does not block the answer. | The response is still one validated answer. No animation completion wait, extra model continuation or deadline extension is introduced. | Open-stream and completion tests; current absolute budgets remain. |
| Providers and old clients retain their stream contracts. | The existing function-call adapters handle OpenAI, Claude and DeepSeek. `X-Metabloom-Expressions: 1` opts into additive metadata; unnegotiated clients keep the existing event vocabulary. | Provider continuation fixtures, cached-client regression suite, lint and production build. |

1. Add the shared catalogue, strict context/receipt/event parsers and tool definitions.
2. Add the two tools to ordinary chat and make capability guidance truthful.
3. Connect negotiated metadata through the API and decoder, retaining terminal validation.
4. Apply request-owned cues in the browser, expose the latest receipt in More,
   and make the model-expression preference editable and restorable.
5. Run unit, API, provider and React regressions, lint, build and browser checks.
   Commit and push the feature branch, verify the remote SHA, and report checks.

## Feedback semantics

`get_orb_state()` is a snapshot from the start of the current request. Its values
are browser-reported observations, not independently verified server state.
`express_orb` schedules a response gesture; it does not wait for a browser round
trip. The next user turn carries the latest receipt, without an extra paid model
call or a background task. Mid-turn visual completion is deliberately not claimed.

Receipts distinguish runtime application, finished scheduling, a reduced-motion
pose, suppression and interruption. They contain no conversation text. They are
held only in the mounted conversation, never stored as evidence in durable chat
history. A completed sequence does not prove the user saw it, and an expressive
gesture does not prove factual certainty, tool success or consciousness.

The existing artifact-selection context remains the source for selected chart
values and calculator scenarios. Whole-page DOM access, arbitrary component
editing and persistent project memory require their own ownership/version
contracts; they are not implicitly authorized by this expression channel.

## Rollout and verification

Server setting `METABLOOM_EXPRESSIONS_ENABLED=false` disables the new tools and
metadata without disabling ordinary chat. No new credential or database is
required. Existing cached clients remain on the old contract. The user's
model-expression preference is stored with the existing conversation settings;
old snapshots default to enabled. A cached client predating this preference must
refresh before opening a newly saved snapshot containing it: older strict
snapshot readers reject the unfamiliar field instead of silently losing the setting.
All live provider work keeps the existing auth,
origin checks, quota, deadline, output validation and safe logging boundaries.

### Verification record, 2026-11-13

Story: send an ordinary chat message, let the selected model choose a bounded
gesture, validate the answer and metadata, apply the gesture under current user
settings, and carry the actual runtime receipt into the next user turn.

| Boundary | Evidence |
| --- | --- |
| Model capability and host execution | `node --test scripts/metabloom-api.test.cjs scripts/metabloom-agent.test.cjs scripts/metabloom-agent-api.test.cjs scripts/metabloom-expression.test.cjs scripts/metabloom-models.test.cjs scripts/metabloom-stream.test.cjs scripts/jev-reaction.test.cjs scripts/metabloom-thread-client.test.cjs scripts/metabloom-threads-api.test.cjs`: **157 passed**. Includes all three provider continuations, argument bounds, quota/deadline regressions, terminal validation, old-client negotiation and kill switch. |
| Full React regression | `CI=true npm test -- --watchAll=false --runInBand`: **236 suites, 2,460 tests passed** before the final two regression additions below. |
| Final client and playback changes | `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/MetabloomExpressionIntegration.test.js src/components/metabloomApiClient.test.js src/components/OrbSection.test.js`: **3 suites, 42 tests passed**. Includes the two added checks for expression transport and pausing a manual sequence. |
| Static checks | `npm run lint`, explicit Node ESLint for the changed API/agent/test, and `git diff --check`: **passed**. |
| Production packaging | `CI=true npm run build`: **passed**, including route HTML generation and isolated-invoice private-content checks. |
| Browser rendering | **Unconfirmed.** Connected Chrome could not reach the workspace's loopback fixture (`ERR_CONNECTION_REFUSED`). No live chat was submitted or changed during this implementation. |

The expression suite is registered in the existing functional CI workflow;
React coverage is already included by its full-suite step. The build emitted
the existing outdated Browserslist-data notice, and the full React run emitted
non-failing React `act` warnings. No new dependency was installed or added.

Two actual playback defects were fixed during verification: network completion
must not invalidate a reply's remaining chain steps, and automatic focus/thinking
or a pending manual sequence must not resume a paused Orb. Receipt restoration
was checked using the real saved-thread parser with the test environment's
required TextEncoder polyfill.

Deterministic fixtures establish the contract, not live provider behavior or
gesture quality. Live API keys were not used. Production rendering and live
model selection of gestures remain rollout checks. Initial delivery was a feature
branch for review. The user subsequently authorized merging to main and requested
the system-prompt audit below.

## System-prompt audit before main

The prompt is part of the feature contract, not an independent personality layer.
Its allowed claims, choice of medium and interpretation of results must agree
with the tools supplied for that specific turn.

| Prompt boundary | Updated behavior |
| --- | --- |
| Shared live chat (`buildMetabloomChatSystemPrompt`) | Use available tools before the final response schema. Express a viewpoint through concrete ideas and demonstrations. Adapt to requests for candor without a personality pitch or routine AI disclaimer. Correct previous capability denials when the current inventory contradicts them. |
| Ordinary agent (`runMetabloomAgent`) | Explain the actual enabled tool inventory, including unavailable visuals and the distinction between user-declined search and unavailable search. State explicitly when the four-call budget is exhausted. |
| State and expression tools | Read state when a question depends on presentation or prior playback; do not poll a fixed snapshot. Interpret every receipt state, including null, without treating runtime scheduling as proof of human perception. Do not work around user pause or accessibility settings. |
| Provider adapters | OpenAI, Claude and DeepSeek receive the same behavioral and receipt guidance through their existing instruction transports. Provider fixture tests inspect the assembled instructions, not only the standalone prompt builder. |
| Legacy schema adapter (`metabloomProtocol.json`) | Permit relevant discussion of the Orb and schema-selected emotes. Remove the obsolete ban on mentioning the avatar and the independent-message instruction. Do not imply that this adapter has ordinary-chat function tools. |
| Research and visual continuations | Keep their existing evidence and display contracts. A non-tool writing step does not inherit direct expression tools. A selected scene is a presentation metaphor, not access to actual model internals. |

Prompt tests cover the original capability-denial regression, enabled and disabled
tools, unavailable configuration, user restrictions, provider instruction
transport, and budget exhaustion. These checks establish instruction consistency;
they do not prove that every live model will follow every instruction or choose
the best expression.

Post-audit validation: the same Node contract command above passed **159 tests**;
the full React command passed **236 suites and 2,463 tests**. Frontend lint,
changed Node-file lint, `git diff --check`, and the production build also passed.
Live-provider evaluation and deployed visual verification were not performed.
