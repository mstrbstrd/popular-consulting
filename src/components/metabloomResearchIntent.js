const normalize = value => typeof value === 'string'
  ? value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim() : '';
const declined = text => /\b(?:do not|don't|without|never|no need to|avoid)\s+(?:\w+\s+){0,2}(?:research|search|browse|browsing|searching)\b/.test(text)
  || /\b(?:offline|from memory|without (?:using )?(?:the )?(?:web|internet)|no (?:web )?(?:search|browsing))\b/.test(text)
  || /\b(?:using|use|from|based on) only (?:this|the|these|my|our)(?: (?:provided|supplied|attached|existing|saved))? (?:text|report|research|notes|sources|material)\b/.test(text);
const requestStart = /^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?/;
const news = text => /\b(?:news|headlines|current events)\b/.test(text);
const directRequest = text => /^(?:deep research|research|investigate|search(?: the web)?(?: for)?|look up|browse(?: the web)? for)\s+\S/.test(text.replace(requestStart, ''));

// These narrow host rules cover unambiguous requests even if Jev is unavailable.
// Everything else stays with the semantic action classifier. History supplies
// intent only, never proof that a search ran or authority about available tools.
function classifyMetabloomResearchIntent(message, history = []) {
  const text = normalize(message);
  if (declined(text)) return 'declined';
  const question = text.replace(/^(?:so[, ]+|but[, ]+)/, '').replace(/[,.!?]+$/g, '').trim();
  if (/^(?:(?:do|don't|does|doesn't|shouldn't) (?:you|deep research)(?: (?:mode|brief))? (?:have|support)|(?:you|deep research)(?: (?:mode|brief))? (?:should have|has|have)) (?:live )?(?:web|internet) access(?: (?:in this chat|here))?(?:[, ]+(?:no|right|correct))?$/.test(question)
    || /^(?:can|could|do) you (?:browse|search)(?: the)? (?:live )?(?:web|internet)(?: (?:in this chat|when needed|here))?$/.test(question)
    || /^(?:can|could) (?:you|deep research) access (?:the )?(?:live )?(?:web|internet)(?: (?:in this chat|here))?$/.test(question)) return 'capability';
  if (directRequest(text)) return 'requested';
  if (/^(?:what|which|give me|show me|tell me|find)\b/.test(text.replace(requestStart, ''))
    && news(text) && /\b(?:today|latest|current|breaking|this week)\b/.test(text)) return 'requested';
  const previousUser = [...history].reverse().find(item => item.role === 'user');
  const previous = normalize(previousUser?.content);
  if (!declined(previous) && news(previous)
    && (directRequest(previous) || /\b(?:today|latest|current|breaking|this week)\b/.test(previous))
    && /^(?:(?:how|why) did you (?:miss|omit|leave out)|you (?:missed|omitted|left out)|what about|and what about)\s+\S/.test(text)) return 'requested';
  return 'auto';
}

function getMetabloomResearchCapabilityResponse(intent, { enabled } = {}) {
  if (intent !== 'capability') return null;
  return enabled
    ? 'Yes. Deep Research is my live web research capability. I can use it for current information and verification when needed; you do not have to request a separate mode. No new search was run for this capability answer.'
    : 'Deep Research supports live web research, but it is not configured in this environment right now. I cannot run a live search here until it is configured.';
}

module.exports = { classifyMetabloomResearchIntent, getMetabloomResearchCapabilityResponse,
  isMetabloomResearchDeclined: message => declined(normalize(message)) };
