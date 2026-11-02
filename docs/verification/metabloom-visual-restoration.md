# Restore native visuals during app navigation

PR 02 of the Orb implementation plan, based on PR 01 commit
`e71a80bc42d0446b1d63dd5d333d6a28dc816de4` (PR #192).
Local verification: 2026-11-02.

## Behavior

Leaving Orb releases its visual portals and aborts unfinished requests. The
existing account-scoped tab cache now retains completed visual specifications,
sources, exact message associations, original offer expiry, and local view state.
Returning reconstructs the native controls without another start, generation,
continuation, or ordinary model request.

Completed visuals remain useful even if their closing explanation has not
finished. That visual returns after its original user message, without inventing
a completed answer or restarting the explanation. A generation that had not
finished returns as a stopped card. Late callbacks from the old mount are ignored.

| Visual state | Restored behavior |
| --- | --- |
| Calculator | Exact input drafts and local calculated result; Reset values still uses generated defaults |
| Table | Sort column/direction and filter |
| Line chart | Inspected observation and expanded exact-values table |
| Bar chart | Expanded exact-values table |
| Pie chart | Selected category and expanded exact-values table |
| Flowchart | Selected node and expanded steps/connections |
| Selected calculator | The previously selected calculator, including an older one among multiple results |

## Boundaries and lifecycle

The snapshot is versioned and capped at 12 records and 256 KiB of UTF-8 data.
The serializer projects plain data only, validates and clones it, and keeps the
newest records within both limits. It cannot serialize controllers, signals,
provider callbacks, timers, or DOM nodes. The restore reader validates specs,
sources, local view state, IDs, exact ownership, versions, and aggregate size.
Malformed records do not remove unrelated valid neighbors. Invalid snapshot
versions and oversized envelopes restore nothing.

Known assistant IDs own the restored visual. If the originating user is still
retained, an explicit visual's assistant must immediately follow that exact user.
If the user was pruned but its assistant remains, that completed result survives.
Only a tool with no closing assistant can use its exact original user as owner.
An orphan is never attached to the latest reply.

Restoration waits for the current Orb transcript registration. Saved view state
is captured synchronously on user edits so immediate navigation retains it.
Cleanup re-arms the snapshot for React's development remount check, and control
initialization does not change selection. Restored frames cannot restart tool
continuation or emit another generation-ready event.

The component captures its owning mount's `saveToolState` callback. Existing
logout/account invalidation rejects a late write from the previous account.
Orb Reset clears live and saved visuals while retaining the conversation from
PR 01. Full refresh, cross-device persistence, and new selection-aware follow-up
controls remain separate plan steps. Expired completed visuals remain locally
readable; server follow-up ownership and expiry checks remain authoritative.

## Verification results

| Check | Result |
| --- | --- |
| Visual lifecycle, restoration, snapshot, conversation, and shell suites | 6 suites, 98 tests passed |
| Existing frame and interaction suites | 2 suites, 26 tests passed |
| Visual API and native tool contract checks | 2 test files passed |
| Full Jest suite | 209 suites, 1,983 tests passed |
| Source lint | Passed |
| Authentication tests | 6 test files passed |
| Production build | Passed, including route generation and private invoice asset isolation |
| CSS native UI browser suite, including the new SPA roundtrip | All 9 cases passed |
| Desktop and reduced-motion navigation | Both profiles passed; one document load and conversation retention |
| Whitespace check | Passed |

The new browser case created two calculators, edited the older one to
17 hours at 85 CAD/hour, and recorded 1,445 CAD. Orb to Home and back through the
experience switcher retained the same document and reconstructed both visuals
with the same artifact IDs, assistant IDs, input values, and results. The older
calculator remained selected. Request counts stayed at two starts, two
generations, two continuations, and zero ordinary requests across the roundtrip.
One subsequent ordinary follow-up used the restored inputs without regenerating
either calculator. The captured restored card visibly showed the saved values
and 1,445 CAD result.

The harness waits for the experience switcher to become visible and non-inert,
including completion of Home's initial welcome transition. It checks the document
sentinel immediately after both navigations, so an unintended full reload cannot
be mistaken for a restoration failure. The existing continuation-failure assertion
now matches the application's current explanation-failure wording.

All browser and API checks use fictional local authentication and fixtures.
No paid provider requests are required.

## Reproduce

```bash
CI=true npm test -- --watchAll=false --runInBand
npm run lint
npm run test:auth
node --test scripts/metabloom-visual.test.cjs scripts/metabloom-ui-tools.test.cjs
CI=true npm run build
node scripts/verify-metabloom-ui-browser.mjs
APP_NAV_PROFILE=desktop-css node scripts/verify-app-navigation.mjs
APP_NAV_PROFILE=phone-reduced node scripts/verify-app-navigation.mjs
git diff --check
```

The native UI harness accepts `VISUAL_CAPTURE_BROWSER`. Navigation accepts
`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, and `APP_NAV_EVIDENCE` for an external
browser runtime and evidence directory.
