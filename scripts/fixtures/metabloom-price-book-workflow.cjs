const { emptyMetabloomPriceRules } = require('../../src/components/metabloomPriceBookRules');

const serviceRules = (changes = {}) => ({ ...emptyMetabloomPriceRules(), currency: 'CAD', labour_mode: 'hourly', labour_rate: '95',
  minimum_hours: '2', billing_minutes: '15', travel_mode: 'started_blocks', travel_rate: '50', travel_block_km: '25',
  travel_free_km: '0', travel_distance_basis: 'one_way', weekend_multiplier: '1.5', weekend_scope: 'labour', callout_fee: '0',
  other_premiums: 'none', minimum_charge: '200', minimum_scope: 'labour_travel', minimum_timing: 'before_tax', tax_mode: 'exclusive',
  taxes: [{ label: 'GST', rate: '5', appliesTo: ['labour', 'travel', 'callout', 'minimum'] }], ...changes });
const ruleChanges = rules => Object.entries(rules).filter(([, value]) => value !== null).map(([field, value]) => ({ field, value }));
// Fictional transport for request/recovery tests, not evidence of Redis atomicity.
// The separate Redis suite runs the actual Lua scripts against disposable Redis.
function priceBookMemoryDatabase(scope = 'c'.repeat(64)) {
  const data = new Map(), calls = [];
  return { config: { scope }, data, calls, command: async args => {
    calls.push(args);
    if (args[0] === 'GET') return data.get(args[1]) ?? null;
    if (args[0] !== 'EVAL') throw new Error('Unsupported fictional transport command');
    const count = Number(args[2]), keys = args.slice(3, 3 + count), values = args.slice(3 + count);
    if (count === 1) {
      const current = JSON.parse(data.get(keys[0]) || 'null');
      if (!values.length) return data.get(keys[0]) || null;
      if ((current?.version || 0) !== Number(values[0])) return ['conflict'];
      data.set(keys[0], values[1]); return ['ok', values[1]];
    }
    const receiptKey = keys[count === 2 ? 1 : 2], prior = JSON.parse(data.get(receiptKey) || 'null');
    if (prior) return prior.hash === values[0] ? ['ok', prior.result] : ['conflict'];
    let result;
    if (count === 2) {
      if ((JSON.parse(data.get(keys[0]) || 'null')?.revision || 0) !== Number(values[1])) return ['conflict'];
      result = values[2]; data.set(keys[0], result);
    } else if (count === 5) {
      if (data.get(keys[0]) !== values[1] || (JSON.parse(data.get(keys[1]) || 'null')?.version || 0) !== Number(values[2])) return ['conflict'];
      if (data.has(keys[3])) return ['conflict'];
      if (data.has(keys[1]) && !data.has(keys[4])) data.set(keys[4], data.get(keys[1]));
      data.set(keys[3], values[4]); result = values[3]; data.set(keys[1], result);
    } else throw new Error('Unexpected fictional Lua contract');
    data.set(receiptKey, JSON.stringify({ hash: values[0], result })); return ['ok', result];
  } };
}
module.exports = { serviceRules, ruleChanges, priceBookMemoryDatabase };
