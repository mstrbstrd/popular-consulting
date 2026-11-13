// Fictional HTTP transport for the production chat-to-visual handoff.
module.exports = function visualStream(response, offer, text) {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
  const records = [
    { type: 'emote', phase: 'input', emote: 'curious' }, { type: 'action', action: 'none' },
    { type: 'agent_status', state: 'working' },
    ...['running', 'complete'].map(state => ({ type: 'tool_activity', name: 'create_visual', callId: 'visual_1', state })),
    { type: 'agent_status', state: 'reviewing' }, { type: 'agent_status', state: 'validating' },
    { type: 'segment', index: 0, response: text }, { type: 'text_complete' },
    { type: 'emote', phase: 'response', emote: 'warm' }, { type: 'visual_offer', offer },
    { type: 'done', version: '2.0.0' },
  ];
  response.end(records.map(record => JSON.stringify(record)).join('\n') + '\n');
};
