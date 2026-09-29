# BoardPilot: project context for Claude

Read this file fully before any work. It describes what we are building, the rules that never change, and the technical decisions already made. If a request conflicts with this file, point it out before coding.

## What we are building

A desktop app for macOS and Windows that guides people with any level of knowledge through embedded software work on a real board. The user picks a task, a step-by-step wizard asks only for what the app cannot detect itself, the work runs, and everything that happens is shown live: in a log and on a 3D model of the board, where every pin, wire and bus transaction is visible.

**Boards:** started with the ESP32 DevKit 30-pin; since 0.5 the app supports 13 boards across ESP32, RP2040/RP2350, AVR, STM32, nRF52 and Teensy. Nothing may be hard-coded to one board: boards are data files in `/boards` (pin rules, flags, default buses, toolchain, USB ids, sources), validated by `scripts/check-boards.mjs`. Chip tools per family live in `app/main/hardware/tools/`.

Phase 1 tasks (the home screen options):
1. Connect and identify a board
2. New project
3. Flash firmware
4. Debug a problem
5. Monitor (live values, serial, memory)
6. Test hardware (pins, buses, decoded signals)
7. Report

Target UI: the screenshots in `/design` (Home, Debug wizard, 3D workspace, Test hardware, Monitor). Match their layout, colors and tone.

## Product rules (never break these)

1. **Look before asking.** Every step first tries to detect things automatically. The user is asked only for what could not be detected.
2. **No dead ends.** Every step has three layers: an automatic attempt, AI help that explains what went wrong in plain words, and a manual fallback (pick from a list, type a model, upload a datasheet, take a photo).
3. **Read-only by default.** Anything that writes to the board (flashing, including our diagnostic agent, or driving an output pin) needs an explicit confirmation in the UI. Before the first write, back up the board's current flash so it can be restored with one click.
4. **Honest AI.** The assistant only states measurements it actually got from a tool call. Every claim shows its source (a measurement from this session, a datasheet section, a library entry). Anything inferred or guessed is labelled as a suggestion and must be confirmed by the user before later steps rely on it.
5. **Everything visible.** Pins in use, wires, parts and bus activity appear on the 3D board. Every log line and every AI message that refers to a pin, wire or part can be clicked to focus the camera on it.
6. **Simulator mode.** The whole app must run without hardware, using a simulated board that implements the same interface as the real one. This is how we develop the UI and how we demo.
7. **Plain language.** UI text is written for a beginner: short sentences, no unexplained jargon, errors say what happened and what to do next.

## Stack

- **Desktop shell:** Electron. Build tooling: Vite (electron-vite or equivalent). Language: TypeScript, strict mode.
- **UI:** React. State: Zustand. Styling: plain CSS with CSS variables from the design tokens below. No component library.
- **3D:** three.js through `@react-three/fiber` and `@react-three/drei`.
- **Charts:** a lightweight canvas-based library (uPlot) or custom canvas; must handle 20+ updates per second smoothly.
- **Serial:** `serialport` npm package, used only in the Electron main process.
- **Chip tools:** `esptool` (Python, installed with pip) spawned as a child process for chip identification, flash backup, restore and flashing.
- **Firmware builds:** `arduino-cli` with the `esp32:esp32` core, used to build the diagnostic agent. Ship prebuilt agent binaries in `/resources/agent` so end users never need arduino-cli.
- **AI:** the user picks the provider in AI settings: Anthropic Claude (`@anthropic-ai/sdk`, default `claude-sonnet-5`, fast `claude-haiku-4-5-20251001`), OpenAI GPT or Google Gemini (both via `fetch`, no SDK; defaults in `shared/ai.ts`). Called only from the main process through `app/main/ai/providers/`. Keys are entered in the app and stored encrypted with Electron `safeStorage`; `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` in `.env.local` are fallbacks.
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, typed API exposed through the preload script. The renderer never sees an API key, never touches the filesystem or serial ports directly.
- **Languages:** English and Italian. Every user-facing string goes through `t()` from `shared/i18n` with an Italian entry in `shared/i18n/it/*.ts` (enforced by `tests/i18n.test.ts`).
- **Parts:** every `parts/*.json` is a built-in part (loaded with `import.meta.glob`); user parts live in the app data folder. Website: `scripts/build-site.mjs` generates `site/`.
- **Tests:** Vitest for logic (wiring rules, flow engine, protocol parsing). Playwright for Electron smoke tests later.

## Folder structure

```
/app
  /main
    /hardware     port discovery, esptool wrapper, agent protocol client, real driver
    /sim          simulated driver + scenario files
    /ai           Claude client, prompt builders, tool definitions
    /session      session log, backups, reports
    ipc.ts        typed IPC handlers
  /preload        contextBridge API (typed)
  /renderer
    /screens      Home, Wizard, Workspace, TestHardware, Monitor, Report
    /three        Board3D, Pins, Wires, Parts, CameraRig, PinoutView2D
    /wizard       flow engine UI
    /components   shared UI (buttons, chips, log list, assistant panel)
    /state        zustand stores
    /styles       tokens.css
/shared           types shared by main and renderer
/boards           board definitions (JSON)
/parts            part definitions (JSON)
/flows            wizard flow definitions
/templates        template projects (JSON, see docs/templates.md)
/firmware/agent   diagnostic agent source (Arduino for ESP32)
/resources/agent  prebuilt agent binaries
/design           target UI screenshots
```

## Core interfaces

### HardwareDriver (real and simulated both implement it)

```ts
interface HardwareDriver {
  listPorts(): Promise<PortInfo[]>;
  identify(port: string): Promise<ChipInfo>;             // via esptool
  backupFlash(port: string): Promise<BackupInfo>;        // full flash to app data folder
  restoreFlash(port: string, backupId: string): Promise<void>;
  flash(port: string, image: FirmwareImage): Promise<void>; // caller must pass a confirmation token
  openAgent(port: string): Promise<AgentClient>;
  openSerial(port: string, baud: number): Promise<SerialStream>; // user's own firmware output
}
```

Every call has a timeout and returns errors as `{ code, humanMessage, hint }`, never raw exceptions to the UI.

### Board definition (`/boards/esp32-devkitc-30.json`)

```json
{
  "id": "esp32-devkitc-30",
  "name": "ESP32 DevKit (30 pins)",
  "module": "ESP32-WROOM-32",
  "pcbMm": { "length": 51.5, "width": 28.5, "thickness": 1.6 },
  "pins": [
    { "id": "D21", "gpio": 21, "row": "front", "index": 4, "label": "D21",
      "functions": ["GPIO", "I2C_SDA_default"], "flags": [], "maxVolt": 3.3 },
    { "id": "D34", "gpio": 34, "row": "back", "index": 3, "label": "D34",
      "functions": ["ADC1_CH6"], "flags": ["input_only"], "maxVolt": 3.3 }
  ],
  "components": [
    { "type": "module", "label": "ESP32-WROOM-32", "rect": [192, 36, 164, 92] },
    { "type": "usb", "rect": [-8, 70, 26, 30] },
    { "type": "button", "label": "EN", "rect": [18, 30, 16, 16] },
    { "type": "button", "label": "BOOT", "rect": [18, 124, 16, 16] }
  ]
}
```

Fill in all 30 pins from the Espressif datasheet. Pin facts that the rules rely on:
- Flash pins GPIO 6 to 11: never use (connected to the internal flash).
- Input-only GPIO 34 to 39: no output, no internal pull-ups.
- Strapping pins GPIO 0, 2, 5, 12, 15: their level at reset changes boot behaviour. GPIO 12 HIGH at reset selects the wrong flash voltage and the board may not boot.
- ADC2 pins do not work while Wi-Fi is on; prefer ADC1 (GPIO 32 to 39).

**The 3D board is generated from this file** (PCB box, module, USB connector, buttons, header strips, one mesh per pin), so every pin is a real clickable object with its data attached. Realistic GLB models can replace the body later, but pins stay generated.

### Part definition (`/parts/bme280-gy.json`)

```json
{
  "id": "bme280-gy",
  "name": "GY-BME280 breakout",
  "measures": ["temperature", "humidity", "pressure"],
  "pins": [
    { "name": "VIN", "role": "power" }, { "name": "GND", "role": "ground" },
    { "name": "SCL", "role": "i2c_scl" }, { "name": "SDA", "role": "i2c_sda" }
  ],
  "bus": "i2c",
  "addresses": ["0x76", "0x77"],
  "idCheck": { "register": "0xD0", "expect": "0x60",
    "otherValues": { "0x58": "This is a BMP280: no humidity sensor. Common mix-up with cheap boards." } },
  "voltage": "3.3",
  "sources": [{ "title": "Bosch BME280 datasheet", "section": "5.4.1 Register 0xD0 id" }]
}
```

Phase 1 parts library: BME280/BMP280 breakout, SSD1306 OLED (I2C), LED with resistor, push button, potentiometer, MPU6050, DHT22.

### Project scene

```json
{
  "board": "esp32-devkitc-30",
  "parts": [{ "id": "bme1", "partId": "bme280-gy", "position": [-120, 0, 80] }],
  "wires": [{ "from": { "part": "board", "pin": "D21" }, "to": { "part": "bme1", "pin": "SDA" }, "color": "#3FB6E8" }]
}
```

A wiring rule checker runs on every scene change: voltage mismatch, output on input-only pins, use of flash pins, strapping pins, SDA/SCL swapped against the part definition, shared pin conflicts, missing ground. Each finding becomes a warning on the pin or wire in 3D and in the log.

## Diagnostic agent

A small firmware we flash (after backup and confirmation) during Debug and Test hardware. It lets the app see live pin states and run bus tests. Source in `/firmware/agent`.

Protocol: serial at 115200 baud (configurable), newline-delimited JSON, every request has an `id` echoed in the reply.

```
{"id":1,"cmd":"hello"}                                   -> {"id":1,"ok":true,"agent":"bp-agent","ver":"0.1","chip":"ESP32-D0WD-V3","heapFree":201344}
{"id":2,"cmd":"pins"}                                    -> {"id":2,"ok":true,"pins":{"21":{"mode":"in","level":1},...}}
{"id":3,"cmd":"pullup_check","pins":[21,22]}             -> {"id":3,"ok":true,"external":{"21":true,"22":true}}
{"id":4,"cmd":"i2c_scan","sda":21,"scl":22,"hz":100000}  -> {"id":4,"ok":true,"found":["0x76"],"trace":[...]}
{"id":5,"cmd":"i2c_read","sda":21,"scl":22,"addr":"0x76","reg":"0xD0","len":1} -> {"id":5,"ok":true,"data":["0x60"],"trace":[...]}
{"id":6,"cmd":"adc","pin":34}                            -> {"id":6,"ok":true,"mv":1840,"raw":2283}
{"id":7,"cmd":"pwm","pin":25,"duty":62,"hz":5000}        -> {"id":7,"ok":true}
{"id":8,"cmd":"gpio_write","pin":25,"level":1}           -> {"id":8,"ok":true}
{"id":9,"cmd":"stream","pins":[21,22,25,34],"hz":20}     -> repeated {"stream":true,"t":12345,"pins":{...}}
```

Rules inside the agent: refuse flash pins 6 to 11, refuse outputs on 34 to 39, report strapping pin levels at boot. `trace` lists each I2C transaction step (start, address byte, ack or nack, data bytes, stop) so the UI can draw the decoded bus view.

Measurement honesty: ESP32 can only measure voltage on ADC pins. On other pins report digital level only. Detect external pull-ups by disabling internal pull-ups and pull-downs and reading the level (HIGH with nothing driving it means an external pull-up). Never show a voltage the hardware did not measure.

Swap test (key debugging trick): because ESP32 I2C pins can be remapped in software, scan once with SDA/SCL as wired and once exchanged. If a device answers only when exchanged, the wires are crossed.

## Wizard engine

A flow is an ordered list of steps. Step types:
- `auto`: runs checks through the driver, writes log entries.
- `question`: options as big buttons, plus "describe it in your words" for the AI to map to an option.
- `input`: photo, model name, file upload, pick from library.
- `confirm`: required before any write to the board.
- `action`: asks the user to do something physical and, whenever possible, verifies it with live data before continuing.
- `result`: probable cause, evidence, sources, next steps, "create report".

Each step defines `run(ctx)`, `aiHelp(ctx)` and `fallbacks`. The engine records every event in the session log with a type (`info`, `check`, `warning`, `failed`, `found`, `action`) and an optional `target` (pin, wire or part id) for 3D focus.

Phase 1 flows: `connect-identify`, `debug-sensor-not-responding`, `debug-board-not-detected`, `debug-keeps-resetting`, `debug-garbage-on-serial`, `test-hardware-i2c`, `test-hardware-pins`, `monitor`, `flash-firmware`, `new-project`.

## AI assistant

- Context sent with each call: board definition, project scene, the user's answers so far, the last 50 log entries, latest live readings, and relevant datasheet excerpts from the parts library.
- Tools the model may call: `read_pins`, `pullup_check`, `i2c_scan`, `i2c_read`, `adc_read`, `get_log`, `highlight(target)`, `ask_user(question, options)`. Write actions exist only as `request_flash` and `request_gpio_write`, which open a confirmation dialog; the model never writes directly.
- Structured reply: `{ message, confidence: "measured" | "documented" | "suggestion", sources: [...], highlight: [...], nextOptions: [...] }`.
- Photos (part recognition) go through the model's image input; the result is always shown for user confirmation.

## Design tokens

Fonts: IBM Plex Sans for UI text, IBM Plex Mono for logs, pin names and numbers.

```css
--bg: #161B21;         --chrome: #12171C;     --panel: #1C232B;
--raised: #2C3541;     --line: #2C3540;       --viewport: #12171D;
--text: #E9EDF1;       --muted: #A7B3BF;      --dim: #7D8997;
--ai: #C9BEFF;         --ai-bg: #231F38;      --ai-line: #3B3463;
--ok: #5CCB8F;         --warn: #F2A93B;       --err: #FF5D52;
--pcb: #1F3A5F;        --shield: #C9CED4;     --gold: #D9B45A;

/* pin role colors, used on pins, wires, chips, plots */
--pin-power: #FF6B5E;  --pin-ground: #8A96A3;
--pin-sda: #3FB6E8;    --pin-scl: #9ADCF7;
--pin-spi: #E07BD4;    --pin-uart: #F2A93B;
--pin-gpio: #5CCB8F;   --pin-adc: #E8D24A;
```

Layout: top bar 56px, left task rail 208px, right wizard and assistant panel 400px, bottom log panel about 250px, 3D viewport in the center. Plot colors match the pin the data comes from.

## Conventions

- TypeScript strict; no `any` in `/main/hardware`, `/main/ai` or `/shared`.
- Secrets never in the renderer, never in git.
- Every milestone ends with: app runs with `npm run dev`, tests pass with `npm test`, simulator mode works, short entry in `CHANGELOG.md`, one git commit.
- When a hardware fact matters (pin capabilities, register values), put the datasheet source in a code comment.
- Ask before adding a new dependency that is not listed in this file.
