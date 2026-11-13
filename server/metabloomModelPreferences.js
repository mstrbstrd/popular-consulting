const { getMetabloomSavedWorkDatabase } = require('./metabloomSavedWorkDatabase');
const { defaultModelPreferences, parseModelPreferences, parseMetabloomModelSelection } = require('../src/components/metabloomModelProtocol');

const SCRIPT = `
if ARGV[1] ~= '' then redis.call('HSET', KEYS[1], 'provider', ARGV[1], ARGV[1], ARGV[2]) end
return redis.call('HMGET', KEYS[1], 'provider', 'openai', 'deepseek', 'anthropic')`;

function createMetabloomModelPreferences(database = getMetabloomSavedWorkDatabase()) {
  return async function preferences(identity, selection, options) {
    if (!/^[a-f0-9]{64}$/.test(identity?.accountKey) || !/^[a-f0-9]{64}$/.test(database.config?.scope)
      || (selection && !parseMetabloomModelSelection(selection))) throw new Error('Invalid model preferences');
    const key = `metabloom:model-preferences:v1:${database.config.scope}:${identity.accountKey}`;
    // One atomic field update preserves the other providers, including concurrent saves.
    const result = await database.command(['EVAL', SCRIPT, '1', key, selection?.provider || '', selection?.model || ''], options);
    if (!Array.isArray(result) || result.length !== 4) throw new Error('Invalid model preferences');
    const initial = defaultModelPreferences();
    const value = parseModelPreferences({ provider: result[0] || initial.provider, defaults: {
      openai: result[1] || initial.defaults.openai, deepseek: result[2] || initial.defaults.deepseek,
      anthropic: result[3] || initial.defaults.anthropic } });
    if (!value) throw new Error('Invalid model preferences');
    return value;
  };
}
module.exports = { createMetabloomModelPreferences };
