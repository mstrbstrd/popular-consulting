import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("spectral icon colorway", () => {
  const css = readRepositoryFile("src/spectral-icon-colorway.css");
  const indexSource = readRepositoryFile("src/index.js");
  const navSource = readRepositoryFile("src/components/NavMenu.js");
  const workSource = readRepositoryFile("src/components/WorkPage.js");
  const contactSource = readRepositoryFile("src/components/ContactSection.js");

  test("loads after the shared navigation layer", () => {
    const navigationImport = indexSource.indexOf(
      "import './navigation-cohesion.css';",
    );
    const iconImport = indexSource.indexOf(
      "import './spectral-icon-colorway.css';",
    );

    expect(navigationImport).toBeGreaterThanOrEqual(0);
    expect(iconImport).toBeGreaterThan(navigationImport);
  });

  test("uses theme-aware spectral masks for sun and moon controls", () => {
    expect(css).toContain("--spectral-icon-colorway:");
    expect(css).toContain('url("./assets/icons/theme-sun.svg")');
    expect(css).toContain('url("./assets/icons/theme-moon.svg")');
    expect(css).toContain(":has(svg circle)");
    expect(css).toContain(".nav-theme-toggle");
    expect(css).toContain(".work-page__theme");

    expect(navSource).toContain('<circle cx="12" cy="12" r="4"');
    expect(workSource).toContain('<circle cx="12" cy="12" r="3.5"');
  });

  test("keeps social marks spectral, unframed, and separated by one rule", () => {
    expect(css).toContain('a[href*="twitter.com"]');
    expect(css).toContain('a[href*="instagram.com"]');
    expect(css).toContain('url("./assets/icons/twitter.svg")');
    expect(css).toContain('url("./assets/icons/instagram.svg")');
    expect(css).toContain('a[href*="twitter.com"]::after');
    expect(css).toContain("background: var(--aetheris-line-strong);");
    expect(css).toContain("border: 0 !important;");
    expect(css).not.toContain("var(--aetheris-spectral-border-soft) border-box");
    expect(css).not.toContain("var(--aetheris-sheen)");

    expect(contactSource).toContain("https://twitter.com/mstrbstrdd");
    expect(contactSource).toContain("https://instagram.com");
  });

  test("uses motion instead of a shaded box for both brand clusters", () => {
    expect(css).toContain(".nav-brand:hover");
    expect(css).toContain(".work-page__brand:hover");
    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(".nav-brand:hover .nav-logo");
    expect(css).toContain("rotate(-3deg) scale(1.04)");
    expect(css).toContain(".nav-brand:hover .nav-brand-name");
    expect(css).toContain("transform: translateX(2px);");
  });

  test("preserves accessibility modes and authored scene ownership", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");

    [
      ".fixed-background",
      ".glass-gradient",
      "DitherBackground",
      "BlackHoleBackground",
      "canvas",
    ].forEach((sceneInvariant) => expect(css).not.toContain(sceneInvariant));
  });
});