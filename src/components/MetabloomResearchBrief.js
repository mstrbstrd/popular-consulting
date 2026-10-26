import React from 'react';
import { parseMetabloomResearchBrief } from './metabloomResearchBriefProtocol';
import { parseMetabloomResearchSources } from './metabloomResearchSources';
import { MetabloomArticlePreview, MetabloomPublisherIcon } from './MetabloomSourceMedia';
import './MetabloomResearchBrief.css';

const evidenceLabels = {
  announced: 'Announced', reported: 'Reported', disputed: 'Disputed', uncertain: 'Uncertain',
};
const sourceTypeLabels = {
  official: 'Official source', reporting: 'Reporting', syndicated: 'Syndicated reporting',
  analysis: 'Analysis', unknown: 'Source type not established',
};

// A date without a time stays a calendar date in every viewer's timezone.
const calendarDate = value => new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

const asOfTime = (value, timeZone) => new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone,
}).format(new Date(value));

function BriefContext({ brief, windowLabel = 'Covered interval', includeCoverage = false }) {
  return <dl className="metabloom-research-brief__context">
    {includeCoverage && brief.coverage.requestedCount !== null && <>
      <div><dt>Briefing target</dt><dd>{brief.coverage.requestedCount}</dd></div>
      <div><dt>Included</dt><dd>{brief.items.length}</dd></div>
    </>}
    <div><dt>As of</dt><dd><time dateTime={brief.asOf}>{asOfTime(brief.asOf, brief.timeZone)}</time></dd></div>
    <div><dt>Timezone</dt><dd>{brief.timeZone}</dd></div>
    {brief.kind === 'news' && brief.windowStart && brief.windowEnd && <div className="metabloom-research-brief__window">
      <dt>{windowLabel}</dt><dd><time dateTime={brief.windowStart}>{calendarDate(brief.windowStart)}</time>
        {brief.windowStart !== brief.windowEnd && <> to <time dateTime={brief.windowEnd}>{calendarDate(brief.windowEnd)}</time></>}
      </dd>
    </div>}
  </dl>;
}

function Citations({ sourceIds, sourceMap }) {
  return <span className="metabloom-research-brief__citations">
    {sourceIds.map(id => {
      const source = sourceMap.get(id);
      return source ? <React.Fragment key={id}>{' '}<a href={source.url} target="_blank" rel="noopener noreferrer"
        aria-label={`Source ${id}: ${source.title}`} title={source.title}>[{id}]</a></React.Fragment> : null;
    })}
  </span>;
}

function BriefItem({ item, index, active, news, id, sourceMap, mediaMap, detailsMap }) {
  const hasDepth = item.background.length > 0 || Boolean(item.whyItMatters)
    || item.uncertainty.length > 0 || item.watchNext.length > 0 || item.dateEvidence;
  const showEvidenceStatus = news || ['disputed', 'uncertain'].includes(item.evidenceStatus);
  const mediaCandidates = news ? Array.from(new Set([item.dateEvidence?.sourceId, ...item.sourceIds]))
    .filter(sourceId => mediaMap.has(sourceId) && sourceMap.has(sourceId)).slice(0, 3)
    .map(sourceId => ({ source: sourceMap.get(sourceId), token: mediaMap.get(sourceId),
      publisher: detailsMap.get(sourceId)?.publisher })) : [];
  return <li id={id} className="metabloom-research-brief__item" hidden={!active}
    data-slide-index={index + 1} aria-roledescription="slide">
    <article aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>{item.headline}</h4>
      <div className="metabloom-research-brief__item-kicker">
        {showEvidenceStatus && <span className="metabloom-research-brief__evidence-status"
          data-evidence-status={item.evidenceStatus}>{evidenceLabels[item.evidenceStatus]}</span>}
        {news && <div className="metabloom-research-brief__dates">
          <span><span className="metabloom-research-brief__date-label">Development · </span>{item.developmentDate
            ? <time dateTime={item.developmentDate}>{calendarDate(item.developmentDate)}</time>
            : 'Date not established'}</span>
          {item.scheduledDate && <span>Scheduled: <time dateTime={item.scheduledDate}>{calendarDate(item.scheduledDate)}</time></span>}
        </div>}
      </div>
      <p className="metabloom-research-brief__overview">{item.summary}<Citations sourceIds={item.sourceIds} sourceMap={sourceMap} /></p>
      {mediaCandidates.length > 0 && <MetabloomArticlePreview candidates={mediaCandidates} compact />}
      {hasDepth && <details className="metabloom-research-brief__details">
        <summary>Analysis and context<span className="metabloom-research-brief__sr-only">: {item.headline}</span></summary>
        <div className="metabloom-research-brief__depth">
          {item.whyItMatters && <section className="metabloom-research-brief__section">
            <h5 id={`${id}-analysis`}>Why it matters <span className="metabloom-research-brief__analysis-label">Analysis</span></h5>
            <p>{item.whyItMatters}</p>
          </section>}
          {item.background.length > 0 && <section className="metabloom-research-brief__section">
            <h5 id={`${id}-background`}>Background</h5>
            {item.background.map((claim, claimIndex) => <p key={claimIndex}>{claim.text}<Citations sourceIds={claim.sourceIds} sourceMap={sourceMap} /></p>)}
          </section>}
          {item.uncertainty.length > 0 && <section className="metabloom-research-brief__section">
            <h5 id={`${id}-uncertainty`}>What is uncertain</h5>
            <ul>{item.uncertainty.map((text, textIndex) => <li key={textIndex}>{text}</li>)}</ul>
          </section>}
          {item.watchNext.length > 0 && <section className="metabloom-research-brief__section">
            <h5 id={`${id}-watch`}>Watch next</h5>
            <ul>{item.watchNext.map((text, textIndex) => <li key={textIndex}>{text}</li>)}</ul>
          </section>}
          {news && item.dateEvidence && <section className="metabloom-research-brief__section">
            <h5 id={`${id}-date-evidence`}>Date evidence</h5>
            <blockquote cite={sourceMap.get(item.dateEvidence.sourceId)?.url}><p>{item.dateEvidence.quote}</p></blockquote>
            <p className="metabloom-research-brief__excerpt-label">Supporting research excerpt<Citations sourceIds={[item.dateEvidence.sourceId]} sourceMap={sourceMap} /></p>
          </section>}
        </div>
      </details>}
    </article>
  </li>;
}

const NavigationArrow = ({ previous = false }) => <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
  <path d={previous ? 'm10 3-5 5 5 5' : 'm6 3 5 5-5 5'} />
</svg>;

function BriefCarousel({ brief, id, sourceMap, mediaMap, detailsMap }) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const activeIndex = Math.min(selectedIndex, brief.items.length - 1);
  const news = brief.kind === 'news';
  const noun = news ? 'story' : 'finding';
  const label = news ? 'Story' : 'Finding';
  const changeSlide = index => setSelectedIndex(Math.max(0, Math.min(index, brief.items.length - 1)));
  const handleNavigationKey = event => {
    // Native selects own their keyboard interaction, including arrows/Home/End.
    if (event.target.tagName !== 'BUTTON' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const nextIndex = { ArrowLeft: activeIndex - 1, ArrowRight: activeIndex + 1,
      Home: 0, End: brief.items.length - 1 }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    changeSlide(nextIndex);
  };

  return <>
    <div className="metabloom-research-brief__navigation" role="group" aria-label={`${label} navigation`}
      onKeyDown={handleNavigationKey}>
      <button type="button" aria-label={`Previous ${noun}`} aria-controls={`${id}-items`}
        aria-disabled={activeIndex === 0} onClick={() => changeSlide(activeIndex - 1)}>
        <NavigationArrow previous /><span>Previous</span>
      </button>
      <div className="metabloom-research-brief__selection">
        <label htmlFor={`${id}-selection`} className="metabloom-research-brief__sr-only">Choose a {noun}</label>
        <select id={`${id}-selection`} value={activeIndex} aria-controls={`${id}-items`}
          onChange={event => changeSlide(Number(event.target.value))}>
          {brief.items.map((item, index) => <option key={item.headline} value={index}>
            {label} {index + 1} of {brief.items.length}
          </option>)}
        </select>
      </div>
      <button type="button" aria-label={`Next ${noun}`} aria-controls={`${id}-items`}
        aria-disabled={activeIndex === brief.items.length - 1} onClick={() => changeSlide(activeIndex + 1)}>
        <span>Next</span><NavigationArrow />
      </button>
    </div>
    <p className="metabloom-research-brief__sr-only" role="status" aria-live="polite" aria-atomic="true">
      {label} {activeIndex + 1} of {brief.items.length}
    </p>
    <ol id={`${id}-items`} className="metabloom-research-brief__items" aria-label={news ? 'Covered stories' : 'Research findings'}>
      {brief.items.map((item, index) => <BriefItem key={item.headline} item={item} index={index}
        active={index === activeIndex} news={news} id={`${id}-item-${index + 1}`}
        sourceMap={sourceMap} mediaMap={mediaMap} detailsMap={detailsMap} />)}
    </ol>
  </>;
}

function SourceEvidence({ brief, sourceMap, mediaMap }) {
  const detailsMap = new Map(brief.sourceDetails.map(detail => [detail.sourceId, detail]));
  const ids = new Set(brief.sourceDetails.map(detail => detail.sourceId));
  brief.items.forEach(item => {
    item.sourceIds.forEach(id => ids.add(id));
    item.background.forEach(claim => claim.sourceIds.forEach(id => ids.add(id)));
    if (item.dateEvidence) ids.add(item.dateEvidence.sourceId);
  });
  const citedSources = Array.from(ids).sort((a, b) => a - b).map(id => sourceMap.get(id)).filter(Boolean);
  if (citedSources.length === 0) return null;
  return <details className="metabloom-research-brief__details metabloom-research-brief__sources">
    <summary>Sources and evidence <span className="metabloom-research-brief__source-count">({citedSources.length})</span></summary>
    <ol className="metabloom-research-brief__source-list" aria-label="Sources for this research brief">
      {citedSources.map(source => {
        const detail = detailsMap.get(source.id);
        const host = new URL(source.url).hostname;
        return <li key={source.id} value={source.id}>
          <div className="metabloom-research-brief__source-heading">
            <span className="metabloom-research-brief__source-id" aria-hidden="true">[{source.id}]</span>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          </div>
          <p className="metabloom-research-brief__source-publisher"><MetabloomPublisherIcon token={mediaMap.get(source.id)} />{detail?.publisher || host}
            {detail?.publisher && <span className="metabloom-research-brief__source-host">{host}</span>}
          </p>
          <dl className="metabloom-research-brief__source-meta">
            <div><dt>Published</dt><dd>{detail?.publishedDate
              ? <time dateTime={detail.publishedDate}>{calendarDate(detail.publishedDate)}</time>
              : 'Date not established'}</dd></div>
            <div><dt>Source type</dt><dd>{sourceTypeLabels[detail?.sourceType || 'unknown']}</dd></div>
          </dl>
          {detail?.dateEvidence && <div className="metabloom-research-brief__source-excerpt">
            <p className="metabloom-research-brief__excerpt-label">Publication-date evidence from the research</p>
            <blockquote cite={source.url}><p>{detail.dateEvidence}</p></blockquote>
          </div>}
        </li>;
      })}
    </ol>
  </details>;
}

export default function MetabloomResearchBrief({ brief, sources }) {
  const id = React.useId();
  let safeBrief;
  let safeSources;
  try {
    safeSources = Array.isArray(sources) && sources.length === 0 ? []
      : parseMetabloomResearchSources(sources, { maxSources: sources?.length });
    if (!safeSources) return null;
    safeBrief = parseMetabloomResearchBrief(brief, { sources: safeSources });
  } catch { return null; }
  if (!safeBrief) return null;

  const sourceMap = new Map(safeSources.map(source => [source.id, source]));
  const mediaMap = new Map((safeBrief.media || []).map(entry => [entry.sourceId, entry.token]));
  const detailsMap = new Map(safeBrief.sourceDetails.map(detail => [detail.sourceId, detail]));
  const news = safeBrief.kind === 'news';
  const { coverage } = safeBrief;
  // The completed report is the reading surface when no structured items
  // qualify. Keep the explanation available without leading with an empty card.
  if (coverage.status === 'unavailable') return <details
    className="metabloom-research-brief metabloom-research-brief--fallback"
    data-research-brief-kind={safeBrief.kind} data-coverage-status={coverage.status}>
    <summary>Briefing notes</summary>
    <div className="metabloom-research-brief__fallback-notes">
      <p className="metabloom-research-brief__scope">{safeBrief.scope}</p>
      <BriefContext brief={safeBrief} windowLabel="Requested interval" />
      <ul aria-label="Coverage limitations">{coverage.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </div>
  </details>;
  const itemNoun = news ? 'stories' : 'findings';
  const singleItemNoun = news ? 'story' : 'finding';
  // The visible total and the carousel describe the same available slides.
  // The requested target belongs with the coverage explanation below.
  const countText = `${safeBrief.items.length} ${safeBrief.items.length === 1 ? singleItemNoun : itemNoun}`;
  const coverageLabel = coverage.status === 'partial' ? 'Partial coverage' : 'Complete';
  const headerStart = news && safeBrief.windowStart ? safeBrief.windowStart : safeBrief.localDate;
  const headerEnd = news && safeBrief.windowEnd ? safeBrief.windowEnd : headerStart;

  return <section className="metabloom-research-brief" aria-label={safeBrief.title} aria-roledescription="carousel"
    data-research-brief-kind={safeBrief.kind} data-coverage-status={coverage.status}>
    <header className="metabloom-research-brief__header">
      <div className="metabloom-research-brief__header-line">
        <h3>{news ? 'News briefing' : 'Research brief'}</h3>
        <p className="metabloom-research-brief__header-date"><time dateTime={headerStart}>{calendarDate(headerStart)}</time>
          {headerStart !== headerEnd && <> – <time dateTime={headerEnd}>{calendarDate(headerEnd)}</time></>}
        </p>
      </div>
      <p className="metabloom-research-brief__coverage-heading">
        <strong>{countText}</strong>
        <span className="metabloom-research-brief__coverage-status">{coverageLabel}</span>
      </p>
    </header>
    <BriefCarousel brief={safeBrief} id={id} sourceMap={sourceMap} mediaMap={mediaMap} detailsMap={detailsMap} />
    <details className="metabloom-research-brief__details metabloom-research-brief__briefing-details">
      <summary>Briefing details</summary>
      <p className="metabloom-research-brief__full-title">{safeBrief.title}</p>
      <p className="metabloom-research-brief__scope">{safeBrief.scope}</p>
      <BriefContext brief={safeBrief} includeCoverage />
      {coverage.limitations.length > 0 && <ul aria-label="Coverage limitations">{coverage.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    </details>
    <SourceEvidence brief={safeBrief} sourceMap={sourceMap} mediaMap={mediaMap} />
  </section>;
}
