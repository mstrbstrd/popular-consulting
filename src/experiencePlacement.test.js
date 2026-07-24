import {
  buildMainAppExperiencePlan,
  MAIN_APP_EXPERIENCE_PLACEMENT,
} from "./experiencePlacement";

describe("main application experience placement", () => {
  test("keeps the orb route-only by default", () => {
    expect(MAIN_APP_EXPERIENCE_PLACEMENT.orb).toBe(false);

    const plan = buildMainAppExperiencePlan();

    expect(plan.orbInMainApp).toBe(false);
    expect(plan.sectionLabels).toEqual([
      "Hero",
      "About",
      "Services",
      "Contact",
    ]);
    expect(plan.navigationLinks.map(({ label }) => label)).not.toContain("Orb");
    expect(plan.navigationLinks.map(({ label }) => label)).not.toContain("Game");
  });

  test("restores the orb section and navigation through one configuration value", () => {
    const plan = buildMainAppExperiencePlan({ orb: true });

    expect(plan.orbInMainApp).toBe(true);
    expect(plan.sectionLabels).toEqual([
      "Hero",
      "About",
      "Services",
      "Contact",
      "Interactive Orb",
    ]);
    expect(plan.navigationLinks).toContainEqual({ label: "Orb", section: 4 });
    expect(plan.navigationLinks.map(({ label }) => label)).not.toContain("Game");
  });
});
