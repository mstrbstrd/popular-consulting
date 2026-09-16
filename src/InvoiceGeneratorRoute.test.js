import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SiteRouter, { resolveSiteView, SITE_VIEWS } from "./SiteRouter";
import metadata from "./content/routeMetadata.json";

jest.mock("./utils/deviceTier", () => ({ hasHardwareWebGL: false }));
jest.mock("./components/AuthPage", () => () => <div data-testid="login-route">Sign in</div>);
jest.mock("./components/SectionDeepLinkBridge", () => ({ enabled }) => <div data-testid="invoice-deep-link" data-enabled={String(enabled)} />);
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test.each(["/invoice-generator", "/invoice-generator/", "/invoice-generator/index.html"])("resolves the private route at %s without importing its editor into the public app", async (pathname) => {
  expect(resolveSiteView(pathname)).toBe(SITE_VIEWS.INVOICE_GENERATOR);
  render(<SiteRouter pathname={pathname} />);
  expect(await screen.findByTestId("login-route")).toBeInTheDocument();
  expect(screen.getByTestId("invoice-deep-link")).toHaveAttribute("data-enabled", "false");
});

test("generates noindex HTML and places invoice rewrites before the catch-all", () => {
  expect(metadata.invoiceGenerator.robots).toBe("noindex,nofollow,noarchive");
  expect(read("scripts/generate-route-html.mjs")).toContain('writeRoute("invoiceGenerator", "invoice-generator")');
  const deployment = JSON.parse(read("vercel.json"));
  const index = deployment.rewrites.findIndex((rule) => rule.source === "/invoice-generator");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThan(deployment.rewrites.findIndex((rule) => rule.source.includes("?!static")));
  expect(deployment.rewrites[index].destination).toBe("/invoice-generator/index.html");
  for (const source of ["/invoice-generator", "/invoice-generator/:path*"]) {
    expect(deployment.headers.find((rule) => rule.source === source).headers).toEqual(expect.arrayContaining([
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Cache-Control", value: "no-store, max-age=0" },
    ]));
  }
});

test("only authorization-aware controls advertise the invoice generator", () => {
  expect(read("src/SiteRouter.js")).not.toContain('import("./components/InvoiceGeneratorPage")');
  expect(read("middleware.js")).toContain("protectInvoiceRequest");
  expect(read("src/components/AuthNavControl.js")).toContain("signedIn &&");
  const directory = path.join(process.cwd(), "src/components");
  fs.readdirSync(directory).filter((name) => name.endsWith(".js") && !name.includes(".test.") && !["InvoiceGeneratorPage.js", "AuthNavControl.js", "AuthPage.js"].includes(name)).forEach((name) => {
    expect(read(`src/components/${name}`)).not.toMatch(/href(?:=|:)\s*["']\/invoice-generator/);
  });
});

test("keeps client data out of HTML injection, networks and PDF CDN libraries", () => {
  const page = read("src/components/InvoiceGeneratorPage.js");
  expect(page).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|fetch\(|XMLHttpRequest|html2pdf|sendBeacon/);
  expect(page).toContain("<ThemeProvider enableBackground={false}>");
  const css = read("src/components/InvoiceGeneratorPage.css");
  expect(css).toContain("@page invoice");
  expect(css).toContain("break-inside: avoid");
  expect(css).toContain('.invoice-page[data-ready="false"] .invoice-paper { display: none; }');
});
