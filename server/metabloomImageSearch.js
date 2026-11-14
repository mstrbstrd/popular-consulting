// Freely licensed subject photos for ordinary chat, from Wikipedia's lead image
// (PageImages, free licences only) and its Wikimedia Commons attribution.
// The host chooses the image URL from these APIs; the model only names a
// subject and never supplies or sees a URL. Images are delivered through the
// authenticated same-origin media proxy, never hotlinked.

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const IMAGE_SEARCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_API_BYTES = 262144;
const IMAGE_WIDTH = 960;
const USER_AGENT = 'Mozilla/5.0 (compatible; PopularConsultingPreview/1.1; +https://popular-consulting.com/)';

const searchError = reason => Object.assign(new Error('Image search unavailable.'), { code: 'image_search_unavailable', reason });
const text = (value, max) => {
  if (typeof value !== 'string') return '';
  const plain = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
};
const httpsUrl = (value, hosts) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || (hosts && !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
};

// Wikimedia now reports thumbnails on thumb.wikimedia.org with utm_* tracking
// queries; upload.wikimedia.org still serves the identical static path and is
// the long-standing origin, so both hosts are accepted and canonicalized to it.
// Raster paths are static files, so any query string is discarded.
const WIKIMEDIA_RASTER_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
const rasterUrl = value => {
  const href = httpsUrl(value, ['wikimedia.org']);
  if (!href) return null;
  const url = new URL(href);
  if (!WIKIMEDIA_RASTER_HOSTS.has(url.hostname) || !url.pathname.startsWith('/wikipedia/')) return null;
  url.hostname = 'upload.wikimedia.org';
  url.search = '';
  return url.href;
};
const stripTracking = href => {
  if (!href) return href;
  const url = new URL(href);
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  return url.href;
};

async function readApi(params, { signal, fetchImpl }) {
  const url = new URL(WIKIPEDIA_API);
  for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', ...params })) url.searchParams.set(key, value);
  const response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', signal,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Api-User-Agent': USER_AGENT } });
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json') || !response.body?.getReader) {
    await response.body?.cancel?.().catch(() => {});
    throw searchError('image_api_response');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_IMAGE_API_BYTES) throw searchError('image_api_limit');
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return JSON.parse(body); } catch { throw searchError('image_api_json'); }
}

// Returns { found: false } when no suitable free image exists, or a frozen
// record with the host-selected page, raster, dimensions and attribution.
async function findMetabloomImage(subject, { signal, fetchImpl = globalThis.fetch } = {}) {
  const query = text(subject, 200);
  if (!query) throw searchError('image_subject');
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, IMAGE_SEARCH_TIMEOUT_MS); timer.unref?.();
  const options = { signal: controller.signal, fetchImpl };
  try {
    const search = await readApi({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: '3',
      prop: 'pageimages|info|pageprops', piprop: 'thumbnail|name', pithumbsize: String(IMAGE_WIDTH), pilicense: 'free',
      ppprop: 'disambiguation', inprop: 'url', redirects: '1' }, options);
    const pages = Array.isArray(search?.query?.pages) ? search.query.pages : [];
    const page = pages.filter(item => item && typeof item === 'object'
      // The API marks disambiguation pages with an empty-string property.
      && !Object.prototype.hasOwnProperty.call(item.pageprops || {}, 'disambiguation')
      && typeof item.pageimage === 'string' && item.thumbnail && Number.isSafeInteger(item.index))
      .sort((a, b) => a.index - b.index)[0];
    if (!page) return { found: false };
    const pageUrl = httpsUrl(page.fullurl, ['wikipedia.org']);
    const file = text(page.pageimage, 240);
    // Raster formats only; SVG drawings and animated media are never offered.
    if (!pageUrl || !file || !/\.(jpe?g|png|webp)$/i.test(file)) return { found: false };
    const meta = await readApi({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: String(IMAGE_WIDTH), iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|ObjectName' }, options);
    const info = meta?.query?.pages?.[0]?.imageinfo?.[0];
    const extmetadata = info?.extmetadata || {};
    const imageUrl = rasterUrl(info?.thumburl);
    const fileUrl = stripTracking(httpsUrl(info?.descriptionurl, ['wikimedia.org', 'wikipedia.org']));
    const license = text(extmetadata.LicenseShortName?.value, 80);
    const artist = text(extmetadata.Artist?.value, 120) || text(extmetadata.Credit?.value, 120);
    const width = info?.thumbwidth, height = info?.thumbheight;
    // An image is offered only with complete attribution and sane dimensions.
    if (!imageUrl || !fileUrl || !license || !artist || !['image/jpeg', 'image/png', 'image/webp'].includes(info?.mime)
      || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 64 || height < 64
      || width > 4096 || height > 4096) return { found: false };
    return Object.freeze({ found: true, title: text(page.title, 160) || query, pageUrl, imageUrl, fileUrl, width, height,
      license, licenseUrl: httpsUrl(extmetadata.LicenseUrl?.value) || null, artist,
      alt: text(extmetadata.ImageDescription?.value, 240) || text(page.title, 160) || query, source: 'Wikimedia Commons' });
  } catch (error) {
    signal?.throwIfAborted();
    throw error?.code === 'image_search_unavailable' ? error : searchError(controller.signal.aborted ? 'image_timeout' : 'image_network');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

module.exports = { IMAGE_SEARCH_TIMEOUT_MS, MAX_IMAGE_API_BYTES, findMetabloomImage };
