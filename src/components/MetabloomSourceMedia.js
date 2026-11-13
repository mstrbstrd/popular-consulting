import React from 'react';
import { metabloomSourceMediaUrl, parseMetabloomSourceMediaToken } from './metabloomSourceMediaProtocol';
import { parseMetabloomResearchSources } from './metabloomResearchSources';
import { requestMetabloomSourcePreview } from './metabloomSourceMediaClient';
import { createSourceMediaResolver } from './metabloomSourceMediaResolver';
import './MetabloomSourceMedia.css';

// One bounded preview queue per media surface (a research brief or an answer's
// image row). It starts once the surface nears the viewport; the returned
// callback ref must be attached to an element that is laid out (not display:none).
export function useMetabloomSourceMediaResolver() {
  const [resolver] = React.useState(() => createSourceMediaResolver());
  React.useEffect(() => resolver.retain(), [resolver]);
  const viewportObserver = React.useRef(null);
  const observe = React.useCallback(node => {
    viewportObserver.current?.disconnect();
    viewportObserver.current = null;
    if (!node || resolver.started) return;
    if (typeof IntersectionObserver !== 'function') { resolver.start(); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      resolver.start();
      observer.disconnect();
    }, { rootMargin: '480px' });
    observer.observe(node);
    viewportObserver.current = observer;
  }, [resolver]);
  return [resolver, observe];
}

const SourceMark = () => <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c4.5 4.5 4.5 12.5 0 17-4.5-4.5-4.5-12.5 0-17Z" />
</svg>;

function PublisherIconImage({ src }) {
  const [state, setState] = React.useState('loading');
  return <span className="metabloom-source-icon" aria-hidden="true" data-media-state={state}>
    <SourceMark />
    {state !== 'failed' && <img src={src} width="20" height="20" alt="" loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onLoad={() => setState('ready')} onError={() => setState('failed')} />}
  </span>;
}

// Native images fetch only the authenticated same-origin proxy, never a URL
// supplied by a model or a remote publisher. The neighboring text names the site.
export function MetabloomPublisherIcon({ token }) {
  const src = metabloomSourceMediaUrl(token, 'icon');
  return src ? <PublisherIconImage key={src} src={src} /> : null;
}

// The media slot always holds the same plate while a photograph is pending or
// unavailable: the publisher mark and host, never an empty or collapsing box.
function SourcePlate({ token, host, state }) {
  return <div className="metabloom-source-preview__fallback" aria-hidden="true" data-plate-state={state}>
    <span className="metabloom-source-preview__plate-mark">
      {token ? <MetabloomPublisherIcon token={token} /> : <span className="metabloom-source-icon"><SourceMark /></span>}
    </span>
    <span className="metabloom-source-preview__plate-host">{host}</span>
  </div>;
}

function ArticlePreview({ candidates, compact, tile, resolver, priority }) {
  const root = React.useRef(null);
  const [entries] = React.useState(candidates);
  const requestable = entries.some(entry => entry.token);
  const [visible, setVisible] = React.useState(Boolean(resolver));
  const [attempt, setAttempt] = React.useState(0);
  const latestAttempt = React.useRef(attempt);
  latestAttempt.current = attempt;
  const originalMedia = React.useRef(null);
  const [resolved, setResolved] = React.useState(null);
  const [failedImage, setFailedImage] = React.useState(false);
  const [state, setState] = React.useState(requestable ? 'pending' : 'unavailable');
  React.useEffect(() => {
    // A brief-level resolver owns viewport gating and scheduling for every slide.
    if (resolver || !requestable) return undefined;
    let observer, started = false;
    const load = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      setVisible(true);
    };
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) load();
      }, { rootMargin: '240px' });
      observer.observe(root.current);
    } else load();
    return () => { started = true; observer?.disconnect(); };
  }, [resolver, requestable]);
  React.useEffect(() => {
    // Queue every candidate up front so a failed primary falls through to an
    // alternate that is usually already resolved. The active slide goes first.
    if (!resolver) return;
    entries.forEach((entry, rank) => { if (entry.token) resolver.preview(entry.token, priority * 3 + rank); });
  }, [resolver, entries, priority]);
  React.useEffect(() => {
    if (!visible || !requestable) return undefined;
    const controller = new AbortController();
    setResolved(null); setFailedImage(false); setState('loading');
    const unavailable = () => {
      if (controller.signal.aborted) return;
      if (attempt + 1 < entries.length) setAttempt(attempt + 1);
      else setState('unavailable');
    };
    const { token } = entries[attempt];
    if (!token) { unavailable(); return () => controller.abort(); }
    // Shared resolver work outlives this slide; only this slide's interest ends.
    (resolver ? resolver.preview(token, priority * 3 + attempt)
      : requestMetabloomSourcePreview(token, { signal: controller.signal })).then(result => {
      if (controller.signal.aborted) return;
      if (attempt === 0) originalMedia.current = result;
      if (!result.isArticle || !result.image) { unavailable(); return; }
      setResolved({ attempt, media: result });
    }).catch(unavailable);
    return () => controller.abort();
    // Priority changes reorder queued work; they never restart this attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, attempt, entries, resolver, requestable]);

  const media = resolved?.attempt === attempt ? resolved.media : null;
  const image = !failedImage && media?.isArticle ? media.image : null;
  // A photograph and its outbound link always identify the same cited article.
  // If every candidate fails, keep the first source as the useful text fallback.
  const { source, token, publisher } = image ? entries[attempt] : entries[0];
  const host = new URL(source.url).hostname;
  const action = (image ? media : originalMedia.current)?.isArticle ? 'Read article' : 'Open source';
  const imageFailed = () => {
    if (attempt !== latestAttempt.current) return;
    setFailedImage(true);
    if (attempt + 1 < entries.length) { setAttempt(attempt + 1); setState('loading'); }
    else setState('unavailable');
  };
  const condensed = compact || tile;
  return <div ref={root} className={`metabloom-source-preview${tile ? ' metabloom-source-preview--tile'
    : compact ? ' metabloom-source-preview--compact' : ''}`} data-preview-state={state}>
    <div className="metabloom-source-preview__image-area" aria-busy={state === 'pending' || state === 'loading'}>
      <SourcePlate token={token} host={host} state={state} />
      {/* Resolver-scheduled images load eagerly, even on hidden slides, so the
          photo is already decoded when a reader moves to that slide. */}
      {image && <img className="metabloom-source-preview__image" src={image.src} alt={image.alt}
        width="640" height="360" loading={resolver ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
        onLoad={() => { if (attempt === latestAttempt.current) setState('ready'); }} onError={imageFailed} />}
    </div>
    <div className="metabloom-source-preview__content">
      <div className="metabloom-source-preview__publisher"><MetabloomPublisherIcon token={token} />
        <span className="metabloom-source-preview__publisher-name">{publisher || host}{publisher && <span className="metabloom-source-preview__host">{host}</span>}</span>
        {condensed && <span className="metabloom-source-preview__reference">Source {source.id}</span>}
      </div>
      {!condensed && <p className="metabloom-source-preview__title">{source.title}</p>}
      <a className={`metabloom-source-preview__action${condensed ? ' metabloom-source-preview__article-link' : ''}`}
        href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}
        aria-label={`${action}: ${source.title}`}>
        {condensed ? <span className="metabloom-source-preview__article-title">{source.title}</span> : action}
        <span aria-hidden="true"> ↗</span>
      </a>
    </div>
  </div>;
}

// `fallbackSource` keeps the same card and media plate when no capability is
// available (for example after the session-bound tokens were stripped from a
// restored thread), so every slide keeps one consistent shape.
export function MetabloomArticlePreview({ source, token, publisher, candidates, compact = false, tile = false,
  resolver = null, priority = 0, fallbackSource = null }) {
  const ids = new Set(), tokens = new Set();
  const entries = (Array.isArray(candidates) ? candidates : [{ source, token, publisher }]).slice(0, 3).flatMap(entry => {
    const parsed = entry?.source && parseMetabloomResearchSources([entry.source], { startId: entry.source.id });
    if (!parsed || !parseMetabloomSourceMediaToken(entry.token) || ids.has(parsed[0].id) || tokens.has(entry.token)) return [];
    ids.add(parsed[0].id); tokens.add(entry.token);
    return [{ source: parsed[0], token: entry.token, publisher: typeof entry.publisher === 'string' ? entry.publisher : '' }];
  });
  if (!entries.length && fallbackSource?.source) {
    const parsed = parseMetabloomResearchSources([fallbackSource.source], { startId: fallbackSource.source.id });
    if (parsed) entries.push({ source: parsed[0], token: null,
      publisher: typeof fallbackSource.publisher === 'string' ? fallbackSource.publisher : '' });
  }
  if (!entries.length) return null;
  return <ArticlePreview key={JSON.stringify(entries)} candidates={entries} compact={compact} tile={tile}
    resolver={resolver} priority={Math.max(0, Math.min(Number.isSafeInteger(priority) ? priority : 0, 20))} />;
}

// An ordinary search answer shows images only for the cited sources whose
// article photo actually loaded; pending or imageless sources stay in the
// answer's text source list. The row grows only below the finished answer.
export function MetabloomSourceGallery({ sources, media }) {
  const [resolver, observe] = useMetabloomSourceMediaResolver();
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map(source => [source.id, source]));
  const entries = (Array.isArray(media) ? media : []).filter(entry => sourceMap.has(entry?.sourceId)).slice(0, 4);
  if (!entries.length) return null;
  return <div ref={observe} className="metabloom-source-gallery" role="group" aria-label="Images from cited sources">
    {entries.map((entry, index) => <MetabloomArticlePreview key={`${entry.sourceId}:${entry.token}`}
      source={sourceMap.get(entry.sourceId)} token={entry.token} tile resolver={resolver} priority={index} />)}
  </div>;
}

// A subject photo found for this answer (find_image). Its frame reserves the
// photo's exact aspect ratio before loading, and the credit is always shown:
// title, author, licence and the Wikimedia Commons file page.
function AnswerImage({ image }) {
  const [state, setState] = React.useState('loading');
  const src = metabloomSourceMediaUrl(image.token, 'image');
  const external = { target: '_blank', rel: 'noopener noreferrer' };
  return <figure className="metabloom-answer-image" data-image-state={state}
    style={{ '--metabloom-image-ratio': `${image.width} / ${image.height}`, '--metabloom-image-aspect': image.width / image.height }}>
    <div className="metabloom-answer-image__frame">
      {src && state !== 'failed' && <img className="metabloom-answer-image__photo" src={src} alt={image.alt}
        width={image.width} height={image.height} decoding="async" referrerPolicy="no-referrer"
        onLoad={() => setState('ready')} onError={() => setState('failed')} />}
      {state === 'failed' && <span className="metabloom-answer-image__unavailable">Photo unavailable</span>}
    </div>
    <figcaption className="metabloom-answer-image__caption">
      <a className="metabloom-answer-image__title" href={image.pageUrl} {...external}>
        {image.title}<span aria-hidden="true"> ↗</span><span className="metabloom-sr-only"> (Wikipedia, opens in a new tab)</span>
      </a>
      <span className="metabloom-answer-image__credit">
        Photo: {image.artist} · {image.licenseUrl
          ? <a href={image.licenseUrl} {...external}>{image.license}<span className="metabloom-sr-only"> licence, opens in a new tab</span></a>
          : image.license} · <a href={image.fileUrl} {...external}>Wikimedia Commons<span className="metabloom-sr-only"> file page, opens in a new tab</span></a>
      </span>
    </figcaption>
  </figure>;
}

export function MetabloomAnswerImages({ images }) {
  const entries = (Array.isArray(images) ? images : []).filter(image => metabloomSourceMediaUrl(image?.token, 'image')).slice(0, 2);
  if (!entries.length) return null;
  return <div className="metabloom-answer-images" data-count={entries.length}>
    {entries.map(image => <AnswerImage key={image.token} image={image} />)}
  </div>;
}
