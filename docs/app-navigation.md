# Continuous application navigation

`ApplicationShell` keeps one React application, authentication provider and theme
provider alive across the business site, Home, Popcan, field lab, Orb, work and
invoice screens. Each screen retains its own URL and can still be loaded directly.
Browser back and forward use the same route lifecycle with scroll positions held
per history entry. Expensive screens remain lazy loaded and begin loading on link
hover or focus.

The index, engineering/login sections and Home use one persistent
`ImmersiveBackground` outside the route outlet. The opening and Home reveal share
the same live canvas, shader time and mobile graphics selection. Home remains
naturally scrollable without a separate scrollbar gutter. Leaving for another
tool completes the exit and releases this scene at the covered handoff, before
the destination mounts its own renderer. Direct tool loads and tool-to-tool
handoffs use a static theme-matched surface, never a temporary index renderer.

Navigation reverses the light field's authored crystallization and Home's entry
depths. Dark mode pulls the black-hole camera back while fading the scene out.
Camera travel uses the canonical black-hole zoom uniform, just like index
section changes. The viewport, background wrapper and canvas never scale.
An immersive-to-immersive handoff holds the exit through loading and resumes the
same camera only when the destination is ready, without a loading-phase flash.
The 650ms exit has a bounded 720ms handoff, independent of shader frames or
callbacks. The next page reveals over the theme background without a loading logo.
Cancelled exits resume the current field; reduced motion skips the choreography.
Fixed navigation stays in its viewport layer. CSS graphics use only a fade;
essential content works with reduced motion or forced colours. Route changes
announce their destination and focus the incoming main region after it becomes
interactive. Slow or failed loads expose recovery controls.

Orb signals readiness through `OrbPage` / `OrbSection` / `MetabloomAvatar` from
`CreatorOSFieldCanvas`, after its first draw or committed CSS fallback. Module
mount alone cannot dismiss the route loading state. The one-shot callback is
cancelled on unmount and does not restart on palette changes. Restoring a paused
conversation draws a visible static pose instead of an empty intro frame.

Scroll-driven screens can register a route scroll-restoration callback. Dither
restores its retained study's scroll position before measuring the field and
again before the shell reveal. This prevents the normal top reset from replacing
the selected study. History-entry scroll positions and explicit anchors take
precedence, and the callback is released when the screen unmounts.

The experience switcher uses ordinary links. Modified clicks, new tabs, external
links, downloads, native page anchors and OAuth navigation retain browser behavior.
Graphics-policy changes and explicit visual-runtime capture/trial URLs continue
to use document navigation because they establish renderer policy at startup.
Normal tool links retain the initial graphics selection.

| Screen | State held while switching tools |
| --- | --- |
| Home | The opening is completed once per authenticated application session. |
| Orb | Transcript, unfinished message, expression intensity, palette, pause/paragraph settings and message IDs. A response interrupted by leaving is labelled incomplete. |
| Dither Canvas | Selected study and pause setting. Simulation textures are released. |
| Popcan | Committed canvas and name, including marks awaiting the debounced device save. Live drawing engines are released. |
| Business / engineering | Last section. Explicit section deep links take precedence. |
| Invoice | Editor/preview selection and unsaved invoice, in the private module only. |

These are tab-only snapshots. Explicit logout or an account change clears them;
late renderer cleanup cannot restore the previous account's data. Existing
explicit invoice Save/Load draft and Popcan's local-save features retain their
own storage behavior. Reloading still requires saving/exporting unfinished work.

## Private invoice boundary

`invoice-entry.js` builds a separate module below `/_private/invoice/`. The public
application contains a loader, not the editor or its default data. On every entry
the loader requests the middleware-protected manifest with credentials, no cache
and redirects rejected. Module and stylesheet paths are restricted to the same
protected directory. The handoff finishes only after the stylesheet and editor
commit. Direct invoice URLs use the same shell and server-protected document.

The private module receives the verified session and theme from the shell. It
retains the existing lock, expiration, logout and account-ownership checks. No
invoice data enters route state, URLs, network requests or public telemetry.
Every app document receives the same script and framing restrictions, while
public pages retain their indexing and caching policy. A configured HTTPS public
telemetry origin can be allowed explicitly; private-route telemetry stays blocked.

## Verification

```sh
npm test -- --watchAll=false --runInBand
npm run test:auth
npm run lint
npm run build
node scripts/verify-app-navigation.mjs
node scripts/verify-orb-transitions.mjs
```

The navigation browser suite requires Playwright and Chromium/WebKit. An external
installation can be selected with `PLAYWRIGHT_MODULE`; `CHROMIUM_PATH` and
`WEBKIT_PATH` can select existing browser binaries. `APP_NAV_PROFILE` selects
one profile and `APP_NAV_EVIDENCE` writes screenshots.

The suite uses fictional local accounts and the built application. It checks one
document load through tool switches, native history, state retention, mobile
previews, scoped styles, shared themes and session revocation. GPU capability
fixtures exercise the authored mobile branch on a software adapter; they do not
represent physical device performance. Server authorization is tested separately.
The Orb transition suite also checks cold dark/light/reduced-motion/CSS starts,
local WebGL failure, native camera travel without DOM shrinking, renderer
exclusivity, and signed-in back/forward navigation. It supports a local Playwright
installation or `NODE_PATH` pointing to an external installation. Completed-fade
checks wait for both the route state and the browser's last composited opacity
frame, rather than sampling the transition on an arbitrary delay.

Rollback by reverting the continuous-navigation change and rebuilding. No server
data migration or session-cookie change is involved.
