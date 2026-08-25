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

describe('reference visual oracle', () => {
  test.each(Object.entries(REFERENCE_BLOB_SHA))(
    'keeps %s byte-identical to the stage-zero oracle',
    (fileName, expectedSha) => {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/components', fileName),
        'utf8',
      );

      expect(gitBlobSha(source)).toBe(expectedSha);
    },
  );
});
