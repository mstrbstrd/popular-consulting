import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(__dirname, "../..");
const publicPath = (...segments) => path.join(repositoryRoot, "public", ...segments);

describe("Popular Consulting favicon branding", () => {
  test("uses the repository logo through a root-relative, cache-busted favicon URL", () => {
    const indexHtml = fs.readFileSync(publicPath("index.html"), "utf8");

    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="any" href="/logo2026.png?v=20260727" />',
    );
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(indexHtml).not.toMatch(/favicon\.ico|logo192\.png|logo512\.png/i);
    expect(fs.existsSync(publicPath("logo2026.png"))).toBe(true);
    expect(fs.existsSync(publicPath("favicon.ico"))).toBe(false);
  });

  test("removes Create React App branding from the web manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(publicPath("manifest.json"), "utf8"));

    expect(manifest.name).toBe("Popular Consulting");
    expect(manifest.short_name).toBe("Popular Consulting");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons).toEqual([
      {
        src: "/logo2026.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/React App|Create React App|favicon\.ico/i);
  });
});
