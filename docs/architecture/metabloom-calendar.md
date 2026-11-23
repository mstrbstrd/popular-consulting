# Metabloom calendar workspace and provider boundary

Metabloom Calendar provides a private scheduling surface (`/calendar`) and agentic calendar tools orchestrated directly by `server/metabloomAgent.js` across OpenAI, Claude, and DeepSeek.

## Architecture and storage

All UI routes and agent tools communicate through one narrow server-side boundary (`server/metabloomCalendarProvider.js`):

- **Default backend (`CALENDAR_PROVIDER=redis`):** `server/metabloomCalendarStore.js` persists per-account calendar state atomically in the existing Upstash Redis database (`getMetabloomSavedWorkDatabase()`), scoped by `createMetabloomAccountIdentity`. Writes use a single Lua `EVAL` optimistic version check, bounded idempotency receipts (`operationId` + SHA-256 `payloadHash`), and bounded Undo snapshots.
- **Optional MCP backend (`CALENDAR_PROVIDER=mcp`):** `server/metabloomCalendarMcpClient.js` is a zero-dependency Node Streamable HTTP JSON-RPC 2.0 client targeting an allowlisted HTTPS `CALENDAR_MCP_URL`. It invokes only a static allowlist of tool names, never injects remote `tools/list` descriptions into model prompts, and sanitizes all returned event text before validation.

## Security, correctness, and release invariants

| Requirement | Enforcement |
| --- | --- |
| Passkey admin boundary | `/calendar` and `api/metabloom-calendar.js` require the existing passkey-attested admin session (`__Host-popcon-session`), `sameOriginPost`, and `PRIVATE_HEADERS` (`connect-src 'self'`). |
| No browser secrets or MCP tokens | Redis and optional MCP credentials remain strictly server-only; `CALENDAR_MCP_URL` rejects non-HTTPS, localhost, IP literals, userinfo, and control characters. |
| Event content is untrusted data | Titles, locations, descriptions, and attendees are stripped of disallowed control characters, length-capped, and validated through `metabloomCalendarProtocol.js`. |
| Deliberate destructive and external actions | Deletions and any event with external attendees always require explicit 1-click user confirmation (`requiresCalendarConfirmation`). |
| Optimistic concurrency and idempotency | Stale calendar or event revisions fail closed with `calendar_conflict`. Replaying an `operationId` with the same `payloadHash` returns `duplicate`; reusing an `operationId` with a different payload fails with `calendar_operation_conflict`. |
| Undo cannot clobber newer edits | `undoOperation` verifies the target event's current revision still matches `afterRevision` before restoring `beforeEvent`. |
| Redacted observability | `logCalendarOperation` logs only `requestRef`, provider kind, operation name, status, duration, and `operationId` — never event text, attendees, or credentials. |
| Independent release controls | Server capabilities gate behind `METABLOOM_CALENDAR_ENABLED`; client UI gates behind `REACT_APP_METABLOOM_CALENDAR_ENABLED`. Both default off until explicitly enabled. |

## Verification

- `src/components/metabloomCalendarProtocol.test.js` validates schemas, date/timezone checks, confirmation policy, free-slot intervals, canonical payload hashing, and `.ics` export in Jest (Ubuntu and Windows CI).
- `scripts/metabloom-calendar-store.test.cjs` verifies Redis Lua concurrency conflicts, idempotent retries, payload-hash mismatches, Undo conflict guards, provider logging redaction, and `.ics` export.
- `scripts/metabloom-calendar-mcp.test.cjs` verifies Streamable HTTP JSON and SSE envelopes, SSRF endpoint validation, response byte caps, untrusted-field sanitization, and caller abort propagation.
