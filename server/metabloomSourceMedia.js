const { createHmac, createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { createPublicMediaFetcher, parsePublicMediaUrl, waitWithSignal, mediaError,
  MAX_IMAGE_BYTES, MAX_ICON_BYTES } = require('./metabloomSourceMediaFetch');

const SOURCE_MEDIA_VERSION = '1';
const SOURCE_MEDIA_TTL_MS = 60 * 60 * 1000;
const SOURCE_MEDIA_TIMEOUT_MS = 16000;
const MAX_SOURCE_MEDIA_TOKEN_CHARS = 4096;
const validIdentity = identity => identity && ['owner', 'scope'].every(key => typeof identity[key] === 'string'
  && /^[a-f0-9]{64}$/.test(identity[key]));
const readProductionSecret = async () => (await import('./auth-session.mjs')).readAuthConfig().redisToken;

// The source URL is observed by the research host before minting. Encryption
// keeps URLs and ownership digests out of the browser-visible capability token;
// GCM authenticates both the payload and the current session/deployment binding.
function createSourceMediaTokenCodec({ readSecret = readProductionSecret, now = Date.now } = {}) {
  const key = async () => {
    const secret = await readSecret();
    if (typeof secret !== 'string' || secret.length < 16) throw mediaError('source_media_unavailable');
    return createHmac('sha256', secret).update('popular-consulting:source-media:aes-gcm:v1').digest();
  };
  const binding = identity => Buffer.from(`source-media-v1\n${identity.scope}\n${identity.owner}`, 'utf8');
  return Object.freeze({
    async create(identity, sourceUrl, { now: issuedAt = now() } = {}) {
      try {
        const url = parsePublicMediaUrl(sourceUrl);
        if (!validIdentity(identity) || !url || !Number.isSafeInteger(issuedAt) || issuedAt < 0) return null;
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(), iv);
        cipher.setAAD(binding(identity));
        const payload = Buffer.from(JSON.stringify({ v: 1, iat: issuedAt, exp: issuedAt + SOURCE_MEDIA_TTL_MS, url: url.href }));
        const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
        const token = `m1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
        return token.length <= MAX_SOURCE_MEDIA_TOKEN_CHARS ? token : null;
      } catch { return null; }
    },
    async verify(identity, token, { now: checkedAt = now() } = {}) {
      try {
        if (!validIdentity(identity) || typeof token !== 'string' || token.length > MAX_SOURCE_MEDIA_TOKEN_CHARS
          || !/^m1\.[A-Za-z0-9_-]{60,}$/.test(token) || !Number.isSafeInteger(checkedAt)) return null;
        const bytes = Buffer.from(token.slice(3), 'base64url');
        if (bytes.toString('base64url') !== token.slice(3)) return null;
        const decipher = createDecipheriv('aes-256-gcm', await key(), bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        decipher.setAAD(binding(identity));
        const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
        if (!value || Object.keys(value).length !== 4 || value.v !== 1 || !Number.isSafeInteger(value.iat)
          || !Number.isSafeInteger(value.exp) || value.iat < 0 || value.iat > checkedAt + 30000
          || value.exp <= checkedAt || value.exp <= value.iat || value.exp - value.iat > SOURCE_MEDIA_TTL_MS) return null;
        const url = parsePublicMediaUrl(value.url);
        return url && url.href === value.url ? Object.freeze({ url: value.url, expiresAt: value.exp }) : null;
      } catch { return null; }
    },
  });
}

const productionCodec = createSourceMediaTokenCodec();
const createSourceMediaToken = (identity, url, options) => productionCodec.create(identity, url, options);

const entities = Object.freeze({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®' });
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? whole;
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  });
}
const metadataText = value => typeof value === 'string' ? decodeEntities(value)
  .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';

function attributes(tag) {
  const result = Object.create(null);
  const pattern = /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match, count = 0;
  while ((match = pattern.exec(tag)) && count++ < 40) {
    const name = match[1].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(result, name)) result[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

const articleTrackingQueryKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']);
function articlePageIdentity(url) {
  // Research citations commonly carry utm_source=openai while the publisher's
  // Article node names the same page without campaign tracking. Ignore only
  // these known keys for comparison; preserve every other raw query component,
  // its order and duplicates. This never rewrites a fetch or follows a canonical.
  const query = url.search.slice(1).split('&')
    .filter(part => !articleTrackingQueryKeys.has(part.split('=', 1)[0])).join('&');
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}

// This is a bounded metadata reader, not an HTML renderer. It ignores comments,
// script/style/noscript contents, body markup, base href, and canonical rewrites.
function extractSourceMediaMetadata(body, sourceUrl) {
  const source = parsePublicMediaUrl(sourceUrl);
  if (!source || !Buffer.isBuffer(body) || body.length > 524288) return null;
  const html = body.toString('utf8'), lower = html.toLowerCase();
  const ogImages = [], twitterImages = [], linkedImages = [], icons = [], articleImages = [];
  const brandImages = new Set(), brandReferences = new Set(), structuredImages = new Map();
  let cursor = 0, currentImage, twitterAlt = '', pageIsArticle = false, structuredIsArticle = false, count = 0;
  const addUrl = (list, raw, alt = '') => {
    const url = parsePublicMediaUrl(raw, source);
    if (url && !/\.svg(?:$|[?#])/i.test(url.href) && list.length < 4 && !list.some(item => item.url === url.href)) {
      list.push({ url: url.href, alt: metadataText(alt) });
    }
  };
  const articleTypes = new Set(['Article', 'NewsArticle', 'BlogPosting', 'Report', 'AnalysisNewsArticle',
    'OpinionNewsArticle', 'ReviewNewsArticle', 'BackgroundNewsArticle', 'ScholarlyArticle']);
  const assetIdentity = value => {
    const url = parsePublicMediaUrl(value, source);
    if (!url) return null;
    url.hash = '';
    return url.href;
  };
  const rememberLogo = value => {
    for (const entry of (Array.isArray(value) ? value : [value]).slice(0, 4)) {
      const raw = typeof entry === 'string' ? entry : entry?.contentUrl || entry?.url;
      const url = assetIdentity(raw);
      if (url && brandImages.size < 64) brandImages.add(url);
      const reference = entry && typeof entry === 'object' && parsePublicMediaUrl(entry['@id'], source);
      if (reference && brandReferences.size < 32) brandReferences.add(reference.href);
    }
  };
  const matchesPage = value => {
    const url = parsePublicMediaUrl(value, source);
    return url && articlePageIdentity(url) === articlePageIdentity(source);
  };
  const articleDescribesSource = node => {
    let identified = false;
    for (const key of ['url', '@id']) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      identified = true;
      if (typeof node[key] !== 'string' || !matchesPage(node[key])) return false;
    }
    if (Object.prototype.hasOwnProperty.call(node, 'mainEntityOfPage')) {
      const page = node.mainEntityOfPage;
      if (typeof page === 'string') {
        identified = true;
        if (!matchesPage(page)) return false;
      } else if (page && typeof page === 'object' && !Array.isArray(page)) {
        const keys = ['url', '@id'].filter(key => Object.prototype.hasOwnProperty.call(page, key));
        if (!keys.length || keys.some(key => typeof page[key] !== 'string' || !matchesPage(page[key]))) return false;
        identified = true;
      } else return false;
    }
    return identified;
  };
  const readStructuredArticle = value => {
    const pending = [value]; let visited = 0;
    while (pending.length && visited++ < 160) {
      const node = pending.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { pending.push(...node.slice(0, 40)); continue; }
      rememberLogo(node.logo);
      for (const publisher of (Array.isArray(node.publisher) ? node.publisher : [node.publisher]).slice(0, 4)) {
        if (publisher && typeof publisher === 'object') rememberLogo(publisher.logo);
      }
      const reference = parsePublicMediaUrl(node['@id'], source);
      if (reference && structuredImages.size < 160) structuredImages.set(reference.href, node);
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.some(type => typeof type === 'string' && articleTypes.has(type.replace(/^https?:\/\/schema\.org\//, '')))
        && articleDescribesSource(node)) {
        structuredIsArticle = true;
        for (const entry of (Array.isArray(node.image) ? node.image : [node.image]).slice(0, 4)) {
          if (typeof entry === 'string') addUrl(articleImages, entry);
          else if (entry && typeof entry === 'object') addUrl(articleImages, entry.contentUrl || entry.url, entry.description || entry.caption);
        }
      }
      // A graph/main entity may hold an article; never turn Organization.logo
      // or other incidental structured-data images into article imagery.
      for (const key of ['@graph', 'mainEntity']) if (node[key]) pending.push(node[key]);
    }
  };
  while (cursor < html.length && count++ < 2000) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4); if (end < 0) break;
      cursor = end + 3; continue;
    }
    let end = start + 1, quote = '';
    for (; end < html.length && end - start <= 8192; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length || end - start > 8192) break;
    const tag = html.slice(start + 1, end), name = tag.match(/^\s*(\/?[a-z][a-z0-9:-]*)\b/i)?.[1]?.toLowerCase();
    cursor = end + 1;
    if (name === '/head' || name === 'body') break;
    if (['script', 'style', 'noscript', 'template', 'title', 'textarea', 'xmp'].includes(name)) {
      const closing = lower.indexOf(`</${name}`, cursor);
      if (closing < 0) break;
      if (name === 'script' && attributes(tag).type?.toLowerCase() === 'application/ld+json' && closing - cursor <= 65536) {
        try { readStructuredArticle(JSON.parse(html.slice(cursor, closing))); } catch { /* Optional metadata. */ }
      }
      cursor = closing; continue;
    }
    if (name !== 'meta' && name !== 'link') continue;
    const attrs = attributes(tag);
    if (name === 'link') {
      const rels = String(attrs.rel || '').toLowerCase().split(/\s+/);
      if (rels.includes('icon') || rels.includes('apple-touch-icon')) addUrl(icons, attrs.href);
      if (rels.includes('image_src')) addUrl(linkedImages, attrs.href);
      continue;
    }
    const key = String(attrs.property || attrs.name || '').toLowerCase(), value = attrs.content;
    if (key === 'og:type' && typeof value === 'string' && value.toLowerCase().trim() === 'article') pageIsArticle = true;
    if (key === 'og:image' || key === 'og:image:url') {
      currentImage = { raw: value, alt: '' }; ogImages.push(currentImage);
      if (ogImages.length > 4) currentImage = null;
    } else if (key === 'og:image:secure_url' && currentImage && parsePublicMediaUrl(value, source)) currentImage.raw = value;
    else if (key === 'og:image:alt' && currentImage) currentImage.alt = metadataText(value);
    else if (key === 'twitter:image' || key === 'twitter:image:src') addUrl(twitterImages, value);
    else if (key === 'twitter:image:alt') twitterAlt = metadataText(value);
  }
  for (const reference of brandReferences) {
    const image = structuredImages.get(reference);
    if (image) rememberLogo(image);
  }
  const assetDirectory = value => {
    const url = parsePublicMediaUrl(value, source);
    return url && `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)}`;
  };
  const brandDirectories = new Set(icons.map(icon => assetDirectory(icon.url)));
  const genericShareName = /^(?:fb[-_]?share|(?:default[-_]?)?(?:og|social|share|facebook|twitter)(?:[-_]?(?:image|card|share))?|(?:default|placeholder|fallback)[-_]?(?:image|photo|thumbnail)|(?:site|station|publisher|brand)[-_]?(?:logo|image)|logo)(?:[-_](?:light|dark|\d+))?\.(?:png|jpe?g|webp)$/i;
  const isBrandShare = value => {
    const url = parsePublicMediaUrl(value, source);
    return url && brandDirectories.has(assetDirectory(url.href))
      && genericShareName.test(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
  };
  addUrl(icons, new URL('/favicon.ico', source).href);
  for (const icon of icons) brandImages.add(assetIdentity(icon.url));
  const images = [];
  const addArticleImage = (url, alt) => {
    if (!brandImages.has(assetIdentity(url)) && !isBrandShare(url)) addUrl(images, url, alt);
  };
  // A matching JSON-LD Article establishes only that node's own declared
  // imagery. It cannot promote a website's generic social logo to an event
  // photograph, nor can related/unidentified articles supply this page's media.
  // Prefer that article's imagery over a generic social fallback. Explicit
  // publisher logos and icons stay branding even on an og:type=article page.
  // A conventional social-share asset beside a declared site icon is also
  // branding; do not mistake it for the article's photo because its page is news.
  for (const value of articleImages) addArticleImage(value.url, value.alt);
  if (pageIsArticle) {
    for (const value of ogImages.slice(0, 4)) addArticleImage(value.raw, value.alt);
    for (const value of twitterImages) addArticleImage(value.url, twitterAlt);
  }
  if (pageIsArticle) for (const value of linkedImages) addArticleImage(value.url, value.alt);
  return { images: images.slice(0, 3), icons: icons.slice(0, 3), isArticle: pageIsArticle || structuredIsArticle };
}

function pngDimensions(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  let cursor = 8, dimensions = null, data = false;
  while (cursor + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(cursor), type = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || length > bytes.length - cursor - 12) return null;
    if (!dimensions) {
      if (type !== 'IHDR' || length !== 13) return null;
      const depth = bytes[cursor + 16], color = bytes[cursor + 17];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[cursor + 18] !== 0 || bytes[cursor + 19] !== 0 || bytes[cursor + 20] > 1) return null;
      dimensions = { width: bytes.readUInt32BE(cursor + 8), height: bytes.readUInt32BE(cursor + 12) };
    } else if (type === 'IHDR' || type === 'acTL') return null;
    if (type === 'IDAT') { if (!length) return null; data = true; }
    cursor += length + 12;
    if (type === 'IEND') return length === 0 && data && cursor === bytes.length ? dimensions : null;
  }
  return null;
}

function jpegDimensions(bytes) {
  if (bytes.length < 16 || bytes[0] !== 255 || bytes[1] !== 216) return null;
  let cursor = 2, dimensions = null, scanned = false, markers = 0;
  while (cursor < bytes.length && markers++ < 2048) {
    if (bytes[cursor++] !== 255) return null;
    while (bytes[cursor] === 255) cursor++;
    const marker = bytes[cursor++];
    if (marker === 217) return scanned && cursor === bytes.length ? dimensions : null;
    if (marker === 216 || marker === 0 || (marker >= 208 && marker <= 215) || cursor + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) return null;
    if ([192, 193, 194].includes(marker)) {
      if (dimensions || length < 11 || bytes[cursor + 2] !== 8 || ![1, 3, 4].includes(bytes[cursor + 7])
        || length !== 8 + 3 * bytes[cursor + 7]) return null;
      dimensions = { width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3) };
    } else if ((marker >= 195 && marker <= 207) && ![196, 200, 204].includes(marker)) return null;
    cursor += length;
    if (marker === 218) {
      if (!dimensions || length < 6) return null;
      scanned = true;
      while (cursor < bytes.length) {
        if (bytes[cursor] !== 255) { cursor++; continue; }
        const start = cursor++;
        while (bytes[cursor] === 255) cursor++;
        if (bytes[cursor] === 0 || (bytes[cursor] >= 208 && bytes[cursor] <= 215)) { cursor++; continue; }
        cursor = start; break;
      }
    }
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) !== bytes.length - 8) return null;
  let cursor = 12, canvas = null, dimensions = null;
  while (cursor + 8 <= bytes.length) {
    const type = bytes.toString('ascii', cursor, cursor + 4), length = bytes.readUInt32LE(cursor + 4);
    cursor += 8;
    if (length > bytes.length - cursor || ['ANIM', 'ANMF'].includes(type)) return null;
    if (type === 'VP8X') {
      if (canvas || dimensions || length !== 10 || (bytes[cursor] & 0xc3) !== 0
        || bytes[cursor + 1] || bytes[cursor + 2] || bytes[cursor + 3]) return null;
      canvas = { width: bytes.readUIntLE(cursor + 4, 3) + 1, height: bytes.readUIntLE(cursor + 7, 3) + 1 };
    } else if (type === 'VP8 ') {
      if (dimensions || length < 10 || (bytes[cursor] & 1) !== 0
        || bytes.toString('hex', cursor + 3, cursor + 6) !== '9d012a') return null;
      dimensions = { width: bytes.readUInt16LE(cursor + 6) & 16383, height: bytes.readUInt16LE(cursor + 8) & 16383 };
    } else if (type === 'VP8L') {
      if (dimensions || length < 5 || bytes[cursor] !== 47) return null;
      const bits = bytes.readUInt32LE(cursor + 1);
      if ((bits >>> 29) !== 0) return null;
      dimensions = { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 };
    }
    cursor += length + (length & 1);
  }
  return cursor === bytes.length && dimensions && (!canvas || (canvas.width === dimensions.width && canvas.height === dimensions.height))
    ? dimensions : null;
}

function icoDimensions(bytes) {
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null;
  const count = bytes.readUInt16LE(4), regions = [];
  if (!count || count > 16 || 6 + count * 16 > bytes.length) return null;
  let width = 0, height = 0, pixels = 0;
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16, w = bytes[entry] || 256, h = bytes[entry + 1] || 256;
    const size = bytes.readUInt32LE(entry + 8), offset = bytes.readUInt32LE(entry + 12);
    if (bytes[entry + 3] || !size || offset < 6 + count * 16 || size > bytes.length - offset) return null;
    regions.push([offset, offset + size]);
    const data = bytes.subarray(offset, offset + size), png = pngDimensions(data);
    if (png) { if (png.width !== w || png.height !== h) return null; }
    else {
      if (data.length < 40 || ![40, 108, 124].includes(data.readUInt32LE(0)) || data.readUInt32LE(0) > data.length
        || data.readInt32LE(4) !== w || data.readInt32LE(8) !== h * 2 || data.readUInt16LE(12) !== 1) return null;
      const bits = data.readUInt16LE(14), compression = data.readUInt32LE(16), colors = data.readUInt32LE(32);
      if (![1, 4, 8, 24, 32].includes(bits) || ![0, 3].includes(compression) || (compression === 3 && bits !== 32)
        || colors > (bits <= 8 ? 2 ** bits : 0)) return null;
      const palette = bits <= 8 ? (colors || 2 ** bits) * 4 : 0;
      const headers = data.readUInt32LE(0) + (compression === 3 && data.readUInt32LE(0) === 40 ? 12 : 0) + palette;
      const bitmap = Math.ceil(w * bits / 32) * 4 * h, mask = bits === 32 ? 0 : Math.ceil(w / 32) * 4 * h;
      if (headers + bitmap + mask > data.length) return null;
    }
    width = Math.max(width, w); height = Math.max(height, h); pixels += w * h;
  }
  regions.sort((left, right) => left[0] - right[0]);
  if (regions.some((entry, index) => index > 0 && entry[0] < regions[index - 1][1]) || pixels > 1048576
    || regions.at(-1)[1] !== bytes.length) return null;
  return { width, height };
}

function validateSourceMediaImage(body, type, kind = 'image') {
  try {
    if (!['image', 'icon'].includes(kind) || !Buffer.isBuffer(body) || !body.length
      || body.length > (kind === 'icon' ? MAX_ICON_BYTES : MAX_IMAGE_BYTES)) return null;
    const readers = { 'image/png': pngDimensions, 'image/jpeg': jpegDimensions, 'image/webp': webpDimensions,
      ...(kind === 'icon' ? { 'image/x-icon': icoDimensions, 'image/vnd.microsoft.icon': icoDimensions, 'image/ico': icoDimensions } : {}) };
    const dimensions = Object.prototype.hasOwnProperty.call(readers, type) ? readers[type](body) : null;
    const limit = kind === 'icon' ? 1024 : 8192, pixels = kind === 'icon' ? 1048576 : 16000000;
    if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width > limit || dimensions.height > limit
      || dimensions.width * dimensions.height > pixels) return null;
    return { body, type: ['image/ico', 'image/x-icon'].includes(type) ? 'image/vnd.microsoft.icon' : type, ...dimensions };
  } catch { return null; }
}

function boundedCache({ entries, bytes, now }) {
  const values = new Map(); let used = 0;
  const remove = key => { const value = values.get(key); if (value) used -= value.size; values.delete(key); };
  return {
    get(key) {
      const item = values.get(key);
      if (!item) return undefined;
      if (item.expiresAt <= now()) { remove(key); return undefined; }
      values.delete(key); values.set(key, item);
      return item.value;
    },
    set(key, value, size, ttl) {
      remove(key);
      if (size > bytes) return;
      while (values.size && (values.size >= entries || used + size > bytes)) remove(values.keys().next().value);
      values.set(key, { value, size, expiresAt: now() + ttl }); used += size;
    },
  };
}

function createGate(limit = 6, maxQueued = 24) {
  let active = 0; const queued = [];
  const release = () => {
    active--;
    while (queued.length && active < limit) {
      const next = queued.shift(); next.signal?.removeEventListener('abort', next.abort);
      if (next.signal?.aborted) { next.reject(mediaError('source_media_cancelled')); continue; }
      active++; next.resolve();
    }
  };
  return async (operation, signal) => {
    if (signal?.aborted) throw mediaError('source_media_cancelled');
    if (active < limit) active++;
    else {
      if (queued.length >= maxQueued) throw mediaError('source_media_busy');
      await new Promise((resolve, reject) => {
        const entry = { resolve, reject, signal };
        entry.abort = () => { const index = queued.indexOf(entry); if (index >= 0) queued.splice(index, 1); reject(mediaError('source_media_cancelled')); };
        signal?.addEventListener('abort', entry.abort, { once: true }); queued.push(entry);
      });
    }
    try { return await operation(); } finally { release(); }
  };
}

function createSourceMediaService({ fetchPublic = createPublicMediaFetcher(), codec = productionCodec, now = Date.now,
  concurrency = 6 } = {}) {
  const metadataCache = boundedCache({ entries: 128, bytes: 1048576, now });
  const assetCache = boundedCache({ entries: 64, bytes: 16777216, now });
  const pending = new Map(), gate = createGate(Math.max(1, Math.min(6, concurrency)));
  const memo = async (cache, key, load, signal, estimate) => {
    if (signal?.aborted) throw mediaError('source_media_cancelled');
    const cached = cache.get(key); if (cached !== undefined) return cached;
    let entry = pending.get(key);
    if (entry?.controller.signal.aborted) { pending.delete(key); entry = null; }
    if (!entry) {
      if (pending.size >= 64) throw mediaError('source_media_busy');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOURCE_MEDIA_TIMEOUT_MS); timer.unref?.();
      entry = { controller, waiters: 0, settled: false };
      entry.work = Promise.resolve().then(() => load(controller.signal)).then(value => {
        if (!controller.signal.aborted) cache.set(key, value, estimate(value), value ? 600000 : 30000);
        return value;
      }).finally(() => {
        entry.settled = true; clearTimeout(timer);
        if (pending.get(key) === entry) pending.delete(key);
      });
      pending.set(key, entry);
    }
    entry.waiters++;
    try { return await waitWithSignal(entry.work, signal); }
    finally {
      entry.waiters--;
      // A disappearing progress icon must not cancel the same article's newly
      // mounted card. Shared work ends once its last interested caller leaves.
      if (!entry.waiters && !entry.settled) entry.controller.abort();
    }
  };
  const loadMetadata = (url, signal) => memo(metadataCache, `metadata:${url}`, async workSignal => {
    try {
      const result = await gate(() => fetchPublic(url, { kind: 'html', signal: workSignal }), workSignal);
      return extractSourceMediaMetadata(result.body, result.url);
    } catch {
      if (workSignal.aborted) throw mediaError('source_media_cancelled');
      return null;
    }
  }, signal, value => value ? Buffer.byteLength(JSON.stringify(value)) : 8);
  const loadAsset = (url, kind, metadata, signal) => {
    // A site's generic social card/logo is not evidence of article imagery.
    // The same gate applies to direct image requests as to preview JSON.
    if (kind === 'image' && metadata?.isArticle !== true) return Promise.resolve(null);
    return memo(assetCache, `${kind}:${url}`, async workSignal => {
      const fallback = { url: new URL('/favicon.ico', url).href, alt: '' };
      const candidates = (kind === 'image' ? metadata?.images : metadata?.icons) || (kind === 'icon' ? [fallback] : []);
      for (const candidate of candidates.slice(0, 3)) {
        try {
          const result = await gate(() => fetchPublic(candidate.url, { kind, signal: workSignal }), workSignal);
          const value = validateSourceMediaImage(result.body, result.type, kind);
          if (value) return { ...value, alt: metadataText(candidate.alt) };
        } catch { if (workSignal.aborted) throw mediaError('source_media_cancelled'); }
      }
      return null;
    }, signal, value => value ? value.body.length + 512 : 8);
  };
  const run = async (identity, token, signal, operation) => {
    const capability = await codec.verify(identity, token);
    if (!capability) throw mediaError('source_media_invalid');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, SOURCE_MEDIA_TIMEOUT_MS); timer.unref?.();
    try { return await operation(capability.url, controller.signal); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); }
  };
  const endpoint = (token, kind) => `/api/metabloom-source-media?token=${encodeURIComponent(token)}&kind=${kind}`;
  return Object.freeze({
    async getPreview(identity, token, { signal } = {}) {
      return run(identity, token, signal, async (url, currentSignal) => {
        const metadata = await loadMetadata(url, currentSignal);
        const [image, icon] = await Promise.all([
          loadAsset(url, 'image', metadata, currentSignal).catch(() => null),
          loadAsset(url, 'icon', metadata, currentSignal).catch(() => null),
        ]);
        return { version: SOURCE_MEDIA_VERSION, image: image ? { src: endpoint(token, 'image'), alt: image.alt } : null,
          icon: icon ? { src: endpoint(token, 'icon') } : null, isArticle: metadata?.isArticle === true };
      });
    },
    async getImage(identity, token, { signal } = {}) {
      return run(identity, token, signal, async (url, currentSignal) => loadAsset(url, 'image', await loadMetadata(url, currentSignal), currentSignal));
    },
    async getIcon(identity, token, { signal } = {}) {
      return run(identity, token, signal, async (url, currentSignal) => loadAsset(url, 'icon', await loadMetadata(url, currentSignal), currentSignal));
    },
  });
}

module.exports = { SOURCE_MEDIA_VERSION, SOURCE_MEDIA_TTL_MS, SOURCE_MEDIA_TIMEOUT_MS, MAX_SOURCE_MEDIA_TOKEN_CHARS,
  createSourceMediaToken, createSourceMediaTokenCodec, createSourceMediaService, extractSourceMediaMetadata,
  validateSourceMediaImage };
