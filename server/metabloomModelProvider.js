const { PROVIDER_CONFIG, providerHeaders, providerConfigured } = require('./metabloomModels');
const { readMetabloomProviderJson } = require('./metabloomProviderJson');
const { createMetabloomProviderError, readMetabloomProviderError, providerDetails } = require('./metabloomProviderErrors');
const { traceSpan } = require('./metabloomTrace');

// Token counts for the latency trace, across the OpenAI and Claude shapes.
const traceUsage = (usage) => ({
  inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens,
  reasoningTokens: usage?.output_tokens_details?.reasoning_tokens,
  cachedTokens: usage?.input_tokens_details?.cached_tokens ?? usage?.cache_read_input_tokens,
});
const invalid = reason => createMetabloomProviderError('answer_invalid', reason);
const MAX_STREAM_BYTES = 2 * 1024 * 1024;

// Reads a Responses API event stream into the same completed response object
// a non-streamed request returns, forwarding answer text as it is generated.
// Text is forwarded unvalidated: the caller owns parsing and validation.
async function readResponsesStream(response, { signal, onText }) {
  if (!response.body?.getReader || !response.headers?.get?.('content-type')?.includes('text/event-stream'))
    throw createMetabloomProviderError('answer_incomplete', 'stream_not_event_stream');
  const reader = response.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', data = [], bytes = 0, completed = null, textKey = null, firstTextAt = null;
  const consume = async () => {
    if (!data.length) return;
    const serialized = data.join('\n'); data = [];
    if (serialized === '[DONE]') return;
    let event; try { event = JSON.parse(serialized); } catch { throw invalid('stream_event'); }
    if (['error', 'response.failed'].includes(event.type))
      throw createMetabloomProviderError('provider_unavailable', 'provider_stream_error', providerDetails(event.response?.error || event));
    if (event.type === 'response.incomplete')
      throw createMetabloomProviderError('answer_incomplete', event.response?.incomplete_details?.reason === 'max_output_tokens' ? 'output_token_limit' : 'answer_not_completed');
    if (['response.refusal.delta', 'response.refusal.done'].includes(event.type)) throw createMetabloomProviderError('answer_incomplete', 'answer_not_completed');
    if (event.type === 'response.output_text.delta') {
      // One answer channel per response; a second message is not an answer.
      const key = `${event.item_id}:${event.output_index}:${event.content_index}`;
      if (textKey !== null && key !== textKey) throw invalid('stream_channels');
      textKey = key;
      if (typeof event.delta !== 'string') throw invalid('stream_delta');
      if (firstTextAt === null) firstTextAt = Date.now();
      if (event.delta) await onText(event.delta);
    }
    if (event.type === 'response.completed') completed = event.response;
  };
  try {
    while (!completed) {
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_STREAM_BYTES) throw invalid('stream_too_large');
      buffer += utf8.decode(chunk.value, { stream: true });
      let newline;
      while (!completed && (newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) await consume();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (!completed && data.length) await consume();
    if (!completed) throw createMetabloomProviderError('answer_incomplete', 'stream_ended_early');
    return { result: completed, firstTextAt };
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock?.();
  }
}

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

// With onText, an OpenAI request streams and forwards its answer text as it is
// generated; the resolved value is the same completed response either way.
// Other providers ignore onText and return the whole response.
async function requestMetabloomModel(payload, { selection, signal, fetchImpl = globalThis.fetch, requestRef, round, purpose = 'model', onText } = {}) {
  const provider = selection?.provider || 'openai', model = selection?.model || payload.model;
  if (!Object.hasOwn(PROVIDER_CONFIG, provider) || !providerConfigured(provider))
    throw createMetabloomProviderError('model_configuration_error', 'provider_not_configured');
  const stream = typeof onText === 'function' && provider === 'openai';
  let body = { ...payload, model, stream, store: false }, path = '/responses';
  if (provider === 'anthropic') {
    path = '/messages';
    body = { model, system: payload.instructions, messages: claudeMessages(payload.input),
      max_tokens: payload.max_output_tokens, stream: false,
      ...(payload.text?.format?.type === 'json_schema' ? {
        output_config: { format: { type: 'json_schema', schema: claudeSchema(payload.text.format.schema) } },
      } : {}),
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
      + (payload.tools?.length && payload.tool_choice !== 'none'
        ? 'Use native tool calls when needed; their results are not final answer objects. '
        : 'No tools are enabled for this response. Return the final answer using only the supplied context. ')
      + 'For the final answer, use the required fields and exact enum values, with no extra fields, code fences or surrounding text. '
      + 'Do not imitate the plain-text formatting of earlier conversation messages.\n'
      + JSON.stringify(payload.text.format.schema);
  } else if (!/^(?:gpt-[5-9]|o[34])/.test(model)) delete body.reasoning;
  else if (/(?:^|-)pro(?:-|$)/.test(model) && body.reasoning) body.reasoning = { effort: 'medium' };
  signal?.throwIfAborted();
  // One span per provider request: headersMs is time to the response headers,
  // firstByteMs (streamed requests) is time to the first answer text, and the
  // span ends when the whole response has been read.
  const startedAt = Date.now();
  const end = traceSpan(purpose, { provider, model, ...(Number.isSafeInteger(round) ? { round } : {}), stream });
  let result;
  try {
    const response = await fetchImpl(PROVIDER_CONFIG[provider].origin + path, {
      method: 'POST', headers: providerHeaders(provider), redirect: 'error', signal, body: JSON.stringify(body),
    });
    const headersMs = Date.now() - startedAt;
    if (!response.ok) { end({ outcome: 'error', headersMs }); throw await readMetabloomProviderError(response, signal); }
    // A whole JSON body (a provider or proxy that does not stream) is read as
    // an ordinary response; its answer is then shown when it validates.
    if (stream && !response.headers?.get?.('content-type')?.includes('application/json')) {
      const streamed = await readResponsesStream(response, { signal, onText });
      result = streamed.result;
      end({ outcome: 'ok', headersMs, ...(streamed.firstTextAt !== null ? { firstByteMs: streamed.firstTextAt - startedAt } : {}),
        ...traceUsage(result?.usage) });
    } else {
      const raw = await readMetabloomProviderJson(response, signal);
      result = provider === 'anthropic' ? normalizeClaude(raw) : raw;
      end({ outcome: 'ok', headersMs, ...(stream ? { stream: false } : {}), ...traceUsage(result?.usage) });
    }
  } catch (error) { end({ outcome: signal?.aborted ? 'aborted' : 'error' }); throw error; }
  if (result?.status !== 'completed' || result.error || !Array.isArray(result.output))
    throw createMetabloomProviderError('answer_incomplete', 'agent_response_incomplete');
  console.info('metabloom_agent_provider', JSON.stringify({ requestRef, provider, model, outcome: 'complete',
    ...(Number.isSafeInteger(result.usage?.input_tokens) ? { inputTokens: result.usage.input_tokens } : {}),
    ...(Number.isSafeInteger(result.usage?.output_tokens) ? { outputTokens: result.usage.output_tokens } : {}) }));
  return result;
}
module.exports = { requestMetabloomModel, readResponsesStream, claudeSchema, claudeMessages, normalizeClaude, traceUsage };
