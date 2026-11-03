# Orb mobile layout and current component

Audit date: 2026-11-03. Based on main commit
`63cccfa20bcf228f873fa6273667614b74300365`.

## Report and causes

The reported phone screenshot showed a calculator follow-up with correct numbers
but no visible calculator. The navigation bar, four finish buttons, background
switch, reaction shortcuts, research mode, composer, and desktop keyboard hint
competed with the answer for space.

The original mobile transcript reserved about 193 CSS pixels above its content
for three independent control rows. Its top 12% mask also faded text at the start
of the visible scroll area. A new follow-up moved to the newest message, while
the live calculator remained in its original assistant article. Increasing its
stacking order could not keep an offscreen component visible.

## Updated layout

The mobile header contains the home/logo control, Appearance, and Menu. The
existing four finishes and background switch live in a native modal Appearance
panel. It starts collapsed and closes after any finish selection, returning
focus to Appearance, including when the current finish is selected again. Its
controls keep their existing state owners and accessible names.
Header clearance is 76 CSS pixels without a larger safe-area inset. The external
Replay shortcut moves into the Reactions panel on mobile, and the desktop send
hint is visually hidden. The four response demo buttons below the composer and
their duplicate entry inside Reactions are removed. Deep Research remains an
explicit control.

Once a conversation starts, a bounded grid allocates separate areas to the
current component, transcript, and composer. The page remains the sole owner of
the visual viewport position, including browser chrome and keyboard changes.
The transcript no longer has a fade mask. Assistant bubbles use a more opaque
surface over the optional animated background.

At widths up to 900 CSS pixels, the current component sits above the transcript
in a panel capped at 260 pixels and 34% of the visual viewport height. Short or
keyboard-reduced viewports use a smaller panel capped at 140 pixels and 24% of
the available height, with the title/actions beside its body. The component
body scrolls within its bounds; the answer
and composer occupy their own rows. Wider layouts place the component beside
the conversation.

When the keyboard leaves a short viewport, composer accessories such as selected
references or error messages scroll separately from the message form. This
keeps Send and Stop reachable even with a multiline draft or a research reference.

The calculator shows its result first and keeps its editable inputs side by
side. Additional controls, explanations, and provenance remain reachable in
the panel. Touch controls retain at least 44-pixel targets and editable fields
retain 16-pixel text on phones.

## Component and reference invariants

- Each artifact has one live frame and one stable portal container. Moving it
  preserves unfinished calculator inputs, table sorting/filtering, chart
  selection, expanded details, and focus.
- A completed component opens for its current generation turn. A newer explicit
  selection or close takes precedence over an older unfinished request.
- Ask about this and a submitted valid reference show the exact owned component.
  The original message keeps a Show component control with the same artifact ID.
- The panel remains visible after the one-shot reference is consumed. Visibility
  alone does not attach data to another message or start a provider request.
- Calculator inputs in an attachment remain the values captured when Ask was
  clicked. Further live edits do not rewrite that captured scenario.
- Return to chat moves the same frame to its original message. Show component
  moves it back into the panel.
- Navigation restores the active component through the existing bounded,
  account-owned tab cache. Reset, removed message ownership, account changes,
  and stale callbacks cannot retain or reopen an orphaned component.
- Resizing the panel follows the latest reply only when the reader was already
  following it. Reading an earlier message does not trigger an automatic jump.

## Verification

Focused checks cover the modal settings lifecycle, mobile navigation,
keyboard/visual viewport cleanup, unchanged finish/background state ownership,
reaction replay, exact captured references, single-frame preservation,
selection races, tab navigation, reset, and account cleanup.

Completed local checks:

- Full Jest suite: 215 suites, 2,126 tests passed.
- Authentication suite: 95 tests passed.
- Source lint and production build passed, including route HTML generation and
  the isolated private-invoice bundle checks.
- The four changed browser scripts passed syntax and targeted lint checks. The
  functional workflow parsed successfully.

The first full run identified three assertions using the previous Latest message
accessible label; those assertions now use the clearer label without the visual
arrow. One unchanged long-research test also reached its five-second timeout in
that run. It passed in the focused rerun and the final full run without changing
its timeout or implementation.

The permanent browser regression is
`scripts/verify-metabloom-mobile-workspace.mjs`. It uses the built application
and fictional local HTTP responses, with no real account, provider, or paid
model. It checks component/transcript/composer/header separation, visible
calculator values during a follow-up, preserved DOM identity, and unchanged
request counts across mobile sizes and appearance changes. The functional
workflow runs it and retains its evidence alongside the existing UI checks.

Commands:

```sh
CI=true npm test -- --watchAll=false --runInBand
npm run lint
npm run build
npm run test:auth
node scripts/verify-metabloom-mobile-workspace.mjs
node scripts/verify-metabloom-ui-browser.mjs
node scripts/verify-app-navigation.mjs
git diff --check
```

The editing environment could not launch Chromium: its process singleton socket
failed with `Operation not permitted`. The connected browser extension also
reported that the originating browser context was unavailable. Browser geometry,
screenshots, and physical iOS Safari behavior are therefore unverified locally.
JSDOM checks do not establish visual fit or native top-layer hit testing. The PR
records the completed local checks; CI and device verification remain separate.

## Phone review scenario

1. Open `/orb` at a phone width with the background enabled.
2. Create the project-price calculator with hours 1 to 80, initially 10, and
   hourly rate 10 to 200 CAD, initially 65.
3. Set hours to 17 and rate to 85. Confirm the visible total is 1,445 CAD.
4. Use Ask about this, then ask: “Explain the selected scenario, state both
   inputs and the calculated total, then tell me what three additional hours
   would cost at the same rate.”
5. Confirm the same calculator stays visible while the answer arrives and the
   transcript scrolls independently. The selected scenario is 1,445 CAD; three
   extra hours cost 255 CAD, giving an extended estimate of 1,700 CAD.
6. Choose a finish in Appearance and confirm the panel collapses. Reopen it to
   toggle the background. Confirm the inputs and answer remain intact.
7. Return the component to chat, then reopen it. Check keyboard opening,
   dismissal, rotation, and navigation away from and back to Orb.

For a short phone viewport, scroll inside the component to reach its secondary
actions. Confirm both that panel and the conversation remain independently
usable, with the composer above the keyboard.
