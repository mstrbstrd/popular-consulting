// Shared browser/server pricing contract. Model output supplies rules and facts,
// never executable code or authoritative totals. Every monetary result is cents.
const MAX_METABLOOM_PRICE_BOOK_BYTES = 65536;
const MAX_CENTS = 100000000000;
const OPERATORS = ['add', 'subtract', 'multiply', 'divide', 'min', 'max'];
const RESERVED_IDS = [...OPERATORS, 'constructor', 'prototype', '__proto__'];
const object = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, names) => object(value) && Object.keys(value).length === names.length
  && names.every(name => Object.prototype.hasOwnProperty.call(value, name));
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100
  && Array.from(value).every(character => character.codePointAt(0) > 31 && character.codePointAt(0) !== 127);
const id = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(value) && !RESERVED_IDS.includes(value);
const list = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max;
const unique = values => new Set(values).size === values.length;
const fail = message => { throw new Error(message); };
const abs = value => value < 0n ? -value : value;
const gcd = (a, b) => { while (b) { const remainder = a % b; a = b; b = remainder; } return a; };
const rational = (n, d = 1n) => {
  if (!d) return fail('A pricing formula divides by zero.');
  if (d < 0n) { n = -n; d = -d; }
  const divisor = gcd(abs(n), d);
  n /= divisor; d /= divisor;
  // Bounds intermediate arithmetic, including repeated multiply/divide operations.
  if (abs(n).toString(2).length > 4096 || d.toString(2).length > 4096) return fail('A pricing formula exceeds the supported limit.');
  return { n, d };
};
const decimal = (value, places = 6) => {
  if (typeof value !== 'number' && typeof value !== 'string') return fail('Enter a valid decimal number.');
  if (typeof value === 'number' && !Number.isFinite(value)) return fail('Enter a finite decimal number.');
  const source = String(value);
  if (source.length > 24 || !new RegExp(`^-?(?:\\d+|\\d*\\.\\d{1,${places}})$`).test(source)) {
    return fail(`Use a decimal number with at most ${places} decimal places.`);
  }
  const negative = source.startsWith('-');
  const [whole, fraction = ''] = (negative ? source.slice(1) : source).split('.');
  const denominator = 10n ** globalThis.BigInt(fraction.length);
  const numerator = (globalThis.BigInt(whole || '0') * denominator + globalThis.BigInt(fraction || '0')) * (negative ? -1n : 1n);
  if (abs(numerator) > 1000000000n * denominator) return fail('This number exceeds the supported limit.');
  return rational(numerator, denominator);
};
const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const validNumber = value => {
  if (typeof value !== 'number' || value < 0) return false;
  try { decimal(value); return true; } catch { return false; }
};
const validateFormula = (tokens, inputs) => {
  if (!list(tokens, 1, 32)) return false;
  let depth = 0;
  for (const token of tokens) {
    if (typeof token !== 'string' || token.length > 24) return false;
    if (OPERATORS.includes(token)) { if (depth < 2) return false; depth--; }
    else if (inputs.some(input => input.id === token && input.type === 'number')) depth++;
    else { try { decimal(token); depth++; } catch { return false; } }
  }
  return depth === 1;
};
const evaluate = (tokens, values) => {
  const stack = [];
  for (const token of tokens) {
    if (!OPERATORS.includes(token)) {
      stack.push(Object.prototype.hasOwnProperty.call(values, token) ? values[token] : decimal(token));
      continue;
    }
    const b = stack.pop(), a = stack.pop();
    if (token === 'min' || token === 'max') stack.push((compare(a, b) <= 0) === (token === 'min') ? a : b);
    else if (token === 'multiply') stack.push(rational(a.n * b.n, a.d * b.d));
    else if (token === 'divide') stack.push(rational(a.n * b.d, a.d * b.n));
    else stack.push(rational(a.n * b.d + (token === 'add' ? 1n : -1n) * b.n * a.d, a.d * b.d));
  }
  return stack[0];
};
const centsNumber = value => {
  if (value < 0n || value > globalThis.BigInt(MAX_CENTS)) return fail('Quote amounts must be non-negative and must not exceed 1 billion.');
  return Number(value);
};
// Half up, including odd denominators. Called only for non-negative amounts.
const round = (n, d) => (2n * n + d) / (2n * d);
const inputValues = (book, values, allowStrings = true) => {
  if (!keys(values, book.inputs.map(input => input.id))) return fail('Provide every price-book input, with no extra fields.');
  const exact = Object.create(null), normalized = {};
  for (const input of book.inputs) {
    const value = values[input.id];
    if (input.type === 'boolean') {
      if (typeof value !== 'boolean') return fail(`${input.label}: choose true or false.`);
      exact[input.id] = value; normalized[input.id] = value;
    } else {
      if (!allowStrings && typeof value !== 'number') return fail(`${input.label}: enter a number.`);
      const parsed = decimal(value);
      if (compare(parsed, decimal(input.min)) < 0 || compare(parsed, decimal(input.max)) > 0) {
        return fail(`${input.label}: enter a value from ${input.min} to ${input.max}.`);
      }
      exact[input.id] = parsed; normalized[input.id] = Number(value);
    }
  }
  return { exact, normalized };
};
const applies = (when, exact) => {
  if (!when) return true;
  const actual = exact[when.input];
  const comparison = typeof actual === 'boolean' ? (actual === when.value ? 0 : 1) : compare(actual, decimal(when.value));
  return when.operator === 'eq' ? comparison === 0 : when.operator === 'gt' ? comparison > 0
    : when.operator === 'gte' ? comparison >= 0 : when.operator === 'lt' ? comparison < 0 : comparison <= 0;
};
const quoteValidated = (book, values, allowStrings = true) => {
  const { exact, normalized } = inputValues(book, values, allowStrings);
  const taxTotals = Object.fromEntries(book.taxes.map(tax => [tax.id, 0n]));
  let subtotal = 0n, taxTotal = 0n;
  const lines = [];
  for (const line of book.lines) {
    if (!applies(line.when, exact)) continue;
    const amount = evaluate(line.formula, exact);
    if (amount.n < 0n) return fail('A pricing formula produced a negative amount.');
    const net = round(amount.n * 100n, amount.d);
    const taxes = [];
    for (const tax of book.taxes) {
      if (!line.taxes.includes(tax.id)) continue;
      const rate = decimal(tax.rate, 2);
      const value = round(net * rate.n, rate.d * 100n);
      taxTotals[tax.id] += value; taxTotal += value;
      taxes.push({ id: tax.id, label: tax.label, amountCents: centsNumber(value) });
    }
    const total = net + taxes.reduce((sum, tax) => sum + globalThis.BigInt(tax.amountCents), 0n);
    lines.push({ id: line.id, label: line.label, subtotalCents: centsNumber(net), taxes, totalCents: centsNumber(total) });
    subtotal += net;
  }
  return {
    currency: book.currency, inputs: normalized, lines,
    taxes: book.taxes.map(tax => ({ id: tax.id, label: tax.label, amountCents: centsNumber(taxTotals[tax.id]) })),
    subtotalCents: centsNumber(subtotal), taxCents: centsNumber(taxTotal), totalCents: centsNumber(subtotal + taxTotal),
  };
};
const validateMetabloomPriceBook = value => {
  try {
    if (!keys(value, ['version', 'currency', 'inputs', 'taxes', 'lines', 'examples']) || value.version !== 1
      || !['CAD', 'USD'].includes(value.currency)
      || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_METABLOOM_PRICE_BOOK_BYTES
      || !list(value.inputs, 1, 8) || !list(value.taxes, 0, 4) || !list(value.lines, 1, 24) || !list(value.examples, 1, 6)) return null;
    for (const input of value.inputs) {
      if (!object(input) || !id(input.id) || !text(input.label)) return null;
      if (input.type === 'boolean') {
        if (!keys(input, ['id', 'label', 'type', 'initial']) || typeof input.initial !== 'boolean') return null;
      } else if (input.type !== 'number' || !keys(input, ['id', 'label', 'type', 'min', 'max', 'initial'])
        || ![input.min, input.max, input.initial].every(validNumber) || input.min >= input.max
        || input.initial < input.min || input.initial > input.max) return null;
    }
    if (!unique(value.inputs.map(input => input.id))) return null;
    for (const tax of value.taxes) {
      if (!keys(tax, ['id', 'label', 'rate']) || !id(tax.id) || !text(tax.label) || typeof tax.rate !== 'string') return null;
      const rate = decimal(tax.rate, 2);
      if (rate.n < 0n || rate.n > rate.d * 100n) return null;
    }
    if (!unique(value.taxes.map(tax => tax.id))) return null;
    for (const line of value.lines) {
      if (!keys(line, ['id', 'label', 'formula', 'taxes', 'when']) || !id(line.id) || !text(line.label)
        || !validateFormula(line.formula, value.inputs) || !list(line.taxes, 0, 4)
        || !unique(line.taxes) || line.taxes.some(taxId => !value.taxes.some(tax => tax.id === taxId))) return null;
      if (line.when !== null) {
        if (!keys(line.when, ['input', 'operator', 'value'])) return null;
        const input = value.inputs.find(candidate => candidate.id === line.when.input);
        if (!input || !['eq', 'gt', 'gte', 'lt', 'lte'].includes(line.when.operator)) return null;
        if (input.type === 'boolean') {
          if (line.when.operator !== 'eq' || typeof line.when.value !== 'boolean') return null;
        } else if (!validNumber(line.when.value)) return null;
      }
    }
    if (!unique(value.lines.map(line => line.id))) return null;
    quoteValidated(value, Object.fromEntries(value.inputs.map(input => [input.id, input.initial])), false);
    for (const example of value.examples) {
      if (!keys(example, ['label', 'inputs']) || !text(example.label)) return null;
      quoteValidated(value, example.inputs, false);
    }
    return JSON.parse(JSON.stringify(value));
  } catch { return null; }
};
const quoteMetabloomPriceBook = (book, values) => {
  const validated = validateMetabloomPriceBook(book);
  if (!validated) return fail('This price book did not pass validation.');
  return quoteValidated(validated, values);
};
const deriveMetabloomPriceBookToolSchema = book => {
  const validated = validateMetabloomPriceBook(book);
  if (!validated) return fail('This price book did not pass validation.');
  return {
    type: 'object', additionalProperties: false,
    properties: Object.fromEntries(validated.inputs.map(input => [input.id, input.type === 'boolean'
      ? { type: 'boolean', description: input.label }
      : { type: 'number', minimum: input.min, maximum: input.max, description: `${input.label}. At most six decimal places.` }])),
    required: validated.inputs.map(input => input.id),
  };
};
module.exports = { MAX_METABLOOM_PRICE_BOOK_BYTES, validateMetabloomPriceBook, quoteMetabloomPriceBook, deriveMetabloomPriceBookToolSchema };
