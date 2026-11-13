const METABLOOM_PROVIDERS = Object.freeze({ openai: 'OpenAI', deepseek: 'DeepSeek', anthropic: 'Claude' });
const modelId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value);
const parseMetabloomModelSelection = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === 'model,provider'
  && Object.hasOwn(METABLOOM_PROVIDERS, value.provider) && modelId(value.model)
  ? { provider: value.provider, model: value.model } : null;
const defaultModelPreferences = () => ({ provider: 'openai', defaults: { openai: 'default', deepseek: 'default', anthropic: 'default' } });
const parseModelPreferences = value => {
  if (!value || Object.keys(value).sort().join(',') !== 'defaults,provider'
    || !Object.hasOwn(METABLOOM_PROVIDERS, value.provider) || !value.defaults
    || Object.keys(value.defaults).sort().join(',') !== 'anthropic,deepseek,openai'
    || !Object.values(value.defaults).every(modelId)) return null;
  return { provider: value.provider, defaults: { ...value.defaults } };
};
const parseModelCatalog = value => {
  if (!value || value.version !== 1 || !Array.isArray(value.providers) || value.providers.length !== 3) return null;
  const seen = new Set();
  for (const provider of value.providers) {
    if (!provider || !Object.hasOwn(METABLOOM_PROVIDERS, provider.id) || seen.has(provider.id)
      || !['ready', 'not_configured', 'unavailable'].includes(provider.status)
      || !Array.isArray(provider.models) || provider.models.length > 120) return null;
    seen.add(provider.id);
    const ids = new Set();
    for (const model of provider.models) {
      if (!model || !modelId(model.id) || ['default', 'latest'].includes(model.id) || ids.has(model.id)
        || typeof model.label !== 'string' || !model.label || model.label.length > 120) return null;
      ids.add(model.id);
    }
    if (provider.status === 'ready' && !ids.size) return null;
    if (provider.defaultModel !== null && !ids.has(provider.defaultModel)) return null;
    if (provider.latestModel !== null && !ids.has(provider.latestModel)) return null;
  }
  return value;
};
module.exports = { METABLOOM_PROVIDERS, modelId, parseMetabloomModelSelection,
  defaultModelPreferences, parseModelPreferences, parseModelCatalog };
