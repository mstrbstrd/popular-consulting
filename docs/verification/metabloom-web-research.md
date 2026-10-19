# Metabloom web research verification

Updated on 2026-10-19 against the follow-up implementation based on
`4456ccd0c48178b44266607e7264479ef0acc60d`.

## Production failure and correction

The user supplied this sanitized production research result: failure after
82,471 ms, seven web-tool records, 31,411 input tokens, 5,928 output tokens and
2,816 reasoning tokens. The old extractor rejected more than six web-tool
records before reading the brief. That record count is a sufficient rejection
condition; the log does not establish the status or billing of each record.

The corrected implementation preserves `max_tool_calls: 6` in the OpenAI
request and separately bounds returned output items to 64. OpenAI documents
the former as a processed-tool-call limit, not an output-array-length limit.
A completed cited brief containing seven tool records now proceeds to writing
without a retry. The actual search, completed response and citation checks still
apply. Failed attempts can coexist with a completed search and valid evidence.

Research now consumes provider SSE and emits short progress summaries from
observed tool events. The new client opts in with `streamResearchProgress: true`;
older cached clients keep the prior event sequence. Hiding the page skips the
current presentation scene while preserving its request and answer. Explicit
Stop, reset, replacement, deactivation and unmount still cancel obsolete work.

Failures preserve a safe reason code and a 12-character request reference in
the UI, browser diagnostic and `X-Metabloom-Request-Ref` header. Server logs add
the stage and selected provider diagnostics without raw provider messages,
prompts, research notes, queries or source URLs.

## Application behavior

The Deep Research toggle, or a validated automatic research choice, runs a
bounded OpenAI web-search pass followed by the existing strict-schema writer.
Only annotated sources from a completed search can populate the source table.
The complete answer and its citation IDs validate before answer text is sent.
The Orb displays search/writing progress, then completes its existing surfacing
sequence before progressively revealing one answer with inline links and sources.

## Checks performed

| Check | Result |
| --- | --- |
| Production build, including route HTML and isolated private invoice bundle | Passed |
| Full source lint and whitespace validation | Passed |
| API integration tests, including seven-record success and cached-client compatibility | 29 passed |
| Research extraction, SSE, budgets, provenance, errors and cancellation tests | 29 passed |
| Existing provider stream regressions | 15 passed |
| Jev and real Orb authorization regression files | Passed |
| Protocol, API client and safe error coverage | 7 suites / 232 tests passed; 3 affected suites / 50 tests passed after the capability flag |
| Research UI, scene, visibility, ordinary streaming and navigation coverage | 6 suites / 139 tests passed |
| Built browser flow, desktop 1280 × 850 | Passed |
| Built browser flow, mobile 375 × 812 | Passed |

The browser checks use the actual built app and actual same-origin API handler,
with a fictional localhost session and deterministic OpenAI provider responses.
They verify seven returned tool records with a six-call request budget, two
research/writing requests, observed progress and ordered source records,
safe citation links, multiple paragraphs in one bubble, progressive reveal after
the scene returns, backend reader cancellation on Stop, no stale sources, and
ordinary chat recovery with one provider request. They also dispatch a hidden
document visibility event, complete research through the actual handler, return
to the page and verify the retained answer and citations. An uncited research
fixture verifies that the UI displays the safe error code and reference without
creating an answer or automatically retrying. Both profiles use reduced
motion. No page errors or horizontal overflow were observed. Progress text,
its contrasting surface and viewport bounds were checked in the browser, and
completed screenshots were inspected. This is an integration check, not a
hardware performance claim.

After the progress contrast polish, the final desktop run passed. The mobile
startup in that combined run timed out while locating the research toggle,
before any API request. An isolated mobile rerun using the same built app,
role locator and normal checkbox action passed every scenario, including the
contrast and bounds checks, with no page or server errors. No application
change was made for that rerun. The harness now supports profile selection and
records active page errors and blocked control ancestry on failure.

Run the reproducible browser check after building, with Playwright available:

```bash
node scripts/verify-metabloom-research.mjs
```

`PLAYWRIGHT_MODULE` can point to an installed Playwright module and
`CHROMIUM_PATH` to a compatible browser executable. The script places its report
and completed screenshots in the operating system's temporary directory under
`metabloom-research-browser`. Set `METABLOOM_VERIFY_PROFILE=desktop` or `mobile`
to run one profile in isolation; the default runs both. It denies unexpected
provider and browser network requests and never uses real provider credentials.

## Earlier full-suite limitations established against the baseline

The original implementation's complete Jest run, before this follow-up, reported
183 passing suites and three failing suites:
1,390 passing tests and nine failing tests. The failures were investigated:

- `InvoiceGeneratorRoute.test.js`: the same lazy-route loading failure reproduces
  on the untouched baseline commit. The current isolated rerun passes.
- `AuthAccess.test.js`: the exact logout/remaining workspace assertion fails
  identically on the current checkout and untouched baseline. The affected auth
  and invoice files are unchanged by this feature.
- `DitherCanvasTypography.test.js`: seven fixture checks were blocked by sandbox
  subprocess permissions. All 25 tests in that suite pass when those local
  subprocesses are permitted.

No unrelated production code was changed to hide or address those failures.
This follow-up reran the affected research, client, scene and navigation suites;
it did not repeat the complete Jest run.

## Live provider boundary

No paid OpenAI request was made during verification. The local environment has
no OpenAI key, and the Vercel environment-listing and runtime-log operations
returned team-scope 403 responses. The user supplied the production failure
log above; its seven-record rejection has a deterministic API regression.
The live project's configured model could not be inspected or smoke-tested
here. The optional `METABLOOM_RESEARCH_MODEL` setting requires a
model supporting Responses web search and reasoning; both passes reuse the
existing server-only `OPENAI_API_KEY`. The configured chat model and its existing
fallback remain in place. Vercel's per-function duration is set to 180 seconds
in `vercel.json` for the research endpoint.
