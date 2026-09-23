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
    '${LOGIN_APERTURE_GLSL}\n\n',
    '  if(shape==8)return sceneLoginAperture(uv,t);\n',
  ];
  return additions.reduce((original, addition) => {
    expect(original.split(addition)).toHaveLength(2);
    return original.replace(addition, '');
  }, normalizeLineEndings(source));
};

describe('reference visual oracle', () => {
  test.each(Object.entries(REFERENCE_BLOB_SHA))(
    'keeps the original %s byte-identical outside the additive Login hooks',
    (fileName, expectedSha) => {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/components', fileName),
        'utf8',
      );
      const original = fileName === 'DitherBackground.js'
        ? withoutLoginExtension(source)
        : source;
      expect(gitBlobSha(original)).toBe(expectedSha);
    },
  );
});
