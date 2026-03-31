# Popular Consulting — CLAUDE.md

## Project Overview

A visually rich, interactive React business website for "Popular Consulting" with the tagline "Set Yourself Free." The standout feature is a WebGL-based dithered background that renders distinct animated shader patterns per section and transitions between them.

The app lives inside the `popular-consulting/` subdirectory. All source work happens there.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 (Create React App) |
| Styling | Tailwind CSS + Emotion (CSS-in-JS) |
| UI Components | Material-UI (MUI) v5 |
| Animation | Framer Motion + custom CSS + WebGL |
| Graphics | WebGL GLSL shaders, Canvas, Simplex Noise |
| Language | JavaScript (no TypeScript) |
| Package Manager | npm |

---

## Commands

```bash
cd popular-consulting

npm start       # Dev server → http://localhost:3000
npm run build   # Production build → build/
npm test        # Jest / React Testing Library
```

---

## Architecture

### Sections (parallax scroll, 5 total)
1. **Hero** — DitherHero + HeroLogo + typewriter effect
2. **Bio** — BioSection with entry animations
3. **Services** — Glass-morphism cards: "AI Education For Everyone", "Custom Software Solutions", "Implementation & Integration"
4. **Contact** — ContactSection with form + social links
5. **Orb** — OrbSection with interactive 3D WebGL sphere

### Navigation
`ParallaxBackground.js` drives the full-screen section-based scroll. Navigation is wheel + keyboard (arrow keys, Page Up/Down) with a 1200ms cooldown. It does **not** use native browser scroll.

Nav links: About (→ Bio), Services, Contact, Blog ↗ (external: `https://www.popularconsumption.xyz/`). The nav pill is hidden on the Hero section and slides in from the top on all other sections.

### Dither Background (`DitherBackground.js` — 58KB)
The core visual engine. Renders different GLSL shader patterns per section with cross-dissolve transitions:

| Section | Shape ID | Pattern |
|---|---|---|
| Hero | 6 | Ripples |
| Bio | 3 | Waves |
| Services | 4 | Mandala |
| Contact | 0 | Plasma |
| Orb | 7 | Sphere 3D |

The sphere supports facial expressions (eye/mouth blending) and pop/reanimate sequences.

### Global Orb APIs (window globals)
```js
window.__orbPop()
window.__orbExpress(emotion)
window.__orbPlaySequence(name)
window.__orbStop()
```

---

## Key Files

```
popular-consulting/
├── src/
│   ├── App.js                      # Root component, section assembly
│   ├── index.js                    # React entry point
│   ├── index.css                   # Global styles (9.4KB)
│   ├── components/
│   │   ├── DitherBackground.js     # WebGL shader engine (58KB) — touch carefully
│   │   ├── ParallaxBackground.js   # Scroll/navigation controller
│   │   ├── NavMenu.js              # Responsive nav, active section tracking
│   │   ├── DitherHero.js           # Hero click/drag ripple surface
│   │   ├── HeroLogo.js             # Fixed logo, typewriter, 3D flip
│   │   ├── BioSection.js           # About section
│   │   ├── ServicesSection.js      # Service cards
│   │   ├── ContactSection.js       # Contact form + footer
│   │   └── OrbSection.js          # Interactive orb + emotion controls
│   ├── assets/
│   │   ├── icons/                  # 17 SVG/PNG/GIF icons
│   │   ├── img/                    # 9 PNG/JPEG images
│   │   └── video/                  # 3 MP4 videos
│   └── utils/
│       └── cn.js                   # clsx + tailwind-merge helper
├── tailwind.config.js              # Dark mode (class), custom colors/z-index
└── package.json
```

---

## Conventions

- **No TypeScript** — all files are `.js` / `.jsx`
- **Utility class merging** — use `cn()` from `src/utils/cn.js` when combining Tailwind classes conditionally
- **Styling approach** — MUI `sx` prop is the primary approach for component-level theming and dynamic styles; Tailwind is used for utility classes via `cn()`; inline `<style>` tags are used in some components (e.g. NavMenu, ServicesSection) for keyframe animations and pseudo-element styles that MUI sx can't handle cleanly. Emotion is a peer dependency of MUI but not used directly.
- **Overflow** — `overflow: hidden` on root; layout is fixed/full-screen, not document scroll
- **Mobile** — Mobile detection is handled per-component (not a global context); check existing patterns before adding new mobile logic
- **Animations** — Framer Motion for section entry/exit; CSS transitions for hover states; WebGL for background effects
- **Global state** — Minimal; cross-component communication uses `window.*` globals (see Orb APIs above) and custom DOM events

---

## Legacy / Unused Components

These files exist in `src/components/` but are **not imported in `App.js`** and appear to be unused or experimental:

- `BackgroundBeams.js` / `BackgroundBeamsHero.js`
- `BackgroundRipples.js`
- `WavyBackground.js`
- `TextMaskReveal.js`
- `TextRandomizer.js`
- `VideoSection.js`
- `HeroSection.js`
- `LoadingComponent.js`

Do not delete without confirming with the user — some may be candidates for future use.

---

## Cautions

- `DitherBackground.js` is complex WebGL/GLSL code. Make targeted edits and verify visually — the shader math is sensitive.
- The parallax scroll system (`ParallaxBackground.js`) intercepts all wheel and keyboard events. If adding new interactive components, ensure event propagation is handled correctly.
- `node_modules` is 843MB. Do not commit it; `.gitignore` excludes it.
- The `build/` directory is also gitignored — don't commit build artifacts.
- Git remote: `https://github.com/mstrbstrd/popular-consulting.git` (branch: `main`)
