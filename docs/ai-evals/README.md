# AI evaluations

Live tests of the assistant against the real model, run with `npm run eval:ai` (see
[docs/ai.md](../ai.md#testing-it-against-the-real-model)). They cost money and need a key, so they
are not part of `npm test`; the logic they exercise also has fast unit tests with a scripted model
(`tests/projectBuilder.test.ts`).

## Project builder ("Describe your project")

20 beginner requests on 12 boards: weather station, plant watering, distance alarm, a night lamp in
Italian, motion alarm, thermostat, CO2 monitor, buttons and LEDs, servo with a knob, GPS logger,
RFID lock (a 3.3 V reader on a 5 V Uno), sound-reactive LEDs, adding a display to an existing
project, two sensors with the same I2C address, a vague request, a part the library does not have,
a battery logger, a stepper, an LCD counter and a board switch. A small model plays the user, in
character; the real `Assistant` runs with the app's tools, prompt and checks.

Every conversation is graded by code with the app's own rules: a proposal was made and applied, no
wiring errors, nothing unwired, the parts cover the request, the board is right, no part that is
poor on 3.3 V logic, no "measured" claim without a measurement, Italian answers to Italian
requests, at most 5 assistant turns. For the part the library lacks, the first answer must say so
and propose nothing.

ROUNDS_TABLE

Full conversations, final wiring and remaining warnings are in each report.
