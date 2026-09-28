# Cloudflare Pages Functions

The website is a Cloudflare Pages project with root directory `site/`. Files in `site/functions/`
become server routes on the same domain; everything else in `site/` stays a static file.
Files here hold no secrets (the source is public anyway); secrets live only in Cloudflare's
encrypted environment variables.

## `/api/demo-ai`: the "Free demo" AI relay

The desktop app's **Free demo** AI provider (the default when the user has no key of their own)
sends its Gemini requests here. The relay adds the owner's free-tier Gemini key, applies limits and
forwards the request to Google. The key is stored only as an encrypted Cloudflare secret: it is
never in the app, never in this repository and never in a response.

- `POST /api/demo-ai`: body is a Gemini `generateContent` request as built by
  `app/main/ai/providers/gemini.ts`. Required header `X-BoardPilot-Client: <app>/<version>`.
  Returns Google's JSON answer, or `{ "error": { "code", "message" } }`.
- `GET /api/demo-ai`: health check, `{ ok, model, limits, configured, rateStore }`.

What the relay enforces:

| Rule | Value |
| --- | --- |
| Methods | `POST` (and `GET` for health, `OPTIONS` without CORS headers) |
| Client header | `X-BoardPilot-Client: BoardPilot/0.3.0` style, else 400 |
| Body size | at most 48 KB, else 413 |
| Output tokens | `generationConfig.maxOutputTokens` clamped to 2048; thinking kept low |
| Fields | only `contents`, `systemInstruction`, `tools`, `toolConfig.functionCallingConfig` and a whitelist of `generationConfig`; any `model`, key, URL, `cachedContent`, `safetySettings` or file URI from the client is dropped |
| Tools | only `functionDeclarations` and `google_search`, else 400 |
| Rate limit | per IP: 10 requests per minute and 150 per day, else 429 with `Retry-After` |
| No key | 503 `demo_not_configured` ("demo not configured") |
| Logging | request and response bodies are never logged; IPs are only kept as SHA-256 hashes in short-lived counters |

Default model: `gemini-3.1-flash-lite` (older stable Flash-Lite with a free tier, function calling,
structured output and Search grounding). See https://ai.google.dev/gemini-api/docs/models and
https://ai.google.dev/gemini-api/docs/pricing. Override with `DEMO_MODEL`.

### Setup (owner, once)

1. **Create a Google Cloud project without billing.** Go to https://aistudio.google.com/apikey,
   press *Create API key* and pick (or create) a project that has **no billing account linked**.
   Without billing, Google only serves the free tier: when the free quota is used up, requests fail
   with 429; they can never cost money. Do not enable billing on this project later.
2. **Add the key to Cloudflare.** Dashboard → *Workers & Pages* → **boardpilot** → *Settings* →
   *Variables and Secrets* → *Add* → type **Secret**, name `GEMINI_API_KEY`, value the key,
   environment **Production** (add it to *Preview* too only if you want preview deployments to use it).
3. **Redeploy.** Secrets apply to new deployments: *Deployments* → latest production deployment →
   *Retry deployment* (or push any commit to `main`).
4. **Check it.** Open `https://boardpilot.agentflowbind.com/api/demo-ai`: it should show
   `"configured": true` and the model.

Optional variables (type *Text*, not secret):

- `DEMO_MODEL`: another Gemini model id, e.g. `gemini-3.5-flash-lite`.
- `DEMO_RATE_PER_MIN`, `DEMO_RATE_PER_DAY`: per-IP limits (defaults 10 and 150).

Optional KV binding: *Settings* → *Bindings* → *Add* → *KV namespace*, variable name `DEMO_KV`.
With it the rate counters are shared by all Cloudflare data centers. Without it the counters live
in the Cache API of each data center, which is free and good enough for a demo but is per location
and best effort. Note that the KV free plan allows about 1,000 writes per day and every request
writes two counters, so KV on the free plan only suits light use.

To turn the demo off, delete the `GEMINI_API_KEY` secret and redeploy: the app then shows
"The free demo is not set up yet." Users can also switch it off in the app by setting
`BOARDPILOT_DEMO_AI_URL=off` in `.env.local`.

### Privacy note

On Google's free tier, prompts and answers may be used by Google to improve its products
(see the "Used to improve our products" row on https://ai.google.dev/gemini-api/docs/pricing).
The demo is for testing BoardPilot only: do not send private data through it. The app says so in
AI settings and in the assistant panel, and suggests adding your own Claude, GPT or Gemini key for
real use.

### Local test

`npx vitest run tests/demo-ai.test.ts` runs the function with a stubbed `fetch` and Cache API.
With Wrangler: `npx wrangler pages dev site` and a `.dev.vars` file containing
`GEMINI_API_KEY=...` (never commit it).
