# Test Metabloom with a live model

The browser never receives the provider credential. The `/api/metabloom` server function reads it from the server environment.

## Local setup

1. Copy `docs/examples/metabloom.env.example` to `.env.local`.
2. Set `OPENAI_API_KEY` in `.env.local`.
3. Optionally change `METABLOOM_MODEL`.
4. Start the project through a serverless-compatible local host so both the React app and `api/metabloom.js` run on the same origin:

   ```bash
   npx vercel dev
   ```

5. Open `/orb` and send a message. Ordinary replies use exactly one semantic emote.

The local hardwired demos remain available when the server endpoint is absent or no key is configured.

## Endpoint smoke test

With the local server running:

```bash
node scripts/test-metabloom-api.mjs
```

Optional overrides:

```bash
METABLOOM_BASE_URL=http://localhost:3000 \
METABLOOM_TEST_MESSAGE="Give me a reflective answer about uncertainty." \
node scripts/test-metabloom-api.mjs
```

The smoke client expects one newline-delimited `segment` event followed by one `done` event. It exits with an error when the response is not protocol-valid.

## Production configuration

Set `OPENAI_API_KEY` and, optionally, `METABLOOM_MODEL` in the deployment environment. Do not use a `REACT_APP_` prefix for the key because React embeds those variables into the browser bundle.
