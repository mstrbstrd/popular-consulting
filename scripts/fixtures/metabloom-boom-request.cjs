const { priceBookMemoryDatabase } = require('./metabloom-price-book-workflow.cjs');
const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkTransport } = require('../../server/metabloomSavedWorkDatabase');
const { emptyBoomFields } = require('../../src/components/metabloomBoomRequest');
const identity = { accountKey: 'a'.repeat(64) };
const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherConversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fields = () => ({ ...emptyBoomFields(), market: 'CA', firstName: 'Alex', lastName: 'Example', companyName: 'Demo Concrete',
  email: 'alex@example.test', phoneNumber: '+1 250 555 0100', pumpMake: 'DY', pumpModel: '40X-5ZR', serialNumber: 'DEMO-123',
  hardness: 'Twin Wall', backEnd: 'Yes' });
const changesFor = values => Object.entries(values).filter(([, value]) => value !== null).map(([field, value]) => ({ field, value, sourceText: value }));
const messageFor = values => Object.entries(values).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`).join('; ');
const draft = () => ({ version: 1, revision: 1, updatedAt: 1000, fields: fields() });
// Exercise the production REST adapter. The Lua interpreter is fictional here;
// the Redis integration suite verifies the actual atomic scripts separately.
function boomDatabase() {
  const config = readMetabloomSavedWorkConfig({ AUTH_ENVIRONMENT: 'development', AUTH_APP_ORIGIN: 'https://boom.example.test',
    AUTH_REDIS_REST_URL: 'https://redis.example.test', AUTH_REDIS_REST_TOKEN: 'fictional-fixture' });
  const memory = priceBookMemoryDatabase(config.scope);
  return { ...memory, config, command: createMetabloomSavedWorkTransport(config, { fetchImpl: async (url, options) => {
    if (url !== config.redisUrl) throw new Error('Unexpected fixture destination');
    return Response.json({ result: await memory.command(JSON.parse(options.body)) });
  } }) };
}
module.exports = { identity, conversationId, otherConversationId, fields, changesFor, messageFor, draft, boomDatabase };
