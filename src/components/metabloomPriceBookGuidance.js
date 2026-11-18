// One product-owned explanation for intake questions and every model provider.
const METABLOOM_PRICE_BOOK_GUIDE = [
  'A price book saves your business rules for application-calculated estimates. Setup needs:',
  '1. Currency: CAD or USD.',
  '2. Labour: hourly or fixed rate, minimum billable time, and rounding increment.',
  '3. Travel: flat, per km, or per started block; rate, block size, free distance, and one way or round trip.',
  '4. Premiums and fees: weekend multiplier, its scope, and fixed call-out fee. Disclose any other fees.',
  '5. Minimum job charge: amount, covered charges, and timing.',
  '6. Taxes: exact percentages and applicable charges; whether prices include or exclude tax.',
  'Say "none" where appropriate. Missing values remain unresolved; location and registration do not confirm taxes. This version supports pre-tax minimums and independent tax-exclusive taxes. Other premiums, compound taxes and tax-inclusive pricing need additional support.',
  'Chat saves proposed inputs. More > Price book setup lets you enter or resume the same draft without chat. The app compiles rules and examples. Review them; your explicit Publish click activates that saved revision. After publishing, estimates need only the job facts, such as hours, distance and weekend status. Estimates are not invoices or payments. This explanation saves or publishes nothing.',
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
