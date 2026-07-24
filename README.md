# Popular Consulting

**Engineering leadership, full-stack systems, AI operations, and commerce software.**

Popular Consulting is the public business and engineering portfolio platform for **Shaedan Hawse**, an **Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems** based in Kelowna, British Columbia.

- Website: [popcon.dev](https://popcon.dev)
- Business domain: [popular-consulting.com](https://popular-consulting.com)
- Contact: [shaw@popcon.dev](mailto:shaw@popcon.dev)

## What this repository is

The current application is a visually rich React experience built around full-screen navigation, custom WebGL and GLSL rendering, interactive service and biography cards, accessible navigation affordances, responsive behavior, and hardware-aware fallbacks.

The repository is also becoming the public source of truth for:

- Shaedan's professional engineering identity
- Selected, publication-safe case studies
- Architecture and technical decision records
- Engineering writing
- A public resume without private contact details
- Popular Consulting's commercial services

The essential portfolio content will remain readable without WebGL, animation, high-end hardware, or access to private client repositories.

## Engineering evidence already present

The site currently demonstrates:

- React component architecture and lazy loading
- Material UI, Tailwind CSS, and responsive interface work
- Custom WebGL and GLSL effects
- Capability detection and non-WebGL fallbacks
- Mobile and lower-powered device adaptations
- Core Web Vitals, long-task, and section-transition telemetry
- Keyboard navigation and a skip-to-content path
- Automated accessibility checks with React Testing Library and `jest-axe`
- Cross-browser debugging of transforms, clipping, blur, and compositing behavior

## Current stack

| Area | Technology |
| --- | --- |
| Application | React 18, Create React App |
| Interface | Material UI 5, Tailwind CSS, Emotion |
| Motion | Framer Motion, CSS animation |
| Graphics | WebGL, GLSL, Canvas, Simplex Noise |
| Testing | Jest, React Testing Library, `jest-axe` |
| Performance | `web-vitals`, PerformanceObserver, Beacon API |
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
npm test -- --watchAll=false
npm run build
```

Focused accessibility tests live under `src/__tests__/a11y/`.

## Repository map

```text
.
├── public/                  # Static assets and page metadata
├── src/
│   ├── assets/              # Images, icons, and video
│   ├── components/          # Interface and WebGL components
│   ├── contexts/            # Shared application context
│   ├── utils/               # Capability and telemetry utilities
│   └── __tests__/a11y/      # Accessibility regression tests
├── docs/
│   ├── adr/                 # Architecture decision records
│   ├── architecture/        # Platform architecture and constraints
│   ├── content/             # Public content and evidence policies
│   ├── roadmap/             # Sequenced modernization work
│   └── templates/           # Repeatable documentation templates
└── .github/                 # Pull request and issue standards
```

## Professional platform direction

The target platform serves two audiences without creating two disconnected brands:

1. Hiring teams should quickly understand what Shaedan builds, owns, and leads.
2. Prospective clients should understand how Popular Consulting can solve a business problem.

Planned public routes include conventional, directly linkable pages for work, case studies, engineering writing, a public resume, consulting, and contact. The immersive WebGL experience will remain available as progressive enhancement rather than the only way to reach essential information.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [pull request template](.github/pull_request_template.md).

## Security

Do not report suspected vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License and reuse

No open-source license is currently granted. Source code, visual assets, branding, written content, and case studies remain protected by applicable copyright. Do not copy, redistribute, or use the project commercially without written permission.

## Contact

For engineering opportunities, technical collaboration, or consulting work:

- Email: [shaw@popcon.dev](mailto:shaw@popcon.dev)
- Location: Kelowna, BC, Canada
- Website: [popcon.dev](https://popcon.dev)
