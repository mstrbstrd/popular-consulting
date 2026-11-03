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
