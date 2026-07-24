import React from "react";
import logo from "../assets/icons/popcon_png.png";
import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";

const PROJECTS = [
  {
    number: "01",
    category: "Enterprise commerce",
    title: "Industrial E-Commerce Platform",
    summary:
      "A layered .NET and Blazor commerce system connecting catalog, customer, order, payment, and operational workflows to Microsoft Dynamics NAV.",
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
    status: "Private client system",
    links: [],
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
  },
  {
    number: "04",
    category: "Front-end systems",
    title: "Popular Consulting",
    summary:
      "An interactive React business platform built around custom WebGL and GLSL effects, full-screen transitions, progressive enhancement, and a growing recruiter-facing portfolio layer.",
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
  },
];

const CAPABILITIES = [
  {
    label: "Commerce systems",
    text: "Catalog, checkout, payments, enterprise data, customer workflows, shipping, and production operations.",
  },
  {
    label: "AI and SaaS",
    text: "Multi-tenancy, provider boundaries, source-backed context, automation, reporting, and failure visibility.",
  },
  {
    label: "Delivery ownership",
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

const isExternalHref = (href) => /^https?:\/\//.test(href);

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

    const workDescription =
      "Selected engineering work by Shaedan Hawse across enterprise commerce, AI operations, product engineering, accessible interfaces, and production delivery.";

    document.title = "Selected Engineering Work | Shaedan Hawse";
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    description?.setAttribute("content", workDescription);
    canonical?.setAttribute("href", "https://popcon.dev/work");
    ogTitle?.setAttribute("content", "Selected Engineering Work | Shaedan Hawse");
    ogDescription?.setAttribute("content", workDescription);
    ogUrl?.setAttribute("content", "https://popcon.dev/work");

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

  const pageVariables = {
    "--work-bg": isDark ? "#080812" : "#f7f7fb",
    "--work-surface": isDark
      ? "rgba(17, 17, 35, 0.82)"
      : "rgba(255, 255, 255, 0.84)",
    "--work-surface-strong": isDark
      ? "rgba(22, 22, 45, 0.95)"
      : "rgba(255, 255, 255, 0.96)",
    "--work-text": isDark ? "#f2f1ff" : "#171522",
    "--work-muted": isDark
      ? "rgba(226, 225, 248, 0.68)"
      : "rgba(32, 29, 46, 0.68)",
    "--work-soft": isDark
      ? "rgba(226, 225, 248, 0.48)"
      : "rgba(32, 29, 46, 0.5)",
    "--work-border": isDark
      ? "rgba(255, 255, 255, 0.11)"
      : "rgba(55, 43, 99, 0.12)",
    "--work-header": isDark
      ? "rgba(8, 8, 18, 0.78)"
      : "rgba(247, 247, 251, 0.8)",
    "--work-shadow": isDark
      ? "0 24px 70px rgba(0, 0, 0, 0.34)"
      : "0 24px 70px rgba(56, 42, 112, 0.1)",
  };

  return (
    <div className="work-page" style={pageVariables}>
      <a className="work-page__skip" href="#selected-projects">
        Skip to selected projects
      </a>

      <header className="work-page__header">
        <div className="work-page__header-inner">
          <a className="work-page__brand" href="/" aria-label="Popular Consulting immersive home">
            <img src={logo} alt="" aria-hidden="true" />
            <span>Popular Consulting</span>
          </a>

          <nav className="work-page__nav" aria-label="Work page navigation">
            <a href="#selected-projects">Projects</a>
            <a href="#engineering-principles">Principles</a>
            <a href="mailto:shaw@popcon.dev">Contact</a>
            <a href="/">Immersive home</a>
            <button
              type="button"
              className="work-page__theme"
              onClick={toggleTheme}
              aria-label={isDark ? "Use light theme" : "Use dark theme"}
            >
              {isDark ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      <main className="work-page__main">
        <section className="work-page__hero" aria-labelledby="work-page-title">
          <div className="work-page__hero-copy">
            <p className="work-page__eyebrow">Shaedan Hawse | Selected engineering work</p>
            <h1 id="work-page-title">Systems built to survive production.</h1>
            <p className="work-page__lede">
              Hands-on Engineering Lead and Full Stack Software Engineer building across AI operations,
              commerce, payments, enterprise integrations, accessible interfaces, and delivery systems.
            </p>

            <div className="work-page__hero-actions">
              <a className="work-page__button work-page__button--primary" href="#selected-projects">
                Review selected work
                <span aria-hidden="true">↓</span>
              </a>
              <a className="work-page__button" href="mailto:shaw@popcon.dev">
                Discuss a role
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

          <aside className="work-page__identity" aria-label="Professional profile">
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
          </aside>
        </section>

        <section className="work-page__capabilities" aria-label="Engineering scope">
          {CAPABILITIES.map((capability) => (
            <article key={capability.label}>
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
          <div className="work-page__section-heading">
            <p>Selected systems</p>
            <h2 id="selected-projects-title">Evidence over adjectives.</h2>
            <span>
              Each project is described only at the level supported by public-safe implementation evidence.
            </span>
          </div>

          <div className="work-page__project-list">
            {PROJECTS.map((project) => (
              <article className="work-project" key={project.title}>
                <div className="work-project__rail">
                  <span>{project.number}</span>
                  <div aria-hidden="true" />
                </div>

                <div className="work-project__content">
                  <div className="work-project__topline">
                    <p>{project.category}</p>
                    <span>{project.status}</span>
                  </div>

                  <h3>{project.title}</h3>
                  <p className="work-project__summary">{project.summary}</p>

                  <div className="work-project__ownership">
                    <span>Ownership</span>
                    <p>{project.ownership}</p>
                  </div>

                  <ul className="work-project__evidence" aria-label={`${project.title} evidence`}>
                    {project.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

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
                            <span aria-hidden="true">{external ? "↗" : "→"}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
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
            <p>Engineering leadership</p>
            <h2 id="engineering-principles-title">How I reduce uncertainty.</h2>
            <span>
              Leadership is expressed through constraints, decisions, delivery practices, and operational ownership.
            </span>
          </div>

          <div className="work-page__principle-grid">
            {PRINCIPLES.map((principle, index) => (
              <article key={principle.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{principle.title}</h3>
                <p>{principle.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="work-page__contact" aria-labelledby="work-contact-title">
          <p>Engineering leadership, full-stack product work, and difficult systems</p>
          <h2 id="work-contact-title">Let us talk about the problem you need solved.</h2>
          <div>
            <a className="work-page__button work-page__button--primary" href="mailto:shaw@popcon.dev">
              shaw@popcon.dev
            </a>
            <a className="work-page__button" href="/">
              Enter the immersive site
            </a>
          </div>
        </section>
      </main>

      <footer className="work-page__footer">
        <span>Shaedan Hawse</span>
        <span>Engineering Lead | Full Stack Software Engineer | AI &amp; Commerce Systems</span>
        <span>Popular Consulting © {new Date().getFullYear()}</span>
      </footer>

      <style>{`
        .work-page {
          min-height: 100vh;
          overflow-x: hidden;
          color: var(--work-text);
          background:
            radial-gradient(circle at 12% 0%, rgba(99, 68, 245, 0.16), transparent 34rem),
            radial-gradient(circle at 92% 18%, rgba(177, 93, 255, 0.12), transparent 30rem),
            var(--work-bg);
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-size: 1.6rem;
          line-height: 1.5;
        }

        .work-page *,
        .work-page *::before,
        .work-page *::after {
          box-sizing: border-box;
        }

        .work-page a {
          color: inherit;
          text-decoration: none !important;
        }

        .work-page button {
          font: inherit;
        }

        .work-page__skip {
          position: fixed;
          top: -8rem;
          left: 50%;
          z-index: 1000;
          transform: translateX(-50%);
          border-radius: 0 0 1rem 1rem;
          padding: 1rem 1.5rem;
          color: #ffffff !important;
          background: #6344f5;
          font-size: 1.4rem;
          font-weight: 750;
          transition: top 160ms ease;
        }

        .work-page__skip:focus {
          top: 0;
          outline: 3px solid #ffffff;
          outline-offset: 2px;
        }

        .work-page__header {
          position: sticky;
          top: 0;
          z-index: 100;
          border-bottom: 1px solid var(--work-border);
          background: var(--work-header);
          backdrop-filter: blur(24px) saturate(150%);
          -webkit-backdrop-filter: blur(24px) saturate(150%);
        }

        .work-page__header-inner {
          width: min(1240px, calc(100% - 4rem));
          min-height: 7.2rem;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
        }

        .work-page__brand {
          display: inline-flex;
          align-items: center;
          gap: 1rem;
          border-radius: 999px;
          color: var(--work-text) !important;
          font-size: 1.5rem;
          font-style: italic;
          font-weight: 620;
          letter-spacing: 0.02em;
        }

        .work-page__brand img {
          width: 3rem;
          height: 3rem;
          object-fit: contain;
        }

        .work-page__nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .work-page__nav a,
        .work-page__theme {
          min-height: 3.8rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 999px;
          padding: 0.8rem 1.1rem;
          color: var(--work-muted) !important;
          background: transparent;
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.025em;
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .work-page__nav a:hover,
        .work-page__theme:hover {
          color: var(--work-text) !important;
          border-color: var(--work-border);
          background: var(--work-surface);
        }

        .work-page__theme {
          border-color: var(--work-border);
        }

        .work-page__main {
          width: min(1240px, calc(100% - 4rem));
          margin: 0 auto;
        }

        .work-page__hero {
          min-height: calc(100vh - 7.2rem);
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(26rem, 0.65fr);
          align-items: center;
          gap: clamp(4rem, 8vw, 10rem);
          padding: clamp(8rem, 12vw, 14rem) 0;
        }

        .work-page__eyebrow,
        .work-page__section-heading > p,
        .work-page__contact > p {
          margin: 0 0 1.6rem;
          color: #7b61ff;
          font-size: 1.25rem;
          font-weight: 780;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .work-page__hero h1 {
          max-width: 11ch;
          margin: 0;
          color: var(--work-text);
          font-size: clamp(5.2rem, 8.2vw, 10.5rem);
          font-style: normal;
          font-weight: 860;
          line-height: 0.91;
          letter-spacing: -0.07em;
          text-wrap: balance;
        }

        .work-page__lede {
          max-width: 66rem;
          margin: 3rem 0 0;
          color: var(--work-muted);
          font-size: clamp(1.75rem, 2vw, 2.25rem);
          line-height: 1.55;
          text-wrap: pretty;
        }

        .work-page__hero-actions,
        .work-page__contact > div {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
          margin-top: 3rem;
        }

        .work-page__button,
        .work-page__text-link {
          min-height: 4.8rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.7rem;
          border: 1px solid var(--work-border);
          border-radius: 999px;
          padding: 1.2rem 1.7rem;
          color: var(--work-text) !important;
          background: var(--work-surface);
          font-size: 1.35rem;
          font-weight: 760;
          letter-spacing: 0.02em;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }

        .work-page__button:hover,
        .work-page__text-link:hover {
          transform: translateY(-2px);
          border-color: rgba(99, 68, 245, 0.58);
          background: var(--work-surface-strong);
        }

        .work-page__button--primary {
          border-color: rgba(99, 68, 245, 0.7);
          color: #ffffff !important;
          background: linear-gradient(120deg, #6344f5, #9654f6 65%, #b15dff);
          box-shadow: 0 14px 32px rgba(99, 68, 245, 0.22);
        }

        .work-page__button--primary:hover {
          background: linear-gradient(120deg, #7355f6, #a15aff 65%, #bd69ff);
          box-shadow: 0 18px 38px rgba(99, 68, 245, 0.3);
        }

        .work-page__text-link {
          border-color: transparent;
          background: transparent;
          color: var(--work-muted) !important;
        }

        .work-page__identity {
          display: grid;
          gap: 0;
          overflow: hidden;
          border: 1px solid var(--work-border);
          border-radius: 2.4rem;
          background: var(--work-surface);
          box-shadow: var(--work-shadow);
          backdrop-filter: blur(24px) saturate(145%);
          -webkit-backdrop-filter: blur(24px) saturate(145%);
        }

        .work-page__identity > div {
          display: grid;
          gap: 0.45rem;
          padding: 2rem 2.2rem;
          border-bottom: 1px solid var(--work-border);
        }

        .work-page__identity > div:last-child {
          border-bottom: 0;
        }

        .work-page__identity span,
        .work-project__ownership > span {
          color: var(--work-soft);
          font-size: 1.1rem;
          font-weight: 760;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .work-page__identity strong {
          color: var(--work-text);
          font-size: 1.55rem;
          font-weight: 720;
          line-height: 1.35;
        }

        .work-page__capabilities {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border-top: 1px solid var(--work-border);
          border-bottom: 1px solid var(--work-border);
        }

        .work-page__capabilities article {
          min-height: 20rem;
          padding: 4rem 3rem;
          border-right: 1px solid var(--work-border);
        }

        .work-page__capabilities article:last-child {
          border-right: 0;
        }

        .work-page__capabilities h2 {
          margin: 0;
          color: var(--work-text);
          font-size: 1.7rem;
          font-style: normal;
          font-weight: 780;
          letter-spacing: -0.02em;
        }

        .work-page__capabilities p {
          margin: 1.3rem 0 0;
          color: var(--work-muted);
          font-size: 1.45rem;
          line-height: 1.65;
        }

        .work-page__projects,
        .work-page__principles {
          padding: clamp(9rem, 12vw, 15rem) 0;
        }

        .work-page__section-heading {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(24rem, 0.55fr);
          column-gap: 6rem;
          align-items: end;
          margin-bottom: 6rem;
        }

        .work-page__section-heading > p {
          grid-column: 1 / -1;
        }

        .work-page__section-heading h2 {
          max-width: 12ch;
          margin: 0;
          color: var(--work-text);
          font-size: clamp(4rem, 6vw, 7.4rem);
          font-style: normal;
          font-weight: 840;
          line-height: 0.96;
          letter-spacing: -0.06em;
          text-wrap: balance;
        }

        .work-page__section-heading > span {
          color: var(--work-muted);
          font-size: 1.6rem;
          line-height: 1.65;
        }

        .work-page__project-list {
          border-top: 1px solid var(--work-border);
        }

        .work-project {
          display: grid;
          grid-template-columns: 8rem minmax(0, 1fr);
          gap: 2rem;
          padding: 6rem 0;
          border-bottom: 1px solid var(--work-border);
        }

        .work-project__rail {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .work-project__rail > span {
          color: #7b61ff;
          font-size: 1.3rem;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .work-project__rail > div {
          width: 1px;
          min-height: 100%;
          flex: 1;
          background: linear-gradient(to bottom, rgba(99, 68, 245, 0.8), transparent);
        }

        .work-project__content {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(28rem, 0.8fr);
          column-gap: clamp(3rem, 7vw, 9rem);
          align-items: start;
        }

        .work-project__topline,
        .work-project__links,
        .work-project__stack {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.8rem;
        }

        .work-project__topline {
          grid-column: 1 / -1;
          justify-content: space-between;
          margin-bottom: 2rem;
        }

        .work-project__topline p {
          margin: 0;
          color: var(--work-soft);
          font-size: 1.2rem;
          font-weight: 760;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .work-project__topline > span {
          border: 1px solid rgba(99, 68, 245, 0.25);
          border-radius: 999px;
          padding: 0.55rem 0.85rem;
          color: #8b74ff;
          background: rgba(99, 68, 245, 0.08);
          font-size: 1.1rem;
          font-weight: 750;
        }

        .work-project h3 {
          grid-column: 1;
          margin: 0;
          color: var(--work-text);
          font-size: clamp(3rem, 4.4vw, 5.6rem);
          font-weight: 820;
          line-height: 1;
          letter-spacing: -0.055em;
          text-wrap: balance;
        }

        .work-project__summary {
          grid-column: 1;
          max-width: 66rem;
          margin: 2rem 0 0;
          color: var(--work-muted);
          font-size: 1.65rem;
          line-height: 1.65;
        }

        .work-project__ownership {
          grid-column: 1;
          margin-top: 2.5rem;
        }

        .work-project__ownership p {
          margin: 0.8rem 0 0;
          color: var(--work-text);
          font-size: 1.45rem;
          font-weight: 640;
          line-height: 1.55;
        }

        .work-project__evidence {
          grid-column: 2;
          grid-row: 2 / span 4;
          display: grid;
          gap: 1.25rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .work-project__evidence li {
          position: relative;
          padding-left: 2rem;
          color: var(--work-muted);
          font-size: 1.4rem;
          line-height: 1.55;
        }

        .work-project__evidence li::before {
          content: "";
          position: absolute;
          top: 0.72em;
          left: 0;
          width: 0.7rem;
          height: 0.7rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #6344f5, #b15dff);
          box-shadow: 0 0 0 4px rgba(99, 68, 245, 0.09);
        }

        .work-project__stack {
          grid-column: 1;
          margin: 2.5rem 0 0;
          padding: 0;
          list-style: none;
        }

        .work-project__stack li {
          border: 1px solid var(--work-border);
          border-radius: 999px;
          padding: 0.55rem 0.85rem;
          color: var(--work-muted);
          background: var(--work-surface);
          font-size: 1.1rem;
          font-weight: 720;
        }

        .work-project__links {
          grid-column: 1;
          margin-top: 2rem;
        }

        .work-project__links a {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          border-bottom: 1px solid rgba(99, 68, 245, 0.34);
          padding: 0.4rem 0;
          color: var(--work-text) !important;
          font-size: 1.3rem;
          font-weight: 760;
          transition: color 160ms ease, border-color 160ms ease;
        }

        .work-project__links a:hover {
          color: #8b74ff !important;
          border-color: #8b74ff;
        }

        .work-page__principles {
          border-top: 1px solid var(--work-border);
        }

        .work-page__principle-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.5rem;
        }

        .work-page__principle-grid article {
          min-height: 27rem;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--work-border);
          border-radius: 2.2rem;
          padding: 3rem;
          background: var(--work-surface);
          box-shadow: var(--work-shadow);
        }

        .work-page__principle-grid article > span {
          color: #7b61ff;
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .work-page__principle-grid h3 {
          max-width: 18ch;
          margin: auto 0 0;
          color: var(--work-text);
          font-size: clamp(2.5rem, 3vw, 3.6rem);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.045em;
        }

        .work-page__principle-grid p {
          margin: 1.5rem 0 0;
          color: var(--work-muted);
          font-size: 1.45rem;
          line-height: 1.65;
        }

        .work-page__contact {
          margin-bottom: clamp(8rem, 10vw, 13rem);
          overflow: hidden;
          border: 1px solid var(--work-border);
          border-radius: 2.8rem;
          padding: clamp(4rem, 8vw, 8rem);
          background:
            radial-gradient(circle at 100% 0%, rgba(177, 93, 255, 0.19), transparent 34rem),
            radial-gradient(circle at 0% 100%, rgba(99, 68, 245, 0.16), transparent 30rem),
            var(--work-surface-strong);
          box-shadow: var(--work-shadow);
        }

        .work-page__contact h2 {
          max-width: 16ch;
          margin: 0;
          color: var(--work-text);
          font-size: clamp(4rem, 6vw, 7rem);
          font-style: normal;
          font-weight: 840;
          line-height: 0.98;
          letter-spacing: -0.06em;
          text-wrap: balance;
        }

        .work-page__footer {
          width: min(1240px, calc(100% - 4rem));
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          gap: 2rem;
          border-top: 1px solid var(--work-border);
          padding: 3rem 0 4rem;
          color: var(--work-soft);
          font-size: 1.15rem;
          line-height: 1.5;
        }

        .work-page a:focus,
        .work-page button:focus {
          outline: none;
        }

        .work-page a:focus-visible,
        .work-page button:focus-visible {
          outline: 3px solid rgba(99, 68, 245, 0.95);
          outline-offset: 4px;
        }

        @media (max-width: 900px) {
          .work-page__header-inner,
          .work-page__main,
          .work-page__footer {
            width: min(100% - 2.4rem, 1240px);
          }

          .work-page__header-inner {
            min-height: 6.4rem;
          }

          .work-page__nav a:nth-of-type(1),
          .work-page__nav a:nth-of-type(2) {
            display: none;
          }

          .work-page__hero {
            min-height: auto;
            grid-template-columns: 1fr;
            gap: 4rem;
            padding: 8rem 0 10rem;
          }

          .work-page__hero h1 {
            max-width: 12ch;
          }

          .work-page__identity {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .work-page__identity > div:nth-child(2) {
            border-right: 0;
          }

          .work-page__identity > div {
            border-right: 1px solid var(--work-border);
          }

          .work-page__capabilities {
            grid-template-columns: 1fr;
          }

          .work-page__capabilities article {
            min-height: auto;
            border-right: 0;
            border-bottom: 1px solid var(--work-border);
          }

          .work-page__capabilities article:last-child {
            border-bottom: 0;
          }

          .work-page__section-heading,
          .work-project__content {
            grid-template-columns: 1fr;
          }

          .work-page__section-heading > span {
            margin-top: 2rem;
          }

          .work-project__evidence {
            grid-column: 1;
            grid-row: auto;
            margin-top: 3rem;
          }

          .work-project h3,
          .work-project__summary,
          .work-project__ownership,
          .work-project__stack,
          .work-project__links {
            grid-column: 1;
          }
        }

        @media (max-width: 640px) {
          .work-page__header-inner {
            align-items: center;
          }

          .work-page__brand span {
            display: none;
          }

          .work-page__nav a:nth-of-type(3) {
            display: none;
          }

          .work-page__nav a,
          .work-page__theme {
            min-height: 3.5rem;
            padding: 0.7rem 0.85rem;
            font-size: 1.1rem;
          }

          .work-page__hero {
            padding: 6rem 0 8rem;
          }

          .work-page__hero h1 {
            font-size: clamp(4.4rem, 16vw, 6.8rem);
          }

          .work-page__lede {
            margin-top: 2rem;
            font-size: 1.65rem;
          }

          .work-page__identity {
            grid-template-columns: 1fr;
          }

          .work-page__identity > div {
            border-right: 0;
          }

          .work-page__projects,
          .work-page__principles {
            padding: 8rem 0;
          }

          .work-page__section-heading {
            margin-bottom: 4rem;
          }

          .work-project {
            grid-template-columns: 3rem minmax(0, 1fr);
            gap: 1rem;
            padding: 4.5rem 0;
          }

          .work-project__topline {
            align-items: flex-start;
          }

          .work-project__topline > span {
            font-size: 0.95rem;
          }

          .work-page__principle-grid {
            grid-template-columns: 1fr;
          }

          .work-page__principle-grid article {
            min-height: 23rem;
            padding: 2.4rem;
          }

          .work-page__contact {
            border-radius: 2.2rem;
            padding: 3.5rem 2.2rem;
          }

          .work-page__footer {
            flex-direction: column;
            padding-bottom: max(3rem, env(safe-area-inset-bottom, 0px));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .work-page *,
          .work-page *::before,
          .work-page *::after {
            scroll-behavior: auto !important;
            transition: none !important;
            animation: none !important;
          }
        }

        @media (forced-colors: active) {
          .work-page__identity,
          .work-page__principle-grid article,
          .work-page__contact,
          .work-page__button,
          .work-project__stack li,
          .work-project__topline > span {
            border: 1px solid CanvasText;
          }
        }

        @media print {
          .work-page {
            color: #000000;
            background: #ffffff;
          }

          .work-page__header,
          .work-page__hero-actions,
          .work-page__contact,
          .work-page__footer {
            display: none !important;
          }

          .work-page__main {
            width: 100%;
          }

          .work-page__hero {
            min-height: auto;
            display: block;
            padding: 2rem 0 4rem;
          }

          .work-page__hero h1,
          .work-page__section-heading h2,
          .work-project h3,
          .work-page__principle-grid h3 {
            color: #000000;
          }

          .work-page__projects,
          .work-page__principles {
            padding: 4rem 0;
          }

          .work-project,
          .work-page__principle-grid article {
            break-inside: avoid;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};

const WorkPage = () => (
  <ThemeProvider>
    <WorkPageContent />
  </ThemeProvider>
);

export default WorkPage;
