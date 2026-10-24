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

## Describe your project

In **New project → Describe your project**, say what you want to make ("a weather station with a small screen"). The assistant:

1. looks first: the board, the parts already drawn and the log are in its context;
2. asks only what changes the design, one question per turn (power, indoors or outdoors, which board);
3. compares parts with you as cards that say what is different (what they measure, voltage, wiring, traps from the parts library);
4. proposes the whole project: library parts only, wires on safe pins picked by the board's own rules, part-to-part wires for loads (a pump on a MOSFET module), the extras to buy and the starter code.

Every proposal goes through the same wiring checker as a drawing made by hand; the assistant must fix errors and unwired pins before it answers. Nothing changes until you press **Apply to my project** (undoable), and nothing is ever written to the board from the chat.

Tools the model can call for this: `search_parts`, `get_part`, `offer_choices`, `propose_project`, `check_project` (`app/main/ai/tools.ts`, logic in `shared/projectBuilder.ts`).

### Testing it against the real model

`npm run eval:ai` runs 20 beginner requests on 12 of the 13 boards (English and Italian, a vague one, one the library cannot do) through the real assistant with your `ANTHROPIC_API_KEY`. A small model plays the user; every result is graded by code: a proposal was made and applied, no wiring errors, nothing unwired, the parts cover the request, no poor parts for 3.3 V logic, no "measured" claims, Italian answers to Italian requests. Reports go to [`docs/ai-evals/`](ai-evals/). A full run costs about $2.50 with Claude Sonnet 5. Options: `BP_EVAL_MODEL`, `BP_EVAL_ONLY`, `BP_EVAL_REPEAT`, and `BP_EVAL_RECORD=1`, which saves the website demo's recorded conversations to `app/renderer/replay/recordings/`.

The website plays those recordings in the browser demo (`/demo/#demo=chat&chat=<id>`) with a "Recorded conversation" banner: no AI call is made while you watch.

## Honesty rules

- Only measurements from this session are labelled **Measured**.
- Datasheet or library facts are **From documentation**, with the section named.
- Anything else is a **Suggestion** that you confirm before later steps rely on it.

## Hosting the demo relay (maintainers)

See [`site/functions/README.md`](../site/functions/README.md).
