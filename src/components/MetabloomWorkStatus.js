import React from 'react';
import { METABLOOM_PROGRESS_WAIT_MS } from './metabloomAgentTools';
import './MetabloomResearchStatus.css';

export default function MetabloomWorkStatus({ progress }) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const waiting = now - progress.updatedAt >= METABLOOM_PROGRESS_WAIT_MS;
  const elapsed = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  return <div className="metabloom-chat__message metabloom-chat__message--assistant metabloom-research-status metabloom-work-status"
    role="status" aria-label="Work progress" aria-live="polite" aria-atomic="true">
    <span className="metabloom-chat__sr-only">{progress.label}.</span>
    <span className="metabloom-research-status__visual" aria-hidden="true">
      <span className="metabloom-research-status__text">{progress.label}</span>
      <span className="metabloom-research-status__dots"><span>.</span><span>.</span><span>.</span></span>
    </span>
    {progress.summary && <small className="metabloom-research-status__detail">{progress.summary}</small>}
    {waiting && <small>Waiting for the next update.</small>}
    <small aria-hidden="true">{elapsed}s elapsed</small>
  </div>;
}
