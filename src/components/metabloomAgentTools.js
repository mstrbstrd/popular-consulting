const METABLOOM_AGENT_TIMEOUT_MS = 90000;
const MAX_METABLOOM_AGENT_CALLS = 4;
const MAX_METABLOOM_TOOL_PROGRESS = 24;
const METABLOOM_PROGRESS_WAIT_MS = 12000;
const METABLOOM_AGENT_TOOL_LABELS = Object.freeze({
  search_web: 'Searching the web', calculate: 'Calculating',
  get_current_time: 'Checking the time', create_visual: 'Preparing your visual',
  get_orb_state: 'Checking the Orb', express_orb: 'Choosing an expression',
  find_image: 'Finding a photo',
});
const parseMetabloomAgentActivity = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'callId,name,state,type' || value.type !== 'tool_activity'
    || !Object.prototype.hasOwnProperty.call(METABLOOM_AGENT_TOOL_LABELS, value.name)
    || !['running', 'complete', 'failed'].includes(value.state)
    || typeof value.callId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.callId)) return null;
  return { type: value.type, callId: value.callId, name: value.name, state: value.state };
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const parseMetabloomToolProgress = value => {
  if (!exactKeys(value, ['type', 'name', 'callId', 'sequence', 'summary']) || value.type !== 'tool_progress'
    || value.name !== 'search_web' || typeof value.callId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.callId)
    || !Number.isInteger(value.sequence) || value.sequence < 1 || value.sequence > MAX_METABLOOM_TOOL_PROGRESS
    || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 200
    // eslint-disable-next-line no-control-regex
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.summary)) return null;
  return { ...value, summary: value.summary.trim() };
};
const parseMetabloomAgentStatus = value => exactKeys(value, ['type', 'state']) && value.type === 'agent_status'
  && ['working', 'reviewing', 'validating'].includes(value.state) ? { ...value } : null;

// The host and browser share this state machine. Progress is part of execution,
// not model-authored prose or a timer that pretends a milestone happened.
const createMetabloomAgentLifecycle = ({ requireStatus = false } = {}) => {
  const calls = new Set();
  let phase = null, activeTool = null, lastTool = null, sequence = 0, summary = null, searchComplete = false, imageComplete = false;
  return {
    accept(event) {
      if (event?.type === 'agent_status') {
        const status = parseMetabloomAgentStatus(event);
        if (!status || activeTool || (status.state === 'working' ? phase !== null
          : status.state === 'reviewing' ? phase !== 'between' : !['working', 'reviewing'].includes(phase))) return null;
        phase = status.state;
        return status;
      }
      if (event?.type === 'tool_progress') {
        const progress = parseMetabloomToolProgress(event);
        if (!progress || !activeTool || progress.callId !== activeTool.callId || progress.name !== activeTool.name
          || progress.sequence !== sequence + 1) return null;
        sequence = progress.sequence; summary = progress.summary;
        return progress;
      }
      const activity = parseMetabloomAgentActivity(event);
      if (!activity) return null;
      if (activity.state === 'running') {
        if (activeTool || calls.has(activity.callId) || calls.size >= MAX_METABLOOM_AGENT_CALLS || phase === 'validating'
          || (requireStatus && !['working', 'reviewing'].includes(phase))) return null;
        calls.add(activity.callId); activeTool = activity; phase = 'tool'; sequence = 0; summary = null;
      } else {
        if (!activeTool || activity.callId !== activeTool.callId || activity.name !== activeTool.name) return null;
        if (activity.name === 'search_web' && activity.state === 'complete') searchComplete = true;
        if (activity.name === 'find_image' && activity.state === 'complete') imageComplete = true;
        lastTool = activity; activeTool = null; phase = 'between'; summary = null;
      }
      return activity;
    },
    canAnswer: () => !activeTool && (!requireStatus || phase === null || phase === 'validating'),
    getState: () => ({ phase, activeTool: activeTool && { ...activeTool }, lastTool: lastTool && { ...lastTool },
      summary, searchComplete, imageComplete, callCount: calls.size }),
  };
};

const getMetabloomWorkPresentation = ({ phase, activeTool, lastTool, summary, searchComplete }) => {
  if (activeTool) return { label: METABLOOM_AGENT_TOOL_LABELS[activeTool.name], summary };
  if (phase === 'validating') return { label: 'Checking the answer',
    summary: searchComplete ? 'Checking the response and its source references.' : 'Checking the response.' };
  if (lastTool) return { label: lastTool.state === 'failed' ? 'Handling a tool problem' : 'Reviewing results',
    summary: lastTool.state === 'failed' ? `${METABLOOM_AGENT_TOOL_LABELS[lastTool.name]} did not finish successfully.`
      : ({ search_web: 'Search complete. Reviewing the sources.', calculate: 'Calculation complete.',
        get_current_time: 'Current time checked.', create_visual: 'Visual requested. Generation and display are still pending.',
        get_orb_state: 'Orb snapshot checked.', express_orb: 'Expression chosen. Playback is still pending.',
        find_image: 'Photo lookup complete.' })[lastTool.name] };
  return { label: 'Working on your request', summary: null };
};
module.exports = { METABLOOM_AGENT_TIMEOUT_MS, MAX_METABLOOM_AGENT_CALLS,
  MAX_METABLOOM_TOOL_PROGRESS, METABLOOM_PROGRESS_WAIT_MS, METABLOOM_AGENT_TOOL_LABELS,
  parseMetabloomAgentActivity, parseMetabloomToolProgress, parseMetabloomAgentStatus,
  createMetabloomAgentLifecycle, getMetabloomWorkPresentation };
