# Metabloom model selection

The `/orb` composer exposes OpenAI, DeepSeek and Claude. **Use model** changes the current session. **Save as provider default** saves the selected provider and that provider's model to the authenticated account, then applies the choice. Returning to another provider restores its own saved default. Defaults survive reloads and sign-ins across devices.

The model preference stores no API keys or conversation text. Server-only `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` and `ANTHROPIC_API_KEY` enable the connections. A missing key is shown as not connected; a failed model-list request is shown as unavailable. Deployment defaults are optional `METABLOOM_OPENAI_MODEL`, `METABLOOM_DEEPSEEK_MODEL` and `METABLOOM_ANTHROPIC_MODEL` settings. OpenAI retains its existing `gpt-5-mini` legacy default.

## Discovery and selection

`GET /api/metabloom-models` authenticates before reading the three providers' model APIs and the account preference. Only compatible conversational models are returned. The bounded catalog is cached for five minutes in each process; failed lookups have a 30-second retry delay. Each lookup has an eight-second deadline, a 1 MiB response ceiling, at most three Claude pages and 120 displayed models. Concurrent discovery is coalesced. A failed provider cannot replace a previously selected provider.

| Provider | Discovery | Chat and brief transport | Compatibility boundary |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/models` | Responses API | GPT-4.1, compatible GPT-4o, GPT-5 and newer conversational families, o3/o4. Audio, image, realtime, Codex, search-only and other specialized IDs are excluded. |
| DeepSeek | `https://api.deepseek.com/models` | Responses API | Provider-reported DeepSeek text models. Multiple returned tool calls run serially inside the existing four-call budget. |
| Claude | `https://api.anthropic.com/v1/models` | Messages API | Claude models advertising structured outputs. Tool results and signed thinking are retained privately for continuation. |

**Latest available** resolves once at the start of the request. OpenAI uses creation timestamps and Claude uses release timestamps. DeepSeek omits release dates, so ordering uses a version in its reported model name when present. This is not a quality or price ranking. When no ordering metadata exists, Latest is omitted. Pinned IDs remain pinned; removed IDs fail visibly and require another selection. A configured deployment default that is absent from the catalog is also unavailable, never replaced with the first result. A selection never silently falls back to another model, provider or demo response.

The picker freezes while a request is running. The request carries an exact `{ provider, model }` selection; the server revalidates it against the catalog. Hostnames, paths, credentials and headers are never accepted from the browser. `X-Metabloom-Provider` and `X-Metabloom-Model` report the resolved writer on the response. Invalid output, refusal, truncation and provider failures remain typed failures. Existing output/citation validators and the [UX lifecycle invariants](metabloom-ux-invariants.md) apply to every provider.

The shared chat prompt includes a valid final-answer example with the exact protocol version. DeepSeek also receives the actual server-generated response schema in its system instructions, including per-request segment or citation constraints. This keeps its output contract explicit when following conversation text written by a different provider. The schema transport parameter and strict host validators remain mandatory; malformed output is never salvaged into a successful answer. Rejections log the provider/model and a fixed host-parser diagnostic, never the raw answer, prompt, conversation or private reasoning.

## Account persistence

`POST /api/metabloom-models` accepts only `{ provider, model }`. The session guard enforces the authenticated account and same-origin POST. Model validation precedes persistence. A bounded Redis script updates that one provider's default and the preferred provider atomically, preserving defaults saved concurrently for other providers. The key uses the existing durable saved-work environment scope and authenticated issuer/subject account hash. No browser-supplied owner is accepted; defaults cannot cross accounts or production/preview environments. There is no Postgres dependency.

The UI reports a saved default only after the server confirms it. Lost receipts are reported as unconfirmed; there is no automatic mutation retry. If preference loading fails, the user can explicitly select a session model without overwriting unknown preferences. Metadata responses are private and non-cacheable by browsers/CDNs.

## Shared tools

The selected provider writes ordinary answers, saved-reference answers and Deep Research structured briefs. Live web evidence is still gathered by the existing OpenAI research service, and native visual generation retains its existing service. The picker explains this so selecting Claude or DeepSeek does not imply exclusive use of that provider. Search queries and relevant evidence may therefore pass between the chosen writer and the shared search service. Jev reactions are also unchanged.

Ordinary tools retain visible status, observed progress, cancellation and budget enforcement. Newer clients send an explicit selection; cached clients with no selection retain the existing OpenAI route. Switching providers starts a new request with bounded displayed conversation history, never another provider's private reasoning or credentials.

## Verification and provider references

`scripts/metabloom-models.test.cjs` covers live catalog normalization, cache/coalescing, unavailable connections, pagination, account isolation, atomic provider defaults, authentication, real API routing, native Claude tool continuation, DeepSeek serial calls and incomplete output. UI tests cover restoration, per-provider defaults, save receipts/failures, removed models, cancellation, focus and selection frozen per turn. Selected-provider brief tests exercise the same citation and coverage validators. A real Redis CI check verifies concurrent defaults, persistence and account/environment isolation. Browser fixtures expose model discovery explicitly so existing workspace/research tests do not accidentally make provider calls; the browser check also saves a default, checks dialog geometry and verifies focus restoration.

- [OpenAI model list](https://developers.openai.com/api/reference/resources/models/methods/list)
- [DeepSeek model list](https://api-docs.deepseek.com/api/list-models/)
- [DeepSeek Responses compatibility](https://api-docs.deepseek.com/guides/responses_api/)
- [Claude model list](https://platform.claude.com/docs/en/api/models/list)
- [Claude structured output constraints](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

The model list is discovery, not proof that an account can invoke every listed model. Access, quotas and provider capability changes can still reject a request. Runtime failures stay visible; no cross-provider retry is performed.
