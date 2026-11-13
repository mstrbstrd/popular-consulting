const { PROVIDER_CONFIG, providerHeaders, providerConfigured } = require('./metabloomModels');
const { readMetabloomProviderJson } = require('./metabloomProviderJson');
const { createMetabloomProviderError, readMetabloomProviderError } = require('./metabloomProviderErrors');
const invalid = reason => createMetabloomProviderError('answer_invalid', reason);

// Anthropic's constrained decoder supports a smaller JSON Schema subset.
// Host-side parsers still enforce every original length, count and value bound.
function claudeSchema(value) {
  if (Array.isArray(value)) return value.map(claudeSchema);
  if (!value || typeof value !== 'object') return value;
  const result = {}, bounds = [];
  for (const [key, item] of Object.entries(value)) {
    if (['minLength', 'maxLength', 'minimum', 'maximum', 'maxItems', 'multipleOf'].includes(key)
      || (key === 'minItems' && item > 1)) bounds.push(`${key}: ${item}`);
    else result[key] = claudeSchema(item);
  }
  if (bounds.length) result.description = [result.description, bounds.join(', ')].filter(Boolean).join('. ');
  return result;
}
function claudeMessages(input) {
  const messages = [];
  const append = (role, content) => {
    if (messages.at(-1)?.role === role) messages.at(-1).content.push(...content);
    else messages.push({ role, content });
  };
  for (const item of input) {
    if (item.type === 'function_call_output') append('user', [{ type: 'tool_result', tool_use_id: item.call_id, content: item.output }]);
    else if (item.type === 'function_call') append('assistant', [{ type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments) }]);
    else if (item.type === 'reasoning' && item.anthropic) append('assistant', [item.anthropic]);
    else if (['user', 'assistant'].includes(item.role)) append(item.role, typeof item.content === 'string'
      ? [{ type: 'text', text: item.content }] : item.content.map(part => ({ type: 'text', text: part.text })));
    else throw invalid('claude_history');
  }
  return messages;
}
function normalizeClaude(response) {
  if (response?.type !== 'message' || response.role !== 'assistant' || !Array.isArray(response.content)
    || !['end_turn', 'tool_use'].includes(response.stop_reason))
    throw createMetabloomProviderError('answer_incomplete', 'claude_response_incomplete');
  const output = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') output.push({ type: 'function_call', status: 'completed', call_id: block.id,
      name: block.name, arguments: JSON.stringify(block.input) });
    else if (block.type === 'text') output.push({ type: 'message', status: 'completed', role: 'assistant',
      content: [{ type: 'output_text', text: block.text }] });
    else if (['thinking', 'redacted_thinking'].includes(block.type)) output.push({ type: 'reasoning', anthropic: block });
    else throw invalid('claude_content');
  }
  if ((response.stop_reason === 'tool_use') !== output.some(item => item.type === 'function_call')) throw invalid('claude_stop_reason');
  return { status: 'completed', output, usage: response.usage };
}

async function requestMetabloomModel(payload, { selection, signal, fetchImpl = globalThis.fetch, requestRef } = {}) {
  const provider = selection?.provider || 'openai', model = selection?.model || payload.model;
  if (!Object.hasOwn(PROVIDER_CONFIG, provider) || !providerConfigured(provider))
    throw createMetabloomProviderError('model_configuration_error', 'provider_not_configured');
  let body = { ...payload, model, stream: false, store: false }, path = '/responses';
  if (provider === 'anthropic') {
    path = '/messages';
    body = { model, system: payload.instructions, messages: claudeMessages(payload.input),
      max_tokens: payload.max_output_tokens, stream: false,
      output_config: { format: { type: 'json_schema', schema: claudeSchema(payload.text.format.schema) } },
      ...(payload.tools?.length ? {
        tools: payload.tools.map(tool => ({ name: tool.name, description: tool.description,
          input_schema: claudeSchema(tool.parameters), strict: true })),
        tool_choice: { type: payload.tool_choice === 'none' ? 'none' : 'auto', disable_parallel_tool_use: true },
      } : {}) };
  } else if (provider === 'deepseek') {
    delete body.include; delete body.store; delete body.parallel_tool_calls;
    body.reasoning = { effort: 'low' };
    // Also give the model the contract in its prompt. A compatible transport
    // does not guarantee every generated answer obeys the schema parameter.
    if (payload.text?.format?.type === 'json_schema') body.instructions = (payload.instructions || '')
      + '\n\nFinal answer contract: return one JSON object matching the following JSON Schema. '
      + 'Use native tool calls when needed; their results are not final answer objects. '
      + 'For the final answer, use the required fields and exact enum values, with no extra fields, code fences or surrounding text. '
      + 'Do not imitate the plain-text formatting of earlier conversation messages.\n'
      + JSON.stringify(payload.text.format.schema);
  } else if (!/^(?:gpt-[5-9]|o[34])/.test(model)) delete body.reasoning;
  else if (/(?:^|-)pro(?:-|$)/.test(model) && body.reasoning) body.reasoning = { effort: 'medium' };
  signal?.throwIfAborted();
  const response = await fetchImpl(PROVIDER_CONFIG[provider].origin + path, {
    method: 'POST', headers: providerHeaders(provider), redirect: 'error', signal, body: JSON.stringify(body),
  });
  if (!response.ok) throw await readMetabloomProviderError(response, signal);
  const raw = await readMetabloomProviderJson(response, signal);
  const result = provider === 'anthropic' ? normalizeClaude(raw) : raw;
  if (result?.status !== 'completed' || result.error || !Array.isArray(result.output))
    throw createMetabloomProviderError('answer_incomplete', 'agent_response_incomplete');
  console.info('metabloom_agent_provider', JSON.stringify({ requestRef, provider, model, outcome: 'complete',
    ...(Number.isSafeInteger(result.usage?.input_tokens) ? { inputTokens: result.usage.input_tokens } : {}),
    ...(Number.isSafeInteger(result.usage?.output_tokens) ? { outputTokens: result.usage.output_tokens } : {}) }));
  return result;
}
module.exports = { requestMetabloomModel, claudeSchema, claudeMessages, normalizeClaude };
