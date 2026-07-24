# Dual-audience copy architecture

Popular Consulting serves two connected audiences without forcing one generic message onto both.

## Route contract

| Route | Primary audience | Opening |
| --- | --- | --- |
| `/` | Businesses considering Popular Consulting | Original immersive brand entrance |
| `/engineering` | Hiring managers, engineering leaders, and technical peers | Shaedan Hawse engineering introduction |
| `/work` | Both audiences | Conventional evidence-led project portfolio |
| `/orb`, `/game` | Optional experience viewers | Isolated interactive experiments |

## Copy source of truth

Shared public wording lives in `src/content/siteCopy.js`.

- `business` copy explains business problems, services, engagement practices, and project contact.
- `engineering` copy explains operating principles, technical capabilities, production ownership, and role contact.
- Approved cross-route links, including the live industrial storefront, are defined once.

Route metadata lives in `src/content/routeMetadata.json`. The React application uses the same values at runtime, while `scripts/generate-route-html.mjs` creates route-specific static HTML after the production build. This ensures crawlers and link-preview services receive the correct title, description, canonical URL, social metadata, and robots directive without executing JavaScript.

## Shared facts

Both journeys can describe the same verified capabilities:

- Full-stack product delivery
- AI systems with source-of-truth boundaries
- Commerce and payment systems
- Microsoft Dynamics NAV and third-party integrations
- Accessible interfaces
- CI/CD, deployment, observability, and production support

The audience changes the framing, not the factual basis.

## Publication invariants

- Never invent metrics, employment history, credentials, direct reports, or formal management scope.
- Never imply that AI output is authoritative business data.
- Never publish private repositories, secrets, customer records, internal hosts, or exploitable operational detail.
- Never make the business route read like a job application.
- Never make the engineering route read like generic agency marketing.
- Never create contradictory claims across routes.
- Never publish the private phone number.
- Keep the original immersive experience intact at `/`.
- Keep essential professional evidence readable without WebGL at `/work`.

## Review checklist

Before changing visible copy:

1. Identify the route and audience.
2. Map each claim to public-safe evidence.
3. Confirm the same fact is not contradicted elsewhere.
4. Remove unsupported scale, compliance, or outcome claims.
5. Confirm AI wording preserves review and source-of-truth boundaries.
6. Run the complete test suite and production build.
7. Inspect both route-specific static HTML outputs.
