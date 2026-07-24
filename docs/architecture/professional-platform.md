# Professional Platform Architecture

- **Status:** Proposed foundation
- **Owner:** Shaedan Hawse
- **Last reviewed:** 2026-07-23
- **Repository:** `mstrbstrd/popular-consulting`

## Context

Popular Consulting is already a distinctive production website and a useful demonstration of front-end engineering. Its current experience is organized around custom full-screen section navigation, WebGL and GLSL rendering, animated cards, and a small set of business-oriented sections.

The platform now needs to support a larger professional system:

- Present Shaedan as an Engineering Lead and hands-on Full Stack Software Engineer
- Preserve Popular Consulting as a credible commercial business
- Publish evidence-backed project case studies
- Support direct links from resumes, applications, LinkedIn, and interviews
- Make essential information readable without animation or WebGL
- Keep employer-specific and confidential material outside the public repository

The work must not destabilize the current live experience or require a high-risk rewrite.

## Current system

The current application uses:

- React 18 and Create React App
- JavaScript
- Material UI, Tailwind CSS, and component-level styles
- Framer Motion and custom CSS animation
- WebGL, GLSL, Canvas, and Simplex Noise
- Custom section navigation based on wheel, keyboard, touch, DOM events, and fixed viewport layout
- Lazy loading for expensive sections
- Hardware WebGL detection and lower-device-tier adaptations
- Core Web Vitals and custom performance telemetry
- Jest, React Testing Library, and `jest-axe`

Important current constraints include:

- Root document scrolling is intentionally disabled.
- The custom section controller owns significant navigation behavior.
- Some cross-component behavior uses custom DOM events and `window` APIs.
- WebGL components can be expensive or unstable on software renderers and virtual machines.
- The visual experience is highly stateful, which makes conventional deep links and static content harder.
- Create React App is legacy infrastructure and should not receive major new architectural investment.

## Decision

Evolve the repository into a dual-purpose professional platform with conventional content routes and an optional immersive experience.

The essential content layer will be:

- Directly linkable
- Searchable
- Readable without WebGL
- Server-renderable or statically renderable after migration
- Structured from a canonical content model
- Safe to reuse across pages, resumes, social metadata, and application landing pages

The existing immersive experience will be preserved as progressive enhancement and eventually exposed through a dedicated route such as `/experience`.

## Audiences

| Audience | Primary question |
| --- | --- |
| Hiring manager | What has Shaedan built, owned, and improved? |
| Engineering leader | Can Shaedan make sound decisions and lead delivery? |
| Founder or client | Can Popular Consulting solve this business problem? |
| Technical peer | What evidence supports the claims and decisions? |
| Search engine or social preview | What is this page about without executing the full application? |

## Goals

1. Communicate professional positioning within five seconds.
2. Provide a direct route to selected engineering work.
3. Publish case studies that explain constraints, decisions, failure handling, and outcomes.
4. Preserve the consulting conversion path.
5. Make claims traceable to evidence without exposing private repositories.
6. Support accessible task completion across keyboard, touch, pointer, screen reader, reduced motion, no WebGL, and lower-powered devices.
7. Introduce architecture and delivery changes incrementally with an explicit rollback path.
8. Maintain one canonical content source across domains and output formats.

## Non-goals

The foundation phase will not:

- Rewrite the current application
- Change live visual behavior
- Publish employer-specific application documents
- Publish confidential client code or operational detail
- Invent business metrics to make a case study appear stronger
- Add a content management system before the content model is proven
- Choose a new hosting platform without auditing the current deployment
- Make Popular Consulting look like a temporary job-search landing page

## Target information architecture

The route names remain provisional until implementation, but the content responsibilities are stable.

| Route | Responsibility |
| --- | --- |
| `/` | Recruiter-first professional introduction with a visible consulting path |
| `/work` | Selected engineering work and filters |
| `/work/dy-ecommerce` | Confidentiality-safe commerce platform case study |
| `/work/creatoros` | AI operations and multi-tenant SaaS case study |
| `/work/spectrafy` | Product engineering, media, and front-end case study |
| `/work/popular-consulting` | WebGL, accessibility, performance, and debugging case study |
| `/engineering` | Leadership approach, architecture principles, and technical practices |
| `/writing` | Technical articles and public decision records |
| `/resume` | Public web resume without private phone or reference details |
| `/consulting` | Commercial services and client inquiry path |
| `/about` | Professional background and working style |
| `/contact` | Engineering opportunity and consulting inquiry paths |
| `/experience` | Preserved immersive WebGL experience |

Unlisted employer-specific pages may be introduced later under `/hire/<role>` with `noindex`. They are convenience pages, not a security boundary and not a location for confidential material.

## Content architecture

Public content should live in repository-controlled, reviewable source files rather than being duplicated inside component markup.

The content model separates:

- Professional identity
- Employment and consulting experience
- Projects
- Case studies
- Evidence references
- Verified metrics
- Skills and capabilities
- Writing
- Commercial services
- Role-specific public landing pages

See [the public content model](../content/content-model.md).

## Progressive enhancement

Essential information must not depend on the immersive layer.

### Baseline

A visitor can:

- Read Shaedan's professional identity and biography
- Review selected projects and case studies
- Read a public resume
- Reach contact information
- Understand consulting services
- Navigate with conventional links

### Enhanced

When capabilities permit, the platform can add:

- WebGL backgrounds
- Interactive transitions
- Parallax section behavior
- Three-dimensional cards
- Richer pointer effects
- Optional playful or experimental sections

### Failure behavior

When WebGL, animation, or a heavy component fails:

- Content remains present.
- Navigation remains conventional and operable.
- A CSS or static visual fallback is shown.
- The failure does not block contact, work, resume, or consulting tasks.
- The failure can be observed without exposing private telemetry data.

## Accessibility architecture

The platform treats accessibility as behavior, not a test badge.

Required properties include:

- Semantic links and buttons for all actions
- Complete keyboard operation
- Visible focus and predictable focus restoration
- Correct overlay and dialog semantics
- Reduced-motion alternatives
- Sufficient contrast in every interaction state
- Accessible form labels, errors, status messages, and successful submission feedback
- Conventional document landmarks and heading order
- A usable no-WebGL and no-animation path
- Manual validation in addition to automated `axe` checks

## Evidence architecture

A public claim must be traceable to an evidence record maintained outside rendered prose.

An evidence record identifies:

- The claim
- The supporting repository, file, release, issue, pull request, screenshot, or measurement
- Shaedan's actual contribution
- Collaboration and attribution requirements
- Confidentiality classification
- Metric verification state
- Roles or audiences for which the claim is relevant
- Whether the claim is approved for public use

The public site may reference a sanitized evidence identifier, but private repository paths and client-sensitive notes remain outside this repository.

## Security and confidentiality boundaries

The public application and repository must never become the storage location for:

- Employer-specific resumes or cover letters
- Private phone numbers or reference information
- Client credentials, code, customer data, or proprietary rules
- Internal infrastructure topology or identifiers
- Security details that materially increase attack surface
- Unredacted screenshots from administrative or production systems
- Metrics whose source cannot be verified

A separate private career workspace may hold templates and redacted notes, but secrets and reference details should remain local-only.

## Platform migration

The recommended target is a current, supported framework that can render conventional content routes while isolating browser-only WebGL components. The exact supported versions must be confirmed at implementation time.

The expected direction is:

- Next.js App Router
- TypeScript
- Static or server-rendered content pages
- Typed local content or MDX
- Client-only boundaries for browser and WebGL code
- React Testing Library and Playwright
- Automated accessibility and link checks
- Preview deployments
- Performance budgets and current Core Web Vitals

This direction is not approval for a big-bang rewrite.

## Migration sequence

### Phase 1: Preserve and document

- Record current hosting, DNS, build, and deployment behavior.
- Tag a known-good release.
- Capture baseline screenshots and smoke paths.
- Document current navigation, WebGL capability behavior, telemetry, and tests.
- Establish repository and publication standards.

### Phase 2: Separate content from presentation

- Define the canonical content model.
- Move public professional copy into reviewable content files.
- Create evidence records for material claims.
- Draft public case studies without changing runtime behavior.

### Phase 3: Add conventional routes

- Build recruiter-first home, work, resume, consulting, and contact routes.
- Preserve the current immersive site separately.
- Add direct URLs, metadata, sitemap, and structured data.
- Validate keyboard, focus, reduced-motion, touch, and no-WebGL paths.

### Phase 4: Modernize incrementally

- Introduce the supported framework shell.
- Port content routes first.
- Move interactive components one at a time.
- Keep expensive graphics behind client and capability boundaries.
- Replace obsolete telemetry APIs with current metrics.
- Compare behavior and performance against the baseline.

### Phase 5: Cut over safely

- Validate production preview and canonical redirects.
- Confirm analytics and contact delivery.
- Confirm rollback to the previous known-good release.
- Cut over only after parity, accessibility, and failure-path review.

## Deployment facts to confirm

Before routing or framework changes, document:

- Current hosting provider
- Build and deployment trigger
- Domain ownership and DNS configuration
- Canonical domain and redirect support
- Environment variables and secret ownership
- Form delivery configuration
- Analytics and telemetry endpoints
- Cache and CDN behavior
- Preview environment availability
- Current rollback procedure

No deployment architecture should be inferred solely from source files.

## Acceptance criteria

The professional platform architecture is implemented when:

- A visitor can understand Shaedan's role and value within five seconds.
- Work, case studies, resume, consulting, and contact have direct URLs.
- Essential content works without WebGL and animation.
- Public claims map to reviewed evidence.
- Employer-specific materials remain private and unindexed.
- Case studies contain no confidential or exploitable information.
- Keyboard and screen-reader users can complete every core task.
- Current Core Web Vitals are measured with documented budgets.
- Preview validation and rollback are documented.
- Both domains resolve to one canonical content system.

## Open decisions

The following choices are intentionally deferred until their constraints are verified:

- Canonical domain and redirect direction
- Hosting and preview platform
- Exact framework and version
- MDX versus typed data files
- Public resume download format and build process
- Whether the immersive experience remains a route or becomes a project case study only
- Whether public writing remains in this repository or is imported from an existing blog repository
- Which client and project names have explicit publication approval
