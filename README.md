# Popular Consulting

**Engineering leadership, full-stack systems, AI operations, and commerce software.**

Popular Consulting is the public business and engineering portfolio platform for **Shaedan Hawse**, an **Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems** based in Kelowna, British Columbia.

- Consulting entrance: [popcon.dev](https://popcon.dev)
- Engineering entrance: [popcon.dev/engineering](https://popcon.dev/engineering)
- Selected work: [popcon.dev/work](https://popcon.dev/work)
- Business domain: [popular-consulting.com](https://popular-consulting.com)
- Contact: [shae@popcon.dev](mailto:shae@popcon.dev)

## Audience and copy contract

The public platform uses one evidence base with distinct audience framing:

- `/` speaks to businesses evaluating Popular Consulting.
- `/engineering` speaks to hiring teams, engineering leaders, and technical peers.
- `/work` provides conventional, public-safe project evidence for both audiences.

Visible copy is defined in [`src/content/siteCopy.js`](src/content/siteCopy.js). Route metadata is defined in [`src/content/routeMetadata.json`](src/content/routeMetadata.json) and emitted as route-specific static HTML during the production build. See [the dual-audience copy architecture](docs/content/dual-audience-copy.md).

## What this repository is

The current application is a visually rich React experience built around full-screen navigation, custom WebGL and GLSL rendering, interactive service and biography cards, accessible navigation affordances, responsive behavior, and local graphics recovery.

The repository is also becoming the public source of truth for:

- Shaedan's professional engineering identity
- Selected, publication-safe case studies
- Architecture and technical decision records
- Engineering writing
- A public resume without private contact details
- Popular Consulting's commercial services

The essential portfolio content remains readable and operable without WebGL, animation, high-end hardware, or access to private client repositories.

## Public route contract

The application separates its brand, professional, portfolio, and experimental experiences:

| Route | Purpose | Opening identity |
| --- | --- | --- |
| `/` | Original Popular Consulting immersive experience | Animated Popular Consulting logo |
| `/engineering` | Professional immersive experience for hiring teams and engineering peers | Shaedan Hawse Engineering Lead card |
| `/work` | Conventional, directly linkable selected-work page | Scrollable engineering portfolio |
| `/orb` | Unlisted, route-only interactive graphics experiment | Interactive orb controls and dedicated visual preset |
| `/game` | Unlisted, route-only browser game | Popcorn game and dedicated visual preset |
| `/dither-canvas` | Unlisted generative field lab | Live field study or intentional graphics fallback |

The normal `/` and `/engineering` section stacks contain only Hero, About, Services, and Contact. The orb and game are not mounted, linked, or represented by section dots in the normal application. Direct `/orb`, `/game`, and `/dither-canvas` responses are excluded from indexing.

The original logo and professional card are mutually exclusive. Unknown paths fail closed to the original immersive experience.

### Restoring the orb to the main application

Orb placement is intentionally reversible. In [`src/experiencePlacement.js`](src/experiencePlacement.js), change one value:

```js
orb: false,
```

to:

```js
orb: true,
```

That single switch restores the orb as the fifth main section and adds its main-navigation item. The dedicated `/orb` route remains available. No component, router, shader, or navigation refactor is required.

## Graphics preservation and safety contract

The visual experience is a product invariant. Safety controls must bound work and recover locally rather than replace the art direction by default.

- Windows automatic sessions attempt enhanced WebGL after the existing hardware probe. Operating-system detection alone does not force CSS mode.
- `?graphics=css` forces the CSS fallback for the current session.
- `?graphics=webgl` explicitly requests enhanced graphics and clears a prior recorded graphics failure.
- `?graphics=auto` clears a stored override and returns to capability-based policy.
- `window.__graphicsReport()` exposes the active policy, bounded diagnostics, and the last recorded graphics failure.
- A lost WebGL context is handled in place. The document is never reloaded as a graphics recovery strategy.
- Managed Dither canvases are bounded before their first draw and capped at the declared frame interval.
- Hidden tabs, reduced-motion sessions, inactive renderers, and exclusive Orb Black Hole mode do not retain a competing live Dither renderer.
- `BlackHoleCanvas.js` preserves the original three-channel geodesic renderer, RK4 integration, accretion disk, Doppler and gravitational shifts, psychedelic palette, ordered dither, scanlines, camera movement, zoom controls, and pop transition.
- The original profile remains the non-Windows default at 200 integration steps, a 0.08 base step, and the original 0.35 drawing scale.
- Windows starts with the same shader at a balanced workload: 96 integration steps, an equivalent 16-unit nominal path, a 96,000-pixel ceiling, and a 24 fps ceiling.
- A black-hole shader or context failure retries once with the same geodesic algorithm at the safe profile: 64 steps, an equivalent 16-unit nominal path, a 64,000-pixel ceiling, and a 20 fps ceiling.
- `?black-hole-quality=original`, `balanced`, or `safe` selects a profile for direct comparison and hardware validation.
- A final black-hole failure restores renderer ownership to Dither and removes only the failed overlay. It does not disable every WebGL experience for the session.
- The dormant duplicate `BlackHoleBackground.js` implementation is removed, but recreating the active Orb effect as an analytic approximation is prohibited.

## Engineering evidence already present

The site currently demonstrates:

- React component architecture and route-level lazy loading
- Material UI, custom CSS systems, and responsive interface work
- Custom WebGL, GLSL, Canvas, and CSS fallback effects
- Policy-aware capability detection and session-safe degradation
- Mobile and lower-powered device adaptations
- Bounded renderer ownership, pixel budgets, frame budgets, and context-loss recovery
- Core Web Vitals, long-task, section-transition, and graphics breadcrumb telemetry
- Keyboard navigation, focus management, and a skip-to-content path
- Automated accessibility checks with React Testing Library and `jest-axe`
- Ubuntu and Windows CI for tests and production builds
- Built-route smoke coverage in Microsoft Edge on Windows
- Cross-browser debugging of transforms, clipping, blur, compositing, and graphics-driver failure modes

## Current stack

| Area | Technology |
| --- | --- |
| Application | React 18, Create React App |
| Interface | Material UI 5, custom CSS, MUI's Emotion runtime |
| Motion | CSS animation and explicit JavaScript state machines |
| Graphics | WebGL1/2, GLSL, Canvas 2D, CSS fallbacks |
| Testing | Jest, React Testing Library, `jest-axe`, Windows Edge route smoke |
| Performance | `web-vitals`, PerformanceObserver, bounded graphics diagnostics |
| Runtime | Node.js 20 |

Create React App is now legacy infrastructure. Migration will be incremental and test-driven rather than a high-risk rewrite. See [the professional platform architecture](docs/architecture/professional-platform.md).

## Local development

### Prerequisites

- Node.js 20.x
- npm

### Run the application

```bash
npm install
npm start
```

The development server runs at `http://localhost:3000`.

### Validate a change

```bash
npm run lint
npm test -- --watchAll=false --runInBand
npm run build
```

Focused accessibility tests live under `src/__tests__/a11y/`. Graphics policy, geodesic-renderer preservation, quality profiles, renderer ownership, context governance, and context-loss recovery are pinned by focused regression suites under `src/utils/` and `src/components/`.

## Repository map

```text
.
├── public/                    # Static assets and default page metadata
├── scripts/                   # Route generation and Windows browser smoke harness
├── src/
│   ├── assets/                # Images and icons
│   ├── components/            # Interface, portfolio, and graphics components
│   ├── contexts/              # Shared application context
│   ├── experiencePlacement.js # One-switch orb placement contract
│   ├── utils/                 # Capability, graphics policy, recovery, and telemetry
│   └── __tests__/a11y/        # Accessibility regression tests
├── docs/
│   ├── adr/                   # Architecture decision records
│   ├── architecture/          # Platform architecture and constraints
│   ├── content/               # Public content and evidence policies
│   ├── roadmap/               # Sequenced modernization work
│   └── templates/             # Repeatable documentation templates
└── .github/                   # Pull request, issue, and cross-platform quality gates
```

## Professional platform direction

The platform serves two audiences without creating two disconnected brands:

1. Hiring teams should quickly understand what Shaedan builds, owns, and leads.
2. Prospective clients should understand how Popular Consulting can solve a business problem.

The original immersive route remains the brand entrance. The engineering route provides an intentional professional entrance, and the work route provides conventional recruiter scanning. The route-only experiments remain available for deliberate sharing without extending the normal business journey. Future directly linkable pages will cover case studies, engineering writing, a public resume, consulting, and contact.

The initial case-study sequence is:

1. DY Ecommerce, published only at a confidentiality-safe level
2. CreatorOS
3. Spectrafy
4. Popular Consulting
5. Popular Consensus, when it supports the role or audience

## Publication and confidentiality

This is a public repository. It must never contain:

- Client source code or proprietary business rules
- Secrets, tokens, credentials, private keys, or production configuration
- Customer or employee personal information
- Private phone numbers or reference details
- Internal hostnames, infrastructure diagrams, or operational details that increase attack surface
- Unverified metrics or exaggerated contribution claims
- Employer-specific application materials

Read [the publication and evidence policy](docs/content/publication-policy.md) before adding case studies, metrics, screenshots, architecture diagrams, or client references.

## Contributing

Use a focused branch and a pull request. Every pull request should explain the problem, constraints, invariants, validation, accessibility impact, security impact, and rollback path.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [the pull request template](.github/pull_request_template.md).

## Security

Do not report suspected vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License and reuse

No open-source license is currently granted. Source code, visual assets, branding, written content, and case studies remain protected by applicable copyright. Do not copy, redistribute, or use the project commercially without written permission.

## Contact

For engineering opportunities, technical collaboration, or consulting work:

- Email: [shae@popcon.dev](mailto:shae@popcon.dev)
- Location: Kelowna, BC, Canada
- Engineering profile: [popcon.dev/engineering](https://popcon.dev/engineering)
