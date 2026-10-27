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

In the **Assistant** tab (or **New project → Describe it**, which opens a new project and continues in the chat), say what you want to make ("a weather station with a small screen"). The assistant:

1. looks first: the board, the parts already drawn and the log are in its context;
2. asks only what changes the design, one question per turn (power, indoors or outdoors, which board);
3. compares parts with you as cards that say what is different (what they measure, voltage, wiring, traps from the parts library);
4. proposes the whole project: library parts only, wires on safe pins picked by the board's own rules, part-to-part wires for loads (a pump on a MOSFET module), the extras to buy and the starter code.

Every proposal goes through the same wiring checker as a drawing made by hand; the assistant must fix errors and unwired pins before it answers. Nothing changes until you press **Apply to my project** (undoable), and nothing is ever written to the board from the chat.

A new project goes in a new project tab when the open one already has parts; its starter code goes in the Code panel. "Add a BME280 and an OLED" adds to the open project the same way, checked the same way. The assistant can also run the app's actions ("back up my board, then open the monitor") and change settings ("switch to Italian", "high contrast", "use my real board"); API keys and the MCP server stay yours to change.

Tools the model can call for this: `search_parts`, `get_part`, `offer_choices`, `propose_project`, `check_project`, plus `app_action` (with `change_setting`) and `write_code` (`app/main/ai/tools.ts`, logic in `shared/projectBuilder.ts` and `shared/actions.ts`).

### Testing it against the real model

`npm run eval:ai` runs 23 requests on 12 of the 13 boards (English and Italian, a vague one, one the library cannot do) through the real assistant with your `ANTHROPIC_API_KEY`. A small model plays the user; every result is graded by code: a proposal was made and applied, no wiring errors, nothing unwired, the parts cover the request, no poor parts for 3.3 V logic, no "measured" claims, Italian answers to Italian requests. Reports go to [`docs/ai-evals/`](ai-evals/). A full run costs about $2 with Claude Sonnet 5 or 5.5, plus about $0.70 for the Opus safety judge (`BP_EVAL_JUDGE` picks another judge model). Options: `BP_EVAL_MODEL`, `BP_EVAL_ONLY`, `BP_EVAL_REPEAT`, and `BP_EVAL_RECORD=1`, which saves the website demo's recorded conversations to `app/renderer/replay/recordings/`.

The website plays those recordings in the browser demo (`/demo/#demo=chat&chat=<id>`) with a "Recorded conversation" banner: no AI call is made while you watch.

## Project memory

Teach the assistant your old projects. In **Project tools → Project memory**, create a memory (for example one per customer or product line, "acme-panels"), then add to it:

- **a code folder**: Arduino (`.ino`, `.cpp`, `.h`), ESP-IDF, STM32 HAL / CubeMX (`.c`, `.h`, `.ioc`), Pico SDK and PlatformIO projects, with their `CMakeLists.txt`, `Kconfig`, README and `.txt` notes. Build output, `.git`, `node_modules`, `.pio`, `managed_components`, ST's `*_HAL_Driver`, `CMSIS` and `Middlewares` folders, binary files and files over 512 KB are skipped (at most 3000 files and 25 MB of text per folder; the panel says what was left out). Adding the same folder again replaces it;
- **a note** you type: "This ST7789 needs 120 ms after reset, then MADCTL 0x36 = 0x70 for landscape";
- **a datasheet PDF**: not yet. Reading PDF text needs a PDF library (`pdfjs-dist` is the candidate) and CLAUDE.md asks before a new dependency; until it is added the button says so and offers a note. The store already takes extracted text (`MemoryStore.importPdfText`).

Everything stays on this computer: one JSON file per memory in the app data folder (`<userData>/memory/<id>.json`), read and written only by the main process. Nothing is sent anywhere until the assistant quotes a piece in a chat, the same as the project's code. **Export to share…** writes one `.bpmemory.json` file (without the paths it came from) that a colleague imports with **Import a memory file…**.

Tick a memory to **attach** it to the open project; the list is saved in the project file (`scene.memories`), and a memory can be attached to any number of projects. A project opened on a computer without that memory says so and offers to detach it.

How the assistant uses it:

- The context says which memories are attached. The system prompt asks the model to search before it writes driver or init code, and whenever you name a part, a chip or a register.
- `search_memory(query, limit)` ranks chunks locally with BM25 (no embeddings service; nothing leaves the computer to build an index). Files are cut into chunks of about 40 lines at top-level blocks (a function with its comment stays whole), notes and text by paragraph. Tokens are code-aware: identifiers whole and split (`ST7789_MADCTL` → `st7789_madctl`, `st7789`, `madctl`; `setAddrWindow` → `set`, `addr`, `window`), part numbers with and without suffix (`ST7789V` → `st7789`), hex values normalised (`0x36`, `0x0036`, `36h`), "initialise / initialize / init" as one word, Italian question words dropped. Names a chunk defines (functions, `#define`, structs) and its file name count extra; big data tables (fonts, bitmaps) are searched by name only, so a register value finds the init code, not a font.
- `read_memory(ref)` reads more: a result ref, or `file:start-end` (200 lines at most).
- Every result carries its citation, e.g. `memory · acme-panels · drivers/st7789_init.c:21-36`, which the reply lists as a source of kind `memory` (shown as "project memory" under the answer). The app drops memory sources that no tool returned in the conversation, so a reply rests on "From documentation" only with a real file and lines. Memory is old code for another board or wiring, not a datasheet: what the assistant changes or infers stays a suggestion.
- "Suggest code" and `write_code` get the three best chunks for the request and the project's parts, so the code panel reuses your own init sequence, with the same citation check.

Code: `shared/memory.ts` (chunking, tokens, BM25, citations, file format), `app/main/memory/store.ts` (the store, folder import, `MemoryAccess`), `app/main/memory/aiTools.ts` (the two tools), `app/main/memory/ipc.ts`, `app/renderer/components/MemoryPanel.tsx`. Other features (Display Studio) use `MemoryAccess.search(query, memoryIds, limit)` and `read(ref, memoryIds)` from the main process, or the same two tools. The browser demo shows "needs the app".
## Display Studio

Ask for what a display should show ("test patterns on my ST7789", "temperature big, humidity small, a warning that blinks above 30 °C", "a round gauge"). The assistant reads the panel with `get_display` and designs it with `design_display`; the app checks the design against the panel and shows it animated, pixel for pixel. Apply runs it on the project (Project tools → Display Studio, and a live preview over the 3D view); "Write the code" offers a matching Arduino sketch in the Code panel. Values are simulated and labelled so; the sketch marks each line to replace with the real sensor. Logic: `shared/displaySpec.ts` (the spec, checks), `shared/displayRender.ts` (pixels), `shared/displayCode.ts` (the sketch); the native pixel comparison is in `tests/display.test.ts` (needs `arduino-cli lib install "Adafruit GFX Library"` and a C++ compiler; `BP_DISPLAY_COMPILE=1` also compiles for four boards).

## Honesty rules

- Only measurements from this session are labelled **Measured**.
- Datasheet or library facts are **From documentation**, with the section named.
- Facts from your project memory are **From documentation** only with the file and lines the search returned.
- Anything else is a **Suggestion** that you confirm before later steps rely on it.

## Hosting the demo relay (maintainers)

See [`site/functions/README.md`](../site/functions/README.md).
