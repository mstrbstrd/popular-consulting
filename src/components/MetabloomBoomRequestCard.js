import React from 'react';
import { METABLOOM_BOOM_FIELDS, METABLOOM_BOOM_REQUEST_NOTICE, METABLOOM_BOOM_REQUEST_URL,
  boomRequestView, boomRequestDownload } from './metabloomBoomRequest';
import './MetabloomBoomRequestCard.css';

export default function MetabloomBoomRequestCard({ draft }) {
  const view = boomRequestView(draft);
  const [downloadError, setDownloadError] = React.useState(false);
  const download = () => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([boomRequestDownload(draft)], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `boom-system-demo-request-r${draft.revision}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      // Keep the download URL alive until the browser has consumed the click.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadError(false);
    } catch { if (url) URL.revokeObjectURL(url); setDownloadError(true); }
  };
  return <div className="metabloom-boom-request">
    <div className="metabloom-boom-request__status"><strong>Product demo</strong><span>Revision {draft.revision}</span>
      <span>{view.ready ? 'Ready for your review' : `${view.missing.length} required details remaining`}</span></div>
    <p>{METABLOOM_BOOM_REQUEST_NOTICE}</p>
    <dl>{Object.entries(METABLOOM_BOOM_FIELDS).map(([field, rule]) => <div key={field}>
      <dt>{rule.label}{!rule.required && <small>Optional</small>}</dt>
      <dd data-missing={rule.required && draft.fields[field] === null ? 'true' : undefined}>
        {draft.fields[field] ?? (rule.required ? 'Required, not provided' : 'Not provided')}
      </dd>
    </div>)}</dl>
    <p>No schematic is attached. The DY form accepts one optional PDF, PNG, JPG or JPEG up to 5 MB.</p>
    {!view.ready && <p>{view.nextQuestion}</p>}
    <p>Reply in chat to add or correct details. Use New chat for a separate request.</p>
    <div className="metabloom-boom-request__actions">
      <button type="button" onClick={download} disabled={!view.ready}>Download demo request</button>
      <a href={METABLOOM_BOOM_REQUEST_URL} target="_blank" rel="noopener noreferrer">Open DY’s real request form</a>
    </div>
    {downloadError && <p role="alert">The download could not be prepared. Your saved details are unchanged. Please try again.</p>}
  </div>;
}
