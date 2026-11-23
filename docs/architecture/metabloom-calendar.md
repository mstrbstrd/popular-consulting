# Metabloom calendar workspace and provider boundary

Metabloom Calendar provides a private scheduling surface (`/calendar`) and agentic calendar tools orchestrated directly by `server/metabloomAgent.js` across OpenAI, Claude, and DeepSeek.

## Architecture and storage

All UI routes and agent tools communicate through one narrow server-side boundary (`server/metabloomCalendarProvider.js`):

- **Default backend (`CALENDAR_PROVIDER=redis`):** `server/metabloomCalendarStore.js` persists per-account calendar state atomically in the existing Upstash Redis database (`getMetabloomSavedWorkDatabase()`), scoped by `createMetabloomAccountIdentity`. Writes use a single Lua `EVAL` optimistic version check, bounded idempotency receipts (`operationId` + SHA-256 `payloadHash`), and bounded Undo snapshots.
- **Google Calendar backend (`CALENDAR_PROVIDER=google`):** Direct server-side OAuth 2.0 + Google Calendar v3 REST adapter paired with `api/metabloom-calendar-google.js` (`GET ?action=connect`, `GET ?action=callback`, `GET ?action=status`, and `POST { action: 'disconnect' }`).
  - **AES-256-GCM Redis token encryption:** Per-account Google OAuth access and refresh tokens are encrypted at rest in Redis with AES-256-GCM (authenticated encryption with random IV and authentication tag) scoped to the passkey admin account identity. Plaintext OAuth tokens are never returned to the browser or written to logs.
  - **PKCE + state cookie binding:** OAuth sign-in uses Authorization Code flow with PKCE (`S256` code challenge/verifier) and a cryptographic `state` parameter bound to a short-lived `HttpOnly`, `Secure`, `SameSite=Lax` cookie tied to the signed-in passkey admin session. On completion, the callback redirects back to `/calendar?google=connected` or `/calendar?google=error`, and the client strips the transient `?google=` parameter with `window.history.replaceState`.
  - **Full-document OAuth navigation:** The workspace **"Sign in with Google"** link targets `/api/metabloom-calendar-google?action=connect` with `data-document-navigation="true"`, instructing `ApplicationShell` (`clickedAppDestination`) to bypass SPA interception so the browser follows the server redirect to Google OAuth consent.
  - **`If-Match` etag conflict checks:** Updates and deletions send the event's Google Calendar `etag` in the HTTP `If-Match` header; HTTP `412 Precondition Failed` responses fail closed as `calendar_conflict`, preserving optimistic concurrency semantics across tabs and agent actions.
- **Optional MCP backend (`CALENDAR_PROVIDER=mcp`):** `server/metabloomCalendarMcpClient.js` is a zero-dependency Node Streamable HTTP JSON-RPC 2.0 client targeting an allowlisted HTTPS `CALENDAR_MCP_URL`. It invokes only a static allowlist of tool names, never injects remote `tools/list` descriptions into model prompts, and sanitizes all returned event text before validation.

## Google Cloud Console setup (`CALENDAR_PROVIDER=google`)

To enable the Google Calendar provider in Vercel / server deployments:

1. In Google Cloud Console, enable the **Google Calendar API** and configure the **OAuth consent screen**.
2. Create an **OAuth 2.0 Client ID** (Web application) and register the authorized redirect URI:
   - `https://<your-domain>/api/metabloom-calendar-google?action=callback`
3. Configure server-only environment variables:
   - `CALENDAR_PROVIDER=google`
   - `GOOGLE_CALENDAR_CLIENT_ID` — OAuth 2.0 client ID from Google Cloud Console
   - `GOOGLE_CALENDAR_CLIENT_SECRET` — OAuth 2.0 client secret from Google Cloud Console
   - `GOOGLE_CALENDAR_ID` *(optional)* — Target calendar ID (defaults to `primary`)

## Security, correctness, and release invariants

| Requirement | Enforcement |
| --- | --- |
| Passkey admin boundary | `/calendar`, `api/metabloom-calendar.js`, and `api/metabloom-calendar-google.js` require the existing passkey-attested admin session (`__Host-popcon-session`), `sameOriginPost` on mutations, and `PRIVATE_HEADERS` (`connect-src 'self'`). |
| No browser secrets or OAuth/MCP tokens | Redis credentials, optional MCP tokens, and Google OAuth client secrets / encrypted access & refresh tokens remain strictly server-only; `CALENDAR_MCP_URL` rejects non-HTTPS, localhost, IP literals, userinfo, and control characters. |
| OAuth CSRF and code-interception resistance | Google OAuth connect/callback binds PKCE (`S256`) and cryptographic `state` to a short-lived `HttpOnly` cookie scoped to the authenticated admin account; tokens are stored encrypted with AES-256-GCM in Redis. |
| Event content is untrusted data | Titles, locations, descriptions, and attendees are stripped of disallowed control characters, length-capped, and validated through `metabloomCalendarProtocol.js`. |
| Deliberate destructive and external actions | Deletions and any event with external attendees always require explicit 1-click user confirmation (`requiresCalendarConfirmation`). |
| Optimistic concurrency and idempotency | Stale calendar or event revisions (including Google Calendar `If-Match` etag `412` mismatches) fail closed with `calendar_conflict`. Replaying an `operationId` with the same `payloadHash` returns `duplicate`; reusing an `operationId` with a different payload fails with `calendar_operation_conflict`. |
| Undo cannot clobber newer edits | `undoOperation` verifies the target event's current revision still matches `afterRevision` before restoring `beforeEvent`. |
| Redacted observability | `logCalendarOperation` logs only `requestRef`, provider kind, operation name, status, duration, and `operationId` — never event text, attendees, or credentials. |
| Independent release controls | Server capabilities gate behind `METABLOOM_CALENDAR_ENABLED`; client UI gates behind `REACT_APP_METABLOOM_CALENDAR_ENABLED`. Both default off until explicitly enabled. |

## Verification

- `src/components/metabloomCalendarProtocol.test.js` validates schemas, date/timezone checks, confirmation policy, free-slot intervals, canonical payload hashing, and `.ics` export in Jest (Ubuntu and Windows CI).
- `src/components/CalendarPage.test.js` verifies Month/Week/Day/Agenda views, accessible CRUD modals and Undo banner, Google Calendar connect/disconnect UI and callback query banners, auth/feature gates, and zero `jest-axe` accessibility violations.
- `scripts/metabloom-calendar-store.test.cjs` verifies Redis Lua concurrency conflicts, idempotent retries, payload-hash mismatches, Undo conflict guards, provider logging redaction, and `.ics` export.
- `scripts/metabloom-calendar-mcp.test.cjs` verifies Streamable HTTP JSON and SSE envelopes, SSRF endpoint validation, response byte caps, untrusted-field sanitization, and caller abort propagation.
