    "navLinks.map",
    2,
    "NavMenu audience links",
  );

  write(navPath, source);
}

// src/components/BioSection.js
{
  const bioPath = "src/components/BioSection.js";
  let source = read(bioPath);

  source = replaceOnce(
    source,
    'import { isMobileTier, hasHardwareWebGL } from "../utils/deviceTier";',
    `import { isMobileTier, hasHardwareWebGL } from "../utils/deviceTier";
import { SITE_AUDIENCES, getSiteCopy } from "../content/siteCopy";`,
    "BioSection copy import",
  );

  source = replaceOnce(
    source,
    /const TITLE =[\s\S]*?\n\nconst FLIP_DURATION/,
    "const FLIP_DURATION",
    "BioSection legacy copy constants",
  );

  source = replaceOnce(
    source,
    "const BioPhoto = ({ visible, blurred }) => {",
    "const BioPhoto = ({ visible, blurred, photoAlt }) => {",
    "BioPhoto copy props",
  );
  source = replaceOnce(
    source,
    '          alt="Portrait of the consultant"',
    "          alt={photoAlt}",
    "BioPhoto alt text",
  );

  source = replaceOnce(
    source,
    "const BioExpandedOverlay = ({\n  originRect,",
    "const BioExpandedOverlay = ({\n  copy,\n  originRect,",
    "BioExpandedOverlay copy prop",
  );

  source = source.replace(
    /(\n\s*)About(\n\s*<\/Typography>)/g,
    "$1{copy.label}$2",
  );
  source = replaceOnce(
    source,
    "              Your Technology Partner.",
    "              {copy.title}",
    "Bio expanded title",
  );
  source = replaceOnce(
    source,
    "            {BIO_SECTIONS.map((section, i) => (",
    "            {copy.sections.map((section, i) => (",
    "Bio expanded sections",
  );

  source = replaceOnce(
    source,
    "const BioTextCard = ({ subtitleVisible, paraVisible, onExpand }) => {",
    "const BioTextCard = ({ subtitleVisible, paraVisible, onExpand, copy }) => {",
    "BioTextCard copy prop",
  );
  source = replaceAllExpected(
    source,
    "SUBTITLE.split",
    "copy.subtitle.split",
    1,
    "Bio subtitle copy",
  );
  source = replaceAllExpected(
    source,
    "PARAGRAPH.split",
    "copy.paragraph.split",
    1,
    "Bio paragraph copy",
  );
  source = replaceOnce(
    source,
    "            Read more",
    "            {copy.readMoreLabel}",
    "Bio read-more label",
  );

  source = replaceOnce(
    source,
    "const BioSection = ({ isActive }) => {\n  const { isDark } = useThemeMode();",
    `const BioSection = ({
  isActive,
  audience = SITE_AUDIENCES.BUSINESS,
}) => {
  const { isDark } = useThemeMode();
  const copy = getSiteCopy(audience).bio;`,
    "BioSection audience setup",
  );

  source = source.replace(/\bTITLE\b/g, "copy.title");

  source = replaceOnce(
    source,
    '      aria-label="About"',
    "      aria-label={copy.sectionLabel}",
    "Bio section accessible label",
  );

  source = replaceOnce(
    source,
    "            <BioTextCard\n              subtitleVisible={subtitleVisible}",
    `            <BioTextCard
              copy={copy}
              subtitleVisible={subtitleVisible}`,
    "BioTextCard copy wiring",
  );

  source = replaceOnce(
    source,
    "            <BioExpandedOverlay\n              originRect={expandedOrigin}",
    `            <BioExpandedOverlay
              copy={copy}
              originRect={expandedOrigin}`,
    "Bio overlay copy wiring",
  );

  source = replaceOnce(
    source,
    "        <BioPhoto visible={sectionVisible} blurred={!!expandedOrigin} />",
    `        <BioPhoto
          visible={sectionVisible}
          blurred={!!expandedOrigin}
          photoAlt={copy.photoAlt}
        />`,
    "Bio photo copy wiring",
  );

  write(bioPath, source);
}

// src/components/InteractionAccessibilityBridge.js
{
  const bridgePath = "src/components/InteractionAccessibilityBridge.js";
  let source = read(bridgePath);

  source = replaceOnce(
    source,
    `          (dialogTitle === "Your Technology Partner."
            ? Array.from(enhancedTriggers.keys()).find(
                (trigger) => trigger.dataset.a11yCardTrigger === "biography",
              )
            : null);`,
    `          Array.from(enhancedTriggers.keys()).find(
            (trigger) => trigger.dataset.a11yCardTrigger === "biography",
          );`,
    "Biography focus fallback",
  );

  write(bridgePath, source);
}

// src/components/ServicesSection.js
{
  const servicesPath = "src/components/ServicesSection.js";
  let source = read(servicesPath);

  source = replaceOnce(
    source,
    'import ecommerceIcon from "../assets/icons/ecommerce.svg";',
    `import ecommerceIcon from "../assets/icons/ecommerce.svg";
import { SITE_AUDIENCES, getSiteCopy } from "../content/siteCopy";`,
    "ServicesSection copy import",
  );

  source = replaceOnce(
    source,
    /const SERVICES = \[[\s\S]*?\n\];\n\nconst CompactCard/,
    `const SERVICE_ICONS = Object.freeze({
  training: trainingIcon,
  software: seoIcon,
  integration: webdevIcon,
  ecommerce: ecommerceIcon,
});

const CompactCard`,
    "ServicesSection legacy service copy",
  );

  source = replaceOnce(
    source,
    "const ServicesSection = ({ isActive }) => {\n  const { isDark } = useThemeMode();",
    `const ServicesSection = ({
  isActive,
  audience = SITE_AUDIENCES.BUSINESS,
}) => {
  const { isDark } = useThemeMode();
  const sectionCopy = getSiteCopy(audience).services;
  const services = React.useMemo(
    () =>
      sectionCopy.cards.map((card) => ({
        ...card,
        icon: SERVICE_ICONS[card.id],
      })),
    [sectionCopy],
  );`,
    "ServicesSection audience setup",
  );

  source = replaceOnce(
    source,
    '  const titleContent = "AI & Software Solutions.";\n  const subtitleContent =\n    "Bridging the technology gap with personalized AI education and custom software development.";',
    `  const titleContent = sectionCopy.title;
  const subtitleContent = sectionCopy.subtitle;`,
    "ServicesSection heading copy",
  );

  source = replaceOnce(
    source,
    '      aria-label="Services"',
    "      aria-label={sectionCopy.sectionLabel}",
    "Services section accessible label",
  );
  source = replaceOnce(
    source,
    "                What I Do",
    "                {sectionCopy.label}",
    "Services section label",
  );
  source = replaceOnce(
    source,
    '                aria-label="AI & Software Solutions." /* Typewriter animates visually; label always exposes full text */',
    "                aria-label={titleContent} /* Typewriter animates visually; label always exposes full text */",
    "Services heading accessible text",
  );

  source = replaceAllExpected(
    source,
    "SERVICES.map",
    "services.map",
    1,
    "Services card list",
  );
  source = replaceOnce(
    source,
    "              svc={SERVICES[expandedIndex]}",
    "              svc={services[expandedIndex]}",
    "Expanded service copy",
  );

  source = replaceOnce(
    source,
    '{svc.id === "ecommerce" && (',
    "{svc.liveLink && (",
    "Service live-link condition",
  );
  source = replaceOnce(
    source,
    '                  href="https://shop.dyconcretepumps.com/"',
    "                  href={svc.liveLink.href}",
    "Service live-link URL",
  );
  source = replaceOnce(
    source,
    "                  View live example",
    "                  {svc.liveLink.label}",
    "Service live-link label",
  );

  source = replaceOnce(
    source,
    "                Get in touch for a quote",
    "                {sectionCopy.cta}",
    "Services CTA",
  );

  write(servicesPath, source);
}

// src/components/ContactSection.js
{
  const contactPath = "src/components/ContactSection.js";
  let source = read(contactPath);

  source = replaceOnce(
    source,
    'import logo from "../assets/icons/popcon_png.png";',
    `import logo from "../assets/icons/popcon_png.png";
import { SITE_AUDIENCES, getSiteCopy } from "../content/siteCopy";`,
    "ContactSection copy import",
  );

  source = replaceOnce(
    source,
    "const ContactSection = ({ isActive }) => {\n  const { isDark } = useThemeMode();",
