const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { deflateSync } = require('node:zlib');
const { createPublicMediaFetcher, parsePublicMediaUrl, isPublicAddress,
  MAX_HTML_BYTES, MAX_IMAGE_BYTES, MAX_ICON_BYTES } = require('../server/metabloomSourceMediaFetch');
const { createSourceMediaTokenCodec, createSourceMediaService, extractSourceMediaMetadata,
  validateSourceMediaImage, SOURCE_MEDIA_TTL_MS } = require('../server/metabloomSourceMedia');
const { createMetabloomSourceMediaHandler, sameOriginMediaRequest } = require('../api/metabloom-source-media');

const identity = { owner: 'a'.repeat(64), scope: 'b'.repeat(64) };
const clock = 1793000000000;
const sourceUrl = 'https://news.example.com/story';
const imageUrl = 'https://cdn.example.com/story.png';
const iconUrl = 'https://news.example.com/favicon.ico';
const secret = 'fixture-only-not-an-authentication-secret';
const makeCodec = options => createSourceMediaTokenCodec({ readSecret: async () => secret, now: () => clock, ...options });
const previewHtml = (image = imageUrl) => Buffer.from(`<html><head><meta property="og:type" content="article"><meta property="og:image" content="${image}"><meta property="og:image:alt" content="Publisher-provided description"><link rel="icon" href="/favicon.ico"></head><body>Article</body></html>`);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, bytes) {
  const name = Buffer.from(type), result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length); name.copy(result, 4); bytes.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, bytes])), result.length - 4);
  return result;
}
function png(width = 1, height = 1, padding = 0) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header)];
  if (padding) parts.push(pngChunk('tEXt', Buffer.alloc(padding)));
  parts.push(pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
function ico(image = png()) {
  const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 1; header[7] = 1; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}
const raster = png(), favicon = ico();
// Offline 2x3 pixel fixtures, generated once with Pillow. Tests need no image
// decoder dependency, external request, or dynamically generated assets.
const jpegFixture = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzyiiivdPFP//Z', 'base64');
const progressiveJpegFixture = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUAQEAAAAAAAAAAAAAAAAAAAAE/9oADAMBAAIQAxAAAAGdDhf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPv/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==', 'base64');
const webpFixtures = [
  'UklGRjgAAABXRUJQVlA4ICwAAADwAQCdASoCAAMAAUAmJaACdLoB+AAETAAA/vdZL/43ZCofbz/33oDeBgAAAA==',
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAAAdQo1IUr/+BiOh/AAA=',
  'UklGRloAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAgICAgICAAFZQOCAsAAAA8AEAnQEqAgADAAFAJiWgAnS6AfgABEwAAP73WS/+N2QqH28/996A3gYAAAA=',
].map(value => Buffer.from(value, 'base64'));

function fixtureNetwork(responder = () => ({ body: previewHtml(), type: 'text/html' }), { addresses = [{ address: '93.184.216.34', family: 4 }], remoteAddress = '93.184.216.34' } = {}) {
  const requests = [], resolutions = [];
  const lookup = async (host, options) => { resolutions.push({ host, options }); return typeof addresses === 'function' ? addresses(host, resolutions.length) : addresses; };
  const request = (options, callback) => {
    requests.push(options);
    const output = new EventEmitter(); output.destroyed = false;
    output.destroy = () => { output.destroyed = true; };
    output.end = () => {
      queueMicrotask(() => {
        const socket = new EventEmitter(); socket.remoteAddress = remoteAddress;
        output.emit('socket', socket); socket.emit('secureConnect');
        if (output.destroyed) return;
        const result = responder(options, requests.length);
        const response = Readable.from(result.chunks || [result.body || Buffer.alloc(0)]);
        response.statusCode = result.status || 200;
        response.headers = { 'content-type': result.type || 'text/html', ...(result.headers || {}) };
        callback(response);
      });
    };
    return output;
  };
  return { fetch: createPublicMediaFetcher({ lookup, request }), lookup, request, requests, resolutions };
}

test('capability is opaque, session/deployment-bound and expires within one hour', async () => {
  const codec = makeCodec();
  const token = await codec.create(identity, sourceUrl);
  assert.match(token, /^m1\.[A-Za-z0-9_-]+$/);
  assert.equal(token.includes('example'), false);
  assert.deepEqual(await codec.verify(identity, token), { url: sourceUrl, expiresAt: clock + SOURCE_MEDIA_TTL_MS });
  assert.equal(await codec.verify({ ...identity, owner: 'c'.repeat(64) }, token), null);
  assert.equal(await codec.verify({ ...identity, scope: 'c'.repeat(64) }, token), null);
  assert.equal(await codec.verify(identity, token, { now: clock + SOURCE_MEDIA_TTL_MS }), null);
  assert.equal(await codec.verify(identity, token, { now: clock - 30001 }), null);
  const changed = `${token.slice(0, 18)}${token[18] === 'a' ? 'b' : 'a'}${token.slice(19)}`;
  assert.equal(await codec.verify(identity, changed), null);
  assert.equal(await makeCodec({ readSecret: async () => `${secret}rotated` }).verify(identity, token), null);
  assert.equal(await codec.verify(identity, `${token}=`), null);
});

test('token minting is optional and does not require a visuals flag or subject field', async () => {
  const codec = makeCodec();
  assert.ok(await codec.create(identity, sourceUrl));
  for (const value of [undefined, {}, { owner: identity.owner }, { ...identity, owner: 'arbitrary' }]) assert.equal(await codec.create(value, sourceUrl), null);
  for (const url of ['http://news.example.com/story', 'https://localhost/story', 'https://127.0.0.1/story', 'https://user:secret@news.example.com/story', 'https:news.example.com/story']) {
    assert.equal(await codec.create(identity, url), null);
  }
  assert.equal(await makeCodec({ readSecret: async () => { throw new Error('Configuration unavailable'); } }).create(identity, sourceUrl), null);
  const longUrl = `${sourceUrl}?q=${'a'.repeat(1950)}`;
  const token = await codec.create(identity, longUrl);
  assert.ok(token && token.length < 4096);
  assert.equal((await codec.verify(identity, token)).url, longUrl);
});

test('rejects private, reserved, mapped, obscured, transition and local network URLs', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.255.1.1', '169.254.169.254', '172.16.1.2',
    '172.31.255.255', '192.168.1.1', '192.0.0.9', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8',
    '::ffff:7f00:1', '::8.8.8.8', 'fc00::1', 'fd00::1', 'fe80::1', 'fec0::1', 'ff02::1', '64:ff9b::7f00:1',
    '2001::1', '2001:db8::1', '2002:7f00:1::', '3ffe::1', '3fff::1', 'fe80::1%eth0']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true, address);
  for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://127.1/',
    'https://[::ffff:7f00:1]/', 'https://[::1]/', 'https://localhost./', 'https://metadata.internal/',
    'https://example.local/', 'https://example.com:8443/', 'https://example.com\\@127.0.0.1/', 'file:///etc/passwd',
    'data:image/png;base64,AAAA', 'https://example.com/\nsecret', 'https:example.com']) assert.equal(parsePublicMediaUrl(url), null, url);
  assert.equal(parsePublicMediaUrl('/photo.png', sourceUrl).href, 'https://news.example.com/photo.png');
  assert.equal(parsePublicMediaUrl('//cdn.example.com/photo.png', sourceUrl).href, 'https://cdn.example.com/photo.png');
});

test('DNS answers are all public and the actual TLS lookup is pinned', async () => {
  const network = fixtureNetwork();
  const result = await network.fetch(sourceUrl);
  assert.equal(result.url, sourceUrl);
  assert.equal(network.resolutions.length, 1);
  const options = network.requests[0];
  assert.equal(options.hostname, 'news.example.com');
  assert.equal(options.servername, 'news.example.com');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.port, 443);
  assert.deepEqual(await new Promise(resolve => options.lookup('news.example.com', {}, (error, address, family) => resolve([error, address, family]))), [null, '93.184.216.34', 4]);
  assert.deepEqual(await new Promise(resolve => options.lookup('news.example.com', { all: true }, (error, addresses) => resolve(addresses))), [{ address: '93.184.216.34', family: 4 }]);
  assert.equal(network.resolutions.length, 1, 'The connection must not perform a second DNS resolution');
  assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent']);
  for (const addresses of [[{ address: '127.0.0.1', family: 4 }], [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '::ffff:8.8.8.8', family: 6 }]]) {
    const blocked = fixtureNetwork(undefined, { addresses });
    await assert.rejects(blocked.fetch(sourceUrl), { code: 'source_media_target' });
    assert.equal(blocked.requests.length, 0);
  }
  const wrongSocket = fixtureNetwork(undefined, { remoteAddress: '127.0.0.1' });
  await assert.rejects(wrongSocket.fetch(sourceUrl), { code: 'source_media_target' });
});

test('redirects are bounded and revalidate every protocol, authority and DNS target', async () => {
  const network = fixtureNetwork((_options, count) => count === 1 ? { status: 302, headers: { location: 'https://redirect.example.com/article' } } : { body: previewHtml() });
  assert.equal((await network.fetch(sourceUrl)).url, 'https://redirect.example.com/article');
  assert.deepEqual(network.resolutions.map(value => value.host), ['news.example.com', 'redirect.example.com']);
  for (const destination of ['http://public.example.com/', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:password@public.example.com/', 'https://public.example.com:8080/']) {
    const unsafe = fixtureNetwork(() => ({ status: 302, headers: { location: destination } }));
    await assert.rejects(unsafe.fetch(sourceUrl)); assert.equal(unsafe.requests.length, 1);
  }
  const privateRedirect = fixtureNetwork((_options, count) => count === 1 ? { status: 307, headers: { location: 'https://redirect.example.com/article' } } : { body: previewHtml() },
    { addresses: host => [{ address: host.startsWith('redirect') ? '169.254.169.254' : '93.184.216.34', family: 4 }] });
  await assert.rejects(privateRedirect.fetch(sourceUrl)); assert.equal(privateRedirect.requests.length, 1);
  const loop = fixtureNetwork(() => ({ status: 301, headers: { location: sourceUrl } }));
  await assert.rejects(loop.fetch(sourceUrl)); assert.equal(loop.requests.length, 1);
  const endless = fixtureNetwork((_options, count) => ({ status: 302, headers: { location: `/redirect-${count}` } }));
  await assert.rejects(endless.fetch(sourceUrl)); assert.equal(endless.requests.length, 4);
});

test('network reader bounds bytes and rejects compressed, wrong-type and oversized image responses', async () => {
  const head = fixtureNetwork(() => ({ chunks: [previewHtml(), Buffer.alloc(MAX_HTML_BYTES * 2)], headers: { 'content-length': String(MAX_HTML_BYTES * 4) } }));
  assert.ok((await head.fetch(sourceUrl)).body.length < MAX_HTML_BYTES);
  const giantHead = fixtureNetwork(() => ({ body: Buffer.alloc(MAX_HTML_BYTES * 2, 32) }));
  assert.equal((await giantHead.fetch(sourceUrl)).body.length, MAX_HTML_BYTES);
  for (const fixture of [{ body: raster, type: 'text/html' }, { body: raster, type: 'image/svg+xml' },
    { body: raster, type: 'image/png', headers: { 'content-encoding': 'gzip' } },
    { body: raster, type: 'image/png', headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) } },
    { body: Buffer.alloc(MAX_IMAGE_BYTES + 1), type: 'image/png' }]) await assert.rejects(fixtureNetwork(() => fixture).fetch(imageUrl, { kind: 'image' }));
  await assert.rejects(fixtureNetwork(() => ({ body: Buffer.alloc(MAX_ICON_BYTES + 1), type: 'image/png' })).fetch(iconUrl, { kind: 'icon' }));
  const controller = new AbortController();
  const lookup = () => new Promise(() => {});
  let sent = false;
  const pending = createPublicMediaFetcher({ lookup, request: () => { sent = true; } })(sourceUrl, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending); assert.equal(sent, false);
});

test('metadata is taken from this article head, not scripts/comments, model URLs, base href or arbitrary body images', () => {
  const html = Buffer.from(`<html><head><title>Example &lt;meta&gt;</title>
    <!-- <meta property="og:image" content="https://bad.example.com/comment.png"> -->
    <script>const s = '<meta property="og:image" content="https://bad.example.com/script.png">';</script>
    <base href="https://bad.example.com/"><meta property="og:url" content="https://bad.example.com/rewritten">
    <meta property="og:type" content="article"><meta property="og:image" content="http://insecure.example.com/image.png">
    <meta property="og:image:secure_url" content="/photos/story.png?a=1&amp;b=2"><meta property="og:image:alt" content="A &quot;quoted&quot; description &#x1f4f7;">
    <link rel="shortcut icon" href="/brand.ico"></head><body><img src="https://bad.example.com/body.png"><meta property="og:image" content="https://bad.example.com/body-meta.png"></body></html>`);
  const value = extractSourceMediaMetadata(html, sourceUrl);
  assert.equal(value.isArticle, true);
  assert.deepEqual(value.images, [{ url: 'https://news.example.com/photos/story.png?a=1&b=2', alt: 'A "quoted" description 📷' }]);
  assert.deepEqual(value.icons.map(item => item.url), ['https://news.example.com/brand.ico', iconUrl]);
});

test('structured article media is supported without promoting an organization logo to an event photograph', () => {
  const metadata = extractSourceMediaMetadata(Buffer.from(`<head><script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'Organization', logo: 'https://cdn.example.com/logo.png', image: 'https://cdn.example.com/office.png' },
    { '@type': 'NewsArticle', url: sourceUrl, image: { url: imageUrl, caption: 'Source caption' } },
  ] })}</script></head>`), sourceUrl);
  assert.equal(metadata.isArticle, true); assert.deepEqual(metadata.images, [{ url: imageUrl, alt: 'Source caption' }]);
  const simple = extractSourceMediaMetadata(Buffer.from('<head><meta property="og:type" content="article"><meta name="twitter:image" content="/card.png"><meta name="twitter:image:alt" content="Source\u202e description"></head>'), sourceUrl);
  assert.equal(simple.isArticle, true); assert.equal(simple.images[0].alt, 'Source description');
  const unsafe = extractSourceMediaMetadata(Buffer.from('<head><meta property="og:image" content="https://127.0.0.1/a.png"><link rel="icon" href="data:image/svg+xml,evil"><link rel="icon" href="/icon.svg"></head>'), sourceUrl);
  assert.deepEqual(unsafe.images, []); assert.deepEqual(unsafe.icons.map(value => value.url), [iconUrl]);
});

test('related JSON-LD articles cannot classify this website or promote its social logo', () => {
  const home = 'https://news.example.com/';
  const article = { '@type': 'NewsArticle', url: 'https://news.example.com/unrelated-story', image: 'https://cdn.example.com/unrelated.jpg' };
  const html = Buffer.from(`<html><head><meta property="og:type" content="website"><meta property="og:image" content="/brand.png"><script type="application/ld+json">${JSON.stringify({ '@graph': [article] })}</script></head></html>`);
  const result = extractSourceMediaMetadata(html, home);
  assert.equal(result.isArticle, false); assert.deepEqual(result.images, []);
  const unbound = extractSourceMediaMetadata(Buffer.from(`<head><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', image: imageUrl })}</script></head>`), sourceUrl);
  assert.equal(unbound.isArticle, false); assert.deepEqual(unbound.images, []);
});

test('JSON-LD article identities must match the fetched page and contribute only their own image', () => {
  const parse = fields => extractSourceMediaMetadata(Buffer.from(`<head><meta property="og:type" content="website"><meta property="og:image" content="/brand.png"><meta name="twitter:image" content="/social-logo.png"><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', ...fields, image: imageUrl })}</script></head>`), sourceUrl);
  for (const fields of [{ url: sourceUrl }, { '@id': `${sourceUrl}#article` }, { mainEntityOfPage: sourceUrl },
    { mainEntityOfPage: { '@type': 'WebPage', '@id': sourceUrl } }, { url: sourceUrl, '@id': '#article', mainEntityOfPage: { url: sourceUrl } }]) {
    const result = parse(fields); assert.equal(result.isArticle, true);
    assert.deepEqual(result.images, [{ url: imageUrl, alt: '' }]);
  }
  for (const fields of [{ url: sourceUrl, '@id': 'https://news.example.com/other#article' },
    { url: sourceUrl, mainEntityOfPage: 'https://news.example.com/other' },
    { mainEntityOfPage: { '@id': sourceUrl, url: 'https://news.example.com/other' } },
    { url: `${sourceUrl}?different=1` }, { url: sourceUrl, '@id': 'javascript:alert(1)' },
    { url: sourceUrl, mainEntityOfPage: { name: 'Unidentified webpage' } }]) {
    const result = parse(fields); assert.equal(result.isArticle, false); assert.deepEqual(result.images, []);
  }
});

test('serves only bounded raster/ICO data with matching MIME, magic, structure and dimensions', () => {
  assert.deepEqual(validateSourceMediaImage(raster, 'image/png')?.width, 1);
  assert.equal(validateSourceMediaImage(favicon, 'image/x-icon', 'icon')?.type, 'image/vnd.microsoft.icon');
  for (const [body, type] of [[Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
    [raster, 'image/jpeg'], [raster, 'text/html'], [raster.subarray(0, 40), 'image/png'],
    [Buffer.concat([raster, Buffer.from('<script>bad</script>')]), 'image/png'], [favicon, 'image/x-icon'],
    [Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png']]) assert.equal(validateSourceMediaImage(body, type), null);
  const oversized = Buffer.from(raster); oversized.writeUInt32BE(100000, 16);
  assert.equal(validateSourceMediaImage(oversized, 'image/png'), null);
  const animated = Buffer.concat([raster.subarray(0, 33), pngChunk('acTL', Buffer.alloc(8)), raster.subarray(33)]);
  assert.equal(validateSourceMediaImage(animated, 'image/png'), null);
  const badIcon = Buffer.from(favicon); badIcon[6] = 255;
  assert.equal(validateSourceMediaImage(badIcon, 'image/x-icon', 'icon'), null);
  const overlapIcon = Buffer.from(favicon); overlapIcon.writeUInt32LE(6, 18);
  assert.equal(validateSourceMediaImage(overlapIcon, 'image/x-icon', 'icon'), null);
  const oversizedIcon = png(1025, 1);
  assert.equal(validateSourceMediaImage(oversizedIcon, 'image/png', 'icon'), null);
});

test('baseline/progressive JPEG and lossy/lossless/alpha WebP retain their real dimensions', () => {
  for (const value of [jpegFixture, progressiveJpegFixture]) {
    const parsed = validateSourceMediaImage(value, 'image/jpeg');
    assert.equal(parsed?.width, 2); assert.equal(parsed?.height, 3);
    assert.equal(validateSourceMediaImage(value.subarray(0, value.length - 2), 'image/jpeg'), null);
    assert.equal(validateSourceMediaImage(Buffer.concat([value, Buffer.from('<html>')]), 'image/jpeg'), null);
  }
  for (const value of webpFixtures) {
    const parsed = validateSourceMediaImage(value, 'image/webp');
    assert.equal(parsed?.width, 2); assert.equal(parsed?.height, 3);
    assert.equal(validateSourceMediaImage(value.subarray(0, value.length - 1), 'image/webp'), null);
  }
  const animatedWebp = Buffer.from(webpFixtures[2]); animatedWebp[20] |= 2;
  assert.equal(validateSourceMediaImage(animatedWebp, 'image/webp'), null);
  const hugeWebp = Buffer.from(webpFixtures[2]); hugeWebp.writeUIntLE(8192, 24, 3);
  assert.equal(validateSourceMediaImage(hugeWebp, 'image/webp'), null);
});

test('preview exposes only same-origin capabilities and reuses validated cached media', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl), calls = [];
  const fetchPublic = async (url, { kind }) => { calls.push({ url, kind });
    if (kind === 'html') return { url, body: previewHtml(), type: 'text/html' };
    return { url, body: kind === 'icon' ? favicon : raster, type: kind === 'icon' ? 'image/x-icon' : 'image/png' };
  };
  const service = createSourceMediaService({ codec, fetchPublic, now: () => clock });
  const result = await service.getPreview(identity, token);
  assert.equal(result.version, '1'); assert.equal(result.isArticle, true);
  assert.equal(result.image.alt, 'Publisher-provided description');
  assert.equal(new URL(result.image.src, 'https://app.example.com').origin, 'https://app.example.com');
  assert.equal(new URL(result.image.src, 'https://app.example.com').searchParams.get('token'), token);
  assert.equal(result.image.src.includes(imageUrl), false);
  assert.equal(result.icon.src.endsWith('&kind=icon'), true);
  assert.deepEqual((await service.getImage(identity, token)).body, raster);
  assert.deepEqual((await service.getIcon(identity, token)).body, favicon);
  assert.equal(calls.length, 3, 'Preview validates resources once and later image loads use the bounded cache');
  await assert.rejects(service.getPreview({ ...identity, owner: 'd'.repeat(64) }, token), { code: 'source_media_invalid' });
  assert.equal(calls.length, 3, 'A different session must not access even a cached preview');
});

test('missing, blocked and invalid imagery fail independently and never invent an image', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl), calls = [];
  const service = createSourceMediaService({ codec, fetchPublic: async (url, { kind }) => {
    calls.push({ url, kind });
    if (kind === 'html') return { url, body: previewHtml(), type: 'text/html' };
    if (kind === 'image') return { url, body: Buffer.from('<html>Not an image</html>'), type: 'image/png' };
    return { url, body: favicon, type: 'image/x-icon' };
  } });
  const preview = await service.getPreview(identity, token);
  assert.equal(preview.image, null); assert.ok(preview.icon); assert.equal(preview.isArticle, true);
  assert.deepEqual(calls.map(call => call.url).sort(), [sourceUrl, imageUrl, iconUrl].sort());
  const unavailable = createSourceMediaService({ codec, fetchPublic: async () => { throw new Error('Blocked'); } });
  assert.deepEqual(await unavailable.getPreview(identity, token), { version: '1', image: null, icon: null, isArticle: false });
  const fallback = createSourceMediaService({ codec, fetchPublic: async (url, { kind }) => {
    if (kind === 'html') throw new Error('Publisher HTML unavailable');
    assert.equal(url, iconUrl); return { body: favicon, type: 'image/x-icon', url };
  } });
  assert.ok((await fallback.getIcon(identity, token)).body);
});

test('a website social logo cannot become an article image, even via the direct image endpoint', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl), calls = [];
  const service = createSourceMediaService({ codec, fetchPublic: async (url, { kind }) => {
    calls.push(kind);
    if (kind === 'html') return { url, type: 'text/html', body: Buffer.from(`<head><meta property="og:type" content="website"><meta property="og:image" content="${imageUrl}"></head>`) };
    if (kind === 'image') throw new Error('A generic website image must never be requested');
    return { url, body: favicon, type: 'image/x-icon' };
  } });
  const preview = await service.getPreview(identity, token);
  assert.equal(preview.isArticle, false); assert.equal(preview.image, null); assert.ok(preview.icon);
  assert.equal(await service.getImage(identity, token), null);
  assert.deepEqual(calls, ['html', 'icon']);
});

test('refreshed non-article metadata denies a still-warm image cache entry', async () => {
  let current = clock, metadataCalls = 0, imageCalls = 0;
  const codec = makeCodec({ now: () => current }), token = await codec.create(identity, sourceUrl);
  const service = createSourceMediaService({ codec, now: () => current, fetchPublic: async (url, { kind }) => {
    if (kind === 'html') {
      metadataCalls++;
      return { url, type: 'text/html', body: metadataCalls === 1 ? previewHtml()
        : Buffer.from(`<head><meta property="og:type" content="website"><meta property="og:image" content="${imageUrl}"></head>`) };
    }
    imageCalls++; current += 1000;
    return { url, type: 'image/png', body: raster };
  } });
  assert.ok(await service.getImage(identity, token));
  current = clock + 600001; // Metadata expired, but its later image load has not.
  assert.equal(await service.getImage(identity, token), null);
  assert.equal(metadataCalls, 2); assert.equal(imageCalls, 1);
});

test('an unmounted progress icon cannot cancel the same source preview that remains mounted', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl), iconController = new AbortController();
  let finishMetadata, metadataSignal, metadataCalls = 0;
  const service = createSourceMediaService({ codec, fetchPublic: async (url, { kind, signal }) => {
    if (kind === 'html') {
      metadataCalls++; metadataSignal = signal;
      return new Promise((resolve, reject) => {
        finishMetadata = () => resolve({ url, type: 'text/html', body: previewHtml() });
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { code: 'source_media_cancelled' })), { once: true });
      });
    }
    return { url, type: kind === 'icon' ? 'image/x-icon' : 'image/png', body: kind === 'icon' ? favicon : raster };
  } });
  const icon = service.getIcon(identity, token, { signal: iconController.signal });
  const preview = service.getPreview(identity, token);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(metadataCalls, 1);
  iconController.abort();
  await assert.rejects(icon, { code: 'source_media_cancelled' });
  assert.equal(metadataSignal.aborted, false, 'The preview still owns an interest in this request');
  finishMetadata();
  const result = await preview;
  assert.ok(result.image); assert.ok(result.icon); assert.equal(metadataCalls, 1);
});

test('after the last caller cancels, a new caller can fetch the source again', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl), controller = new AbortController();
  let metadataCalls = 0, abandonedSignal;
  const service = createSourceMediaService({ codec, fetchPublic: async (url, { kind, signal }) => {
    if (kind === 'html') {
      metadataCalls++;
      if (metadataCalls === 1) {
        abandonedSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { code: 'source_media_cancelled' })), { once: true }));
      }
      return { url, type: 'text/html', body: previewHtml() };
    }
    return { url, type: kind === 'icon' ? 'image/x-icon' : 'image/png', body: kind === 'icon' ? favicon : raster };
  } });
  const first = service.getIcon(identity, token, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); await assert.rejects(first);
  assert.equal(abandonedSignal.aborted, true);
  const result = await service.getPreview(identity, token);
  assert.ok(result.image); assert.ok(result.icon); assert.equal(metadataCalls, 2);
});

test('concurrent loads are deduplicated and public fetching has a bounded concurrency', async () => {
  const codec = makeCodec();
  let active = 0, maximum = 0, calls = 0;
  const fetchPublic = async (url, { kind }) => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    return kind === 'html' ? { body: previewHtml(), type: 'text/html', url } : { body: kind === 'icon' ? favicon : raster, type: kind === 'icon' ? 'image/x-icon' : 'image/png', url };
  };
  const service = createSourceMediaService({ codec, fetchPublic, concurrency: 2 });
  const token = await codec.create(identity, sourceUrl);
  const same = await Promise.all(Array.from({ length: 8 }, () => service.getPreview(identity, token)));
  assert.equal(calls, 3); assert.ok(same.every(value => value.image && value.icon));
  const tokens = await Promise.all(Array.from({ length: 6 }, (_, index) => codec.create(identity, `${sourceUrl}/${index}`)));
  await Promise.all(tokens.map(value => service.getPreview(identity, value)));
  assert.ok(maximum <= 2); assert.equal(calls, 21);
});

test('cache expiration and its total byte limit prevent unbounded warm-instance storage', async () => {
  let current = clock;
  const codec = makeCodec({ now: () => current }), largePng = png(1, 1, 1024 * 1024), counts = new Map();
  const service = createSourceMediaService({ codec, now: () => current, fetchPublic: async (url, { kind }) => {
    if (kind === 'html') return { url, body: previewHtml(), type: 'text/html' };
    counts.set(url, (counts.get(url) || 0) + 1); return { url, body: largePng, type: 'image/png' };
  } });
  const tokens = await Promise.all(Array.from({ length: 20 }, (_, index) => codec.create(identity, `${sourceUrl}/${index}`)));
  for (const token of tokens) assert.ok(await service.getImage(identity, token));
  assert.equal(counts.get(imageUrl), 20);
  assert.ok(await service.getImage(identity, tokens[0]));
  assert.equal(counts.get(imageUrl), 21, 'An old >1MiB cached image must be evicted by the 16MiB budget');
  current += 600001;
  assert.ok(await service.getImage(identity, tokens[0])); assert.equal(counts.get(imageUrl), 22);
});

function response() {
  const value = new EventEmitter(); value.headers = {}; value.body = null; value.statusCode = 0;
  value.setHeader = (key, content) => { value.headers[key.toLowerCase()] = content; };
  value.end = body => { value.body = body; value.writableEnded = true; };
  return value;
}
const request = (token, kind = 'preview', changes = {}) => ({ method: 'GET',
  url: `/api/metabloom-source-media?token=${token}&kind=${kind}`,
  headers: { host: 'app.example.com', 'sec-fetch-site': 'same-origin' }, ...changes });
const authenticate = async (_request, { onIdentity }) => { onIdentity(identity); return null; };

test('GET endpoint requires a same-origin request and authenticated identity', async () => {
  const token = await makeCodec().create(identity, sourceUrl);
  let authenticated = 0, loaded = 0;
  const handler = createMetabloomSourceMediaHandler({ authenticate: async (req, options) => { authenticated++; return authenticate(req, options); },
    service: { getPreview: async () => { loaded++; return { version: '1', image: null, icon: null, isArticle: false }; } } });
  for (const site of ['cross-site', 'same-site', 'none', undefined]) {
    const res = response(); await handler(request(token, 'preview', { headers: { host: 'app.example.com', ...(site ? { 'sec-fetch-site': site } : {}) } }), res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(authenticated, 0); assert.equal(loaded, 0);
  assert.equal(sameOriginMediaRequest({ headers: { host: 'app.example.com', origin: 'https://app.example.com' } }), true);
  assert.equal(sameOriginMediaRequest({ headers: { host: 'app.example.com', origin: 'https://attacker.example.com', 'sec-fetch-site': 'same-origin' } }), false);
  const res = response(); await handler(request(token), res); assert.equal(res.statusCode, 200);
  assert.equal(authenticated, 1); assert.equal(loaded, 1);
  for (const denied of [{ status: 401 }, { status: 503 }, null]) {
    const blocked = createMetabloomSourceMediaHandler({ authenticate: async () => denied, service: { getPreview: async () => { throw new Error('Must not load'); } } });
    const result = response(); await blocked(request(token), result); assert.equal(result.statusCode, denied?.status || 401);
  }
});

test('endpoint accepts only its token+kind contract, never arbitrary URLs or duplicate query fields', async () => {
  const token = await makeCodec().create(identity, sourceUrl), handler = createMetabloomSourceMediaHandler({ authenticate,
    service: { getPreview: async () => { throw new Error('Should not load invalid query'); } } });
  for (const url of [`/api/metabloom-source-media?url=${sourceUrl}&kind=preview`, `/api/metabloom-source-media?token=${token}&kind=preview&url=${sourceUrl}`,
    `/api/metabloom-source-media?token=${token}&kind=preview&token=${token}`, `/api/metabloom-source-media?token=${token}&kind=script`,
    '/api/metabloom-source-media?token=bogus&kind=image']) {
    const res = response(); await handler(request(token, 'preview', { url }), res); assert.equal(res.statusCode, 400);
  }
  const post = response(); await handler(request(token, 'preview', { method: 'POST' }), post); assert.equal(post.statusCode, 405);
});

test('endpoint returns validated raster with private headers; invalid token or failed media cannot poison the chat', async () => {
  const codec = makeCodec(), token = await codec.create(identity, sourceUrl);
  const service = createSourceMediaService({ codec, fetchPublic: async (url, { kind }) => ({ url,
    body: kind === 'html' ? previewHtml() : raster, type: kind === 'html' ? 'text/html' : 'image/png' }) });
  const handler = createMetabloomSourceMediaHandler({ authenticate, service });
  const image = response(); await handler(request(token, 'image'), image);
  assert.equal(image.statusCode, 200); assert.equal(image.headers['content-type'], 'image/png'); assert.deepEqual(image.body, raster);
  assert.equal(image.headers['content-length'], raster.length);
  assert.equal(image.headers['cross-origin-resource-policy'], 'same-origin'); assert.equal(image.headers['x-content-type-options'], 'nosniff');
  assert.match(image.headers['cache-control'], /private, no-store/); assert.equal(image.headers['access-control-allow-origin'], undefined);
  const wrongToken = await codec.create({ ...identity, owner: 'd'.repeat(64) }, sourceUrl);
  const rejected = response(); await handler(request(wrongToken), rejected); assert.equal(rejected.statusCode, 404);
  const broken = createMetabloomSourceMediaHandler({ authenticate, service: { getPreview: async () => { throw new Error('Offline'); } } });
  const fallback = response(); await broken(request(token), fallback);
  assert.equal(fallback.statusCode, 200); assert.deepEqual(JSON.parse(fallback.body), { version: '1', image: null, icon: null, isArticle: false });
});
