const { parseMetabloomResearchSources } = require('./metabloomResearchSources');

const METABLOOM_SOURCE_MEDIA_ENDPOINT = '/api/metabloom-source-media';
const MAX_METABLOOM_SOURCE_MEDIA_TOKEN_CHARS = 4096;
const MAX_METABLOOM_SOURCE_MEDIA_ENTRIES = 10;
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
const parseMetabloomBriefMedia = (value, { sourceIds } = {}) => {
  if (!Array.isArray(value) || value.length > MAX_METABLOOM_SOURCE_MEDIA_ENTRIES) return [];
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
  if (url.pathname !== METABLOOM_SOURCE_MEDIA_ENDPOINT || url.hash || url.username || url.password
    || keys.length !== 2 || !keys.includes('token') || !keys.includes('kind')
    || url.searchParams.get('token') !== token || url.searchParams.get('kind') !== kind) return null;
  return metabloomSourceMediaUrl(token, kind);
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
  MAX_METABLOOM_SOURCE_MEDIA_ALT_CHARS,
  MAX_METABLOOM_SOURCE_MEDIA_PREVIEW_BYTES,
  parseMetabloomSourceMediaToken,
  parseMetabloomProgressSource,
  parseMetabloomBriefMedia,
  metabloomSourceMediaUrl,
  parseMetabloomSourceMediaPreview,
};
