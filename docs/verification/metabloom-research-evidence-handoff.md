# Research evidence handoff regression

## Current contract: October 26 reference selection

A second supplied response contained five explicitly dated research stories but displayed an unavailable zero-of-five briefing. Replaying its date-sentence shape locally established two distinct outcomes: exact original excerpts were accepted, while changing em dashes to ASCII hyphens, copying rendered text without its original Markdown, or including a numeric citation inside the copied excerpt could reject all five. All-null formatter selections could produce the same visible message. The pasted UI alone does not reveal which internal candidate variation occurred; omission counters are needed to distinguish those cases.

The production formatter no longer reproduces date quotations. The host prepares a `dateEvidenceCatalog` of `{ id, sourceId, date, excerpt }` choices from the bounded research evidence and the existing canonical citation map. Choices are limited to 64 entries and 16 KiB of serialized UTF-8 JSON. A choice contains a complete cited passage or sentence of at most 600 characters, one explicit date, and its actual source binding. The catalog preserves original text; it does not assign today's date, reinterpret a source URL as date evidence, cross citation boundaries, or attach a date from another event. It gives sources a turn before taking additional excerpts from the same source.

When a cited passage exceeds the excerpt limit or contains multiple dates, the host considers complete original lines and complete sentences. Named-date abbreviations such as `Oct. 23, 2026` and `23 Oct. 2026` remain intact during boundary detection. Recognized publication-only headers (`Published on`, `Published:`, `Publication:`), wrapper dates and scheduled-only statements are excluded. An actual dated announcement can keep its separate future scheduled milestone. Ambiguous statements remain unselected rather than having a date guessed from context.

The private item contract is now `dateEvidence: { evidenceId }` or `null`. The formatter's schema contains the exact eligible reference IDs and omits `developmentDate` and the old item `dateBasis`. The host resolves the chosen ID to the original date, source and excerpt, checks its membership in the item's sources, and applies the existing calendar-window/future checks. Unknown, wrong-source and null selections do not borrow a nearby date. The retired free-text contract is rejected by the production extractor; historical fixture data is converted to current references in the tests.

The public `metabloom-research-brief-v1` contract is unchanged: clients still receive `developmentDate` and `dateEvidence: { sourceId, quote }`. Optional source publication metadata remains independent. Its absence cannot invalidate an otherwise supported development. This change improves consistency between two model stages; it does not independently authenticate article content or establish that a research model interpreted an article correctly. The instructions explicitly distinguish a Monday update from Sunday's underlying event and a planned trip from a completed trip.

Empty coverage and formatter failures now preserve a useful reading surface: a short host-owned introduction, collapsed **Briefing notes**, and an initially open **Full research** section with a date/coverage caveat after the surfacing gate. No dates, stories or evidence are manufactured to fill a requested count. The same research pass and single replacement formatter remain in use, with no repair call, paid retry, or extra writer. Unnegotiated clients retain their existing stream contract.

The current focused Node suite has 40 passing cases covering reference-only extraction, five-story punctuation/Markdown preservation, absent publication dates, source binding, unknown/null references, retired-contract rejection, original-line and abbreviated-date handling, count/byte limits, stable IDs, wrapper/publication/schedule exclusions, stale/future windows, optional metadata, privacy, and cancellation. Safe formatter logs now include `candidateCount` and `dateEvidenceChoices` beside omission counts; no excerpt, source ID, URL, prompt or generated text is logged.

The sections below retain the October 23 investigation and its historical verification record. Their quotation-copying private contract was superseded by the reference-selection contract above.

## Production symptom and reproduction

The supplied October 23, 2026 response asked for five news events from that day. It displayed an unavailable brief with zero of five stories, a title claiming five developments, and formatter explanations containing internal field names. The completed research remained available below it.

The full pasted research was 10,919 characters without its trailing newline, or 10,920 with it. It fits the existing 16,000-character formatter evidence budget. Evidence clipping was not the cause of this example.

The [minimized fixture](../../scripts/fixtures/metabloom-research-output-20261023.cjs) retains the five candidate developments, the exact date-bearing report sentences, nonbreaking hyphens, Markdown links before canonical numeric references, and all nine source IDs. It excludes the surrounding chat dump. Its canonical source labels identify only the host and ID because the pasted output did not include the canonical source titles. These are excerpts of the model's completed research, not newly authenticated quotations from the original websites.

Before the fix, an isolated check of the previous extraction contract produced the following results:

| Input | Result before the fix |
| --- | --- |
| Full West Bank date-bearing sentence, including its English `Oct. 23, 2026` date | One eligible item, as expected |
| Literal shorter excerpt from that same sentence containing only the original `2026‑10‑23` typographic date | Zero eligible items; the assertion expecting one failed |
| Either candidate set with the observed title and limitations | The inflated five-story title and internal field names remained visible |

The distinction matters: the complete West Bank sentence already contained a date the old parser recognized. The visible zero-item result is consistent with the formatter's own explanation that it left all dates unset because it wanted original-source quotations. The typographic-date rejection is an additional, independently reproduced defect, not proof of the exact internal model output in that production request.

## What the supplied evidence supports

For this regression, eligibility uses the existing calendar-day contract. It does not establish exact event times relative to midnight in Vancouver.

| Candidate as framed in the pasted report | Stated development date | Treatment for October 23 |
| --- | --- | --- |
| U.S. petroleum/refining action under the Defense Production Act | October 22 | Earlier background |
| Nagqu magnitude-7.0 earthquake | October 22 | Earlier event; a separately supported October 23 casualty update would need its own current framing |
| Active Denial System loan approval | October 21 | Earlier background |
| Sakharov Prize announcement | October 22 | Earlier background |
| West Bank attack | October 23 | One eligible current candidate under the supplied dated evidence |

A focused public-source check supports the reason to retain the date distinction. The [White House determination](https://www.whitehouse.gov/presidential-actions/2026/10/presidential-determination-pursuant-to-section-303-of-the-defense-production-act-of-1950-as-amended-on-domestic-petroleum-production-refining-and-logistics-capacity-c139/) and the [Department of Energy release](https://www.energy.gov/articles/energy-department-use-defense-production-act-funding-restart-american-refinery-and-expand) both display October 22. The DOE page also displays October 23 in its **Next Press Release** navigation, for a different release; that navigation date cannot make the current article's development a same-day event. The indexed [original AP West Bank article](https://apnews.com/article/israel-shooting-west-bank-election-f6646718072b4ff6929cff43297edd05) describes the attack as occurring Friday morning, October 23. Direct opening of the AP article was unavailable during this check, so its date confirmation came from the indexed original AP result. These checks did not authenticate every claim or source in the pasted report.

## Changed contract and behavior

The October 23 private formatter field was `dateEvidence.reportExcerpt`, with `dateBasis: "research-excerpt"` for a faithful cited passage from the completed research. That version required the formatter to copy the passage exactly without obtaining an original-source direct quotation. After validation, the host mapped the excerpt into the unchanged public `dateEvidence.quote` field. The October 26 reference-selection contract above replaces this fragile copying step while retaining client compatibility.

Typographic ISO date separators are normalized only for date recognition. The retained evidence text is not rewritten. A source still needs a canonical citation bound to the copied passage; URLs printed in the report do not independently create provenance. Earlier developments, publication-only dates, wrapper dates, invented excerpts, mismatched source IDs, and future events remain ineligible for a bounded same-day news selection.

The research instructions explicitly pass the requested date interval into discovery, distinguish a new update from its older background event, and allow cited paraphrases as evidence. They also request canonical tool citations instead of raw Markdown destinations and avoid unsupported follow-up offers. Existing reports with Markdown links remain readable: a link that exactly matches a canonical source displays its label and a canonical reference, while unknown destinations remain inert text. The saved full report is unchanged.

The host owns coverage titles, scope, and presentation of limitations. One eligible item is shown as one of five with partial coverage. An all-null formatter candidate remains unavailable, with a plain-language explanation and the full report available. It does not acquire invented dates or a title claiming five completed stories. The pipeline still uses one bounded research pass and one replacement formatter, with no repair call, automatic paid retry, or additional legacy writer.

## Verification

The regression suite uses the actual research extractor, structured generator, API handler, and client stream decoder with local provider response fixtures. The browser harness uses the optimized application build and actual API handler with fictional local authentication. Provider requests have no network passthrough, and the browser blocks nonlocal requests. No live research or paid formatter call is used for these checks.

| Check | Result |
| --- | --- |
| `node scripts/metabloom-research-output.test.cjs` | 7 passed on the final server module, including the actual API and decoder path |
| `node scripts/metabloom-research-brief-api.test.cjs` | 8 passed on the final server module; old clients, auth, quota, cancellation, fallback, and automatic/explicit parity remain covered |
| `node scripts/metabloom-research-brief.test.cjs` | 33 passed, including the final negative marker/provenance test |
| Original research and API suites | 45 research tests and 49 API tests passed earlier in this review, before the final formatter-only marker exclusion |
| Research text helper, brief integration, and full-report integration | 3 client suites, 39 tests passed |
| Changed client-file lint | Passed |
| `npm run build` | Passed, including route metadata generation and isolated invoice/private-content checks |
| Built-browser `regression` profile | Passed at 1280 and 320 pixels; both one-of-five and zero-of-five cases passed at each width |

The optimized frontend build was generated at **2026-10-23 20:53:43 UTC** from the implementation working tree based on `14e0a850e5f63c8f83fd8101ff64ef673a1cb870`, on `fix/orb-research-evidence-handoff`. Its entry bundle is `main.8e148848.js`, the Orb bundle is `610.0b321aea.chunk.js`, and the asset manifest SHA-256 is `24ae69657cbeb38d63464382a96b6fea1bfdeff8d63282ac1166e72a4713fe62`.

The browser run used that frontend build and the revised excerpt/coverage server path. A subsequent server-only hardening excluded numeric markers embedded in Markdown labels or destinations; the final provider and production-shaped CJS suites were run after that change. The browser's valid citation fixtures follow the same accepted path and the frontend assets did not change. There was no additional browser run for that exclusion-only change. The earlier 375-pixel baseline was not rerun for this follow-up. This is local application verification, not a deployment check or a live-model quality evaluation.

The local browser evidence is written to `/tmp/metabloom-research-browser/report.json`. The new screenshots are `desktop-production-current.png`, `desktop-production-empty.png`, `narrow-mobile-production-current.png`, and `narrow-mobile-production-empty.png` in that directory. Their visible headers were reviewed. At 320 pixels the coverage and story detail continue below the opening viewport; the DOM assertions verify their counts, content, links, and horizontal bounds. These temporary outputs are verification evidence, not application assets.

The focused browser profile runs the existing long-report, hidden-tab, Stop, invalid-research, ordinary-chat recovery, and formatter-failure scenarios, plus both production-shaped coverage cases at desktop width and 320 pixels. The new assertions cover one current story versus the older four, honest empty coverage, internal-field suppression, source IDs eight and nine, native opening position, all-content surfacing, exact saved report data, safe Markdown display, canonical link targets, no duplicate numeric reference, and horizontal bounds.

Run the focused checks from the repository root:

```sh
node scripts/metabloom-research-output.test.cjs
node scripts/metabloom-research-brief-api.test.cjs
node scripts/metabloom-research-brief.test.cjs
npm run build
METABLOOM_VERIFY_PROFILE=regression METABLOOM_VERIFY_SCREENSHOTS=1 node scripts/verify-metabloom-research.mjs
```

The harness pins the server time to `2026-10-23T20:39:00.000Z` and uses `America/Vancouver` in the browser, matching the pasted result's calendar context. It needs Playwright, Chromium, and permission to bind a local loopback port. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select an already installed runtime. The default profile still includes 1280, 375, and 320 pixels; `regression` selects 1280 and 320 pixels.

The mocked formatter proves that the application accepts eligible output and rejects the tested unsupported variants. It does not prove how a live model will answer every prompt. The six-call research budget, model selection, source availability, and the quality of the retrieved evidence still limit how many current stories a given run can establish. The system must show that limit honestly rather than manufacture a complete list.

The existing functional GitHub workflow now includes the structured-provider, brief-API, and production-shaped output CJS suites so these checks continue to run in CI.
