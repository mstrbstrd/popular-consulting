# Reuse completed Orb research

PR04 of the Orb implementation plan, based on the merged PR #196 commit
`e841810f112914470e9f5b54aa56e20cc48ce12c`.

## User behavior

Completed research can provide three explicit follow-up actions:

| Action | Evidence selected |
| --- | --- |
| Use this research | The full original report and source catalog, with complete passages selected for the follow-up writer |
| Use this brief | The exact validated brief, original coverage limitations, and supporting report passages |
| Use this finding | One exact validated finding, its original dates, uncertainty, source details, and supporting report passages |

Each action stages a removable reference beside the composer, preserves the
draft, and focuses it. Staging makes no network request. Only one research or
visual reference can be attached at a time. Sending consumes the reference.

An attached research reference overrides the existing Deep Research toggle for
that turn. The server resolves the saved evidence and writes the follow-up
without running research again. Original dates, timezone, source IDs, source
links, and coverage remain attached to that evidence. The UI identifies reused
research and shows the original time and expiry.

The recorded local research date is authoritative. Browsers validate its shape
and relationship to the acquisition instant without deriving a replacement from
their own timezone database. The original local date and named timezone remain
visible; acquisition and expiry instants are labeled UTC. This avoids rejecting
or relabeling evidence when an older browser and the server have different IANA
timezone rules. Server persistence and reads retain their strict original
temporal-context checks.

The explicit **Search again** control removes the reference and selects Deep
Research while preserving the draft. It does not submit anything. A deliberate
fresh instruction such as “Update this research” also requests a new search;
the attached reference must still resolve before that request can proceed.
Ordinary instructions such as “Summarize this research” and “Update the table
using these findings” continue to use the saved evidence.

An expired reference never silently starts research. Local expiry disables the
reuse controls. If expiry is discovered by the server, the failed reference is
restored for explicit removal or Search again, without overwriting a newer draft
or attachment. Temporary storage failure remains retryable. The original report
stays readable in the conversation.

## Ownership and retention

The server stores an immutable JSON report under an opaque random research ID,
with the authenticated session owner, environment/authentication scope, original
question, server-derived temporal context, creation time and one-hour expiry.
The report's public data shape remains exactly `{notes, sources}`. References
and presentation metadata are separate fields.

The complete report is sent to the reader and saved before brief formatting.
Its handle is advertised only after a successful write. A storage failure leaves
the current report viewable and does not announce a handle. A later formatting
failure cannot discard the completed report. Validated briefs are separate
immutable child records; each has its own ID, belongs to the same owned report,
and expires no later than that report. A finding locator selects an index in one
specific immutable brief. An orphan child cannot resurrect an unavailable report.

Reads do not extend retention. Report writes use Redis `SET EX NX`; brief writes
use `SET PXAT NX` with the original expiry. Plain JSON strings do not pass through
Lua JSON re-encoding. The research transport has its own bounded response reader
and supports reports up to the existing 1 MiB report limit.

Both the chat and visual-tool routes resolve explicit references before quotas,
tool claims, Jev decisions or model calls. Caller-supplied report text, source
URLs, owner fields and replacement timestamps are not accepted in locators.
Expired, foreign, missing and corrupt records fail closed. Mixed visual and
research references are rejected. This is temporary reuse within the current
authentication lifecycle, not permanent account history or saved revisions.

## Evidence, citations and visual conversion

The writer receives the selected stored brief/finding exactly, along with a
bounded selection of complete original report passages. Follow-up terms rank
passages, so relevant evidence after source eight remains usable. Selection
limits are explicit context; they must not be represented as exhaustive coverage.
The full report remains independently readable.

The negotiated reuse stream emits `research_reuse`, never `searching`. It carries
the original report and refers to answer sources by their original IDs. The
browser derives the answer's source records from the validated report, rather
than accepting a replacement map. Unknown, duplicate, renamed or renumbered
citations fail validation. Existing clients keep their previous stream contract.

Reuse has one absolute 75-second server deadline and a 90-second browser budget.
Progress cannot renew either budget. Fresh research retains the existing bounded
search deadline. A fresh request receives the original topic and historical
selection description as background, without the old numbered source catalog;
new citations must come from the new report.

Explicit native visual requests can use the retained evidence under these initial
conversion rules:

| Stored evidence | Supported conversion |
| --- | --- |
| Selected brief/finding | A table of exact findings, summaries, recorded dates and original source IDs |
| Complete cited report passages | A table of those passages with original citations |
| One cited Markdown table | A table preserving the original columns and rows |
| One cited two-column table with plain numeric cells | Bar, line or pie chart where the existing native visual limits permit it |

The host constructs the approved projection. Generated data must match its
columns, rows, labels, values and units exactly before it can inherit provenance.
Numbers introduced in a follow-up do not become sourced evidence. Ambiguous,
oversized or unsupported conversions fail before generation. Original source IDs
and the original research time remain in the visual's provenance. No conversion
starts a new search.

Tool continuation retains compact acquisition/selection/coverage provenance
rather than another copy of the projection. History uses a UTF-8 byte budget;
replay inputs and the escaped Redis offer envelope are checked before claims or
planner calls. Model output still passes the existing bounded response checks.

## Verification

The permanent checks include shared protocol and composer integration tests,
API/provider boundary tests, real Redis 7 lifecycle tests, and a built-browser
flow through the actual local API. The browser fixtures cross local midnight to
check that reused evidence is not relabeled with the new day. The Vancouver
fixture deliberately exercises different server/browser timezone rules, while
separate server tests reject forged local dates. The browser tests count research
and writer calls separately, exercise sparse citations beyond eight, preserve
report-only results after a formatter failure, and verify explicit expiry recovery.

The real Redis suite round-trips a complete 1 MiB report, verifies exact text and
source retention, tests immutable writes and child expiry, and checks session
ownership and actual key expiry. The hosted REST transport also passed five
checks against a separate disposable Upstash database. All fictional test keys
were removed; the [sanitized hosted results](metabloom-research-reuse-upstash.json)
contain no credentials or database identifiers.

Browser and provider tests use fictional authentication, evidence and model
responses. They establish application behavior and call boundaries, not the
factual quality of live model output. No production session, production secret,
or paid provider request is used by these checks.
