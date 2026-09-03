import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OrbPage, { ORB_SECTION_HREFS } from "./OrbPage";
import { SITE_AUDIENCES } from "../content/siteCopy";

let mockNavProps = null;

jest.mock("../contexts/ThemeContext", () => {
  const ReactModule = require("react");
  return {
    ThemeProvider: ({ children }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock("./NavMenu", () => {
  const ReactModule = require("react");
  return {
    __esModule: true,
    default: (props) => {
      mockNavProps = props;
      return ReactModule.createElement("nav", {
        "data-testid": "shared-navigation",
      });
    },
  };
});

jest.mock("./OrbSection", () => {
  const ReactModule = require("react");
  return {
    __esModule: true,
    default: ({ isActive }) =>
      ReactModule.createElement("section", {
        "data-testid": "orb-experience",
        "data-active": String(isActive),
      }),
  };
});

jest.mock("./LoadingOverlay", () => {
  const ReactModule = require("react");
  return {
    __esModule: true,
    default: ({ visible }) =>
      ReactModule.createElement("div", {
        "data-testid": "loading-overlay",
        "data-visible": String(visible),
      }),
  };
});

const resetDocument = () => {
  document.head.innerHTML = `
    <title>Initial title</title>
    <meta name="description" content="Initial description" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="https://popcon.dev/" />
    <meta property="og:title" content="Initial social title" />
    <meta property="og:description" content="Initial social description" />
    <meta property="og:url" content="https://popcon.dev/" />
    <meta name="twitter:title" content="Initial Twitter title" />
    <meta name="twitter:description" content="Initial Twitter description" />
  `;
  document.body.innerHTML = "";
};

describe("OrbPage", () => {
  beforeEach(() => {
    mockNavProps = null;
    resetDocument();
  });

  afterEach(() => {
    cleanup();
    window.__triggerLoading = null;
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  test("integrates Metabloom into the application shell with shared navigation", async () => {
    const { container, unmount } = render(<OrbPage />);

    expect(await screen.findByTestId("orb-experience")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("shared-navigation")).toBeInTheDocument();
    expect(mockNavProps).toMatchObject({
      audience: SITE_AUDIENCES.BUSINESS,
      alwaysVisible: true,
      homeHref: "/",
      sectionHrefs: ORB_SECTION_HREFS,
    });
    expect(
      screen.getByRole("main", { name: "Metabloom" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to Metabloom" }),
    ).toHaveAttribute("href", "#orb-main");
    expect(
      screen.getByRole("complementary", { name: "About Metabloom" }),
    ).toHaveTextContent("Popular Consulting / Interactive 01");
    expect(screen.getByText("Metabloom", { selector: "span" })).toBeInTheDocument();
    expect(
      screen.getByText(/Language becomes motion, expression, and colour/i),
    ).toBeInTheDocument();
    expect(container.querySelector(".orb-page__atmosphere")).toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__header"),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("2368822411");

    await waitFor(() => {
      expect(document.title).toBe("Metabloom Chat | Popular Consulting");
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex,follow",
      );
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://popular-consulting.com/orb",
      );
      expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
        "content",
        "Metabloom Chat | Popular Consulting",
      );
    });

    unmount();

    expect(document.title).toBe("Initial title");
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      "Initial description",
    );
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index,follow",
    );
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://popcon.dev/",
    );
    expect(window.__triggerLoading).toBeNull();
  });
});
