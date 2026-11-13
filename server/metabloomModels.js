const { METABLOOM_PROVIDERS, modelId, parseMetabloomModelSelection } = require('../src/components/metabloomModelProtocol');
const { readMetabloomProviderJson } = require('./metabloomProviderJson');
const { createMetabloomProviderError, readMetabloomProviderError } = require('./metabloomProviderErrors');

const PROVIDER_CONFIG = Object.freeze({
  openai: { key: 'OPENAI_API_KEY', model: 'METABLOOM_OPENAI_MODEL', origin: 'https://api.openai.com/v1' },
  deepseek: { key: 'DEEPSEEK_API_KEY', model: 'METABLOOM_DEEPSEEK_MODEL', origin: 'https://api.deepseek.com' },
  anthropic: { key: 'ANTHROPIC_API_KEY', model: 'METABLOOM_ANTHROPIC_MODEL', origin: 'https://api.anthropic.com/v1' },
});
const providerConfigured = provider => Boolean(PROVIDER_CONFIG[provider] && process.env[PROVIDER_CONFIG[provider].key]);
const providerHeaders = provider => ({ 'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env[PROVIDER_CONFIG[provider].key]}`,
  ...(provider === 'anthropic' ? { 'anthropic-version': '2026-10-21' } : {}) });
const configuredModel = provider => process.env[PROVIDER_CONFIG[provider].model] || (provider === 'openai' ? 'gpt-5-mini' : null);
const unavailable = reason => createMetabloomProviderError('model_configuration_error', reason);

function compatibleModel(provider, item) {
  if (!item || !modelId(item.id) || ['default', 'latest'].includes(item.id)
    || (item.shutdown_date && Date.parse(item.shutdown_date) <= Date.now()) || item.lifecycle === 'retired') return false;
  if (provider === 'openai') return /^(?:gpt-(?:[5-9](?:[.-]|$)|4\.1(?:-|$)|4o(?:-|$))|o[34](?:-|$))/.test(item.id)
    && !/(?:audio|realtime|transcrib|image|search|deep-research|codex|chat-latest|computer|cyber|instruct)/i.test(item.id)
    && item.id !== 'gpt-4o-2024-05-13';
  if (provider === 'anthropic') return item.id.startsWith('claude-') && item.capabilities?.structured_outputs?.supported === true;
  return item.id.startsWith('deepseek-') && !/(?:coder|embed)/i.test(item.id)
    && (!item.output_modalities || item.output_modalities.includes('text'));
}
function normalizeModels(provider, items) {
  const seen = new Set();
  const models = items.filter(item => compatibleModel(provider, item)).filter(item => {
    if (seen.has(item.id)) return false; seen.add(item.id); return true;
  }).map(item => {
    const label = String(item.display_name || item.name || item.id)
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ').trim().slice(0, 120) || item.id;
    const released = Number.isFinite(item.created) ? item.created : Date.parse(item.created_at) / 1000;
    // DeepSeek omits release dates; only a provider-reported version can establish an ordering.
    const version = provider === 'deepseek' ? label.match(/(?:DeepSeek[- ]?V|deepseek-v)(\d+)(?:\.(\d+))?/i) : null;
    return { id: item.id, label, rank: released > 0 ? released : version ? Number(version[1]) * 1000000 + Number(version[2] || 0) : 0 };
  }).sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  const latestModel = models[0]?.rank > 0 ? models[0].id : null;
  return { latestModel, models: models.slice(0, 120).map(({ id, label }) => ({ id, label })) };
}

// Bounded process cache coalesces catalog reads without persisting credentials.
function createMetabloomModelCatalog({ fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now } = {}) {
  const cache = new Map();
  async function getProvider(provider, { signal } = {}) {
    signal?.throwIfAborted();
    const empty = { id: provider, status: 'not_configured', models: [], defaultModel: null, latestModel: null };
    if (!Object.hasOwn(PROVIDER_CONFIG, provider) || !providerConfigured(provider)) return empty;
    const cached = cache.get(provider);
    if (cached && cached.expires > now()) return cached.value;
    if (cached?.pending) return cached.pending;
    const pending = (async () => {
      const timeout = AbortSignal.timeout(8000);
      try {
        const items = []; let after;
        for (let page = 0; page < 3; page++) {
          const url = PROVIDER_CONFIG[provider].origin + '/models' + (provider === 'anthropic'
            ? '?limit=1000' + (after ? '&after_id=' + encodeURIComponent(after) : '') : '');
          const response = await fetchImpl(url, { headers: providerHeaders(provider), redirect: 'error', signal: timeout });
          if (!response.ok) throw await readMetabloomProviderError(response, timeout);
          const result = await readMetabloomProviderJson(response, timeout, 1048576);
          if (!Array.isArray(result?.data) || result.data.length > 1000) throw unavailable('catalog_invalid');
          items.push(...result.data);
          if (!result.has_more) break;
          if (provider !== 'anthropic' || page === 2 || !modelId(result.last_id) || after === result.last_id) throw unavailable('catalog_pagination');
          after = result.last_id;
        }
        const normalized = normalizeModels(provider, items);
        if (!normalized.models.length) throw unavailable('catalog_empty');
        const selected = configuredModel(provider);
        const value = { ...empty, ...normalized, status: 'ready',
          defaultModel: selected ? (normalized.models.some(model => model.id === selected) ? selected : null) : normalized.models[0].id };
        cache.set(provider, { value, expires: now() + 300000 });
        return value;
      } catch {
        const value = { ...empty, status: 'unavailable' };
        cache.set(provider, { value, expires: now() + 30000 });
        return value;
      }
    })();
    cache.set(provider, { pending });
    const value = await pending;
    signal?.throwIfAborted();
    return value;
  }
  return { getProvider, clear: () => cache.clear(),
    async list(options) { return { version: 1, providers: await Promise.all(Object.keys(METABLOOM_PROVIDERS).map(id => getProvider(id, options))) }; },
    async resolve(selection, options) {
      if (!parseMetabloomModelSelection(selection)) throw unavailable('model_selection_invalid');
      const catalog = await getProvider(selection.provider, options);
      options?.signal?.throwIfAborted();
      if (catalog.status !== 'ready') throw unavailable('model_provider_unavailable');
      const model = selection.model === 'default' ? catalog.defaultModel : selection.model === 'latest' ? catalog.latestModel : selection.model;
      if (!catalog.models.some(item => item.id === model)) throw unavailable('model_not_available');
      return Object.freeze({ provider: selection.provider, model });
    },
  };
}
const modelCatalog = createMetabloomModelCatalog();
module.exports = { PROVIDER_CONFIG, providerConfigured, providerHeaders, configuredModel,
  compatibleModel, normalizeModels, createMetabloomModelCatalog, modelCatalog };
