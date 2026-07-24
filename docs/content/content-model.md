# Public Content Model

- **Status:** Proposed
- **Owner:** Shaedan Hawse
- **Last reviewed:** 2026-07-23

## Purpose

The professional platform needs one canonical, reviewable source for public identity, work, case studies, services, writing, and role-specific landing pages.

Content must not be duplicated across component markup, metadata, downloadable resumes, and application pages without a source of truth. Duplication creates factual drift, inconsistent titles, stale dates, and confidentiality mistakes.

## Principles

1. **Content is data, not component state.** Components render content but do not become its canonical storage location.
2. **Public facts are explicit.** Dates, contribution language, publication status, and evidence state are fields rather than assumptions hidden in prose.
3. **Private evidence stays private.** Public records may use sanitized evidence identifiers, never private repository paths or confidential notes.
4. **Metrics fail closed.** A metric that is not verified is not rendered.
5. **Client names fail closed.** A client or private project name is not rendered until publication approval is explicit.
6. **Routes remain stable.** Slugs are durable identifiers and changes require redirects.
7. **Essential content is presentation-independent.** The same record can support a conventional page, social metadata, a resume, or a non-WebGL fallback.
8. **Role pages are curated views.** They reference canonical project and capability records instead of copying claims.

## Proposed source structure

```text
content/
├── profile/
│   ├── identity.ts
│   ├── biography.ts
│   ├── capabilities.ts
│   └── experience.ts
├── projects/
│   ├── dy-ecommerce.mdx
│   ├── creatoros.mdx
│   ├── spectrafy.mdx
│   ├── popular-consulting.mdx
│   └── popular-consensus.mdx
├── services/
│   └── services.ts
├── writing/
│   └── <article-slug>.mdx
└── role-pages/
    └── <role-slug>.ts
```

The exact file format remains open. Typed data and MDX are both acceptable when they enforce the same invariants.

## Core types

The following TypeScript shapes document the intended data contract. They are not yet runtime implementation.

```ts
export type PublicationState =
  | "draft"
  | "review"
  | "approved"
  | "blocked";

export type Confidentiality =
  | "public"
  | "redacted"
  | "approval-required"
  | "private";

export type MetricStatus =
  | "verified"
  | "approximate"
  | "unavailable"
  | "prohibited";

export interface EvidenceReference {
  id: string;
  publicLabel: string;
  classification: Confidentiality;
  approvedForPublicUse: boolean;
  reviewedAt: string;
}

export interface VerifiedMetric {
  id: string;
  label: string;
  value: string;
  status: MetricStatus;
  method?: string;
  measuredAt?: string;
  evidenceId?: string;
}

export interface Capability {
  id: string;
  label: string;
  category:
    | "leadership"
    | "frontend"
    | "backend"
    | "data"
    | "ai"
    | "commerce"
    | "platform"
    | "security"
    | "delivery";
  summary: string;
  evidenceIds: string[];
  public: boolean;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  neutralTitle?: string;
  summary: string;
  status: PublicationState;
  confidentiality: Confidentiality;
  nameApprovedForPublicUse: boolean;
  contribution: string;
  collaboration?: string;
  capabilities: string[];
  technologies: string[];
  evidenceIds: string[];
  metrics: VerifiedMetric[];
  featured: boolean;
  sortOrder: number;
  repositoryUrl?: string;
  liveUrl?: string;
  image?: {
    src: string;
    alt: string;
  };
  seo: SeoRecord;
}

export interface SeoRecord {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string;
  noIndex?: boolean;
}

export interface RolePage {
  id: string;
  slug: string;
  title: string;
  organization?: string;
  status: PublicationState;
  noIndex: true;
  headline: string;
  summary: string;
  projectIds: string[];
  capabilityIds: string[];
  resumeAsset?: string;
  expiresAt?: string;
}
```

## Identity record

The identity record is the canonical source for public professional positioning.

Required values include:

```ts
export const identity = {
  name: "Shaedan Hawse",
  headline:
    "Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems",
  location: "Kelowna, BC, Canada",
  publicEmail: "shaw@popcon.dev",
  canonicalDomain: "popcon.dev",
};
```

The phone number is intentionally excluded from the public model.

## Project publication rules

A project may render publicly only when:

- `status` is `approved`.
- `confidentiality` is `public` or `redacted`.
- The displayed title follows `nameApprovedForPublicUse`.
- At least one evidence record supports each material claim.
- Every displayed metric has `status: "verified"`.
- Public URLs and screenshots have been reviewed.
- The case study passes the publication checklist.

When `nameApprovedForPublicUse` is false, the renderer uses `neutralTitle` and must not leak the private title through page metadata, image filenames, alt text, URLs, JSON-LD, analytics labels, or source comments.

## Metric rendering rule

The renderer must never infer that a metric is valid merely because a value exists.

```ts
const publicMetrics = metrics.filter(
  (metric) => metric.status === "verified" && metric.evidenceId,
);
```

Approximate metrics may be useful in private interview notes, but they are not public portfolio facts.

## Case-study sections

Each project case study should provide structured sections for:

- Executive summary
- Business context
- Problem
- Constraints
- What must never happen
- Shaedan's ownership
- Collaboration and stakeholders
- Architecture
- Decisions and rejected alternatives
- Security and privacy
- Accessibility and user experience
- Testing and validation
- Deployment and operations
- Outcomes
- Lessons learned
- Next improvements
- Public-safe evidence

Use [the case-study template](../templates/case-study.md).

## Experience records

Historical titles and dates must match the underlying employment or engagement record. Marketing positioning may appear in the page headline, but it must not replace a historical title.

An experience record should separate:

- Organization
- Actual title
- Engagement type
- Start and end dates
- Responsibilities
- Evidence-backed outcomes
- Selected project references
- Public description
- Private notes stored outside this repository

## Role-specific pages

A role page is an unlisted, `noindex` view assembled from canonical records.

It may:

- Select relevant projects
- Reorder capabilities
- Provide a role-specific introduction
- Link to an approved resume asset
- Explain why the work is relevant to the organization

It must not:

- Duplicate case-study claims
- Contain job-description text copied without need
- Reveal private applicant tracking information
- Act as a password or privacy mechanism
- Remain indexed after the application is no longer active
- Publish a resume containing a private phone number unless access control is deliberately implemented elsewhere

## SEO and social metadata

Metadata must be generated from the same approved record that renders the page.

A project title or client name blocked in content must also be blocked in:

- `<title>`
- Meta description
- Canonical URL
- Open Graph fields
- Social image text and filename
- Structured data
- Sitemap
- Breadcrumbs
- Analytics events

This prevents accidental disclosure through invisible page surfaces.

## Content validation

The implementation should add build-time validation for:

- Unique IDs and slugs
- Required fields
- Valid internal references
- Approved publication state
- Verified metric requirements
- `noindex` on role pages
- Canonical path uniqueness
- Image alt text
- Date format
- Broken internal links
- Disallowed private fields

A validation failure must stop the build rather than silently omit unsafe content.

## Rendering boundaries

Server-rendered or statically rendered components may consume approved public content.

Browser-only components may receive only the minimum public fields they need. Do not send private evidence notes, blocked titles, or hidden metrics to the browser and rely on CSS or rendering logic to conceal them.

## Content workflow

1. Create or update the evidence record outside the public renderer.
2. Draft the canonical public content.
3. Review contribution language and collaboration.
4. Review confidentiality, names, screenshots, diagrams, and metrics.
5. Set publication state to `review`.
6. Validate content and preview metadata.
7. Record approval in the pull request.
8. Set publication state to `approved`.
9. Merge and verify the rendered page.
10. Re-review when a material fact, link, or confidentiality condition changes.

## Open decisions

- Typed `.ts` records versus MDX front matter
- How public resume exports consume the same model
- Whether evidence IDs are rendered publicly
- Whether role pages expire automatically
- Which content is shared with the consulting domain
- Whether writing is migrated from the existing blog repository
