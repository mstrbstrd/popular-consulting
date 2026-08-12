import {
  PUBLIC_LINKS,
  SITE_AUDIENCES,
  getSiteCopy,
} from "./siteCopy";
import routeMetadata from "./routeMetadata.json";

describe("dual-audience public copy", () => {
  test("keeps business and engineering journeys distinct", () => {
    const business = getSiteCopy(SITE_AUDIENCES.BUSINESS);
    const engineering = getSiteCopy(SITE_AUDIENCES.ENGINEERING);

    expect(business.bio.title).toBe("Technology built around the business.");
    expect(engineering.bio.title).toBe("Hands-on engineering leadership.");
    expect(business.services.title).not.toBe(engineering.services.title);
    expect(business.contact.heading).not.toBe(engineering.contact.heading);
  });

  test("fails closed to business copy for unknown audiences", () => {
    expect(getSiteCopy("unknown")).toBe(
      getSiteCopy(SITE_AUDIENCES.BUSINESS),
    );
  });

  test("publishes the approved live storefront link", () => {
    expect(PUBLIC_LINKS.liveStorefront).toEqual({
      label: "Open live storefront",
      href: "https://shop.dyconcretepumps.com",
    });

    [SITE_AUDIENCES.BUSINESS, SITE_AUDIENCES.ENGINEERING].forEach(
      (audience) => {
        const commerce = getSiteCopy(audience).services.cards.find(
          (card) => card.id === "ecommerce",
        );
        expect(commerce.liveLink).toEqual(PUBLIC_LINKS.liveStorefront);
      },
    );
  });

  test("keeps AI copy inside source-of-truth and review boundaries", () => {
    const allCopy = JSON.stringify({
      business: getSiteCopy(SITE_AUDIENCES.BUSINESS),
      engineering: getSiteCopy(SITE_AUDIENCES.ENGINEERING),
    });

    expect(allCopy).toMatch(/source-of-truth/);
    expect(allCopy).toMatch(/review/i);
    expect(allCopy).toMatch(/failure/i);
  });

  test("avoids private phone data, unverified scale claims, and em dashes", () => {
    const allCopy = JSON.stringify({
      siteCopy: {
        business: getSiteCopy(SITE_AUDIENCES.BUSINESS),
        engineering: getSiteCopy(SITE_AUDIENCES.ENGINEERING),
      },
      routeMetadata,
    });

    expect(allCopy).not.toMatch(/236[\s-]?882[\s-]?2411/);
    expect(allCopy).not.toMatch(/10,?000/);
    expect(allCopy).not.toContain("—");
  });

  test("defines static metadata for every public route", () => {
    expect(Object.keys(routeMetadata).sort()).toEqual(
      ["ditherCanvas", "engineering", "game", "orb", "root", "work"].sort(),
    );

    Object.values(routeMetadata).forEach((metadata) => {
      expect(metadata.title).toBeTruthy();
      expect(metadata.description).toBeTruthy();
      expect(metadata.canonical).toMatch(/^https:\/\/popular-consulting\.com/);
      expect(metadata.robots).toMatch(/^(index|noindex),follow$/);
    });
  });
});
