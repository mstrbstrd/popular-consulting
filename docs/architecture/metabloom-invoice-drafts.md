# Chat invoice drafts

The ordinary `/orb` agent can prepare an invoice for the existing private
`/invoice-generator` editor. This is draft preparation, not an accounting ledger.
It works across OpenAI, DeepSeek and Claude through the common tool adapter.

## Flow

1. Say **Start an invoice draft.** This entry is host-routed without a model call.
2. Provide sender/client names, invoice date (YYYY-MM-DD), CAD/USD, and at least
   one item with service date, description, quantity, unit price and GST/PST choices.
   Applicable taxes also need explicit percentage rates. Missing values stay missing.
3. `create_invoice_draft` validates a typed patch against excerpts from the current
   message, saves an atomic revision, and calculates using `invoiceCore`.
   `get_invoice_draft` resumes or reviews the same account-and-conversation draft.
4. A native `invoice-draft` card shows the supplied details and exact totals.
   Tool lifecycle events provide the existing running/completed/failed feedback.
5. **Open in invoice generator** rechecks the protected manifest and current
   administrator session. The private entrypoint validates and stages the draft.
   Navigation contains only `/invoice-generator`, never invoice data.
6. Review/edit, save locally, or print/save PDF explicitly in the existing editor.

For a second invoice, start a new chat. Optional addresses, sender contact fields,
business/tax numbers, description, due date and notes may be supplied. Chat does
not access private presets, logos, local storage or previous local invoices.
New chat line items default only discount to zero; tax applicability, dates,
quantities, prices and currency are not inferred. Invoice numbers are generated
once with a random suffix and remain editable; no central uniqueness registry exists.

## Invariants and failure behavior

- Monetary output is application-calculated with the existing scaled-integer
  engine. Per-line rounding and taxes match the editor; model totals are ignored.
- Invalid, unsupported, overflowed or unevidenced patches cannot partially commit.
  Evidence checks constrain values to current-message excerpts, not historical
  context. They do not prove semantic interpretation; the review step remains necessary.
- Draft updates compare revisions atomically in Redis. Matching retry receipts
  return the original result, including stable draft, line and invoice identifiers.
  Conflicts require reviewing current state. An uncertain transport result never
  claims the save failed or succeeded; the user is directed to review first.
- Records are scoped to environment, account and conversation. Structured drafts
  expire seven days after their last update; retry receipts expire after one day.
  Saved chat/card copies follow the existing chat and saved-work retention rules.
- The model can request invoice tools, but cannot authorize replacement of a local
  invoice. Existing work requires a user click and version-bound approval. A second
  change invalidates that approval. Reopening the same draft/revision preserves
  local edits. Late callbacks from a replaced editor cannot overwrite the import.
- A session/account change blocks pending handoff and resets private workspace
  state. The public bundle contains only generic schema/math and the review card.
  Business/client presets and the editor stay behind `/_private/invoice`.
- A review card is built by the host, never by the generic model visual generator.
  If visual delivery fails, the saved intake remains available through review.
- No automatic device save, print, PDF export, send, issuance, payment status, or
  conversion of an unpriced boom quote request into a priced invoice.

## Operations

The client negotiates `X-Metabloom-Invoice: 1`, a request ID and conversation UUID.
`METABLOOM_INVOICE_ENABLED=false` disables the invoice tools and card delivery.
The existing authenticated Redis configuration and visual quotas are reused.
Council and Deep Research do not run this workflow. Ordinary tool-aware chat does.
No new secrets, dependencies, invoice database migration, or external billing
provider are required.

The shared system prompt and effective agent prompt describe the same capabilities,
limits and privacy boundary. Tool names, progress events, native visual validation,
saved chat snapshots and private handoff are tested together. The functional CI
runs the real Redis adapter and desktop/mobile browser fixture using fictional
provider responses, with no live model calls or customer invoices.

Verification: `scripts/metabloom-invoice.test.cjs`,
`scripts/metabloom-invoice-redis.test.cjs`,
`scripts/verify-metabloom-invoice.mjs`, `src/invoice-chat-handoff.test.js`,
`src/components/MetabloomInvoiceDraftCard.test.js`, plus existing invoice,
authentication, native visual and saved-work suites.
