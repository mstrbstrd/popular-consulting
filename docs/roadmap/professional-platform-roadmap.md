# Professional Platform Roadmap

- **Status:** Active planning baseline
- **Owner:** Shaedan Hawse
- **Last reviewed:** 2026-07-23

## Outcome

Transform Popular Consulting into the canonical public platform for:

- Shaedan Hawse's Engineering Lead positioning
- Evidence-backed full-stack, AI, and commerce work
- Popular Consulting's commercial services
- Directly linkable case studies and engineering writing
- A public resume and role-relevant project views
- A preserved immersive WebGL experience

The work proceeds in independent, reversible slices. Application materials and public-platform work move in parallel so that a framework migration cannot block active applications.

## Priority rule

When work competes for attention, use this order:

1. Factual accuracy and confidentiality
2. Active application deliverables
3. Accessibility and security defects
4. Recruiter access to existing evidence
5. Case-study depth
6. Platform modernization
7. Visual refinement

## Workstreams

### A. Repository foundation

**Goal:** Make future changes reviewable, safe, and traceable.

Deliverables:

- Professional repository README
- Contribution guide
- Security policy
- Pull request template
- Issue templates
- Architecture baseline
- Publication and evidence policy
- Public content model
- Case-study and decision-record templates
- Private-material ignore rules

Gate:

- Documentation is internally consistent.
- No runtime file changes are included.
- The default branch remains untouched until review and merge.

### B. Evidence and professional narrative

**Goal:** Establish a truthful source for resumes, biographies, case studies, and interviews.

Deliverables:

- Private evidence ledger
- Project inventory
- Actual title and engagement history
- Verified capability map
- Metrics verification queue
- Confidentiality review for each project
- Engineering Lead master narrative
- Short, medium, and long professional biographies
- Interview story bank

Gate:

- Every material resume claim maps to evidence.
- Historical titles remain accurate.
- Private phone and reference information remain local-only.
- Unverified metrics are excluded from public and application outputs.

### C. Application packages

**Goal:** Produce separate, evidence-backed application materials without waiting for the site migration.

Order:

1. Imagine Everything, Intermediate Software Developer
2. Matter, e-commerce and generative AI
3. Imagine Everything, Front-End Web Developer

Each package includes:

- Role-specific resume
- Role-specific cover letter
- Plain-text application version
- PDF and DOCX exports
- Relevant project brief
- Claim-to-evidence review
- Interview preparation notes

Supporting briefs:

- CreatorOS Architecture and Invariants
- Commerce Infrastructure Meets AI Operations
- Accessible Interactive Web Engineering

Gate:

- The correct contact details appear in private application exports.
- Public versions exclude the phone number.
- No package reuses generic role language without tailoring.
- Current job status is verified before submission.

### D. Case studies

**Goal:** Show engineering judgment rather than a gallery of screenshots.

Order:

1. DY Ecommerce or a confidentiality-safe neutral title
2. CreatorOS
3. Spectrafy
4. Popular Consulting
5. Popular Consensus when relevant

Each case study must cover:

- Context and problem
- Constraints
- What must never happen
- Ownership and collaboration
- Architecture
- Decisions and rejected alternatives
- Security and privacy
- Accessibility and user experience
- Testing
- Deployment and operations
- Verified outcomes
- Lessons and next improvements

Gate:

- Project naming is approved or generalized.
- Diagrams and screenshots are sanitized.
- Metrics are verified.
- The case study remains useful without private source access.

### E. Recruiter-first content routes

**Goal:** Make essential professional content directly accessible without requiring the immersive interface.

Planned routes:

- `/`
- `/work`
- `/work/<project>`
- `/engineering`
- `/writing`
- `/resume`
- `/consulting`
- `/about`
- `/contact`
- `/experience`

Deliverables:

- Conventional navigation
- Recruiter-first homepage
- Selected-work index
- Project case-study pages
- Public web resume
- Consulting path
- Contact path
- Canonical metadata
- Open Graph and social images
- Sitemap, robots rules, and structured data
- Unlisted `noindex` role pages when useful

Gate:

- Core tasks work without WebGL.
- All routes are keyboard and screen-reader operable.
- Every page has unique, accurate metadata.
- Canonical domain and redirects are verified.
- Employer-specific pages are unlisted and `noindex`.

### F. Accessibility and performance hardening

**Goal:** Make the existing experience a stronger engineering artifact while protecting users.

Initial review areas:

- Service-card button semantics and keyboard activation
- Expanded-overlay focus management and dialog semantics
- Escape and close behavior
- Reduced-motion behavior
- No-WebGL and software-renderer experience
- Touch behavior and target size
- Form error and submission feedback
- Current Core Web Vitals, including INP
- Long-running animation and observer cleanup
- Lower-powered device budgets

Gate:

- Automated accessibility tests pass.
- Manual keyboard and screen-reader task paths are documented.
- Performance claims include measurements.
- Expensive effects fail to readable content.

### G. Platform modernization

**Goal:** Move away from legacy Create React App infrastructure without a big-bang rewrite.

Sequence:

1. Audit hosting, DNS, deployment, forms, analytics, and rollback.
2. Capture behavioral and visual baselines.
3. Extract canonical content from components.
4. Introduce a supported typed content shell.
5. Build conventional routes.
6. Port browser-only and WebGL components behind explicit client boundaries.
7. Add Playwright smoke coverage, link validation, metadata validation, and preview deployments.
8. Compare accessibility, behavior, and performance against the baseline.
9. Cut over only after rollback is proven.

Likely direction:

- Current supported Next.js App Router
- TypeScript
- Typed content or MDX
- React Testing Library
- Playwright
- Static or server-rendered content
- Client-only WebGL boundaries
- Current Core Web Vitals

Gate:

- No unresolved parity regression exists.
- Production preview passes core task checks.
- Redirects and canonical URLs are validated.
- Contact delivery and telemetry are validated.
- Rollback to a known-good release is documented and tested.

## Initial issue queue

### Foundation

- `docs: replace default CRA README with project documentation`
- `docs: add repository contribution and security standards`
- `docs: define public content and evidence policy`
- `architecture: document professional platform constraints and target state`
- `chore: add portfolio pull request and issue templates`
- `chore: protect local and private career material from Git tracking`

### Evidence and content

- `content: create private evidence ledger`
- `content: draft Engineering Lead master narrative`
- `content: verify professional history and project ownership`
- `content: audit project names and publication permissions`
- `content: identify metrics that can be verified`

### Case studies

- `case-study: draft confidentiality-safe DY Ecommerce story`
- `case-study: publish CreatorOS architecture and invariants`
- `case-study: publish Spectrafy product engineering story`
- `case-study: document Popular Consulting accessibility and performance`

### Runtime

- `a11y: audit service-card semantics and keyboard activation`
- `a11y: audit overlay focus management and dialog behavior`
- `performance: replace FID telemetry with INP reporting`
- `seo: replace generic metadata with professional metadata`
- `feat: add recruiter-first work and resume routes`
- `ci: add build, test, accessibility, link, and smoke gates`
- `migration: introduce typed content shell`

### Applications

These belong in the private career workspace:

- `application: complete Imagine Intermediate package`
- `application: complete Matter AI commerce package`
- `application: complete Imagine Front-End package`

## Pull request sequence

Recommended public-repository sequence:

1. Foundation documentation only
2. Focused accessibility fixes
3. Metadata and social presentation
4. Canonical public content records
5. First case study
6. Recruiter-first route shell
7. Additional case studies
8. CI quality gates
9. Framework migration slices

Do not mix the documentation foundation with runtime behavior changes. This keeps review and rollback unambiguous.

## Stop conditions

Pause a change before merge when:

- A client or project name lacks publication approval.
- A metric cannot be verified.
- A screenshot or diagram may expose confidential information.
- Essential content is inaccessible without WebGL or animation.
- A migration changes deployment without a known rollback.
- Automated tests pass but a manual core task fails.
- A role-specific page could become publicly indexed.
- A generated resume or case study overstates contribution.
- Hosting or DNS behavior is being assumed rather than inspected.

## Definition of the first public release

The first professional-platform release is complete when:

- The public headline is consistent.
- The homepage exposes work, resume, consulting, and contact paths.
- At least three reviewed case studies are directly linkable.
- The public resume excludes private contact details.
- The GitHub repository and profile reflect current engineering level.
- Core tasks work without WebGL and animation.
- Search and social metadata are accurate.
- Application materials are maintained separately.
- CI protects build, tests, accessibility, and core route behavior.
- A rollback path is documented.
