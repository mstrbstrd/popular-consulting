import React from 'react';
import { metabloomSourceMediaUrl, parseMetabloomSourceMediaToken } from './metabloomSourceMediaProtocol';
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

function ArticlePreview({ source, token, publisher }) {
  const root = React.useRef(null);
  const [media, setMedia] = React.useState(null);
  const [failedImage, setFailedImage] = React.useState(false);
  const [state, setState] = React.useState('pending');
  React.useEffect(() => {
    const controller = new AbortController();
    let observer, started = false;
    const load = () => {
      if (started || controller.signal.aborted) return;
      started = true;
      observer?.disconnect();
      requestMetabloomSourcePreview(token, { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        setMedia(result);
        setState(result.image ? 'loading' : 'unavailable');
      }).catch(() => { if (!controller.signal.aborted) setState('unavailable'); });
    };
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) load();
      }, { rootMargin: '240px' });
      observer.observe(root.current);
    } else load();
    return () => { controller.abort(); observer?.disconnect(); };
  }, [token]);

  const host = new URL(source.url).hostname;
  const image = !failedImage && media?.isArticle ? media.image : null;
  const action = media?.isArticle ? 'Read article' : 'Open source';
  return <div ref={root} className="metabloom-source-preview" data-preview-state={state}>
    <div className="metabloom-source-preview__image-area">
      <div className="metabloom-source-preview__fallback" aria-hidden="true"><SourceMark /><span>Original source</span></div>
      {image && <img className="metabloom-source-preview__image" src={image.src} alt={image.alt}
        width="640" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={() => setState('ready')} onError={() => { setFailedImage(true); setState('unavailable'); }} />}
    </div>
    <div className="metabloom-source-preview__content">
      <div className="metabloom-source-preview__publisher"><MetabloomPublisherIcon token={token} />
        <span>{publisher || host}{publisher && <span className="metabloom-source-preview__host">{host}</span>}</span>
      </div>
      <p className="metabloom-source-preview__title">{source.title}</p>
      <a className="metabloom-source-preview__action" href={source.url} target="_blank" rel="noopener noreferrer"
        aria-label={`${action}: ${source.title}`}>
        {action}
        <span aria-hidden="true"> ↗</span>
      </a>
    </div>
  </div>;
}

export function MetabloomArticlePreview({ source, token, publisher }) {
  if (!source || !parseMetabloomSourceMediaToken(token)) return null;
  return <ArticlePreview key={`${source.id}:${token}`} source={source} token={token} publisher={publisher} />;
}
