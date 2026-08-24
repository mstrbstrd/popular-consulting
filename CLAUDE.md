# Popular Consulting - CLAUDE.md

## Project Overview

A React business + engineering platform for "Popular Consulting" with six routes served from one CRA bundle, deployed on Vercel. The immersive home is a WebGL-heavy, section-snap experience; `/engineering` adds an Aetheris Iridescent professional profile card; `/work` is a conventional scrollable portfolio built on the same design system with a route-scoped typographic composition layer; `/dither-canvas` is a route-only generative field lab.

## Routes (`src/SiteRouter.js`)

| Path | View | Notes |
|---|---|---|
| `/` | `App` (immersive, business audience) | Section-snap parallax, managed WebGL dither or CSS fallback |
| `/engineering` | `App` (immersive, engineering audience) | Shared immersive shell plus draggable Aetheris `ProfessionalHero` and engineering copy via `siteCopy` audiences |
| `/work` | `WorkPage` | Scrollable portfolio; Aetheris design system; SpectralBloom backdrop |
| `/orb` | `StandaloneExperiencePage` (orb) | noindex; lazy-loads `OrbSection`; managed Dither plus profiled geodesic Black Hole |
| `/game` | `StandaloneExperiencePage` (game) | noindex; lazy-loads `PopcornGame` |
| `/dither-canvas` | `DitherCanvasPage` or `GraphicsFallbackPage` | noindex; field lab is WebGL-policy gated |

Unknown paths fall back to `/`. Per-route HTML (title/meta/canonical) is generated at build time by `scripts/generate-route-html.mjs` from `src/content/routeMetadata.json`; `vercel.json` rewrites the routes to those files.

## Stack

- React 18 (CRA / react-scripts 5), JavaScript only (no TypeScript)
- MUI v5 (`Box`/`Typography`/`Container`/`TextField`/`Button` in BioSection, ServicesSection, ContactSection only - removal is a planned project)
- Custom CSS: global `src/index.css`, per-component inline `<style>` blocks, route-scoped `public/engineering-card.css`, `src/components/WorkPage.css`, and route-scoped `public/work-typography.css`
- WebGL (raw, no library): managed `DitherBackground` (WebGL2), profiled geodesic `BlackHoleCanvas` (WebGL2), `SpectralBloom` (WebGL1), `CreatorOSLavaLampCanvas` (WebGL1), `CreatorOSFieldCanvas` (WebGL2)
- **Not used anywhere (do not reintroduce): Tailwind, framer-motion, Emotion-direct, simplex-noise**

## Commands

```bash
npm start       # Dev server -> http://localhost:3000
npm run build   # Prod build (sourcemaps off) + route HTML generation
npm test        # Jest / RTL / jest-axe
npm run lint    # eslint --max-warnings 0 (CI-gated)
```

## Graphics preservation and safety architecture

- The visual algorithms and interaction design are product invariants. Bound workload, ownership, and lifecycle before replacing an effect.
- `src/utils/graphicsPolicy.js` supports `?graphics=css`, `?graphics=webgl`, and `?graphics=auto`. Windows automatic sessions attempt WebGL through the same hardware probe as other desktop platforms. A recorded runtime failure or an explicit CSS request can still select the fallback.
- `src/utils/deviceTier.js` performs the WebGL2 capability probe only when policy allows it, rejects known software renderers, compiles the GLSL ES 3 baseline, requests the high-performance adapter, and releases the detached probe context.
- `src/utils/graphicsContextGovernor.js` is installed before React mounts. It only governs canvases explicitly marked by `ManagedDitherBackground`, bounding their drawing buffer before the first draw and capping the legacy single-pass draw rate.
- `src/utils/graphicsRuntimeBoundary.js` catches unmanaged WebGL context loss, hides the failed canvas, records the failure, clears exclusive Orb ownership, and never reloads the document.
- `ManagedDitherBackground.js` owns Dither lifecycle. Hidden tabs, reduced motion, context loss, disabled policy, and exclusive Orb Black Hole ownership unmount the live renderer and reveal the CSS fallback.
- `BlackHoleCanvas.js` preserves the original three-channel geodesic shader, RK4 integration, accretion disk, Doppler and gravitational shifts, psychedelic palette, ordered dither, scanlines, camera movement, zoom controls, and pop transition.
- The non-Windows `original` profile keeps 200 steps, a 0.08 base step, the original 0.35 drawing scale, and uncapped requestAnimationFrame cadence.
- Windows starts with the same shader under the `balanced` profile: 96 steps, a 0.166667 base step, a 96,000-pixel ceiling, and a 24 fps ceiling. The larger step preserves the original nominal 16-unit integration path.
- Shader initialization or context loss retries once under the same geodesic algorithm with the `safe` profile: 64 steps, a 0.25 base step, a 64,000-pixel ceiling, and a 20 fps ceiling.
- `?black-hole-quality=original`, `balanced`, or `safe` is the explicit hardware-comparison and tuning override.
- A final Black Hole failure clears only Orb renderer ownership and removes the failed overlay. It must not poison every WebGL renderer for the session.
- `BlackHoleBackground.js` was a dormant duplicate and is removed. Do not duplicate the shader again. Do not replace the active geodesic Orb effect with an analytic approximation.
- Essential copy, navigation, forms, and route access must remain fully usable if WebGL is unavailable or explicitly disabled.
- `window.__graphicsReport()` returns the current graphics policy, the last failure, and bounded session breadcrumbs.

## Architecture

### Immersive home (`/`, `/engineering`)
- `ParallaxBackground.js` - section-snap controller. Intercepts wheel/keyboard/touch (native scroll is NOT used); 4 sections: DitherHero, Bio, Services, Contact. Section dots (`.section-dot`) are the navigation contract: `document.querySelectorAll('.section-dot')[N]?.click()` navigates from anywhere.
- `DitherBackground.js` (~1900 lines) - legacy persistent WebGL2 dither canvas, per-section shader presets, orb face/emotions, and CD blend modes. It must only be mounted through `ManagedDitherBackground`; direct imports into route code are prohibited. **Touch carefully; verify visually.**
- `experiencePlacement.js` - which sections render (orb currently disabled on the main stack).
- `siteCopy.js` - dual-audience copy (business vs engineering); `immersiveMode.js` picks per route.
- `ProfessionalHero.js` owns the `/engineering` card's reveal state, section-action routing, pointer capture, viewport clamping, drag suppression, and double-click reset. Do not move those invariants into presentation code or replace its inline transform.
- `public/engineering-card.css` is injected only into generated `/engineering` HTML. It maps the card to the Aetheris contract: Hanken Grotesk + JetBrains Mono, structural spectral edges, masked glass ring, specular elevation, shared radii, focus halo, calm hover/press states, and dark/light/reduced-transparency parity. Filled gradient text and filled rainbow action buttons are prohibited.
- `scripts/generate-route-html.mjs` keeps Poppins for the shared `/engineering` shell, adds Hanken Grotesk + JetBrains Mono for the card, and injects the cache-busted card stylesheet. The root, orb, and game routes must not receive those card assets.
- WebGL-unavailable or policy-disabled fallback: CSS gradient orbs remain mounted beneath the managed canvas and preserve the complete content path.

### /work (Aetheris Iridescent)
- Design tokens and component recipes are scoped to `.work-page` in `WorkPage.css`: structural spectral gradients, Hanken Grotesk + JetBrains Mono, glass panels, the 6/10/14/26px radius hierarchy, light-derived elevation, and the shared interaction system. Styleguide source: `mstrbstrd/aetheris-styleguide`; follow `conventions.md` when extending.
- `public/work-typography.css` is injected only into generated `/work` HTML. It may refine type scale, line length, alignment, and composition, but must not replace the Aetheris palette, spectral material, glass surfaces, shape language, motion rules, or two-font Technical-Humanist pairing.
- Hero emphasis is flat `--ink`, not gradient-clipped text. The spectral gradient remains visible as structural rails, rules, panel rings, controls, and focus treatment.
- `scripts/generate-route-html.mjs` swaps the base Poppins stylesheet for Hanken Grotesk + JetBrains Mono and adds the cache-busted `/work` composition stylesheet. Other routes must not receive the work stylesheet.
- `SpectralBloom.js` - WebGL1 document-space flower backdrop (stem rooted at page bottom, petals shed on scroll). Bayer-dithered; strict motion discipline (30fps idle cap, reduced-motion static frame). CSS ambient gradient is its fallback.
- `useWorkPolish.js` - scroll parallax (`[data-depth]`) + reveal-on-scroll (`[data-reveal]`); no-ops under reduced motion / missing IntersectionObserver.
- Motion budget pinned by `WorkPageMotion.test.js`: exactly one CSS keyframe (`work-fade-in`), zero infinite animations.

### /dither-canvas (CreatorOS field lab)
- `DitherCanvasPage.js` owns the ten-study selector and guarantees that only one visible renderer family is mounted at a time.
- `GraphicsFallbackPage.js` is the intentional policy-disabled route. It explains safe mode and provides explicit enhanced-graphics opt-in without making WebGL mandatory.
- `CreatorOSLavaLampCanvas.js` is the direct port of `mstrbstrd/CreatorOS/apps/web/components/fluid-background.tsx`. Preserve its half-resolution WebGL1 canvas, 30fps cap, Bayer-8 quantization, exact spectral palette, transparent premultiplied output, viscous wax deformation, velocity stretch/pinch, and 3.2 second warm-up.
- `CreatorOSFieldCanvas.js` is the shared WebGL2 renderer for Metabloom, Tidal Weave, Moiré Halo, Contour Drift, Morphogen Divide, Quasicrystal Chorus, Hyperbolic Garden, and Forward Pass. It carries the same CreatorOS rendering contract while preserving each study's independent scene mathematics.
- Morphogen Divide owns two RGBA8 ping-pong textures. It must never sample from the texture attached to the framebuffer currently being written.
- CreatorOS-derived fields retain their authored 0.5 CSS resolution on normal desktops, upscale with `image-rendering: pixelated`, use transparent premultiplied alpha over `#080809` / `#fff8f7`, and disable the route's full-screen blur and grain so Bayer cells remain crisp. Windows and mobile drawing buffers are additionally bounded by `ditherCanvasRuntime.js` without changing scene mathematics.
- Every field renderer declares local context recovery so a failed study cannot poison WebGL for the entire session. Windows uses a 600,000-pixel ceiling, a 24fps floor interval, and a high-performance adapter preference with strict-then-relaxed context creation.
- Hidden tabs cancel rendering. Paused and reduced-motion renderers draw only invalidated or settled frames rather than retaining idle animation callbacks. Theme, reset, context restoration, CSS fallback, pointer interaction, and explicit GPU cleanup are required invariants.
- `RuptureCanvas.js` remains isolated as the Second Surface material study and must not be folded into the fluid renderer.

### window.__* globals contract
Producers null their globals on cleanup. Orb/dither: `__orbPop`, `__orbExpress`, `__orbPlaySequence`, `__orbStop`, `__orbReset`, `__orbExpressions`, `__orbTalk`, `__orbStopTalk`, `__ditherRaiseCanvas`, `__ditherLowerCanvas`, `__ditherLockToHero`, `__ditherUnlock`, `__ditherRevealIn`, `__ditherRevealOut`, `__ditherSetCD`, `__ditherSetOrb`, `__addDitherRipple` (all from DitherBackground). Others: `__bhModeActive` (OrbSection, synchronously bridged by `rendererOwnership.js`), `__serviceCardExpanded` (ServicesSection), `__triggerLoading` (App / StandaloneExperiencePage), `__perfReport` (telemetry), `__graphicsReport` (graphics policy diagnostics).

## Conventions & cautions

- `html { font-size: 62.5% }` -> 1rem = 10px, **but** `index.css` shrinks the root to 55-58% on small screens for the immersive routes; `/work` and standalone routes restore 62.5% on mount.
- Mobile behavior branches on `isMobileTier` / `hasHardwareWebGL` from `src/utils/deviceTier.js`.
- Timers/listeners: always capture and clear (see `useWorkPolish.js` / `LoadingOverlay.js` for the pattern).
- `patchResizeObserver.js` must stay the first import in `src/index.js`.
- Glass + per-frame transforms must not share a compositing subtree (Chrome clip desync) - see the comment in `ServicesSection.js` ExpandedOverlay before restructuring.
- Tests pin many literals: `favicon.test.js` (icon/manifest), `WorkPageMotion.test.js` (keyframe budget), `ProfessionalHeroStyle.test.js` (Aetheris card and route isolation), `SpectralBloom.test.js` (shader discipline strings), graphics policy/governor/runtime tests, geodesic-renderer preservation tests, and the a11y suite (`src/__tests__/a11y/`, 10 files). Run the full suite after edits.
- `git rm` over delete; never commit `node_modules` or `build/`.
- Remote: `https://github.com/mstrbstrd/popular-consulting.git` (branch `main`); Vercel deploys from main.
- CI (`.github/workflows/quality.yml`) gates lint, tests, and build on Ubuntu plus the complete test suite, build, and built-route Edge smoke on `windows-latest`. Windows CI validates cross-platform code and route behavior in a VM; it is not a substitute for real Intel, AMD, and NVIDIA hardware performance validation.
