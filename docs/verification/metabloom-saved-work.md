# PR05 saved-work verification

Base: merged PR #197, commit `63cccfa20bcf228f873fa6273667614b74300365`.
Implementation contract: [durable Orb saved work](../architecture/metabloom-saved-work.md).

## Story and scope

The verified foundation is: a valid authenticated session provides a stable
server-only account identity; an explicit store operation validates its content;
a transaction retains private immutable content and evidence; later owned reads
return the same content without generation. PR06 will expose this through
Save/Open and the existing renderer.

PR05 adds no browser controls or public save endpoint. It performs no production
migration, resource provisioning, provider request or environment update.

## Completed local checks

| Check | Result |
| --- | --- |
| Initial implementation: full application Jest suite | 213 suites / 2,098 tests passed |
| Authentication suite, including stable account identity | 106 passed |
| Existing API/research/visual/provider contracts | 403 passed |
| New saved-content validation | 41 passed |
| New database configuration, TLS and migration CLI contracts | 12 passed |
| New store/migration transaction contracts | 16 passed |
| Source and new server-boundary lint | Passed |
| Production build | Passed, including route HTML and private invoice isolation |
| Integration harness target guard and pool teardown regressions | 4 passed without a database connection |
| Workflow parsing, syntax and whitespace checks | Passed |

The 69 new foundation tests run with `npm run test:saved-work`. Account identity
tests are part of `npm run test:auth`. They verify that rejected/expired/foreign
sessions cannot produce account authority and that login/epoch/namespace/origin/
Redis-key changes do not alter the durable key for the same issuer and subject.

Content cases exercise every native visual kind, valid/invalid calculator
scenarios, sparse citations, report-only saves, full 1 MiB ASCII/Unicode report
boundaries, maximum-size briefs, coverage and historical dates. Media tokens and
unsafe/non-JSON structures cannot enter durable content.

Store contract tests verify validation before connection acquisition, captured
immutable arguments, transaction rollback, connection release/destruction,
cancellation boundaries, database marker validation and migration checksums.
Configuration tests reject environment mismatches, URL overrides, weakened TLS,
mutable TLS options and target-swapping getters. Driver errors are sanitized.

## Limited local SQL evidence

Fourteen SQL/store checks passed against **PostgreSQL 18.6 / PGlite 0.5.14**, a
temporary local WebAssembly runtime with one connection. No PGlite dependency is
added to the application or repository lockfile.

The checks covered:

- Migration/reapplication, immutable marker/ledger, namespace mismatch and checksum drift.
- Exact full 1 MiB research, all 12 fixture source links, dates and coverage.
- Private ownership, revision history, stale version rejection and unchanged earlier content.
- Immutable rows, unrelated nested-trigger rejection and artifact deletion cascades.
- Create-request tombstones and account-parent deletion cascades.
- Failure after evidence insertion, with complete create/append rollback.
- The restricted runtime role, including successful create/read/append/rename/delete.
- Rejection of marker changes, direct account/child deletion, truncation and schema DDL under that role.

These checks establish useful SQL semantics but **do not establish success of
the native PostgreSQL 16 wire driver, concurrent transactions, migration CLI or
native backup/restore**. Those require the separate real-server gate below.

## Real PostgreSQL CI gate

`.github/workflows/metabloom-saved-work.yml` adds a disposable `postgres:16`
service with Node 24 and matching PostgreSQL 16 backup tools. It runs the account
and foundation contracts before `scripts/metabloom-saved-work-postgres.test.cjs`.
The TAP pipeline explicitly uses Bash with pipefail, so a failing test cannot be
hidden by a successful evidence upload. Only TAP output is uploaded, never a
database dump.

The integration suite has 19 cases: an offline target guard, three offline pool
teardown regressions and 15 cases that require an actual PostgreSQL 16 server.
It verifies:

1. Migration application/reapplication, rollback, checksum drift and missing-marker rejection.
2. Stable account/default-workspace creation and ownership across read/list/mutation paths.
3. Exact large research, canonical sources, original dates, coverage and calculator inputs.
4. Immutable revisions, composite ownership constraints and nested-trigger defenses.
5. Atomic rollback after evidence insertion in create and revision operations.
6. Concurrent idempotent creates, competing expected-version updates and quota races.
7. Physical deletion, retired create requests and bounded request retention.
8. Pagination, explicit unsupported versions and corrupt-content rejection.
9. The real migration command and a restricted runtime role.
10. Native `pg_dump`/`pg_restore` into another empty disposable database, followed by ownership, history, checksum, tombstone and deletion checks.

The harness accepts only explicit opt-in, literal loopback hosts and the dedicated
`orb_saved_work_test_admin` fixture database. It creates randomly named test
databases, removes only its fixtures and rejects URL connection overrides.

## First native CI run and teardown correction

[The first PostgreSQL CI run](https://github.com/mstrbstrd/popular-consulting/actions/runs/41587084175/job/125755002660)
passed 15 of its original 16 cases, including native backup/restore, quota races,
ownership, migrations and restricted runtime privileges. The duplicate-create
and competing-revision case failed during cleanup with an uncaught
`terminating connection due to administrator command` error.

The pinned driver's `pool.end()` can resolve after removing idle clients from
its pool bookkeeping but before their sockets finish closing. The fixture then
issued `DROP DATABASE ... WITH (FORCE)`, which could terminate a still-closing
connection. This was a test teardown race.

Fixture cleanup now tracks each connected client's actual `end` event and waits
for those events after `pool.end()`, including for reconnect and administrator
pools. It then uses ordinary `DROP DATABASE`, so leaked connections remain a
test failure. No error is suppressed and no delay or retry masks the race.

Three deterministic offline regressions use the installed `pg.Pool` with a
controlled client to cover idle, checked-out and empty pools. The idle-client
case reproduces the failure with the old pool-only shutdown and passes with
the corrected cleanup. Application code, database schema and concurrency
assertions are unchanged.

[The corrected PostgreSQL CI run](https://github.com/mstrbstrd/popular-consulting/actions/runs/41588343816/job/125758972701)
completed successfully for foundation head
5f86551d975ab43521d53ebfbb4ea56280d0c934. Its 19 cases include the 15 native
PostgreSQL checks. This resolves the foundation's original merge gate.

The correction's full Jest rerun completed with 211 of 213 suites and 2,096 of
2,098 tests passing. Two unchanged UI tests failed: the HomePage recovery class
assertion and a five-second calculator-restoration timeout. An isolated rerun of
both files passed all 34 tests with unchanged assertions and timeouts.

## Unrun checks and activation boundaries

The native integration suite was **not run locally**. Official PostgreSQL 16.15
server/client binaries were available, but `initdb` refuses root. This execution
environment maps only UID/GID 0 and denies a supported nonroot namespace setup.
No root-check or sandbox restriction was bypassed.

The corrected foundation CI result above was read from the completed check.
It does not establish the status of later endpoint changes or hosted activation.

No hosted PostgreSQL resource, deployed database connection, provider backup
policy or live saved-work user flow has been verified. Provisioning, restricted
credentials, isolated preview/production databases and provider recovery checks
precede PR06 activation. The PR06 browser acceptance flow remains explicit Save,
new login or reload, then identical Open with zero model calls.

## Step 5 HTTP adapter and client

The follow-up adds the authenticated endpoint, server-owned source resolution,
fresh session-reference restoration and a bounded browser client. It shares
the durable-content validator between server and client through the existing
server import alias. The HTTP contract is documented in
[saved-work API](../architecture/metabloom-saved-work-api.md).

Local verification on the supplied e33756e main base plus PR198:

| Check | Result |
| --- | --- |
| Saved content, database, store, API and client contracts | 93 passed |
| Authentication suite | 106 passed |
| Existing API, research, visual and provider contracts | 403 passed |
| Complete application Jest suite | 215 suites / 2,130 tests passed |
| Source and saved-work server/client lint | Passed |
| Offline PostgreSQL harness guard and teardown cases | 4 passed |

The new API/client cases exercise exact owned source ingestion, validated numeric
calculator inputs, complete 1 MiB research, original source/date preservation,
missing configuration, new login and expired-source reopening, usable fresh
follow-up references, cross-account rejection, mutation conflicts, private
metadata, bounded/cancelled transport and sanitized failures. Open makes no
model calls and claims no generation quota.

A new native PostgreSQL case covers the HTTP save/retry path, a separate
connection and new login, exact reopen and selected follow-up resolution,
ownership and conflicting rename/delete operations. The suite now contains
20 cases: four offline and sixteen requiring PostgreSQL 16. The new native
endpoint case was not executed locally: this runtime has no PostgreSQL client,
server, Docker or Podman available on PATH. The existing CI gate runs it.

No production migration, credential update or managed-service provisioning was
performed. A read-only Vercel metadata check found no saved-work environment
configuration, so the deployed feature remains unavailable until its activation
requirements are satisfied. The UI and deployed browser acceptance flow are
separate integration work.

## Orb workspace integration

Saved work is available from **More → Saved work**. More reuses the existing
compact controls entry; reaction previews remain in its collapsed disclosure.
The library mounts on demand, makes one initial list request, and exposes explicit
Save, Open, Rename and Delete actions. No background polling or automatic mutation
retry runs. Its native modal retains keyboard focus, supports Escape, and follows
the mobile visual viewport and safe areas.

Save captures the current owned component/reference and valid numeric calculator
inputs. An unfinished draft disables Save with a visible explanation. A confirmed
save associates only its originating retained message with the saved item. The
panel keeps one captured request ID and source across an uncertain save retry.
The temporary visual offer deadline is not used as the completed artifact's
retention deadline; expiry is resolved by the server.

Open creates an explicit local conversation entry and registers validated saved
content directly in the workspace. It does not call a generator or research
provider. Reopened components receive fresh session-owned reference handles;
research keeps original reports, source IDs, dates and briefs. Neither Open nor
Save changes the existing composer draft or silently stages a message attachment.
Stored names label the workspace without modifying the original spec or evidence.

A newer workspace selection, a pending chat request, a closed panel, an account
change or route unmount rejects a late Open. At conversation capacity, older
messages are pruned only after successful local placement. Failed placement keeps
the prior message set and live renderer/report state intact.

UI coverage is in `MetabloomSavedWorkPanel.test.js` and
`MetabloomComponentWorkspace.test.js`. It exercises confirmed/uncertain saves,
new-conversation Open with exact values and fresh follow-up references, unchanged
drafts, real research carousel state, full-capacity rollback, delayed response
ownership, unavailable storage, rename/delete confirmation and modal cleanup.
The pure workspace adapter validates saved Open envelopes and refuses to replace
invalid live calculator drafts with initial values.

A read-only check also found no installed Vercel Marketplace integrations for the
connected team. The project still needs its PostgreSQL connection and explicit
migration before saved storage can activate. There is no localStorage success
fallback. Browser geometry and native focus trapping have not been revalidated
in this environment because the Playwright browser runtime is unavailable.

## Step 6 revisions and restore

The next isolated change adds bounded History, exact-revision Open,
source-backed Revise, Restore and version-bound Undo receipts. It adds no SQL
migration and uses the existing immutable revisions and optimistic concurrency
checks. History reads its metadata and page in a single SQL snapshot.

All 112 saved-work tests pass, including sixteen revision/API/client cases and
three additional history store contracts. The full Jest rerun passes all 215
suites and 2,130 tests. Saved-work lint and whitespace checks pass.

Cases cover read-only historical preview, source-backed edits, exact-content
no-op rejection, restore/Undo as new revisions, foreign and absent revisions,
concurrent changes, rename invalidating Undo, loss of a committed response,
deletion between read and append, quota failure, immutable earlier content,
historical research dates, and strict receipt/pagination validation.

A further native PostgreSQL case verifies History pagination and HTTP
restore/Undo against persisted revisions. The native suite now has 21 cases,
including seventeen that require PostgreSQL 16. The two new Step 5/6 native
cases remain unrun locally for the runtime limitation recorded above. CI runs
them through the existing gate. No hosted activation or deployment is claimed.

## Integrated history and workspace behavior

History is an explicit action for each saved item. Opening a historical revision
keeps the durable head unchanged and labels the older working revision in the
workspace. Save changes uses the active association's last confirmed version and
captured current source/scenario. Save as new remains a separate action.

Restore asks for inline confirmation and appends the selected content as a new
revision. Undo uses the server receipt's exact previous revision and expected
version. A later change, including a rename, invalidates that receipt. The UI
never substitutes a newer version token to make a stale Undo succeed.

A confirmed mutation and the subsequent Open are separate outcomes. The panel
records the saved revision before requesting fresh session references. If Open
fails, it keeps the receipt and eligible Undo, reports the saved revision clearly,
and retries only Open. It does not claim the live renderer has switched until
owned placement succeeds. Uncertain mutation results require explicit refresh
instead of an automatic repeat write.

The conversation stores the selected revision independently from the latest
confirmed head/version. Rename updates matching metadata; Delete detaches matching
associations while leaving temporary live work usable. Actions on another saved
item cannot relabel the current component. Successful Open focuses the work after
the modal releases background inertness; cancel and Escape return to More.

An uncertain Save as new retains both its frozen server request and its original
workspace/message context. The panel labels that retry separately from Current
work. Restoring or opening another item cannot redirect the old save receipt to
the newly visible component, and a later explicit Save captures a fresh context
and request ID. The opaque workspace context never leaves the client.

The integrated workspace tests exercise changed calculator inputs, Save changes,
freshly opened heads, Undo, frozen composer attachments, failed hydration with
exact Open-only retry, older-revision preview, rename/delete associations, and a
failed Open after restoring another item. A captured-save regression also checks
that restoring a different item before retry cannot change either item's identity.
The panel's 25 focused cases cover History pagination, source capture, conflicts,
lost responses, context switches and modal lifecycle.
The separate server contract suite passes 112 tests. This does not substitute for
the native PostgreSQL gate or hosted activation documented above.
