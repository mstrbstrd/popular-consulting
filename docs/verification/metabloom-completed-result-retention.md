# Completed answer and research retention

PR 01 of the Orb implementation plan, based on `main` commit
`62dae67cbe028bd2a56d94f26b976f2e8bc90a12`. Local verification: 2026-11-02.

## Problem and change

A research response can finish validation before its scene and progressive text
reveal finish. Previously, cancellation and navigation retained only what the
display gate had already published. A complete answer could become an
interrupted prefix, and a completed report or brief could disappear before its
first visible text.

`OrbSection` now reserves one assistant message ID when a reply begins and
retains its validated completed snapshot independently of the display gate.
Stop, replacement, reset, deactivation, and navigation use that snapshot. The
same message receives the full complete answer without replaying the remaining
scene, emotes, or legacy actions.

Research details, sources, and structured briefs keep their existing independent
validation. If the short answer has not finished, retention preserves those
validated artifacts and only the answer text already visible. Hidden unfinished
text is discarded, and the answer remains interrupted or failed. A supported
legacy final envelope retains the research metadata already attached to its
reply session.

Cancellation captures retained content before interrupting the session and gate,
then publishes it after the gate's final update. Navigation cleanup saves that
content directly because it runs before reply teardown. Its interruption flag
uses synchronous pending state, including when Stop and unmount happen in one
React update. The captured `saveToolState` callback remains intact so the app
shell can reject late writes after logout or an account change.

## Verified invariants

| Scenario | Required result |
| --- | --- |
| Complete answer before first text or during reveal | Full answer, complete status, one stable assistant ID |
| New message during the previous answer's reveal | Full completed answer is included in follow-up history |
| Report or brief complete before the writer finishes | Exact validated artifacts survive; short answer remains incomplete |
| Writer fails or final text conflicts with streamed text | Retain validated research; never promote hidden or conflicting answer text |
| Stop immediately followed by navigation | Saved completed answer has no false interruption warning |
| Return to Orb through SPA navigation | Restore retained content without another request or scene replay |
| Late callbacks from a cancelled request | Cannot change the retained reply or newer request |
| Reset | Preserve the conversation while resetting request and presentation state |

The existing transcript and history bounds remain in place. This is the current
tab's SPA snapshot, with existing logout/account invalidation. Reload recovery,
cross-device history, saved workspaces, and background execution remain later
steps in the plan.

## Verification results

| Check | Result |
| --- | --- |
| Three retention integration suites | 93 tests passed |
| Full Jest suite | 207 suites passed, 1,940 tests passed |
| Authentication tests | 6 test files passed |
| Source lint | Passed |
| Production build | Passed, including route generation and private invoice asset isolation |
| Desktop CSS navigation | Passed |
| Phone reduced-motion navigation | Passed |
| Separate Metabloom graphics/demos smoke | Incomplete: screenshot capture timed out before its first viewport completed |
| Whitespace check | Passed |

The full suite first exposed four brief tests that still required the old
discard behavior. Their existing cancellation matrix now asserts retention,
stale callback rejection, saved/restored content, and exclusion of incomplete
answers from follow-up history. Seven route-generation fixture checks initially
hit a sandbox `spawnSync EPERM`; the complete typography suite passed with its
required subprocess permission, without a source change.
The final full run used that same permission and passed all 207 suites.

Both built navigation profiles verified a single document load, conversation
retention, history navigation, session revocation, retained background settings,
and viewport bounds. They used fictional local authentication and fixtures.
The precise completion-before-reveal and cancellation races are covered by the
React integration suites; the existing navigation harness restores an already
completed demo response.

The separate `verify-metabloom-browser.mjs` run timed out on its 20-second CDP
`Page.captureScreenshot` command. A bounded retry with Chromium headless shell
hit the same timeout before any viewport result completed. That smoke check is
not counted as passing. Navigation used Playwright 1.51.1 with Chromium
134.0.6998.35 installed outside the repository. No dependencies changed and no
paid provider calls ran.

## Reproduce

```bash
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/MetabloomSceneActionIntegration.test.js src/components/MetabloomResearchDetailsIntegration.test.js src/components/MetabloomResearchBriefIntegration.test.js
CI=true npm test -- --watchAll=false --runInBand
npm run test:auth
npm run lint
CI=true npm run build
APP_NAV_PROFILE=desktop-css node scripts/verify-app-navigation.mjs
APP_NAV_PROFILE=phone-reduced node scripts/verify-app-navigation.mjs
node scripts/verify-metabloom-browser.mjs
git diff --check
```

The navigation script accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, and
`APP_NAV_EVIDENCE` for an external browser runtime and evidence directory.
The separate Metabloom script accepts `VISUAL_CAPTURE_BROWSER`. Leave
`METABLOOM_VERIFY_ORIGIN` unset for local fixture checks.
