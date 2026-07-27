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

  return next
    .replaceAll('href="./popcon_svg.svg"', 'href="/popcon_svg.svg"')
    .replaceAll('href="./logo2026.png"', 'href="/logo2026.png"')
    .replaceAll('href="./manifest.json"', 'href="/manifest.json"')
    .replaceAll('href="./logo192.png"', 'href="/logo192.png"');
};

const writeRoute = (routeKey, destinationDirectory) => {
  const metadata = metadataByRoute[routeKey];
  if (!metadata) {
    throw new Error(`Missing route metadata for ${routeKey}.`);
  }

  const html = applyMetadata(sourceHtml, metadata);
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

console.log(
  "Generated route-specific HTML metadata for /, /engineering, /work, /orb, and /game.",
);
