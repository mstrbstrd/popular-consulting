# Invoice generator

Route: `/invoice-generator`. Direct access only, absent from site navigation.
This is an unlisted browser tool, not an authenticated accounting system.

## Boundaries

- Never transmit entered invoice data, logos, or drafts. No invoice API, server
  persistence, third-party PDF script, email sending, or payment collection.
- No automatic draft loading or saving. Save/Load operate on one versioned
  localStorage key. Export/Import move JSON files. Saved data is unencrypted,
  browser-specific, and accessible to other same-origin scripts and device users.
  Clearing device storage does not clear the currently open invoice.
- No active HTML or remote logo URLs. React escapes text. Logo input is bounded
  raster content, re-encoded to PNG; imports rebuild only the versioned schema.
- Never treat invalid numeric values as zero or reuse imported totals. Use exact
  scaled integers for decimal quantity, unit price and percentage calculations.
- Round half-up to cents for each gross line, its discount, and each independent
  tax on the discounted line. Sum rounded lines. GST and PST do not compound.
- The supplied 5% and 7% rates are editable input defaults, not tax eligibility
  decisions. Every new line starts untaxed. Duplicate creates an independent
  copy with the original rates and taxes. CAD/USD labels amounts; it does not
  convert currencies. Check tax applicability before issuing.
- Invoice numbers are stable and editable. Date plus a random 48-bit suffix
  reduces same-day collisions, but no centralized registry guarantees uniqueness.
  No crypto capability means a manually supplied number is required.
- Print only a complete document. Invalid browser-print attempts show a warning.
  No print, preview, save or export marks anything sent, paid, or issued.
- Only the reused Contour Drift field may render behind this workspace. It never
  receives invoice data, intercepts input, or appears in print. Pause is explicit;
  reduced motion renders a static scene, hidden tabs stop drawing, and safe mode
  or a failed context falls back locally without losing the draft. ThemeProvider's
  default background is still disabled here to avoid a second renderer.
- Use the shared NavMenu in standalone mode with the site's existing destinations.
  The invoice route is never advertised in the menu or marked as another page.
  Navigation and action-bar heights must not cover focused fields or the preview.
- New CSS is route-scoped. Print uses a named Letter page with 14mm margins,
  repeatable table headings and kept-together line rows/totals. Other pages keep
  their existing typography, backgrounds, navigation, and print behavior.

## Use

Edit the invoice details, client, line items and payment notes. Expand From your
studio for sender details and logo, or Tax settings for rates and bulk selection.
Save draft and Print / save PDF remain in the action bar. Load saved, Export
draft, Import draft and New invoice are in Draft options. Saving, loading and
importing remain explicit actions; switching views never replaces invoice data.

On smaller screens, switch between Edit invoice and View preview. Mobile screen
previews use labelled line cards without sideways scrolling. Desktop shows the
editor alongside a scrollable document. PDFs always use the standard table.

Print / save PDF opens the browser dialog. Choose Save as PDF and Letter paper,
and disable browser headers and footers. Print is native browser output, not
an image of the invoice. The tool cannot know whether that dialog saved, printed
or was cancelled. Long invoices flow onto additional pages.

Save draft explicitly to this device, or export JSON for a backup. Import accepts
version 1 drafts of at most 1 MB with at most 100 lines. Logos accept PNG, JPEG
or WebP up to 2 MB and are normalized to no more than 1024 by 512 pixels.

No credentials, tax registration numbers, account numbers or bank instructions
are prefilled. Business/client defaults come from the supplied starter and remain
editable. Keep sensitive banking or personal data out of shared-device drafts.

## Verification

Jest covers arithmetic, rounding, invalid input, bounds, draft schemas, XSS-safe
rendering, explicit persistence, line/tax controls, accessibility, print validation,
view preservation, duplicate independence, focus recovery and route cleanup.
The invoice workflow verifies the local production build with fictional items
and intercepted print calls. Its CDP checks use desktop/tablet/mobile viewports,
light/dark themes and print-media assertions, and produce a 40-line PDF.

The separately triggered live review is read-only and uses a new blank invoice
in a fresh Chrome profile. It never accesses a user's actual saved drafts.
Neither workflow certifies physical Safari/iOS or accounting/tax compliance.
See `invoice-workspace-review.md` for the original live review findings.
