# Saved-work verification

Implementation contract: [durable Orb saved work](../architecture/metabloom-saved-work.md).
HTTP contract: [saved-work API](../architecture/metabloom-saved-work-api.md).

## Current change

The current backend replaces the unconfigured PostgreSQL foundation with the
existing authentication Upstash connection. The browser protocol, ownership
source, content validator, fresh-reference restoration, workspace interactions,
History, Restore and Undo remain the same.

The previous implementation and its historical PostgreSQL verification record
remain available at [the preceding main commit](https://github.com/mstrbstrd/popular-consulting/blob/17b769a98358244252d6b170b381b854279e4da6/docs/verification/metabloom-saved-work.md).
Those SQL results are not evidence for the replacement Redis backend.

## Completed local checks

The Redis replacement passed the following checks before publication:

| Check | Result |
| --- | --- |
| Complete application Jest run | 218 suites, 2,240 tests passed |
| Saved-work content, transport, store, API and client contracts | 101 tests passed |
| Authentication regression suite | 106 tests passed |
| Native Redis integration | 20 tests passed, including 19 subcases; zero skips |
| Application and saved-work ESLint | Passed with zero lint warnings |
| Production build | Passed, including route metadata and private-content checks |
| Workflow configuration and dependency lock consistency | Passed |

The native run used Redis 7.2.17 and the real Lua scripts. It exercised the
default API factory using the existing authentication configuration through a
local REST adapter, including Save, Open, Save changes, History, Restore, Undo
and fresh component references. It also checked a report near its content-size
limit, concurrent mutations, uncertain receipts, maximum-history deletion,
corrupt records, captured request arguments, and persistence after an owned
Redis restart. It did not connect to the production database.

## Boundaries under verification

| Failure or transition | Required outcome |
| --- | --- |
| Missing or mismatched auth environment | No network request to a fallback database; explicit unavailable result |
| Anonymous, expired or foreign session | No durable storage authority |
| Empty list/status | No account or saved item created |
| Credential or auth epoch rotation | Same durable account scope |
| Different stable owner, application origin or environment | Separate saved-work scope |
| Same create UUID and canonical content | One item, including after a lost response |
| Same create UUID with different content | Conflict |
| Retried deleted create | Tombstone error, no resurrection |
| Competing expected-version updates | One successful change, one conflict |
| Commit rejection | Metadata, content, version and request ledger all remain unchanged |
| Expiring, wrong-type or malformed saved-work key | Explicit failure; no silent recreation or expiry repair |
| Earlier revision Open | Exact earlier content, unchanged durable head |
| Restore or Undo | Append a new revision; stale versions cannot overwrite newer work |
| Corrupted or unsupported content | Explicit error; no regenerated replacement |
| Explicit Delete | Current item disappears, payloads are blanked, create tombstone remains |
| Storage, revision or lifetime field cap | Explicit limit failure without silent history pruning |
| Restart of disposable Redis | Same content, metadata, history and tombstones |
| Save or Open | No model, research or generation-quota call |

## Native Redis gate

`scripts/metabloom-saved-work-redis.test.cjs` exercises the actual Lua scripts
against a disposable native Redis process. It uses fictional content, an owned
temporary directory, append-only persistence and an owned loopback listener. Its
small RESP fixture has no production credentials or new application dependency.
Readiness verifies the responding server's process ID before exposing it to
tests. Cleanup stops only its own server and removes its temporary directory.

For an explicitly supplied external test server, the harness requires
`METABLOOM_SAVED_WORK_TEST_ALLOW_DISPOSABLE=1`, accepts only literal loopback
endpoints and removes only its registered test keys. It never issues `FLUSHALL`
or `FLUSHDB`. Restart persistence requires the harness-owned process.

The CI workflow installs Redis and sets
`METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS=1`. Missing native Redis therefore fails
the gate rather than producing an apparent pass with all native cases skipped.
`METABLOOM_SAVED_WORK_TEST_REDIS_SERVER` can point to a locally built binary.

```sh
npm run test:saved-work
METABLOOM_SAVED_WORK_TEST_REQUIRE_REDIS=1 npm run test:saved-work:redis
npm run test:auth
npm run lint:saved-work
npm run lint
CI=true npm test -- --watchAll=false --runInBand
GENERATE_SOURCEMAP=false npm run build
```

The workflow uploads TAP results only, not Redis persistence files or saved
content. Native Redis tests establish command/atomicity/persistence behavior;
they do not establish the hosted provider's actual plan, eviction setting,
backup schedule, or failover behavior.

## Preserved workspace checks

Existing integrated tests cover exact calculator scenarios, Save/Open into a
new conversation with fresh references, failed-placement rollback, stale
selection, unavailable storage, draft preservation, historical previews,
Save changes, Restore, Undo, rename/delete metadata, and source-bound retries.

A save request captures its UUID, source, input scenario and original workspace
message together. Opening another item while resolving an uncertain save cannot
attach the old receipt to the newly visible component. A failed Open after a
confirmed revision retains that receipt and retries only Open.

The mobile workspace retains one renderer and composer. Ordinary view changes
preserve inputs and reading position. The storage change does not alter Theme,
conversation layout or component navigation.

## Hosted configuration and verification limits

Read-only Vercel metadata confirms the existing production authentication Redis
configuration, application origin and environment are present. No new resource,
new secret, SQL migration or production data operation is required by this
implementation. Saved-work keys are separate from authentication session keys.

The Vercel connection does not expose the existing Upstash management settings.
Eviction and backup policy remain unverified here. Eviction must be disabled for
permanent data, and shared database capacity must leave room for authentication.
See the architecture document for recovery, including rotating
`AUTH_SESSION_EPOCH` after restoring shared authentication data.

A production user-flow claim requires an observed authenticated Save, new login
or reload, exact Open, changed inputs, History, Restore and Undo. Local tests and
a verified Git push do not imply that deployment or this hosted flow has passed.
