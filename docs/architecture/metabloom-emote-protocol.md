# Metabloom semantic response protocol 1.0.0

An ordinary assistant response contains exactly one subtle emote. The same velocity-aware renderer remains mounted. An emote does not restart the canvas, reset physiology time, queue a reform animation, or emit an additional field pulse. Waiting for a response does not start another emotional gesture.

```json
{"version":"1.0.0","segments":[{"emote":"reflective","response":"A considered response."}]}
```

`metabloomProtocol.json` defines nine presets: neutral, warm, whimsy, reflective, curious, reassuring, concerned, celebratory, and resolute. `metabloomEmoteLibrary.js` generates the model schema and system prompt from that manifest. `metabloomEmoteProtocol.js` contains the actual validators shared unchanged by the browser and server. The model selects an enum and text, never duration, intensity, topology, colours, shader code, or an action chain. Motion presets are authored application code.

The prompt asks for helpful, accurate text, honest uncertainty, restrained emotional emphasis, and one semantically complete text segment. Neutral is preferred over theatrical or manipulative emphasis. User messages and history cannot change the schema. Movement must not be presented as evidence of consciousness. Unsafe requests still receive an appropriate safe response, and provider refusals are handled explicitly.

## Segments and streaming

Multi-segment responses are opt-in and bounded to four segments. NDJSON records require consecutive zero-based indexes and an explicit terminal version:

```json
{"type":"segment","index":0,"emote":"whimsy","response":"A playful possibility."}
{"type":"segment","index":1,"emote":"reflective","response":"A considered conclusion."}
{"type":"done","version":"1.0.0"}
```

The provider adapter currently validates a complete structured envelope before framing it as NDJSON. This is not token-level upstream streaming. The decoder supports arbitrarily divided text chunks, but the UI waits for validated completion and presents complete segments with bounded reading time. One segment and its emote are presented together. The two-part demo deliberately exercises this presentation boundary, not an animation playlist.

Unknown fields/emotes, wrong versions, empty streams, missing completion, out-of-order indexes, trailing data, excess segment counts, and oversized text fail closed. Limits: 1,600 characters per segment, 4,800 total, 24,000 serialized stream characters. The HTTP readers also bound response bytes and lifetime.

## Lifecycle and continuity

A new user message, reset, stop, deactivation, or unmount cancels undelivered segments and aborts obsolete network requests. Request IDs and tokens reject late external responses. History excludes the current turn; the server appends it once. Snapshots update synchronously when a command is accepted.

Neutral targets reform at zero intensity, which removes deliberate deformation without disrupting autonomous physiology. Static settle resolves to the neutral terminal pose, not a contracted midpoint. Existing legacy `__orb*` APIs remain compatible. `window.__metabloomProtocol` exposes the version, semantic enum/schema, response acceptance, and state inspection. The new built-in model path uses semantic response envelopes, not legacy action chains.

## Security and verification

Provider and quota credentials are server-only. Requests have exact body keys, bounded parsed and raw bodies, bounded history, complete-origin checks, explicit content types, server revalidation, upstream timeouts through body consumption, and disconnect cancellation. Production/preview model access additionally requires an atomic shared Redis quota; failures never fall through to unmetered model requests. No conversation content is logged.

`node --test scripts/metabloom-api.test.cjs` verifies the real server handler with a mocked upstream, parser boundaries, quotas, cancellation, and prompt/schema identity. Jest exercises the actual component controls and message/emote transitions. `Metabloom functional verification` builds the actual source and clicks demos in Chromium at desktop/mobile/reduced-motion settings. On main it additionally verifies the metadata and demo behavior on the production domain. Screenshots and structured results are retained as artifacts. No workflow applies patches or commits source.

Protocol/SDK references: OpenAI Structured Outputs documentation (`https://developers.openai.com/api/docs/guides/structured-outputs`), Vercel request headers (`https://vercel.com/docs/headers/request-headers`), Upstash Redis REST API (`https://upstash.com/docs/redis/features/restapi`).
