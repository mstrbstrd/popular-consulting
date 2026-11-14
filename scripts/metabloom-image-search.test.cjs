const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_IMAGE_API_BYTES, findMetabloomImage } = require('../server/metabloomImageSearch');

const json = (value, { type = 'application/json; charset=utf-8', status = 200 } = {}) =>
  new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers: { 'content-type': type } });
const searchResult = pages => ({ query: { pages } });
const page = (overrides = {}) => ({ pageid: 1, ns: 0, title: 'Fictional Singer', index: 1,
  fullurl: 'https://en.wikipedia.org/wiki/Fictional_Singer', pageimage: 'Fictional_Singer_2024.jpg',
  thumbnail: { source: 'https://upload.wikimedia.org/x/thumb.jpg', width: 640, height: 960 }, ...overrides });
const imageInfo = (overrides = {}, meta = {}) => ({ query: { pages: [{ title: 'File:Fictional_Singer_2024.jpg', imageinfo: [{
  thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fictional_Singer_2024.jpg/640px-Fictional_Singer_2024.jpg',
  thumbwidth: 640, thumbheight: 960, mime: 'image/jpeg',
  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Fictional_Singer_2024.jpg',
  extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
    Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Example">Example&nbsp;Photographer</a>' },
    ImageDescription: { value: '<p>Fictional Singer performing in 2024</p>' }, ...meta },
  ...overrides }] }] } });
const fixture = (search, info = imageInfo()) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return calls.length === 1 ? json(search) : json(info);
  };
  return { calls, fetchImpl };
};

test('selects the top free lead image and returns complete attribution without trusting markup', async () => {
  const { calls, fetchImpl } = fixture(searchResult([
    page({ index: 2, title: 'Other page', pageimage: 'Other.jpg' }),
    page({ index: 0, title: 'Fictional Singer (disambiguation)', pageprops: { disambiguation: '' } }),
    page({ index: 1 }),
  ]));
  const image = await findMetabloomImage('  Fictional\u0000 Singer ', { fetchImpl });
  assert.deepEqual(image, { found: true, title: 'Fictional Singer', pageUrl: 'https://en.wikipedia.org/wiki/Fictional_Singer',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fictional_Singer_2024.jpg/640px-Fictional_Singer_2024.jpg',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Fictional_Singer_2024.jpg', width: 640, height: 960,
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', artist: 'Example Photographer',
    alt: 'Fictional Singer performing in 2024', source: 'Wikimedia Commons' });
  assert.ok(Object.isFrozen(image));
  assert.equal(calls.length, 2);
  const [search, meta] = calls;
  assert.equal(search.url.origin + search.url.pathname, 'https://en.wikipedia.org/w/api.php');
  assert.equal(search.url.searchParams.get('gsrsearch'), 'Fictional Singer');
  assert.equal(search.url.searchParams.get('pilicense'), 'free', 'Only freely licensed lead images are eligible');
  assert.equal(meta.url.searchParams.get('titles'), 'File:Fictional_Singer_2024.jpg');
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.match(call.options.headers['User-Agent'], /^Mozilla\/5\.0 \(compatible; PopularConsultingPreview\/1\.1; \+https:\/\/popular-consulting\.com\/\)$/);
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test('accepts the current thumb.wikimedia.org response shape and canonicalizes it to the upload origin', async () => {
  // Shape observed from the live API in November 2026 (Rome's lead image).
  const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/960px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg';
  const { fetchImpl } = fixture(searchResult([
    page({ title: 'Rome', fullurl: 'https://en.wikipedia.org/wiki/Rome', pageimage: 'Trevi_Fountain,_Rome,_Italy_2_-_May_2007.jpg',
      thumbnail: { source: `${thumb}?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail`, width: 960, height: 638 } }),
    { pageid: 2, ns: 0, title: 'Rome (disambiguation)', index: 3, fullurl: 'https://en.wikipedia.org/wiki/Rome_(disambiguation)', pageprops: { disambiguation: '' } },
  ]), imageInfo({ thumburl: `${thumb}?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=thumbnail`,
    thumbwidth: 960, thumbheight: 638,
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=original',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Trevi_Fountain,_Rome,_Italy_2_-_May_2007.jpg?utm_source=x' },
  { LicenseShortName: { value: 'CC BY 3.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' },
    Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Diliff" title="User:Diliff">Diliff</a>' },
    Credit: { value: '<span class="int-own-work" lang="en">Own work</span>' }, ImageDescription: undefined }));
  const image = await findMetabloomImage('Rome', { fetchImpl });
  assert.equal(image.found, true);
  assert.equal(image.imageUrl, thumb.replace('https://thumb.', 'https://upload.'));
  assert.equal(image.fileUrl, 'https://commons.wikimedia.org/wiki/File:Trevi_Fountain,_Rome,_Italy_2_-_May_2007.jpg');
  assert.equal(image.artist, 'Diliff');
  assert.equal(image.license, 'CC BY 3.0');
  assert.deepEqual([image.width, image.height], [960, 638]);
});

test('reports no image instead of guessing when the subject has no usable free photo', async () => {
  const cases = [
    [searchResult([])],
    [searchResult([page({ pageimage: undefined, thumbnail: undefined })])],
    [searchResult([page({ pageprops: { disambiguation: '' } })])],
    [searchResult([page({ pageimage: 'Fictional_logo.svg' })])],
    [searchResult([page({ pageimage: 'Fictional.gif' })])],
    [searchResult([page({ fullurl: 'https://wiki.example.test/Fictional_Singer' })])],
    [searchResult([page()]), imageInfo({ thumburl: 'https://cdn.example.test/a.jpg' })],
    [searchResult([page()]), imageInfo({ thumburl: 'http://upload.wikimedia.org/a.jpg' })],
    [searchResult([page()]), imageInfo({ thumburl: 'https://thumb.wikimedia.org/a.jpg' })],
    [searchResult([page()]), imageInfo({ thumburl: 'https://commons.wikimedia.org/wikipedia/commons/a.jpg' })],
    [searchResult([page()]), imageInfo({ thumburl: 'https://thumb.wikimedia.org.example.test/wikipedia/commons/a.jpg' })],
    [searchResult([page()]), imageInfo({ descriptionurl: 'https://files.example.test/a' })],
    [searchResult([page()]), imageInfo({ mime: 'image/svg+xml' })],
    [searchResult([page()]), imageInfo({ thumbwidth: 20 })],
    [searchResult([page()]), imageInfo({}, { LicenseShortName: { value: '' } })],
    [searchResult([page()]), imageInfo({}, { Artist: { value: '<span></span>' }, Credit: undefined })],
  ];
  for (const [search, info] of cases) {
    const { fetchImpl } = fixture(search, info);
    assert.deepEqual(await findMetabloomImage('Fictional Singer', { fetchImpl }), { found: false });
  }
});

test('falls back to the credit line and rejects unsafe licence links', async () => {
  const { fetchImpl } = fixture(searchResult([page()]), imageInfo({}, { Artist: undefined,
    Credit: { value: 'Own work by <b>Example</b>' }, LicenseUrl: { value: 'javascript:alert(1)' } }));
  const image = await findMetabloomImage('Fictional Singer', { fetchImpl });
  assert.equal(image.artist, 'Own work by Example');
  assert.equal(image.licenseUrl, null);
});

test('API failures are bounded and typed, and cancellation stays a cancellation', async () => {
  const failures = [
    async () => json({ error: 'unavailable' }, { status: 503 }),
    async () => json('<html></html>', { type: 'text/html' }),
    async () => json('{not json'),
    async () => json('x'.repeat(MAX_IMAGE_API_BYTES + 1)),
    async () => { throw new TypeError('network down'); },
  ];
  for (const fetchImpl of failures) {
    await assert.rejects(findMetabloomImage('Fictional Singer', { fetchImpl }), { code: 'image_search_unavailable' });
  }
  await assert.rejects(findMetabloomImage('   ', { fetchImpl: failures[0] }), { code: 'image_search_unavailable' });
  const controller = new AbortController();
  const pending = findMetabloomImage('Fictional Singer', { signal: controller.signal, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
  }) });
  controller.abort(new DOMException('Stopped', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
});
