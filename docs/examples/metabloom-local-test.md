# Test Metabloom streaming

Open `/orb` and choose **Demo a two-part emotional stream**. One assistant bubble should first show a whimsical paragraph, then append a reflective paragraph. The message ID stays the same. The first paragraph is visible while **Receiving response…** is displayed; completion removes that status without replaying either emote. These transport-fragmented demos never contact a model provider.

After the first reply, expand **Local emote demos** above the input to replay. **Stop response** cancels a pending reply. Typing and sending a new message also cancels the older stream. A cancelled or failed partial reply is marked **Response incomplete**.

Ordinary replies remain single-emote by default. Check **Allow emote changes within one reply** to opt live requests into multiple segments. This never creates additional assistant messages. The root exposes `data-response-presentation="single-message-stream"` and `GET /api/metabloom` reports the same `presentation` value.

## Local provider setup

```sh
cp docs/examples/metabloom.env.example .env.local
# Set OPENAI_API_KEY in .env.local. Never commit it.
npx vercel dev
```

Send an original message rather than a hardwired demo. The provider is requested in streaming mode. Each complete validated JSON segment appears while later segments are still being generated. This is paragraph/segment streaming, not a character-by-character typing effect.

```sh
node scripts/test-metabloom-api.mjs
```

The smoke client makes one billable request when configured. CI only uses controlled mock provider streams. Real provider authentication is not claimed as tested without a key.

## Production configuration

Set server-only `OPENAI_API_KEY`, optionally `METABLOOM_MODEL`, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, then redeploy. The shared quota limits public requests to 12 per client per minute and 300 per project per rolling 24-hour window. Local loopback development supports key-only testing. Never use `REACT_APP_` for a secret.

`GET /api/metabloom` is a free metadata check. `configured: true` means the required variables exist, not that a paid provider request has succeeded. Missing/unconfigured service may use a clearly labelled local preview; provider failures, malformed streams, refusal, and quota errors are not disguised as successful demos.
