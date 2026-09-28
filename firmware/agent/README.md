# bp-agent: BoardPilot diagnostic agent (ESP32)

A small firmware that BoardPilot flashes onto the board during **Debug** and
**Test hardware**, but only after it has made a backup of the flash and the user
has confirmed. It lets the app read live pin states, check pull-ups, scan and
read I2C devices, and read ADC voltages. It can also drive outputs and PWM when
the user asks for that in the app.

- Target: ESP32 (ESP32-WROOM-32, 30-pin DevKit), Arduino core `esp32:esp32` 3.x
- No third-party libraries. It includes its own small JSON parser.
- Version: `0.1`

## Build

End users never build this. The app ships prebuilt binaries in
`resources/agent/`. To rebuild them:

```sh
brew install arduino-cli
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
npm run build:agent          # runs scripts/build-agent.sh
```

Or compile it by hand:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir firmware/agent/build firmware/agent
```

## Files

| File | What it does |
| --- | --- |
| `agent.ino` | Calls `agentSetup()` and `agentLoop()`. |
| `bp_agent.cpp` | Boot, strapping pin capture, line reader, command dispatch. |
| `bp_commands.cpp` | One function per command, I2C trace, stream. |
| `bp_pins.cpp` | Pin facts (with datasheet sources), safety checks, mode table. |
| `bp_json.cpp` | Minimal JSON parser for request lines. |
| `bp_out.cpp` | Writes JSON reply lines to Serial. |
| `bp_config.h` | Baud rate (`AGENT_BAUD`), limits. |

## Protocol

Serial at 115200 baud, 8N1. One JSON object per line, in both directions.
Every request may carry an integer `id`. The reply echoes it (`"id":null` when
the request had none). Request lines longer than 511 characters are rejected.

The ROM bootloader prints plain text when the board resets. The app must ignore
any line that is not a JSON object.

At boot, the agent prints:

```json
{"event":"boot","agent":"bp-agent","ver":"0.1","strapping":{"0":1,"2":0,"5":1,"12":0,"15":1},"strapReg":"0x13"}
```

`strapping` holds the levels of GPIO 0, 2, 5, 12 and 15 read right after boot,
before any pin is configured. `strapReg` is the raw `GPIO_STRAP_REG` value: the
levels the chip latched at reset (the same number the ROM prints as `boot:0x..`).

### Commands

| Request | Reply |
| --- | --- |
| `{"id":1,"cmd":"hello"}` | `{"id":1,"ok":true,"agent":"bp-agent","ver":"0.1","chip":"ESP32-D0WD-V3","heapFree":201344}` |
| `{"id":2,"cmd":"pins"}` | `{"id":2,"ok":true,"pins":{"21":{"mode":"in","level":1},...}}` |
| `{"id":3,"cmd":"pullup_check","pins":[21,22]}` | `{"id":3,"ok":true,"external":{"21":true,"22":true},"levels":{"21":1,"22":1}}` |
| `{"id":4,"cmd":"i2c_scan","sda":21,"scl":22,"hz":100000}` | `{"id":4,"ok":true,"found":["0x76"],"trace":[...]}` |
| `{"id":5,"cmd":"i2c_read","sda":21,"scl":22,"addr":"0x76","reg":"0xD0","len":1}` | `{"id":5,"ok":true,"data":["0x60"],"trace":[...]}` |
| `{"id":6,"cmd":"adc","pin":34}` | `{"id":6,"ok":true,"mv":1840,"raw":2283}` |
| `{"id":7,"cmd":"pwm","pin":25,"duty":62,"hz":5000}` | `{"id":7,"ok":true}` (`"stop":true` detaches) |
| `{"id":8,"cmd":"gpio_write","pin":25,"level":1}` | `{"id":8,"ok":true}` |
| `{"id":9,"cmd":"gpio_read","pin":21}` | `{"id":9,"ok":true,"pin":21,"level":1}` |
| `{"id":10,"cmd":"stream","pins":[21,22,25,34],"hz":20}` | `{"id":10,"ok":true}`, then frames (below) |
| `{"id":11,"cmd":"stream_stop"}` | `{"id":11,"ok":true}` (so does `stream` with `"pins":[]` or `"hz":0`) |
| `{"id":12,"cmd":"strapping"}` | `{"id":12,"ok":true,"strapping":{...},"strapReg":"0x13"}` |
| `{"id":13,"cmd":"reset_pins"}` | `{"id":13,"ok":true,"released":[25,26]}` (also stops the stream) |

Stream frames, sent at `hz` (1 to 50, default 20):

```json
{"stream":true,"t":12345,"pins":{"21":{"mode":"in","level":1},"25":{"mode":"pwm","duty":62,"hz":5000},"34":{"mode":"adc","mv":1840}}}
```

Pin state objects in `pins` and stream frames:

| mode | fields |
| --- | --- |
| `in` | `level` (digital read) |
| `out` | `level` (what the pad reads back), `set` (what the agent drives) |
| `pwm` | `duty` (percent), `hz` |
| `adc` | `mv` (measured by the ADC) |
| `uart` | none (GPIO 1 and 3 carry this serial link, reading them would break it) |
| `i2c` | none (only while a bus command runs) |

A pin goes into `adc` mode after an `adc` command, and back to `in` after
`gpio_read`, `pullup_check` or `reset_pins`.

### I2C trace

Each step is one of `{"t":"start"}`, `{"t":"restart"}`, `{"t":"stop"}`,
`{"t":"addr","v":"0x76","rw":"w","ack":true}`, `{"t":"data","v":"0xD0","dir":"w","ack":true}`.
The last byte of a read has `"ack":false`, because the master ends a read with a NACK
(I2C specification, NXP UM10204).

- `i2c_scan` traces only the addresses that answered. If none answered, it traces
  the first probe (0x08) so the UI can draw something.
- `i2c_read` on success traces the full write-register, repeated-start, read
  transaction. If it fails, the agent re-checks the address with one
  address-only transaction, and the trace shows that check. Error `nack`
  (with `"nackAt":"addr"`) means no device answered the address;
  `read_failed` means the device answered but the read did not complete.

### Errors

Every error reply looks like `{"id":N,"ok":false,"error":"<code>","msg":"<plain text>"}`,
plus `"pin":N` when a pin caused it.

| code | meaning |
| --- | --- |
| `bad_json` | The line is not valid JSON (`id` is null). |
| `too_long` | The line is longer than 511 characters (`id` is null). |
| `bad_args` | A field is missing or out of range. |
| `unknown_cmd` | The command name is not known. |
| `bad_pin` | That GPIO does not exist on the ESP32. |
| `flash_pin` | GPIO 6 to 11 are wired to the internal flash. |
| `uart_pin` | GPIO 1 and 3 carry the serial link. |
| `input_only` | GPIO 34 to 39 cannot drive a signal or be I2C lines. |
| `not_adc` | That pin has no ADC. |
| `pin_busy` | `gpio_read` on a pin that is producing PWM. |
| `nack`, `read_failed`, `short_read`, `bus_error`, `i2c_init_failed` | I2C problems. |
| `pwm_failed` | The PWM driver refused the frequency. |

## Measurement honesty

- Voltages (`mv`) are only reported for ADC pins, and only from a real ADC reading.
  Other pins report a digital level.
- `pullup_check` turns off the internal pulls and reads the pin. HIGH means an
  external pull-up. On pins that have an internal pull-down (all but GPIO 34 to 39)
  the agent confirms with the internal pull-down on, so a floating pin that
  happens to read HIGH is not reported as pulled up.
