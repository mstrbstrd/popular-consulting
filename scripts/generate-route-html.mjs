import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(repositoryRoot, "build");
const metadataPath = path.join(
  repositoryRoot,
  "src",
  "content",
  "routeMetadata.json",
);

const metadataByRoute = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const sourceIndexPath = path.join(buildDirectory, "index.html");

if (!fs.existsSync(sourceIndexPath)) {
  throw new Error(
    "build/index.html is missing. Run the React production build before generating route HTML.",
  );
}

const sourceHtml = fs.readFileSync(sourceIndexPath, "utf8");

const replaceOnce = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) {
    throw new Error(`Could not find ${label} in build/index.html.`);
  }

  pattern.lastIndex = 0;
  return html.replace(pattern, replacement);
};

const escapeAttribute = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeText = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const applyMetadata = (html, metadata) => {
  let next = html;

  next = replaceOnce(
    next,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeText(metadata.title)}</title>`,
    "title",
  );
  next = replaceOnce(
    next,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeAttribute(metadata.description)}" />`,
    "description metadata",
  );
  next = replaceOnce(
    next,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="robots" content="${escapeAttribute(metadata.robots)}" />`,
    "robots metadata",
  );
  next = replaceOnce(
    next,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeAttribute(metadata.canonical)}" />`,
    "canonical link",
  );
  next = replaceOnce(
    next,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeAttribute(metadata.canonical)}" />`,
    "Open Graph URL",
  );
  next = replaceOnce(
    next,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeAttribute(metadata.socialTitle)}" />`,
    "Open Graph title",
  );
  next = replaceOnce(
    next,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeAttribute(metadata.socialDescription)}" />`,
    "Open Graph description",
  );
  next = replaceOnce(
    next,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeAttribute(metadata.socialTitle)}" />`,
    "Twitter title",
  );
  next = replaceOnce(
    next,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.socialDescription)}" />`,
    "Twitter description",
  );
  next = replaceOnce(
    next,
    /<noscript>[\s\S]*?<\/noscript>/i,
    `<noscript>${escapeText(metadata.noscript)}</noscript>`,
    "noscript content",
  );

  return next;
};

/* The shared routes load Poppins for the immersive artwork plus the Aetheris
   Hanken Grotesk and JetBrains Mono pair for shell, card, and control content.
   /engineering adds its scoped card treatment. /work drops Poppins because its
   route is entirely Aetheris. */
const IMMERSIVE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Poppins:ital,wght@0,200;0,600;1,100;1,200&display=swap";
const ENGINEERING_FONTS_HREF = IMMERSIVE_FONTS_HREF;
const WORK_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
const ENGINEERING_CARD_LINK =
  '<link rel="stylesheet" href="/engineering-card.css?v=20260730a" />';
const WORK_TYPOGRAPHY_LINK =
  '<link rel="stylesheet" href="/work-typography.css?v=20260730c" />';

const writeRoute = (routeKey, destinationDirectory) => {
  const metadata = metadataByRoute[routeKey];
  if (!metadata) {
    throw new Error(`Missing route metadata for ${routeKey}.`);
  }

  let html = applyMetadata(sourceHtml, metadata);
  if (routeKey === "engineering") {
    if (!html.includes(IMMERSIVE_FONTS_HREF)) {
      throw new Error("Could not find route font stylesheet in build/index.html.");
    }
    html = html.replace(IMMERSIVE_FONTS_HREF, ENGINEERING_FONTS_HREF);
    html = replaceOnce(
      html,
      /<\/head>/i,
      `${ENGINEERING_CARD_LINK}</head>`,
      "closing head tag for engineering card styles",
    );
  }
  if (routeKey === "work") {
    if (!html.includes(IMMERSIVE_FONTS_HREF)) {
      throw new Error("Could not find route font stylesheet in build/index.html.");
    }
    html = html.replace(IMMERSIVE_FONTS_HREF, WORK_FONTS_HREF);
    html = replaceOnce(
      html,
      /<\/head>/i,
      `${WORK_TYPOGRAPHY_LINK}</head>`,
      "closing head tag for work typography",
    );
  }
  const targetDirectory = path.join(buildDirectory, destinationDirectory);
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(path.join(targetDirectory, "index.html"), html);
};

const rootHtml = applyMetadata(sourceHtml, metadataByRoute.root);
fs.writeFileSync(sourceIndexPath, rootHtml);

writeRoute("engineering", "engineering");
writeRoute("work", "work");
writeRoute("orb", "orb");
writeRoute("game", "game");
writeRoute("ditherCanvas", "dither-canvas");

console.log(
  "Generated route-specific HTML metadata for /, /engineering, /work, /orb, /game, and /dither-canvas.",
);
