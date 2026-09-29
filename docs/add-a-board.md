# Add your board in 30 minutes

A board in BoardPilot is **one JSON file** in [`boards/`](../boards/) plus a **sources file** next to it. The 3D model, the 2D pinout, the wiring rules, the simulator bench, the new-project pin picker and the website pinout page are all generated from it. If your board uses a chip family BoardPilot already knows (ESP32, ESP32-S3, ESP32-C3, RP2040, RP2350, AVR, STM32, nRF52, i.MX RT), no code is needed.

Not a coder? [Request the board](https://github.com/mojeee/boardpilot/issues/new?template=new-board.yml) with a link to its pinout and mechanical drawing.

## 1. Start from the closest board (2 minutes)

Copy the board that is most like yours, for example `boards/rpi-pico.json` for another RP2040 board, and rename it to your board id (lower case, dashes): `boards/my-board.json`, `boards/my-board.sources.md`.

## 2. Board facts (5 minutes)

| Field | What to put | Where to find it |
|---|---|---|
| `id`, `name`, `vendor`, `summary` | Short, plain names. `summary` is one sentence for the board picker. | Product page |
| `family`, `module`, `chip`, `cpu`, `logicVolt` | Chip family, the module or MCU, one line of core, clock and memory, 3.3 or 5 | Datasheet |
| `pcbMm` | Length (along the header rows), width and thickness in mm | Mechanical drawing |
| `holesMm` (optional) | Mounting holes `[x, y, diameter]` in mm from the top-left corner | Mechanical drawing |
| `headerStyle` | `male-down` (pins under the board), `female-up` (Arduino sockets), `male-up` or `pad` | Photo |
| `pcbColor` (optional) | Hex color if the PCB is not blue | Photo |

## 3. Pins (15 minutes)

One entry per header pin, in any order (this is the Raspberry Pi Pico's GP4):

```json
{ "id": "GP4", "gpio": 4, "posMm": [14.07, 19.39], "label": "GP4", "kind": "gpio",
  "functions": ["GPIO", "I2C_SDA_default", "UART1_TX", "SPI0_MISO", "I2C0_SDA", "PWM2_A"],
  "flags": [], "maxVolt": 3.3 }
```

- `posMm` is the pin centre in mm from the PCB top-left corner, with the USB end on the left. Take it from the vendor's mechanical file (KiCad, Eagle, DXF or the drawing in the datasheet), never from a photo.
- `kind` is `gpio`, `power`, `ground` or `enable`. Power pins say what they `supplies` (volts, 0 for inputs such as VIN).
- `flags` carry the facts the wiring rules use: `input_only`, `flash`, `strapping`, `strapping_critical`, `adc`, `adc1`, `adc2`, `five_volt_tolerant`, `usb`, `swd`, `onboard_led`, `no_internal_pull`, `reserved`… (the full list is at the top of [`scripts/check-boards.mjs`](../scripts/check-boards.mjs)).
- `notes` is one plain sentence a beginner can act on ("Strapping pin: keep it LOW at reset or the board may not boot.").
- STM32 pins also carry `af`: the alternate function number of each timer, I2C, SPI and UART function, from the datasheet's "Alternate function mapping" table (`"af": {"I2C1_SDA": 4, "TIM4_CH4": 2}`). The STM32 HAL starter never guesses them.

Then `rules` (default I2C and SPI pins, safe pins in order of preference, ADC pins), `toolchain` (flasher, arduino-cli FQBN and core, image format) and `usb` (vendor and product ids, from the core's `boards.txt`).

The vendor SDK starter projects in New project need one more `toolchain` field per family: `picoBoard` (Pico SDK `PICO_BOARD`) on RP2040/RP2350, `idfTarget` (`idf.py set-target`) on ESP32 boards, and `stm32Hal` on STM32 boards (CMSIS device, PLL and bus prescalers, flash wait states, the UART that `printf` uses). `check-boards` checks that the `stm32Hal` clock tree gives the board's `clocks`.

`components` are optional boxes for the 3D view (chip, USB connector, buttons, LEDs): `rect` is `[x, y, w, h]` in layout pixels (`layoutPxPerMm` pixels per mm).

## 4. Sources (5 minutes)

Every fact needs a source. In `boards/my-board.sources.md`, list for each group of facts the document and section it comes from, and mark anything you estimated as **estimated**. BoardPilot shows these sources to users, so it never presents a guess as a fact.

## 5. Check it (3 minutes)

```bash
node scripts/check-boards.mjs boards/my-board.json   # structure, positions, flags, holes
npm test                                             # wiring rules, silkscreen, camera framing, site
npm run dev                                          # pick your board in the board picker
npm run build:site                                   # preview site/boards/my-board/
```

In the app, **Board → Find my board** should pick it from its USB ids, and the 2D pinout should match the drawing. Then open a pull request. Thank you!

## Diagnostic agent (optional)

To let the diagnostic agent run on the board, generate its board header with `node scripts/gen-agent-board.mjs my-board` and build it with `npm run build:agent` (needs arduino-cli and the board's core). The app works without it; the board simply has no live pin view until the agent is built.
