import React from 'react';
import { metabloomSourceMediaUrl, parseMetabloomSourceMediaToken } from './metabloomSourceMediaProtocol';
import { parseMetabloomResearchSources } from './metabloomResearchSources';
import { requestMetabloomSourcePreview } from './metabloomSourceMediaClient';
import './MetabloomSourceMedia.css';

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

function ArticlePreview({ candidates, compact }) {
  const root = React.useRef(null);
  const [entries] = React.useState(candidates);
  const [visible, setVisible] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const latestAttempt = React.useRef(attempt);
  latestAttempt.current = attempt;
  const originalMedia = React.useRef(null);
  const [resolved, setResolved] = React.useState(null);
  const [failedImage, setFailedImage] = React.useState(false);
  const [state, setState] = React.useState('pending');
  React.useEffect(() => {
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
  }, []);
  React.useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    setResolved(null); setFailedImage(false); setState('loading');
    const unavailable = () => {
      if (controller.signal.aborted) return;
      if (attempt + 1 < entries.length) setAttempt(attempt + 1);
      else setState('unavailable');
    };
    requestMetabloomSourcePreview(entries[attempt].token, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (attempt === 0) originalMedia.current = result;
      if (!result.isArticle || !result.image) { unavailable(); return; }
      setResolved({ attempt, media: result });
    }).catch(unavailable);
    return () => controller.abort();
  }, [visible, attempt, entries]);

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
  return <div ref={root} className={`metabloom-source-preview${compact ? ' metabloom-source-preview--compact' : ''}`}
    data-preview-state={state}>
    <div className="metabloom-source-preview__image-area" aria-busy={state === 'pending' || state === 'loading'}>
      <div className="metabloom-source-preview__fallback" aria-hidden="true"><SourceMark /><span>Original source</span></div>
      {image && <img className="metabloom-source-preview__image" src={image.src} alt={image.alt}
        width="640" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={() => { if (attempt === latestAttempt.current) setState('ready'); }} onError={imageFailed} />}
    </div>
    <div className="metabloom-source-preview__content">
      <div className="metabloom-source-preview__publisher"><MetabloomPublisherIcon token={token} />
        <span>{publisher || host}{publisher && <span className="metabloom-source-preview__host">{host}</span>}</span>
      </div>
      {!compact && <p className="metabloom-source-preview__title">{source.title}</p>}
      <a className="metabloom-source-preview__action" href={source.url} target="_blank" rel="noopener noreferrer"
        aria-label={`${action}: ${source.title}`}>
        {action}
        <span aria-hidden="true"> ↗</span>
      </a>
    </div>
  </div>;
}

export function MetabloomArticlePreview({ source, token, publisher, candidates, compact = false }) {
  const ids = new Set(), tokens = new Set();
  const entries = (Array.isArray(candidates) ? candidates : [{ source, token, publisher }]).slice(0, 3).flatMap(entry => {
    const parsed = entry?.source && parseMetabloomResearchSources([entry.source], { startId: entry.source.id });
    if (!parsed || !parseMetabloomSourceMediaToken(entry.token) || ids.has(parsed[0].id) || tokens.has(entry.token)) return [];
    ids.add(parsed[0].id); tokens.add(entry.token);
    return [{ source: parsed[0], token: entry.token, publisher: typeof entry.publisher === 'string' ? entry.publisher : '' }];
  });
  if (!entries.length) return null;
  return <ArticlePreview key={JSON.stringify(entries)} candidates={entries} compact={compact} />;
}
