import metadata from '../content/routeMetadata.json';

export const routeMetadataFor = pathname => Object.values(metadata).find(route =>
  route.path === (pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'));

export const sharesImmersiveBackground = pathname =>
  ['/', '/home', '/engineering', '/login'].includes(routeMetadataFor(pathname)?.path);

export const isAppRoute = pathname => Boolean(routeMetadataFor(pathname));

// These switches establish renderer policy before React mounts. Changing them
// intentionally starts a document; ordinary tool navigation retains the policy.
const GRAPHICS_PARAMETERS = ['graphics', 'black-hole-quality'];
export function appDestination(href, current = window.location.href) {
  let source, target;
  try { source = new URL(current); target = new URL(href, source); } catch { return null; }
  if (target.origin !== source.origin || !isAppRoute(target.pathname)) return null;
  if ([source, target].some(url => [...url.searchParams.keys()].some(key => key.startsWith('visual-runtime') || key.startsWith('visual-capture')))) return null;
  for (const key of GRAPHICS_PARAMETERS) {
    const value = source.searchParams.get(key);
    if (target.searchParams.has(key) && target.searchParams.get(key) !== value) return null;
    if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return target;
}

export function clickedAppDestination(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('data-document-navigation') ||
    (anchor.target && anchor.target !== '_self') || anchor.rel.split(/\s+/).includes('external') || anchor.closest('[inert]')) return null;
  const url = appDestination(anchor.href);
  if (!url) return null;
  const current = new URL(window.location.href);
  // Keep skip links and in-page navigation native, including focus and scrolling.
  if (url.pathname === current.pathname && url.search === current.search && url.hash) return null;
  return url;
}
