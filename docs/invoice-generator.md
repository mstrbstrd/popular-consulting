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
  decisions. Every new line starts untaxed. CAD/USD selection labels amounts;
  it does not convert currencies. Check tax applicability before issuing.
- Invoice numbers are stable and editable. Date plus a random 48-bit suffix
  reduces same-day collisions, but no centralized registry guarantees uniqueness.
  No crypto capability means a manually supplied number is required.
- Print only a complete document. Invalid browser-print attempts show a warning.
  No print, preview, save or export marks anything sent, paid, or issued.
- No full-screen animated renderer on this page. ThemeProvider's default
  background behavior is unchanged; the invoice route explicitly opts out.
- New CSS is route-scoped. Print uses a named Letter page with 14mm margins,
  repeatable table headings and kept-together line rows/totals. Other pages keep
  their existing typography, backgrounds, navigation, and print behavior.

## Use

Edit sender/client details, invoice number/date, due date, line items, taxes and
payment notes. Review the live document. Use Print / save PDF, choose Save as PDF
and Letter paper, and disable the browser's automatic headers and footers.
Print is native browser output, not an image of the invoice. The tool cannot
know whether the print dialog saved, printed or was cancelled. Long invoices
flow onto additional pages. Mobile previews scroll the table horizontally.

Save draft explicitly to this device, or export JSON for a backup. Import accepts
version 1 drafts of at most 1 MB with at most 100 lines. Logos accept PNG, JPEG
or WebP up to 2 MB and are normalized to no more than 1024 by 512 pixels.

No credentials, tax registration numbers, account numbers or bank instructions
are prefilled. Business/client defaults come from the supplied starter and remain
editable. Keep sensitive banking or personal data out of shared-device drafts.

## Verification

Jest covers arithmetic, rounding, invalid input, bounds, draft schemas, XSS-safe
rendering, explicit persistence, line/tax controls, accessibility, print validation
and route cleanup. The browser smoke runs only against the local production
build with fictional line items and an intercepted print function. It is not a
physical Safari/iOS certification or an accounting/tax compliance audit.
