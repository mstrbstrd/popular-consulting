# Orb price books

The admin-only Orb can turn an owner's pricing rules into a draft price-book card, let the owner review and publish it, and compute estimates from the published version. MCP hosting, public embeds, and invoice export are outside this release.

## Enable and try

Set `METABLOOM_PRICEBOOK_ENABLED=1` in the deployment environment. It is disabled unless that exact value is present. Existing Orb authentication, `METABLOOM_VISUALS_ENABLED=true`, native UI tools, the OpenAI visual builder, and Upstash Redis must also be configured. The browser negotiates `X-Metabloom-Pricebook: 1`; cached clients receive no new price-book tool or stream events.

1. Ask in `/orb`: “Set up my price book in CAD: $95/hour, two-hour minimum, hours up to 12, $60 travel when distance is over 20 km (up to 150 km), 15% weekend labour premium, 5% GST on each line.”
2. Review the rules, input ranges and worked examples. Try the inputs yourself. Check the review box and select **Publish price book**.
3. Ask: “Quote a six-hour weekend job 30 km away using my published price book.” The tool queues a server-built estimate table, stamped with the published version and the exact job inputs. For these rules, subtotal is CAD 715.50, GST is CAD 35.78 and total is CAD 751.28.
4. Ask for a revised price-book draft. Publishing the new draft replaces the active version only after another explicit review and click.

Publishing status is always read from the server. Restoring or saving a draft never publishes it. After a conflict or uncertain network response, refresh active status and review again before retrying.

## Invariants and failure boundaries

`metabloomPriceBookGuidance.js` owns the standard setup explanation: currency, labour, travel, premiums/fees, minimum job charge, and explicit tax rules, followed by draft examples, owner review, Publish, and job-fact-only estimates. Direct feature questions and an immediate request to walk through that explanation receive this exact host answer across providers. The browser does not classify them as render requests. No model, visual generation, publication or quotation runs for the explanation; authentication, quota and cancellation still apply. Disabled sessions receive the same requirements with an explicit unavailability notice. Shared model instructions use the same guide for other phrasings and direct ongoing intake to ask only for unresolved rules. Supplied rates, edit requests, quotes, code requests, combined tasks and unrelated follow-ups retain their existing routes.

| Must remain true | Enforcement |
| --- | --- |
| Model text never becomes executable pricing code | Strict bounded schema and reverse-Polish tokens; no eval or Function |
| Prices use exact arithmetic | BigInt rational arithmetic, half-up line rounding, then independent per-line taxes; parity tests against invoice engine |
| Only validated job facts enter the engine | Every declared input required, no extra inputs, numeric ranges and boolean types checked |
| The model cannot publish | No publish tool; authenticated same-origin API is called only by explicit card action |
| One account cannot read or overwrite another account's book | Server-derived durable account identity and environment-scoped Redis keys |
| A stale card cannot overwrite newer rules | Atomic Redis compare-and-set on expected published version |
| A quote cannot silently use changed rules | Published snapshot re-read before computing; changed version or rules fails the tool |
| A quote table cannot be rewritten by a model | Host constructs the table from integer cents; visual endpoint uses stored hostQuote directly without a provider call |
| Publishing never invents success after a timeout | No automatic mutation retries; receipt must match submitted book and next version |
| Optional pricing failure does not erase chat | Store load/tool failures preserve ordinary answer flow; visual failures retain the text answer |
| Operational logs do not expose prices or identities | Fixed lifecycle/status categories; no book, job facts, account IDs or monetary output logging |
| Multi-turn intake does not lose the owner's earlier rules | Price-book builders receive the full already-bounded request history; briefs and assistant assumptions cannot confirm unanswered questions |
| Started-block charges remain exact | Unary `ceil` uses BigInt rational arithmetic, including boundary distances; proportional pricing is never substituted |
| Builder validation identifies the rejected contract | Fixed shape/input/tax/line/formula/condition/initial-result/example categories guide the single bounded repair; no rejected payloads or exception text are logged |
| Pricing rules show the actual formula | Review text applies unary ceiling to its operand and retains every subsequent rate/minimum operation; legacy inputs named `ceil` remain labels |
| Missing rules produce an actionable failure | Fixed categories identify missing rates, currency, taxes, travel rounding, minimum scope or unsupported rules; no arbitrary provider explanation is exposed or logged |
| A retry knows the current card failed | The active workspace adds its observed failure to the matching assistant history entry within existing history limits; a queued promise is not proof of generation |

The `get_quote` schema is derived from the active book. It accepts only job facts, not rates, taxes, discounts, executable formulas or a publish command. The same schema derivation can be reused by a later MCP endpoint. Model-written chat prose is not an authoritative estimate; the host-built card is.

## Storage and contracts

Shared schema/engine: `src/components/metabloomPriceBook.js`. Book schema version 1 supports CAD/USD, bounded numeric/boolean inputs, conditional line formulas, tax percentage strings, and input-only worked examples. All totals are computed by the host. Numeric inputs allow at most six decimal places; taxes allow two. Each quote total is capped at one billion currency units. No exchange rates or tax-jurisdiction inference occurs.

Formulas support binary `add/subtract/multiply/divide/min/max` and unary `ceil`. A confirmed $50 charge per started 25 km uses `["distance","25","divide","ceil","50","multiply"]`. Zero distance yields zero blocks, 25 km yields one, and 25.000001 km yields two. Existing version-1 inputs named `ceil` retain their original input meaning. Ordinary calculator capabilities are unchanged. Tax registration and location alone do not confirm rates or applicability; unresolved rules must be clarified before drafting. Failed cards are still transient, so the browser failure observation is available only while its current workspace record remains present.

`GET /api/metabloom-price-book` returns `{enabled:true,active:null|{version,publishedAt,book}}`. `POST` accepts `{book,expectedVersion}`. Expected version 0 creates the first publication. A 409 requires a fresh read. The persistent active record has no automatic expiry and uses the existing saved-work Redis configuration, in a separate price-book namespace. There is no local-memory storage fallback and this release does not retain publication history. Saved-work revisions can retain individual draft cards independently.

A price-book visual carries `priceBook` beside the standard visual metadata. Existing offer ownership, generation quotas, immutable artifact references and saved-work validation apply. Preview changes do not edit the rules. Estimates retain their published version even if the owner later publishes new rules.

## Verification

- `node --test scripts/metabloom-price-book.test.cjs scripts/metabloom-price-book-store.test.cjs scripts/metabloom-price-book-agent.test.cjs`
- `node --test scripts/metabloom-price-book-redis.test.cjs` with a disposable local Redis or the existing CI Redis fixture.
- `CI=true npm test -- --watchAll=false --runInBand`
- `npm run lint` and `CI=true npm run build`
- `node scripts/verify-metabloom-price-book.mjs` after the build, using fictional providers and local HTTP fixtures only.

The functional workflow includes the new server and real Redis tests plus the browser exercise. Turning the feature off stops new drafting, publishing and quote requests; already-saved drafts remain readable and locally previewable.


A November 18 browser walkthrough confirmed sequential intake across currency, labour, travel, premiums, minimum and tax rules. It also exposed a rejected builder response and a later syntactically valid draft with the minimum top-up reversed. Structural validation does not prove that generated rules match the owner's intent. Builder guidance now explicitly specifies `max(0, minimum - covered subtotal)`, conditional weekend top-ups and below/above-minimum examples; the owner still reviews the computed examples before publishing. Regression cases cover $95/hour, two-hour minimum, quarter-hour ceiling, $50 per started 25 km, 1.5x weekend labour, a $200 combined pre-tax minimum and 5% GST. The failed draft was never published.

After correction through chat, the live unpublished draft passed six interactive checks: CAD 210.00 for 1 hour/0 km weekday, CAD 252.00 for 2 hours/25 km weekday, CAD 304.50 just above 25 km, CAD 224.44 for 2.01 hours/0 km weekday, CAD 399.00 for 4 hours/0 km weekday, and CAD 553.88 for 3 hours/30 km weekend. This browser evidence preceded deployment of the builder-guidance and formula-display changes; it verifies the correction flow and existing exact engine, not first-attempt reliability of the new guidance. The account's published version 1 remained unchanged.
