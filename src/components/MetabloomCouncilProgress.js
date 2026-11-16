import React from 'react';
import MetabloomWorkStatus from './MetabloomWorkStatus';
import { councilStep } from './metabloomCouncilProtocol';
import { METABLOOM_PROVIDERS } from './metabloomModelProtocol';

export default function MetabloomCouncilProgress({ events, pending }) {
  const startedAt = React.useRef(Date.now());
  const { last, updatedAt } = React.useMemo(() => ({ last: events.at(-1), updatedAt: Date.now() }), [events]);
  const start = events.find(event => event.type === 'council_start');
  if (!start) return null;
  const current = last?.type === 'council_step' ? councilStep(last.index, start.members, start.chair) : null;
  return <section className="metabloom-council" aria-label="Council discussion">
    <p>{start.members.map(member => `${METABLOOM_PROVIDERS[member.provider]}: ${member.model}`).join(" · ")}</p>
    {pending ? <MetabloomWorkStatus progress={{ startedAt: startedAt.current, updatedAt,
      label: current ? `${current.round} · ${METABLOOM_PROVIDERS[current.member.provider]} · ${last.state === 'repairing' ? 'Correcting response format' : last.state === 'running' ? 'Responding' : 'Complete'}` : 'Council starting',
      summary: 'Independent views, peer critique, then synthesis.',
    }} /> : <p role="status">Council incomplete{current ? ` during ${current.round} · ${METABLOOM_PROVIDERS[current.member.provider]}` : ''}. Contributions below are provisional.</p>}
    {events.filter(event => event.type === 'council_step' && event.state === 'complete').map(event => {
      const step = councilStep(event.index, start.members, start.chair);
      return <details key={event.index}>
        <summary>{step.round} · {METABLOOM_PROVIDERS[step.member.provider]} · {step.member.model}</summary>
        <p>{event.text}</p>
      </details>;
    })}
  </section>;
}
