const { isMetabloomResearchDeclined } = require('./metabloomResearchIntent');

// Explicit scene commands are product controls, not probabilistic model choices.
// Anchor them to the current request so quoted examples and old turns cannot
// start a scene. Other wording still goes through the semantic classifier.
function getMetabloomExplicitAction(message) {
  if (typeof message !== 'string') return null;
  const text = message.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?/, '')
    .replace(/[.!?]+$/, '').replace(/(?:[, ]+please)$/, '').trim();
  if (/^(?:show me (?:what you(?:'re| are) made (?:of|out of)|(?:what(?:'s| is) )?under (?:your|the) hood|your neural network(?: animation)?)|(?:open|reveal) (?:your|the) (?:hood|neural network))$/.test(text))
    return 'under-the-hood';
  if (!isMetabloomResearchDeclined(text)
    && /^(?:(?:do|run|start|perform|give me|take) (?:a )?)?(?:deep[- ]dive|deep research)(?:\s|$)/.test(text)
    && !/^(?:deep[- ]dive|deep research) (?:is|was|means|has|supports|can|mode|animation|feature)\b/.test(text))
    return 'deep-research';
  return null;
}

module.exports = { getMetabloomExplicitAction };
