# Changelog

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
