import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const write = (relativePath, content) => {
  const target = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

const replaceOnce = (source, searchValue, replacement, label) => {
  const count =
    typeof searchValue === "string"
      ? source.split(searchValue).length - 1
      : (source.match(searchValue) || []).length;

  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}.`);
  }

  return source.replace(searchValue, replacement);
};

const replaceAllExpected = (
  source,
  searchValue,
  replacement,
  expectedCount,
  label,
) => {
  const count =
    typeof searchValue === "string"
      ? source.split(searchValue).length - 1
      : (source.match(searchValue) || []).length;

  if (count !== expectedCount) {
    throw new Error(
      `${label}: expected ${expectedCount} matches, found ${count}.`,
    );
  }

  if (typeof searchValue === "string") {
    return source.split(searchValue).join(replacement);
  }

  return source.replace(searchValue, replacement);
};

// package.json
{
  const packagePath = "package.json";
  const packageJson = JSON.parse(read(packagePath));
  packageJson.scripts.build =
    "CI= react-scripts build && node scripts/generate-route-html.mjs";
  write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

// vercel.json
{
  const vercelPath = "vercel.json";
  const vercel = JSON.parse(read(vercelPath));
  const routeDestinations = {
    "/engineering": "/engineering/index.html",
    "/work": "/work/index.html",
    "/orb": "/orb/index.html",
    "/game": "/game/index.html",
  };

  vercel.rewrites = vercel.rewrites.map((rewrite) => {
    const route = Object.keys(routeDestinations).find(
      (candidate) =>
        rewrite.source === candidate ||
        rewrite.source.startsWith(`${candidate}/`),
    );

    return route
      ? { ...rewrite, destination: routeDestinations[route] }
      : rewrite;
  });

  write(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`);
}

// public/index.html
{
  const metadata = JSON.parse(
    read("src/content/routeMetadata.json"),
  ).root;
  let html = read("public/index.html");

  const replaceMeta = (pattern, replacement, label) => {
    html = replaceOnce(html, pattern, replacement, label);
  };

  replaceMeta(
    /<title>[\s\S]*?<\/title>/,
    `<title>${metadata.title.replaceAll("&", "&amp;")}</title>`,
    "root title",
  );
  replaceMeta(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${metadata.description}" />`,
    "root description",
  );
  replaceMeta(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${metadata.canonical}" />`,
    "root canonical",
  );
  replaceMeta(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${metadata.canonical}" />`,
    "root Open Graph URL",
  );
  replaceMeta(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${metadata.socialTitle.replaceAll("&", "&amp;")}" />`,
    "root Open Graph title",
  );
  replaceMeta(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${metadata.socialDescription}" />`,
    "root Open Graph description",
  );
  replaceMeta(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${metadata.socialTitle.replaceAll("&", "&amp;")}" />`,
    "root Twitter title",
  );
  replaceMeta(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${metadata.socialDescription}" />`,
    "root Twitter description",
  );
  replaceMeta(
    /<noscript>[\s\S]*?<\/noscript>/,
    `<noscript>${metadata.noscript}</noscript>`,
    "root noscript",
  );

  write("public/index.html", html);
}

// src/App.js
{
  const appPath = "src/App.js";
  let source = read(appPath);

  source = replaceOnce(
    source,
    'import { MAIN_APP_EXPERIENCE_PLAN } from "./experiencePlacement";',
    `import { MAIN_APP_EXPERIENCE_PLAN } from "./experiencePlacement";
import routeMetadata from "./content/routeMetadata.json";
import { SITE_AUDIENCES } from "./content/siteCopy";`,
    "App content imports",
  );

  source = replaceOnce(
    source,
    /const IMMERSIVE_METADATA = \{[\s\S]*?\n\};\n\nconst App/,
    `const IMMERSIVE_METADATA = {
  [IMMERSIVE_MODES.ORIGINAL]: routeMetadata.root,
  [IMMERSIVE_MODES.ENGINEERING]: routeMetadata.engineering,
};

const App`,
    "App route metadata",
  );

  source = replaceOnce(
    source,
    "  const metadata = IMMERSIVE_METADATA[presentation.mode];",
    `  const metadata = IMMERSIVE_METADATA[presentation.mode];
  const audience =
    presentation.mode === IMMERSIVE_MODES.ENGINEERING
      ? SITE_AUDIENCES.ENGINEERING
      : SITE_AUDIENCES.BUSINESS;`,
    "App audience selection",
  );

  source = replaceOnce(
    source,
    "    <BioSection key=\"about\" /> ,".replace(" /> ,", " />,"),
    '    <BioSection key="about" audience={audience} />,',
    "App biography audience",
  );
  source = replaceOnce(
    source,
    "    <ServicesSection key=\"services\" /> ,".replace(" /> ,", " />,"),
    '    <ServicesSection key="services" audience={audience} />,',
    "App services audience",
  );
  source = replaceOnce(
    source,
    "    <ContactSection key=\"contact\" /> ,".replace(" /> ,", " />,"),
    '    <ContactSection key="contact" audience={audience} />,',
    "App contact audience",
  );
  source = replaceOnce(
    source,
    "          <NavMenu />",
    "          <NavMenu audience={audience} />",
    "App navigation audience",
  );

  write(appPath, source);
}

// src/components/NavMenu.js
{
  const navPath = "src/components/NavMenu.js";
  let source = read(navPath);

  source = replaceOnce(
    source,
    'import { MAIN_APP_EXPERIENCE_PLAN } from "../experiencePlacement";\n\nconst NAV_LINKS = MAIN_APP_EXPERIENCE_PLAN.navigationLinks;',
    'import { SITE_AUDIENCES, getSiteCopy } from "../content/siteCopy";',
    "NavMenu copy import",
  );

  source = replaceOnce(
    source,
    "const NavMenu = () => {\n  const { isDark, toggleTheme } = useThemeMode();",
    `const NavMenu = ({ audience = SITE_AUDIENCES.BUSINESS }) => {
  const { isDark, toggleTheme } = useThemeMode();
  const navigation = getSiteCopy(audience).navigation;
  const navLinks = navigation.links;`,
    "NavMenu audience setup",
  );

  source = replaceOnce(
    source,
    /    if \(href\) \{[\s\S]*?\n    \}\n\n    const activeClass/,
    `    if (href) {
      const external = /^https?:\\/\\//.test(href);

      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={className}
          aria-label={
            external
              ? \`\${label.replace(" ↗", "")} - opens in new tab\`
              : undefined
          }
          onClick={mobile ? () => setIsMobileMenuOpen(false) : undefined}
        >
          {label}
        </a>
      );
    }

    const activeClass`,
    "NavMenu internal and external links",
  );

  source = replaceOnce(
    source,
    '            aria-label="Popular Consulting - return to home"',
    "            aria-label={navigation.brandAriaLabel}",
    "NavMenu brand accessible name",
  );
  source = replaceOnce(
    source,
    '<span className="nav-brand-name">Popular Consulting</span>',
    '<span className="nav-brand-name">{navigation.brandLabel}</span>',
    "NavMenu brand text",
  );
  source = replaceAllExpected(
    source,
    "NAV_LINKS.map",
