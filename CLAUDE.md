# Popular Consulting - CLAUDE.md

## Project Overview

A React business + engineering platform for "Popular Consulting" with five routes served from one CRA bundle, deployed on Vercel. The immersive home is a WebGL-heavy, section-snap experience; `/work` is a conventional scrollable portfolio with a minimal editorial monograph treatment layered over technical system diagrams.

## Routes (`src/SiteRouter.js`)

| Path | View | Notes |
|---|---|---|
| `/` | `App` (immersive, business audience) | Section-snap parallax, WebGL dither background |
| `/engineering` | `App` (immersive, engineering audience) | Same shell, `ProfessionalHero` opening + engineering copy via `siteCopy` audiences |
| `/work` | `WorkPage` | Scrollable portfolio; editorial monograph styling; muted `SpectralBloom` texture |
| `/orb` | `StandaloneExperiencePage` (orb) | noindex; lazy-loads `OrbSection` |
| `/game` | `StandaloneExperiencePage` (game) | noindex; lazy-loads `PopcornGame` |

Unknown paths fall back to `/`. Per-route HTML (title/meta/canonical) is generated at build time by `scripts/generate-route-html.mjs` from `src/content/routeMetadata.json`; `vercel.json` rewrites the routes to those files.

## Stack

- React 18 (CRA / react-scripts 5), JavaScript only (no TypeScript)
- MUI v5 (`Box`/`Typography`/`Container`/`TextField`/`Button` in BioSection, ServicesSection, ContactSection only - removal is a planned project)
- Custom CSS: global `src/index.css`, per-component inline `<style>` blocks, `src/components/WorkPage.css`, and the route-scoped `public/work-typography.css` editorial layer
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
- WebGL-unavailable fallback: `deviceTier.js` `hasHardwareWebGL` gates canvases; CSS gradient orbs render instead.

### /work (Editorial Monograph)
- `WorkPage.css` owns the semantic layout, engineering diagrams, responsive behavior, and base component recipes.
- `public/work-typography.css` is injected only into generated `/work` HTML. It replaces the iridescent/glass presentation with warm ink and paper palettes, one accessible signal colour, square geometry, open whitespace, and an asymmetric Newsreader / Hanken Grotesk / JetBrains Mono hierarchy.
- The hero emphasis must remain flat text. Do not restore gradient-clipped lettering, pill-heavy metadata, glow effects, or repeated card-lift interactions without an explicit design decision.
- `scripts/generate-route-html.mjs` swaps the base Poppins stylesheet for the `/work` font set and cache-busted editorial stylesheet. Other routes must not receive these assets.
- `SpectralBloom.js` remains the WebGL1 document-space flower backdrop, but the editorial layer renders it at very low opacity and in grayscale so it reads as texture rather than spectacle. Bayer-dithered; strict motion discipline (30fps idle cap, reduced-motion static frame). CSS ambient tone is its fallback.
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
- Tests pin many literals: `favicon.test.js` (icon/manifest), `WorkPageMotion.test.js` (keyframe budget), `SpectralBloom.test.js` (shader discipline strings), a11y suite (`src/__tests__/a11y/`, 10 files). Run the full suite after edits.
- `git rm` over delete; never commit `node_modules` or `build/`.
- Remote: `https://github.com/mstrbstrd/popular-consulting.git` (branch `main`); Vercel deploys from main. CI (`.github/workflows/quality.yml`): lint -> test -> build, all gating.
