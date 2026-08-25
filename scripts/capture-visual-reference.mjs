import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const repositoryRoot = process.cwd();
const buildRoot = path.join(repositoryRoot, 'build');
const DEFAULT_OUTPUT = path.join(
  repositoryRoot,
  'visual-reference',
);
const DEFAULT_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
});
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 15000;

const homeCase = (theme, section, label) => ({
  id: `${theme}-home-${label}`,
  route: '/',
  params: {
    'capture-theme': theme,
    'capture-section': section,
    'capture-time': 8,
    'capture-reveal': 1,
    'capture-settle-frames': theme === 'dark' ? 96 : 32,
  },
});

export const VISUAL_REFERENCE_CASES = Object.freeze([
  homeCase('light', 0, 'hero'),
  homeCase('light', 1, 'about'),
  homeCase('light', 2, 'services'),
  homeCase('light', 3, 'contact'),
  homeCase('dark', 0, 'hero'),
  homeCase('dark', 1, 'about'),
  homeCase('dark', 2, 'services'),
  homeCase('dark', 3, 'contact'),
  Object.freeze({
    id: 'light-hero-reveal-zero',
    route: '/',
    params: {
      'capture-theme': 'light',
      'capture-section': 0,
      'capture-time': 8,
      'capture-reveal': 0,
      'capture-settle-frames': 32,
    },
  }),
  Object.freeze({
    id: 'light-hero-reveal-half',
    route: '/',
    params: {
      'capture-theme': 'light',
      'capture-section': 0,
      'capture-time': 8,
      'capture-reveal': 0.5,
      'capture-settle-frames': 32,
    },
  }),
  Object.freeze({
    id: 'light-hero-ripple',
    route: '/',
    params: {
      'capture-theme': 'light',
      'capture-section': 0,
      'capture-time': 8,
      'capture-pointer': '0.72,0.42',
      'capture-ripple-age': 0.8,
      'capture-settle-frames': 32,
    },
  }),
  Object.freeze({
    id: 'orb-neutral',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-expression': 'neutral',
      'capture-expression-blend': 0,
      'capture-settle-frames': 40,
    },
  }),
  Object.freeze({
    id: 'orb-happy',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-expression': 'happy',
      'capture-expression-blend': 1,
      'capture-settle-frames': 40,
    },
  }),
  Object.freeze({
    id: 'orb-angry',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-expression': 'angry',
      'capture-expression-blend': 1,
      'capture-settle-frames': 40,
    },
  }),
  Object.freeze({
    id: 'orb-pop-midpoint',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-pop-phase': 0.55,
      'capture-settle-frames': 40,
      'capture-seed': 20260825,
    },
  }),
  Object.freeze({
    id: 'orb-reanimation-bubbles',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-pop-phase': 2.1,
      'capture-reanimation': 2,
      'capture-settle-frames': 40,
      'capture-seed': 20260825,
    },
  }),
  Object.freeze({
    id: 'orb-cd-stationary',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-cd-blend': 1,
      'capture-cd-angle': 1.25,
      'capture-settle-frames': 40,
    },
  }),
  Object.freeze({
    id: 'orb-cd-spinning',
    route: '/orb',
    params: {
      'capture-theme': 'light',
      'capture-section': 4,
      'capture-time': 9,
      'capture-cd-blend': 1,
      'capture-cd-spin': true,
      'capture-cd-angle': 4.2,
      'capture-settle-frames': 40,
    },
  }),
]);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const readArgument = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) =>
    argument.startsWith(prefix),
  );
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || null : null;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const existingPath = (candidate) =>
  candidate && fs.existsSync(candidate) ? candidate : null;

const findBrowser = () => {
  const explicit = existingPath(
    process.env.VISUAL_CAPTURE_BROWSER,
  );
  if (explicit) return explicit;

  const candidates = [
    path.join(
      process.env['PROGRAMFILES(X86)'] || '',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    path.join(
      process.env.PROGRAMFILES || '',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  return candidates.map(existingPath).find(Boolean) || null;
};

const routeHtmlPath = (pathname) => {
  const normalized = pathname.replace(/^\/+|\/+$/g, '');
  if (!normalized) return path.join(buildRoot, 'index.html');

  const generated = path.join(
    buildRoot,
    normalized,
    'index.html',
  );
  return fs.existsSync(generated)
    ? generated
    : path.join(buildRoot, 'index.html');
};

const safeFilePath = (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(buildRoot, relative);
  const relativeToBuild = path.relative(buildRoot, candidate);

  if (
    relativeToBuild.startsWith('..') ||
    path.isAbsolute(relativeToBuild)
  ) {
    return null;
  }

  return candidate;
};

const createBuildServer = () =>
  http.createServer((request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      'http://127.0.0.1',
    );
    const directPath = safeFilePath(requestUrl.pathname);
    let filePath = directPath;

    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      filePath = routeHtmlPath(requestUrl.pathname);
    }

    try {
      const body = fs.readFileSync(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type':
          contentTypes[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream',
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(`Build server failure: ${error.message}`);
    }
  });

const buildCaptureUrl = (origin, captureCase) => {
  const url = new URL(captureCase.route, origin);
  url.searchParams.set('graphics', 'webgl');
  url.searchParams.set('visual-runtime', 'reference');
  url.searchParams.set('visual-capture', 'reference');
  url.searchParams.set('capture-id', captureCase.id);
  url.searchParams.set('capture-frame-step', '50');
  url.searchParams.set('capture-ready-timeout', '30000');

  Object.entries(captureCase.params).forEach(([name, value]) => {
    url.searchParams.set(name, String(value));
  });

  return url.toString();
};

const extractCaptureReport = (documentHtml) => {
  const match = documentHtml.match(
    /<script id="visual-capture-report" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error(
      'The rendered document did not contain a visual capture report.',
    );
  }

  return JSON.parse(match[1]);
};

const runCaptureCase = async ({
  browserPath,
  captureCase,
  origin,
  outputDirectory,
  viewport,
}) => {
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'popcon-visual-reference-'),
  );
  const screenshotPath = path.join(
    outputDirectory,
    `${captureCase.id}.png`,
  );
  const reportPath = path.join(
    outputDirectory,
    `${captureCase.id}.json`,
  );
  const url = buildCaptureUrl(origin, captureCase);

  let stdout = '';

  try {
    const result = await new Promise((resolve, reject) => {
      execFile(
        browserPath,
        [
          '--headless=new',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-first-run',
          '--run-all-compositor-stages-before-draw',
          '--force-device-scale-factor=1',
          `--window-size=${viewport.width},${viewport.height}`,
          `--virtual-time-budget=${DEFAULT_VIRTUAL_TIME_BUDGET_MS}`,
          `--user-data-dir=${profileDirectory}`,
          `--screenshot=${screenshotPath}`,
          '--dump-dom',
          url,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
          timeout: 180000,
          windowsHide: true,
        },
        (error, commandStdout, commandStderr) => {
          if (error) {
            error.commandStderr = commandStderr;
            reject(error);
            return;
          }
          resolve({
            stdout: commandStdout || '',
          });
        },
      );
    });
    stdout = result.stdout;
  } catch (error) {
    throw new Error(
      `${captureCase.id}: browser failed: ${error.message}\n${error.commandStderr || ''}`,
    );
  } finally {
    fs.rmSync(profileDirectory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200,
    });
  }
  if (!fs.existsSync(screenshotPath)) {
    throw new Error(
      `${captureCase.id}: browser did not create a screenshot.`,
    );
  }

  const documentHtml = stdout;
  const report = extractCaptureReport(documentHtml);

  if (
    report.status !== 'ready' ||
    !documentHtml.includes(
      'data-visual-capture-ready="true"',
    )
  ) {
    throw new Error(
      `${captureCase.id}: capture did not become ready: ${report.error || report.status}`,
    );
  }
  if (report.expectedRenderer !== report.renderers.find(
    (renderer) =>
      renderer.rendererId === report.expectedRenderer &&
      renderer.drawCalls > 0,
  )?.rendererId) {
    throw new Error(
      `${captureCase.id}: expected renderer ${report.expectedRenderer} did not draw.`,
    );
  }

  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        id: captureCase.id,
        route: captureCase.route,
        url,
        viewport,
        report,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `Captured ${captureCase.id}: ${path.relative(
      repositoryRoot,
      screenshotPath,
    )}\n`,
  );

  return {
    id: captureCase.id,
    route: captureCase.route,
    screenshot: path.basename(screenshotPath),
    report: path.basename(reportPath),
    expectedRenderer: report.expectedRenderer,
  };
};

if (hasFlag('list')) {
  VISUAL_REFERENCE_CASES.forEach((captureCase) => {
    process.stdout.write(`${captureCase.id}\n`);
  });
  process.exit(0);
}

const selectedCaseId = readArgument('case');
const selectedCases = selectedCaseId
  ? VISUAL_REFERENCE_CASES.filter(
      (captureCase) => captureCase.id === selectedCaseId,
    )
  : [...VISUAL_REFERENCE_CASES];

if (selectedCases.length === 0) {
  throw new Error(
    `Unknown capture case: ${selectedCaseId}`,
  );
}

const browserPath = findBrowser();
if (!browserPath) {
  throw new Error(
    'A Chromium browser was not found. Set VISUAL_CAPTURE_BROWSER to an Edge, Chrome, or Chromium executable.',
  );
}

const outputDirectory = path.resolve(
  readArgument('output') || DEFAULT_OUTPUT,
);
fs.mkdirSync(outputDirectory, { recursive: true });

const explicitOrigin = readArgument('origin');
let server = null;
let origin = explicitOrigin;

if (!origin) {
  if (!fs.existsSync(path.join(buildRoot, 'index.html'))) {
    throw new Error(
      'Production build is missing. Run npm run build first.',
    );
  }

  server = createBuildServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Build server did not expose a TCP port.');
  }
  origin = `http://127.0.0.1:${address.port}`;
}

try {
  const captures = [];
  for (const captureCase of selectedCases) {
    captures.push(
      await runCaptureCase({
        browserPath,
        captureCase,
        origin,
        outputDirectory,
        viewport: DEFAULT_VIEWPORT,
      }),
    );
  }

  fs.writeFileSync(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        browserPath,
        origin,
        viewport: DEFAULT_VIEWPORT,
        captures,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}
