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
| Full application Jest suite | 213 suites / 2,098 tests passed |
| Authentication suite, including stable account identity | 106 passed |
| Existing API/research/visual/provider contracts | 403 passed |
| New saved-content validation | 41 passed |
| New database configuration, TLS and migration CLI contracts | 12 passed |
| New store/migration transaction contracts | 16 passed |
| Source and new server-boundary lint | Passed |
| Production build | Passed, including route HTML and private invoice isolation |
| New integration harness target guard | Passed without a database connection |
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

The integration suite has 16 cases: one offline target guard and 15 cases that
require an actual PostgreSQL 16 server. It verifies:

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

## Unrun checks and activation boundaries

The native integration suite was **not run locally**. Official PostgreSQL 16.15
server/client binaries were available, but `initdb` refuses root. This execution
environment maps only UID/GID 0 and denies a supported nonroot namespace setup.
No root-check or sandbox restriction was bypassed.

Remote CI and deployment are not awaited as part of this handoff. The PostgreSQL
workflow must pass before merging this foundation. Its result is not implied by
the local PGlite checks or the existing green application tests.

No hosted PostgreSQL resource, deployed database connection, provider backup
policy or live saved-work user flow has been verified. Provisioning, restricted
credentials, isolated preview/production databases and provider recovery checks
precede PR06 activation. The PR06 browser acceptance flow remains explicit Save,
new login or reload, then identical Open with zero model calls.
