# Metabloom web research verification

Verified on 2026-10-19 against the implementation based on
`6f6d5ebd8ee675553c3d397f5f7760d0108aa838`.

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
| API integration tests | 25 passed |
| Research extraction, budgets, provenance and cancellation tests | 16 passed |
| Existing provider stream, Jev and real Orb authorization regressions | Passed |
| Research source protocol, UI, reply session, scene and deadline coverage | Passed, including the complete-suite run |
| Built browser flow, desktop 1280 × 850 | Passed |
| Built browser flow, mobile 375 × 812 | Passed |

The browser checks use the actual built app and actual same-origin API handler,
with a fictional localhost session and deterministic OpenAI provider responses.
They verify two research/writing requests, ordered progress and source records,
safe citation links, multiple paragraphs in one bubble, progressive reveal after
the scene returns, backend reader cancellation on Stop, no stale sources, and
ordinary chat recovery with one provider request. Both profiles use reduced
motion. No page errors or horizontal overflow were observed. Completed screenshots
were inspected. This is an integration check, not a hardware performance claim.

Run the reproducible browser check after building, with Playwright available:

```bash
node scripts/verify-metabloom-research.mjs
```

`PLAYWRIGHT_MODULE` can point to an installed Playwright module and
`CHROMIUM_PATH` to a compatible browser executable. The script places its report
and completed screenshots in the operating system's temporary directory under
`metabloom-research-browser`. It denies unexpected provider and browser network
requests and never uses real provider credentials.

## Full-suite limitations established against the baseline

The complete Jest run reported 183 passing suites and three failing suites:
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

## Live provider boundary

No paid OpenAI request was made during verification. The local environment has
no OpenAI key, and the Vercel environment-listing operation returned a team-scope
403. The live project's configured model therefore could not be inspected or
smoke-tested here. The optional `METABLOOM_RESEARCH_MODEL` setting requires a
model supporting Responses web search and reasoning; both passes reuse the
existing server-only `OPENAI_API_KEY`. The configured chat model and its existing
fallback remain in place. Vercel's per-function duration is set to 180 seconds
in `vercel.json` for the research endpoint.
