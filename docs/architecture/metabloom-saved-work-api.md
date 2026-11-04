# Saved-work HTTP and client contract

Step 5 adds POST /api/metabloom-saved-work with JSON input and output.
The browser entry point is requestMetabloomSavedWork in
src/components/metabloomSavedWorkApiClient.js. It validates action-specific
requests/replies, reads bounded UTF-8 JSON, uses same-origin credentials, rejects
redirects and cancels on caller abort or its 25-second deadline. It performs no
automatic mutation retries.

The endpoint independently verifies the existing host, origin and authenticated
session. It captures both the temporary session identity and stable account
identity. Neither identity is accepted from the browser. Every response is
private and uncacheable. Requests are capped at 4 KiB, client error responses at
2 KiB, and successful responses at the durable-content budget plus 16 KiB.
The server deadline is 20 seconds and the Vercel function limit is 30 seconds.

No migration, database resource, environment update or provider generation occurs
inside this endpoint.

## Actions

| Request | Successful response |
| --- | --- |
| {action: "status"} | {available: true}, or {available: false, code: "saved_work_unavailable"} |
| {action: "list", limit?, after?} | {items: [artifact], nextCursor} |
| {action: "save", requestId, title, source, scenario?} | {artifact} |
| {action: "open", artifactId, revision?} | {artifact, content, reference} |
| {action: "rename", artifactId, expectedVersion, title} | {artifact} |
| {action: "delete", artifactId, expectedVersion} | {artifactId, version, deleted: true} |
| {action: "history", artifactId, limit?, beforeRevision?} | {artifact, items: [{revision, createdAt}], nextBeforeRevision} |
| {action: "revise", artifactId, expectedVersion, source, scenario?} | {artifact, undo} |
| {action: "restore", artifactId, expectedVersion, revision} | {artifact, undo} |

Artifact and request IDs are UUIDs. Generate one request ID per explicit Save and
retain it while resolving an uncertain response. Titles are nonempty, trimmed
strings of at most 160 characters. The expectedVersion is the last confirmed
metadata version. Listing defaults to 20 and permits at most 50 entries. Its
after parameter is an opaque cursor from the preceding page; nextCursor is null
at the end.

Public artifact metadata has exactly these fields:

~~~js
{
  artifactId, title, kind, version, revision, headRevision,
  createdAt, updatedAt
}
~~~

Kind is visual or research. Dates are canonical UTC ISO instants. The version
field is a concurrency token that also changes on rename. Revision and
headRevision refer to immutable content; a rename does not create a new content
revision. Internal workspace IDs and account keys are not returned.

## Save authoritative content

Completed native visual:

~~~js
{
  action: "save",
  requestId: crypto.randomUUID(),
  title: "Project estimate",
  source: {
    kind: "visual",
    id: completedVisual.id,
    artifactVersion: completedVisual.artifactVersion
  },
  scenario: { inputs: { hours: 17, rate: 85 } }
}
~~~

Only calculators may include scenario. Inputs must be numbers, match every
control exactly, satisfy its range and produce a valid formula result. Blank
drafts and numeric strings are rejected. No calculated total, formula, spec or
source catalog comes from the browser. Omitting the scenario saves the original
definition and its initial inputs.

Retained research:

~~~js
{
  action: "save",
  requestId: crypto.randomUUID(),
  title: "Research to revisit",
  source: {
    kind: "research",
    researchId: completedResearch.researchId,
    briefId: completedResearch.briefId
  }
}
~~~

Omit briefId for a report-only result. Saving a selected finding still saves its
complete report and associated complete brief. Browser-supplied report text,
dates, sources, provenance, owner IDs and arbitrary metadata are rejected. Both
handles must resolve within the current authenticated session. Missing, foreign,
stale or expired temporary references return saved_work_source_expired.

The source is resolved before the guarded Redis commit. Creation is idempotent
for the same request ID and identical canonical title/content.
Reusing the ID with changed content conflicts. Replaying a deleted create is
rejected. If the source expires after an uncertain save response, refresh the
saved list to reconcile before offering a new Save. An expired browser snapshot
cannot reconstruct authoritative evidence.

## Open and continue the conversation

Open reads the owned durable head and returns the exact validated durable
content envelope. It performs no generation, formatting, research or paid-work
quota claim. The renderer uses content.spec and content.sources, or the complete
content.report and optional content.brief. For calculators, initialize the view
from content.scenario.inputs when present.

Visual references:

~~~js
{
  kind: "visual",
  offer: { version, designVersion, id, kind, expiresAt },
  artifactVersion
}
~~~

The offer and content version belong to a new completed session record. Do not
submit the offer to /api/metabloom-visual. Build existing artifact attachments
using reference.offer.id, reference.artifactVersion, selector and optional inputs.
The stored record has no continuation tool and cannot initiate generation.

Research references:

~~~js
{
  kind: "research",
  research: { researchId, title, asOf, timeZone, localDate, expiresAt, briefId? }
}
~~~

Build existing report, brief or finding attachments from the new handles.
Original asOf, timeZone, localDate, report, brief windows and source IDs remain
unchanged. Only temporary reference retention starts again. Refreshing research
requires the existing explicit new-research flow.

Fresh references live for one hour in the current session. The durable copy
remains saved after they expire. Open it again to establish a new reference.
A reference-bridge failure leaves the durable revision untouched. Deleting a
durable item removes its database history and evidence; existing temporary
copies follow their separate one-hour retention.

## Availability and UI behavior

Status returns available: true only after a bounded account-scoped database read
succeeds, including environment/schema validation. It creates no account.
Missing authentication Redis configuration or connection, and wrong environment
bindings return available: false. No SQL migration is needed. This does not
replace operator verification of capacity, eviction policy, backups or recovery.

Disable Save and Saved work when status is unavailable and explain that durable
saving is not available yet. Ordinary generated components remain usable.
Show a saved receipt only after Save succeeds. Preserve drafts and the active
component on failure. Recheck after a deliberate retry or new authenticated
session. Abort requests and discard late responses on logout/account change.
A response for an earlier selection must not replace a newer active component.

## Step 6 history, revisions and Undo

History defaults to 20 entries and allows at most 50. Its items contain only
revision numbers and creation dates, newest first. The artifact metadata and page
come from one bounded Redis snapshot. A non-null nextBeforeRevision is passed as
beforeRevision to the next request. A missing or foreign artifact returns 404.
History remains listable even when a particular stored content format cannot be
opened.

Open may specify an exact revision. It returns that selected revision, the
current headRevision and current metadata version. Previewing history is
read-only. The returned content and fresh follow-up references belong to the
selected revision, so chat cannot accidentally use a different revision.

Revise uses the same source and optional calculator scenario as Save. The source
still resolves from authenticated server records. The saved item's title stays
unchanged, and its kind must match. The expectedVersion guards concurrent edits.
No browser-provided content or evidence is accepted.

Restore selects an earlier revision of the same owned artifact and appends its
content as a new head. Earlier revisions remain immutable. Restoration preserves
the current title and original research dates. Restoring the current head or
content identical to the current head returns saved_work_invalid (400) without
consuming a revision. Revise also rejects unchanged content.

A successful Revise or Restore returns:

~~~js
{
  artifact,
  undo: {
    artifactId: artifact.artifactId,
    revision: previousHeadRevision,
    expectedVersion: artifact.version
  }
}
~~~

Undo calls Restore with those three receipt fields. It appends another revision
containing the preceding head. A later edit or rename changes the metadata
version and invalidates the receipt, producing a 409 conflict instead of
overwriting newer work. There is no Delete Undo or automatic history pruning.
All retained history counts against the existing account byte limit.

After a confirmed revision mutation, Open the returned head to display it with
fresh references. If that separate Open fails, keep the confirmed mutation
receipt and allow reopening; do not report the mutation as failed or repeat it.
A lost mutation response is reconciled through History/Open. Retrying the same
expectedVersion conflicts after a successful commit and cannot append twice.

Local calculator edits remain unsaved draft state until an explicit Save or
Revise. Local control Undo is a separate UI operation and does not write a
database revision on every input change.

## Error responses

| HTTP status | Public code |
| --- | --- |
| 400 | saved_work_invalid |
| 401 | saved_work_authentication |
| 403 | saved_work_forbidden |
| 404 | saved_work_not_found |
| 409 | saved_work_conflict, saved_work_limit, saved_work_unsupported |
| 410 | saved_work_source_expired, saved_work_deleted |
| 499 | saved_work_cancelled |
| 500 | saved_work_corrupt |
| 503 | saved_work_unavailable |
| 504 | saved_work_timeout |

Errors may carry an opaque requestRef, never Redis details, connection strings or saved
content. Status intentionally represents storage failure with HTTP 200 and
available: false; authentication failures retain their HTTP status.

## Existing Redis configuration

Saved work uses the existing authentication Redis connection through
`AUTH_REDIS_REST_URL` and `AUTH_REDIS_REST_TOKEN`. Scope comes from
`AUTH_APP_ORIGIN`, `AUTH_ENVIRONMENT`, and the verified stable account identity.
No additional database, SQL migration, saved-work connection secret or new
provider is required. Authentication session expiry and credential rotation do
not change durable keys.

Production configuration is already present on popular-consulting. Deployment
of this implementation enables the endpoint to use it; this is separate from
claiming that a live Save/Open flow has been observed. Preview deployments must
continue to use their own explicit authentication environment configuration.
See [storage configuration](metabloom-saved-work.md#configuration-and-recovery)
for capacity, eviction and recovery requirements.
