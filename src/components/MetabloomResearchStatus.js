import React from "react";
import "./MetabloomResearchStatus.css";

const MetabloomResearchStatus = ({ phase, preview, progress, summary }) => {
  const label = phase === "surfacing" ? "Surfacing" : phase === "diving" ? "Diving deep" : "Researching";
  const detail = !preview && phase !== "surfacing"
    ? summary || (progress === "searching" ? "Searching sources" : progress === "synthesizing" ? "Writing a sourced answer" : null)
    : null;
  return (
    <div className="metabloom-chat__message metabloom-chat__message--assistant metabloom-research-status" role="status" aria-label="Research progress" aria-live="polite" aria-atomic="true" data-phase={phase}>
      <span className="metabloom-chat__sr-only">{preview ? "Scene preview. " : ""}{label}...</span>
      <span className="metabloom-research-status__visual" key={phase} aria-hidden="true">
        <span className="metabloom-research-status__text">{label}</span>
        <span className="metabloom-research-status__dots"><span>.</span><span>.</span><span>.</span></span>
      </span>
      {preview && <small aria-hidden="true">Scene preview</small>}
      {detail && <small className="metabloom-research-status__detail">{detail}</small>}
    </div>
  );
};

export default MetabloomResearchStatus;
