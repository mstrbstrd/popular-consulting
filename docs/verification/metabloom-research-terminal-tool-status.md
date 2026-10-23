# Completed research with an incomplete auxiliary web call

Verified on 2026-10-23, based on `main` commit
`1c0378fe3ae7b868cc53af0e6e56ec71a313ac02`.

## Incident and cause

The reported request `b95b194d7c8b` failed with `research_incomplete` and
`tool_not_completed` after 64,645 ms. Its log contained a six-call request
limit, seven web-tool records, 31,102 input tokens, 4,801 output tokens and
2,560 reasoning tokens.

The rejection was in `extractMetabloomResearch`: it allowed only `completed`
and `failed` web-tool statuses. It therefore discarded an overall completed
response if an auxiliary record was `incomplete`, before checking the final
report's message and citation validity. This is separate from a genuinely
incomplete overall response.

The supplied log proves that the overall completion and successful-search
checks had passed. It does not identify the rejected tool's exact status or
establish whether the later citation checks would pass. A deterministic
fixture with six completed tool records, a seventh incomplete record, and a
completed cited report reproduced the same error before this change.

[OpenAI's Responses reference](https://developers.openai.com/api/reference/python/resources/responses/methods/create)
defines `max_tool_calls` as a limit on processed built-in calls and says further
attempts are ignored. Seven returned records alone do not prove that seven
tools executed or were billed. The extra-attempt explanation is consistent
with the log, not a recovery of the original provider payload. The
[web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
separates tool output, report text and URL citation annotations.

## Acceptance rules

- The overall provider response must be completed and error-free.
- At least one actual search must have completed successfully.
- Every report message must explicitly have `status: "completed"`.
- All web-tool records must have a known terminal status: `completed`,
  `failed`, or `incomplete`.
- Pending, missing and unknown tool statuses still reject the response.
- Nonempty report text and valid provider URL annotations remain mandatory.
  Unsafe URLs, invalid citation ranges and missing citations still reject it.
- Existing stream, event, response and report size limits still apply.
- An incomplete auxiliary record is not relabeled as successful and cannot
  establish search execution or populate the report's source table.

The existing `{ notes, sources }` contract remains intact. The API delivers
the validated full report before starting its short writer, preserving it if
that later writer fails. No client protocol, CSS or animation change is needed.

## Progress, diagnostics and spending

Incomplete source checks now report that they could not be completed. Pending
or unknown done-item statuses never become a successful "Searched" or
"Checked" update.

The research log now includes `providerResponseStatus`, fixed-key
`toolStatusCounts`, `completedSearches` and `completedMessages`. Unknown
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

The new regression coverage failed against the original parser and passed
after the server change. All provider responses in these checks are fixtures.

| Check | Result |
| --- | --- |
| Research extraction, provenance, progress, diagnostics and cancellation | 44 passed |
| API integration, full report, writer failure, cached clients and rejection gates | 48 passed |
| Focused client report, protocol, streaming, display gate and scene integration | 6 suites, 264 passed |
| Production build, route HTML and isolated invoice bundle | Passed |
| Full source lint | Passed |
| Modified JavaScript syntax and whitespace checks | Passed |
| Built desktop browser flow, 1280 x 850 | Passed |
| Built mobile browser flow, 375 x 812 | Passed |

Reproduce the server and client checks from the repository root:

```bash
node scripts/metabloom-research.test.cjs
node scripts/metabloom-api.test.cjs
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/MetabloomStreamingClient.test.js src/components/MetabloomResearchDetailsIntegration.test.js src/components/metabloomResearchDisplayGate.test.js src/components/MetabloomSceneActionIntegration.test.js src/components/MetabloomResearchReport.test.js src/components/MetabloomResearchProtocol.test.js
npm run build
npm run lint
node scripts/verify-metabloom-research.mjs
```

The browser harness's completed-report fixture now contains the same six
completed tools plus one incomplete auxiliary tool. It uses the built app,
same-origin API handler and fictional local session, blocks unexpected
requests, and never calls a paid provider. `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_BROWSERS_PATH` can select an installed test browser runtime.

Both browser profiles retained the complete 29,955-character report and its
citations after the incomplete auxiliary call, including when the writer
returned HTTP 429. The same flows verified surfacing before reveal, hidden-tab
completion, Stop cancellation, rejection of missing citations, ordinary-chat
recovery and viewport bounds, with no uncaught page errors. These checks used
reduced motion and software Chromium; they do not measure hardware animation
performance. Verification used a temporary Playwright 1.55.1 / Chromium 140
runtime without changing repository dependencies. No paid provider calls ran.

These checks do not assert that the historical response can be recovered,
that a Vercel deployment is complete, or that a live provider smoke test has
run. Provider outages, real truncation and timeouts still fail safely.
