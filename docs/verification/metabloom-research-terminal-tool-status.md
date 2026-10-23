# Validate completed research independently of auxiliary tool records

Verified on 2026-10-23, based on `main` commit
`df5f3acc8fc6b9d21cfeb400a3c88dbb242b5492`.

## Incident and cause

The reported request `b95b194d7c8b` failed with `research_incomplete` and
`tool_not_completed` after 64,645 ms. Its log contained a six-call request
limit, seven web-tool records, 31,102 input tokens, 4,801 output tokens and
2,560 reasoning tokens.

The rejection was in `extractMetabloomResearch`: it required all web-tool
records to have accepted statuses before validating the final report. The first
fix added `incomplete` to `completed` and `failed`, but kept this blanket gate.

After that fix reached `main`, request `feeaa924ec38` failed at the same gate
after 66,774 ms. The new diagnostics show `providerResponseStatus: "completed"`,
seven web-tool records, five completed searches, one completed message, 26,438
input tokens, 5,521 output tokens and 3,008 reasoning tokens. The first fix was
too narrow: a pending, missing or unrecognized auxiliary status still rejected
the response before its report and citations were checked.

The copied `toolStatusCounts` is collapsed, so the exact residual status is
unknown. The log does not establish whether the later citation checks would
pass. Regression fixtures reproduce the visible counts with several residual
statuses and valid citations; they are synthetic variants, not a recovered
provider response.

[OpenAI's Responses reference](https://developers.openai.com/api/reference/python/resources/responses/methods/create)
defines `max_tool_calls` as a limit on processed built-in calls and says further
attempts are ignored. Seven returned records alone do not prove that seven
tools executed or were billed. The extra-attempt explanation is consistent
with the log, not a recovery of the original provider payload. The
[streaming reference](https://developers.openai.com/api/reference/resources/responses/streaming-events)
defines overall response completion separately from tool progress. The
[web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
separates tool output, report text and URL citation annotations. These docs do
not specify which status every ignored attempt will use. The application now
validates the final report independently instead of guessing that status.

## Acceptance rules

- The overall provider response must be completed and error-free.
- At least one actual search must have completed successfully.
- Every report message must explicitly have `status: "completed"`.
- Nonempty report text and valid provider URL annotations remain mandatory.
  Unsafe URLs, invalid citation ranges and missing citations still reject it.
- Existing stream, event, response and report size limits still apply.
- Auxiliary tool statuses are diagnostic only after these checks pass.
  Pending, missing, failed, incomplete and unknown records are never relabeled
  as successful and cannot establish search execution or populate the source
  table. Sources come only from valid annotations in completed report messages.

This is not acceptance of a partial response. An unfinished overall response,
truncated stream, missing successful search, unfinished report message, or
invalid citations still fails. The rule does not depend on having more than
six records; record count is not an execution count.

The existing `{ notes, sources }` contract remains intact. The API delivers
the validated full report before starting its short writer, preserving it if
that later writer fails. No client protocol, CSS or animation change is needed.

## Progress, diagnostics and spending

Incomplete source checks now report that they could not be completed. Pending
or unknown done-item statuses never become a successful "Searched" or
"Checked" update.

The research log includes `providerResponseStatus`, fixed-key
`toolStatusCounts`, `completedSearches` and `completedMessages`. Flat
`pendingToolRecords` (`in_progress` plus `searching`) and `unknownToolRecords`
counts make residual states visible even when Vercel collapses the nested
object. These counts describe metadata, not live work or billable calls. Unknown
provider status text is reduced to `unknown`, and unavailable counts remain
null. Tests cover malicious property names and private-looking metadata;
prompts, queries, URLs, report text, reasoning and credentials remain absent
from operational logs.

The prompt clarifies that searches, page opens and in-page finds share the
six-call limit and that the model should finish from verified evidence while
stating material gaps. The six-call limit, 10,000 output-token limit,
120-second research deadline, model selection and `store: false` remain
unchanged. No automatic retry or extra model call was introduced.

## Verification

Before the server correction, the updated research suite had five expected
failures and the updated API suite had five expected failures. Both suites
passed after the correction. All provider responses in these checks are fixtures.

| Check | Result |
| --- | --- |
| Research extraction, provenance, progress, diagnostics and cancellation | 45 passed |
| API integration, full report, writer failure, cached clients and rejection gates | 49 passed |
| Modified JavaScript syntax and whitespace checks | Passed |
| Built desktop browser flow, 1280 x 850 | Passed |
| Built mobile browser flow, 375 x 812 | Passed |

The previous patch's production build, source lint and six focused client
suites (264 tests) had passed. No client source, public asset, dependency,
Vercel config or build-script changes were made in this follow-up. Its browser
checks reused that built client against the corrected API; the client-only
build, lint and unit suites were not rerun.

Reproduce the server and client checks from the repository root:

```bash
node scripts/metabloom-research.test.cjs
node scripts/metabloom-api.test.cjs
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/MetabloomStreamingClient.test.js src/components/MetabloomResearchDetailsIntegration.test.js src/components/metabloomResearchDisplayGate.test.js src/components/MetabloomSceneActionIntegration.test.js src/components/MetabloomResearchReport.test.js src/components/MetabloomResearchProtocol.test.js
npm run build
npm run lint
node scripts/verify-metabloom-research.mjs
```

The browser harness's synthetic completed-report fixture contains five
completed searches, one completed page open and one residual `in_progress`
tool record. It uses the built app,
same-origin API handler and fictional local session, blocks unexpected
requests, and never calls a paid provider. `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_BROWSERS_PATH` can select an installed test browser runtime.

Both browser profiles retained the complete 29,955-character report and its
citations, including when the writer returned HTTP 429. They also passed
surfacing before reveal, hidden-tab completion, Stop cancellation, rejection
of missing citations, ordinary-chat recovery and viewport-bound checks, with
no uncaught page errors. They used reduced motion and software Chromium;
they do not measure hardware animation performance.
The temporary Playwright 1.55.1 / Chromium 140 runtime does not change repository
dependencies. No paid provider calls ran.

These checks do not assert that the historical response can be recovered,
that a Vercel deployment is complete, or that a live provider smoke test has
run. Provider outages, real truncation and timeouts still fail safely.
