# Ask about a selected native visual

PR 03 of the Orb implementation plan, based on main commit
`cca117284a6f4fef0384a26432660a47e9129d98` after PR #195.
Local verification: 2026-11-02.

## User behavior

Choose a table row, line-chart observation, pie category, flowchart step, or
calculator scenario, then use its **Ask about this** action. Orb adds a removable
reference beside the message composer and preserves the existing draft. Attaching
does not start a request. The next submitted message consumes that reference.

The server loads the selected original data for an explanation or a supported
conversion. A table's original row index survives sorting and filtering. A line
observation retains every named series and its unit. Calculator inputs are copied
when Ask is clicked, so later edits do not change the attached scenario; the server
recomputes the total from the stored formula. Every control is validated, including
a control that the formula does not use.

Removing the reference returns keyboard focus to the composer. The next request
omits `artifactContext`, even when an older calculator snapshot exists. Sending a
message also removes its reference; use Ask again for another selected follow-up.
The draft and reference survive Orb → Home → Orb navigation without model calls.
Reset and the existing account-owned cache boundary prevent stale references from
moving into a new session or account.

## Data and conversion contract

The reference contains only an artifact ID, immutable content revision, bounded
selector, and calculator inputs where applicable. Titles, rows, formulas, totals,
and sources come from the owned server record. Both request paths use the same
resolver and reject unavailable or invalid explicit references before paid work.

The initial conversion scope is intentionally precise:

| Selected data | Supported conversion |
| --- | --- |
| Table row | Table containing exactly the original columns and selected row |
| Line observation | Table of the exact observation and series values, or a bar chart retaining every original series, label, value, and unit |
| Pie category | Table containing its category, value, unit, whole's total, and calculated share |
| Flowchart node | Table containing the selected step and its exact incoming/outgoing connections |
| Calculator scenario | Table containing the captured control values and server-recomputed result |

Unsupported selected-data conversions fail with a clear message before the tool
planner runs. A conversion must match the host's exact data projection before it
can inherit the original provenance. Changed values, added rows, renamed series,
changed units, and unselected observations fail validation. This restriction
applies to conversions with an attachment; existing requests for new native
visuals retain their supported formats.

Original source attribution remains attached to the data. Stored source IDs do
not become a new answer's numbered research citations. A fresh research pass owns
its own source catalog. General explanatory prose remains model output.

## Storage and compatibility

Every new successful generation stores an immutable 32-hex-character content
revision. Clients negotiate its response field with `includeReference: true`.
Older clients keep their strict original response shape, and restored visuals
without a revision remain readable and locally interactive. Generate a new visual
to use its versioned Ask controls.

Completed artifacts retain the existing one-hour Redis lifetime. The original
ten-minute offer deadline only limits generation. A locally restored visual can
outlive its server record; a follow-up then reports that the selection is no
longer available. Missing, foreign, or stale records are not silently ignored.

The lifecycle now carries completed result data and tool replay data as opaque
JSON strings through Lua. Real Redis 7 reproduced loss of empty-array identity and
rounding of `0.12345678901234566` with the previous decode/re-encode approach. The
new format preserves both and supports legacy object records. Completion is
write-once, and continuation does not start a new retention window.

The hosted Upstash baseline preserved those sample values; its behavior differed
from Redis 7. The new format passed the same hosted lifecycle checks. The hosted
expiry check allows 250 ms of timestamp variation; the observed difference was
21 ms. The local Redis test continues to require exact expiry equality. No result
data comparison uses numeric tolerances. The [sanitized hosted results](metabloom-artifact-followups-upstash.json)
contain no credentials or database identifiers.

## Verification

| Check | Result |
| --- | --- |
| Full React/Jest suite | 211 suites, 2,030 tests passed |
| API/provider contracts | 376 tests passed |
| Final focused selection, composer, snapshot, and API-client checks | 4 suites, 85 tests passed |
| Redis 7 quota and artifact lifecycle | 31 tests passed |
| Disposable hosted Upstash compatibility | 7 checks passed; fictional keys removed |
| Authentication suite | 6 test files passed |
| Source lint | Passed |
| Production build | Passed, including route generation and private invoice isolation |
| Built native UI browser suite | All 11 cases passed; zero fixture or browser errors |
| Desktop CSS and phone reduced-motion navigation | Both profiles passed; one document load and retained drafts |

The permanent Redis suite runs offer → claim → complete → selected-context read
→ continuation → completed read, then verifies actual expiry. It checks exact
decimals, empty sources and source IDs, immutable revision, owned reads,
write-once completion, and preserved retention. The CI workflow runs this suite
against Redis 7 and includes the new artifact-reference API contracts.

The native UI browser fixture covers original row identity after sorting and
filtering, identical references for explanations and conversions, frozen
calculator scenarios, removal, one-shot submission, zero model requests for
local actions, and restoration across SPA navigation. Its clear-button test uses
actual Enter-key activation and checks focus returns to the composer. The
functional workflow's `metabloom-ui-functional` evidence includes screenshots of
the mobile composer reference and the selected-row conversion.

All browser/API tests use fictional fixtures. The hosted compatibility check uses
a separate disposable database and no application credentials. It makes no live
model calls and does not establish real-provider prose quality.

## Reproduce

```bash
node --test scripts/metabloom-artifact-reference.test.cjs scripts/metabloom-visual.test.cjs scripts/metabloom-ui-tools.test.cjs
METABLOOM_QUOTA_TEST_REDIS_PORT=6379 node --test scripts/metabloom-visual-quota-redis.test.cjs
CI=true npm test -- --watchAll=false --runInBand
npm run lint
npm run test:auth
CI=true npm run build
node scripts/verify-metabloom-ui-browser.mjs
APP_NAV_PROFILE=desktop-css node scripts/verify-app-navigation.mjs
APP_NAV_PROFILE=phone-reduced node scripts/verify-app-navigation.mjs
git diff --check
```

The next planned step is PR 04, research reuse. Saved work, durable tasks,
compound tools, memory, parallel research, watches, and integrations remain later
steps in the agreed sequence.
