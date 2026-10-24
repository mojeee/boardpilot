# AI evaluations

Live tests of the assistant against the real model, run with `npm run eval:ai` (see
[docs/ai.md](../ai.md#testing-it-against-the-real-model)). They cost money and need a key, so they
are not part of `npm test`; the logic they exercise also has fast unit tests with a scripted model
(`tests/projectBuilder.test.ts`).

## Project builder ("Describe your project")

23 requests on 12 boards: weather station, plant watering, distance alarm, a night lamp in
Italian, motion alarm, thermostat, CO2 monitor, buttons and LEDs, servo with a knob, GPS logger,
RFID lock (a 3.3 V reader on a 5 V Uno), sound-reactive LEDs, adding a display to an existing
project, two sensors with the same I2C address, a vague request, a part the library does not have,
a battery logger, a stepper, an LCD counter and a board switch; since round 4 also changing settings, two app actions in one sentence, and code for a project already drawn. A small model plays the user, in
character; the real `Assistant` runs with the app's tools, prompt and checks.

Every conversation is graded by code with the app's own rules: a proposal was made and applied, no
wiring errors, nothing unwired, the parts cover the request, the board is right, no part that is
poor on 3.3 V logic, no "measured" claim without a measurement, Italian answers to Italian
requests, at most 5 assistant turns. For the part the library lacks, the first answer must say so
and propose nothing. For app requests, the right actions with the right arguments, in order. Since
round 4 a judge model (Claude Opus 5.5) also reads each conversation as a senior hardware engineer
and fails it for advice that could damage the board, a part or a person.

## Results

Four rounds on 2026-10-24. After each round the failures were read, the cause fixed in the app
(not in the test), and the next round run on the changed app.

| Round | Claude Sonnet 5 | Claude Sonnet 5.5 | What the round found and what changed after it |
| --- | --- | --- | --- |
| 1 | 19/20, $2.22 ([report](builder-claude-sonnet-5-round1.md)) | not run | A BME280 current read as 3.6 mA instead of 3.6 µA (currents now carry units); `propose_project` filled with a literal `""` for the board in most chats (now nullable); an IRF520 MOSFET picked for 3.3 V boards (pin notes in search results, a sourced gotcha); two questions in one turn; library ids as highlights; the one failure was the test's own grading. |
| 2 | 19/20, $2.44 ([report](builder-claude-sonnet-5-round2.md)) | 17/20, $1.72 (report not kept) | Failed tool calls dropped to one in 20 chats. Sonnet 5.5 kept calling tools after showing a question and twice ran out of rounds: the next request now forbids tools, and the last round always answers. Part-to-part links (a pump on a MOSFET, a level shifter) added. |
| 3 | 19/20, $2.48 ([report](builder-claude-sonnet-5-round3.md)) | 19/20, $1.69 ([report](builder-claude-sonnet-5-5-round3.md)) | The RFID lock on a 5 V Uno failed on both: links were added after the safe-pin rules, so the 3.3 V RC522 was also wired straight to the Uno, and a level shifter's HV supply counted as "a signal on a power pin". Both fixed (regression test). |
| 4 | **23/23**, $1.98 ([report](builder-claude-sonnet-5.md)) | **23/23**, $1.66 (report replaced by round 5) | Three new scenarios for doing things in the app (settings, two actions in a row, code for a drawing) and a safety judge (Claude Opus 5.5) reading every conversation. Its notes led to flyback diodes and divider resistors on the shopping list from the parts' own library notes. |

| 5 | not run (no longer the default) | **26/26**, $1.92 ([report](builder-claude-sonnet-5-5.md)) | Display Studio added three scenarios (test patterns on an ST7789, an OLED dashboard with a blinking warning, a new project with a round gauge display), each also checked by building the AI's design with the real Adafruit GFX library and comparing every pixel with the app's preview. The first try showed the model faking a gauge needle with 20 elements under conditions like `temp >= 10.5 && temp < 11.5`, which the app could not read: conditions now support `&&` and `||`, unreadable ones are errors the model must fix, and a gauge element exists. |

Costs are the assistant's tokens only (the simulated user and the judge are extra, about $0.03
per conversation for the judge). Prompt caching keeps most input tokens cached.

Full conversations, final wiring and remaining warnings are in each report.
