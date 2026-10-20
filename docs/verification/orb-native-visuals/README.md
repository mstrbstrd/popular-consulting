# Native visual implementation verification

Baseline reviewed: `a01d8fdfdc21927628ec69a13e1d65060c4b00ec` on `mstrbstrd/popular-consulting/main`.

## Executed locally

- 41 tests passed with Node 22.16.0 using `node --test scripts/metabloom-visual.test.cjs`. These cover shared spec validation, provenance, calculator bounds, handoff framing, session/claim boundaries, Jev multi-question behavior, isolated visual errors, and chat-handler ordering with explicit provider/auth/store fixtures.
- The actual Redis claim script was executed in Lua 5.4 with deterministic Redis/cjson interfaces. Ownership, expiry, claimed tombstones, duplicate prevention, both quota branches and TTL assertions passed. This was not a live Redis or Upstash integration test.
- 29 offline Chromium fixture checks passed: table/chart/calculator layout in light and dark modes at 1280, 390 and 320 CSS-pixel widths, including short viewports; calculator updates and zero division; theme state retention; visible message-completion gating; duplicate offers; newer-turn cancellation; failure isolation; and unmount cleanup. No uncaught page errors were recorded.
- JSX/JavaScript syntax was checked using the locally installed TypeScript transpiler. The new stylesheet parsed with PostCSS. These are syntax checks, not a production build or a complete type check.

## Important fixture limitations

The local environment could not fetch the repository's npm dependencies. Its installed React runtime was 16.0.0, used only for isolated rendering with a Fragment compatibility shim. The production repository uses React 18. The fixture used an Aetheris token snapshot and a static background, not the complete Orb/WebGL page or deployed font loading. Local HTTP browser navigation was blocked by browser policy, so the visual fixture ran entirely from in-memory HTML with mocked requests.

Do not treat these fixtures as production React 18, complete-page, mobile Safari, real-device, CSP/origin, accessibility-certification, or performance qualification. Eight target-runtime React integration tests were added in `src/components/MetabloomVisuals.test.js`, but were not run locally.

## Not executed or claimed

- Full `npm ci`, target-runtime React/Jest suite, existing full regression suite, or production build in this environment.
- Paid OpenAI/TypeSafe calls, live authentication/Redis checks, or new-model availability checks.
- Physical iPhone/Safari testing, complete-page WebGL/compositing checks, or deployed-site checks.
- CI/deployment completion. The branch workflow provides the next checks and must be inspected separately.

Vercel denied access to the requested temporary test sandbox with HTTP 403. Production configuration was not changed. Native generation remains default-off; arbitrary generated-code sandboxing is not implemented by this milestone.
