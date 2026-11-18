# Orb price books

Metabloom collects business inputs in a durable account-owned draft. Application code compiles the pricing rules and examples, and the owner explicitly reviews and publishes a saved revision. Models cannot author formulas or publish. MCP hosting, public embeds, invoice export and payment collection are outside this release.

## Enable and try

Set `METABLOOM_PRICEBOOK_ENABLED=1` and configure the existing saved-work Redis connection and Orb authentication. Chat intake uses the selected OpenAI, DeepSeek or Claude provider. The manual **More > Price book setup** editor requires no model. Showing a card through chat also uses the existing visual feature flag, owned-offer storage and quota. Pricing compilation does not require an OpenAI visual builder.

The browser negotiates `X-Metabloom-Pricebook: 2`. Version-1 clients retain their existing event vocabulary and can quote existing published books; new workflow tools are not advertised to them. Old generated draft cards remain locally previewable but cannot publish. Existing published rules remain active and are never recompiled or migrated implicitly.

1. Ask: "Build a CAD price book: hourly labour 95, minimum 2 hours, round up to 15 minutes; one-way travel 50 per started 25 km, no free distance; weekend 1.5 on labour; no call-out or other fees; 200 minimum labour plus travel before tax; 5% GST on all charges."
2. The host saves supplied fields and asks the next missing question. A complete supported draft produces a host-compiled preview. **Price book setup** can resume the same draft without conversation history or a working model provider.
3. Review the fields, formulas, allowed job inputs and calculated examples. Check the review box and select **Publish price book**. Unsaved edits or a changed revision invalidate review.
4. Ask for a three-hour weekend job 30 km away. `get_quote` calculates CAD 527.50 subtotal, CAD 26.38 GST and CAD 553.88 total from the published version.

A single saved draft is shared across the account's chats. There is no automatic import of legacy model-authored formulas into structured inputs. Creating or editing a draft does not replace the active book.

## Invariants and failure boundaries

| Must remain true | Enforcement |
| --- | --- |
| The model cannot write pricing formulas | Dedicated `get_price_book_draft` and `propose_price_book_changes` tools; generic `create_visual` excludes price books; the model visual builder rejects them before provider work |
| Unknown business values stay unknown | Fixed field catalogue, explicit null values, conditional required fields and host-selected next questions |
| Chat proposals have traceable input | Each changed value requires an exact excerpt from the current user message; the saved draft retains field provenance |
| Unsupported intent cannot silently become a supported default | Unsupported values on known fields persist as blocking clarification issues; old valid values do not remove the blocker |
| Saved input survives conversation truncation | Account-owned durable draft and revision are loaded independently of chat history |
| The model cannot narrate an unconfirmed save | Pricing tools end with fixed host responses; no second model call is needed for confirmation or the next question |
| Pricing uses exact arithmetic | BigInt rational calculation, half-up line rounding, independent per-line taxes and exact started-block ceilings |
| Minimum top-ups cover rounded components | Compiler uses `max(0, minimum - rounded covered charges)`; independent boundary and generated-job oracles verify the result |
| The model cannot publish | No publish tool; the authenticated same-origin endpoint accepts a saved draft ID/revision and expected active version, never client formulas |
| Stale review cannot overwrite new state | Atomic Redis comparison checks both the saved draft and current published version |
| Retries do not create duplicate versions | Operation receipts bind a request ID to a payload digest and return the original confirmed result; receipts expire after 24 hours |
| Publication history remains immutable | Each publication archives the compiler version and reviewed draft; the previous legacy active version is retained on first replacement |
| Another account cannot read or overwrite these records | Server-derived account identity and environment-scoped Redis keys |
| Failed or cancelled work cannot invent success | Abort checks, fixed errors, no automatic mutation retry, receipt validation and explicit reload after ambiguous results |
| A provider outage does not remove the setup path | The manual editor uses the same typed draft API, compiler and explicit publication controls |
| Quote prose cannot rewrite calculated totals | `get_quote` accepts only complete job facts and queues a host-built estimate card; a changed published snapshot fails the tool |
| Progress reflects observed execution | Both pricing tools use the shared lifecycle and negotiated stream; draft saves are distinct from preview/display success |
| Logs do not expose business data | Fixed tool/status categories; no rates, rules, source excerpts, account IDs or job facts in operational logs |

Source excerpts prove where the model looked, not that its interpretation is correct. Natural-language extraction can still misunderstand a request. The owner reviews the actual saved fields and computed examples before publication. The manual editor is the deterministic input path. Provider and storage outages remain possible and produce recoverable failures, not invented completion.

## Supported semantics

Compiler version `service-rates-1` supports CAD/USD; hourly or fixed labour; minimum billable hours; time rounded upward in minutes; no, flat, per-kilometre or started-block travel; free distance; one-way or total round-trip quote inputs; a weekend multiplier on labour, travel or both; a fixed per-job call-out fee; pre-tax minimums on labour, labour plus travel, or those charges plus call-out; and up to four independent tax-exclusive taxes with explicit charge scopes.

Time is rounded upward first, then clamped to minimum hours. Quotes ask for the stated distance basis directly; they do not double one-way distances automatically. A flat travel fee applies either to every job or to any positive distance. Arbitrary distance thresholds, after-hours premiums, discounts, compound taxes, tax-inclusive amounts and post-tax minimums require additional support. The fixed input bounds are 0 to 1,000 hours and 0 to 10,000 kilometres. Compilation checks all input extremes against the engine's money bound.

Each line rounds half up to cents before its taxes are computed; each independent tax rounds per line. There is no geographic tax inference or currency conversion. Formulas are bounded to 64 tokens and use existing arithmetic plus unary `ceil` and `round_money`. Legacy version-1 inputs named either unary operator keep their input meaning. Ordinary calculators retain their existing 32-token contract.

## Storage and API

`metabloomPriceBookRules.js` owns field validation, completeness, the versioned compiler and preview construction. `metabloomPriceBookWorkflow.js` owns account state, source evidence, CAS and idempotent publication. The original exact engine and active-book record format are retained.

| Request | Contract |
| --- | --- |
| `GET /api/metabloom-price-book` | `{enabled:true, active:null or {version,publishedAt,book}}` |
| `GET /api/metabloom-price-book?draft=1` | Same envelope plus `draft` |
| `POST`, `action: update_draft` | `expectedRevision`, `requestId`, `changes: [{field,value}]`; returns confirmed draft and active status |
| `POST`, `action: publish_draft` | `draftId`, `draftRevision`, `compiler`, `expectedVersion`, `requestId`; the server compiles the saved rules and returns the confirmed active record |

Client-owned IDs, extra body fields and legacy `{book,expectedVersion}` publications are rejected. A draft contains `id`, `revision`, `updatedAt`, `rules`, `sources` and `issues`. A compiled visual also carries a `priceBookDraft` reference with ID, revision and compiler version. Restored previews do not imply current publishability.

Draft, active and history keys have no automatic expiry. Receipt keys have a 24-hour TTL. History uses `${activeKey}:history:${version}`; subsequent writes cannot replace an existing history version. There is no memory fallback for production state. Reload after a 409 or ambiguous save; retained manual edits are rebased onto the newly observed revision and require another explicit save.

## Verification

- `node --test scripts/metabloom-price-book.test.cjs scripts/metabloom-price-book-workflow.test.cjs scripts/metabloom-price-book-store.test.cjs scripts/metabloom-price-book-agent.test.cjs`
- `node --test scripts/metabloom-price-book-redis.test.cjs` against disposable Redis, required by the CI Redis job.
- Full Jest suite, source/server lint and production build.
- `node scripts/verify-metabloom-price-book.mjs` after building: fictional providers, real handlers, local transport fixture, desktop/mobile manual intake, compiled draft, explicit publication, exact quote, stale-publication rejection and overflow checks. `--http-only` runs the request flow without launching a browser.

Tests pin the original six agreed totals, 1,200 generated jobs against an independent cents oracle, supported mode boundaries, unsupported rules, incomplete drafts, source evidence, revision conflicts, ambiguous receipts, old drafts, cancellation and all three provider adapters. Adapter fixtures verify transport behavior; they are not live-model extraction quality measurements. Changing provider defaults or expanding supported semantics still requires a representative live walkthrough before claiming first-attempt language reliability.

The earlier November 18 browser walkthrough exposed a valid-looking generated formula with a reversed minimum top-up. That is why this workflow removes model-authored pricing formulas entirely. The existing published account version was not changed by that walkthrough or local fixtures.
