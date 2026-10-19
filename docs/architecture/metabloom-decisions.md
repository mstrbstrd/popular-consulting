# Metabloom decision and activity mappings

`metabloomDecisionMap.json` is the authored mapping for emotional reactions,
request-owned presentation actions, and confirmed external activity. Live
conversations use two server-side Jev requests: an input decision and a reaction
to the verified complete OpenAI reply. The input request can ask independent
reaction and action questions together. Legacy demos/adapters retain the
original reaction schema. Live Deep Research uses the current backend to perform
bounded OpenAI web research before writing a cited reply. Local previews remain
authored demonstrations. External activity callbacks remain integration points
for other worker lifecycles.

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
duration, intensity scaling and recovery. Emote playback does not delay text;
the research scene has its own display gate described below. The queue
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

| Action choice | Entry sequence | Text presentation | Return timing |
| --- | --- | --- | --- |
| `none` | Ordinary conversation | Existing Orb presentation | Existing final reaction |
| `deep-research` | `think` → `deep-research-diving` | Buffer incoming text, then reveal it progressively after surfacing finishes | First answer content requests `deep-research-surfacing`; the return completes before the first visible text |
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
The **Deep Research** toggle sends `actionMode: "deep-research"`, runs real web
research when the endpoint is configured, and allows separate paragraphs.
Automatic mode can also select research for investigation or sourced current
facts. Explicit modes (`none`, `deep-research`, `under-the-hood`)
take precedence, omit classification, and survive Jev failure. Omitting
`actionMode` retains the older reaction/text-only stream.
The toggle also selects the research presentation for local demos and an
unconfigured endpoint's demo fallback; their authored content and preview
source labels remain intact, without provider calls.

An opted-in server emits one `{ "type": "action", "action": "deep-research" }`
record after the input emote and before text. `request.onAction(action)` receives
the selected ID. Jev cannot declare completion or control arbitrary shaders,
timings, or playlists.

Research presentation follows **think, dive, surface, reveal**. The first
arriving response content requests surfacing. Content that arrives during entry
waits for the thinking lead and dive transition first. The UI continues to read
and validate provider output throughout the 650 ms surfacing cue and 1.2-second
return blend. It withholds the answer until the return finishes, then reveals
the buffered prefix progressively in one chat bubble. New provider text keeps
extending that reply. A fast completed response therefore cannot appear as one
large dump at the end of the animation. The final response emote and visible
completion follow the displayed text; terminal completion cannot surface twice.

This research return means that answer content is ready to present. It does
not assert successful research or provider completion. Under the Hood retains
its separate behavior: text appears during the held reveal, and successful
terminal completion starts closing it. Ordinary conversation remains immediate.

Scene timers and buffered presentation belong to one request. Stop, error,
timeout, replacement, reset, deactivation, and unmount discard unpublished text and retain
only an already-visible incomplete prefix. A hidden page skips the current scene
and releases its display gate without aborting the request. Received evidence and
the answer remain attached to the same session; the skipped scene cannot restart
when the tab returns. Navigation away, unmount and explicit Stop still cancel work. Reduced
motion presents the selected scene directly and retains a brief static surfacing
cue before revealing text. Timed menu previews and external worker activities
remain independent. Provider deadlines and semantic response limits still apply.

## Response model's scene awareness

`buildMetabloomChatSystemPrompt` supplies the text model with the selected
presentation: Conversation, Deep Research, or Under the Hood. It explains the
Orb's separate nonverbal role, the timing of the first visible text, and the
difference between an illustrative scene and actual model internals or browsing.
The voice is a considerate, capable companion with curiosity, delight in
discovery, and light whimsy. Ordinary turns default to one to three short,
natural sentences with the answer or useful thought first. Requested depth,
accuracy, and safety can justify more detail. Each paragraph must carry a
distinct point; stock preambles, filler, repeated greetings, recaps, and automatic
follow-up offers are discouraged. Serious or painful moments receive calm,
direct care. Natural references to the Orb are appropriate when relevant to
the user's request; raw action IDs, theatrical stage directions, and invented
claims about what the user saw are not.

Automatic mode waits for the existing bounded input Jev decision before
constructing the response-model prompt, so the model receives the validated
selected scene or `none` fallback. This adds at most the existing 950 ms decision
wait before OpenAI starts; it does not add a Jev call. Explicit modes already
know the scene and keep ordinary writing parallel with input reaction selection.
Deep Research first emits the input reaction and selected action, then announces
searching and starts its bounded web pass. Legacy
requests without action capability use Conversation context and retain that
parallel path. The prompt describes the intended presentation because reduced
motion, cancellation, or rendering fallback may simplify it.

## Live web research

`server/metabloomResearch.js` performs a streamed Responses request with the
`web_search` tool, required tool use, medium reasoning, `max_tool_calls: 6`,
and at most 10,000 output tokens including reasoning. The pass searches and can
follow up on evidence within that budget. It prefers primary sources, checks
dates and disagreements, and returns a compact research brief. The model is
`METABLOOM_RESEARCH_MODEL`, falling back to `METABLOOM_OPENAI_MODEL` and then
`gpt-5-mini`. Both passes use the existing server-only `OPENAI_API_KEY`.
The selected model must support Responses web search and reasoning. The optional
research model setting can change research independently of ordinary chat.
The provider's processed-call budget is distinct from its returned output records.
A production response returned seven web-tool records for a six-call budget.
Parsing uses independent byte bounds and does not reject a valid completed brief
merely because its tool-record count exceeds six. Failed attempts
can coexist with a completed search and usable cited evidence. No automatic retry
or increase to the provider's tool or token budget is introduced.

Only a completed response containing an actual completed search and usable URL
annotations can produce a report. A normalized report is bounded to 1 MiB of
serialized UTF-8 JSON, independently of the short answer. Completed provider
objects and individual SSE events have an 8 MiB emergency limit, while the total
provider SSE transport is bounded to 32 MiB. These resource protections are not
spending controls: generated tokens and searches can already be billable when
an application parser rejects them. Unavailable usage is logged as null.
The unused `web_search_call.action.sources` inclusion is omitted to reduce
redundant response metadata. All distinct annotated sources receive consecutive
source IDs within the report byte bound, without an eight- or 64-source cutoff.
Unannotated URLs in model text or the wider consulted
source list cannot manufacture a citation. Titles and URLs have shared server
and browser validation; only absolute HTTP(S) links without credentials are
rendered. Provider annotation ranges attach source IDs to the research notes;
those offsets are never reused on the rewritten answer.

Opted-in clients receive the full validated report before the short writer starts.
Its text and full source map remain separate from the normal answer and are
available through **Full research**, including when the later writer fails.
The strict-schema writer receives at most 16,000 characters of whole
passages using the first eight source IDs as untrusted evidence, with the actual
user question last. Passages referring to sources outside that table are omitted
from this writer view, while remaining intact in the full report. When the view
is selective, the writer is told not to imply exhaustive coverage. If no whole
cited passage fits, the app supplies a short report introduction without another
model request. Cached clients receive only the established short-answer protocol.
The writer retains its 6,000-token output ceiling
and low reasoning in research mode. Its complete answer must validate, contain
at least one source ID, and contain no unknown numeric citation IDs before any
answer text is published. The browser turns known `[1]` markers into inline links
and lists the sources below the completed answer. Citation validation establishes
provenance and valid IDs; it does not mechanically prove every factual claim.

Research metadata follows `searching`, `sources`, then `synthesizing`, before the
existing text records. Bounded `research_progress` records may update the current
summary between confirmed search start and answer text: actual search queries,
checked domains, completed searches, and the validated source count for writing.
These summaries come from provider tool events, not private reasoning or timers.
At most 24 summaries of 200 characters are accepted, replacing the previous one.
These events update status without surfacing the Orb.
Answer content starts the established return and progressive reveal. If the
writer fails after report delivery, the completed report can independently start
that return. Source metadata belongs to the reply session, follows the same display gate, and cannot
leak from a cancelled or superseded request.

The search pass has a 120-second deadline. Writing has at most 45 seconds, within
an absolute 175-second backend budget. Vercel permits 180 seconds for this one
endpoint. The browser's two request deadlines extend to 210 seconds from their
original start only after confirmed `searching`; repeated activity cannot extend
them. Ordinary chat keeps its 25-second provider and 30-second browser limits.
Stop, disconnect, timeout, refusal, incomplete output, missing search evidence,
or invalid citations stop the flow without a successful `done` record or a demo
replacement. Existing session authorization, same-origin checks and atomic quotas
run before billable work. Research adds bounded search and synthesis costs to the
same request quota. Diagnostics contain safe outcome/error identifiers, failure
stage, duration, usage counts, requested tool budget and returned tool-record
count. A random 12-character hexadecimal `requestRef` ties the UI and response
header to the server log. Provider HTTP status, allowlisted provider error code
and parameter, and provider request ID are retained only in server logs. Raw
provider error messages, prompts, source URLs and search queries are not logged.

Official API contracts: [web search](https://developers.openai.com/api/docs/guides/tools-web-search),
[reasoning token accounting](https://developers.openai.com/api/docs/guides/reasoning),
[pricing](https://developers.openai.com/api/docs/pricing),
[Responses limits](https://developers.openai.com/api/reference/ruby/resources/responses/methods/create),
and [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

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
