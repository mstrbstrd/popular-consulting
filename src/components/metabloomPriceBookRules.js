const { validateMetabloomPriceBook, quoteMetabloomPriceBook } = require('./metabloomPriceBook');

// Version this compiler whenever pricing semantics change. Existing published
// books contain their compiled rules and never run through a newer compiler.
const METABLOOM_PRICE_BOOK_COMPILER = 'service-rates-1';
const METABLOOM_PRICE_RULE_FIELDS = Object.freeze({
  currency: { label: 'Currency', options: ['CAD', 'USD'], question: 'Which currency should this price book use: CAD or USD?' },
  labour_mode: { label: 'Labour billing', options: ['hourly', 'fixed'], question: 'Is labour charged hourly or as a fixed amount per job?' },
  labour_rate: { label: 'Labour rate', decimals: 2, max: 100000, question: 'What is your labour rate?' },
  minimum_hours: { label: 'Minimum billable hours', decimals: 6, max: 1000, question: 'What is the minimum billable time in hours? Enter 0 for none.' },
  billing_minutes: { label: 'Round time up to minutes', decimals: 2, max: 1440, question: 'Should billable time round up to an increment in minutes? Enter 0 for no rounding.' },
  travel_mode: { label: 'Travel billing', options: ['none', 'flat', 'per_km', 'started_blocks'], question: 'Is travel free, a flat fee, charged per kilometre, or charged per started distance block?' },
  travel_rate: { label: 'Travel rate', decimals: 2, max: 100000, question: 'What is the travel fee, per-kilometre rate, or price per started block?' },
  travel_block_km: { label: 'Kilometres per block', decimals: 6, min: 0.000001, max: 10000, question: 'How many kilometres are in each started travel block?' },
  travel_free_km: { label: 'Free kilometres', decimals: 6, max: 10000, question: 'How many kilometres are free before travel charges begin? Enter 0 for none.' },
  travel_distance_basis: { label: 'Distance entered for a quote', options: ['one_way', 'round_trip'], question: 'Is the charge based on one-way distance or total round-trip distance? Quotes will ask for that same distance.' },
  flat_travel_applies: { label: 'Flat travel fee applies', options: ['always', 'positive_distance'], question: 'Does the flat travel fee apply to every job, or only when travel distance is greater than zero?' },
  weekend_multiplier: { label: 'Weekend multiplier', decimals: 6, min: 1, max: 10, question: 'What is the weekend multiplier? Enter 1 for no weekend premium, or 1.5 for time and a half.' },
  weekend_scope: { label: 'Weekend premium applies to', options: ['labour', 'travel', 'both'], question: 'Does the weekend multiplier apply to labour, travel, or both?' },
  callout_fee: { label: 'Call-out fee per job', decimals: 2, max: 100000, question: 'Is there a fixed call-out fee on every job? Enter 0 for none.' },
  other_premiums: { label: 'Other premiums or fees', options: ['none'], question: 'Are there other premiums or fees? This version supports a weekend multiplier and a fixed call-out fee; other fee rules need additional support.' },
  minimum_charge: { label: 'Minimum job charge', decimals: 2, max: 1000000, question: 'What is the minimum job charge? Enter 0 for none.' },
  minimum_scope: { label: 'Minimum charge covers', options: ['labour', 'labour_travel', 'labour_travel_callout'], question: 'Does the job minimum cover labour only, labour plus travel, or labour plus travel and call-out fees?' },
  minimum_timing: { label: 'Minimum charge timing', options: ['before_tax'], question: 'Is the minimum job charge applied before tax? This version supports pre-tax minimums.' },
  tax_mode: { label: 'Tax treatment', options: ['exclusive', 'none'], question: 'Are prices tax-exclusive, or is there no tax? Tax-inclusive or compound tax rules are not supported by this version.' },
  taxes: { label: 'Taxes', question: 'What exact taxes apply? For each tax, provide its name, percentage, and whether it applies to labour, travel, call-out fees, and minimum-charge top-ups.' },
});
const TAX_SCOPES = ['labour', 'travel', 'callout', 'minimum'];
const object = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, names) => object(value) && Object.keys(value).length === names.length
  && names.every(name => Object.prototype.hasOwnProperty.call(value, name));
const cleanText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
  && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value); // eslint-disable-line no-control-regex
const ruleError = field => Object.assign(new Error('price_book_rule_invalid'), { code: 'price_book_rule_invalid', field });
const emptyMetabloomPriceRules = () => Object.fromEntries(Object.keys(METABLOOM_PRICE_RULE_FIELDS).map(field => [field, null]));
function normalizeMetabloomPriceRule(field, value) {
  if (!Object.hasOwn(METABLOOM_PRICE_RULE_FIELDS, field)) throw ruleError('unknown');
  if (value === null) return null;
  if (field === 'taxes') {
    if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw ruleError(field);
    const taxes = value.map(tax => {
      if (!exact(tax, ['label', 'rate', 'appliesTo']) || !cleanText(tax.label, 40)
        || typeof tax.rate !== 'string' || !/^\d{1,3}(?:\.\d{1,2})?$/.test(tax.rate)
        || Number(tax.rate) > 100 || !Array.isArray(tax.appliesTo) || !tax.appliesTo.length
        || new Set(tax.appliesTo).size !== tax.appliesTo.length
        || tax.appliesTo.some(scope => !TAX_SCOPES.includes(scope))) throw ruleError(field);
      return { label: tax.label.trim(), rate: String(Number(tax.rate)), appliesTo: TAX_SCOPES.filter(scope => tax.appliesTo.includes(scope)) };
    });
    if (new Set(taxes.map(tax => tax.label.toLowerCase())).size !== taxes.length) throw ruleError(field);
    return taxes;
  }
  const definition = METABLOOM_PRICE_RULE_FIELDS[field];
  if (definition.options) {
    if (!definition.options.includes(value)) throw ruleError(field);
    return value;
  }
  if (typeof value !== 'string' || !new RegExp(`^\\d{1,7}(?:\\.\\d{1,${definition.decimals}})?$`).test(value)
    || Number(value) < (definition.min || 0) || Number(value) > definition.max) throw ruleError(field);
  // Normalize the representation without rounding or accepting exponent syntax.
  const [whole, fraction = ''] = value.split('.');
  const tail = fraction.replace(/0+$/, '');
  return `${whole.replace(/^0+(?=\d)/, '')}${tail ? `.${tail}` : ''}`;
}
function validateMetabloomPriceRules(value) {
  try {
    if (!exact(value, Object.keys(METABLOOM_PRICE_RULE_FIELDS))) return null;
    return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, normalizeMetabloomPriceRule(field, entry)]));
  } catch { return null; }
}
function requiredMetabloomPriceFields(rules) {
  const fields = ['currency', 'labour_mode', 'labour_rate'];
  if (rules.labour_mode === 'hourly') fields.push('minimum_hours', 'billing_minutes');
  fields.push('travel_mode');
  if (rules.travel_mode && rules.travel_mode !== 'none') {
    fields.push('travel_rate');
    if (rules.travel_mode === 'flat') fields.push('flat_travel_applies');
    if (rules.travel_mode !== 'flat' || rules.flat_travel_applies === 'positive_distance') fields.push('travel_distance_basis');
    if (['per_km', 'started_blocks'].includes(rules.travel_mode)) fields.push('travel_free_km');
    if (rules.travel_mode === 'started_blocks') fields.push('travel_block_km');
  }
  fields.push('weekend_multiplier');
  if (Number(rules.weekend_multiplier) > 1) fields.push('weekend_scope');
  fields.push('callout_fee', 'other_premiums', 'minimum_charge');
  if (Number(rules.minimum_charge) > 0) fields.push('minimum_scope', 'minimum_timing');
  fields.push('tax_mode');
  if (rules.tax_mode === 'exclusive') fields.push('taxes');
  return fields;
}
function getMetabloomPriceRuleState(value) {
  const rules = validateMetabloomPriceRules(value);
  if (!rules) throw ruleError('unknown');
  const missing = requiredMetabloomPriceFields(rules).filter(field => rules[field] === null);
  return { rules, missing, status: missing.length ? 'collecting' : 'ready_for_review',
    nextQuestion: missing.length ? METABLOOM_PRICE_RULE_FIELDS[missing[0]].question : null };
}

function compileMetabloomPriceBook(value) {
  const { rules: r, missing } = getMetabloomPriceRuleState(value);
  if (missing.length) throw Object.assign(new Error('price_book_incomplete'), { code: 'price_book_incomplete', missing });
  const inputs = [];
  if (r.labour_mode === 'hourly') inputs.push({ id: 'hours', label: 'Hours worked', type: 'number', min: 0, max: 1000, initial: 1 });
  const distanceInput = ['per_km', 'started_blocks'].includes(r.travel_mode)
    || (r.travel_mode === 'flat' && r.flat_travel_applies === 'positive_distance');
  if (distanceInput) inputs.push({ id: 'distance', label: r.travel_distance_basis === 'round_trip' ? 'Total round-trip kilometres' : 'One-way kilometres',
    type: 'number', min: 0, max: 10000, initial: 0 });
  const hasWeekend = Number(r.weekend_multiplier) > 1;
  if (hasWeekend) inputs.push({ id: 'weekend', label: 'Weekend job', type: 'boolean', initial: false });
  // A fixed service still needs one explicit fact under the existing contract.
  if (!inputs.length) inputs.push({ id: 'job', label: 'Include this job', type: 'boolean', initial: true });
  const taxes = r.tax_mode === 'none' ? [] : r.taxes.map((tax, i) => ({ id: `tax_${i + 1}`, label: tax.label, rate: tax.rate }));
  const taxIds = scope => taxes.filter((_, i) => r.taxes[i].appliesTo.includes(scope)).map(tax => tax.id);
  const lines = [];
  const labour = r.labour_mode === 'fixed' ? [r.labour_rate]
    : ['hours', ...(Number(r.billing_minutes) ? ['60', 'multiply', r.billing_minutes, 'divide', 'ceil', r.billing_minutes, 'multiply', '60', 'divide'] : []),
      r.minimum_hours, 'max', r.labour_rate, 'multiply'];
  const travel = r.travel_mode === 'none' ? ['0']
    : r.travel_mode === 'flat' ? r.flat_travel_applies === 'always' ? [r.travel_rate]
      // ceil(min(distance, 1)) gives exactly 0 at zero and 1 at any positive distance.
      : ['distance', '1', 'min', 'ceil', r.travel_rate, 'multiply']
      : ['distance', r.travel_free_km, 'subtract', '0', 'max',
        ...(r.travel_mode === 'started_blocks' ? [r.travel_block_km, 'divide', 'ceil'] : []), r.travel_rate, 'multiply'];
  const callout = [r.callout_fee];
  for (const weekend of hasWeekend ? [false, true] : [false]) {
    const when = hasWeekend ? { input: 'weekend', operator: 'eq', value: weekend }
      : inputs[0].id === 'job' ? { input: 'job', operator: 'eq', value: true } : null;
    const suffix = weekend ? 'weekend' : 'weekday';
    const labourFormula = [...labour, ...(weekend && ['labour', 'both'].includes(r.weekend_scope) ? [r.weekend_multiplier, 'multiply'] : []), 'round_money'];
    const travelFormula = [...travel, ...(weekend && ['travel', 'both'].includes(r.weekend_scope) ? [r.weekend_multiplier, 'multiply'] : []), 'round_money'];
    const add = (scope, label, formula) => lines.push({ id: `${scope}_${suffix}`, label, formula, taxes: taxIds(scope), when });
    add('labour', weekend ? 'Weekend labour' : 'Labour', labourFormula);
    if (r.travel_mode !== 'none') add('travel', 'Travel', travelFormula);
    if (Number(r.callout_fee)) add('callout', 'Call-out fee', callout);
    if (Number(r.minimum_charge)) {
      const covered = [...labourFormula,
        ...(['labour_travel', 'labour_travel_callout'].includes(r.minimum_scope) ? [...travelFormula, 'add'] : []),
        ...(r.minimum_scope === 'labour_travel_callout' ? [...callout, 'add'] : [])];
      // This formula is application code. No model can reverse this subtraction.
      add('minimum', 'Minimum-charge top-up', [r.minimum_charge, ...covered, 'subtract', '0', 'max']);
    }
  }
  const defaults = Object.fromEntries(inputs.map(input => [input.id, input.initial]));
  const examples = [];
  const addExample = (label, changes) => {
    const facts = { ...defaults, ...changes };
    if (!examples.some(example => JSON.stringify(example.inputs) === JSON.stringify(facts))) examples.push({ label, inputs: facts });
  };
  addExample('Basic job', {});
  if (r.labour_mode === 'hourly') {
    addExample('Short job with no travel', { hours: 0.5 });
    const boundary = Math.max(Number(r.minimum_hours), 2);
    addExample('At the billable-time boundary', { hours: boundary });
    if (Number(r.billing_minutes) && boundary < 1000) addExample('Just above the time boundary', { hours: Number((boundary + 0.000001).toFixed(6)) });
  }
  if (distanceInput) {
    const boundary = Math.min(9999, Number(r.travel_free_km || 0) + Number(r.travel_block_km || 1));
    addExample('At the travel boundary', { distance: boundary });
    addExample('Just above the travel boundary', { distance: Number((boundary + 0.000001).toFixed(6)) });
  }
  if (hasWeekend) {
    if (examples.length === 6) examples.splice(1, 1);
    addExample('Weekend job', { weekend: true });
  }
  const book = validateMetabloomPriceBook({ version: 1, currency: r.currency, inputs, taxes, lines, examples });
  if (!book) throw Object.assign(new Error('price_book_unsupported_combination'), { code: 'price_book_unsupported_combination' });
  // Reject combinations that exceed the engine's money bound at the supported
  // input extremes, rather than publishing a book with unusable quote ranges.
  const corners = inputs.reduce((jobs, input) => jobs.flatMap(job =>
    (input.type === 'boolean' ? [false, true] : [input.min, input.max]).map(value => ({ ...job, [input.id]: value }))), [{}]);
  try { corners.forEach(job => quoteMetabloomPriceBook(book, job)); }
  catch { throw Object.assign(new Error('price_book_unsupported_combination'), { code: 'price_book_unsupported_combination' }); }
  return book;
}

function buildMetabloomPriceBookDraftVisual(draft) {
  const book = compileMetabloomPriceBook(draft.rules);
  return { version: '1', designVersion: 'aetheris-1', kind: 'price-book', title: `${book.currency} service price book`,
    summary: 'Draft compiled from your saved business rules. Review the rules and calculated examples before publishing.',
    provenance: { type: 'user', label: 'Your saved pricing inputs; application-compiled rules and exact calculations.', sourceIds: [] },
    priceBook: book, priceBookDraft: { id: draft.id, revision: draft.revision, compiler: METABLOOM_PRICE_BOOK_COMPILER } };
}

function parseMetabloomPriceBookDraft(value) {
  if (!exact(value, ['id', 'revision', 'updatedAt', 'rules', 'sources', 'issues'])
    || !/^[a-f0-9]{32}$/.test(value.id) || !Number.isSafeInteger(value.revision) || value.revision >= Number.MAX_SAFE_INTEGER || value.revision < 1
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1 || !validateMetabloomPriceRules(value.rules)
    || !object(value.sources) || Object.entries(value.sources).some(([field, source]) =>
      !Object.hasOwn(METABLOOM_PRICE_RULE_FIELDS, field) || !exact(source, ['kind', 'text'])
      || !['chat', 'form'].includes(source.kind) || typeof source.text !== 'string' || source.text.length > 400)
    || !Array.isArray(value.issues) || value.issues.length > 20
    || value.issues.some(issue => !exact(issue, ['field', 'code']) || !Object.hasOwn(METABLOOM_PRICE_RULE_FIELDS, issue.field)
      || issue.code !== 'unsupported_value') || new Set(value.issues.map(issue => issue.field)).size !== value.issues.length
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > 24000) return null;
  return value;
}

module.exports = { METABLOOM_PRICE_BOOK_COMPILER, METABLOOM_PRICE_RULE_FIELDS, TAX_SCOPES, emptyMetabloomPriceRules,
  normalizeMetabloomPriceRule, validateMetabloomPriceRules, requiredMetabloomPriceFields, getMetabloomPriceRuleState,
  compileMetabloomPriceBook, buildMetabloomPriceBookDraftVisual, parseMetabloomPriceBookDraft };
