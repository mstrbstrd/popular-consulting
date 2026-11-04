# Durable Orb chat threads

The thread library stores account-owned conversation snapshots in the existing authenticated Upstash Redis service. It requires no additional credentials or database. The same `AUTH_REDIS_REST_URL`, `AUTH_REDIS_REST_TOKEN`, `AUTH_APP_ORIGIN` and `AUTH_ENVIRONMENT` configuration used by Saved work is reused.

## Chat history interface

The Chats control opens a themed table with a title, update date and actions for each saved conversation. At widths of at least 1,280 pixels, the table occupies its own left column and collapses into a compact rail. The conversation stays in the middle and the current component stays on the right. Narrower screens use a native left drawer that closes after selecting or starting a chat. Saved chats is also available through More when the mobile workspace or keyboard hides the floating control.

Conversations and drafts save automatically after a short idle period. The first message supplies the initial title; row actions allow renaming and confirmed deletion. New chat and Open first confirm the outgoing snapshot, then replace the conversation and component workspace together. Restoring a chat retains its draft, selected references and component inputs without generating the component again. Collapsing the table or renaming a chat keeps the current renderer mounted.

Saving failures keep the current conversation visible and offer Retry. A conflicting edit or deleted thread can be preserved with Save as new chat. Active responses must finish or stop before switching. Reaching a history or storage limit produces an explicit error instead of silently shortening a saved conversation. Chats that were discarded before this feature was enabled cannot be recovered retroactively.

## Contract

`POST /api/metabloom-threads` requires the current server session and the existing same-origin checks. Ownership comes exclusively from the authenticated issuer and subject. The JSON request selects one action:

| Action | Request fields besides `action` | Successful response |
| --- | --- | --- |
| `list` | None | `{ items }`, at most 50 metadata records, most recently updated first |
| `open` | `threadId` | `{ thread, snapshot }` |
| `save` | `threadId`, `expectedVersion`, `title`, `snapshot` | `{ thread }` |
| `rename` | `threadId`, `expectedVersion`, `title` | `{ thread }` |
| `delete` | `threadId`, `expectedVersion` | `{ threadId, deleted: true }` |

Thread IDs are lowercase UUIDs. Metadata contains only `threadId`, `title`, `version`, `createdAt`, `updatedAt` and `messageCount`. The server assigns canonical timestamps and versions. Titles are bounded to 160 characters. Version zero creates a new thread; later writes require the version last read by the client.

A snapshot is one versioned envelope containing `conversation`, `visuals` and `workspace`. The shared protocol validates the complete envelope and returns an owned JSON copy. It retains up to 200 messages, 100 native component records and 2 MiB of encoded snapshot data. Invalid or oversize snapshots fail as a whole. The durable parser does not trim messages or silently discard components to fit the older tab-only snapshot limits. A client must stop autosaving and explain a reached limit instead of replacing saved history with a shortened window.

## Storage and consistency

Each account has a separate permanent Redis hash at `metabloom:threads:v1:{scope:accountKey}`. Its scope is derived from the stable configured application origin and environment; its owner is derived from the authenticated issuer and subject. Session epoch, namespace, cookie, Redis token and deployment URL do not enter the durable ownership key.

The hash contains bounded metadata in `state` and one `snapshot:<threadId>` field per allocated ID. List reads metadata only. Open reads metadata and its payload coherently in one ordinary `EVAL`, checks the canonical bytes and SHA-256 digest, then validates the full snapshot again. No operation scans Redis or reads every thread payload.

Writes compare the complete captured metadata state and commit the next state plus the affected payload in a single final `HSET`. All checks and response construction precede that write. This matters because Redis Lua and `MULTI` do not undo preceding writes after a later command fails. An explicit compare-and-set refusal can be retried twice against fresh state. A network failure, timeout, aborted request or malformed receipt is never automatically retried.

Exact repeated saves at the current version are no-ops. A lost-response retry with the original expected version succeeds only when the immediately following committed save has the exact same canonical title and snapshot. It cannot silently claim a later edit as the original receipt. Rename has the equivalent immediate-version and operation check. The client should retain its captured request for explicit retry and show an unresolved outcome until it receives a valid receipt or opens the confirmed saved state.

Delete atomically removes active metadata, blanks the payload, and records a permanent tombstone. Repeating the confirmed delete is idempotent. A delayed save, including an old version-zero create, cannot recreate that ID. Tombstones do not expire.

## Bounds and shared-service behavior

The thread namespace permits 50 active threads, 16 MiB of active snapshot bytes, 1,000 lifetime thread IDs and 512 KiB of metadata per account. Deleted payload bytes are reclaimed, but deleted IDs and empty field names stay counted against the lifetime bound. These limits bound the physical hash as well as active content. Reaching a limit returns `threads_limit`; the service never prunes another thread or changes saved artifact/session keys to make room.

The existing Saved work content budget remains separate at 32 MiB per account. Application limits preserve headroom; deployment operators must still use sufficient provider capacity and a non-evicting durable Redis configuration. This endpoint never changes provider settings. Missing configuration, expiring keys, unexpected key types, invalid metadata or damaged payloads produce explicit errors, not an empty replacement account.

## Display history and source authority

Threads are display archives. The snapshot may retain validated original component specifications, research evidence, dates, view state and temporary reference handles. Opening a thread does not refresh those handles, extend their expiry, call a model, or import browser-submitted data into trusted visual/research source stores. Browser validation establishes readable shape, not evidence provenance.

The existing server-owned source resolvers remain authoritative for component follow-ups and Saved work ingestion. A restored component can remain readable after its original reference expires. A separate explicit Saved work Open can rehydrate a previously saved canonical artifact through the existing trusted path. Thread snapshots do not bypass that path.

## Verification

`npm run test:saved-work` includes the thread API and client contract tests. `npm run test:saved-work:redis` includes real disposable Redis checks for both Saved work and chat threads. The existing Redis workflow requires the native runtime and records TAP results. Native thread checks cover owner and namespace isolation, atomic concurrent saves, exact retries, deletion tombstones, resource bounds, corruption, unchanged original references, HTTP encoding and persistence after an owned Redis restart.

The functional workflow runs `node scripts/verify-metabloom-threads.mjs` against the production build with fictional authenticated loopback responses. It checks desktop column geometry, the collapsed rail, mobile drawer behavior, autosave, rename, confirmed deletion and restoration without repeat model calls. Evidence includes screenshots and JSON at widths of 320, 390, 1,024, 1,280 and 1,440 pixels across light and dark profiles. This browser check does not establish native Mobile Safari behavior or production deployment status.
