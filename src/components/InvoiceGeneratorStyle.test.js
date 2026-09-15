import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import postcss from "postcss";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const css = read("src/components/InvoiceGeneratorPage.css");
const shared = read("src/aetheris-site.css");
const workspace = css.slice(css.indexOf("/* Screen-only workspace."), css.indexOf("/* A separate paper system:"));
const hash = (text) => createHash("sha256").update(text).digest("hex");

describe("Invoice workspace Aetheris styling", () => {
  test("consumes real shared tokens rather than another interface palette", () => {
    const tokens = [...workspace.matchAll(/var\((--aetheris-[\w-]+)/g)].map((match) => match[1]);
    expect(tokens.length).toBeGreaterThan(25);
    [...new Set(tokens)].forEach((token) => expect(shared).toContain(`${token}:`));
    expect(workspace).toContain("--invoice-ink: var(--aetheris-ink)");
    expect(workspace).toContain("--invoice-muted: var(--aetheris-ink-2)");
    expect(workspace).toContain("--invoice-mono: var(--aetheris-font-mono)");
    expect(workspace).toContain("--invoice-sans: var(--aetheris-font-sans)");
  });

  test("keeps every workspace rule on screen and inside the invoice route", () => {
    postcss.parse(workspace).walkRules((rule) => {
      expect(rule.selector).toMatch(/\.invoice-/);
      let parent = rule.parent;
      while (parent && parent.type !== "atrule") parent = parent.parent;
      expect(parent?.name).toBe("media");
      expect(parent?.params).toMatch(/^screen\b/);
    });
    expect(workspace).not.toMatch(/@import|@keyframes|url\(|!important/);
    expect(workspace).not.toMatch(/background-clip:\s*text|animation\s*:/);
  });

  test("uses border-first glass, readable inputs and the shared focus treatment", () => {
    expect(workspace).toContain(".invoice-topbar::after");
    expect(workspace).toContain(".invoice-form > fieldset::before");
    expect(workspace).toContain(".invoice-total-card::before");
    expect(workspace).toContain("mask-composite: exclude");
    expect(workspace).toContain("pointer-events: none");
    expect(workspace).toContain("var(--aetheris-radius-glass)");
    expect(workspace).toContain("var(--aetheris-focus-halo)");
    expect(workspace).toContain("min-height: 44px");
    expect(workspace).toContain("min-height: 48px");
    expect(workspace).toContain("max-width: 1440px");
    expect(workspace).toContain("::file-selector-button");
  });

  test("retains motion, transparency, and system-color escape paths", () => {
    expect(workspace).toContain("prefers-reduced-motion: reduce");
    expect(workspace).toContain("prefers-reduced-transparency: reduce");
    expect(workspace).toContain("forced-colors: active");
    expect(workspace).toContain("outline: 2px solid Highlight");
    expect(workspace).toContain("transform: none");
    expect(workspace).toContain("transition: none");
    expect(workspace).toContain("backdrop-filter: none");
  });

  test("preserves the original paper and print definitions byte-for-byte", () => {
    const paper = css.slice(css.indexOf("/* A separate paper system:"), css.indexOf('@media (max-width: 600px)'));
    const print = css.slice(css.indexOf("/* Named page settings"));
    expect(hash(paper)).toBe("4e326bb165e0cc0a962e871534feee10ddff0c9159a3ca2291bb99d94a24fd54");
    expect(hash(print)).toBe("d121b4fd63ae9976dbf853fdeccf485982686d9ab61974d3e780f80a2ea988ef");
  });
});
