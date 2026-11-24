# Metabloom Gmail integration and safety boundary

Metabloom Gmail extends the authenticated Metabloom chat assistant (`OrbSection`) with inbox search, email reading, safe draft creation, reversible organization, and 1-click confirmed send/trash workflows across OpenAI, Claude, and DeepSeek.

## Architecture and request flow

All Gmail reads and writes remain strictly server-side behind the passkey-attested admin session:

- **Shared protocol (`src/components/metabloomGmailProtocol.js`):** Zero-dependency contract shared between Node and the browser. Validates strict `gmailProposal` and `gmailReceipt` shapes, email address lists (rejecting CR/LF and control characters), untrusted email text sanitization (stripping HTML/script/style tags and control characters), and canonical sorted-key JSON serialization (`canonicalGmailPayload`) for SHA-256 integrity checks.
- **Server-side Gmail REST client (`server/metabloomGmailClient.js`):** Zero-dependency Node 24 client targeting `https://gmail.googleapis.com/gmail/v1/users/me`. Reuses the AES-256-GCM encrypted per-account Google OAuth token store and token refresh pipeline from `server/metabloomCalendarGoogleAuth.js`. Enforces RFC 2822 base64url MIME construction with CR/LF header-injection rejection, 8-second request timeouts, and 2 MiB response caps.
- **Protected Gmail action endpoint (`api/metabloom-gmail.js`):** Enforces `requireMetabloomSession` + `sameOriginPost` + `PRIVATE_HEADERS` (`connect-src 'self'`).
  - `GET /api/metabloom-gmail?mode=status` returns `{ enabled, sendEnabled, connected, sendConnected, email }`.
  - `POST /api/metabloom-gmail` executes explicit user-confirmed mutations only:
    - `{ action: 'confirm', proposal, saveAsDraft? }` — verifies `parseGmailProposal` and `timingSafeEqual` SHA-256 `payloadHash`, deduplicates `operationId`, and executes `sendMessage` (or `createDraft` when `saveAsDraft: true`) for `send` proposals or `trashMessage` for `trash` proposals.
    - `{ action: 'send_draft', draftId }` — checks `isMetabloomGmailSendEnabled()` and sends a previously saved draft.
    - `{ action: 'discard_draft', draftId }` — removes a saved draft.
    - `{ action: 'undo', messageId, undoAction }` — reverses `archive`, `mark_read`, `mark_unread`, `star`, or `unstar`.
- **Agent orchestration and chat stream bridge (`server/metabloomGmailWorkflow.js`, `server/metabloomAgent.js`, `api/metabloom.js`, `src/components/metabloomAgentTools.js`, `src/components/metabloomApiClient.js`):**
  - Opt-in header `X-Metabloom-Gmail: 1` enables 6 strict tools (`list_recent_emails`, `read_email`, `create_email_draft`, `propose_send_email`, `organize_email`, `propose_trash_email`) and raises the agent serial tool budget to 6 calls so multi-step Email-to-Calendar chains complete in one turn.
  - `api/metabloom.js` emits additive `{ type: 'gmail_proposal', proposal }` and `{ type: 'gmail_receipt', receipt }` NDJSON events after `text_complete` and before `done`.
  - `createMetabloomGmailStreamBridge` validates and intercepts these events without altering existing stream ordering or breaking calendar/navigation bridges.
- **Inline chat card (`src/components/MetabloomGmailCard.js`, `src/components/MetabloomGmailCard.css`, `src/components/OrbSection.js`):**
  - Renders an accessible liquid-glass card alongside `MetabloomCalendarCard` on assistant messages.
  - Pending `send` proposals display **To**, **Cc**, **Subject**, and the **full message body** so the user verifies every recipient and word before clicking **Send email**, **Save as draft**, or **Dismiss**.
  - Pending `trash` proposals show Subject/From preview with **Move to Trash** and **Dismiss**.
  - Applied `draft` receipts provide **Send draft** and **Discard draft** actions; applied `organize` receipts provide a 1-click **Undo** action.
  - All API errors surface via a `role="alert"` banner and are never silently swallowed.

## Google Cloud Console and OAuth setup

Gmail shares the existing Google OAuth connection configured on `/calendar`:

1. In Google Cloud Console, enable the **Gmail API** on the same project as the **Google Calendar API**.
2. Add the Gmail OAuth scopes (`gmail.readonly`, `gmail.compose`, `gmail.modify`, `gmail.send`) to the OAuth consent screen.
3. Users who connected Google Calendar before Gmail was enabled click **Disconnect** and **Sign in with Google** again on `/calendar` to grant the upgraded Gmail scopes.
4. Independent kill switches:
   - `METABLOOM_GMAIL_ENABLED` (server): set to `0`/`false` to disable all Gmail tools and endpoints (defaults to enabled whenever Calendar + Google OAuth are configured).
   - `METABLOOM_GMAIL_SEND_ENABLED` (server): set to `0`/`false` to disable sending email while keeping read, draft, organize, and trash active.
   - `REACT_APP_METABLOOM_GMAIL_ENABLED` (client): set to `0` to suppress the `X-Metabloom-Gmail: 1` header.

## Security, correctness, and release invariants

| Invariant | Enforcement |
| --- | --- |
| G1 — Never auto-send | `propose_send_email` never calls Gmail `messages.send` during an LLM turn. It emits a SHA-256 signed `pending_confirmation` proposal; only explicit `POST /api/metabloom-gmail { action: 'confirm', proposal }` after passkey session, `sameOriginPost`, `timingSafeEqual` hash verification, and `operationId` dedupe sends email. |
| G2 — Drafts are safe and reversible | `create_email_draft` saves to Gmail Drafts and returns an `applied` receipt with `draftId` and preview so `MetabloomGmailCard` exposes **Send draft** and **Discard draft**. |
| G3 — Organize is grounded and reversible | `organize_email` (`archive`, `mark_read`, `mark_unread`, `star`, `unstar`) requires exact `sourceText` grounding in the user's message and returns an `applied` receipt with `undoAction` + `messageId` for 1-click **Undo**. |
| G4 — Trash requires confirmation; no permanent delete | `propose_trash_email` never trashes during an LLM turn and requires 1-click confirmation on the card. Permanent Gmail delete is never implemented. |
| G5 — Email-to-Calendar confirmation gate | Whenever Gmail read tools execute in a turn (`gmailReadInTurn === true`), `create_calendar_event` forces `requiresConfirmation = true` so untrusted email text can never auto-commit calendar mutations without explicit 1-click user confirmation. |
| G6 — Kill switches, strict MIME hygiene, and zero-PII logs | Server and client feature flags disable Gmail or send-only independently; MIME header builders reject CR/LF injection; server logs never record email subjects, senders, recipients, bodies, or OAuth tokens. |

## Verification

- `src/components/metabloomGmailProtocol.test.js` validates proposal/receipt schemas, email list parsing, HTML/control-char sanitization, and canonical payload serialization in Jest.
- `src/components/MetabloomGmailCard.test.js` verifies Send confirmation (To/Cc/Subject/full Body preview, Send email, Save as draft, Dismiss), Trash confirmation, Draft Send/Discard, Organize Undo, `role="alert"` error banners, and zero `jest-axe` accessibility violations.
- `scripts/metabloom-gmail.test.cjs` verifies MIME header-injection rejection, Gmail API client methods, SHA-256 confirmation verification, Email-to-Calendar forced confirmation (`gmailReadInTurn = true`), scope checks, and zero-PII logging in `node --test`.
