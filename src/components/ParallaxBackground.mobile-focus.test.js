import fs from "fs";
import path from "path";
import { isContactTextEntryFocused } from "./ParallaxBackground";

describe("parallax contact focus boundary", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/ParallaxBackground.js"),
    "utf8",
  );

  test("detects only focused text-entry controls inside the contact form", () => {
    const input = document.createElement("input");
    const form = document.createElement("form");
    const contact = document.createElement("section");
    contact.id = "contact";
    form.appendChild(input);
    contact.appendChild(form);
    document.body.appendChild(contact);

    input.focus();
    expect(isContactTextEntryFocused(document)).toBe(true);

    input.blur();
    expect(isContactTextEntryFocused(document)).toBe(false);
    contact.remove();
  });

  test("blocks section navigation while a contact control owns focus", () => {
    expect(
      source.match(/isContactTextEntryFocused\(\)/g),
    ).toHaveLength(3);
    expect(source).toContain(
      'activeElement.closest?.("#contact form")',
    );
  });
});
