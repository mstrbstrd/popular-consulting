# Durable Orb saved work

Saved work shares the existing authentication Upstash Redis connection. Auth0
continues to verify identity. Authentication sessions, temporary generated
results, and permanent saved work have separate key formats and lifetimes.
The HTTP contract, workspace UI, validated content, fresh session-reference
restoration, History, Restore and Undo are unchanged by this storage replacement.

The previous PostgreSQL implementation was never configured for this project.
Its driver, migration, operator command and PostgreSQL-only tests have been
removed. There is no SQL data migration and no second storage provider to set up.
The previous implementation remains available in Git history at
`17b769a98358244252d6b170b381b854279e4da6`.

## Invariants

| Invalid state | Enforcing boundary |
| --- | --- |
| A browser chooses a durable owner | The existing authenticated session guard emits the verified server-only account key |
| Logout, session expiry or credential rotation strands saved work | Durable scope uses the stable application origin, deployment environment and issuer/subject-derived account key; session tokens, epoch and namespace are excluded |
| Authentication cleanup deletes saved content | Permanent saved-work keys use a distinct prefix and never receive an expiration |
| Preview silently uses production scope | Explicit `AUTH_ENVIRONMENT` must agree with `VERCEL_ENV`; the application origin is part of scope |
| A failed write exposes only part of a revision | The commit script checks preconditions before one final `HSET` that changes metadata and content together |
| A stale writer overwrites a newer change | Exact previous-state comparison and the artifact's expected metadata version guard mutations |
| An interrupted create makes duplicate items | A permanent bounded request ledger binds a UUID to its canonical title/content fingerprint |
| Retrying a deleted create resurrects its contents | Deletion retains the create-request tombstone |
| Saved data changes silently during serialization | Canonical JSON, UTF-8 byte counts, SHA-256 checksums and schema validation guard reads |
| Login or listing creates an artifact | Only an explicit authenticated save creates a saved item; empty reads create no account key |
| Reopening a saved item spends model quota | Saved-work modules call storage and reference restoration, with no generation provider |
| An authentication key is modified by Saved work | The store constructs one account-scoped saved-work key; caller-supplied Redis keys and arbitrary commands are not accepted by the public API |

The server and Redis credentials remain trusted boundaries. Prefixes organize
and isolate application operations; they are not a replacement for server-side
authentication or provider access controls. The browser receives no Redis secret.

## Stable ownership and scope

`requireMetabloomSession` provides `onAccountIdentity` only after the existing
host, origin, session, issuer, passkey, allowlist and expiry checks. Its
`accountKey` hashes the verified issuer and subject. Raw provider identifiers,
passwords, session cookies and Redis credentials are not stored in saved content.

The storage key combines the schema identifier, canonical `AUTH_APP_ORIGIN`,
`AUTH_ENVIRONMENT`, and the stable account key. Changing a connection token,
`AUTH_SESSION_EPOCH` or `AUTH_SESSION_NAMESPACE` does not change it. Changing the
application origin or environment intentionally selects a different scope and
requires an explicit migration if existing work must move with it.

Production and Preview must have correctly scoped credentials and configuration.
Environment-derived keys help prevent accidental collisions; they cannot make
production credentials safe to expose to untrusted preview code.

## Content and revisions

The shared `src/components/metabloomSavedContent.js` schema remains version 1.
Native visual specs, canonical sources and calculator input scenarios retain
exact meaning. Research retains the original question, acquisition dates,
timezone, report, complete optional brief and source catalog. Expiring media
signatures and temporary session handles are excluded from durable content.

The server resolves an owned temporary source before Save or Save changes.
Browser requests cannot supply a replacement report, formula, spec, source map,
owner or calculated total. Open validates stored content and creates fresh
session references without generating replacement content.

Each account occupies one permanent Redis HASH:

- A bounded `state` field holds account/workspace IDs, active item metadata,
  revision descriptors, limits accounting and the create-request ledger.
- Individual revision fields contain canonical full-content JSON. Reads request
  only the state and selected revision, not the complete account payload.
- Revision descriptors retain timestamps, byte counts and checksums.
- Deleted payload fields are blanked in the same commit that removes the active
  item and records its tombstone. Their lifetime allocation remains counted.

`version` changes for content updates and rename. `revision` and `headRevision`
change only when content is appended. Opening older history selects content
without moving the saved head. Restore and Undo append new revisions; they never
replace earlier content. Undo uses the exact expected version from its receipt.

## Atomic commits and failures

Mutations read a bounded snapshot, validate it, and construct the complete next
state and response before submitting a guarded Lua commit. The script verifies
key type, absence of expiration, exact previous state and revision-field
preconditions. Its only mutation is the final `HSET`, which writes all changed
fields together. A competing commit produces a conflict.

Redis scripts and `MULTI/EXEC` do not provide SQL-style rollback after arbitrary
runtime errors. This design therefore avoids a sequence of writes that could
leave a visible partial revision. It does not rewrite every saved report when
one item changes, and it does not issue `HGETALL` over the account.

A network failure can leave commit outcome uncertain. The transport does not
repeat writes automatically. Create retries retain their original request UUID;
revision updates are reconciled through History/Open and expected versions.
The UI retains confirmed save receipts when the separate Open step fails.

Read snapshots use ordinary `EVAL`, which Upstash routes to the primary, and
validate returned metadata/content before exposing it. Do not substitute
`EVAL_RO` or a `no-writes` script flag, which can permit replica routing. The
transport also preserves provider synchronization tokens across sequential
requests. Native Redis verification does not by itself establish hosted
failover behavior; Open failures retain the saved receipt and explicit retry.

## Bounds

| Limit per account | Value |
| --- | --- |
| Active saved items | 50 |
| Canonical live revision content | 32 MiB |
| Revisions per item | 64 |
| Lifetime create request IDs, including deleted tombstones | 1,000 |
| Lifetime allocated revision fields, including blank deleted fields | 8,192 |
| Serialized metadata state | 1 MiB |
| List or history page | At most 50 |

These bounds leave room for authentication and other application data in a
shared service. They do not reserve provider capacity or override provider
limits. Internal tests may lower limits; public requests cannot raise them.
Limits fail explicitly with `saved_work_limit`. No automatic history pruning or
silent eviction is performed by the application. A capped item's current
content can be saved as a new item when the account's remaining limits allow it.

## Configuration and recovery

No additional application secret or SQL migration is required. The existing
production values are used:

| Variable | Purpose |
| --- | --- |
| `AUTH_REDIS_REST_URL` | Existing HTTPS Redis REST endpoint |
| `AUTH_REDIS_REST_TOKEN` | Existing server-side read/write token |
| `AUTH_APP_ORIGIN` | Stable canonical application origin |
| `AUTH_ENVIRONMENT` | Explicit production, preview or development scope |

The transport rejects URL credentials, redirects, unsafe origins and malformed
configuration; requests and responses have byte and time bounds. Provider
errors are sanitized. Builds/imports do not open connections or create data.
Authentication/session code and the temporary Metabloom connection settings
are unchanged.

Verify these properties in the existing Upstash database:

- Eviction must remain disabled for durable records. Upstash persistence does
  not prevent deletion when optional cache eviction is enabled.
- Provider capacity must leave headroom for authentication. Sharing a datastore
  also shares availability and resource limits.
- Configure and verify a suitable backup/recovery policy. Persistence across a
  restart is not a substitute for recovery from accidental deletion.

Upstash's runtime `CONFIG GET` exposes only supported configuration fields and
cannot establish the database eviction policy. The management API or console
provides eviction, capacity and backup settings. The application does not infer
those settings from the existence of a Redis connection.

Restoring a provider backup replaces the target database. Restore into a
separate target for verification first. When restoring or repointing the shared
authentication database, rotate `AUTH_SESSION_EPOCH` so sessions contained in the
backup cannot become valid again. Durable saved-work ownership remains intact
because that epoch is excluded from its key.

A live end-to-end check is explicit Save, a new login or reload, exact Open,
Save changes, History, Restore and Undo. The account's original dates, evidence
and calculator inputs should remain unchanged across reopen.

## References

- [HTTP and client contract](metabloom-saved-work-api.md)
- [Verification and limits](../verification/metabloom-saved-work.md)
- [Upstash durable storage](https://upstash.com/docs/redis/features/durability)
- [Upstash eviction](https://upstash.com/docs/redis/features/eviction)
- [Upstash REST API and transactions](https://upstash.com/docs/redis/features/restapi)
- [Upstash backups](https://upstash.com/docs/redis/features/backup)
- [Upstash read-your-writes behavior](https://upstash.com/docs/redis/howto/readyourwrites)
- [Upstash primary reads through EVAL](https://upstash.com/blog/replicated-cache-backed-by-redis)
