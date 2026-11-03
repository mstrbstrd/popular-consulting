# Durable Orb saved work

PR05 adds the ownership, content, PostgreSQL storage and migration foundation.
The Step 5 adapter adds authenticated Save/Open/Rename/Delete and a bounded
browser client. Step 6 adds history, exact revision selection, source-backed
updates, and restore/Undo through new immutable revisions.

Ordinary chat, login, build and deployment create no durable account or database.
The existing Redis stores retain their session, quota and temporary-reference
responsibilities. An explicit authenticated save copies owned server content
into the separate durable store. [HTTP and client contract](metabloom-saved-work-api.md)
describes the endpoint and its unavailable state before database activation.

## Invariants

| Invalid state | Enforcing boundary |
| --- | --- |
| Browser claims select a durable owner | Only the verified session guard emits the server-only account identity; the endpoint captures it and rejects caller ownership fields |
| A login, auth epoch or Redis credential rotation strands saved work | The account key derives from the canonical verified issuer and subject, excluding those temporary values |
| One account links another account's content | Every store query includes ownership; composite foreign keys bind workspace, artifact, revision and evidence |
| A preview operates on the production database | Explicit environment configuration and an immutable database environment/namespace marker must both match |
| A partial save or revision is reported as successful | Evidence, revision and artifact head commit in one checked-out connection; errors roll the transaction back |
| A stale writer overwrites another update | Workspace serialization and an expected artifact version protect append, rename and delete |
| Previously saved evidence changes in place | Database triggers reject revision/evidence updates, independent child deletion and truncation |
| Retrying a deleted create request recreates content | The bounded create-request ledger retains a tombstone and rejects replay |
| Serialization loses evidence or silently changes it on read | Typed validation, canonical JSON, byte bounds and separate SHA-256 checksums guard both content and evidence |
| An unsupported record regenerates content or disappears | Reads return an explicit error; metadata listing remains available |
| Saving or reopening runs a model | Storage modules import no generation, research or tool provider |

The application process and migration operator remain trusted server boundaries.
An account key is an identifier, not a bearer credential. The storage API must
never be exposed directly to browser-supplied identity objects.

## Stable ownership

`requireMetabloomSession` has an optional `onAccountIdentity` callback. It runs
only after the existing host, origin, session, passkey, issuer, allowlist and
expiry checks. It emits a frozen `{accountKey}` containing a domain-separated
SHA-256 digest of the verified issuer and subject. Raw subject IDs, cookies and
session tokens are absent. Existing temporary identity callbacks are unchanged.

The database creates one account per key and one default private workspace per
account. Concurrent creation uses unique constraints. Account/workspace creation
is explicit through `ensureAccount` or part of a successful create transaction.
Read/list operations do not create an account as a side effect.

## Versioned content

`src/components/metabloomSavedContent.js` validates a separate durable envelope
with `schemaVersion: 1`. The server import remains an alias to this shared
schema. It does not accept the tab conversation snapshot.

| Kind | Preserved content |
| --- | --- |
| `visual` | Existing native `spec`, canonical `sources`, optional calculator `scenario.inputs` |
| `research` | Original `question`, `asOf`, `timeZone`, `localDate`, complete `report`, optional complete `brief` |

The native spec retains its own schema and design versions. Calculator input
keys must match the exact controls, values must be finite and in range, and the
formula must evaluate. A saved total is not accepted; the renderer can recompute
it from the saved inputs.

Research retains the full report, including the 1 MiB report allowance, original
source IDs/URLs, dates, uncertainty, coverage and brief windows. A report can be
saved without a successful brief. Known optional signed `brief.media` is removed
because those tokens expire independently of durable content. The original
calendar date remains authoritative when timezone databases change. A brief must
agree with its saved acquisition metadata and original source catalog.

The envelope limit is 1,163,264 UTF-8 bytes: the report limit, 96 KiB brief limit,
and 16 KiB for the envelope. Functions, accessors, nonfinite values, sparse arrays,
cycles, custom serializers, unknown fields, session handles, transcript anchors
and expiry fields are rejected. Accepted values are independent JSON copies.

This validation establishes readable content, not its factual truth or provenance
authority. Save ingestion resolves the selected owned server record and saves its
complete dependencies. It rejects a client-invented spec, report or source map.

## PostgreSQL model and transactions

The private `metabloom_saved_work` schema contains:

- `environment` and `migrations`: immutable deployment binding and migration ledger.
- `accounts` and `workspaces`: stable account identity and its private workspace.
- `create_requests`: bounded idempotency records, including deletion tombstones.
- `artifacts`: title, kind, current revision and metadata concurrency version.
- `revisions`: immutable versioned content and evidence identity.
- `evidence`: immutable full research report or visual source catalog.

Evidence is scoped to one artifact and revision. There is no cross-account/global
deduplication. Payload and evidence are stored as canonical JSON text with byte
counts and checksums, giving each report/source catalog one stored authority.
Array order and original text remain exact. A read verifies the checksums, parses
the versioned content and requires an exact canonical round trip.

`createMetabloomSavedWorkStore({pool, config})` exposes:

| Method | Input after the trusted identity | Result |
| --- | --- | --- |
| `ensureAccount` | Optional `{signal}` | Account and workspace IDs |
| `create` | `{requestId, title, content}` | Saved metadata and content |
| `get` | `{artifactId, revision?}` | Selected revision and content |
| `list` | `{limit?, after?}` | Bounded metadata page and next cursor |
| `history` | `{artifactId, limit?, beforeRevision?}` | Current metadata, revision page and next cursor |
| `appendRevision` | `{artifactId, expectedVersion, content}` | New immutable revision and metadata |
| `rename` | `{artifactId, expectedVersion, title}` | Updated metadata |
| `delete` | `{artifactId, expectedVersion}` | Confirmed deletion receipt |

All methods accept optional `{signal}` after their input. Artifact `version`
increments for rename or content changes; `revision` increments only for content
changes. Opening an earlier revision also returns the current `headRevision`.
Restore and Undo append new revisions without overwriting history. The HTTP
adapter rejects current-head restores and unchanged content, and binds Undo
receipts to the version returned by the preceding mutation. History metadata
and its bounded revision page are read in one SQL statement.

Mutation transactions lock the workspace, enforce limits and compare versions.
Create retries with the same UUID request ID and identical canonical input return
the existing artifact; changed input conflicts. Deleting an artifact removes its
revisions/evidence and retires its create request. Old IDs cannot reopen it.

Bounds are 50 live artifacts, 100 MiB across retained revision/evidence bytes, and
10,000 retained create-request IDs per account. Listing permits at most 50 entries
per page. Internal test configuration can lower these limits, never raise them.
Explicit operator account deletion cascades through its workspace, content and
request ledger; no user-facing account-deletion endpoint is introduced here.

Each transaction verifies the environment marker and schema version. Reads fetch
metadata, revision and evidence together. Connections are released on success,
failure and cancellation; broken connections and failed rollbacks are discarded.
Cancellation before commit rolls back. A cancellation observed after a successful
commit does not turn the successful write into a reported failure.

## Configuration and migration

Use separate physical databases and credentials for Production and Preview.
Set these server-only values explicitly in the intended environment:

| Variable | Purpose |
| --- | --- |
| `METABLOOM_SAVED_WORK_DATABASE_URL` | Restricted application connection, using the provider's pooled endpoint when appropriate |
| `METABLOOM_SAVED_WORK_MIGRATION_DATABASE_URL` | Separate operator connection with schema/migration privileges |
| `METABLOOM_SAVED_WORK_ENVIRONMENT` | Exactly `production`, `preview` or `development` |
| `METABLOOM_SAVED_WORK_NAMESPACE` | Stable project identity, 1 to 60 lowercase letters/digits/hyphens |

The declared environment must match `VERCEL_ENV` and `AUTH_ENVIRONMENT` when
present. There is no generic `DATABASE_URL` or Redis fallback. Remote connections
require certificate and hostname verification. URL options cannot weaken TLS or
change connection settings. Plain transport is permitted only for explicit
loopback development outside Vercel.

The lazy `pg` pool has four connections, bounded acquisition/query/lock/idle
timeouts, and Vercel's `attachDatabasePool` lifecycle hook. Importing the module
does not open a connection. Driver errors are sanitized; credentials, SQL and
saved content are not logged.

After configuring the separate migration connection, the operator explicitly runs:

```sh
npm run saved-work:migrate -- --apply --environment=preview
```

Use the matching environment for a separately reviewed Production operation.
The command requires both flags, validates the target, takes a transaction-scoped
advisory lock and applies checksummed migrations atomically. Repeat application
is safe. Changed historical migration files, a different database binding or a
missing marker beside an existing ledger fail closed. Builds and request handlers
never apply migrations. Future schema changes need new numbered migrations.

Provision a distinct runtime role after migration. Give it schema usage, table
reads, inserts into the six content/ownership tables, artifact updates/deletes,
`UPDATE(id)` on workspaces for row locking, and `UPDATE(retired)` on create requests
for the deletion trigger. Grant execution of schema trigger functions as needed.
Do not give it schema creation, ownership, superuser, role management, truncation,
marker/ledger writes, or direct account/revision/evidence deletion. The integration
suite exercises these restricted grants. The migration credential does not belong
in ordinary request handling.

## Activation and recovery gates

No managed database, credentials, provider integration or production settings are
created by this implementation. Before activation, establish the isolated resources,
restricted runtime role, migration credentials, connection limits, provider backup
retention and restore procedure. Confirm the environment marker with the real
deployed runtime, including rejection of deliberately mismatched configuration.

The disposable PostgreSQL CI suite dumps a populated test database with native
`pg_dump`, restores it into a second empty test database with `pg_restore`, and
checks ownership, history and evidence. It removes the temporary databases and
archive. This proves schema/data restore behavior when that gate passes; it does
not establish a provider's backup schedule or recovery service level. Production
backups can retain explicitly deleted content until their retention period ends.

The browser acceptance flow is explicit Save, a confirmed durable receipt, a new
login or reload, and Open through the existing renderer with zero generation
calls. The UI must distinguish temporary retained research from a durable save,
preserve drafts on storage failure and handle version conflicts explicitly.
Open now mints fresh authenticated session references. Reference retention
starts again; original research dates do not.

## References

- [node-postgres transactions](https://node-postgres.com/features/transactions): one checked-out client per transaction.
- [node-postgres TLS](https://node-postgres.com/features/ssl): connection-string SSL options replace explicit TLS settings.
- [Vercel connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions): pooled connections and the Fluid Compute lifecycle hook.
- [Verification evidence](../verification/metabloom-saved-work.md).
