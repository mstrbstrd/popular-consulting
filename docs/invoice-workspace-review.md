# Invoice workspace refinement, 15 September 2026

## Observed on the deployed first pass

Reviewed the actual public `/invoice-generator` with a fresh, unauthenticated
Chrome profile. Invoice workspace review run 35013052315 captures screenshots
and rendered geometry at 1440x1000, 390x844 and 320x640. No existing drafts or
private user browser state were accessed. This is emulation, not physical iOS.

At 390px, the first line-items section started at y=2633 and preview at y=3734.
The sender section alone used 810px. At 1440px, line items started at y=2075.
The primary print action was below all six fieldsets; five equally emphasized
file actions occupied the top. Mobile document columns required sideways
scrolling, a saved draft was described as Ready to edit, and the blank draft
showed a numerical error before any attempted output.

## Refinement

- Compact heading and a persistent action bar: running amount, real save state,
  Save draft, secondary Draft options, and Print / save PDF.
- Below 1200px, Edit invoice / View preview switches panels without resetting
  any invoice values. Desktop keeps both panels visible. The desktop document
  viewport scrolls independently so long invoices remain reachable.
- Sender/logo and global tax settings use native, keyboard-accessible disclosure
  sections. Validation opens the settings and focuses visible repair guidance.
- Labels and inputs remain readable. Tax controls and row actions have 44px
  targets. New lines receive focus; Duplicate creates an independent copy and
  preserves the chosen rates/taxes, while Add line item remains untaxed.
- Mobile screen preview uses labelled line cards, not tiny horizontally clipped
  table columns. Print is still a normal semantic table on Letter paper.
- Empty drafts receive neutral instructions, not a premature arithmetic error.
  Saved, unsaved and never-saved states are distinct. No automatic persistence.

## Boundaries

No changes to arithmetic, rounding, tax defaults, draft schema, logo validation,
public navigation, authentication, or server behavior. Review scripts only
perform editing/save/print assertions against the local production build.
The manual production review reads the page, toggles display mode, and captures
new blank invoices in an isolated temporary profile. It never imports invoices,
opens a print dialog, sends invoices, or reads anyone's saved device draft.

Browser reports and screenshots are evidence of specific tested layouts, not
an exhaustive accessibility, accounting, mobile Safari or GPU certification.
