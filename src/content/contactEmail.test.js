import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkPage from "../components/WorkPage";
import routeMetadata from "./routeMetadata.json";
import { PUBLIC_LINKS } from "./siteCopy";

const CORRECT_EMAIL = "shae@popcon.dev";
const INCORRECT_EMAIL = "shaw@popcon.dev";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("public contact email", () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  test("uses the corrected canonical mail link", () => {
    expect(PUBLIC_LINKS.email).toBe(`mailto:${CORRECT_EMAIL}`);
  });

  test("uses the corrected address in route metadata and public documents", () => {
    Object.values(routeMetadata).forEach((metadata) => {
      expect(metadata.noscript).not.toContain(INCORRECT_EMAIL);
      if (metadata.noscript.includes("@popcon.dev")) {
        expect(metadata.noscript).toContain(CORRECT_EMAIL);
      }
    });

    [
      "public/index.html",
      "README.md",
      "SECURITY.md",
      "docs/content/content-model.md",
    ].forEach((relativePath) => {
      const content = readRepositoryFile(relativePath);
      expect(content).not.toContain(INCORRECT_EMAIL);
      expect(content).toContain(CORRECT_EMAIL);
    });
  });

  test("renders only the corrected email on the work page", () => {
    document.head.innerHTML = `
      <title>Popular Consulting</title>
      <meta name="description" content="Home description" />
      <meta property="og:title" content="Home title" />
      <meta property="og:description" content="Home social description" />
      <meta property="og:url" content="https://popcon.dev/" />
      <link rel="canonical" href="https://popcon.dev/" />
    `;

    const { container } = render(<WorkPage />);
    const mailLinks = Array.from(container.querySelectorAll('a[href^="mailto:"]'));

    expect(mailLinks.length).toBeGreaterThan(0);
    mailLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", `mailto:${CORRECT_EMAIL}`);
    });
    expect(container).not.toHaveTextContent(INCORRECT_EMAIL);
  });
});
