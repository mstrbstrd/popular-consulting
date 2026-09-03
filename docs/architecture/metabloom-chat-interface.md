# Metabloom Chat Interface

## Purpose

`/orb` is a model-facing chat surface where the original Metabloom field fills the viewport and acts as the assistant's nonverbal expression layer. The conversation remains readable in a conventional minimalist chat overlay.

The renderer and chat are separate concerns:

1. `CreatorOSFieldCanvas` renders one full-page Metabloom field.
2. `MetabloomAvatar` maps a bounded action vocabulary into the existing seven-body shader.
3. `OrbSection` renders plain-text chat messages and executes validated action chains.
4. A model adapter supplies one JSON object containing exactly two fields.

The chat overlay never creates a second avatar body, clips the field into a card, or mounts another WebGL renderer.

The visible interface deliberately does not expose JSON field names, raw action chains, model-source diagnostics, or laboratory controls. Those contracts remain available through the programmatic integration surface while the user sees only the conversation, a restrained state indicator, and the responding Metabloom field.

## Model response contract

A model response must contain exactly `response` and `actionChain`.

```json
{
  "response": "I agree. That gives us a clean boundary between language and expression.",
  "actionChain": [
    {
      "action": "thinking",
      "duration": 900,
      "talking": false
    },
    {
      "action": "agree",
      "duration": 920,
      "talking": true
    },
    {
      "action": "happy",
      "duration": 1050,
      "talking": true
    },
    {
      "action": "reform",
      "duration": 980,
      "talking": false
    }
  ]
}
```

### Response field

- Must be a nonempty string.
- Maximum length is 4,000 characters.
- It is rendered as text only. HTML is never interpreted.

### Action chain field

- Must contain between 1 and 12 action objects.
- Each action object may contain only `action`, `duration`, and `talking`.
- `duration` must be an integer from 160 through 6,000 milliseconds.
- The total chain may not exceed 24 seconds.
- A missing final `reform` step is appended automatically when the remaining limits allow it.
- A maximum-length chain that does not end in `reform` is rejected.

Allowed action ids are:

```text
reform
agree
disagree
happy
excited
sad
surprised
thinking
sleepy
angry
```

Aliases accepted by the older Orb control API are intentionally not accepted by the model contract. Model output must use the canonical action ids.

The published JSON Schema is available at runtime through:

```js
window.__orbResponseSchema
```

## Connecting a model

### Adapter function

A host application may install a request adapter before or after `/orb` mounts:

```js
window.__metabloomRequest = async ({ message, history }) => {
  const response = await fetch("/api/metabloom/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw new Error("Model request failed");
  }

  return response.json();
};
```

The browser must not contain provider API keys or long-lived credentials. The adapter should call a same-origin authenticated server endpoint that owns provider credentials, request limits, moderation, logging policy, and timeout behavior.

### Event bridge

Every submitted user message dispatches:

```text
metabloom:user-message
```

The event detail contains:

```json
{
  "message": "The newest user message",
  "history": [
    {
      "role": "assistant",
      "content": "Previous message"
    },
    {
      "role": "user",
      "content": "The newest user message"
    }
  ]
}
```

An external integration may respond by dispatching:

```js
window.dispatchEvent(
  new CustomEvent("metabloom:model-response", {
    detail: {
      response: "Validated model text",
      actionChain: [
        { action: "thinking", duration: 900, talking: false },
        { action: "agree", duration: 920, talking: true },
        { action: "reform", duration: 980, talking: false },
      ],
    },
  }),
);
```

A synchronous event response cancels the local preview before it can run.

### Direct response API

A validated payload may also be delivered directly:

```js
window.__orbRespond({
  response: "Direct response text",
  actionChain: [
    { action: "happy", duration: 1050, talking: true },
    { action: "reform", duration: 980, talking: false },
  ],
});
```

`__orbRespond` returns `true` when the payload is accepted and `false` when it violates the contract. Invalid payloads do not mutate the transcript or start an action.

The current plain-text transcript is available through:

```js
window.__orbMessages()
```

The existing action and diagnostics APIs remain available for compatibility:

```text
__orbPop
__orbExpress
__orbTransform
__orbReact
__orbPlaySequence
__orbStop
__orbReset
__orbActions
__orbExpressions
__orbForms
__orbState
__orbTalk
__orbStopTalk
```

## Local review behavior

When no `window.__metabloomRequest` adapter and no event listener supplies a response, the page produces a response marked `Preview`. This exists only so the interface, transcript, and action choreography can be reviewed without a model backend.

The preview passes through the same parser as an external model response. It does not bypass the schema or action limits.

## Runtime invariants

- Exactly one `CreatorOSFieldCanvas` is mounted.
- The Metabloom field fills the route instead of living inside a square or card.
- Chat messages are plain text and never use `dangerouslySetInnerHTML`.
- Model payloads are rejected before UI or avatar state changes when their shape is invalid.
- User messages are limited to 1,600 characters.
- The visible transcript is bounded to 24 messages.
- Model history is bounded to the latest 12 messages.
- Only one model request is considered current. A newer response invalidates stale work.
- Pending preview timers and action timers are cleared during reset and unmount.
- The shared renderer continues to own reduced motion, hidden-tab suspension, local WebGL context recovery, and GPU cleanup.
- The regular `/dither-canvas` Metabloom study remains unchanged because avatar uniforms are disabled by default outside `/orb`.
