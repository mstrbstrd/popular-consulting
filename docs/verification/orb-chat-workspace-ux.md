# Orb chat and component workspace

## Exact selected context

The composer shows the values captured by **Ask about this**, including calculator inputs and the calculated result. This is a frozen selection. Changing the live component never silently changes the next message's attached context.

**Update selection** explicitly captures the current values or inspected item from the same owned component and immutable artifact version. Invalid inputs, a removed component, or a stale version leave the previous attachment intact and explain how to select again. Sending consumes the attachment once. The extra display summary is never included in the server reference; the server still resolves the owned record and independently calculates the result.

The workspace supplies one component heading. The frame's Details disclosure holds explanatory material while the live result, direct controls, provenance type, and Ask action remain available.

### Regression checks

- Capture a calculator at 17 hours and 85 CAD per hour. The composer must show 17, 85, and 1,445 CAD.
- Change the live hours to 20. The live total becomes 1,700 CAD, while the composer still shows 17 and 1,445 CAD.
- Choose Update selection. The composer now shows 20 and 1,700 CAD, without changing the draft or making an API request.
- Send. The request contains the exact selected input values, and the next unrelated message has no attached context.
- An empty input or unavailable original component must not replace the last valid attachment.
- Changing presentation must preserve the existing renderer, unfinished form drafts, table sort/filter, and chart selection.

Automated coverage lives in `MetabloomArtifactSelection.test.js`, `MetabloomArtifactComposer.test.js`, `MetabloomComponentWorkspace.test.js`, and `MetabloomVisualFrame.test.js`. Server reference validation is covered by `scripts/metabloom-artifact-reference.test.cjs`.

## Components in this conversation

When more than one completed component belongs to the retained conversation,
the workspace title becomes a native component picker. Numbered titles and
component kinds distinguish duplicate names. Switching preserves each original
renderer, its draft/selection, and its workspace scroll position. It preserves
the compact or expanded presentation and never replaces an attached reference.

The picker starts no API request and includes no failed, generating, detached,
or pruned item. It is a conversation index, not durable saved storage. Closing
the workspace returns to the original message, whose Show component button can
reopen it. Reset and account cleanup remove the index with its owned records.

## Research in the workspace

Completed research has an Open research card in its original reply. The brief,
full report, original evidence links, source pagination, and reuse controls share
one portal container in the same workspace as native components. The conversation
picker orders both kinds by their original message. Opening or switching reports
starts no search and does not change the composer's captured context.

Use this research, Use this brief, and Use this finding retain the existing exact
server-owned reference protocol. On mobile, a successful selection returns the
workspace to its compact view and focuses the existing composer. Expired or
unavailable reuse handles disable reuse while the report remains readable.

Switching preserves the same carousel instance, selected finding, open details,
and independent workspace scroll position. Navigating away stores only the active
owned message ID and compact/expanded mode; the conversation owns the bounded
report data. A new account cannot receive an old mount's cleanup snapshot. Late
native generation cannot replace an explicitly opened report.

Orb Reset retains conversation messages. It closes the active research workspace
and clears its cached selection, while retained reports remain reopenable. Message
pruning and account/route cleanup release their portal registrations. An embedded
OrbSection without the workspace controller continues to render reports inline.

The real-controller tests in `MetabloomComponentWorkspace.test.js` cover native and
research switching, frozen attachments, exact finding reuse, expired handles,
StrictMode navigation, reset, pruning, and delayed generation. The surface tests
also cover sparse original source IDs, disclosure/source pagination continuity,
metadata changes, and interrupted report fallback. Browser layout checks remain
pending where a Playwright browser executable is unavailable.
