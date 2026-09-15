import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import postcss from "postcss";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const css = read("src/components/InvoiceGeneratorPage.css");
const shared = read("src/aetheris-site.css");
const marker = "/* Aetheris workspace polish.";
const workspace = css.slice(css.indexOf(marker));

describe("Invoice workspace Aetheris styling", () => {
  test("consumes real shared tokens instead of a parallel interface palette", () => {
    const tokens = [...workspace.matchAll(/var\((--aetheris-[\w-]+)/g)].map((match) => match[1]);
    expect(tokens.length).toBeGreaterThan(25);
    [...new Set(tokens)].forEach((token) => expect(shared).toContain(`${token}:`));
    expect(workspace).toContain("--invoice-ink: var(--aetheris-ink)");
    expect(workspace).toContain("--invoice-muted: var(--aetheris-ink-2)");
    expect(workspace).toContain("--invoice-mono: var(--aetheris-font-mono)");
    expect(workspace).toContain("--invoice-sans: var(--aetheris-font-sans)");
  });

  test("keeps every new rule screen-only and scoped to invoice classes", () => {
    postcss.parse(workspace).walkRules((rule) => {
      expect(rule.selector).toMatch(/\.invoice-/);
      let parent = rule.parent;
      while (parent && parent.type !== "atrule") parent = parent.parent;
      expect(parent?.name).toBe("media");
      expect(parent?.params).toMatch(/^screen\b/);
    });
    expect(workspace).not.toMatch(/@import|@keyframes|url\(|!important/);
    expect(workspace).not.toMatch(/background-clip:\s*text|animation\s*:/);
    expect(workspace).not.toMatch(/\.invoice-(?:paper|document-|preview-document|sr-only)/);
  });

  test("uses border-first glass, readable inputs and shared focus treatment", () => {
    expect(workspace).toContain(".invoice-topbar::after");
    expect(workspace).toContain(".invoice-actions::after");
    expect(workspace).toContain(".invoice-form > fieldset::before");
    expect(workspace).toContain("mask-composite: exclude");
    expect(workspace).toContain("pointer-events: none");
    expect(workspace).toContain("var(--aetheris-radius-glass)");
    expect(workspace).toContain("var(--aetheris-focus-halo)");
    expect(workspace).toContain("min-height: 48px");
    expect(workspace).toContain("max-width: 1440px");
    expect(workspace).toContain("::file-selector-button");
    expect(workspace).toContain(".invoice-form > fieldset > legend + * { clear: both; }");
  });

  test("respects motion, transparency and system-color preferences", () => {
    expect(workspace).toContain("prefers-reduced-motion: reduce");
    expect(workspace).toContain("prefers-reduced-transparency: reduce");
    expect(workspace).toContain("forced-colors: active");
    expect(workspace).toContain("outline: 2px solid Highlight");
    expect(workspace).toContain("transform: none");
    expect(workspace).toContain("transition: none");
    expect(workspace).toContain("backdrop-filter: none");
  });

  test("retains the current layout, mobile cards and print definitions intact", () => {
    // Snapshot the reconciled main stylesheet from PR #133, not the older
    // invoice prototype. Deliberate future layout edits must review this pin.
    const baseline = css.slice(0, css.indexOf(marker)).trimEnd() + "\n";
    const blob = `blob ${Buffer.byteLength(baseline)}\0${baseline}`;
    expect(createHash("sha1").update(blob).digest("hex"))
      .toBe("38dd83e758e5fc60eccf064f4eae4ff897c788cc");
  });
});
