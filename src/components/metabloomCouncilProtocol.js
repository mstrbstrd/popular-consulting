const { METABLOOM_PROVIDERS, parseMetabloomModelSelection } = require('./metabloomModelProtocol');
const { parseMetabloomChatEnvelope } = require('./metabloomEmoteProtocol');
const COUNCIL_TIMEOUT_MS = 165000;
const COUNCIL_STEPS = 7;
const councilRequested = message => typeof message === 'string'
  && /\bask(?:ing)?\s+(?:the\s+)?council\b/i.test(message)
  && !/\b(?:don['’]t|do not|never|without)\s+ask(?:ing)?\s+(?:the\s+)?council\b/i.test(message);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === keys.sort().join(',');
const councilStep = (index, members, chair) => ({ member: index < 6 ? members[index % 3] : members.find(m => m.provider === chair),
  round: index < 3 ? 'Opening' : index < 6 ? 'Critique' : 'Synthesis', limit: index < 3 ? 400 : index < 6 ? 450 : 1100 });
const buildCouncilReply = (members, texts, chair) => ({ version: '2.0.0', segments: [
  ...members.map((member, i) => ({ response: `${METABLOOM_PROVIDERS[member.provider]} · ${member.model}\nOpening: ${texts[i]}\nCritique and revision: ${texts[i + 3]}` })),
  { response: `Council synthesis · ${METABLOOM_PROVIDERS[chair]}\n${texts[6]}` },
] });
// Shared host/browser contract: complete one observed speaker before the next.
function createCouncilDecoder(onEvent = () => {}) {
  let members, chair, active = false, done = false, failed = false;
  const texts = [];
  return {
    accept(event) {
      if (done || failed) return false;
      if (event?.type === 'council_start') {
        if (members || !exact(event, ['type', 'members', 'chair']) || !Array.isArray(event.members) || event.members.length !== 3
          || event.members.some((m, i) => !parseMetabloomModelSelection(m) || m.provider !== Object.keys(METABLOOM_PROVIDERS)[i]
            || ['default', 'latest'].includes(m.model)) || !event.members.some(m => m.provider === event.chair)) return false;
        members = event.members.map(m => ({ ...m })); chair = event.chair;
      } else if (event?.type === 'council_step') {
        if (!members || texts.length >= COUNCIL_STEPS || event.index !== texts.length
          || !exact(event, event.state === 'complete' ? ['type', 'index', 'state', 'text'] : ['type', 'index', 'state'])) return false;
        if (event.state === 'running' && !active) active = true;
        else if (event.state === 'complete' && active && typeof event.text === 'string' && event.text.trim() === event.text
          && event.text.length > 0 && event.text.length <= councilStep(texts.length, members, chair).limit
          && !/\[\d+\]/.test(event.text)) { texts.push(event.text); active = false; }
        else return false;
      } else if (event?.type === 'council_done') {
        if (!exact(event, ['type']) || !members || active || texts.length !== COUNCIL_STEPS) return false;
        if (!parseMetabloomChatEnvelope(buildCouncilReply(members, texts, chair), { allowMultiple: true }).ok) return false;
        done = true;
      } else return false;
      onEvent(event); return true;
    },
    fail() { failed = true; },
    finish() { return done && !failed ? buildCouncilReply(members, texts, chair) : null; },
  };
}
module.exports = { COUNCIL_TIMEOUT_MS, COUNCIL_STEPS, councilRequested, councilStep, buildCouncilReply, createCouncilDecoder };
