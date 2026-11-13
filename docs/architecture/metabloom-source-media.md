# Publisher previews in research

Publisher imagery is optional presentation attached to the canonical source of a completed news story, a research finding, a source cited by an ordinary search answer, or an observed research source. It does not change the finding, source URL, citation, date evidence, or completed research outcome. No model is asked to invent images or image URLs, and loading media never triggers a provider call or a second research pass.

## Capability and delivery contract

The research host calls `await createSourceMediaToken(identity, canonicalSourceUrl, { now })` in `server/metabloomSourceMedia.js`. `now` is an optional epoch-millisecond value; production uses the current clock. Minting returns a URL-safe opaque token or `null`, including when identity, URL, or auth configuration is unavailable. The identity requires the existing keyed `owner` and `scope` digests. It does not depend on the generated-visuals feature flag or require a new environment secret.

Only the host may mint tokens, after observing a URL in real research tool activity or validating the final brief's source references. A token is not a substitute for source provenance. It authenticates the source URL that the host selected, not the factual truth of the page.

Clients opt in with `streamResearchMedia: true` on the research request. For an actually observed `open_page` or `find_in_page` action, a research-progress event may carry `source: { url, token }`; free-form model prose and search-query text do not establish a source for that event. After validating a final **news** or **research** brief against canonical research evidence, the host may add `brief.media: [{ sourceId, token }]`. This list contains at most ten unique sources. The host prioritizes each item's date-evidence source (news) or first cited source, then considers alternate sources already cited by those items in bounded rounds, with at most three candidates per story. It is host-owned enrichment, not an additional field the formatting model can invent. Older clients retain their original stream behavior.

The article preview tries the primary source first and can advance to the next available cited source when a preview is unavailable or an image fails to load. It does not search for substitute imagery. The displayed image, article label and outgoing link always refer to the same selected source. No source outside the item's citations can become a fallback.

### Brief-level preparation

Carousel slides are mounted but `hidden`, so a per-slide viewport observer can never start their previews. Each rendered brief therefore owns one preview resolver (`src/components/metabloomSourceMediaResolver.js`). It starts once when the brief comes within 480px of the viewport, then requests every cited preview in the brief exactly once: the visible slide first, then by distance from it, with each slide's alternates queued behind its primary. At most four preview requests run at once, and the host's ten-entry media cap bounds the total. Repeated requests for one token share a single lookup and its settled result. Images offered by a resolved preview load eagerly in hidden slides, so a photo is already decoded when the reader moves to its slide. Unmounting the brief aborts running lookups and rejects queued ones; a StrictMode remount starts from an empty queue.

Ordinary search answers use the same resolver for their cited-source photo row (see the [conversation toolset](metabloom-chat-toolset.md) `tool_media` record). There, a tile is displayed only after its photo loads; the row is appended below the answer's text source list so loading never moves text the reader may be using.

Standalone previews outside a brief keep their own lazy, viewport-gated loading.

### Consistent media slot

Compact briefing previews always show the canonical article title as the direct link, together with its source number, publisher, and host. The title is visually limited to two lines while its full text remains in the link's accessible name and tooltip. This identifies the cited article even when it is syndicated through a site whose branding differs from the story's subject. The image, title, source number, publisher, host, and link switch together when an alternate succeeds.

Every slide, story or finding, reserves the same 16:9 media slot. While previews are pending, and after every candidate is exhausted, the slot shows a source plate: the publisher icon (or a neutral globe mark) above the host name. The photo cross-fades over the plate only after it has loaded; reduced motion removes the fade. The slot never collapses, so slides keep one shape and the navigation controls do not move. A slide with no media capability (for example, a restored thread whose session-bound tokens were removed, or an item beyond the ten-entry cap) still renders the same card and plate for its primary source without any request. Returning to a visited slide reuses its resolved preview state.

Minting performs local cryptography and reads existing server configuration. It makes no metadata request, DNS lookup, image download, or provider call. Publisher requests begin only when the browser requests a source icon or preview, so publisher latency cannot delay the paid research result.

Tokens use AES-256-GCM with a domain-separated key derived from the existing server-only auth Redis secret. The encrypted payload contains the observed HTTPS source URL, issue time, expiry, and token version. The authenticated associated data binds it to both the signed-in session owner and deployment scope. Lifetimes are at most one hour. Tokens fail closed after tampering, expiry, secret rotation, sign-in changes, or scope changes.

The browser requests:

```text
GET /api/metabloom-source-media?token=<capability>&kind=preview
GET /api/metabloom-source-media?token=<capability>&kind=image
GET /api/metabloom-source-media?token=<capability>&kind=icon
```

There is no raw-URL endpoint. Each request independently requires the existing authenticated admin session and a same-origin Fetch Metadata header. A client without Fetch Metadata must send the matching HTTPS `Origin`. Cross-site, same-site, missing-provenance, and mismatched-origin requests are rejected. The handler does not rely on page middleware alone.

### Image capabilities

When a preview has validated an article image, it mints a separate image capability (payload version 2) naming the page URL and the exact raster URL it selected. The preview's `image.src` uses that token. Its expiry never exceeds the page capability that selected it, and it is bound to the same session and deployment. The image route serves a version 2 token with one validated raster request and no second metadata read. A different serverless instance therefore cannot reach a different conclusion than the preview that offered the image, and a cold image request costs one publisher fetch rather than two. Page tokens still work on the image route through the original metadata-gated path. Image capabilities are rejected by the preview and icon routes. Validated rasters are cached by their own URL, so the preview and its image capability share one download on a warm instance.

The host also mints image capabilities directly for subject photos found by the ordinary agent's `find_image` tool (Wikipedia page URL plus the Wikimedia Commons thumbnail it selected; see the [conversation toolset](metabloom-chat-toolset.md)). Those are served by the same single-raster path and validation.

Preview JSON is exactly:

```json
{
  "version": "1",
  "image": { "src": "/api/metabloom-source-media?token=<image capability>&kind=image", "alt": "Publisher metadata, if supplied" },
  "icon": { "src": "/api/metabloom-source-media?token=...&kind=icon" },
  "isArticle": true
}
```

`image` and `icon` may independently be `null`; `alt` may be empty. Image and icon URLs remain relative to this app. The browser accepts an image URL only on this endpoint with `kind=image` and one well-formed opaque token; the icon URL must carry the page token it requested. The source article's title and URL stay in the existing canonical source record. A generic website social image is not served as an article image: article metadata must identify an article before either the preview or direct image route returns it. `isArticle` reports publisher metadata, not independent editorial verification of the page type.

## Publisher metadata

The bounded HTML-head reader recognizes Open Graph image/secure-image/alt metadata, Twitter image/alt metadata, article-scoped JSON-LD images, and `link rel=image_src`. Explicit `og:type=article` makes page-level social images eligible after the branding exclusions below. A JSON-LD article must identify the fetched source page through `url`, `@id`, or `mainEntityOfPage`. Fragments and exactly six campaign query keys (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`) are ignored only for that identity comparison. This lets a citation ending in `?utm_source=openai` match its publisher-declared article URL. The origin, path, and all remaining raw query components, including their order and duplicates, must still match. The comparison never changes the capability URL, outbound request, citation link, or validated redirect target, and it never follows a canonical-link rewrite. Any explicitly conflicting or invalid identity disqualifies the node. A matched article node contributes only its own declared images, and those images take priority over page-level social metadata. Related articles, unidentified article nodes, organization logos, and incidental JSON-LD images do not supply article photos.

Explicitly declared JSON-LD logos (including nested publisher logos and bounded image-object references) and identical favicon assets are excluded from story images. A conventional generic social-share asset such as `fbShare.png` is also excluded when it shares both its origin and asset directory with a declared site icon. This fixes the reported syndicated-news preview whose station sharing logo was promoted to a story image by `og:type=article`. A generic filename alone does not disqualify an image, and genuine photos remain eligible from the same publisher or asset directory. These checks use already-fetched metadata; they add no requests, domain blacklist, or image-recognition claim. Unmarked generic imagery cannot always be recognized from metadata alone.

Publisher icons come from `rel=icon` or `rel=apple-touch-icon`, with `/favicon.ico` as a final same-publisher fallback. That icon fallback also works when article HTML is unavailable. A publisher icon is never substituted for an article photograph.

Relative metadata URLs resolve against the actual fetched page URL after validated redirects. The reader ignores `base` elements, canonical-link rewrites, comments, script/style/noscript/template/raw-text content, and body image elements. It never executes scripts or follows instructions in source text. Metadata descriptions are bounded and stripped of control/bidirectional formatting characters. Missing descriptions remain empty.

## Outbound network boundary

`server/metabloomSourceMediaFetch.js` owns all publisher requests. Citation URL validation alone is deliberately insufficient for this boundary.

- Only HTTPS on port 443 is eligible. URLs with credentials, local hostnames, control characters, unsafe schemes, or private/reserved IP literals are rejected. WHATWG URL normalization happens before address checks, covering obscured numeric IPv4 forms.
- DNS lookup returns all addresses. A mixed public/private answer is rejected. IPv4 private, loopback, link-local, shared, documentation, benchmarking, multicast, and reserved ranges are blocked. IPv6 is limited to global unicast space, excluding special assignments, documentation and transition ranges; mapped IPv4, NAT64, loopback, ULA, link-local and multicast forms are ineligible.
- The TLS request pins one validated DNS address using a custom lookup callback, uses a fresh connection, preserves the publisher hostname for certificate verification/SNI, and verifies the connected socket address. There is no check-then-generic-fetch DNS rebinding gap.
- Every redirect repeats URL and DNS validation. There are at most three redirects, and loops are rejected. Downgrades, credential-bearing redirects, and redirects into a private address are rejected.
- Requests identify the reader as `Mozilla/5.0 (compatible; PopularConsultingPreview/1.1; +https://popular-consulting.com/)`. The conventional "compatible" form passes naive filters that reject unknown agents outright; it does not impersonate a browser or another crawler.
- Only fixed preview request headers are sent. Browser cookies, authorization, source request headers, and referrers are never forwarded. Responses are not allowed to set the app's cookies.
- Encoded/compressed responses are rejected rather than decompressed. Header size is capped at 16 KiB. Each complete publisher fetch, including redirects, has a six-second deadline. The whole media operation has a sixteen-second deadline and responds to disconnect cancellation.
- HTML is read only through the end of the head or a 512 KiB prefix. Article images are capped at 2 MiB and icons at 128 KiB. Binary responses check declared content length and actual streamed bytes.

## Raster validation and resource bounds

The proxy accepts static PNG, JPEG, and WebP; icons may also use ICO. MIME type must agree with the file's magic and structure. Object stores often label social images `application/octet-stream` or `binary/octet-stream`; only those two labels are sniffed by magic into PNG, JPEG, WebP (or ICO for icons) and then fully validated like any other raster. SVG, HTML, other generic MIME types, GIF, animated PNG/WebP, truncated containers, invalid dimensions, and oversized payloads are rejected. Article images are limited to 16 million pixels with an 8192-pixel maximum dimension; icons are limited to one million pixels with a 1024-pixel maximum dimension. ICO directory entries, embedded PNG/DIB sizes, palette/bitmap bounds, overlap, and total pixels are checked. The service does not rasterize or execute any publisher content.

An instance permits at most six simultaneous public fetches and twenty-four queued fetches. Identical in-flight work is shared with a maximum of sixty-four tracked operations. Each caller retains independent cancellation: an unmounted progress icon does not cancel the same source's mounted article preview. Shared work aborts when its last interested caller leaves; a subsequent caller may start a new bounded lookup. Metadata caching is limited to 128 entries/1 MiB, and validated binary caching to 64 entries/16 MiB. Positive entries expire after ten minutes and negative entries after thirty seconds. These caches are optional warm-instance optimizations; they do not authorize requests and never outlive token/session checks as an access path.

All browser responses use private/no-store caching, `nosniff`, a same-origin resource policy, and no referrer. No new CORS permission or broad image origin is introduced. Existing document CSP remains `img-src 'self' data: blob:`.

## Failure behavior and verification

Invalid capability or denied authentication returns a bounded error. An inaccessible, unsupported, missing or invalid optional image becomes `null` in a preview or a 404 on the image/icon route. A media failure never changes a completed research item. No original publisher URL, token, source-page body, credential, or raw error is written to operational logs.

A publisher may provide no eligible article image, deny automated requests, return compressed or unsupported media, or exceed the existing resource bounds. Alternate cited sources improve coverage where another publisher supplies valid media; they do not guarantee an image for every story. Article text and links remain usable when all eligible previews are unavailable. A missing image alone does not identify which of these conditions occurred.

`scripts/metabloom-source-media.test.cjs` uses injected DNS/TLS, source fixtures, clock, codec, service, and auth factories. It verifies session binding, tamper/expiry/secret rotation, IP and DNS rejection, pinned connections, redirects, fixed headers, byte and format limits, article/image association, tracked citation identities, substantive query and conflicting-identity rejection, publisher-icon fallback, non-article image suppression, concurrency, bounded caching, endpoint auth/origin enforcement, and optional-media failure behavior. No test contacts a publisher or paid provider.
