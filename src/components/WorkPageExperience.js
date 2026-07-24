import React from "react";
import logo from "../assets/icons/popcon_png.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { PUBLIC_LINKS } from "../content/siteCopy";
import routeMetadata from "../content/routeMetadata.json";
import "./WorkPageExperience.css";

const PROJECTS = [
  {
    number: "01",
    accent: "violet",
    category: "Enterprise commerce",
    title: "Industrial E-Commerce Platform",
    summary:
      "A live, layered .NET and Blazor commerce system connecting catalog, customer, order, payment, and operational workflows to Microsoft Dynamics NAV.",
    ownership:
      "Architecture, full-stack implementation, enterprise integrations, delivery automation, and production support.",
    scope: ["Commerce platform", "Enterprise integration", "Production operations"],
    technologies: [
      ".NET",
      "Blazor",
      "REST APIs",
      "Dynamics NAV",
      "Stripe",
      "JPMorgan",
      "GitHub Actions",
      "IIS",
    ],
    evidence: [
      "Separate API, client, business, data-access, model, shared, and test projects",
      "Stripe and JPMorgan payment paths across client, controller, service, model, and notification boundaries",
      "Sandbox and production delivery automation with secret-backed configuration and deployment verification",
      "Current production support across checkout, caching, shipping-provider behavior, and release integrity",
    ],
    status: "Live client platform",
    links: [PUBLIC_LINKS.liveStorefront],
  },
  {
    number: "02",
    accent: "cyan",
    category: "AI operations and SaaS",
    title: "CreatorOS",
    summary:
      "A multi-tenant operations platform for coaching businesses, combining subscription lifecycle automation, CRM-style records, AI context, auditability, and executive reporting.",
    ownership:
      "Product architecture, full-stack implementation, provider boundaries, production invariants, deployment, and operational verification.",
    scope: ["Multi-tenant SaaS", "AI provider boundary", "Lifecycle automation"],
    technologies: [
      "Next.js",
      "TypeScript",
      "FastAPI",
      "PostgreSQL",
      "Celery",
      "Redis",
      "Stripe",
      "OpenAI",
      "Anthropic",
      "Docker",
    ],
    evidence: [
      "Verified and idempotent Stripe webhook ingestion with duplicate prevention",
      "Multi-tenant organizations, role-scoped access, audit logs, retries, and visible automation failures",
      "Source-backed AI classification and summaries behind configurable provider adapters",
      "Docker, migrations, tests, CI, runbooks, and public and authenticated smoke checks",
    ],
    status: "Live demo",
    links: [
      {
        label: "Open CreatorOS",
        href: "https://creatoros-production-6fb1.up.railway.app/",
      },
    ],
  },
  {
    number: "03",
    accent: "magenta",
    category: "Product engineering",
    title: "Spectrafy",
    summary:
      "A public, rights-cleared music streaming product with account workflows, profiles, playlists, private media storage, and a complete browser playback experience.",
    ownership:
      "Product design, front-end implementation, API and data architecture, authentication, storage boundaries, testing, and deployment.",
    scope: ["Product engineering", "Secure media", "Full-stack delivery"],
    technologies: [
      "React 19",
      "TypeScript",
      "Vite",
      "FastAPI",
      "PostgreSQL",
      "Alembic",
      "Object storage",
      "Playwright",
      "Vitest",
      "Railway",
    ],
    evidence: [
      "Opaque server-side sessions and Argon2 password storage",
      "Private S3-compatible storage with presigned uploads and time-limited media access",
      "Same-origin API proxying, production-safe configuration checks, and database migrations",
      "Unit, component, end-to-end, type, lint, and build verification",
    ],
    status: "Live product",
    links: [
      {
        label: "Open Spectrafy",
        href: "https://web-production-4b0eca.up.railway.app/",
      },
    ],
  },
  {
    number: "04",
    accent: "gold",
    category: "Front-end systems",
    title: "Popular Consulting",
    summary:
      "An interactive React business and engineering platform built around custom WebGL and GLSL effects, full-screen transitions, progressive enhancement, and evidence-led professional routes.",
    ownership:
      "Creative direction, interaction engineering, accessibility, performance instrumentation, graceful degradation, testing, and deployment.",
    scope: ["Interaction systems", "Accessibility", "Performance"],
    technologies: [
      "React",
      "WebGL",
      "GLSL",
      "Material UI",
      "Framer Motion",
      "Jest",
      "jest-axe",
      "Web Vitals",
      "Vercel",
    ],
    evidence: [
      "Hardware WebGL detection with complete CSS fallback behavior",
      "Accessibility regression coverage for landmarks, keyboard, focus, ARIA, touch, contrast, and responsive behavior",
      "Core Web Vitals, section timing, and long-task telemetry",
      "Browser compositing diagnosis across transforms, clipping, rounded corners, and backdrop filters",
    ],
    status: "This platform",
    links: [
      { label: "Open immersive home", href: "/" },
      {
        label: "View public source",
        href: "https://github.com/mstrbstrd/popular-consulting",
      },
    ],
  },
];

const CAPABILITIES = [
  {
    number: "01",
    label: "Commerce systems",
    text: "Catalog, checkout, payments, enterprise data, customer workflows, shipping, and production operations.",
    detail: "Customer experience connected to the systems that run the business.",
  },
  {
    number: "02",
    label: "AI and SaaS",
    text: "Multi-tenancy, provider boundaries, source-backed context, automation, reporting, and failure visibility.",
    detail: "AI treated as derived context, never silent authority over business records.",
  },
  {
    number: "03",
    label: "Delivery ownership",
    text: "Architecture, implementation, security, testing, CI/CD, deployment, observability, runbooks, and support.",
    detail: "Features carried through verification, operation, and rollback.",
  },
];

const PRINCIPLES = [
  {
    title: "Define what must never happen",
    text: "Make unsafe states explicit before implementation, then encode those boundaries in validation, tests, configuration checks, and operational controls.",
  },
  {
    title: "Protect the source of truth",
    text: "Treat AI output as derived context, keep tenant and lifecycle boundaries unambiguous, and make sensitive state changes auditable.",
  },
  {
    title: "Make failure visible and recoverable",
    text: "Record failures, preserve evidence, design retries deliberately, and avoid workflows that appear successful while silently dropping work.",
  },
  {
    title: "Own the complete delivery path",
    text: "A feature is not finished at the pull request. It needs tests, deployment, verification, observability, documentation, and a rollback path.",
  },
];

const isExternalHref = (href) => /^https?:\/\//.test(href);
const contactEmail = PUBLIC_LINKS.email.replace(/^mailto:/, "");

const ArrowIcon = ({ external = false }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
    {external ? (
      <path d="M5 3h8v8M13 3 3 13" />
    ) : (
      <path d="M3 8h10M9 4l4 4-4 4" />
    )}
  </svg>
);

const ThemeIcon = ({ isDark }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    {isDark ? (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41" />
      </>
    ) : (
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
    )}
  </svg>
);

const SectionLabel = ({ children }) => (
  <div className="work-page__section-label">
    <span aria-hidden="true" />
    <p>{children}</p>
  </div>
);

const WorkPageContent = () => {
  const { isDark, toggleTheme } = useThemeMode();

  React.useEffect(() => {
    const previous = {
      title: document.title,
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
    };

    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');

    const metadataSnapshot = {
      description: description?.getAttribute("content"),
      canonical: canonical?.getAttribute("href"),
      ogTitle: ogTitle?.getAttribute("content"),
      ogDescription: ogDescription?.getAttribute("content"),
      ogUrl: ogUrl?.getAttribute("content"),
    };

    const metadata = routeMetadata.work;

    document.title = metadata.title;
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    description?.setAttribute("content", metadata.description);
    canonical?.setAttribute("href", metadata.canonical);
    ogTitle?.setAttribute("content", metadata.socialTitle);
    ogDescription?.setAttribute("content", metadata.socialDescription);
    ogUrl?.setAttribute("content", metadata.canonical);

    return () => {
      document.title = previous.title;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.height = previous.htmlHeight;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.height = previous.bodyHeight;

      if (metadataSnapshot.description !== null && metadataSnapshot.description !== undefined) {
        description?.setAttribute("content", metadataSnapshot.description);
      }
      if (metadataSnapshot.canonical !== null && metadataSnapshot.canonical !== undefined) {
        canonical?.setAttribute("href", metadataSnapshot.canonical);
      }
      if (metadataSnapshot.ogTitle !== null && metadataSnapshot.ogTitle !== undefined) {
        ogTitle?.setAttribute("content", metadataSnapshot.ogTitle);
      }
      if (metadataSnapshot.ogDescription !== null && metadataSnapshot.ogDescription !== undefined) {
        ogDescription?.setAttribute("content", metadataSnapshot.ogDescription);
      }
      if (metadataSnapshot.ogUrl !== null && metadataSnapshot.ogUrl !== undefined) {
        ogUrl?.setAttribute("content", metadataSnapshot.ogUrl);
      }
    };
  }, []);

  return (
    <div className={`work-page work-page--${isDark ? "dark" : "light"}`}>
      <div className="work-page__ambient" aria-hidden="true">
        <span className="work-page__orb work-page__orb--one" />
        <span className="work-page__orb work-page__orb--two" />
        <span className="work-page__orb work-page__orb--three" />
        <span className="work-page__grid" />
        <span className="work-page__grain" />
      </div>

      <a className="work-page__skip" href="#selected-projects">
        Skip to selected projects
      </a>

      <header className="work-page__header">
        <div className="work-page__nav-shell">
          <a className="work-page__brand" href="/" aria-label="Popular Consulting immersive home">
            <span className="work-page__brand-mark">
              <img src={logo} alt="" aria-hidden="true" />
            </span>
            <span className="work-page__brand-copy">
              <strong>Popular Consulting</strong>
              <small>Selected engineering work</small>
            </span>
          </a>

          <nav className="work-page__nav" aria-label="Work page navigation">
            <a href="#selected-projects">Projects</a>
            <a href="#engineering-principles">Principles</a>
            <a href="/engineering">Engineering</a>
            <a href="/">Consulting</a>
            <a href={PUBLIC_LINKS.email}>Contact</a>
          </nav>

          <button
            type="button"
            className="work-page__theme"
            onClick={toggleTheme}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            <ThemeIcon isDark={isDark} />
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>

      <main className="work-page__main">
        <section className="work-page__hero" aria-labelledby="work-page-title">
          <div className="work-page__hero-panel">
            <div className="work-page__hero-copy">
              <SectionLabel>Shaedan Hawse | Engineering work through Popular Consulting</SectionLabel>
              <h1 id="work-page-title">
                Systems built for <span>real operations.</span>
              </h1>
              <p className="work-page__lede">
                Hands-on Engineering Lead and Full Stack Software Engineer working across AI operations,
                commerce, payments, enterprise integrations, accessible interfaces, and complete delivery systems.
              </p>

              <div className="work-page__hero-actions">
                <a className="work-page__button work-page__button--primary" href="#selected-projects">
                  Review selected work
                  <ArrowIcon />
                </a>
                <a className="work-page__button" href={PUBLIC_LINKS.email}>
                  Discuss a role or project
                  <ArrowIcon />
                </a>
                <a
                  className="work-page__text-link"
                  href={PUBLIC_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                  <ArrowIcon external />
                </a>
              </div>

              <div className="work-page__delivery-path" aria-label="Delivery ownership">
                {["Architecture", "Implementation", "Production"].map((stage, index) => (
                  <React.Fragment key={stage}>
                    <span>{stage}</span>
                    {index < 2 && <i aria-hidden="true" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <aside className="work-page__identity" aria-label="Professional profile">
              <div className="work-page__identity-top">
                <div className="work-page__identity-mark" aria-hidden="true">
                  <span />
                  <img src={logo} alt="" />
                </div>
                <div>
                  <p>Engineering profile</p>
                  <h2>Shaedan Hawse</h2>
                  <span>Kelowna, BC, Canada</span>
                </div>
              </div>

              <div className="work-page__identity-grid">
                <div>
                  <span>Positioning</span>
                  <strong>Engineering Lead</strong>
                </div>
                <div>
                  <span>Specialization</span>
                  <strong>Full Stack, AI, Commerce</strong>
                </div>
                <div>
                  <span>Operating model</span>
                  <strong>Hands-on through production</strong>
                </div>
                <div>
                  <span>Current platform</span>
                  <strong>Popular Consulting</strong>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="work-page__capabilities" aria-label="Engineering scope">
          {CAPABILITIES.map((capability) => (
            <article key={capability.label}>
              <div className="work-page__capability-index">
                <span>{capability.number}</span>
                <i aria-hidden="true" />
              </div>
              <h2>{capability.label}</h2>
              <p>{capability.text}</p>
              <small>{capability.detail}</small>
            </article>
          ))}
        </section>

        <section
          id="selected-projects"
          className="work-page__projects"
          aria-labelledby="selected-projects-title"
        >
          <div className="work-page__section-heading">
            <div>
              <SectionLabel>Selected systems</SectionLabel>
              <h2 id="selected-projects-title">Evidence over adjectives.</h2>
            </div>
            <p>
              Each system is described at the level supported by public-safe implementation evidence.
              The emphasis is ownership, constraints, and delivery rather than unsupported outcomes.
            </p>
          </div>

          <div className="work-page__project-list">
            {PROJECTS.map((project) => (
              <article
                className={`work-project work-project--${project.accent}`}
                key={project.title}
              >
                <div className="work-project__glow" aria-hidden="true" />
                <header className="work-project__header">
                  <div className="work-project__number" aria-hidden="true">
                    {project.number}
                  </div>
                  <div className="work-project__topline">
                    <p>{project.category}</p>
                    <span>
                      <i aria-hidden="true" />
                      {project.status}
                    </span>
                  </div>
                </header>

                <div className="work-project__body">
                  <div className="work-project__story">
                    <h3>{project.title}</h3>
                    <p className="work-project__summary">{project.summary}</p>

                    <ul className="work-project__scope" aria-label={`${project.title} scope`}>
                      {project.scope.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>

                    <div className="work-project__ownership">
                      <span>Ownership</span>
                      <p>{project.ownership}</p>
                    </div>

                    <ul className="work-project__stack" aria-label={`${project.title} technologies`}>
                      {project.technologies.map((technology) => (
                        <li key={technology}>{technology}</li>
                      ))}
                    </ul>

                    {project.links.length > 0 && (
                      <div className="work-project__links">
                        {project.links.map((link) => {
                          const external = isExternalHref(link.href);
                          return (
                            <a
                              key={link.label}
                              href={link.href}
                              target={external ? "_blank" : undefined}
                              rel={external ? "noopener noreferrer" : undefined}
                            >
                              {link.label}
                              <ArrowIcon external={external} />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <aside className="work-project__evidence-panel">
                    <div className="work-project__evidence-heading">
                      <span aria-hidden="true" />
                      <p>Implementation evidence</p>
                    </div>
                    <ul className="work-project__evidence" aria-label={`${project.title} evidence`}>
                      {project.evidence.map((item, index) => (
                        <li key={item}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <p>{item}</p>
                        </li>
                      ))}
                    </ul>
                  </aside>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          id="engineering-principles"
          className="work-page__principles"
          aria-labelledby="engineering-principles-title"
        >
          <div className="work-page__section-heading">
            <div>
              <SectionLabel>Engineering leadership</SectionLabel>
              <h2 id="engineering-principles-title">How I reduce uncertainty.</h2>
            </div>
            <p>
              Leadership is expressed through constraints, decisions, delivery practices, and operational ownership.
            </p>
          </div>

          <div className="work-page__principle-grid">
            {PRINCIPLES.map((principle, index) => (
              <article key={principle.title}>
                <div className="work-page__principle-number">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i aria-hidden="true" />
                </div>
                <h3>{principle.title}</h3>
                <p>{principle.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="work-page__contact" aria-labelledby="work-contact-title">
          <div className="work-page__contact-orbit" aria-hidden="true">
            <span />
            <span />
            <img src={logo} alt="" />
          </div>
          <div className="work-page__contact-copy">
            <SectionLabel>Engineering roles, product partnerships, and consulting engagements</SectionLabel>
            <h2 id="work-contact-title">Let us talk about the system, team, or business problem.</h2>
            <p>
              Share the context, constraints, and what needs to become reliably true. I will respond directly about fit and sensible next steps.
            </p>
            <div>
              <a className="work-page__button work-page__button--primary" href={PUBLIC_LINKS.email}>
                {contactEmail}
                <ArrowIcon />
              </a>
              <a className="work-page__button" href="/engineering">
                Engineering home
                <ArrowIcon />
              </a>
              <a className="work-page__text-link" href="/">
                Consulting home
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="work-page__footer">
        <a href="/" className="work-page__footer-brand">
          <img src={logo} alt="" aria-hidden="true" />
          <span>Popular Consulting</span>
        </a>
        <span>Shaedan Hawse | Engineering Lead | Full Stack, AI &amp; Commerce Systems</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};

const WorkPageExperience = () => (
  <ThemeProvider>
    <WorkPageContent />
  </ThemeProvider>
);

export default WorkPageExperience;
