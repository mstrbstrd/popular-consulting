# Metabloom web research verification

Updated on 2026-10-19 against the report-preservation implementation based on
`89bd03fde9b2fba647d47f77c2ffc3f6bb7d20dd`.

## Production failure and correction

The user reported `research_response_too_large`, reference `3947c1edb5bf`,
after the earlier research-stream correction. At the baseline, that code could
mean notes above 16,000 characters, more than eight distinct cited sources,
more than 64 output items, an SSE event above 512 KiB, or a provider stream
above 2 MiB. The reference does not identify which guard fired. The connected
Vercel runtime-log request returned HTTP 403, so the exact subreason and usage
for this request could not be recovered here.

The previous implementation discarded an otherwise usable completed report at
those presentation limits. New clients now request `streamResearchDetails: true`;
the actual API handler sends all validated sources, indexed report text chunks
and an explicit report-complete record before requesting the short writer.
The UI retains that completed report under **Full research**, including when
the later writer fails. It never exposes partially received report text,
provider reasoning, or raw tool payloads.

Provider request limits remain six web tool calls and 10,000 output tokens with
medium reasoning. Returned output items and distinct cited sources are bounded
by resource size instead of small presentation counts. Emergency limits are
8 MiB for a completed provider object or individual SSE event, 32 MiB for the
provider SSE stream, and 1 MiB for the normalized report as serialized UTF-8
JSON. Report chunks preserve the existing 24,000-character record limit. Only
confirmed, opted-in research uses the larger 2 MiB client stream limit.

The writer receives at most 16,000 characters of whole passages using the first
eight source IDs. A selective view is identified as such in its instructions.
All passages and sources remain in the full report. If no whole cited passage
fits, the handler sends a truthful short report introduction without a writer
call. Old cached clients receive only the existing event vocabulary. No extra
compression call, automatic retry, larger research generation budget, or full
report in future conversation history is introduced. The unused
`web_search_call.action.sources` inclusion has been removed.

[OpenAI's reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
states that reasoning tokens are billed as output tokens, including when they
do not yield visible text. The
[pricing documentation](https://developers.openai.com/api/docs/pricing)
also separates web-search calls and model token usage. A local parser rejecting
already generated output does not reverse that usage. Transport bytes and
repeated metadata do not directly measure model tokens. Unknown usage is logged
as null, not zero; size failures include the exact guard name and observed and
allowed byte counts without content. The already rejected response was not
persisted by this app, so this change protects subsequent requests rather than
recovering the old report from its reference.

## Preserved behavior

The Deep Research toggle, or a validated automatic research choice, runs an
OpenAI web-search pass followed by the strict-schema writer when an evidence
view fits. A completed search and valid provider URL annotations are required.
The concise answer and its numeric citation IDs validate before answer text is
sent. The full report has its own complete source table and clickable citations;
its source list displays 20 links at a time without truncating the stored list.

The Orb still shows summaries based on observed search activity and completes
its existing surfacing sequence before revealing the reply. A hidden tab skips
the presentation scene while preserving its request, answer and completed
report. Stop, reset, replacement, deactivation and unmount still reject stale
work. A report already displayed remains available when the user stops the
short answer. A writer failure displays the safe error code and request
reference alongside the retained completed research.

The earlier production failure contained seven web-tool records, 31,411 input
tokens, 5,928 output tokens and 2,816 reasoning tokens. The previous fix removed
the incorrect six-record rejection while preserving the six-call request budget.
This change continues to accept that fixture without retrying. The log does not
establish the status or billing of each tool record; reasoning is included in
the output count, not an additional count to add to it.

## Checks performed for this change

| Check | Result |
| --- | --- |
| API integration, full-report delivery, legacy capability, bounded writer, writer error and cancellation | 34 passed |
| Research extraction, SSE, byte boundaries, provenance, diagnostics and cancellation | 36 passed |
| Report, protocol and API client coverage | 7 suites / 272 tests passed; final source-title normalization and two new regressions passed in 2 affected suites / 170 tests |
| Full-research UI integration | 17 passed |
| Reply session and scene display gate | 2 suites / 45 passed |
| Adjacent research, scene, emote and navigation coverage | 4 suites / 93 passed |
| Production build, route HTML and isolated invoice bundle | Passed |
| Full source lint and whitespace validation | Passed |
| Built browser flow, desktop 1280 × 850 and mobile 375 × 812 | Both passed |

The API tests use a completed report above 16,000 characters with 65 distinct
cited sources. They verify complete delivery before synthesis, unchanged
provider budgets, bounded writer evidence, old-client compatibility, no writer
request when no whole cited passage fits, and cancellation during report
delivery. Provider reasoning fixtures are excluded from report text. The shared
parser and decoder cover the exact 1 MiB UTF-8 boundary, Unicode and escaping,
fragmentation, malformed sequences, no partial callback, and reports above
300,000 characters arriving in one network chunk. Eight maximal source records
with malformed Unicode titles also fit the existing wire-record bound after
canonicalizing only lone surrogate title units to the replacement character.

The UI cases cover long reports, 9 and 65 sources, pagination through every
source, writer failure before answer metadata, visible-prefix preservation,
hidden-tab completion, Stop, stale callbacks and safe restoration. Two initial
JSDOM-only failures concerned asynchronous native `details` toggle delivery;
the tests explicitly dispatch that browser event, and all 17 cases pass without
a production workaround.

Reproducible focused commands from the repository root:

```bash
node scripts/metabloom-api.test.cjs
node scripts/metabloom-research.test.cjs
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomResearchReport.test.js src/components/MetabloomResearchProtocol.test.js
CI=true node_modules/.bin/react-scripts test --watchAll=false --runInBand --runTestsByPath src/components/MetabloomResearchDetailsIntegration.test.js src/components/MetabloomTextStreaming.test.js src/components/metabloomResearchDisplayGate.test.js
CI=true node_modules/.bin/react-scripts test --watchAll=false --runInBand --runTestsByPath src/components/MetabloomResearchIntegration.test.js src/components/MetabloomSceneActionIntegration.test.js src/components/MetabloomEmoteIntegration.test.js src/components/OrbNavigationIntegration.test.js
npm run build
npm run lint
node scripts/verify-metabloom-research.mjs
```

The browser harness uses the actual built app and same-origin API handler with
a fictional localhost session and deterministic OpenAI responses. It denies
unexpected provider and browser network requests and never uses real provider
credentials. Both profiles opened the complete 29,955-character report, verified
its final passage and safe citation links, and retained the identical report
after a simulated HTTP 429 from the short writer. The writer received no more
than 16,000 characters of evidence. The same runs verified observed progress,
multiple answer paragraphs in one bubble, scene-gated progressive reveal,
hidden-tab completion, backend reader cancellation on Stop, no stale report,
safe failure references, and ordinary chat recovery without research. No uncaught
page errors or horizontal overflow were observed; report and composer bounds
were checked at both viewport widths.

The first browser attempt passed its long-report and citation assertions but
timed out capturing a screenshot in software Chromium. Screenshot capture is now
optional through `METABLOOM_VERIFY_SCREENSHOTS=1`; both complete functional flows
then passed with capture disabled. No application change was made for that
capture issue, and the current evidence does not include a new screenshot review.

The harness report is written under `metabloom-research-browser` in the
operating system's temporary directory. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`
can select installed Playwright and Chromium; `METABLOOM_VERIFY_PROFILE` can be
`desktop`, `mobile`, or the default `all`. These checks use reduced motion and
software Chromium, so they do not establish hardware rendering performance.

## Earlier full-suite limitations

The original implementation's complete Jest run, before either follow-up,
reported 183 passing suites and three failing suites: 1,390 passing tests and
nine failing tests. The earlier investigation established a baseline lazy-route
failure in `InvoiceGeneratorRoute.test.js`, a baseline logout assertion failure
in `AuthAccess.test.js`, and sandbox subprocess restrictions blocking seven
`DitherCanvasTypography.test.js` cases. The invoice suite passed its isolated
rerun, and all 25 typography tests passed when subprocesses were permitted.
This change reran affected research, client, scene and navigation coverage; it
did not repeat the complete Jest run or change unrelated production code.

## Live provider and deployment boundary

No paid OpenAI request was made during verification. The local environment has
no OpenAI key, and the Vercel log request for this reference returned a
team-scope HTTP 403. The live project's configured model and the exact failed
request usage could not be inspected here. The optional
`METABLOOM_RESEARCH_MODEL` setting requires Responses web search and reasoning;
both passes reuse the existing server-only `OPENAI_API_KEY`. The 180-second
Vercel function duration and existing deadlines are unchanged. Local browser
verification is not a claim of a completed Vercel deployment or live-provider
smoke test.
