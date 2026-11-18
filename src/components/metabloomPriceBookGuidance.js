// One product-owned explanation for intake questions and every model provider.
const METABLOOM_PRICE_BOOK_GUIDE = [
  'A price book stores your confirmed business pricing rules so the app can calculate estimates. To set it up, provide:',
  '1. Currency: CAD or USD.',
  '2. Labour: hourly or fixed rates, minimum billable time, and time rounding.',
  '3. Travel: flat, per km, or per started block; the amount, block size, free allowance, and whether distance is one way or round trip.',
  '4. Premiums and fees: weekend or after-hours charges, call-out fees, and which charges each applies to.',
  '5. Minimum job charge: the amount, what it covers, and whether it applies before or after tax.',
  '6. Taxes: exact rates, which charges they apply to, and whether your prices include or exclude tax.',
  'Say "none" for rules that do not apply, including no tax if that is your rule. Missing or ambiguous rules need confirmation; registration and location alone do not settle taxes.',
  'Supported rules include arithmetic, minimums, conditional charges and rounding up for started blocks. Unsupported rules must be flagged, never silently replaced.',
  'The workflow is a draft card with worked examples, your review, then your explicit Publish click. After publishing, estimates need only the job facts defined by your book, such as hours, distance and weekend status. Estimates are not invoices or payments. This explanation creates or publishes nothing.',
].join('\n\n');

const normalize = value => typeof value === 'string' && value.length <= 1600
  ? value.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase() : '';
const topic = text => /\bprice[ -]?books?\b|\b(?:business|service|job) (?:pricing|rates?|quotes?)\b|\b(?:pricing|rates?)\b.{0,60}\b(?:business|services?|jobs?)\b|\b(?:my|our) (?:rates|pricing)\b/.test(text);
const question = text => /^(?:(?:ok(?:ay)?|so|please)[, ]+)?(?:what (?:is|are|do|does|would|can|information|details)|what's|how (?:do|does|would|can)|(?:tell me about|explain|describe)|(?:can|could|do) you (?:do|support|offer|handle|help)|(?:can|could) you (?:create|make|build) price[ -]?books|you can (?:do|handle|help))\b/.test(text);
const followup = text => /^(?:(?:ok(?:ay)?|so|please)[, ]+)?(?:walk me through (?:it|what you need)|what (?:do you need(?: from me)?|information do you need|details do you need)|how does (?:it|that|this) work|what(?:'s| is) required)(?: please)?[.!?]*$/.test(text);

function getMetabloomPriceBookGuidanceResponse(message, history = [], { enabled = false } = {}) {
  const text = normalize(message);
  // Keep actual intake, quotations, edits, code requests and combined tasks on
  // their existing routes. This rule explains the feature; it never starts it.
  if (!text || text.length > 300 || /[\d$%"“”]/.test(text)
    || /\b(?:quote|estimate|publish|update|change|revise|delete|code|html|javascript|tax advice|exchange|interest|mortgage|search|research|compare|latest|average|news)\b/.test(text)
    || /\b(?:cad|usd|dollars?|percent|above|already)\b|\b(?:per|an?|each) (?:hour|km|kilomet(?:er|re))\b|\b(?:using|with) (?:the|these|my|our) (?:rates|rules)\b/.test(text)
    || /\b(?:and|then|also)\s+(?:(?:please|can you)\s+)?(?:search|research|find|show|create|make|build|calculate|publish)\b/.test(text)) return null;
  const previous = Array.isArray(history) ? history.slice(-12).reverse().find(item => item?.role === 'user') : null;
  const previousText = normalize(previous?.content);
  const requested = (topic(text) && question(text))
    || (followup(text) && topic(previousText) && question(previousText)
      && getMetabloomPriceBookGuidanceResponse(previousText, [], { enabled }) !== null);
  if (!requested) return null;
  return enabled ? METABLOOM_PRICE_BOOK_GUIDE
    : 'Price-book drafting and quoting are unavailable in this session. When enabled:\n\n' + METABLOOM_PRICE_BOOK_GUIDE;
}

module.exports = { METABLOOM_PRICE_BOOK_GUIDE, getMetabloomPriceBookGuidanceResponse };
