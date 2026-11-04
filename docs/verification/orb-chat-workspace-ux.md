# Orb chat and component workspace

## Saved work access

The active component or research workspace has a compact **Saved** control in
its existing toolbar. Its accessible name is **Saved work**, and it opens the
existing panel with the current owned work captured at the time of the click.
The More menu remains available for opening the library without an active item.
Opening the panel lists saved work but does not save or regenerate content.

The launcher respects pending, inactive and generation states. Closing or
cancelling the panel returns focus to the launcher while preserving the workspace
view, renderer, input drafts, reading position and frozen composer attachment.
The same row contains the control on mobile, with a minimum 44px touch target.
Integrated controller tests cover native and research sources, component
switching, focus return, StrictMode cleanup and the More-menu fallback.

## Saved status

The workspace shows **Not saved**, **Saved · Revision N**, **Unsaved changes**,
**Check inputs**, or **Save status unknown** beside the current work. Confirmation
requires the same owned source and normalized valid calculator inputs as an
acknowledged save or successfully opened revision. A later edit cannot inherit
the confirmation of values captured before the request completed.

Each retained message holds a validated confirmation baseline of at most 2,048
UTF-8 bytes. It contains the artifact ID, content revision, source locator and
optional numeric scenario, not report text, credentials or a second copy of the
content. The existing account-cleared navigation snapshot retains this baseline.
Titles, sorting, selection and research reuse expiry do not change saved content.
Historical work retains its separate working-revision/latest-revision notice.

A create retry that returns a later saved head does not prove the displayed
content matches that head. Likewise, acknowledging Restore or Undo cannot mark
the previous renderer as the newly opened revision. Those states require an
explicit successful Open before gaining new confirmation. Missing/deleted items
lose their association; conflicts and uncertain mutations clear only the
affected confirmation. Delete dispatch also clears confirmation before sending,
so closing the panel cannot leave a contradicted Saved label. Cancelling its
confirmation before dispatch makes no change. Unrelated read failures preserve
other confirmed work.

## Authenticated production verification

On November 4, 2026, a fictional **Saved work verification** calculator completed
Save, page reload, Open, Save changes, History, Restore and Undo through the live
authenticated site and configured Redis backend. Revision 1 held 17 hours at
85 CAD, totaling 1,445 CAD. Revision 2 held 20 hours at 85 CAD, totaling 1,700 CAD.
Restoring revision 1 created revision 3 with the original values; Undo created
revision 4 with the 1,700 CAD scenario. The saved fixture remains available for
review.

The compact launcher was exercised on the deployed page at a 390 × 844 browser
viewport. The workspace and modal fit without horizontal page overflow, and
closing the modal returned focus to Saved. This is browser viewport verification,
not a claim that a physical iPhone keyboard or provider backup policy was tested.

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
