# Publisher previews in research

Publisher imagery is optional presentation attached to the canonical source of a completed news item or an observed research source. It does not change the finding, source URL, citation, date evidence, or completed research outcome. No model is asked to invent images or image URLs, and loading media never triggers a provider call or a second research pass.

## Capability and delivery contract

The research host calls `await createSourceMediaToken(identity, canonicalSourceUrl, { now })` in `server/metabloomSourceMedia.js`. `now` is an optional epoch-millisecond value; production uses the current clock. Minting returns a URL-safe opaque token or `null`, including when identity, URL, or auth configuration is unavailable. The identity requires the existing keyed `owner` and `scope` digests. It does not depend on the generated-visuals feature flag or require a new environment secret.

Only the host may mint tokens, after observing a URL in real research tool activity or validating the final brief's source references. A token is not a substitute for source provenance. It authenticates the source URL that the host selected, not the factual truth of the page.

Clients opt in with `streamResearchMedia: true` on the research request. For an actually observed `open_page` or `find_in_page` action, a research-progress event may carry `source: { url, token }`; free-form model prose and search-query text do not establish a source for that event. After validating a final **news** brief against canonical research evidence, the host may add `brief.media: [{ sourceId, token }]`. This list contains at most ten unique sources, selected from each item's date-evidence source or first cited source. It is host-owned enrichment, not an additional field the formatting model can invent. Older clients retain their original stream behavior.

Minting performs local cryptography and reads existing server configuration. It makes no metadata request, DNS lookup, image download, or provider call. Publisher requests begin only when the browser requests a source icon or preview, so publisher latency cannot delay the paid research result.

Tokens use AES-256-GCM with a domain-separated key derived from the existing server-only auth Redis secret. The encrypted payload contains the observed HTTPS source URL, issue time, expiry, and token version. The authenticated associated data binds it to both the signed-in session owner and deployment scope. Lifetimes are at most one hour. Tokens fail closed after tampering, expiry, secret rotation, sign-in changes, or scope changes.

The browser requests:

```text
GET /api/metabloom-source-media?token=<capability>&kind=preview
GET /api/metabloom-source-media?token=<capability>&kind=image
GET /api/metabloom-source-media?token=<capability>&kind=icon
```

There is no raw-URL endpoint. Each request independently requires the existing authenticated admin session and a same-origin Fetch Metadata header. A client without Fetch Metadata must send the matching HTTPS `Origin`. Cross-site, same-site, missing-provenance, and mismatched-origin requests are rejected. The handler does not rely on page middleware alone.

Preview JSON is exactly:

```json
{
  "version": "1",
  "image": { "src": "/api/metabloom-source-media?token=...&kind=image", "alt": "Publisher metadata, if supplied" },
  "icon": { "src": "/api/metabloom-source-media?token=...&kind=icon" },
  "isArticle": true
}
```

`image` and `icon` may independently be `null`; `alt` may be empty. Image and icon URLs remain relative to this app. The source article's title and URL stay in the existing canonical source record. A generic website social image is not served as an article image: article metadata must identify an article before either the preview or direct image route returns it. `isArticle` reports publisher metadata, not independent editorial verification of the page type.

## Publisher metadata

The bounded HTML-head reader recognizes Open Graph image/secure-image/alt metadata, Twitter image/alt metadata, article-scoped JSON-LD images, and `link rel=image_src`. Explicit `og:type=article` makes page-level social images eligible. A JSON-LD article must identify the fetched source page through `url`, `@id`, or `mainEntityOfPage`; fragments are ignored for that comparison, while the origin, path, and query must match. Any explicitly conflicting or invalid identity disqualifies the node. A matched article node contributes only its own declared images, never a generic website social logo. Related articles, unidentified article nodes, organization logos, and incidental JSON-LD images do not become this source's event photographs.

Publisher icons come from `rel=icon` or `rel=apple-touch-icon`, with `/favicon.ico` as a final same-publisher fallback. That icon fallback also works when article HTML is unavailable. A publisher icon is never substituted for an article photograph.

Relative metadata URLs resolve against the actual fetched page URL after validated redirects. The reader ignores `base` elements, canonical-link rewrites, comments, script/style/noscript/template/raw-text content, and body image elements. It never executes scripts or follows instructions in source text. Metadata descriptions are bounded and stripped of control/bidirectional formatting characters. Missing descriptions remain empty.

## Outbound network boundary

`server/metabloomSourceMediaFetch.js` owns all publisher requests. Citation URL validation alone is deliberately insufficient for this boundary.

- Only HTTPS on port 443 is eligible. URLs with credentials, local hostnames, control characters, unsafe schemes, or private/reserved IP literals are rejected. WHATWG URL normalization happens before address checks, covering obscured numeric IPv4 forms.
- DNS lookup returns all addresses. A mixed public/private answer is rejected. IPv4 private, loopback, link-local, shared, documentation, benchmarking, multicast, and reserved ranges are blocked. IPv6 is limited to global unicast space, excluding special assignments, documentation and transition ranges; mapped IPv4, NAT64, loopback, ULA, link-local and multicast forms are ineligible.
- The TLS request pins one validated DNS address using a custom lookup callback, uses a fresh connection, preserves the publisher hostname for certificate verification/SNI, and verifies the connected socket address. There is no check-then-generic-fetch DNS rebinding gap.
- Every redirect repeats URL and DNS validation. There are at most three redirects, and loops are rejected. Downgrades, credential-bearing redirects, and redirects into a private address are rejected.
- Only fixed preview request headers are sent. Browser cookies, authorization, source request headers, and referrers are never forwarded. Responses are not allowed to set the app's cookies.
- Encoded/compressed responses are rejected rather than decompressed. Header size is capped at 16 KiB. Each complete publisher fetch, including redirects, has a six-second deadline. The whole media operation has a sixteen-second deadline and responds to disconnect cancellation.
- HTML is read only through the end of the head or a 512 KiB prefix. Article images are capped at 2 MiB and icons at 128 KiB. Binary responses check declared content length and actual streamed bytes.

## Raster validation and resource bounds

The proxy accepts static PNG, JPEG, and WebP; icons may also use ICO. MIME type must agree with the file's magic and structure. SVG, HTML, generic binary MIME, GIF, animated PNG/WebP, truncated containers, invalid dimensions, and oversized payloads are rejected. Article images are limited to 16 million pixels with an 8192-pixel maximum dimension; icons are limited to one million pixels with a 1024-pixel maximum dimension. ICO directory entries, embedded PNG/DIB sizes, palette/bitmap bounds, overlap, and total pixels are checked. The service does not rasterize or execute any publisher content.

An instance permits at most six simultaneous public fetches and twenty-four queued fetches. Identical in-flight work is shared with a maximum of sixty-four tracked operations. Each caller retains independent cancellation: an unmounted progress icon does not cancel the same source's mounted article preview. Shared work aborts when its last interested caller leaves; a subsequent caller may start a new bounded lookup. Metadata caching is limited to 128 entries/1 MiB, and validated binary caching to 64 entries/16 MiB. Positive entries expire after ten minutes and negative entries after thirty seconds. These caches are optional warm-instance optimizations; they do not authorize requests and never outlive token/session checks as an access path.

All browser responses use private/no-store caching, `nosniff`, a same-origin resource policy, and no referrer. No new CORS permission or broad image origin is introduced. Existing document CSP remains `img-src 'self' data: blob:`.

## Failure behavior and verification

Invalid capability or denied authentication returns a bounded error. An inaccessible, unsupported, missing or invalid optional image becomes `null` in a preview or a 404 on the image/icon route. A media failure never changes a completed research item. No original publisher URL, token, source-page body, credential, or raw error is written to operational logs.

`scripts/metabloom-source-media.test.cjs` uses injected DNS/TLS, source fixtures, clock, codec, service, and auth factories. It verifies session binding, tamper/expiry/secret rotation, IP and DNS rejection, pinned connections, redirects, fixed headers, byte and format limits, article/image association, publisher-icon fallback, non-article image suppression, concurrency, bounded caching, endpoint auth/origin enforcement, and optional-media failure behavior. No test contacts a publisher or paid provider.
