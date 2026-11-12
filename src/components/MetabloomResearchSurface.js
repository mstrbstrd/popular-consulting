import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomResearchBrief from './MetabloomResearchBrief';
import MetabloomWorkspaceContext from './MetabloomWorkspaceContext';
import { parseMetabloomResearchReferenceMetadata } from './metabloomResearchReference';
import { renderMetabloomResearchBlocks } from './metabloomResearchText';

const researchTime = value => new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'UTC',
}).format(new Date(value));
const researchDate = value => new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

export const ResearchReferenceDates = ({ reference, expired }) => <>
  <span>Research date <time dateTime={reference.localDate}>{researchDate(reference.localDate)}</time> · {reference.timeZone}</span>
  <span>As of <time dateTime={reference.asOf}>{researchTime(reference.asOf)}</time> UTC</span>
  <span>{expired ? 'Reuse expired' : 'Reuse expires'} <time dateTime={reference.expiresAt}>
    {researchTime(reference.expiresAt)}</time> UTC · available for one hour</span>
</>;

const MetabloomFullResearch = ({ report, initiallyExpanded = false }) => {
  const [expanded, setExpanded] = React.useState(initiallyExpanded);
  const [sourcesExpanded, setSourcesExpanded] = React.useState(false);
  const [visibleSources, setVisibleSources] = React.useState(20);
  return (
    <details className="metabloom-chat__full-research" open={expanded}
      data-research-fallback={initiallyExpanded ? 'true' : undefined}
      onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Full research</summary>
      {expanded && (
        <div className="metabloom-chat__research-report" role="group" aria-label="Completed research">
          <div className="metabloom-chat__research-report-text">{renderMetabloomResearchBlocks(report)}</div>
          <details className="metabloom-chat__sources" onToggle={event => setSourcesExpanded(event.currentTarget.open)}>
            <summary>Research sources ({report.sources.length})</summary>
            {sourcesExpanded && (
              <>
                <ol>
                  {report.sources.slice(0, visibleSources).map(source => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                      <span className="metabloom-chat__source-domain">{new URL(source.url).hostname}</span>
                    </li>
                  ))}
                </ol>
                {visibleSources < report.sources.length && (
                  <button type="button" className="metabloom-chat__more-sources" onClick={() => setVisibleSources(count => count + 20)}>
                    Show {Math.min(20, report.sources.length - visibleSources)} more sources
                  </button>
                )}
              </>
            )}
          </details>
        </div>
      )}
    </details>
  );
};

export default function MetabloomResearchSurface({ messageId, report, brief, reference,
  referenceExpired = false, referenceUnavailable = false, isActive = true,
  status, reused = false, onUseReference, savedTitle }) {
  const workspace = React.useContext(MetabloomWorkspaceContext);
  const originRef = React.useRef(null);
  const registrationRef = React.useRef(null);
  const [registeredController, setRegisteredController] = React.useState(null);
  const [slot] = React.useState(() => {
    const element = document.createElement('div');
    element.className = 'metabloom-research-slot';
    return element;
  });
  const terminal = ['complete', 'error', 'interrupted'].includes(status);
  const source = parseMetabloomResearchReferenceMetadata(reference) || undefined;
  const title = savedTitle || brief?.title || source?.title || 'Research report';
  const count = brief?.items.length;
  const summary = [
    brief?.coverage.status === 'unavailable' ? 'Summary unavailable'
      : brief ? `${count} ${brief.kind === 'news' ? (count === 1 ? 'story' : 'stories') : (count === 1 ? 'finding' : 'findings')}` : null,
    `${report.sources.length} ${report.sources.length === 1 ? 'source' : 'sources'}`,
    brief?.localDate || source?.localDate,
  ].filter(Boolean).join(' · ');
  const presentationRef = React.useRef(null);
  presentationRef.current = { title, summary, source };

  React.useLayoutEffect(() => {
    const origin = originRef.current;
    if (!origin) return undefined;
    // React owns the portal's children, while the workspace owns where its one
    // container lives. A metadata or view change must never replace that container.
    slot.dataset.researchMessageId = messageId;
    slot.hidden = false;
    origin.appendChild(slot);
    const descriptor = { messageId, slot, origin, ...presentationRef.current };
    const unregister = terminal ? workspace?.registerResearchSurface(descriptor) : undefined;
    const registered = typeof unregister === 'function';
    registrationRef.current = registered ? { controller: workspace, descriptor } : null;
    setRegisteredController(registered ? workspace : null);
    if (!registered) {
      slot.hidden = false;
      origin.appendChild(slot);
    }
    return () => {
      if (registered) unregister();
      if (registrationRef.current?.descriptor === descriptor) registrationRef.current = null;
      slot.hidden = false;
      slot.remove();
    };
  }, [messageId, slot, terminal, workspace]);

  React.useLayoutEffect(() => {
    const registration = registrationRef.current;
    if (registration?.controller === workspace) {
      workspace.updateResearchSurface(registration.descriptor, presentationRef.current);
    }
  }, [source, summary, title, workspace]);

  const openResearch = () => {
    const registration = registrationRef.current;
    if (registration?.controller === workspace) workspace.activateResearchSurface(registration.descriptor,
      { explicit: true, focus: true, view: 'expanded' });
  };
  const workspaceReport = workspace && registeredController === workspace && !brief;
  const fallback = terminal && (brief?.coverage.status === 'unavailable' || (!brief && status !== 'complete') || workspaceReport);
  const reuseDisabled = !isActive || referenceExpired || referenceUnavailable;

  return <>
    <div className="metabloom-research-origin" ref={originRef} data-research-message-id={messageId}>
      <div className="metabloom-research-launcher">
        {registeredController && registeredController === workspace && <button type="button"
          aria-label={`Open research: ${title}`} onClick={openResearch}>
          <span>Open research</span><strong>{title}</strong><span>{summary}</span>
        </button>}
      </div>
    </div>
    {createPortal(<>
      {brief && status !== 'streaming' && <MetabloomResearchBrief brief={brief} sources={report.sources}
        reuseDisabled={reuseDisabled}
        onUseBrief={source?.briefId ? () => onUseReference?.(source,
          { type: 'brief', briefId: source.briefId }, brief.title) : undefined}
        onUseFinding={source?.briefId ? (index, item) => onUseReference?.(source,
          { type: 'finding', briefId: source.briefId, index }, item.headline) : undefined} />}
      {source && status !== 'streaming' && <div className="metabloom-chat__research-reuse"
        data-research-reused={reused ? 'true' : 'false'} role="group" aria-label="Research reuse">
        <div className="metabloom-chat__research-reference-copy">
          <strong>{reused ? 'Reused sources' : 'Saved research'}</strong>
          <span>{source.title}</span>
          <ResearchReferenceDates reference={source} expired={referenceExpired} />
          {referenceUnavailable && <span>Reuse is no longer available. The report remains readable.</span>}
        </div>
        <button type="button" disabled={reuseDisabled} onClick={() => onUseReference?.(source)}>Use this research</button>
      </div>}
      <MetabloomFullResearch key={fallback ? 'fallback' : 'optional'} report={report} initiallyExpanded={Boolean(fallback)} />
    </>, slot, messageId)}
  </>;
}
