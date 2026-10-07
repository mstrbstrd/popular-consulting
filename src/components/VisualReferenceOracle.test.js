const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REFERENCE_BLOB_SHA = Object.freeze({
  'DitherBackground.js': '56b3a16717a578bc9c1367dfbfc4e5bace107778',
  'blackHoleShader.js': '7d18804e3ad44d00b8842a14c5a2a51034eb0053',
});

const normalizeLineEndings = (value) =>
  value.replace(/\r\n?/g, '\n');

const gitBlobSha = (value) => {
  const normalized = normalizeLineEndings(value);
  const length = Buffer.byteLength(normalized, 'utf8');

  return crypto
    .createHash('sha1')
    .update(`blob ${length}\0`, 'utf8')
    .update(normalized, 'utf8')
    .digest('hex');
};

// The requested Login scene is additive. Remove only its four exact hooks,
// then verify every original scene and renderer byte against the UNCHANGED
// stage-zero oracle. This does not rebaseline or relax the existing graphics.
const withoutLoginExtension = (source) => {
  const additions = [
    'import { LOGIN_APERTURE_GLSL, LOGIN_PRESET } from "../utils/loginScene";\n',
    '  LOGIN_PRESET, // Login – Spectral aperture (reserved scene slot 6)\n',
    `\${LOGIN_APERTURE_GLSL}\n\n`,
    '  if(shape==8)return sceneLoginAperture(uv,t);\n',
  ];
  return additions.reduce((original, addition) => {
    expect(original.split(addition)).toHaveLength(2);
    return original.replace(addition, '');
  }, normalizeLineEndings(source));
};

// Exclude only the exact navigation reveal controls requested after Stage 0.
// Shader source, presets, initial reveal duration and the original oracle SHA
// remain unchanged. Transition behavior is tested in the state/scene suites.
const withoutNavigationExtension = (source) => {
  const replacements = [
    ["  const revealFromRef = useRef(0);\n  const revealDurationRef = useRef(2500);\n  const revealHiddenRef = useRef(false);\n  const revealHoldRef = useRef(false);\n",""],
    ["    const revealIn = ({ durationMs = 2500, fromCurrent = false } = {}) => {\n","    window.__ditherRevealIn = () => {\n"],
    ["      revealFromRef.current = fromCurrent ? revealRef.current : 0;\n      revealRef.current = revealFromRef.current;\n      revealHiddenRef.current = false;\n      revealDurationRef.current = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2500;\n","      revealRef.current = 0;\n"],
    ["    window.__ditherRevealIn = revealIn;\n",""],
    ["    const revealOut = (onComplete, { durationMs = 2500, fromCurrent = true, hold = false } = {}) => {\n","    window.__ditherRevealOut = (onComplete) => {\n"],
    ["      revealFromRef.current = fromCurrent ? revealRef.current : 1;\n      revealRef.current = revealFromRef.current;\n      revealHiddenRef.current = false;\n      revealHoldRef.current = hold;\n      revealDurationRef.current = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2500;\n",""],
    ["    window.__ditherRevealOut = revealOut;\n",""],
    ["      if (window.__ditherRevealIn === revealIn) window.__ditherRevealIn = null;\n      if (window.__ditherRevealOut === revealOut) window.__ditherRevealOut = null;\n","      window.__ditherRevealIn = null;\n      window.__ditherRevealOut = null;\n"],
    ["      const INTRO_DUR = revealDurationRef.current;\n","      const INTRO_DUR = 2500; // ms — ease-in-out over this window\n"],
    ["        revealRef.current = revealFromRef.current * (1 - easeInOutCubic(t));\n","        revealRef.current = 1 - easeInOutCubic(t);\n"],
    ["          revealHiddenRef.current = revealHoldRef.current;\n",""],
    ["      } else if (!revealHiddenRef.current) {\n","      } else {\n"],
    ["          revealRef.current = revealFromRef.current + (1 - revealFromRef.current) * easeInOutCubic(t);\n","          revealRef.current = easeInOutCubic(t);\n"],
  ];
  return replacements.reduce((original, [extension, reference]) => {
    expect(original.split(extension)).toHaveLength(2);
    return original.replace(extension, reference);
  }, normalizeLineEndings(source));
};

describe('reference visual oracle', () => {
  test.each(Object.entries(REFERENCE_BLOB_SHA))(
    'keeps the original %s byte-identical outside the exact Login and navigation extensions',
    (fileName, expectedSha) => {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/components', fileName),
        'utf8',
      );
      const original = fileName === 'DitherBackground.js'
        ? withoutLoginExtension(withoutNavigationExtension(source))
        : source;
      expect(gitBlobSha(original)).toBe(expectedSha);
    },
  );
});
