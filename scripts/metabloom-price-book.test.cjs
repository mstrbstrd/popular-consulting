const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMetabloomPriceBook: validate, quoteMetabloomPriceBook: quote,
  deriveMetabloomPriceBookToolSchema: schema } = require('../src/components/metabloomPriceBook');
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({
  version: 1, currency: 'CAD',
  inputs: [
    { id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 },
    { id: 'distance', label: 'Distance in km', type: 'number', min: 0, max: 150, initial: 10 },
    { id: 'weekend', label: 'Weekend', type: 'boolean', initial: false },
  ],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }],
  lines: [
    { id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null },
    { id: 'premium', label: 'Weekend premium', formula: ['hours', '95', 'multiply', '0.15', 'multiply'], taxes: ['gst'], when: { input: 'weekend', operator: 'eq', value: true } },
    { id: 'travel', label: 'Travel', formula: ['60'], taxes: ['gst'], when: { input: 'distance', operator: 'gt', value: 20 } },
  ],
  examples: [{ label: 'Weekday local job', inputs: { hours: 3, distance: 10, weekend: false } }],
});
const values = changes => ({ hours: 3, distance: 10, weekend: false, ...changes });
const simple = (formula, taxes = []) => {
  const book = fixture();
  book.lines = [{ id: 'work', label: 'Work', formula, taxes: taxes.map(tax => tax.id), when: null }];
  book.taxes = taxes;
  return book;
};

test('validates, clones and computes the agreed weekday and weekend examples', () => {
  const source = fixture(), book = validate(source);
  assert.deepEqual(book, source);
  assert.notEqual(book, source);
  assert.notEqual(book.lines, source.lines);
  const weekday = quote(book, values());
  assert.equal(weekday.subtotalCents, 28500);
  assert.equal(weekday.taxCents, 1425);
  assert.equal(weekday.totalCents, 29925);
  const weekend = quote(book, values({ hours: 6, distance: 30, weekend: true }));
  assert.equal(weekend.subtotalCents, 71550);
  // Per-line GST rounds $4.275 on the premium to $4.28.
  assert.equal(weekend.taxCents, 3578);
  assert.equal(weekend.totalCents, 75128);
  assert.deepEqual(weekend.lines.map(line => line.subtotalCents), [57000, 8550, 6000]);
  assert.equal(quote(book, values({ distance: 20 })).lines.length, 1);
});

test('uses exact decimal and rational arithmetic, rounding half-up once per line', () => {
  for (const [formula, expected] of [
    [['0.1', '0.2', 'add'], 30],
    [['1', '3', 'divide', '3', 'multiply'], 100],
    [['1', '6', 'divide'], 17],
    [['1.005'], 101],
    [['0.004999'], 0],
    [['0.005'], 1],
    [['10', '3', 'subtract', '2', 'divide'], 350],
    [['2', '5', 'min'], 200],
    [['2', '5', 'max'], 500],
  ]) assert.equal(quote(simple(formula), values()).totalCents, expected);
});

test('rounds each independent tax per rounded line, never compounds or taxes aggregate', () => {
  const taxes = [{ id: 'gst', label: 'GST', rate: '5' }, { id: 'pst', label: 'PST', rate: '7' }];
  const book = simple(['0.10'], taxes);
  book.lines.push({ ...book.lines[0], id: 'second' });
  const result = quote(book, values());
  assert.equal(result.subtotalCents, 20);
  assert.equal(result.taxCents, 4);
  assert.equal(result.totalCents, 24);
  assert.deepEqual(result.taxes.map(tax => tax.amountCents), [2, 2]);
  assert.equal(quote(simple(['100'], taxes), values()).totalCents, 11200);
});

test('started distance blocks use exact ceilings at zero, fractional and whole boundaries', () => {
  const book = simple(['distance', '25', 'divide', 'ceil', '50', 'multiply']);
  assert.ok(validate(book));
  for (const [distance, cents] of [[0, 0], [0.000001, 5000], [24.999999, 5000],
    [25, 5000], [25.000001, 10000], [30, 10000], [50, 10000], [50.000001, 15000]]) {
    assert.equal(quote(book, values({ distance })).totalCents, cents);
  }
  // No float epsilon or positive-only shortcut: ceil is also exact on negatives.
  for (const [formula, cents] of [[['-1', '3', 'divide', 'ceil'], 0],
    [['-4', '3', 'divide', 'ceil', '2', 'add'], 100], [['-2', 'ceil', '2', 'add'], 0]]) {
    assert.equal(quote(simple(formula), values()).totalCents, cents);
  }
  for (const formula of [['ceil'], ['ceil', '1'], ['1', '2', 'ceil'], ['1', 'ceil', 'add'],
    ['1', ...Array(64).fill('ceil')]]) assert.equal(validate(simple(formula)), null);
});

test('confirmed block travel combines with minimum hours, weekend labour and a whole-job minimum', () => {
  const book = fixture();
  book.inputs[0] = { ...book.inputs[0], min: 0, initial: 1 };
  book.lines = [false, true].map(weekend => ({ id: weekend ? 'weekend' : 'weekday', label: 'Job',
    formula: ['hours', '3', 'max', weekend ? '97.5' : '65', 'multiply',
      'distance', '25', 'divide', 'ceil', '50', 'multiply', 'add', '200', 'max'],
    taxes: ['gst'], when: { input: 'weekend', operator: 'eq', value: weekend } }));
  for (const [hours, distance, weekend, total] of [[1, 0, false, 21000], [3, 30, false, 30975],
    [3, 30, true, 41213], [1, 0, true, 30713]]) {
    assert.equal(quote(book, { hours, distance, weekend }).totalCents, total);
  }
});

test('existing version-1 inputs named ceil keep their original meaning', () => {
  const book = simple(['ceil', '2', 'multiply']);
  book.inputs.push({ id: 'ceil', label: 'Legacy input', type: 'number', min: 0, max: 10, initial: 3 });
  book.examples[0].inputs.ceil = 3;
  assert.ok(validate(book));
  assert.equal(quote(book, { ...values(), ceil: 3 }).totalCents, 600);
});

test('money and tax results match the existing invoice engine across decimal inputs', () => {
  const { calculateInvoice } = require('../src/utils/invoiceCore');
  for (const [qty, cost, gst, pst] of [
    ['2.125', '95.15', '5', '7'], ['3.333', '0.15', '5', '7'],
    ['0.001', '5.00', '5', '0'], ['9.999', '12.35', '13', '9.75'],
    ['100', '999.99', '0', '0'], ['1', '100.00', '5', '7'],
  ]) {
    const expected = calculateInvoice({ gstRate: gst, pstRate: pst,
      items: [{ qty, cost, discount: '0', gst: true, pst: true }] });
    const result = quote(simple([qty, cost, 'multiply'], [
      { id: 'gst', label: 'GST', rate: gst }, { id: 'pst', label: 'PST', rate: pst },
    ]), values());
    assert.equal(result.subtotalCents, expected.net);
    assert.equal(result.taxes[0].amountCents, expected.gst);
    assert.equal(result.taxes[1].amountCents, expected.pst);
    assert.equal(result.totalCents, expected.total);
  }
});

test('requires complete facts, validates numeric ranges and accepts exact HTML input strings', () => {
  assert.equal(quote(fixture(), values({ hours: '2.5' })).subtotalCents, 23750);
  for (const facts of [
    {}, { hours: 3 }, values({ hours: 1 }), values({ hours: 13 }), values({ hours: NaN }),
    values({ hours: Infinity }), values({ hours: '' }), values({ hours: '3e0' }),
    values({ hours: '3.0000001' }), values({ hours: null }), values({ weekend: 'false' }),
    { ...values(), price: 1 }, { ...values(), constructor: 1 },
  ]) assert.throws(() => quote(fixture(), facts));
});

test('rejects executable formulas, unknown fields, dishonest examples and unsafe IDs', () => {
  const changes = [
    book => { book.javascript = 'fetch()'; },
    book => { book.version = 2; },
    book => { book.currency = 'BTC'; },
    book => { book.lines[0].formula = ['eval']; },
    book => { book.lines[0].formula = ['hours', '*', '95']; },
    book => { book.lines[0].formula = ['weekend']; },
    book => { book.lines[0].formula = ['1', '2']; },
    book => { book.lines[0].formula = ['1', 'add']; },
    book => { book.lines[0].taxes = ['missing']; },
    book => { book.lines[0].taxes = ['gst', 'gst']; },
    book => { book.inputs[0].id = 'constructor'; },
    book => { book.inputs[0].id = 'multiply'; },
    book => { book.inputs.push(clone(book.inputs[0])); },
    book => { book.taxes[0].rate = '100.01'; },
    book => { book.taxes[0].rate = '-1'; },
    book => { book.taxes[0].rate = '5.001'; },
    book => { book.taxes[0].rate = 5; },
    book => { book.lines[0].when = { input: 'weekend', operator: 'gt', value: true }; },
    book => { book.lines[0].when = { input: 'unknown', operator: 'eq', value: true }; },
    book => { book.examples[0].totalCents = 1; },
    book => { book.examples[0].extra = undefined; },
    book => { book.examples[0].inputs.extra = undefined; },
    book => { book.examples[0].inputs.hours = '3'; },
    book => { book.examples[0].inputs.hours = 13; },
    book => { book.examples = []; },
    book => { book.inputs[0].label = 'x'.repeat(101); },
    book => { book.inputs[0].label = 'bad\u0000label'; },
    book => { book.inputs[0].min = 12; },
    book => { book.inputs[0].max = 1000000001; },
  ];
  changes.forEach(change => { const book = fixture(); change(book); assert.equal(validate(book), null); });
});

test('rejects negative and overflowing results at validation or runtime, never silently uses zero', () => {
  for (const formula of [['-0.000001'], ['1', '0', 'divide'], ['1000000000', '2', 'multiply']]) {
    assert.equal(validate(simple(formula)), null);
    assert.throws(() => quote(simple(formula), values()));
  }
  const book = simple(['hours', '2', 'subtract', '1', 'divide']);
  assert.ok(validate(book));
  const division = simple(['1', 'hours', '2', 'subtract', 'divide']);
  assert.ok(validate(division));
  assert.throws(() => quote(division, values({ hours: 2 })), /zero/);
  const negative = simple(['4', 'hours', 'subtract']);
  assert.ok(validate(negative));
  assert.throws(() => quote(negative, values({ hours: 5 })), /negative/);
  const max = simple(['1000000000']);
  assert.equal(quote(max, values()).totalCents, 100000000000);
  max.lines.push({ ...max.lines[0], id: 'second' });
  assert.equal(validate(max), null);
});

test('conditions compare exact decimals and zero-total excluded lines stay valid', () => {
  const book = simple(['10']);
  for (const [operator, threshold, expected] of [
    ['eq', 3, 1000], ['eq', 4, 0], ['gt', 3, 0], ['gte', 3, 1000],
    ['lt', 3, 0], ['lte', 3, 1000], ['lt', 3.1, 1000],
  ]) {
    book.lines[0].when = { input: 'hours', operator, value: threshold };
    assert.equal(quote(book, values()).totalCents, expected);
  }
});

test('derives the complete strict tool schema without defaults, prices or executable fields', () => {
  const result = schema(fixture());
  assert.equal(result.additionalProperties, false);
  assert.deepEqual(result.required, ['hours', 'distance', 'weekend']);
  assert.deepEqual(result.properties.weekend, { type: 'boolean', description: 'Weekend' });
  assert.equal(result.properties.hours.minimum, 2);
  assert.equal(result.properties.hours.maximum, 12);
  assert.equal(result.properties.hours.default, undefined);
  assert.throws(() => schema({}));
});


test('walkthrough rules preserve quarter-hour rounding, conditional minimum top-ups and GST', () => {
  const book = fixture();
  book.inputs[0] = { ...book.inputs[0], min: 0, initial: 1 };
  const travel = ['distance', '25', 'divide', 'ceil', '50', 'multiply'];
  book.lines = [{ id: 'travel', label: 'Travel', formula: travel, taxes: ['gst'], when: null }];
  for (const weekend of [false, true]) {
    const suffix = weekend ? 'weekend' : 'weekday';
    const labour = ['hours', '0.25', 'divide', 'ceil', '0.25', 'multiply', '2', 'max',
      weekend ? '142.5' : '95', 'multiply'];
    const when = { input: 'weekend', operator: 'eq', value: weekend };
    book.lines.push({ id: `labour_${suffix}`, label: 'Labour', formula: labour, taxes: ['gst'], when },
      { id: `minimum_${suffix}`, label: 'Minimum top-up',
        formula: ['200', ...labour, ...travel, 'add', 'subtract', '0', 'max'], taxes: ['gst'], when });
  }
  for (const [hours, distance, weekend, subtotal, total, topUp] of [
    [1, 0, false, 20000, 21000, 1000], [2, 25, false, 24000, 25200, 0],
    [2, 25.000001, false, 29000, 30450, 0], [2.01, 0, false, 21375, 22444, 0],
    [2, 0, true, 28500, 29925, 0], [3, 30, true, 52750, 55388, 0],
    [4, 0, false, 38000, 39900, 0],
  ]) {
    const result = quote(book, { hours, distance, weekend });
    assert.equal(result.subtotalCents, subtotal);
    assert.equal(result.totalCents, total);
    assert.equal(result.lines.find(line => line.id.startsWith('minimum_')).subtotalCents, topUp);
  }
});

test('validation diagnostics expose fixed rule categories without changing rejection or leaking values', () => {
  const cases = [
    ['shape', book => { book.currency = 'private-currency'; }],
    ['inputs', book => { book.inputs[0].min = 12; }],
    ['taxes', book => { book.taxes[0].rate = 'private-tax'; }],
    ['lines', book => { book.lines[0].taxes = ['unknown']; }],
    ['formula', book => { book.lines[0].formula = ['weekend', '95', 'multiply']; }],
    ['formula', book => { book.lines[0].formula = ['premium', '95', 'multiply']; }],
    ['condition', book => { book.lines[0].when = { input: 'weekend', operator: 'gt', value: true }; }],
    ['initial_result', book => { book.lines[0].formula = ['1', '0', 'divide']; }],
    ['examples', book => { book.examples[0].inputs.hours = 13; }],
  ];
  for (const [expected, change] of cases) {
    const book = fixture(), reasons = []; change(book);
    assert.equal(validate(book, { onInvalid: reason => reasons.push(reason) }), null);
    assert.deepEqual(reasons, [expected]);
    assert.equal(validate(book), null);
  }
  assert.deepEqual(validate(fixture(), { onInvalid: () => assert.fail('Valid book') }), fixture());
});
