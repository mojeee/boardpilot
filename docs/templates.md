# Template projects

A template is a ready-made project that builds itself on **any board**: the parts, the wires (from the board's own pin rules), the Arduino code for that board, and a simulated run that shows what the program does, step by step. Templates live in [`templates/`](../templates/), one JSON file each. In the app: **New project → Start from a template**.

## What a template file holds

| Field | What it is |
|---|---|
| `id`, `name`, `summary` | Short, plain names. `summary` is one sentence. |
| `difficulty`, `minutes` | `first steps`, `easy` or `medium`; rough time to build it. |
| `learn` | What the user learns, one line each. |
| `needs` (optional) | `wifi` (ESP32 family and Pico W only) or `adc`. |
| `parts` | `{ id, partId, label }`: parts from the library. The app places them in front of the board. |
| `pins` | Symbolic names used by the code and the simulator, each pointing to a part pin: `"PUMP": { "part": "relay1", "pin": "IN" }`. The board pin is chosen by the pin assigner, so the same template works on an ESP32, a Pico or an Uno. |
| `libraries`, `notes` | Arduino libraries to install; plain notes shown to the user and printed in the code. |
| `code` | `includes`, `globals`, `setup`, `loop` as lines of Arduino code with placeholders (below). |
| `sim` | The behaviour model for the simulator (below). |
| `sources` | Datasheet or reference for every fact the template relies on. |

## Code placeholders

- `{NAME}`: the pin wired to template pin `NAME`, written the way the board's core wants it (a GPIO number, or `PA5` on STM32).
- `{READ_MV:NAME}`: an expression that reads millivolts on that pin (`analogReadMilliVolts` on ESP32, scaled `analogRead` elsewhere).
- `{I2C_BEGIN}`: the I2C start lines for the board, alone on its line (`Wire.begin(21, 22)`, `Wire.setSDA/setSCL` or fixed pins).
- `{BOARD}`: the board name.

The code tells its story with the BoardPilotProbe library: `probe.step("Read the soil sensor")` when a step starts, `probe.state("WATERING")` for the mode, `probe.event("Pump on for 3 s")` when something happens. `step` and `state` only send when they change, so they can sit in a fast `loop()`. Use `millis()` instead of `delay()` so the program keeps answering: templates teach good habits.

## The behaviour model (`sim`)

`loopMs` is how long one pass of `loop()` takes in simulated time. `inputs` are simulated sensors:

- `{ "wave": { "min", "max", "periodS" } }`: a smooth up-and-down value (temperature, distance)
- `{ "pulses": { "everyS", "highS", "offsetS" } }`: a digital input that is HIGH for a while every so often (button, PIR)
- `{ "level": { "start", "perSecond", "min", "max" } }`: a value that drifts (soil drying out); `bump` moves it

`loop` is a list of actions: `step`, `state`, `event` (texts with `{variable}` and `{PIN}` placeholders), `read` (an input into a variable), `write` / `toggle` (an output pin), `show` (text on a display part), `set`, `timer` (then the condition `<name>_done`), `bump`, `wait`, and `if` / `then` / `else` with conditions like `moisture < 40`, `pressed` or `alarm == 1`.

Every `step` and `event` in the model must also appear in the code as `probe.step("…")` / `probe.event("…")`: the tests check it, so the simulated story and the real board tell the same story. Everything the simulator shows is labelled **simulated**.

## Checks

`npm test` builds every template on every board it fits and requires that the wiring checker and the code vs wiring checker find no errors, that every template pin gets wired, and that every text has an Italian entry in `shared/i18n/it/templates.ts`.
