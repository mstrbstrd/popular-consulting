const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');
const { validateMetabloomPriceBook, MAX_METABLOOM_PRICE_BOOK_BYTES } = require('../src/components/metabloomPriceBook');

const READ_SCRIPT = "return redis.call('GET', KEYS[1])";
const PUBLISH_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local version = 0
if current then
  local record = cjson.decode(current)
  if type(record.version) ~= 'number' or record.version < 1 or record.version ~= math.floor(record.version) then
    return redis.error_reply('Invalid price book record')
  end
  version = record.version
end
if version ~= tonumber(ARGV[1]) then return {'conflict'} end
redis.call('SET', KEYS[1], ARGV[2])
return {'ok', ARGV[2]}`;

function priceBookError(code = 'price_book_unavailable') {
  return Object.assign(new Error(code), { code });
}

function parseRecord(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_METABLOOM_PRICE_BOOK_BYTES + 256) throw priceBookError();
  let value;
  try { value = JSON.parse(text); } catch { throw priceBookError(); }
  if (!value || Array.isArray(value) || Object.keys(value).length !== 3
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isSafeInteger(value.publishedAt) || value.publishedAt < 1) throw priceBookError();
  const book = validateMetabloomPriceBook(value.book);
  if (!book) throw priceBookError();
  return { version: value.version, publishedAt: value.publishedAt, book };
}

function createMetabloomPriceBookStore(database = getMetabloomSavedWorkDatabase(), { now = Date.now } = {}) {
  const keyFor = identity => {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope))
      throw priceBookError('price_book_invalid');
    return `metabloom:price-book:v1:${database.config.scope}:${identity.accountKey}`;
  };
  const command = async (args, options) => {
    try { return await database.command(args, options); }
    catch { throw priceBookError(); }
  };
  return {
    async read(identity, options) {
      const result = await command(['EVAL', READ_SCRIPT, '1', keyFor(identity)], options);
      return result === null ? null : parseRecord(result);
    },
    async publish(identity, { book: candidate, expectedVersion } = {}, options) {
      const key = keyFor(identity);
      const book = validateMetabloomPriceBook(candidate);
      if (!book || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER)
        throw priceBookError('price_book_invalid');
      const record = { version: expectedVersion + 1, publishedAt: now(), book };
      // Validate before mutation, including the injected clock. All state is one
      // persistent atomic value, with no expiry or local fallback on Redis failure.
      const text = JSON.stringify(record);
      parseRecord(text);
      const result = await command(['EVAL', PUBLISH_SCRIPT, '1', key, String(expectedVersion), text], options);
      if (Array.isArray(result) && result.length === 1 && result[0] === 'conflict') throw priceBookError('price_book_conflict');
      if (!Array.isArray(result) || result.length !== 2 || result[0] !== 'ok' || result[1] !== text) throw priceBookError();
      // No automatic retries: a lost response may follow a successful SET. The
      // caller must reload before another explicit publish with a fresh version.
      return parseRecord(result[1]);
    },
  };
}

module.exports = { createMetabloomPriceBookStore };
