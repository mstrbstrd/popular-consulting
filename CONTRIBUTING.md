# Contributing

Popular Consulting is both a production business website and a public engineering portfolio. Changes must protect the live experience, the accuracy of professional claims, client confidentiality, accessibility, and repository history.

## Working agreement

- Do not commit directly to `main`.
- Create a focused branch for one coherent change.
- Keep unrelated cleanup out of feature and content pull requests.
- Prefer small, reversible changes over broad rewrites.
- Preserve a known-good path for users without WebGL, animation, or high-end hardware.
- Never publish a claim, metric, screenshot, or client detail without evidence and publication approval.

Recommended branch patterns:

```text
agent/<description>
feat/<description>
fix/<description>
content/<description>
case-study/<description>
a11y/<description>
performance/<description>
```

## Local validation

Install and run the current application with Node.js 20.x:

```bash
npm install
npm start
```

Before requesting review, run the relevant checks:

```bash
npm test -- --watchAll=false
npm run build
```

A documentation-only change does not need a browser build when it cannot affect runtime behavior. The pull request must state why the omitted checks are not relevant.

## Negative-space review

Before implementation, describe what the change must never do. At minimum, consider whether it could:

- Break keyboard, touch, pointer, or screen-reader access
- Make essential content depend on WebGL or animation
- Crash or stall lower-powered devices
- Expose secrets, personal information, client details, or attack-surface information
- Invent or overstate a professional claim
- Change a canonical URL without a redirect
- Introduce a new runtime failure without a fallback
- Make deployment or rollback ambiguous
- Couple unrelated systems unnecessarily
- Hide an operational or validation failure

The pull request template records these invariants so that a regression has an explicit boundary.

## Accessibility expectations

Automated accessibility tests are a floor, not the definition of accessibility.

For interactive changes, verify as applicable:

- Complete keyboard operation
- Visible focus
- Correct semantic role, name, state, and value
- Focus entry and restoration for overlays
- Escape and close behavior
- Reduced-motion behavior
- Touch target size
- Contrast in resting, hover, focus, active, and disabled states
- Meaningful behavior without WebGL
- Form labels, errors, submission feedback, and heading order

Add or update regression tests when a defect can be represented reliably in the test suite.

## Performance expectations

Measure before optimizing. Preserve or document:

- Lazy loading for expensive sections
- Hardware and device capability fallbacks
- Bounded animation and rendering work
- Cleanup of timers, observers, event listeners, and animation frames
- A readable fallback when an effect cannot initialize

Do not claim a performance improvement without a reproducible measurement.

## Security and privacy

Never commit:

- Secrets, tokens, credentials, certificates, or private keys
- Real customer or employee data
- Private phone numbers or reference details
- Employer-specific application materials
- Internal infrastructure identifiers
- Client source code or proprietary rules

Use environment variables for configuration and commit only safe examples. Follow [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Professional claims and case studies

Every material public claim should answer:

1. What evidence supports it?
2. What was Shaedan's actual contribution?
3. Is the wording accurate about collaboration?
4. Is the evidence safe to publish?
5. Is a metric verified and reproducible?
6. Does the client or project name require permission?

Follow [the publication and evidence policy](docs/content/publication-policy.md).

## Commits

Use terse, descriptive commit messages. Good examples:

```text
document professional platform foundation
add keyboard activation to service cards
publish CreatorOS architecture case study
replace FID telemetry with INP reporting
```

Do not use a commit message to make a claim that the diff does not support.

## Pull requests

A pull request should include:

- The problem and intended outcome
- Scope and explicit non-goals
- Constraints and invariants
- Testing performed
- Accessibility, security, privacy, and performance impact
- Screenshots or recordings for visible changes
- Evidence review for professional content
- Rollback or recovery path

Draft pull requests are encouraged for incomplete but reviewable work.

## Definition of done

A change is complete when:

- The intended behavior is implemented and documented
- Relevant tests and the production build pass
- Failure paths and fallbacks are considered
- Public claims are evidence-backed
- Confidentiality has been reviewed
- Essential content remains accessible
- The pull request explains how to verify and reverse the change
