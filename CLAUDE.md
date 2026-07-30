# Popular Consulting - CLAUDE.md

## Project Overview

A React business + engineering platform for "Popular Consulting" with five routes served from one CRA bundle, deployed on Vercel. The immersive home is a WebGL-heavy, section-snap experience; `/engineering` adds an Aetheris Iridescent professional profile card; `/work` is a conventional scrollable portfolio built on the same design system with a route-scoped typographic composition layer.

## Routes (`src/SiteRouter.js`)

| Path | View | Notes |
|---|---|---|
| `/` | `App` (immersive, business audience) | Section-snap parallax, WebGL dither background |
| `/engineering` | `App` (immersive, engineering audience) | Shared immersive shell plus draggable Aetheris `ProfessionalHero` and engineering copy via `siteCopy` audiences |
| `/work` | `WorkPage` | Scrollable portfolio; Aetheris design system; SpectralBloom backdrop |
| `/orb` | `StandaloneExperiencePage` (orb) | noindex; lazy-loads `OrbSection` |
| `/game` | `StandaloneExperiencePage` (game) | noindex; lazy-loads `PopcornGame` |

Unknown paths fall back to `/`. Per-route HTML (title/meta/canonical) is generated at build time by `scripts/generate-route-html.mjs` from `src/content/routeMetadata.json`; `vercel.json` rewrites the routes to those files.

## Stack

- React 18 (CRA / react-scripts 5), JavaScript only (no TypeScript)
- MUI v5 (`Box`/`Typography`/`Container`/`TextField`/`Button` in BioSection, ServicesSection, ContactSection only - removal is a planned project)
- Custom CSS: global `src/index.css`, per-component inline `<style>` blocks, route-scoped `public/engineering-card.css`, `src/components/WorkPage.css`, and route-scoped `public/work-typography.css`
- WebGL (raw, no library): `DitherBackground` (WebGL2), `BlackHoleBackground`/`BlackHoleCanvas` (WebGL2), `SpectralBloom` (WebGL1)
- **Not used anywhere (do not reintroduce): Tailwind, framer-motion, Emotion-direct, simplex-noise**

## Commands

```bash
npm start       # Dev server -> http://localhost:3000
npm run build   # Prod build (sourcemaps off) + route HTML generation
npm test        # Jest / RTL / jest-axe
npm run lint    # eslint --max-warnings 0 (CI-gated)
```

## Architecture

### Immersive home (`/`, `/engineering`)
- `ParallaxBackground.js` - section-snap controller. Intercepts wheel/keyboard/touch (native scroll is NOT used); 4 sections: DitherHero, Bio, Services, Contact. Section dots (`.section-dot`) are the navigation contract: `document.querySelectorAll('.section-dot')[N]?.click()` navigates from anywhere.
- `DitherBackground.js` (~1900 lines) - persistent WebGL2 dither canvas, per-section shader presets, orb face/emotions, CD/black-hole blend modes. **Touch carefully; verify visually.**
- `experiencePlacement.js` - which sections render (orb currently disabled on the main stack).
- `siteCopy.js` - dual-audience copy (business vs engineering); `immersiveMode.js` picks per route.
- `ProfessionalHero.js` owns the `/engineering` card's reveal state, section-action routing, pointer capture, viewport clamping, drag suppression, and double-click reset. Do not move those invariants into presentation code or replace its inline transform.
- `public/engineering-card.css` is injected only into generated `/engineering` HTML. It maps the card to the Aetheris contract: Hanken Grotesk + JetBrains Mono, structural spectral edges, masked glass ring, specular elevation, shared radii, focus halo, calm hover/press states, and dark/light/reduced-transparency parity. Filled gradient text and filled rainbow action buttons are prohibited.
- `scripts/generate-route-html.mjs` keeps Poppins for the shared `/engineering` shell, adds Hanken Grotesk + JetBrains Mono for the card, and injects the cache-busted card stylesheet. The root, orb, and game routes must not receive those card assets.
- WebGL-unavailable fallback: `deviceTier.js` `hasHardwareWebGL` gates canvases; CSS gradient orbs render instead.

### /work (Aetheris Iridescent)
- Design tokens and component recipes are scoped to `.work-page` in `WorkPage.css`: structural spectral gradients, Hanken Grotesk + JetBrains Mono, glass panels, the 6/10/14/26px radius hierarchy, light-derived elevation, and the shared interaction system. Styleguide source: `mstrbstrd/aetheris-styleguide`; follow `conventions.md` when extending.
- `public/work-typography.css` is injected only into generated `/work` HTML. It may refine type scale, line length, alignment, and composition, but must not replace the Aetheris palette, spectral material, glass surfaces, shape language, motion rules, or two-font Technical-Humanist pairing.
- Hero emphasis is flat `--ink`, not gradient-clipped text. The spectral gradient remains visible as structural rails, rules, panel rings, controls, and focus treatment.
- `scripts/generate-route-html.mjs` swaps the base Poppins stylesheet for Hanken Grotesk + JetBrains Mono and adds the cache-busted `/work` composition stylesheet. Other routes must not receive the work stylesheet.
- `SpectralBloom.js` - WebGL1 document-space flower backdrop (stem rooted at page bottom, petals shed on scroll). Bayer-dithered; strict motion discipline (30fps idle cap, reduced-motion static frame). CSS ambient gradient is its fallback.
- `useWorkPolish.js` - scroll parallax (`[data-depth]`) + reveal-on-scroll (`[data-reveal]`); no-ops under reduced motion / missing IntersectionObserver.
- Motion budget pinned by `WorkPageMotion.test.js`: exactly one CSS keyframe (`work-fade-in`), zero infinite animations.

### window.__* globals contract
Producers null their globals on cleanup. Orb/dither: `__orbPop`, `__orbExpress`, `__orbPlaySequence`, `__orbStop`, `__orbReset`, `__orbExpressions`, `__orbTalk`, `__orbStopTalk`, `__ditherRaiseCanvas`, `__ditherLowerCanvas`, `__ditherLockToHero`, `__ditherUnlock`, `__ditherRevealIn`, `__ditherRevealOut`, `__ditherSetCD`, `__ditherSetOrb`, `__addDitherRipple` (all from DitherBackground). Others: `__bhRevealStart` (BlackHoleBackground), `__bhModeActive` (OrbSection), `__serviceCardExpanded` (ServicesSection), `__triggerLoading` (App / StandaloneExperiencePage), `__perfReport` (telemetry).

## Conventions & cautions

- `html { font-size: 62.5% }` -> 1rem = 10px, **but** `index.css` shrinks the root to 55-58% on small screens for the immersive routes; `/work` and standalone routes restore 62.5% on mount.
- Mobile behavior branches on `isMobileTier` / `hasHardwareWebGL` from `src/utils/deviceTier.js`.
- Timers/listeners: always capture and clear (see `useWorkPolish.js` / `LoadingOverlay.js` for the pattern).
- `patchResizeObserver.js` must stay the first import in `src/index.js`.
- Glass + per-frame transforms must not share a compositing subtree (Chrome clip desync) - see the comment in `ServicesSection.js` ExpandedOverlay before restructuring.
- Tests pin many literals: `favicon.test.js` (icon/manifest), `WorkPageMotion.test.js` (keyframe budget), `ProfessionalHeroStyle.test.js` (Aetheris card and route isolation), `SpectralBloom.test.js` (shader discipline strings), a11y suite (`src/__tests__/a11y/`, 10 files). Run the full suite after edits.
- `git rm` over delete; never commit `node_modules` or `build/`.
- Remote: `https://github.com/mstrbstrd/popular-consulting.git` (branch `main`); Vercel deploys from main. CI (`.github/workflows/quality.yml`): lint -> test -> build, all gating.
