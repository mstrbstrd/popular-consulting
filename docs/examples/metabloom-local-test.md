# Test the Metabloom response protocol

Open `/orb`. The landing controls are **Show me a whimsical response**, **Give me a reflective response**, **Offer a reassuring response**, and **Demo a two-part emotional stream**. They are always local, cost nothing at the provider, and work without an API key. After sending a message, expand **Local emote demos** above the composer to replay them. Assistant messages show the selected semantic emote beside Metabloom's name.

The landing note reads `Emote protocol 1.0`. The root has `data-response-contract="emote+response"` and `data-emote-protocol="1.0.0"`. These are actual shipped application markers, not PR descriptions.

## Local provider test

Use Node.js 20 and the Vercel development server (the React-only dev server does not run root API functions):

```sh
cp docs/examples/metabloom.env.example .env.local
# Fill in OPENAI_API_KEY in .env.local. Do not commit it.
npx vercel dev
```

Type a normal message in `/orb`, rather than clicking a hardwired demo. The browser calls `/api/metabloom`. The API key remains on the server. Responses are labelled Preview response only when the server is absent or deliberately unconfigured. Rate limits, provider failures, malformed output, and refusal are errors, not disguised demo success.

```sh
node scripts/test-metabloom-api.mjs
```

The smoke client makes one billable model request when configured. No provider call is made by CI or by the demo buttons. End-to-end tests mock the provider and test actual validation; they do not claim to prove live provider access.

## Vercel preview or production

Set `OPENAI_API_KEY`, optionally `METABLOOM_MODEL`, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in server environment variables, then redeploy. Use a Redis database dedicated to this application. Public model requests fail closed without shared quota storage, even when a key is set. Local in-memory throttling is limited to loopback development only.

The shared atomic quota permits at most 12 requests per client per minute and 300 total requests per rolling 24-hour project window. Every admitted request consumes quota even if the provider subsequently fails. These application limits do not replace provider budget controls or edge abuse protection.

`GET /api/metabloom` makes no provider request and returns protocol version, the nine allowed emotes, release marker, and whether server configuration is complete. It never returns any secret. A `configured: true` response indicates configuration presence, not a successful provider authorization test.
