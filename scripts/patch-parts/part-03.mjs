    "          <p>Engineering leadership, full-stack product work, and difficult systems</p>",
    "          <p>Engineering roles, product partnerships, and consulting engagements</p>",
    "WorkPage contact eyebrow",
  );
  source = replaceOnce(
    source,
    "          <h2 id=\"work-contact-title\">Let us talk about the problem you need solved.</h2>",
    '          <h2 id="work-contact-title">Let us talk about the system, team, or business problem.</h2>',
    "WorkPage contact heading",
  );
  source = replaceOnce(
    source,
    `            <a className="work-page__button" href="/">
              Enter the immersive site
            </a>`,
    `            <a className="work-page__button" href="/engineering">
              Engineering home
            </a>
            <a className="work-page__button" href="/">
              Consulting home
            </a>`,
    "WorkPage audience return links",
  );

  write(workPath, source);
}

// src/components/WorkPage.test.js
{
  const testPath = "src/components/WorkPage.test.js";
  let source = read(testPath);

  source = replaceOnce(
    source,
    '        name: "Systems built to survive production.",',
    '        name: "Systems built for real operations.",',
    "WorkPage test hero heading",
  );
  source = replaceOnce(
    source,
    '    expect(screen.getByText("Private client system")).toBeInTheDocument();',
    '    expect(screen.getByText("Live client platform")).toBeInTheDocument();',
    "WorkPage test client status",
  );
  source = replaceOnce(
    source,
    `    const creatorOs = screen.getByRole("link", { name: /Open CreatorOS/i });`,
    `    const storefront = screen.getByRole("link", {
      name: /Open live storefront/i,
    });
    expect(storefront).toHaveAttribute(
      "href",
      "https://shop.dyconcretepumps.com",
    );
    expect(storefront).toHaveAttribute("target", "_blank");
    expect(storefront).toHaveAttribute("rel", "noopener noreferrer");

    const creatorOs = screen.getByRole("link", { name: /Open CreatorOS/i });`,
    "WorkPage live storefront test",
  );
  source = replaceOnce(
    source,
    '      expect.stringContaining("Selected engineering work by Shaedan Hawse"),',
    '      expect.stringContaining("Selected software and engineering work by Shaedan Hawse"),',
    "WorkPage metadata test",
  );

  write(testPath, source);
}

// src/components/ProfessionalHero.test.js
{
  const testPath = "src/components/ProfessionalHero.test.js";
  let source = read(testPath);

  source = replaceOnce(
    source,
    `        "I design and ship production software across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and delivery systems.",`,
    `        "I lead and ship production software across AI operations, commerce, payments, enterprise integrations, accessible interfaces, and delivery systems. The work stays hands-on, evidence-led, and accountable through production.",`,
    "ProfessionalHero test summary",
  );
  source = replaceAllExpected(
    source,
    '"View selected work"',
    '"Review engineering work"',
    3,
    "ProfessionalHero test work CTA",
  );
  source = replaceOnce(
    source,
    '    fireEvent.click(screen.getByRole("button", { name: "About" }));',
    '    fireEvent.click(screen.getByRole("button", { name: "Engineering approach" }));',
    "ProfessionalHero test approach CTA",
  );
  source = replaceOnce(
    source,
    '    fireEvent.click(screen.getByRole("button", { name: "Contact" }));',
    '    fireEvent.click(screen.getByRole("button", { name: "Discuss a role" }));',
    "ProfessionalHero test contact CTA",
  );

  write(testPath, source);
}

// src/App.immersive-mode.test.js
{
  const testPath = "src/App.immersive-mode.test.js";
  let source = read(testPath);

  source = replaceOnce(
    source,
    '"Popular Consulting | AI, Software & E-Commerce",',
    '"Popular Consulting | Custom Software, AI & E-Commerce",',
    "App root metadata test",
  );
  source = replaceOnce(
    source,
    '      expect.stringContaining("Shaedan Hawse is an Engineering Lead"),',
    '      expect.stringContaining("Shaedan Hawse is a hands-on Engineering Lead"),',
    "App engineering metadata test",
  );

  write(testPath, source);
}

// src/components/StandaloneExperiencePage.js
{
  const experiencePath = "src/components/StandaloneExperiencePage.js";
  let source = read(experiencePath);

  source = replaceOnce(
    source,
    'import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";',
    `import { hasHardwareWebGL, isMobileTier } from "../utils/deviceTier";
import routeMetadata from "../content/routeMetadata.json";`,
    "Standalone experience metadata import",
  );

  source = replaceOnce(
    source,
    `    title: "Interactive Orb Lab | Popular Consulting",
    description:
      "A route-only interactive WebGL orb experiment by Popular Consulting, with expressions, morphing, animation sequences, and a complete non-WebGL fallback.",
    canonical: "https://popcon.dev/orb",`,
    `    title: routeMetadata.orb.title,
    description: routeMetadata.orb.description,
    canonical: routeMetadata.orb.canonical,`,
    "Orb metadata source",
  );
  source = replaceOnce(
    source,
    `    title: "Popcorn Game | Popular Consulting",
    description:
      "A route-only browser game experiment by Popular Consulting, combining a responsive canvas, pointer interaction, procedural animation, and user-initiated Web Audio.",
    canonical: "https://popcon.dev/game",`,
    `    title: routeMetadata.game.title,
    description: routeMetadata.game.description,
    canonical: routeMetadata.game.canonical,`,
    "Game metadata source",
  );

  write(experiencePath, source);
}

// README.md
{
  const readmePath = "README.md";
  let source = read(readmePath);

  source = replaceOnce(
    source,
    `- Website: [popcon.dev](https://popcon.dev)
- Business domain: [popular-consulting.com](https://popular-consulting.com)
- Contact: [shaw@popcon.dev](mailto:shaw@popcon.dev)`,
    `- Consulting entrance: [popcon.dev](https://popcon.dev)
- Engineering entrance: [popcon.dev/engineering](https://popcon.dev/engineering)
- Selected work: [popcon.dev/work](https://popcon.dev/work)
- Business domain: [popular-consulting.com](https://popular-consulting.com)
- Contact: [shaw@popcon.dev](mailto:shaw@popcon.dev)

## Audience and copy contract

The public platform uses one evidence base with distinct audience framing:

- \`/\` speaks to businesses evaluating Popular Consulting.
- \`/engineering\` speaks to hiring teams, engineering leaders, and technical peers.
- \`/work\` provides conventional, public-safe project evidence for both audiences.

Visible copy is defined in [\`src/content/siteCopy.js\`](src/content/siteCopy.js). Route metadata is defined in [\`src/content/routeMetadata.json\`](src/content/routeMetadata.json) and emitted as route-specific static HTML during the production build. See [the dual-audience copy architecture](docs/content/dual-audience-copy.md).`,
    "README audience contract",
  );

  write(readmePath, source);
}

console.log("Applied dual-audience copy and static route metadata changes.");
