import React from "react";
import logo from "../assets/icons/popcon_png.png";
import brandLogo from "../assets/icons/logo2026_128.png";
import SpectralBloom from "./SpectralBloom";
import useWorkPolish from "./useWorkPolish";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { PUBLIC_LINKS } from "../content/siteCopy";
import routeMetadata from "../content/routeMetadata.json";
import "./WorkPage.css";

const PROJECTS = [
  {
    number: "01",
    category: "Enterprise commerce",
    title: "Industrial E-Commerce Platform",
    summary:
      "A live, layered .NET and Blazor commerce system connecting catalog, customer, order, payment, and operational workflows to Microsoft Dynamics NAV.",
    ownership:
      "Architecture, full-stack implementation, enterprise integrations, delivery automation, and production support.",
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
    visual: {
      label: "Commerce operating system",
      core: "Commerce",
      nodes: ["Storefront", "API", "Business", "NAV"],
    },
  },
  {
    number: "02",
    category: "AI operations and SaaS",
    title: "CreatorOS",
    summary:
      "A multi-tenant operations platform for coaching businesses, combining subscription lifecycle automation, CRM-style records, AI context, auditability, and executive reporting.",
    ownership:
      "Product architecture, full-stack implementation, provider boundaries, production invariants, deployment, and operational verification.",
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
    visual: {
      label: "Multi-tenant operations",
      core: "CreatorOS",
      nodes: ["Web", "API", "Workers", "Data"],
    },
  },
  {
    number: "03",
    category: "Product engineering",
    title: "Spectrafy",
    summary:
      "A public, rights-cleared music streaming product with account workflows, profiles, playlists, private media storage, and a complete browser playback experience.",
    ownership:
      "Product design, front-end implementation, API and data architecture, authentication, storage boundaries, testing, and deployment.",
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
    visual: {
      label: "Secure media product",
      core: "Spectrafy",
      nodes: ["Client", "API", "Storage", "Auth"],
    },
  },
  {
    number: "04",
    category: "Front-end systems",
    title: "Popular Consulting",
    summary:
      "An interactive React business and engineering platform built around custom WebGL and GLSL effects, full-screen transitions, progressive enhancement, and evidence-led professional routes.",
    ownership:
      "Creative direction, interaction engineering, accessibility, performance instrumentation, graceful degradation, testing, and deployment.",
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
    visual: {
      label: "Interaction platform",
      core: "PopCon",
      nodes: ["React", "WebGL", "A11y", "Vitals"],
    },
  },
];

const CAPABILITIES = [
  {
    number: "01",
    label: "Commerce systems",
    signal: "Catalog to operations",
    text: "Catalog, checkout, payments, enterprise data, customer workflows, shipping, and production operations.",
  },
  {
    number: "02",
    label: "AI and SaaS",
    signal: "Context to automation",
    text: "Multi-tenancy, provider boundaries, source-backed context, automation, reporting, and failure visibility.",
  },
  {
    number: "03",
    label: "Delivery ownership",
    signal: "Architecture to support",
    text: "Architecture, implementation, security, testing, CI/CD, deployment, observability, runbooks, and support.",
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

const HERO_PROOF = [
  "Architecture to production",
  "AI, commerce, full stack",
  "Accessible and operable",
];

const isExternalHref = (href) => /^https?:\/\//.test(href);

const NAV_LINKS = [
  { label: "Projects", href: "#selected-projects" },
  { label: "Principles", href: "#engineering-principles" },
  { label: "Contact", href: "mailto:shae@popcon.dev" },
  { label: "Engineering", href: "/engineering" },
  { label: "Consulting", href: "/" },
];

const WorkPageContent = () => {
  const { isDark, toggleTheme } = useThemeMode();
  const rootRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const menuButtonRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  useWorkPolish(rootRef);

  React.useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    const previous = {
      title: document.title,
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlFontSize: document.documentElement.style.fontSize,
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
    /* index.css shrinks the root to 55-58% on small screens for the
       immersive routes; this page's rem scale assumes the 10px root. */
    document.documentElement.style.fontSize = "62.5%";
    /* body must NOT become a scroll container (overflow other than
       visible would defeat the sticky header); html scrolls. */
    document.body.style.overflow = "visible";
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
      document.documentElement.style.fontSize = previous.htmlFontSize;
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
    <div className="work-page" ref={rootRef}>
      <div className="work-page__ambient" aria-hidden="true">
        <SpectralBloom />
        <span className="work-page__aurora work-page__aurora--one" />
        <span className="work-page__aurora work-page__aurora--two" />
        <span className="work-page__aurora work-page__aurora--three" />
        <span className="work-page__grid" />
        <span className="work-page__grain" />
      </div>

      <a className="work-page__skip" href="#selected-projects">
        Skip to selected projects
      </a>

      <header className="work-page__header">
        <div className="work-page__header-shell">
          <a
            className="work-page__brand"
            href="/"
            aria-label="Popular Consulting immersive home"
          >
            <span className="work-page__brand-mark">
              <img src={brandLogo} alt="" aria-hidden="true" />
            </span>
            <span className="work-page__brand-copy">
              <strong>Popular Consulting</strong>
              <small>Selected engineering work</small>
            </span>
          </a>

          <nav className="work-page__nav" aria-label="Work page navigation">
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
            <button
              type="button"
              ref={menuButtonRef}
              className="work-page__menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="work-nav-menu"
              aria-label={
                menuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="work-page__menu-icon" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
            <button
              type="button"
              className="work-page__theme"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light theme" : "Use dark theme"}
            >
              <span className="work-page__theme-icon" aria-hidden="true">
                {isDark ? (
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
                    <path
                      d="M12 2.5v2M12 19.5v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.5 12h2M19.5 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20.5 14.2A8 8 0 0 1 9.8 3.5a8.4 8.4 0 1 0 10.7 10.7Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span>{isDark ? "Light" : "Dark"}</span>
            </button>
          </nav>
        </div>

        {menuOpen && (
          <div
            id="work-nav-menu"
            className="work-page__menu"
            ref={menuRef}
            role="menu"
            aria-label="Site navigation"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </header>

      <main className="work-page__main">
        <section className="work-page__hero" aria-labelledby="work-page-title">
          <div className="work-page__hero-panel">
            <div className="work-page__hero-copy" data-depth="0.06">
              <p className="work-page__eyebrow">
                <span aria-hidden="true" />
                Shaedan Hawse | Engineering work through Popular Consulting
              </p>

              <h1 id="work-page-title">
                Systems built for <span>real operations.</span>
              </h1>

              <p className="work-page__lede">
                Hands-on Engineering Lead and Full Stack Software Engineer working
                across AI operations, commerce, payments, enterprise integrations,
                accessible interfaces, and complete delivery systems.
              </p>

              <ul
                className="work-page__hero-proof"
                aria-label="Engineering scope highlights"
              >
                {HERO_PROOF.map((item) => (
                  <li key={item}>
                    <span aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="work-page__hero-actions">
                <a
                  className="work-page__button work-page__button--primary"
                  href="#selected-projects"
                >
                  Review selected work
                  <span aria-hidden="true">↓</span>
                </a>
                <a className="work-page__button" href="mailto:shae@popcon.dev">
                  Discuss a role or project
                </a>
                <a
                  className="work-page__text-link"
                  href="https://github.com/mstrbstrd"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            <aside
              className="work-page__system-card"
              aria-label="Professional profile"
              data-depth="-0.08"
            >
              <div className="work-page__system-visual" aria-hidden="true">
                <span className="work-page__system-orbit work-page__system-orbit--outer" />
                <span className="work-page__system-orbit work-page__system-orbit--inner" />
                <span className="work-page__system-beam work-page__system-beam--one" />
                <span className="work-page__system-beam work-page__system-beam--two" />

                <span className="work-page__system-label work-page__system-label--one">
                  Full stack
                </span>
                <span className="work-page__system-label work-page__system-label--two">
                  AI systems
                </span>
                <span className="work-page__system-label work-page__system-label--three">
                  Commerce
                </span>
                <span className="work-page__system-label work-page__system-label--four">
                  Delivery
                </span>

                <span className="work-page__system-mark">
                  <img src={logo} alt="" />
                </span>
              </div>

              <div className="work-page__identity">
                <div>
                  <span>Positioning</span>
                  <strong>Engineering Lead</strong>
                </div>
                <div>
                  <span>Specialization</span>
                  <strong>Full Stack, AI, Commerce</strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>Kelowna, BC, Canada</strong>
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
            <article
              key={capability.label}
              className="work-capability"
              data-reveal="true"
            >
              <div className="work-capability__topline">
                <span>{capability.number}</span>
                <div className="work-capability__glyph" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <p className="work-capability__signal">{capability.signal}</p>
              <h2>{capability.label}</h2>
              <p>{capability.text}</p>
            </article>
          ))}
        </section>

        <section
          id="selected-projects"
          className="work-page__projects"
          aria-labelledby="selected-projects-title"
        >
          <div className="work-page__section-heading" data-depth="0.09">
            <p>Selected systems</p>
            <h2 id="selected-projects-title">Evidence over adjectives.</h2>
            <span>
              Each project is described only at the level supported by public-safe
              implementation evidence.
            </span>
          </div>

          <div className="work-page__project-list">
            {PROJECTS.map((project) => (
              <article
                className="work-project"
                key={project.title}
                data-reveal="true"
              >
                <figure className="work-project__visual" aria-hidden="true">
                  <div className="work-project__visual-topline">
                    <span>{project.number}</span>
                    <span>{project.visual.label}</span>
                  </div>

                  <div className="work-project__system-map" data-depth="0.07">
                    <span className="work-project__map-ring work-project__map-ring--one" />
                    <span className="work-project__map-ring work-project__map-ring--two" />
                    <span className="work-project__map-line work-project__map-line--one" />
                    <span className="work-project__map-line work-project__map-line--two" />
                    <span className="work-project__map-core">
                      {project.visual.core}
                    </span>
                    {project.visual.nodes.map((node, index) => (
                      <span
                        className={`work-project__map-node work-project__map-node--${
                          index + 1
                        }`}
                        key={node}
                      >
                        {node}
                      </span>
                    ))}
                  </div>

                  <div className="work-project__visual-footer">
                    {project.visual.nodes.map((node) => (
                      <span key={node}>{node}</span>
                    ))}
                  </div>
                </figure>

                <div className="work-project__content">
                  <div className="work-project__topline">
                    <p>{project.category}</p>
                    <span>{project.status}</span>
                  </div>

                  <div className="work-project__narrative">
                    <h3>{project.title}</h3>
                    <p className="work-project__summary">{project.summary}</p>

                    <div className="work-project__ownership">
                      <span>Ownership</span>
                      <p>{project.ownership}</p>
                    </div>
                  </div>

                  <aside className="work-project__evidence-panel">
                    <span className="work-project__evidence-title">
                      Implementation evidence
                    </span>
                    <ul
                      className="work-project__evidence"
                      aria-label={`${project.title} evidence`}
                    >
                      {project.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </aside>

                  <div className="work-project__footer">
                    <ul
                      className="work-project__stack"
                      aria-label={`${project.title} technologies`}
                    >
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
                              <span aria-hidden="true">
                                {external ? "↗" : "→"}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
          <div className="work-page__section-heading" data-depth="0.09">
            <p>Engineering leadership</p>
            <h2 id="engineering-principles-title">How I reduce uncertainty.</h2>
            <span>
              Leadership is expressed through constraints, decisions, delivery
              practices, and operational ownership.
            </span>
          </div>

          <div className="work-page__principle-grid">
            {PRINCIPLES.map((principle, index) => (
              <article key={principle.title} data-reveal="true">
                <div className="work-principle__topline">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className="work-principle__signal" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <h3>{principle.title}</h3>
                <p>{principle.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="work-page__contact"
          aria-labelledby="work-contact-title"
          data-reveal="true"
        >
          <div
            className="work-page__contact-mark"
            aria-hidden="true"
            data-depth="-0.06"
          >
            <span>
              <img src={logo} alt="" />
            </span>
          </div>

          <div className="work-page__contact-copy">
            <p>Engineering roles, product partnerships, and consulting engagements</p>
            <h2 id="work-contact-title">
              Let us talk about the system, team, or business problem.
            </h2>
          </div>

          <div className="work-page__contact-actions">
            <a
              className="work-page__button work-page__button--primary"
              href="mailto:shae@popcon.dev"
            >
              shae@popcon.dev
            </a>
            <a className="work-page__button" href="/engineering">
              Engineering home
            </a>
            <a className="work-page__button" href="/">
              Consulting home
            </a>
          </div>
        </section>
      </main>

      <footer className="work-page__footer">
        <span>Shaedan Hawse</span>
        <span>
          Engineering Lead | Full Stack Software Engineer | AI &amp; Commerce
          Systems
        </span>
        <span>Popular Consulting © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};

const WorkPage = () => (
  <ThemeProvider>
    <WorkPageContent />
  </ThemeProvider>
);

export default WorkPage;
