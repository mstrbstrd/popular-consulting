# Metabloom page navigation

Metabloom can take a person to any page of the app they ask for, such as "take me to the calendar" or "can you pull up the canvas?". Jev decides; the model does not. Navigation works like following a link: it never grants access, and the conversation, thread and Orb continue on the new page because the assistant lives in the application shell.

## Decision

`src/components/metabloomNavigation.js` is shared by the browser and the host.

- **Catalogue.** A fixed list of destinations, each with an id, route, label, access level and the names people use for it. Canvas is listed under "canvas" and "popcan", and the Invoice Generator under "invoices" and "invoice page". `/login` and `/logout` are never destinations. A destination is always one of these ids, never a URL from a message or a model.
- **Reachable pages.** The browser sends `navigation: { version: 1, current, destinations }` with `X-Metabloom-Navigation: 1` on tool-enabled chat turns. `destinations` contains only pages this session can open: public pages, account pages when signed in, and administrator pages (Invoice Generator, plus Calendar when its route is enabled) for administrators. The host keeps only public pages when there is no account. It cannot see the role, so administrator pages still rely on their own middleware and page checks, exactly as a link does.
- **Host rules first.** `classifyMetabloomNavigation` settles an unambiguous command ("take me to X", "go to X", "open X", "show me X", "go home") without Jev, so it keeps working when Jev is slow or unavailable. A message that declines to move ("don't open the calendar") never navigates.
- **Jev for everything softer.** If the message has a navigation cue and names reachable pages, the same bounded input Jev call gets a separate `navigation` choice question. Its options are `none` plus only those named pages. A choice counts only at 0.8 confidence or higher (`METABLOOM_NAVIGATION_MIN_CONFIDENCE`). A timeout, a missing key, an invalid answer, or a choice outside the named pages all resolve to `none`.
- **Invoices.** Starting, creating or editing an invoice belongs to the invoice workspace (`open_invoice_workspace` and the `isInvoiceWorkspaceStart` shortcut), which prepares a guided draft. `isMetabloomInvoiceCreation` keeps plain navigation away from those requests. When navigation does open the invoice page, the agent is not offered `open_invoice_workspace` on that turn.
- **Other turns.** Deep research and research reuse never navigate. History supplies no commands.

## Stream and receipt

After the input `emote` and `action` events, and before any tool activity or answer text, the host may send exactly one `{ type: 'navigation', destination }`. `createMetabloomNavigationStreamBridge` wraps the strict decoder and consumes that event. It rejects the event if navigation was not negotiated, the page was not offered, the event repeats, it carries extra fields, or it arrives after content.

The browser checks access again at the moment of the move and calls the shell's `navigate`. That is the same path as a nav link, so tools keep their work: Canvas saves its draft to tool state and the invoice saves its workspace snapshot. The reply shows a receipt capsule under the answer:

- `Opening X…` while the shell moves.
- `Opened X` once the shell's pathname reaches the page.
- `Left before X opened` if another navigation replaced it first.
- `X isn't available from here` if the session could not open it.

Receipts are presentation-only. Like answer media, they are bound to the conversation and are not saved into threads.

The model is told the page is being opened, or that the person is already on it. It may say "Taking you to X." It may not claim the page has opened, and it may not say it cannot navigate. The browser's receipt is the record of what happened.

## Tests

- `src/components/metabloomNavigation.test.js`: catalogue, access, host rules, the Jev question, the stream bridge, the API client, and OrbSection receipts.
- `scripts/metabloom-navigation.test.cjs`: host and Jev decisions through `api/metabloom.js`, refusals, account and current-page handling, decoder compatibility, and withholding the invoice tool.
