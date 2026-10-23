# Metabloom structured research brief

## Purpose

A successful deep-research pass should produce a useful, navigable briefing without adding another research pass or requiring an arbitrary generated UI. A short chat paragraph is not an adequate presentation for a request such as a deep dive into five news stories. A dated request also needs an explicit interval and an honest indication when the available evidence supports fewer items.

This change adds a native research brief within the existing assistant message. Each item has a headline, overview with source references, expandable analysis and background, uncertainties, and follow-up questions. News briefs display the host-owned as-of time, timezone, covered interval, development dates, and coverage count. Sources and their available metadata are a separate disclosure. The full completed report remains available below the brief.

## Request and provider contract

The client opts in with `streamResearchBrief: true` together with `streamResearchDetails: true`. It supplies a validated IANA `timeZone` from the browser, with UTC as the fallback. The server owns the clock and derives the request's temporal context before research starts. Clients without the new capability keep the legacy writer and event vocabulary.

The negotiated path uses the same bounded research pass followed by one structured formatter. The formatter replaces the short-answer writer. It receives selected whole passages, at most 16,000 note characters, and at most 40 original source IDs. Its Responses request uses a strict JSON schema, `stream: false`, `store: false`, a 6,000-token output ceiling, and no tools. There is no repair call or automatic paid retry. If no cited passage fits the evidence selection, the completed report can be delivered without starting the formatter.

The final normalized brief has a 96 KiB UTF-8 limit. It is sent in ordered `research_brief_delta` chunks of at most 2,048 characters followed by `research_brief_complete`, after the full-report completion, legacy source list, and synthesizing state. The client validates the full assembled object against the full report's canonical sources before accepting it. The legacy source list remains bounded at eight; it does not truncate the brief's source references.

The API's introduction is deterministic application text with bounded complete headlines when they fit. Factual overviews and background remain in the brief. Automatic research chosen by Jev and the explicit Deep Research toggle use the same brief content regardless of the paragraph preference. Structured research does not add a separate optional visual-generation pass.

## Date, evidence, and coverage behavior

The host supplies the normalized brief's version, kind, as-of time, timezone, local date, date interval, and coverage result. A formatter cannot redefine those fields. Supported current, relative, and historical request forms are covered by the temporal unit tests. The limits are explicit calendar intervals in the chosen timezone, rather than a claim that every relative phrase means a rolling 24-hour duration.

A dated news item must have an eligible development date and a date-bearing excerpt supported by the cited research passage. A publication date, navigation date, copyright date, wrapper update, or future scheduled milestone does not establish that the underlying development happened in the requested interval. Future scheduled dates are separate from actual development dates. Unsupported or ineligible items are omitted, with coverage limitations reported. Unknown publication dates and publishers remain unknown. The renderer labels excerpts as research excerpts rather than implying independent retrieval of a verbatim original-source quotation.

Returning three supported items for a five-item request is partial coverage. Empty eligible coverage is unavailable. The system does not pad the list or silently broaden its date interval. The report and formatter prompts also distinguish analysis from reported claims, caution against counting syndicated copies as independent corroboration, and avoid presenting a model's selection as an objective global ranking.

These checks establish consistency with the completed research and its citation map. Development-date evidence has calendar-day precision; it does not establish an exact publication time or a rolling-hour cutoff. The checks do not independently authenticate publishers, prove that every supported statement is true, guarantee exhaustive news coverage, or perform comprehensive semantic event deduplication. The six-call research budget remains a practical limit on coverage.

## Failure and presentation boundaries

Malformed structured output, a formatter HTTP error, or a failed final formatting response produces a deterministic introduction pointing to the completed full report. No partial brief is rendered, and there is no legacy writer fallback that creates another paid call. A failed research pass still fails before formatting and does not manufacture a brief.

All brief content and links remain behind the existing surfacing gate. The completed brief's header is visible on arrival when the user is following the latest message; a reader's earlier scroll position is preserved. Stopping, replacing, resetting, deactivating, or unmounting a still-held request rejects its later callbacks. Hiding the tab does not abort research; the completed result remains available on return. Restored brief data is revalidated with its retained report and copied independently. The full report's exact notes remain in the conversation snapshot even though its display now renders a small safe subset of headings, lists, and paragraphs.

The brief is a native React component with inherited gradient and glass styling. It does not execute model HTML, scripts, or generated URLs. Link targets come from canonical research sources. Its native disclosure controls work with the keyboard. This change does not introduce a persistent cross-conversation artifact library, downloadable document, timeline, map, or dashboard.

## Verification

All provider responses in these checks are fictional local fixtures. No paid provider or live research request is used.

| Check | Coverage | Result |
| --- | --- | --- |
| `node scripts/metabloom-research-brief.test.cjs` | Temporal windows, exact date evidence, citation binding, duplicate evidence, count/coverage limits, provider contract, abort, privacy, and response bounds | 26 passed |
| `node scripts/metabloom-research-brief-api.test.cjs` | Real API, generator, and decoder; source IDs above eight; partial coverage; one research and one formatter; automatic/explicit parity; old clients; safe fallback; auth, quota, validation, cancellation | 8 passed |
| `metabloomResearchBriefProtocol.test.js` | Canonical IDs, independent copies, date and coverage invariants, Unicode byte limits, ordered chunks, negotiation, and report/source consistency | 32 passed |
| `MetabloomResearchBriefIntegration.test.js` | Real Orb and native component; surfacing; canonical source links; callback order; stale work; hidden tab; clone isolation; restored data | 13 passed |
| `MetabloomResearchBriefScroll.test.js` | One-time arrival anchoring and preservation of a reader's earlier scroll position | 2 passed |
| `MetabloomResearchDetailsIntegration.test.js` | Full report above 16,000 characters, up to 65 sources, preserved final text, error recovery, history isolation, safe semantic formatting, and restored reports | 18 passed |
| `npm run build` | Optimized application build, route HTML, isolated invoice entry point, private-content checks | Passed |
| `npm run lint` | Full source lint | Passed with zero warnings |
| `scripts/verify-metabloom-research.mjs` | Built UI with actual API handler, client stream, native brief, local auth fixture, and mocked providers | Passed at 1280, 375, and 320 px, including the final opening-position check |

The final local production build was generated on 2026-10-23 at 19:49:06 UTC from the implementation working tree based on `187c72d450f5646c21cfda6efd5d8f1654587044` on `feat/orb-structured-research-brief`. Its entry bundle is `main.a6d2140e.js`, the Orb bundle is `833.c2fd89aa.chunk.js`, and the asset manifest SHA-256 is `095528777157b2395b925a00b3a23878b19cb84fb470a926da96737e6ea31391`. The final three-profile browser run used that build. This is local built-application evidence, not a deployment or live-provider verification.

The browser harness exercises dated partial coverage, a report longer than the formatter input budget, exact source-link targets, all-content surfacing, native Enter-key disclosure, hidden-tab completion, Stop, invalid research, ordinary-chat recovery, formatter HTTP 429 fallback, and horizontal bounds. Its synthetic research response also retains the earlier regression case: five completed searches, one completed page opening, an auxiliary pending record, and a valid completed report. The pending metadata must not discard the completed report. Its network mock has no provider passthrough, and the browser blocks nonlocal requests. It captures request counts, sanitized protocol records, DOM timing observations, layout measurements, and optional screenshots under the system temporary directory.

Run the focused checks from the repository root:

```sh
node scripts/metabloom-research-brief-api.test.cjs
node scripts/metabloom-research-brief.test.cjs
CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/MetabloomResearchBriefIntegration.test.js src/components/MetabloomResearchDetailsIntegration.test.js
npm run build
node scripts/verify-metabloom-research.mjs
```

The browser harness requires Playwright and Chromium. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select an already installed local runtime. `METABLOOM_VERIFY_PROFILE=desktop`, `mobile`, or `narrow-mobile` restricts a diagnostic rerun; the default verifies all three widths (1280, 375, and 320 px). `METABLOOM_VERIFY_SCREENSHOTS=1` captures screenshots. Local loopback binding and browser execution must be permitted by the execution environment.

## Implementation references

- [API orchestration and bounded evidence selection](../../api/metabloom.js)
- [Temporal context and structured formatter](../../server/metabloomResearchBrief.js)
- [Research provider and completed-report validation](../../server/metabloomResearch.js)
- [Shared brief contract](../../src/components/metabloomResearchBriefProtocol.js)
- [Stream decoder](../../src/components/metabloomEmoteProtocol.js) and [API client](../../src/components/metabloomApiClient.js)
- [Native brief](../../src/components/MetabloomResearchBrief.js), [styles](../../src/components/MetabloomResearchBrief.css), and [Orb integration](../../src/components/OrbSection.js)
- [API integration tests](../../scripts/metabloom-research-brief-api.test.cjs), [Orb integration tests](../../src/components/MetabloomResearchBriefIntegration.test.js), and [built-browser verification](../../scripts/verify-metabloom-research.mjs)
