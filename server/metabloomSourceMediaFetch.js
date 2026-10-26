// Public publisher metadata is fetched with a DNS-pinned TLS connection. This is
// intentionally separate from the citation URL validator: a safe hyperlink is
// not, by itself, permission for the server to contact that address.
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');

const mediaError = code => Object.assign(new Error(code), { code });
const MAX_URL_CHARS = 2048;
const MAX_HTML_BYTES = 524288;
const MAX_IMAGE_BYTES = 2097152;
const MAX_ICON_BYTES = 131072;

function ipv4Number(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split('.').reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function ipv6Number(address) {
  if (net.isIP(address) !== 6 || address.includes('%')) return null;
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const boundary = value.lastIndexOf(':');
    const tail = ipv4Number(value.slice(boundary + 1));
    if (tail === null) return null;
    value = `${value.slice(0, boundary)}:${(tail >> 16n).toString(16)}:${(tail & 65535n).toString(16)}`;
  }
  const halves = value.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  if (groups.length !== 8) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

const inRange = (value, base, bits, width) => (value >> BigInt(width - bits)) === (base >> BigInt(width - bits));
const blockedV4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [ipv4Number(base), bits]);
const blockedV6 = [
  ['2001::', 23], // Special protocol assignments, Teredo, benchmarking, ORCHID.
  ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20],
].map(([base, bits]) => [ipv6Number(base), bits]);

function isPublicAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const v4 = ipv4Number(address);
  if (v4 !== null) return !blockedV4.some(([base, bits]) => inRange(v4, base, bits, 32));
  const v6 = ipv6Number(address);
  // Only globally routable unicast space is accepted. This also excludes all
  // mapped/compatible IPv4, NAT64, loopback, link-local, ULA and multicast forms.
  return v6 !== null && inRange(v6, ipv6Number('2000::'), 3, 128)
    && !blockedV6.some(([base, bits]) => inRange(v6, base, bits, 128));
}

function parsePublicMediaUrl(value, base) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_CHARS
    || value !== value.trim() || /[\\\u0000-\u0020\u007f]/u.test(value)) return null;
  if ((!base || /^[a-z][a-z0-9+.-]*:/i.test(value)) && !/^https:\/\//i.test(value)) return null;
  let url;
  try { url = base ? new URL(value, base) : new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.href.length > MAX_URL_CHARS) return null;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.includes('%')) return null;
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) return null;
  } else if (!hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname)
    || hostname.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))
    || /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|onion|invalid|test|example)$/.test(hostname)) return null;
  return url;
}

function waitWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) {
    // The operation may already have started before cancellation was observed.
    // Consume a later rejection even though this waiter no longer needs it.
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(mediaError('source_media_cancelled'));
  }
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(mediaError('source_media_cancelled')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function matchingAddress(connected, pinned) {
  if (connected === pinned) return true;
  const connectedV4 = ipv4Number(connected), pinnedV4 = ipv4Number(pinned);
  if (connectedV4 !== null && pinnedV4 !== null) return connectedV4 === pinnedV4;
  const connectedV6 = ipv6Number(connected), pinnedV6 = ipv6Number(pinned);
  if (connectedV6 !== null && pinnedV6 !== null) return connectedV6 === pinnedV6;
  return pinnedV4 !== null && connectedV6 !== null
    && (connectedV6 >> 32n) === 65535n && (connectedV6 & 4294967295n) === pinnedV4;
}

function createPublicMediaFetcher({ lookup = dns.lookup, request = https.request, timeoutMs = 6000, maxRedirects = 3 } = {}) {
  async function resolveAddress(url, signal) {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
      : await waitWithSignal(lookup(hostname, { all: true, verbatim: true }), signal);
    if (!Array.isArray(records) || !records.length || records.length > 16
      || records.some(record => !record || !isPublicAddress(record.address) || net.isIP(record.address) !== record.family)) {
      throw mediaError('source_media_target');
    }
    // Reject a mixed public/private DNS response, and pin exactly one of the
    // checked answers. No generic fetch or second DNS lookup follows this check.
    return records.find(record => record.family === 4) || records[0];
  }

  async function read(url, kind, signal) {
    const pinned = await resolveAddress(url, signal);
    signal.throwIfAborted();
    const limit = kind === 'html' ? MAX_HTML_BYTES : kind === 'icon' ? MAX_ICON_BYTES : MAX_IMAGE_BYTES;
    return new Promise((resolve, reject) => {
      let settled = false, upstream, incoming;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(result);
        incoming?.destroy();
        upstream?.destroy();
      };
      const abort = () => finish(mediaError('source_media_cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
      try {
        upstream = request({ protocol: 'https:', hostname, port: 443, method: 'GET',
          path: `${url.pathname}${url.search}`, agent: false, family: pinned.family,
          servername: net.isIP(hostname) ? undefined : hostname, rejectUnauthorized: true,
          maxHeaderSize: 16384,
          lookup: (_host, options, callback) => {
            if (typeof options === 'function') { callback = options; options = {}; }
            if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
            else callback(null, pinned.address, pinned.family);
          },
          headers: { 'User-Agent': 'PopularConsulting-ArticlePreview/1.0',
            Accept: kind === 'html' ? 'text/html,application/xhtml+xml;q=0.9' : 'image/png,image/jpeg,image/webp,image/x-icon',
            'Accept-Encoding': 'identity' },
        }, result => {
          incoming = result;
          if (settled) { result.destroy(); return; }
          const status = result.statusCode;
          if ([301, 302, 303, 307, 308].includes(status)) {
            if (typeof result.headers.location !== 'string' || result.headers.location.length > MAX_URL_CHARS) {
              finish(mediaError('source_media_redirect')); return;
            }
            finish(null, { redirect: result.headers.location }); return;
          }
          const type = typeof result.headers['content-type'] === 'string' ? result.headers['content-type'].split(';', 1)[0].trim().toLowerCase() : '';
          const allowed = kind === 'html' ? ['text/html', 'application/xhtml+xml']
            : ['image/png', 'image/jpeg', 'image/webp', ...(kind === 'icon' ? ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'] : [])];
          const encoding = result.headers['content-encoding'];
          const length = result.headers['content-length'];
          if (status !== 200 || !allowed.includes(type) || (encoding && encoding !== 'identity')
            || (length !== undefined && (!/^\d+$/.test(String(length)) || (kind !== 'html' && Number(length) > limit)))) {
            finish(mediaError('source_media_type')); return;
          }
          const chunks = [];
          let size = 0, tail = '';
          result.on('data', chunk => {
            if (settled) return;
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (kind !== 'html' && size + bytes.length > limit) { finish(mediaError('source_media_size')); return; }
            const part = bytes.subarray(0, limit - size);
            chunks.push(part); size += part.length;
            if (kind === 'html') {
              // Metadata lives in the head. Stop without buffering a potentially
              // enormous news article body; the parser also ignores body content.
              const text = tail + part.toString('utf8');
              tail = text.slice(-32);
              if (/<\/head\s{0,8}>/i.test(text) || size >= limit) {
                finish(null, { body: Buffer.concat(chunks, size), type, url: url.href });
              }
            }
          });
          result.on('end', () => finish(null, { body: Buffer.concat(chunks, size), type, url: url.href }));
          result.on('error', () => finish(mediaError('source_media_network')));
          result.on('aborted', () => finish(mediaError('source_media_network')));
        });
        upstream.on('socket', socket => {
          socket.once('secureConnect', () => {
            if (!matchingAddress(socket.remoteAddress, pinned.address)) finish(mediaError('source_media_target'));
          });
        });
        upstream.on('error', () => finish(mediaError('source_media_network')));
        upstream.end();
      } catch { finish(mediaError('source_media_network')); }
    });
  }

  return async function fetchPublicMedia(input, { kind = 'html', signal } = {}) {
    if (!['html', 'image', 'icon'].includes(kind)) throw mediaError('source_media_type');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, Math.max(1, Math.min(timeoutMs, 10000)));
    timer.unref?.();
    const seen = new Set();
    try {
      let url = parsePublicMediaUrl(input);
      for (let redirects = 0; ; redirects++) {
        if (!url || seen.has(url.href)) throw mediaError('source_media_target');
        seen.add(url.href);
        const result = await read(url, kind, controller.signal);
        if (!result.redirect) return result;
        if (redirects >= Math.min(maxRedirects, 3)) throw mediaError('source_media_redirect');
        // Revalidate protocol, authority, IP space and DNS at every redirect.
        url = parsePublicMediaUrl(result.redirect, url);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  };
}

module.exports = { createPublicMediaFetcher, parsePublicMediaUrl, isPublicAddress, waitWithSignal, mediaError,
  MAX_URL_CHARS, MAX_HTML_BYTES, MAX_IMAGE_BYTES, MAX_ICON_BYTES };
