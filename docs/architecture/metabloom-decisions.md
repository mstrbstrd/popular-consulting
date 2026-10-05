# Metabloom decision and activity mappings

`metabloomDecisionMap.json` is the authored mapping. It separates expressive
choices about a response from confirmed agent activity. The existing chat
provider can select the new reaction chains immediately through its shared
prompt and schema. The repo does not yet call Jev or run a deep-research worker.
The decision question and activity callbacks are integration points for that
orchestrator, not a claim that those services are connected.

## Response choices

The fourteen primitive choices remain available. Four additional enum values
expand into deterministic sequences:

| Choice | Acting sequence | Use when |
| --- | --- | --- |
| `support-and-reassure` | Concerned → Reassuring | Acknowledge a difficulty, then offer grounded support |
| `explore-and-consider` | Curious → Reflective | Open a possibility, then weigh it |
| `consider-and-resolve` | Reflective → Resolute | Consider evidence, then reach a recommendation |
| `celebrate-and-appreciate` | Celebratory → Warm | Recognize progress, then express warmth |

Prefer one primitive unless both stances are present. The decision is about the
meaning of the assistant's response, not keyword matching in the user's prompt.
A chain does not imply certainty or success beyond the response text.

The wire format remains version `1.0.0`:

```json
{"version":"1.0.0","segments":[{"emote":"support-and-reassure","response":"That sounds difficult. We can take it one step at a time."}]}
```

The client expands the selected choice. Each beat retains the existing authored
duration, intensity scaling and recovery. Text appears immediately. The queue
admits up to eight beats including the playing beat, enough for four two-step
paragraphs. Admission is atomic, so a rejected chain never partially plays.
Neutral settles immediately. Reduced motion or a hidden document uses only a
chain's final stance without building a queue. A new request, Stop, Reset,
deactivation or unmount cancels all remaining beats. Paragraph replay repeats the
same chain without modifying the transcript or making another model call.

## Jev-compatible choice question

`metabloomDecisionMapping.js` exports a CommonJS question definition usable in a
server adapter, plus a strict normalized-decision schema. The same metadata is
available at `window.__metabloomProtocol.reactionQuestion` and on each request's
`reactionQuestion` property. No new runtime dependency or client credential is
needed.

The question has Jev's `type: "choice"`, `instructions` and `criteria` shape.
Use it as `questions.reaction` alongside the relevant conversational `state`
and a configured `model` in a server-side Jev request. Jev's raw answer contains
additional metadata; normalize only the two accepted fields before resolving:

```js
const { METABLOOM_REACTION_QUESTION, resolveMetabloomDecision } =
  require("./src/components/metabloomDecisionMapping");

// In your server adapter: provide the question to your configured Jev client.
const questions = { reaction: METABLOOM_REACTION_QUESTION };
// After that client returns, extract from result.answers.reaction:
const emote = resolveMetabloomDecision({
  choice: answer.choice,
  confidence: answer.confidence,
});
```

`resolveMetabloomDecision` accepts a known choice with finite confidence from
0.7 through 1. Unknown choices, missing or extra fields, and lower confidence
return `neutral`. The 0.7 threshold is an application heuristic to tune against
reviewed examples, not a calibrated probability of correctness. This optional
confidence gate applies to a decision adapter; the current chat provider
continues to choose directly from the strict emote enum in one generation.

Official TypeSafe references: [Choice](https://docs.typesafe.ai/primitives/choice)
and [Confidence](https://docs.typesafe.ai/confidence).

## Confirmed work selects the scene

| Activity | Scene | Presence label |
| --- | --- | --- |
| `idle` | Metabloom | Here with you |
| `deep-research` | Tidal Weave | Researching |
| `analysis` | Contour Drift | Analyzing |
| `writing` | Metabloom | Writing |

Activity is not inferred from an emotional choice or the words “deep research.”
The worker adapter reports `running` only after its actual job starts. Activity
events contain exactly `{ activity, state }`, where state is `running` or
`complete`; callers cannot supply arbitrary shader modes or initiate work via
this visual API.

The existing `window.__metabloomRequest(request)` adapter receives:

- `request.onActivity(event)`: report confirmed activity for this request.
- `request.onSegment(segment, index)`: publish a validated paragraph as before.
- `request.signal`: abort the associated transport and worker on cancellation.
- `request.reactionQuestion` and `request.resolveDecision`: optional decision
  adapter helpers.

Lifecycle example inside an existing adapter, with `request` supplied by `/orb`:

```js
// After the research worker confirms it has started:
request.onActivity({ activity: "deep-research", state: "running" });

// After the worker completes, before final response composition:
request.onActivity({ activity: "deep-research", state: "complete" });

// Publish the worker's real result through onSegment and resolve the adapter
// with the matching final envelope. Always pass request.signal to its transport.
```

Event-based integrations must first claim the existing
`metabloom:user-message` event, then use its detail's callbacks. An integration holding
the current request ID can also call
`window.__metabloomProtocol.reportActivity(requestId, event)`. Both routes reject
stale IDs, closed requests and events after the first response segment. A late
completion for research cannot clear a newer analysis activity.

The first reply segment, normal completion, error, cancellation, reset, new
request, deactivation and unmount restore Metabloom. Confirmed activity permits
an absolute five-minute UI request lifetime measured from request creation;
heartbeats cannot extend it. Activity completion restores the ordinary 30-second
response timeout, capped by the absolute deadline. This does not extend the
existing HTTP provider's timeouts; long jobs need an actual external adapter
and worker lifecycle.

Scene changes reuse the existing `CreatorOSFieldCanvas` and its native Tidal
Weave / Contour Drift shaders. Orb opts into a program containing only its three
activity scenes, so theme changes preserve the program, seed, animation clock,
canvas and cadence. Other field pages retain their single-scene specialization.
Visible scene weights blend over 1.2 seconds with eased endpoints. Interruptions
retarget from the current mixture, including a third activity or an early return
to Metabloom. Premultiplied color blending avoids dark fringes around transparent
edges; the CSS scene backdrops follow the same weights. Only nonzero scenes are
sampled, returning to one scene after the transition finishes.

No second canvas or animation loop is mounted. The original Metabloom finish and
avatar pose remain available through the blend. Reduced motion and paused or
resumed hidden tabs settle directly on the requested scene. Context loss clears
the blend styles and suspends drawing until the renderer recovers. The CSS
fallback uses opacity transitions with reduced-motion overrides. Native graphics
budgets remain authoritative. The decorative landing title and subtitle have
been removed; the chat retains its accessible heading, composer and status.

## Review and rollback

The Reactions menu includes the four chains and **Preview research scene**.
The latter shows Tidal Weave for four seconds with an explicit preview label;
it neither creates a message nor calls a service. These selections close the
panel and restore focus to its toggle so the scene stays visible.

Tests cover provider selection and streaming of a chain, paced and reduced-motion
playback, strict decisions, correlated activity, lifecycle cleanup, stale events,
the absolute timeout, local previews, and reuse of the single field. Visual
review remains with the owner for this iteration.

Rollback: revert this feature commit. There are no migrations, new credentials,
new dependencies or deployment-setting changes.
