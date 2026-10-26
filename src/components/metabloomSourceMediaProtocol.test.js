const { parseMetabloomProgressSource, parseMetabloomBriefMedia, metabloomSourceMediaUrl,
  parseMetabloomSourceMediaPreview, MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS } = require('./metabloomSourceMediaProtocol');

const token = 'signed_source.payload-1.signature_2';
const origin = 'https://chat.example.test';
const fixture = () => ({ version: '1', isArticle: true,
  image: { src: metabloomSourceMediaUrl(token, 'image'), alt: 'The publisher’s article photograph.' },
  icon: { src: metabloomSourceMediaUrl(token, 'icon') } });

test('canonicalizes an observed source URL and copies its opaque token without adding source fields', () => {
  expect(parseMetabloomProgressSource({ url: 'HTTPS://NEWS.EXAMPLE.TEST:443/article', token }))
    .toEqual({ url: 'https://news.example.test/article', token });
});

test.each([
  { url: 'https://name:secret@example.test/article', token },
  { url: 'https://example.test\\@attacker.test/article', token },
  { url: '//example.test/article', token },
  { url: 'data:text/plain,not-a-source', token },
  { url: 'https://example.test/article', token: 'untrusted/token' },
  { url: 'https://example.test/article', token: 'untrusted token' },
  { url: 'https://example.test/article', token: 'x'.repeat(MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS + 1) },
  { url: 'https://example.test/article', token, image: 'https://attacker.test/photo.jpg' },
])('ignores unsafe progress-source decoration: %j', value => {
  expect(parseMetabloomProgressSource(value)).toBeNull();
});

test('keeps only bounded unique media references to sources actually used by an item', () => {
  const value = [{ sourceId: 1, token }, { sourceId: 1, token: 'duplicate.id' },
    { sourceId: 2, token }, { sourceId: 2, token: 'second.source' },
    { sourceId: 99, token: 'unrelated.source' }, { sourceId: 3, token: 'bad/token' }];
  const parsed = parseMetabloomBriefMedia(value, { sourceIds: new Set([1, 2, 3]) });
  expect(parsed).toEqual([{ sourceId: 1, token }, { sourceId: 2, token: 'second.source' }]);
  value[0].token = 'changed';
  expect(parsed[0].token).toBe(token);
  expect(parseMetabloomBriefMedia(Array(11).fill({ sourceId: 1, token }), { sourceIds: [1] })).toEqual([]);
});

test('accepts only this token’s authenticated media endpoints and normalizes absolute local URLs', () => {
  const value = fixture();
  value.image.src = `${origin}${value.image.src}`;
  expect(parseMetabloomSourceMediaPreview(value, { token, origin })).toEqual(fixture());
  expect(parseMetabloomSourceMediaPreview({ version: '1', isArticle: false, image: null, icon: null }, { token, origin }))
    .toEqual({ version: '1', isArticle: false, image: null, icon: null });
});

test.each([
  ['remote image', value => { value.image.src = 'https://publisher.example.test/photo.jpg'; }],
  ['remote same-path image', value => { value.image.src = `https://attacker.test${value.image.src}`; }],
  ['another token', value => { value.image.src = metabloomSourceMediaUrl('another.token', 'image'); }],
  ['another media kind', value => { value.image.src = metabloomSourceMediaUrl(token, 'icon'); }],
  ['extra query parameter', value => { value.image.src += '&url=https://attacker.test/photo'; }],
  ['duplicate token', value => { value.image.src += `&token=${token}`; }],
  ['fragment', value => { value.image.src += '#image'; }],
  ['arbitrary icon', value => { value.icon.src = '/favicon.ico'; }],
  ['HTML response field', value => { value.html = '<img src="https://attacker.test">'; }],
  ['unsupported version', value => { value.version = '2'; }],
  ['unverified article image', value => { value.isArticle = false; }],
  ['unbounded alternate text', value => { value.image.alt = 'x'.repeat(513); }],
  ['hidden alternate-text control', value => { value.image.alt = 'A\u202ephoto'; }],
])('rejects %s before any image can mount', (_, change) => {
  const value = fixture(); change(value);
  expect(parseMetabloomSourceMediaPreview(value, { token, origin })).toBeNull();
});
