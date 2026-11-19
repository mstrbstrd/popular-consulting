# Invoice companion verification

Executed on 2026-11-19 against the integrated companion implementation, based on main commit `ec7967b60634b5f49532ec7b6fc25313f730a0ac`. That baseline's research changes are retained.

## Passed locally

| Check | Result |
| --- | --- |
| `CI=true npm test -- --watchAll=false --runInBand` | 262 suites, 2,824 tests passed on the final implementation |
| Functional workflow's complete Node backend test list | 31 files, 660 tests passed |
| `npm run test:auth` | 106 tests passed |
| `npm run lint` | Passed with zero lint warnings |
| `CI=true npm run build` | Production build, route HTML, isolated private invoice build and public dependency/content boundary checks passed |
| `node --test scripts/private-invoice-boundary.test.mjs` | Five tests passed, including transitive, dynamic, unused and controller import rejection |
| `npm run metabloom:improve -- check` | Offline contracts passed; this does not measure model quality |
| `npm run test:metabloom-improvement` | 23 tests passed |
| `node scripts/verify-metabloom-invoice.mjs --http-only` | Existing invoice card/intake flow passed with controlled fictional provider responses |
| `node scripts/verify-metabloom-companion.mjs --http-only` | Actual API and agent produced a validated bounded proposal; no speculative completion; revoked access rejected |
| `git diff --check` | Passed |

The frontend suite includes the actual server proposal to browser bridge to private controller integration: exact CAD 997.50 totals, duplicate delivery, altered duplicate payloads, cancellation, manual revision conflicts, account/thread/document changes, scoped context, replacement and Undo. Component lifecycle tests keep a mocked avatar canvas mounted while navigation retains one in-flight request. Those tests do not establish physical GPU or browser behavior.

The initial full frontend run caught an invoice style rule outside its required screen-only scope. That rule was corrected, the four affected suites passed, and the complete final frontend run above passed. The initial backend run caught an outdated price-book test loader after invoice arithmetic had moved to `invoiceCore`; the test now uses that real shared arithmetic module and the complete backend run passed.

## Browser and external limits

`node scripts/verify-metabloom-companion.mjs` completed its HTTP assertions, then Chromium failed before opening a page: `process_singleton_posix.cc`, `socket() failed: Operation not permitted`. No local browser assertions or screenshots completed. WebKit is not installed in this execution environment. No live provider calls, deployed-site interaction, physical-device rendering, live Redis integration or post-push CI/deployment checks were performed for this release.

The App navigation workflow builds once and supplies that exact build artifact to Chromium and WebKit companion jobs. The companion fixture covers desktop and phone layouts, the actual Orb canvas identity, single-document navigation, one in-flight provider request, receipt-backed edits, manual conflicts, Undo, Stop, print exclusion and session revocation. These are configured CI gates, not locally observed browser passes.

## Review flow

1. Sign in with an existing invoice administrator account and open `/orb`.
2. Submit `Start an invoice draft`. The actual invoice page should open without a document reload, with the existing Orb docked at the bottom right.
3. Open Chat and provide fictional invoice details. Missing values remain incomplete; confirmed changes appear on the actual page.
4. Edit a field manually while an assistant update is pending. The late update must report a conflict and preserve that edit.
5. Try Undo, Stop, browser Back/Forward and Open full chat. Review print preview to confirm companion controls are excluded.

Existing invoices require an explicit choice to connect or replace them. Additional contact/address/notes fields require scope selection. Assistant actions do not save, print, send or charge an invoice.

To disable actions independently, set `METABLOOM_WORKSPACE_ENABLED=0`. To disable companion presentation at build time, set `REACT_APP_METABLOOM_COMPANION_ENABLED=0`. Existing manual editing and the previous complete-draft handoff remain available.
