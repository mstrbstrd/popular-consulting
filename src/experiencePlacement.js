export const MAIN_APP_EXPERIENCE_PLACEMENT = Object.freeze({
  // Change this single value to true to restore the orb as the fifth section
  // of the normal immersive app. The dedicated /orb route remains available.
  orb: false,
});

const BASE_NAV_LINKS = Object.freeze([
  Object.freeze({ label: "About", section: 1 }),
  Object.freeze({ label: "Services", section: 2 }),
  Object.freeze({ label: "Contact", section: 3 }),
]);

export const buildMainAppExperiencePlan = ({
  orb = MAIN_APP_EXPERIENCE_PLACEMENT.orb,
} = {}) => {
  const navigationLinks = [...BASE_NAV_LINKS];

  if (orb) {
    navigationLinks.push({ label: "Orb", section: 4 });
  }

  navigationLinks.push({
    label: "Blog ↗",
    href: "https://www.popularconsumption.xyz/",
  });

  return {
    orbInMainApp: Boolean(orb),
    sectionLabels: orb
      ? ["Hero", "About", "Services", "Contact", "Interactive Orb"]
      : ["Hero", "About", "Services", "Contact"],
    navigationLinks,
  };
};

export const MAIN_APP_EXPERIENCE_PLAN = Object.freeze(
  buildMainAppExperiencePlan(),
);
