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

The `get_quote` schema is derived from the active book. It accepts only job facts, not rates, taxes, discounts, executable formulas or a publish command. The same schema derivation can be reused by a later MCP endpoint. Model-written chat prose is not an authoritative estimate; the host-built card is.

## Storage and contracts

Shared schema/engine: `src/components/metabloomPriceBook.js`. Book schema version 1 supports CAD/USD, bounded numeric/boolean inputs, conditional line formulas, tax percentage strings, and input-only worked examples. All totals are computed by the host. Numeric inputs allow at most six decimal places; taxes allow two. Each quote total is capped at one billion currency units. No exchange rates or tax-jurisdiction inference occurs.

`GET /api/metabloom-price-book` returns `{enabled:true,active:null|{version,publishedAt,book}}`. `POST` accepts `{book,expectedVersion}`. Expected version 0 creates the first publication. A 409 requires a fresh read. The persistent active record has no automatic expiry and uses the existing saved-work Redis configuration, in a separate price-book namespace. There is no local-memory storage fallback and this release does not retain publication history. Saved-work revisions can retain individual draft cards independently.

A price-book visual carries `priceBook` beside the standard visual metadata. Existing offer ownership, generation quotas, immutable artifact references and saved-work validation apply. Preview changes do not edit the rules. Estimates retain their published version even if the owner later publishes new rules.

## Verification

- `node --test scripts/metabloom-price-book.test.cjs scripts/metabloom-price-book-store.test.cjs scripts/metabloom-price-book-agent.test.cjs`
- `node --test scripts/metabloom-price-book-redis.test.cjs` with a disposable local Redis or the existing CI Redis fixture.
- `CI=true npm test -- --watchAll=false --runInBand`
- `npm run lint` and `CI=true npm run build`
- `node scripts/verify-metabloom-price-book.mjs` after the build, using fictional providers and local HTTP fixtures only.

The functional workflow includes the new server and real Redis tests plus the browser exercise. Turning the feature off stops new drafting, publishing and quote requests; already-saved drafts remain readable and locally previewable.
