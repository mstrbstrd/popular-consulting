const METABLOOM_AGENT_TIMEOUT_MS = 90000;
const MAX_METABLOOM_AGENT_CALLS = 4;
const METABLOOM_AGENT_TOOL_LABELS = Object.freeze({
  search_web: 'Searching the web', calculate: 'Calculating',
  get_current_time: 'Checking the time', create_visual: 'Preparing your visual',
});
const parseMetabloomAgentActivity = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'callId,name,state,type' || value.type !== 'tool_activity'
    || !Object.prototype.hasOwnProperty.call(METABLOOM_AGENT_TOOL_LABELS, value.name)
    || !['running', 'complete', 'failed'].includes(value.state)
    || typeof value.callId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.callId)) return null;
  return { type: value.type, callId: value.callId, name: value.name, state: value.state };
};
module.exports = { METABLOOM_AGENT_TIMEOUT_MS, MAX_METABLOOM_AGENT_CALLS,
  METABLOOM_AGENT_TOOL_LABELS, parseMetabloomAgentActivity };
