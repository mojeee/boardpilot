# Changelog

## Unreleased

- Part "gotchas": 44 known traps for the 27 most used parts, each with its datasheet source (DHT22 needs 2 s between reads, HC-SR04 ECHO is 5 V on a 3.3 V board, SSD1306 at 0x3C or 0x3D and "0x78" printed on the board, WS2812 power and data level, DS18B20 pull-up and 750 ms conversion, servo supply, SD cards must be FAT32…). They appear in the log the moment the part is added and on the part's card. Board-specific ones show only where they apply (3.3 V boards, Uno/Nano/Mega). User parts keep them too (new optional `gotchas` field). The website shows them on part pages and on each wiring guide, in English and Italian.
- Flash pre-flight check: before anything is written, Flash firmware reads the file and checks that it is made for the board. Covered: the format the board takes; the ESP32 image header (chip, flash size, app size against the default partition, merged images); the UF2 family (RP2040 vs RP2350); Intel HEX checksums and size (with a warning near the AVR bootloader, and nRF52 UICR records left out); the STM32 vector table (stack in SRAM, start in flash). A problem stops the flow with the reason and "Choose another file"; warnings are shown before the confirmation. Every result is read from the file itself.
- Sharper pictures: screenshots are captured at 2x pixel density (README 2400 px, website 1800 and 900 px, matching the sizes the pages declare), and each board's social image now shows the bare board, large and crisp.
- Silkscreen: pin names that would print under a chip or button move to a free side of their pin when there is one.
- Roadmap: a last step for October, an interactive demo of the app on the website (the simulator running in the page, no install), as you asked.
- Code vs wiring checker (New project → "Check my code against the drawing"): open or paste an Arduino sketch and it is compared with the 3D drawing. It catches `Wire.begin(22, 21)` when the drawing has SDA on 21, `pinMode(34, OUTPUT)` on an input-only pin, pull-ups on pins that have none, `analogRead` on a pin with no ADC or on ADC2 while the sketch turns on Wi-Fi, the LED wired to one pin while the code drives another, `Serial.begin` at a different speed than the monitor, flash pins and pins that are not on the header. Findings show the code line, highlight the pin in 3D, go to the session log, and are labelled as checks of the drawing, not measurements. Pin numbers follow each core (GPIO numbers, STM32 names such as PA5, header numbers on STM32 and nRF52, `LED_BUILTIN`, `#define` and `const` pins).
- New wiring rule: two I2C parts on the same bus that answer at the same default address (two BME280s at 0x76, two BH1750s at 0x23). It is a warning when one part can move, and the hint names the address pin from the library ("Set BH1750 to address 0x5C with its ADDR pin"). It is an error when neither part can change its address.
- New "Embedded lessons" screen (Learn in the task rail, and a card on Home): 10 short visual lessons from zero to the road to senior (microcontrollers, C and bits, GPIO, timers and interrupts, UART/I2C/SPI, ADC, RTOS, PWM and state machines, the full picture, a senior roadmap). Interactive demos for registers, GPIO, timers, ADC and PWM; interview questions in every lesson; "Explain it more simply" and "Quiz me" ask the assistant. Progress is remembered; `#screen=learn&lesson=<id>` opens a lesson directly. Lessons are data in `shared/lessons.ts` (Italian in `shared/i18n/it/lessons.ts`, checked by `tests/lessons.test.ts`).
- 3D view, week 1 of the October plan: studio lighting built in code (works offline) with silver shields, pins and USB; a soft contact shadow under the board and parts, redrawn only when the scene changes; a darker floor that fades out with a quieter grid.
- New "Desk / Plain" switch in the 3D toolbar: a workbench with a wooden desk, an anti-static mat under the board and shelves of parts bins, drawers, reels, wire spools, spare boards and a soldering station, all built from simple shapes and generated textures. The choice is remembered; slow computers start with Plain.
- The camera frames the board and every part when a scene opens, when the board changes and on "Overview", tighter than before so the board no longer looks small.
- Pin names and the board name are printed on the PCB like real silkscreen. Floating tags now appear only for pins that are wired, hovered, selected, highlighted or have a warning; "Labels" still shows every tag.
- Wires look like jumper wires: thinner cables, black plug housings at both ends, parallel wires fan out, and the other wires fade while one is selected (the thin cable stays easy to click).
- Rounded PCB corners, and mounting holes with plated rings on the Arduino Uno and Mega and the three Raspberry Pi Pico boards (new optional `holesMm` and `cornerRadiusMm` in board files, checked by `scripts/check-boards.mjs`, sources in each `boards/<id>.sources.md`).
- Screenshots: demo links accept `&stage=desk|plain`, `&cam=top|side|module|home` and `&clean=1`; `node scripts/screenshots.mjs` retakes every README and website screenshot from the real app in simulator mode (JPEG, with a 900 px copy for the site).
- New screenshots everywhere with the 3D workbench, and a new social preview ("See inside your board", 13 boards) for the website and GitHub.
- A social image per board (`site/img/boards/<id>.jpg`: the board's 3D view with its name, pin count, logic voltage and chip), used by its pinout page, its 30 wiring guides and its comparison pages in both languages.
- Easier to contribute: an "Add your board in 30 minutes" guide (`docs/add-a-board.md`), a "Request a board" issue form, and a "Contribute in 30 minutes" section in the README.
- Website SEO: 360 wiring guides per language (the 30 most searched parts on 12 boards, e.g. "BME280 with Raspberry Pi Pico": board-specific pins, voltage checks such as 5 V echo on 3.3 V boards, library-based Arduino test code, HowTo and FAQ structured data), 12 board comparison pages ("ESP32 DevKit vs Raspberry Pi Pico"), questions and answers with FAQ markup on every board page, and links between parts, boards, guides and comparisons. 1,542 URLs in the sitemap.

## 0.5.0 (2026-09-28)

- 13 boards instead of one: ESP32 DevKit, ESP32-S3-DevKitC-1, ESP32-C3-DevKitM-1, Raspberry Pi Pico, Pico W and Pico 2, Arduino Uno R3, Nano and Mega 2560, STM32 NUCLEO-F401RE and Black Pill F411, Nordic nRF52840 DK and Teensy 4.1. Pin positions come from the vendors' mechanical files; every fact has a source (`boards/<id>.sources.md`).
- Board files now carry their own rules (default I2C/SPI pins, safe pins, ADC pins, flags), toolchain and USB ids; nothing in the app is tied to the ESP32 any more.
- Board picker with "Find my board" (USB id matching); switching boards moves wires to matching pins. Warnings when the plugged-in chip does not match the chosen board.
- 3D: sockets on Arduino-style boards, upward pins, pads, more component types, board colors, camera framing by board size, 2D pinout labels on all four sides.
- Flashing and identify per family: avrdude (AVR), picotool (RP2040/RP2350), STM32CubeProgrammer / stlink / dfu-util (STM32), nrfjprog (nRF52), Teensy Loader (Teensy, which cannot be backed up; the confirmation says so).
- New wiring rules: 5 V / 3.3 V logic levels, native USB and debug pins, pins used on the board, power inputs that are dead on USB.
- Simulator benches for every board; starter sketches per family (Wire pins, STM32 pin names, ADC scaling).
- Diagnostic agent 0.2 builds for all 13 boards (prebuilt in `resources/agent/<board>/`): ESP32 boards keep hardware I2C; the others use a bit-banged I2C so the SDA/SCL swap test works on any pins. ADC readings on non-ESP boards use the nominal reference and say so. Non-ESP agents are compiled and tested against a simulated bus, not yet on real boards.
- Website: a pinout page per board (English and Italian) and a boards index, /boards.json.

## 0.4.0 (2026-09-28)

- New logo (a chip with a navigation arrow) in the app, app icon, website, favicon and social previews.
- Parts library grows from 155 to 383 parts: environment, air quality, light, biometrics, motion, distance, electrical measurement, industrial interfaces, displays, LEDs, audio, motor drivers, power modules, radios, GPS, storage, clocks, expanders and inputs.
- The parts data is now open under CC BY 4.0: one web page per part (English and Italian) with ESP32 wiring, chip-ID check and starter code, a searchable index at /parts/, and the full dataset at /parts.json.
- Free demo AI: works out of the box through a rate-limited relay (Cloudflare Pages Function) to an older free-tier Gemini model with Google Search grounding for part lookups; a banner explains it is for testing only. Your own Claude, GPT or Gemini key still takes over.
- Part sizes up to 150 × 150 × 120 mm for long modules.
- Documentation: new README, docs/ (getting started, hardware setup, parts library, AI), CONTRIBUTING, issue templates (request a part, bug report).

## 0.3.0 (2026-09-28)

- Windows version: NSIS installer (`BoardPilot-win-x64.exe`), esptool discovery for Windows Python installs, Windows driver hints, native window frame. Releases build macOS and Windows together.
- Parts library grows from 7 to 155 built-in parts (sensors, displays, inputs, outputs, drivers, radios), each with pins, roles, bus, addresses, 3D shape and sources.
- Add from a link now recognises the chip on the page and starts from the checked library part, reads the board size for the 3D model, measures the board color from the product photo and keeps a thumbnail.
- AI provider of your choice: Claude, GPT or Gemini, with keys entered in AI settings and stored encrypted; model list, connection test.
- SEO: separate Italian pages, structured data (SoftwareApplication, FAQ, TechArticle), sitemap with language alternates, robots.txt, Open Graph image, ESP32 pinout reference pages, IndexNow ping script; Google Search Console property for agentflowbind.com.

## 0.2.0 (2026-09-28)

- Parts library panel on every 3D screen: search, filter, add; your own parts saved in the app data folder.
- Add a part from a web link: the page (or PDF datasheet, with AI) is read and a part with pins and a 3D model is drafted; you check and confirm it in the part editor with a live 3D preview.
- 3D editing: drag to move, rotate (R), duplicate (⌘D), remove (Delete), nudge with arrow keys, rename, undo/redo (⌘Z / ⇧⌘Z), open and save projects (custom parts travel with the file), autosave.
- New part shapes: chip, module, motor, relay.
- English and Italian throughout the app, including main-process errors, wizard flows, wiring findings, reports and AI replies.
- 30-day trial, then offline-verified license keys (Ed25519). Source-available BoardPilot License; firmware under MIT.
- GitHub Actions: CI on every push, .dmg release on version tags. Landing page in `site/`.
- Fixed: `NAME_MAX` clash in BoardPilotProbe with the ESP32 core; agent and probe now compile with esp32 core 3.3.12.

## 0.1.0 (2026-09-28): first working build, simulator first

- Electron + Vite + React + TypeScript (strict) app shell: top bar, task rail with the 7 tasks, 3D viewport, wizard/assistant panel, session log. Secure preload with a typed API (`window.bp`); the renderer never touches serial, files or the API key.
- Board definition `boards/esp32-devkitc-30.json` with all 30 pins, functions and flags, sources in `esp32-devkitc-30.sources.md`. 3D board generated from it (PCB, WROOM module, USB, buttons, headers, one clickable mesh per pin), camera presets, fly-to, labels, 2D pinout view, pin info card.
- Parts library (BME280/BMP280, SSD1306, LED, button, potentiometer, MPU6050, DHT22), parts and wires in 3D, drag to move, click-to-wire, bus activity pulses, PWM and ADC indicators.
- Wiring rule checker (voltage, input-only outputs, flash pins, strapping pins, crossed SDA/SCL, shared pins, missing ground/power, ADC2 with Wi-Fi, UART0).
- HardwareDriver interface with a SimDriver (8 scenarios) and a RealDriver (serialport discovery, esptool v4/v5 identify, backup, restore, flash). Every write needs a one-time confirmation token; the flash is backed up before the first write.
- Diagnostic agent firmware (`firmware/agent`), build script (`npm run build:agent`), BoardPilotProbe library (`firmware/probe`).
- Wizard engine with auto/question/input/confirm/action/result steps and flows: connect-identify, debug-sensor-not-responding (pull-ups, scan, swap test, ID register), debug-board-not-detected, debug-keeps-resetting, debug-garbage-on-serial, flash-firmware.
- AI assistant in the main process (tool use, structured replies with confidence and sources, honesty enforcement, photo recognition, free-text classification). Off without `ANTHROPIC_API_KEY`.
- Test hardware (I2C grid, bus diagram, decoded bus view, pin checks, GPIO and ADC sweep tests), Monitor (serial console, uPlot plots, CSV recording, memory), New project (safe pin assignment, starter sketch), Report (Markdown + PDF with 3D snapshot).
- 41 Vitest tests: protocol parser, wiring rules, board data, esptool parsing, probe parser, safety tokens, and full flows against the simulator.
