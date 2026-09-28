# AI assistant

The assistant is optional: every check, measurement and the simulator work without it. When it is on, it can call the same measurement tools the app uses (read pins, pull-up check, I2C scan and read, ADC), highlight pins in 3D, ask you questions, recognise parts from a photo and draft parts from web links. It can **ask** to write to the board, but only you can confirm.

## Free demo

Out of the box BoardPilot uses a **free demo**: an older, inexpensive Gemini model reached through BoardPilot's test relay (`/api/demo-ai` on the website). It is:

- **limited** to a few requests per minute and per day for each user;
- **for testing only**: requests go through a free Google tier, which may use them to improve Google products, so don't send private data;
- able to **search the web** (Google Search grounding) when drafting parts from a link.

A banner in the assistant panel reminds you when the demo is active.

## Your own key

Top bar → **AI** → pick a provider and paste your key:

| Provider | Get a key |
|---|---|
| Claude (Anthropic) | <https://console.anthropic.com/> |
| GPT (OpenAI) | <https://platform.openai.com/api-keys> |
| Gemini (Google) | <https://aistudio.google.com/apikey> |

*Load models* lists the models your key can use; *Test connection* checks it. Keys are stored **encrypted on your computer** (Electron `safeStorage`) and requests go **directly** from the app to the provider. Developers can also set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local`.

## Honesty rules

- Only measurements from this session are labelled **Measured**.
- Datasheet or library facts are **From documentation**, with the section named.
- Anything else is a **Suggestion** that you confirm before later steps rely on it.

## Hosting the demo relay (maintainers)

See [`site/functions/README.md`](../site/functions/README.md).
