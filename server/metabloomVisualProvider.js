const { readVisualJson, visualError } = require('./metabloomVisualStore');
const { readMetabloomProviderError, providerDetails, providerRequestId } = require('./metabloomProviderErrors');

// Only tune models whose effort values are known. Other configured models keep
// their provider defaults instead of receiving an unsupported parameter.
function visualReasoning(model, brief = false) {
  if (/^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(model))
    return { effort: brief ? 'minimal' : 'low' };
  return undefined;
}

async function requestVisualResponse(payload, { signal, fetchImpl = globalThis.fetch,
  phase, requestRef, maxBytes = 90000 } = {}) {
  if (!process.env.OPENAI_API_KEY) throw visualError('visual_unavailable');
  const startedAt = Date.now();
  const details = {
    phase: ['start', 'generate', 'continue'].includes(phase) ? phase : 'unknown',
    model: /^[a-zA-Z0-9._:-]{1,100}$/.test(payload.model) ? payload.model : 'invalid',
    reasoningEffort: payload.reasoning?.effort || 'default',
    ...(/^[a-f0-9]{12}$/.test(requestRef) ? { requestRef } : {}),
  };
  let response;
  try {
    signal?.throwIfAborted();
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await readMetabloomProviderError(response, signal);
    const value = await readVisualJson(response, maxBytes, { signal });
    for (const [key, count] of Object.entries({
      inputTokens: value?.usage?.input_tokens,
      outputTokens: value?.usage?.output_tokens,
      reasoningTokens: value?.usage?.output_tokens_details?.reasoning_tokens,
    })) if (Number.isSafeInteger(count) && count >= 0) details[key] = count;
    const id = providerRequestId(response);
    if (id) details.providerRequestId = id;
    if (value?.status === 'incomplete' && value.incomplete_details?.reason === 'max_output_tokens')
      throw visualError('visual_output_limit');
    if (value?.status !== 'completed' || !Array.isArray(value.output)) throw visualError('visual_unavailable');
    console.info('metabloom_ui_provider', JSON.stringify({ ...details, outcome: 'complete', durationMs: Date.now() - startedAt }));
    return value;
  } catch (error) {
    const code = signal?.aborted ? 'cancelled'
      : ['visual_invalid', 'visual_output_limit', 'visual_unavailable', 'provider_authentication_failed',
        'model_configuration_error', 'provider_rate_limited', 'provider_unavailable'].includes(error?.code)
        ? error.code : 'visual_unavailable';
    console.info('metabloom_ui_provider', JSON.stringify({
      ...details, outcome: 'failed', code, durationMs: Date.now() - startedAt,
      ...(Number.isInteger(error?.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599
        ? { providerStatus: error.providerStatus } : {}),
      ...providerDetails({ code: error?.providerCode, param: error?.providerParam }),
      ...(response && providerRequestId(response) ? { providerRequestId: providerRequestId(response) } : {}),
    }));
    throw error;
  }
}

module.exports = { visualReasoning, requestVisualResponse };
