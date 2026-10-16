# Metabloom decision and activity mappings

`metabloomDecisionMap.json` is the authored mapping for emotional reactions,
request-owned presentation actions, and confirmed external activity. Live
conversations use two server-side Jev requests: an input decision and a reaction
to the verified complete OpenAI reply. The input request can ask independent
reaction and action questions together. Legacy demos/adapters retain the
original reaction schema. Presentation actions use the current chat backend;
the repository does not run a web-research worker. External activity callbacks
remain integration points for actual worker lifecycles.

## Response choices

The fourteen primitive choices remain available. Four additional enum values
expand into deterministic sequences:

| Choice | Acting sequence | Use when |
| --- | --- | --- |
| `support-and-reassure` | Concerned → Reassuring | Acknowledge a difficulty, then offer grounded support |
| `explore-and-consider` | Curious → Reflective | Open a possibility, then weigh it |
| `consider-and-resolve` | Reflective → Resolute | Consider evidence, then reach a recommendation |
| `celebrate-and-appreciate` | Celebratory → Warm | Recognize progress, then express warmth |

Both live Jev prompts favor a decisive, contextual expression during ordinary
conversation as well as emotional moments. Questions can invite curiosity,
detailed requests attentive listening, and uncertainty reflection. Neutral is
reserved in the instructions for deliberate stillness. Authored chains are
appropriate when both stances are present; their meaning cannot imply certainty
or task success beyond the actual conversation. The input phase acknowledges
the user without anticipating the answer, while the response phase expresses
the completed assistant reply. State text cannot override these instructions.

The legacy adapter wire format remains version `1.0.0`; live two-stage Jev
reactions use [protocol 2.0.0](metabloom-emote-protocol.md):

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
`reactionQuestion` property for external adapters. The server additionally
uses `METABLOOM_INPUT_REACTION_QUESTION` for pre-response acknowledgement.
The built-in endpoint calls `https://api.typesafe.ai/v1/systemone` with
`JEV_MODEL` and the server-only `TYPESAFE_API_KEY`; the browser never sees a key.

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
reviewed examples, not a calibrated probability of correctness. Both live Jev
phases use this gate. More expressive prompt wording does not change the
threshold, the 950 ms input and 1,200 ms response timeouts, or the existing
neutral fallbacks for invalid, unavailable, or timed-out decisions. The chat
provider generates text only.

Official TypeSafe references: [Choice](https://docs.typesafe.ai/primitives/choice)
and [Confidence](https://docs.typesafe.ai/confidence).

## Request-owned action choices

Jev's input call can select a scene independently of its emotional reaction:

| Action choice | Entry sequence | While the reply streams | Successful completion |
| --- | --- | --- | --- |
| `none` | Ordinary conversation | Existing Orb presentation | Existing final reaction |
| `deep-research` | `think` → `deep-research-diving` | Hold Tidal Weave and the diving state | `deep-research-surfacing`, then return to Metabloom |
| `under-the-hood` | `think` → `under-the-hood-opening` | Hold the Forward Pass reveal | `under-the-hood-closing`, then return to Metabloom |

`METABLOOM_ACTION_QUESTION` asks about the latest user's intent. A genuine request
for a deep dive can select research; a playful request for a trick or a look
under Metabloom's hood can select the reveal. Quoted commands, declined research,
ordinary questions, and literal vehicle-hood questions do not request a scene.
The independent action resolver requires a known choice and finite confidence
from 0.7 to 1; invalid or uncertain action answers become `none` without erasing
a valid emotional reaction.

The live client sends `actionMode: "auto"` by default. This adds `questions.action`
beside `questions.reaction` in the existing input Jev request. TypeSafe supports
[multiple Choice questions in one call](https://docs.typesafe.ai/primitives/choice#good-practice-ask-more-than-one-question-per-call),
so the turn still uses two Jev requests; the extra question consumes tokens.
The **Deep Research** toggle sends `actionMode: "deep-research"` and allows
separate paragraphs. Explicit modes (`none`, `deep-research`, `under-the-hood`)
take precedence, omit classification, and survive Jev failure. Omitting
`actionMode` retains the older reaction/text-only stream.
The toggle also selects the research presentation for local demos and an
unconfigured endpoint's demo fallback; their authored content and preview
source labels remain intact, without provider calls.

An opted-in server emits one `{ "type": "action", "action": "deep-research" }`
record after the input emote and before text. `request.onAction(action)` receives
the selected ID. The existing successful terminal response closes the selected
scene; Jev cannot declare completion or control arbitrary shaders, timings, or
playlists. The first text delta and complete paragraphs do not close this mode.
Text remains immediate while entry and exit animations run.

Scene timers belong to one request. Stop, error, timeout, replacement, reset,
deactivation, unmount, or hiding the document clears them without a successful
surfacing cue. A reply that finishes before entry cannot reopen the scene later.
Reduced motion presents the selected scene directly. Timed menu previews remain
independent, and an action choice does not extend provider or UI timeouts or
claim that an external worker or web search ran.

## Confirmed work selects the scene

| Activity | Scene | Presence label |
| --- | --- | --- |
| `idle` | Metabloom | Here with you |
| `deep-research` | Tidal Weave | Researching |
| `analysis` | Contour Drift | Analyzing |
| `writing` | Metabloom | Writing |

External worker activity is not inferred from an emotional or action choice.
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

Research displays **Diving deep...** with a text shimmer and staggered ellipsis.
A confirmed completion or first reply segment changes it to **Surfacing...**,
holds Tidal Weave for a 650 ms lead, then retains the cue through the 1.2-second
return blend. Duplicate completion signals cannot restart the cue. Reply text
and reaction playback remain immediate, and the transient status never enters
conversation history. Reduced motion removes the shimmer/dot animations and
skips the return-blend wait. Preview status remains explicitly labeled.

Errors, cancellation, reset, a new request, deactivation and unmount immediately
clear the presentation timers and restore Metabloom without a completion cue.
A newer activity also cancels any pending return. Confirmed activity permits
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
The latter shows the diving state for four seconds, then the surfacing cue and
return blend, with an explicit preview label. It neither creates a message nor
calls a service. These selections close the
panel and restore focus to its toggle so the scene stays visible.

Tests cover provider selection and streaming of a chain, paced and reduced-motion
playback, strict decisions, correlated activity, lifecycle cleanup, stale events,
the absolute timeout, local previews, and reuse of the single field. Visual
review remains with the owner for this iteration.

Rollback: revert this feature commit. There are no migrations, new credentials,
new dependencies or deployment-setting changes.
