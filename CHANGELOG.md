# Changelog

## 0.5.0 (unreleased)

- 13 boards instead of one: ESP32 DevKit, ESP32-S3-DevKitC-1, ESP32-C3-DevKitM-1, Raspberry Pi Pico, Pico W and Pico 2, Arduino Uno R3, Nano and Mega 2560, STM32 NUCLEO-F401RE and Black Pill F411, Nordic nRF52840 DK and Teensy 4.1. Pin positions come from the vendors' mechanical files; every fact has a source (`boards/<id>.sources.md`).
- Board files now carry their own rules (default I2C/SPI pins, safe pins, ADC pins, flags), toolchain and USB ids; nothing in the app is tied to the ESP32 any more.
- Board picker with "Find my board" (USB id matching); switching boards moves wires to matching pins. Warnings when the plugged-in chip does not match the chosen board.
- 3D: sockets on Arduino-style boards, upward pins, pads, more component types, board colors, camera framing by board size, 2D pinout labels on all four sides.
- Flashing and identify per family: avrdude (AVR), picotool (RP2040/RP2350), STM32CubeProgrammer / stlink / dfu-util (STM32), nrfjprog (nRF52), Teensy Loader (Teensy, which cannot be backed up; the confirmation says so).
- New wiring rules: 5 V / 3.3 V logic levels, native USB and debug pins, pins used on the board, power inputs that are dead on USB.
- Simulator benches for every board; starter sketches per family (Wire pins, STM32 pin names, ADC scaling).
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
