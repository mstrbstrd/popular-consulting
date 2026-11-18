# Boom-system quote request demo

Start an ordinary signed-in chat with **“Start a boom-system quote demo.”** This entry phrase is host-routed. Subsequent natural-language answers use the selected OpenAI, DeepSeek or Claude provider to propose typed fields. The host validates and saves them, chooses the next question, and builds the review card without another model generation.

The reference is DY's `/boom-system-request` form and `BoomSystemQuoteClientDTO` in `mstrbstrd/DY_ECOMMERCE`. This is request intake, not a price calculator. It does not modify DY code or contact DY APIs, staff or customers.

## Required intake

Market (US/CA), first and last name, company, email, phone, pump make, model and serial number, pipe wall (Single Wall/Twin Wall), and back end (Yes/No). Boom pipe and deck pipe details are optional. The actual form accepts an optional PDF/PNG/JPG/JPEG schematic up to 5 MB; chat does not upload one. A typed filename is never an attachment.

Use fictional contact details for demonstrations. The application cannot verify an actual serial number, compatibility, stock or price. Those decisions remain with DY's team.

## Invariants

- A missing required field cannot produce a downloadable completed request. Unknown serial numbers remain unresolved.
- The model cannot invent values, mutate another chat's draft, author the review card, calculate prices, upload a schematic or submit the request.
- Every mutation requires the current revision, an exact current-message excerpt containing each proposed value, bounded typed fields and an idempotency receipt. Invalid changes fail as one unit.
- Redis Lua compares revisions atomically. Retries reuse the confirmed receipt; concurrent edits cannot silently overwrite each other.
- Durable keys include environment/application scope, account identity and conversation UUID. New chat means a separate request. Unused structured drafts expire seven days after their last update; receipts expire after one day. Chat messages and saved artifacts retain their existing retention behavior.
- Every tool emits running and complete/failed through the shared lifecycle. Cancelled work cannot emit late completion. A lost save response is reported as unconfirmed, never as proof of no mutation.
- The review card is a snapshot of one revision. Corrections create a new revision/card. Downloads contain the same values and always state that this is a demo, not submitted to DY.
- Partial updates do not spend visual quota. Explicit review or completed intake can queue a card. A card failure leaves confirmed intake saved and retryable by asking to review the request.
- Generic `create_visual` cannot generate this artifact kind. The visual endpoint accepts only the server-owned typed draft, with client negotiation.

## Integration

`X-Metabloom-Boom-Request: 1` negotiates tool activities, the `boom-request` card, and the request's `conversationId`. Existing clients do not receive these events. `METABLOOM_BOOM_REQUEST_ENABLED=false` disables new intake and card generation. The feature uses the existing authenticated saved-work Redis transport, with no new credentials. It is available in ordinary chat; Council and Deep Research do not execute intake tools.

`get_boom_quote_request` starts/resumes/reviews the current chat's request. `update_boom_quote_request` saves explicitly supplied fields. There is no submit/send tool. The card provides a plain-text download and a link to the official DY form, where a person can independently review and submit a real request.

The product-owned field schema lives in `src/components/metabloomBoomRequest.js`; revisioned storage and tool definitions in `server/metabloomBoomRequestWorkflow.js`; orchestration in `server/metabloomAgent.js`. No service-price-book rules are reused for equipment quoting.

## Verification

- `node --test scripts/metabloom-boom-request.test.cjs scripts/metabloom-boom-request-agent.test.cjs`
- `node --test scripts/metabloom-boom-request-redis.test.cjs` (requires disposable Redis; CI supplies it)
- `npm test -- --watchAll=false --runInBand --runTestsByPath src/components/MetabloomBoomRequestCard.test.js`
- After building, `node scripts/verify-metabloom-boom-request.mjs --http-only` runs real handlers and stream validation against fictional provider/storage transports.
- Without `--http-only`, the same fixture runs desktop/mobile chat, rendering, overflow and download checks in Chromium/Edge. It never calls production or DY.
