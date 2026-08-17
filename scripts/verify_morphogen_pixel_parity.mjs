import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [baselineUrl, currentUrl, outputDirectory] = process.argv.slice(2);
if (!baselineUrl || !currentUrl || !outputDirectory) {
  throw new Error(
    "Usage: node verify_morphogen_pixel_parity.mjs <baseline-url> <current-url> <output-directory>",
  );
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  throw new Error(`Chrome was not found. Checked: ${chromeCandidates.join(", ")}`);
}

fs.mkdirSync(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});

const capture = async (url, filename) => {
  const page = await browser.newPage();
  const severeMessages = [];
  page.on("console", (message) => {
    if (message.type() === "error") severeMessages.push(message.text());
  });
  page.on("pageerror", (error) => severeMessages.push(error.message));

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.evaluateOnNewDocument(() => {
    let state = 0x6d2b79f5;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  });

  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some(
      (button) => button.textContent?.includes("Morphogen Divide"),
    ),
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Morphogen Divide"),
    );
    if (!target) throw new Error("Morphogen Divide study control was not found.");
    target.click();
  });
  await page.waitForFunction(
    () => document.querySelector(".rupture-title")?.textContent?.includes(
      "Morphogen Divide",
    ),
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => {
      const shell = document.querySelector(".creatoros-field-shell");
      const canvas = document.querySelector(".creatoros-field-canvas");
      return Boolean(
        shell
          && canvas
          && !shell.classList.contains("is-fallback")
          && canvas.width > 1
          && canvas.height > 1,
      );
    },
    { timeout: 30000 },
  );

  await new Promise((resolve) => setTimeout(resolve, 900));
  const canvas = await page.$(".creatoros-field-canvas");
  if (!canvas) throw new Error("CreatorOS field canvas was not found.");

  const organismSelection = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Organism",
    );
    return button ? button.getAttribute("aria-pressed") : "baseline-no-selector";
  });
  if (organismSelection !== "baseline-no-selector" && organismSelection !== "true") {
    throw new Error(`Organism was not selected by default at ${url}.`);
  }

  const destination = path.join(outputDirectory, filename);
  await canvas.screenshot({ path: destination, type: "png" });
  await page.close();

  const meaningfulErrors = severeMessages.filter(
    (message) => !message.includes("favicon") && !message.includes("Failed to load resource"),
  );
  if (meaningfulErrors.length > 0) {
    throw new Error(`Browser errors at ${url}:\n${meaningfulErrors.join("\n")}`);
  }
  return destination;
};

try {
  const baselinePath = await capture(baselineUrl, "baseline.png");
  const currentPath = await capture(currentUrl, "current.png");
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));

  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(
      `Canvas dimensions differ: baseline ${baseline.width}x${baseline.height}, current ${current.width}x${current.height}.`,
    );
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const changedPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      includeAA: true,
      threshold: 0,
    },
  );
  fs.writeFileSync(path.join(outputDirectory, "diff.png"), PNG.sync.write(diff));

  const totalPixels = baseline.width * baseline.height;
  const changedRatio = changedPixels / totalPixels;
  console.log(
    `Morphogen parity: ${changedPixels}/${totalPixels} pixels changed (${(
      changedRatio * 100
    ).toFixed(6)}%).`,
  );
  if (changedPixels !== 0) {
    throw new Error(
      "The default Morphogen canvas is not pixel-identical to the pre-Sand-Paint baseline.",
    );
  }
} finally {
  await browser.close();
}
