# Plan: make the assistant reliable on electrical and embedded facts

## Problem
Claude is strong at code and structure but can be wrong on hardware facts it only remembers: pin functions, register values, I2C addresses, timing, library settings. In the pilot batch, several facts were written from memory and had to be flagged "needs review". CLAUDE.md rule 4 (honest AI) says every claim must show its source. This plan makes that checkable instead of hoped for.

## Principle
Do not trust memory for facts. Ground them in a datasheet excerpt, a library entry or a measurement. Prove generated code by building it. Measure the assistant with evals.

## Phase 1: Verification tools (small, needs your machine)
- Install arduino-cli with the cores listed in `scripts/build-agent.sh`, g++ or clang++, and the display libraries (Adafruit GFX, LovyanGFX, TFT_eSPI, LVGL 8.3, XPT2046_Touchscreen, Adafruit_FT6206, TAMC_GT911).
- Run the gated tests: `BP_DISPLAY_COMPILE=1 npx vitest run tests/display.test.ts` and the native pixel tests.
- Fix whatever fails. Expect a few findings in the LovyanGFX, TFT_eSPI and LVGL output.
- Done when: the gated compile and pixel tests run and pass in CI (add a nightly job next to `nightly-firmware.yml`).

## Phase 2: Datasheet grounding (medium)
- Add a `datasheets/` convention: a short excerpt file per chip or module (`datasheets/ft6236.md`) with section names, register tables and the source URL or document id. Only text we have read in the real document.
- Index them with the existing memory code (`shared/memory.ts`, `app/main/memory/aiTools.ts`) so `search_memory` returns a cited excerpt, and the answer cites kind `memory` with file and section.
- Prompt rule in `app/main/ai/prompt.ts` (per-question block, not the frozen `SYSTEM_PROMPT`): a register, pin or timing value with no excerpt is labelled "from general knowledge, unverified".
- Start with the chips from the pilot: ESP32-WROOM-32 and ESP32-S3-WROOM-1 modules, FT6236, GT911, XPT2046, ST7796S, ILI9488.
- Needs from you: the datasheet PDFs.
- Done when: every register or address in the new touch parts and bare-module boards has an excerpt, and a test fails if a part's `sources[]` section has no excerpt.

## Phase 3: Measure the assistant (medium)
- Add scenarios to `tests/live/builder.live.ts`, run with `npm run eval:ai` (needs an API key): strapping pin at reset, ADC2 with Wi-Fi, 5 V sensor on a 3.3 V board, missing I2C pull-up, SPI pins swapped, a custom board with TFT and touch, a locked chip, an unsupported request that must be refused honestly.
- Grade on facts: the answer states no value without a source, and corrects a wrong user belief.
- Record results in `docs/ai-evals/` as the earlier rounds do, so changes show up as better or worse.
- Done when: a baseline report exists and each prompt or grounding change is compared against it.

## Phase 4: Skills and prompt rules (small, no hardware needed)
- Claude Code skills in `.claude/skills/` for working on this repo: `embedded-fact-check` (cite a datasheet section or mark unverified, never invent a register), `esp32-pin-safety` (flash pins, input-only, strapping, ADC2), `bus-debug` (I2C and SPI order of checks, swap test), `generated-code-review` (what to compile and what to assert).
- For the in-app assistant: the same rules as short blocks in `prompt.ts`, keeping the `tests/assistant-actions.test.ts` size limit for the free-demo request.
- Done when: the skills exist, and Phase 3 shows no regression and fewer unsourced claims.

## Phase 5: Wire verification into the product (larger)
- When the assistant writes code, run the existing code checker and, where arduino-cli is installed, a compile step, and show the result with the answer.
- Add a "Review needed" label in the UI for parts and boards whose `.sources.md` still carries the banner.

## Order and cost
| Phase | Effort | Needs from you |
|---|---|---|
| 4 Skills and rules | small | nothing |
| 1 Verification tools | small | install tools |
| 2 Datasheet grounding | medium | datasheet PDFs |
| 3 Evals | medium | API key |
| 5 Product wiring | larger | after 1 to 3 |

Start with 4 (no dependencies), then 1 and 2 in parallel, then 3 to measure.

## Risks
- Excerpts must be copied from the real document. A wrong excerpt is worse than none.
- Datasheet text is copyrighted: keep excerpts short, with section names and a link, and check what may be committed.
- Live evals cost money and vary between runs: keep a fixed scenario set and compare several runs.
