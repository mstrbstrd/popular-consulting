    `const ContactSection = ({
  isActive,
  audience = SITE_AUDIENCES.BUSINESS,
}) => {
  const { isDark } = useThemeMode();
  const copy = getSiteCopy(audience).contact;`,
    "ContactSection audience setup",
  );

  source = source.replace(
    /^\s*console\.log\([^\n]*\);\s*$/gm,
    "",
  );

  source = replaceOnce(
    source,
    '      aria-label="Contact"',
    "      aria-label={copy.sectionLabel}",
    "Contact section accessible label",
  );
  source = replaceOnce(
    source,
    "              Let's Talk.",
    "              {copy.heading}",
    "Contact heading",
  );

  source = replaceOnce(
    source,
    "            </Typography>\n            <form",
    `            </Typography>
            <Typography
              component="p"
              sx={{
                maxWidth: "640px",
                margin: "0 auto 1.5rem",
                textAlign: "center",
                color: isDark
                  ? "rgba(225,225,245,0.62)"
                  : "rgba(20,20,30,0.62)",
                fontSize: { xs: "0.95rem", md: "1.05rem" },
                lineHeight: 1.6,
                position: "relative",
                zIndex: 2,
              }}
            >
              {copy.intro}
            </Typography>
            <form`,
    "Contact introduction",
  );

  source = replaceOnce(
    source,
    '              aria-label="Contact form"',
    "              aria-label={copy.formLabel}",
    "Contact form accessible label",
  );
  source = replaceOnce(
    source,
    '                label="Name"',
    "                label={copy.nameLabel}",
    "Contact name label",
  );
  source = replaceOnce(
    source,
    '                label="Email"',
    "                label={copy.emailLabel}",
    "Contact email label",
  );
  source = replaceOnce(
    source,
    '                label="Message"',
    "                label={copy.messageLabel}",
    "Contact message label",
  );
  source = replaceOnce(
    source,
    '                aria-label="Send message"',
    "                aria-label={copy.buttonLabel}",
    "Contact submit accessible name",
  );
  source = replaceOnce(
    source,
    "                Send Message",
    "                {copy.buttonLabel}",
    "Contact submit label",
  );

  write(contactPath, source);
}

// src/components/ProfessionalHero.js
{
  const heroPath = "src/components/ProfessionalHero.js";
  let source = read(heroPath);

  source = replaceOnce(
    source,
    'import { useThemeMode } from "../contexts/ThemeContext";',
    `import { useThemeMode } from "../contexts/ThemeContext";
import {
  PUBLIC_LINKS,
  SITE_AUDIENCES,
  getSiteCopy,
} from "../content/siteCopy";`,
    "ProfessionalHero copy import",
  );

  source = replaceOnce(
    source,
    /const PROFILE = \{[\s\S]*?\n\};/,
    "const PROFILE = getSiteCopy(SITE_AUDIENCES.ENGINEERING).hero;",
    "ProfessionalHero profile copy",
  );

  source = replaceOnce(
    source,
    "            View selected work",
    "            {PROFILE.primaryAction}",
    "ProfessionalHero work CTA",
  );
  source = replaceOnce(
    source,
    "            About",
    "            {PROFILE.approachAction}",
    "ProfessionalHero approach CTA",
  );
  source = replaceOnce(
    source,
    "            Contact",
    "            {PROFILE.contactAction}",
    "ProfessionalHero contact CTA",
  );
  source = replaceOnce(
    source,
    "            href={PROFILE.github}",
    "            href={PUBLIC_LINKS.github}",
    "ProfessionalHero GitHub URL",
  );
  source = replaceOnce(
    source,
    "            GitHub",
    "            {PROFILE.githubAction}",
    "ProfessionalHero GitHub label",
  );

  write(heroPath, source);
}

// src/components/WorkPage.js
{
  const workPath = "src/components/WorkPage.js";
  let source = read(workPath);

  source = replaceOnce(
    source,
    'import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";',
    `import { ThemeProvider, useThemeMode } from "../contexts/ThemeContext";
import { PUBLIC_LINKS } from "../content/siteCopy";
import routeMetadata from "../content/routeMetadata.json";`,
    "WorkPage content imports",
  );

  source = replaceOnce(
    source,
    '      "A layered .NET and Blazor commerce system connecting catalog, customer, order, payment, and operational workflows to Microsoft Dynamics NAV."',
    '      "A live, layered .NET and Blazor commerce system connecting catalog, customer, order, payment, and operational workflows to Microsoft Dynamics NAV."',
    "WorkPage commerce summary",
  );
  source = replaceOnce(
    source,
    '    status: "Private client system",\n    links: [],',
    `    status: "Live client platform",
    links: [PUBLIC_LINKS.liveStorefront],`,
    "WorkPage commerce live link",
  );
  source = replaceOnce(
    source,
    '      "An interactive React business platform built around custom WebGL and GLSL effects, full-screen transitions, progressive enhancement, and a growing recruiter-facing portfolio layer."',
    '      "An interactive React business and engineering platform built around custom WebGL and GLSL effects, full-screen transitions, progressive enhancement, and evidence-led professional routes."',
    "WorkPage Popular Consulting summary",
  );

  source = replaceOnce(
    source,
    `    const workDescription =
      "Selected engineering work by Shaedan Hawse across enterprise commerce, AI operations, product engineering, accessible interfaces, and production delivery.";

    document.title = "Selected Engineering Work | Shaedan Hawse";`,
    `    const metadata = routeMetadata.work;

    document.title = metadata.title;`,
    "WorkPage route metadata source",
  );
  source = replaceOnce(
    source,
    '    description?.setAttribute("content", workDescription);\n    canonical?.setAttribute("href", "https://popcon.dev/work");\n    ogTitle?.setAttribute("content", "Selected Engineering Work | Shaedan Hawse");\n    ogDescription?.setAttribute("content", workDescription);\n    ogUrl?.setAttribute("content", "https://popcon.dev/work");',
    `    description?.setAttribute("content", metadata.description);
    canonical?.setAttribute("href", metadata.canonical);
    ogTitle?.setAttribute("content", metadata.socialTitle);
    ogDescription?.setAttribute("content", metadata.socialDescription);
    ogUrl?.setAttribute("content", metadata.canonical);`,
    "WorkPage route metadata application",
  );

  source = replaceOnce(
    source,
    `            <a href="mailto:shaw@popcon.dev">Contact</a>
            <a href="/">Immersive home</a>`,
    `            <a href="mailto:shaw@popcon.dev">Contact</a>
            <a href="/engineering">Engineering home</a>
            <a href="/">Consulting home</a>`,
    "WorkPage audience navigation",
  );
  source = replaceOnce(
    source,
    '<p className="work-page__eyebrow">Shaedan Hawse | Selected engineering work</p>',
    '<p className="work-page__eyebrow">Shaedan Hawse | Engineering work through Popular Consulting</p>',
    "WorkPage eyebrow",
  );
  source = replaceOnce(
    source,
    '<h1 id="work-page-title">Systems built to survive production.</h1>',
    '<h1 id="work-page-title">Systems built for real operations.</h1>',
    "WorkPage hero heading",
  );
  source = replaceOnce(
    source,
    `              Hands-on Engineering Lead and Full Stack Software Engineer building across AI operations,
              commerce, payments, enterprise integrations, accessible interfaces, and delivery systems.`,
    `              Hands-on Engineering Lead and Full Stack Software Engineer working across AI operations,
              commerce, payments, enterprise integrations, accessible interfaces, and complete delivery systems.`,
    "WorkPage hero lede",
  );
  source = replaceOnce(
    source,
    "                Discuss a role",
    "                Discuss a role or project",
    "WorkPage hero contact CTA",
  );
  source = replaceOnce(
    source,
