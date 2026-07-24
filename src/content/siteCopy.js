export const SITE_AUDIENCES = Object.freeze({
  BUSINESS: "business",
  ENGINEERING: "engineering",
});

const LIVE_STOREFRONT = Object.freeze({
  label: "Open live storefront",
  href: "https://shop.dyconcretepumps.com",
});

const BUSINESS_COPY = Object.freeze({
  navigation: Object.freeze({
    brandLabel: "Popular Consulting",
    brandAriaLabel: "Popular Consulting - return to home",
    links: Object.freeze([
      Object.freeze({ label: "About", section: 1 }),
      Object.freeze({ label: "Services", section: 2 }),
      Object.freeze({ label: "Work", href: "/work" }),
      Object.freeze({ label: "Engineering", href: "/engineering" }),
      Object.freeze({ label: "Contact", section: 3 }),
    ]),
  }),
  bio: Object.freeze({
    sectionLabel: "About Popular Consulting",
    label: "About Popular Consulting",
    title: "Technology built around the business.",
    subtitle:
      "Strategy, software, AI, and commerce systems shaped around how your team actually works.",
    paragraph:
      "Popular Consulting is a hands-on development partner for businesses that need a clear technical path and one accountable person from discovery through launch. The goal is practical software that removes friction, connects the right systems, and remains understandable after handoff.",
    readMoreLabel: "How engagements work",
    photoAlt: "Portrait of Shaedan Hawse, the engineer behind Popular Consulting",
    sections: Object.freeze([
      Object.freeze({
        heading: "What I solve",
        body:
          "I help businesses replace manual work, connect disconnected systems, improve customer journeys, and launch software that fits real operating constraints.",
      }),
      Object.freeze({
        heading: "What I build",
        body:
          "The work includes full-stack web applications, customer and internal portals, AI-assisted workflows, commerce systems, payment integrations, APIs, automation, and the delivery infrastructure behind them.",
      }),
      Object.freeze({
        heading: "How I work",
        body:
          "Each engagement starts with the business problem, current systems, budget, timeline, and the capabilities your team needs to retain. I prefer the simplest architecture that can meet the real requirements, and I make tradeoffs visible before implementation.",
      }),
      Object.freeze({
        heading: "What you receive",
        body:
          "A complete delivery path: scoped decisions, tested implementation, deployment, documentation, handoff, and support. The system should solve the problem without creating unnecessary dependence on its original builder.",
      }),
    ]),
  }),
  services: Object.freeze({
    sectionLabel: "Popular Consulting services",
    label: "Ways to work together",
    title: "Software, AI & Commerce.",
    subtitle:
      "Focused services for businesses that need technology to solve an operating problem, not add another layer of complexity.",
    cta: "Discuss your project",
    cards: Object.freeze([
      Object.freeze({
        id: "training",
        title: "AI Strategy & Team Enablement",
        description:
          "Practical guidance that helps your team choose useful AI workflows, understand the risks, and adopt the tools with confidence.",
        detailed:
          "We begin with the work your team already performs, identify where AI can remove repetition or improve access to information, and separate useful opportunities from expensive distractions. Training is built around your workflows, data boundaries, and skill level, with examples your team can apply immediately.",
        featured: true,
      }),
      Object.freeze({
        id: "software",
        title: "Custom Software Development",
        description:
          "Web applications, portals, internal tools, and APIs designed around the process your business actually needs.",
        detailed:
          "I design and build responsive front ends, APIs, data models, authentication, integrations, deployment pipelines, and operational documentation as one coherent system. Technology is selected for the problem and the team that will operate it, with maintainable handoff treated as part of delivery.",
        featured: false,
      }),
      Object.freeze({
        id: "integration",
        title: "AI Integration & Automation",
        description:
          "AI and automation connected to existing systems with explicit review points, source-of-truth boundaries, and visible failure handling.",
        detailed:
          "This can include document and knowledge workflows, intelligent search, classification, customer context, email or reporting automation, and custom provider integrations. AI output remains derived context, not authority over business records, and workflows are designed so failures can be found, retried, and corrected.",
        featured: false,
      }),
      Object.freeze({
        id: "ecommerce",
        title: "E-Commerce & Payments",
        description:
          "Custom storefronts, catalogs, checkout, payments, enterprise data, and fulfillment workflows delivered as one operating system.",
        detailed:
          "My commerce work spans customer and product data, advanced catalog behavior, carts and checkout, Stripe and JPMorgan payment paths, Microsoft Dynamics NAV integration, shipping workflows, environment separation, and production support. The live storefront below demonstrates the customer-facing result without exposing private source or operational detail.",
        featured: false,
        liveLink: LIVE_STOREFRONT,
      }),
    ]),
  }),
  contact: Object.freeze({
    sectionLabel: "Contact Popular Consulting",
    heading: "Tell me what needs to work.",
    intro:
      "Share the business problem, the systems involved, and what a useful outcome looks like. You will get a direct response about feasibility and sensible next steps.",
    formLabel: "Project inquiry form",
    nameLabel: "Name",
    emailLabel: "Email",
    messageLabel: "What are you trying to build or improve?",
    buttonLabel: "Send project inquiry",
  }),
});

const ENGINEERING_COPY = Object.freeze({
  navigation: Object.freeze({
    brandLabel: "Shaedan Hawse",
    brandAriaLabel: "Shaedan Hawse - return to engineering home",
    links: Object.freeze([
      Object.freeze({ label: "Approach", section: 1 }),
      Object.freeze({ label: "Capabilities", section: 2 }),
      Object.freeze({ label: "Work", href: "/work" }),
      Object.freeze({ label: "Consulting", href: "/" }),
      Object.freeze({ label: "Contact", section: 3 }),
    ]),
  }),
  hero: Object.freeze({
    name: "Shaedan Hawse",
    headline:
      "Engineering Lead | Full Stack Software Engineer | AI & Commerce Systems",
    summary:
      "I lead and ship production software across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and delivery systems. The work stays hands-on, evidence-led, and accountable through production.",
    location: "Kelowna, BC, Canada",
    primaryAction: "Review engineering work",
    approachAction: "Engineering approach",
    contactAction: "Discuss a role",
    githubAction: "GitHub",
  }),
  bio: Object.freeze({
    sectionLabel: "Engineering approach",
    label: "Engineering approach",
    title: "Hands-on engineering leadership.",
    subtitle:
      "I make constraints explicit, stay close to the code, and own the path from architecture to production.",
    paragraph:
      "My work spans product architecture, full-stack implementation, secure integrations, testing, CI/CD, deployment, observability, and production support. I lead by reducing ambiguity and encoding the behaviours a system must preserve when conditions are imperfect.",
    readMoreLabel: "Review engineering approach",
    photoAlt: "Portrait of Shaedan Hawse",
    sections: Object.freeze([
      Object.freeze({
        heading: "Operating model",
        body:
          "I lead through written decisions, explicit invariants, direct technical contribution, and clear ownership. Architecture is useful only when it helps a team deliver, operate, and change the system safely.",
      }),
      Object.freeze({
        heading: "Systems experience",
        body:
          "The work includes multi-tenant SaaS, AI provider boundaries, commerce and payment systems, ERP and third-party integrations, accessible front ends, APIs, data models, background jobs, and deployment infrastructure.",
      }),
      Object.freeze({
        heading: "Production discipline",
        body:
          "I treat tests, environment separation, observability, failure visibility, runbooks, smoke checks, and rollback as part of the feature. AI output remains derived context rather than source-of-truth data.",
      }),
      Object.freeze({
        heading: "Collaboration",
        body:
          "I translate ambiguous requirements into concrete constraints, explain tradeoffs in business terms, surface risk early, and leave systems documented enough for other engineers to extend and operate.",
      }),
    ]),
  }),
  services: Object.freeze({
    sectionLabel: "Engineering capabilities",
    label: "Engineering capabilities",
    title: "Systems I Build & Own.",
    subtitle:
      "Architecture, implementation, integration, and operations across product, platform, and customer-facing software.",
    cta: "Discuss a role or technical problem",
    cards: Object.freeze([
      Object.freeze({
        id: "training",
        title: "Production AI Systems",
        description:
          "Provider-aware AI workflows with source-backed context, deterministic test paths, review boundaries, and observable failures.",
        detailed:
          "I build AI features behind explicit provider interfaces so local tests remain deterministic and production providers can change without rewriting business logic. Inputs, prompts, models, outputs, and source records remain traceable, while AI output is prevented from silently replacing authoritative customer or lifecycle data.",
        featured: true,
      }),
      Object.freeze({
        id: "software",
        title: "Full-Stack Product Engineering",
        description:
          "Customer-facing products and internal systems carried from interface and API design through data, testing, deployment, and support.",
        detailed:
          "Current work spans React, Next.js, TypeScript, Blazor, .NET, Python, FastAPI, PostgreSQL, background jobs, authentication, object storage, and responsive interface systems. I choose boundaries that make behaviour testable, delivery repeatable, and handoff practical.",
        featured: false,
      }),
      Object.freeze({
        id: "integration",
        title: "Enterprise Integration & Automation",
        description:
          "Reliable boundaries between product software, enterprise data, payment providers, CRM-style systems, and asynchronous workflows.",
        detailed:
          "Integration work includes Microsoft Dynamics NAV, Stripe, JPMorgan, provider adapters, webhooks, scheduled jobs, retries, audit trails, and operational reporting. The design focus is idempotency, unambiguous ownership, visible failure states, and safe recovery.",
        featured: false,
      }),
      Object.freeze({
        id: "ecommerce",
        title: "Commerce & Payment Systems",
        description:
          "Catalog, customer, order, checkout, payment, market, shipping, and release workflows operated as one production system.",
        detailed:
          "I work across the complete commerce path: enterprise product and customer data, responsive storefronts, carts, checkout, multiple payment providers, fulfillment integrations, caching, environment-specific delivery, and production troubleshooting. The live storefront below shows the public customer experience.",
        featured: false,
        liveLink: LIVE_STOREFRONT,
      }),
    ]),
  }),
  contact: Object.freeze({
    sectionLabel: "Engineering contact",
    heading: "Let's talk engineering.",
    intro:
      "Share the role, team context, or system problem. I am interested in hands-on leadership and full-stack work where production judgment matters.",
    formLabel: "Engineering conversation form",
    nameLabel: "Name",
    emailLabel: "Email",
    messageLabel: "What role, team, or technical problem should we discuss?",
    buttonLabel: "Start the conversation",
  }),
});

export const SITE_COPY = Object.freeze({
  [SITE_AUDIENCES.BUSINESS]: BUSINESS_COPY,
  [SITE_AUDIENCES.ENGINEERING]: ENGINEERING_COPY,
});

export const getSiteCopy = (audience = SITE_AUDIENCES.BUSINESS) =>
  SITE_COPY[audience] || SITE_COPY[SITE_AUDIENCES.BUSINESS];

export const PUBLIC_LINKS = Object.freeze({
  liveStorefront: LIVE_STOREFRONT,
  engineering: "/engineering",
  work: "/work",
  consulting: "/",
  github: "https://github.com/mstrbstrd",
  email: "mailto:shae@popcon.dev",
});
