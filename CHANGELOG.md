# Changelog

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
