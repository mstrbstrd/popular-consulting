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

function Citations({ sourceIds, sourceMap }) {
  return <span className="metabloom-research-brief__citations">
    {sourceIds.map(id => {
      const source = sourceMap.get(id);
      return source ? <React.Fragment key={id}>{' '}<a href={source.url} target="_blank" rel="noopener noreferrer"
        aria-label={`Source ${id}: ${source.title}`} title={source.title}>[{id}]</a></React.Fragment> : null;
    })}
  </span>;
}

function BriefItem({ item, index, news, id, sourceMap, mediaMap, detailsMap }) {
  const hasDepth = item.background.length > 0 || Boolean(item.whyItMatters)
    || item.uncertainty.length > 0 || item.watchNext.length > 0 || item.dateEvidence;
  const showEvidenceStatus = news || ['disputed', 'uncertain'].includes(item.evidenceStatus);
  const mediaSourceId = news && ([item.dateEvidence?.sourceId, ...item.sourceIds]
    .find(sourceId => mediaMap.has(sourceId) && sourceMap.has(sourceId)));
  const mediaSource = sourceMap.get(mediaSourceId);
  return <li className="metabloom-research-brief__item">
    <article aria-labelledby={`${id}-title`}>
      <div className="metabloom-research-brief__item-kicker">
        <span className="metabloom-research-brief__item-number">{news ? 'Story' : 'Finding'} {index + 1}</span>
        {showEvidenceStatus && <span className="metabloom-research-brief__evidence-status"
          data-evidence-status={item.evidenceStatus}>{evidenceLabels[item.evidenceStatus]}</span>}
      </div>
      <h4 id={`${id}-title`}>{item.headline}</h4>
      {news && <div className="metabloom-research-brief__dates">
        <span>Development: {item.developmentDate
          ? <time dateTime={item.developmentDate}>{calendarDate(item.developmentDate)}</time>
          : 'date not established'}</span>
        {item.scheduledDate && <span>Scheduled: <time dateTime={item.scheduledDate}>{calendarDate(item.scheduledDate)}</time></span>}
      </div>}
      {mediaSource && <MetabloomArticlePreview source={mediaSource} token={mediaMap.get(mediaSourceId)}
        publisher={detailsMap.get(mediaSourceId)?.publisher} />}
      <p className="metabloom-research-brief__overview">{item.summary}<Citations sourceIds={item.sourceIds} sourceMap={sourceMap} /></p>
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
  const itemNoun = news ? 'stories' : 'findings';
  const singleItemNoun = news ? 'story' : 'finding';
  const countText = coverage.requestedCount !== null
    ? `${coverage.returnedCount} of ${coverage.requestedCount} ${coverage.requestedCount === 1 ? singleItemNoun : itemNoun}`
    : `${coverage.returnedCount} ${coverage.returnedCount === 1 ? singleItemNoun : itemNoun}`;
  const coverageLabel = coverage.status === 'partial' ? 'Partial coverage'
    : coverage.status === 'unavailable' ? 'Coverage unavailable'
      : coverage.requestedCount !== null ? 'Requested coverage complete' : 'Brief ready';

  return <section className="metabloom-research-brief" aria-labelledby={`${id}-title`}
    data-research-brief-kind={safeBrief.kind} data-coverage-status={coverage.status}>
    <header className="metabloom-research-brief__header">
      <p className="metabloom-research-brief__eyebrow">{news ? 'News briefing' : 'Research brief'}</p>
      <h3 id={`${id}-title`}>{safeBrief.title}</h3>
      <p className="metabloom-research-brief__scope">{safeBrief.scope}</p>
      <dl className="metabloom-research-brief__context">
        <div><dt>As of</dt><dd><time dateTime={safeBrief.asOf}>{asOfTime(safeBrief.asOf, safeBrief.timeZone)}</time></dd></div>
        <div><dt>Timezone</dt><dd>{safeBrief.timeZone}</dd></div>
        {news && safeBrief.windowStart && safeBrief.windowEnd && <div className="metabloom-research-brief__window">
          <dt>Covered interval</dt><dd><time dateTime={safeBrief.windowStart}>{calendarDate(safeBrief.windowStart)}</time>
            {safeBrief.windowStart !== safeBrief.windowEnd && <> to <time dateTime={safeBrief.windowEnd}>{calendarDate(safeBrief.windowEnd)}</time></>}
          </dd>
        </div>}
      </dl>
    </header>
    <div className="metabloom-research-brief__coverage">
      <div className="metabloom-research-brief__coverage-heading"><strong>{countText}</strong><span>{coverageLabel}</span></div>
      {coverage.limitations.length > 0 && <ul aria-label="Coverage limitations">{coverage.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    </div>
    {safeBrief.items.length > 0 && <ol className="metabloom-research-brief__items" aria-label={news ? 'Covered stories' : 'Research findings'}>
      {safeBrief.items.map((item, index) => <BriefItem key={index} item={item} index={index} news={news} id={`${id}-item-${index + 1}`}
        sourceMap={sourceMap} mediaMap={mediaMap} detailsMap={detailsMap} />)}
    </ol>}
    <SourceEvidence brief={safeBrief} sourceMap={sourceMap} mediaMap={mediaMap} />
  </section>;
}
