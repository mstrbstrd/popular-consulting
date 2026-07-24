# Publication and Evidence Policy

- **Status:** Required for public professional content
- **Owner:** Shaedan Hawse
- **Last reviewed:** 2026-07-23

## Purpose

Popular Consulting is a public repository and website. Professional content must be compelling without becoming inaccurate, confidential, misleading, or operationally unsafe.

This policy applies to:

- Resumes and public biographies
- Project summaries and case studies
- Architecture diagrams
- Screenshots and recordings
- Performance and business metrics
- Client and employer names
- Technical articles
- Social metadata and preview images
- AI-assisted copy

## Core rule

A public claim is publishable only when it is:

1. True
2. Supported by evidence
3. Accurate about Shaedan's contribution
4. Safe to disclose
5. Appropriate for the intended audience
6. Written without implying more certainty than the evidence provides

When any condition is unresolved, omit the claim or mark it as blocked from publication.

## Information classifications

### Public

Safe to publish after factual review:

- Public professional identity and location
- Public contact email
- Public project descriptions
- Technologies visibly used in public repositories
- Sanitized architecture patterns
- Verified measurements that disclose no sensitive operations
- Public links and approved screenshots
- General lessons and tradeoffs

### Public after approval or redaction

Requires explicit review before publication:

- Client or employer names
- Project names associated with a private repository
- Revenue, conversion, traffic, customer, or operational metrics
- Architecture diagrams derived from a private system
- Production incident narratives
- Payment, authentication, shipping, or infrastructure implementation details
- Screenshots from non-public systems
- Statements about sole ownership or leadership

### Private career workspace

May be stored only in a controlled private workspace, and still must not contain secrets:

- Employer-specific resume variants
- Cover letters
- Job descriptions and interview notes
- Redacted private-project evidence references
- Draft claims awaiting verification
- Confidentiality review notes
- Metric sources that cannot be made public

### Local only

Do not place in a Git repository, including a private repository:

- Phone numbers not intended for public display
- Reference names and contact details
- Government identifiers
- Passwords, tokens, certificates, recovery codes, and private keys
- Unredacted customer or employee data
- Original confidential exports
- Production database snapshots

## Evidence records

Every material claim should map to an evidence record containing:

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier for the claim |
| `claim` | Exact or approved public wording |
| `project` | Project or experience that supports it |
| `evidence` | Repository, file, pull request, release, issue, screenshot, measurement, or document |
| `contribution` | Shaedan's actual role and work |
| `collaborators` | Attribution or shared ownership requirements |
| `classification` | Public, approval required, private, or local only |
| `metricStatus` | Verified, approximate, unavailable, or prohibited |
| `reviewedAt` | Date of last factual review |
| `approvedForPublicUse` | Explicit publication decision |
| `notes` | Constraints, wording limits, and interview context |

Private repository paths and confidential notes must not be copied into public content files.

## Contribution language

Use verbs that match the work performed.

### Use when supported

- Architected
- Designed
- Implemented
- Led
- Owned
- Operated
- Diagnosed
- Integrated
- Migrated
- Measured
- Mentored
- Documented

### Qualify when work was shared

Prefer wording such as:

- Co-designed with the product owner
- Led implementation within a broader team
- Owned the payment integration while collaborating on checkout UX
- Maintained and extended an existing system
- Contributed the front-end architecture and production rollout

Do not use "built" or "led" as a default when the work was partial, inherited, or collaborative.

## Metrics

A metric is publishable only when:

- The source is known.
- The measurement method is documented.
- The comparison window is fair.
- The result can be reproduced or independently confirmed.
- The value does not disclose confidential business information.
- The wording distinguishes correlation from causation.

Acceptable alternatives when business metrics are unavailable include:

- Number and type of external integrations
- Markets, environments, or workflows supported
- Test coverage by behavior, not an invented percentage
- Measured latency, bundle, or interaction changes
- Deployment frequency or incident-response scope when verified
- Responsibilities and architectural boundaries
- Failure modes eliminated by a specific control

Do not publish vague claims such as "dramatically improved performance" or "significantly increased revenue" without evidence.

## Client and project naming

Before naming a client or private project, confirm:

- Contractual and confidentiality obligations
- Whether the relationship is already public
- Whether the client has approved portfolio use
- Whether the name creates unwanted security attention
- Whether a neutral title communicates the work just as well

A safe alternative is a descriptive title such as:

```text
International Industrial E-Commerce Platform
```

The public title should not be deceptive. It may generalize the client, industry, geography, or scale only to protect confidentiality.

## Architecture diagrams

Public diagrams should show concepts, not exploitable topology.

Remove or generalize:

- Hostnames and IP addresses
- Account and tenant identifiers
- Secret names and storage locations
- Firewall rules and ports not essential to the lesson
- Internal service names
- Administrative paths
- Production region and backup details when sensitive
- Exact authentication and payment control sequences when disclosure adds risk

Prefer boundaries such as "ERP," "Payment Provider," "Application API," and "Managed Database."

## Screenshots and recordings

Before publishing visual evidence:

- Use synthetic or approved data.
- Remove names, email addresses, order numbers, addresses, tokens, and account IDs.
- Inspect browser chrome, tabs, notifications, and developer tools.
- Remove internal URLs and environment names.
- Confirm the image does not reveal private source code.
- Preserve enough context that the image is not misleading.
- Add meaningful alt text.

Redaction must remove the underlying information rather than merely covering it with a reversible layer.

## Security-sensitive domains

Payment, authentication, AI, customer data, infrastructure, and incident content require heightened review.

Public content may explain:

- High-level boundaries
- Threats considered
- Invariants enforced
- Failure handling
- Testing strategy
- General tradeoffs

Public content should not expose:

- Secrets or key-management details
- Bypass instructions
- Internal endpoints
- Fraud controls that become weaker when known
- Unpatched vulnerabilities
- Production debugging data
- Detailed incident timelines before remediation and approval

## AI-assisted content

AI tools may support drafting, organization, proofreading, and analysis. They may not be treated as evidence.

Before publishing AI-assisted content:

- Verify every factual claim against a source.
- Remove invented metrics, responsibilities, and technologies.
- Check that tone does not overstate seniority or certainty.
- Check that confidential context was not copied into public prose.
- Review code and architecture explanations for security implications.
- Ensure the final wording reflects Shaedan's actual judgment and voice.

The author remains responsible for the published result.

## Review checklist

Before merging professional content:

- [ ] The intended audience and purpose are clear.
- [ ] Every material claim has evidence.
- [ ] Contributions and collaboration are attributed accurately.
- [ ] Metrics are verified or omitted.
- [ ] Client and project names are approved or generalized.
- [ ] Screenshots and diagrams are sanitized.
- [ ] No private contact, reference, customer, or employee data appears.
- [ ] No implementation detail materially increases attack surface.
- [ ] AI-assisted text received factual and confidentiality review.
- [ ] The content remains useful without relying on confidential proof.
- [ ] A future reviewer can understand why publication was considered safe.

## Corrections

When a public claim is found to be inaccurate or unsafe:

1. Remove or correct the rendered content immediately.
2. Determine whether cached pages, social previews, releases, or artifacts also need correction.
3. Record the reason in the pull request without repeating sensitive information.
4. Update the evidence record and review process.
5. Treat a confidential-data or secret exposure as a security incident under [SECURITY.md](../../SECURITY.md).
