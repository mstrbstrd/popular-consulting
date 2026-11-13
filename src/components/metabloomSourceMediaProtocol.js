const { parseMetabloomResearchSources } = require('./metabloomResearchSources');

const METABLOOM_SOURCE_MEDIA_ENDPOINT = '/api/metabloom-source-media';
const MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS = 4096;
const MAX_METABLOOM_SOURCE_MEDIA_ENTRIES = 10;
// Ordinary search answers show a short row of images for their first citations.
const MAX_METABLOOM_TOOL_MEDIA_ENTRIES = 4;
const MAX_METABLOOM_SOURCE_MEDIA_ALT_CHARS = 512;
const MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES = 16384;
// Reject invisible controls at the protocol boundary, before a URL or label renders.
// eslint-disable-next-line no-control-regex
const unsafeUrlCharacters = /[\\\u0000-\u0020\u007f]/;
// eslint-disable-next-line no-control-regex
const unsafeAltCharacters = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const parseMetabloomSourceMediaToken = value => typeof value === 'string' && value.length > 0
  && value.length <= MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS && /^[A-Za-z0-9_.-]+$/.test(value) ? value : null;

// Tokens are opaque here. Only the authenticated server verifies their owner,
// expiry and canonical URL; the browser never decodes them or accepts image URLs.
const parseMetabloomProgressSource = value => {
  if (!exactKeys(value, ['url', 'token'])) return null;
  const token = parseMetabloomSourceMediaToken(value.token);
  const parsed = token && parseMetabloomResearchSources([{ id: 1, title: 'Research source', url: value.url }]);
  return parsed ? { url: parsed[0].url, token } : null;
};

// Optional decoration cannot invalidate a completed, otherwise valid brief.
// Reject oversized collections; discard malformed, duplicate or unrelated entries.
const parseMetabloomBriefMedia = (value, { sourceIds, maxEntries = MAX_METABLOOM_SOURCE_MEDIA_ENTRIES } = {}) => {
  if (!Array.isArray(value) || value.length > Math.min(maxEntries, MAX_METABLOOM_SOURCE_MEDIA_ENTRIES)) return [];
  const allowed = sourceIds instanceof Set ? sourceIds : new Set(Array.isArray(sourceIds) ? sourceIds : []);
  const ids = new Set(), tokens = new Set(), media = [];
  for (const entry of value) {
    if (!exactKeys(entry, ['sourceId', 'token']) || !Number.isSafeInteger(entry.sourceId)
      || !allowed.has(entry.sourceId) || ids.has(entry.sourceId) || !parseMetabloomSourceMediaToken(entry.token)
      || tokens.has(entry.token)) continue;
    ids.add(entry.sourceId); tokens.add(entry.token);
    media.push({ sourceId: entry.sourceId, token: entry.token });
  }
  return media;
};

// Tool-answer media uses the same opaque entries, limited to its own row size.
const parseMetabloomToolMedia = (value, { sourceIds } = {}) =>
  parseMetabloomBriefMedia(value, { sourceIds, maxEntries: MAX_METABLOOM_TOOL_MEDIA_ENTRIES });

// Subject photos (find_image) carry an opaque image capability plus complete
// Wikimedia attribution. Every link is https on its expected host; the raster
// itself is only ever addressed through this app's media endpoint.
const MAX_METABLOOM_TOOL_IMAGES = 2;
const TOOL_IMAGE_KEYS = ['alt', 'artist', 'fileUrl', 'height', 'license', 'licenseUrl', 'pageUrl', 'title', 'token', 'width'];
const toolImageText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max
  // eslint-disable-next-line no-control-regex
  && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value) ? value.trim() : null;
const toolImageUrl = (value, hosts) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || (hosts && !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)))) return null;
    return url.href;
  } catch { return null; }
};
const parseMetabloomToolImages = value => {
  if (!Array.isArray(value) || value.length > MAX_METABLOOM_TOOL_IMAGES) return [];
  const tokens = new Set();
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).sort().join(',') !== TOOL_IMAGE_KEYS.join(',')) return [];
    const token = parseMetabloomSourceMediaToken(entry.token);
    const image = { token, width: entry.width, height: entry.height,
      alt: toolImageText(entry.alt, 240), title: toolImageText(entry.title, 160),
      artist: toolImageText(entry.artist, 120), license: toolImageText(entry.license, 80),
      pageUrl: toolImageUrl(entry.pageUrl, ['wikipedia.org']),
      fileUrl: toolImageUrl(entry.fileUrl, ['wikimedia.org', 'wikipedia.org']),
      licenseUrl: entry.licenseUrl === null ? null : toolImageUrl(entry.licenseUrl) };
    if (!token || tokens.has(token) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
      || image.width < 64 || image.height < 64 || image.width > 4096 || image.height > 4096
      || !image.alt || !image.title || !image.artist || !image.license || !image.pageUrl || !image.fileUrl
      || (entry.licenseUrl !== null && !image.licenseUrl)) return [];
    tokens.add(token);
    return [image];
  });
};

const metabloomSourceMediaUrl = (token, kind) => parseMetabloomSourceMediaToken(token)
  && ['preview', 'image', 'icon'].includes(kind)
  ? `${METABLOOM_SOURCE_MEDIA_ENDPOINT}?token=${encodeURIComponent(token)}&kind=${kind}` : null;

const parseProxyUrl = (value, { token, kind, origin }) => {
  if (typeof value !== 'string' || value.length > MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS + 256
    || value !== value.trim() || unsafeUrlCharacters.test(value)) return null;
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : null);
  // Relative host URLs remain testable without a browser origin. Absolute URLs
  // require the caller's real origin rather than trusting the response's host.
  if (!base && !value.startsWith('/')) return null;
  let url;
  try {
    const local = new URL(base || 'https://source-media.invalid');
    url = new URL(value, local);
    if (!['http:', 'https:'].includes(local.protocol) || url.origin !== local.origin) return null;
  } catch { return null; }
  const keys = Array.from(url.searchParams.keys());
  // The host issues a separate opaque capability for the exact image it
  // validated. Icons stay on the page capability. Either way the URL is this
  // app's own endpoint with an opaque token; no publisher URL is accepted.
  const selected = kind === 'image' ? parseMetabloomSourceMediaToken(url.searchParams.get('token')) : token;
  if (url.pathname !== METABLOOM_SOURCE_MEDIA_ENDPOINT || url.hash || url.username || url.password
    || keys.length !== 2 || !keys.includes('token') || !keys.includes('kind') || !selected
    || url.searchParams.get('token') !== selected || url.searchParams.get('kind') !== kind) return null;
  return metabloomSourceMediaUrl(selected, kind);
};

const parseMetabloomSourceMediaPreview = (value, { token, origin } = {}) => {
  if (!parseMetabloomSourceMediaToken(token) || !exactKeys(value, ['version', 'image', 'icon', 'isArticle'])
    || value.version !== '1' || typeof value.isArticle !== 'boolean') return null;
  let image = null, icon = null;
  if (value.image !== null) {
    if (!value.isArticle || !exactKeys(value.image, ['src', 'alt']) || typeof value.image.alt !== 'string'
      || value.image.alt.length > MAX_METABLOOM_SOURCE_MEDIA_ALT_CHARS || value.image.alt !== value.image.alt.trim()
      || unsafeAltCharacters.test(value.image.alt)) return null;
    const src = parseProxyUrl(value.image.src, { token, kind: 'image', origin });
    if (!src) return null;
    image = { src, alt: value.image.alt };
  }
  if (value.icon !== null) {
    if (!exactKeys(value.icon, ['src'])) return null;
    const src = parseProxyUrl(value.icon.src, { token, kind: 'icon', origin });
    if (!src) return null;
    icon = { src };
  }
  return { version: '1', image, icon, isArticle: value.isArticle };
};

module.exports = {
  METABLOOM_SOURCE_MEDIA_ENDPOINT,
  MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS,
  MAX_METABLOOM_SOURCE_MEDIA_ENTRIES,
  MAX_METABLOOM_TOOL_MEDIA_ENTRIES,
  MAX_METABLOOM_TOOL_IMAGES,
  MAX_METABLOOM_SOURCE_MEDIA_ALT_CHARS,
  MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES,
  parseMetabloomSourceMediaToken,
  parseMetabloomProgressSource,
  parseMetabloomBriefMedia,
  parseMetabloomToolMedia,
  parseMetabloomToolImages,
  metabloomSourceMediaUrl,
  parseMetabloomSourceMediaPreview,
};
