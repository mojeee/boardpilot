# BoardPilot: build plan for your Mac

This file is for you. `CLAUDE.md` is for Claude Code. Put both in the project folder.

## 1. Hardware to buy (roughly €40–60)

- ESP32 DevKit, 30 pins, ESP32-WROOM-32 (buy 2: one will get abused during testing)
- USB cable that carries data (many cheap ones are charge-only)
- GY-BME280 breakout (4 pins). If you get one that reports ID 0x58 it is a BMP280, which is a great test case too
- Breadboard, jumper wires, a few LEDs, 220 Ω resistors, a 10 kΩ potentiometer, push buttons
- Optional, for later: SSD1306 OLED (I2C), MPU6050, a cheap USB logic analyzer

## 2. Mac setup (once)

Open Terminal and run these one at a time.

```bash
# Apple developer tools
xcode-select --install

# Homebrew (package manager), see brew.sh if this line changes
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node, Python, Arduino CLI
brew install node python arduino-cli

# esptool (talks to the ESP32 chip)
pip3 install esptool

# ESP32 support for arduino-cli
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32

# Claude Code
curl -fsSL https://claude.ai/install.sh | bash
```

Close and reopen Terminal, then check: `claude --version`, `node -v`, `esptool version` (older esptool versions use `esptool.py version`).

### Check your board works

1. Plug the ESP32 in with the data cable.
2. Run `ls /dev/cu.*`. You should see something like `/dev/cu.usbserial-0001` or `/dev/cu.SLAB_USBtoUART` or `/dev/cu.wchusbserial...`.
3. Nothing new appears? Try another cable first. Then look at the small chip next to the USB port: CP2102 needs the Silicon Labs CP210x driver, CH340 needs the WCH CH34x driver.
4. Run `esptool --port /dev/cu.usbserial-0001 chip-id` (use your port name; older versions: `esptool.py --port ... chip_id`). It should print the chip type and MAC address. If it waits forever, hold the BOOT button while it connects.

### Two different Claude accounts in play

- **Claude Code** (the tool that writes the app) signs in with your Claude subscription.
- **The app's own AI assistant** needs an API key from the Claude Console. Put it in `.env.local` as `ANTHROPIC_API_KEY=...`. That file must never be committed.

## 3. Start the project

```bash
mkdir ~/boardpilot && cd ~/boardpilot
git init
# copy CLAUDE.md and BUILD_PLAN.md into this folder
mkdir design
# export the five screens from the design canvas as PNG into /design:
# home.png, wizard.png, workspace-3d.png, test-hardware.png, monitor.png
claude
```

## 4. How to work with Claude Code

- **One milestone per session.** Paste the milestone prompt, and ask Claude to show a plan before writing code (press Shift+Tab to switch to plan mode). Read the plan, correct it, then let it build.
- **Let it verify its own work.** Every prompt below ends with "done when" checks. Ask Claude to run the app and the tests itself and fix what fails.
- **Test by hand after each milestone**, then commit. If something is wrong, describe what you see or paste the error.
- **Start fresh between milestones** with `/clear`, so each session starts from `CLAUDE.md` instead of a long, messy history.
- **Keep the simulator working.** Most UI work never needs the real board plugged in.

## 5. Milestones and the prompts to paste

### M0. Skeleton and layout

```
Read CLAUDE.md and the screenshots in /design. Scaffold the project: Electron + Vite + React + TypeScript strict, secure preload with a typed API, Zustand, design tokens as CSS variables, IBM Plex fonts. Build the app shell exactly like the screenshots: top bar, left task rail with the 7 tasks, center area, right assistant panel, bottom log panel. Create empty screens for Home, Wizard, Workspace, TestHardware, Monitor, Report with navigation from the rail. Add npm scripts dev, build, test. Show me the plan first.
Done when: npm run dev opens a window whose layout matches /design/workspace-3d.png with empty panels, and npm test runs.
```

### M1. The 3D board

```
Create /boards/esp32-devkitc-30.json with all 30 pins, their functions and flags (flash pins, input-only, strapping, ADC1/ADC2) from the Espressif ESP32 datasheet, with sources in a comment file next to it. Build Board3D with @react-three/fiber that generates the board procedurally from that JSON: PCB, WROOM module with metal shield, USB connector, EN and BOOT buttons, two header strips, one clickable mesh per pin. Orbit controls, camera presets (top, pin side, module close-up), smooth fly-to when a pin is selected. Pin colors by role, a floating info card for the selected pin, a pin-labels toggle, and a flat 2D pinout view as an alternative mode.
Done when: I can rotate the board, click any pin and see its name, functions and warnings, switch 3D and 2D, and toggle labels.
```

### M2. Simulator and live log

```
Implement the HardwareDriver interface from CLAUDE.md and a SimDriver with scenario files. First scenario "weather-station-swapped": BME280 on D21/D22 with SDA and SCL crossed at the sensor, LED on D25 with PWM 62%, potentiometer on D34 at 1.84 V, D12 with pull-up enabled (strapping warning). Build the session log panel with typed entries and colored types, where clicking an entry with a target focuses that pin in 3D. Add a scenario picker in a developer menu.
Done when: in simulator mode I see live pin states on the 3D board and log entries appear and link to pins.
```

### M3. Real board discovery (Connect)

```
Implement real port discovery with serialport and chip identification by spawning esptool (support both the new esptool command names and the old esptool.py ones). Build the "Connect and identify" flow: detect the board, show chip, flash size, MAC and USB bridge chip. When detection fails, show plain-language causes and fixes for macOS: charge-only cable, missing CP210x or CH34x driver, port busy (another app has it open), board needs BOOT held. Every error goes through {code, humanMessage, hint}.
Done when: with my ESP32 plugged in the app identifies it; unplugged, it guides me through the fixes.
```

### M4. Diagnostic agent and safe flashing

```
Write the diagnostic agent in /firmware/agent (Arduino for ESP32) implementing the protocol in CLAUDE.md exactly, including pullup_check, the I2C trace output, and all pin safety rules. Add a build script using arduino-cli that writes the binaries to /resources/agent. In the app: before flashing the agent, show a confirmation dialog, back up the full flash with esptool into the app data folder, then flash the agent and connect with hello. Add "Restore my firmware" that writes the backup back. Write Vitest tests for the protocol parser with recorded example lines.
Done when: the app backs up, flashes the agent, gets hello, streams pins, and restore brings my original program back.
```

### M5. Parts, wires and the wiring checker

```
Create the phase 1 parts library in /parts (see CLAUDE.md) with 3D models built from simple shapes. Let me add parts to the scene, place them next to the board and draw wires by clicking a board pin then a part pin. Wires are colored cables; animate small pulses along a wire when the agent reports bus activity on it; PWM pins pulse, ADC pins show a level bar. Implement the wiring rule checker as a pure function with Vitest tests, and show each finding on the pin or wire in 3D and in the log.
Done when: I can rebuild my breadboard in the app, and a crossed SDA/SCL wire, a 5 V part on a 3.3 V pin, or a strapping pin are all flagged.
```

### M6. Wizard engine and the first debug flow

```
Build the wizard engine from CLAUDE.md (step types, run, aiHelp placeholder, fallbacks, logging) and the right-panel UI with the progress bar like /design/wizard.png. Implement the flow debug-sensor-not-responding: identify the board, symptom question, identify the sensor (from scene, else manual fallback: type model, pick from library, upload datasheet), then checks: pull-ups, bus scan, swap test, ID register read with the BMP280 case, and a result step with evidence. Each check lights up the related pins in 3D. It must work in simulator mode and on the real board.
Done when: with SDA and SCL really crossed on my breadboard, the app tells me they are crossed and where.
```

### M7. The AI assistant

```
Add the AI assistant in the main process with @anthropic-ai/sdk. Implement the tools and the structured reply format from CLAUDE.md, the confirmation dialog for write requests, and the confidence and source labels in the UI. Connect it to the wizard: an "Ask" box in every step, and aiHelp for every failed check. Add photo recognition for parts using image input, with a confirmation card like /design/wizard.png. Add "describe it in your own words" on Home that picks the right flow. Keep the API key only in the main process.
Done when: I can photograph my sensor and the app recognizes it, and asking "why is it reading zeros" gives an answer that calls tools and cites where each fact came from.
```

### M8. Test hardware screen

```
Build the Test hardware screen like /design/test-hardware.png: I2C address scan grid, bus wiring diagram generated from the scene, pin checks list, and a decoded bus view drawn from the agent's I2C trace (start, address, ack/nack, data, stop, with the bits under the waveform). Add a GPIO test where I toggle an output and confirm what I see, and an ADC sweep test where I turn the potentiometer and the app confirms the full range.
Done when: after fixing the wires, the scan shows 0x76 and the decode shows the ID 0x60 being read.
```

### M9. Monitor

```
Build the Monitor screen like /design/monitor.png: serial console for my own firmware, live plots colored by source pin, time window 30 s / 2 min / 10 min, pause and record to CSV, memory panel. Write a tiny Arduino library BoardPilotProbe (in /firmware/probe) that my own sketches can include to stream named values, heap and stack info in a format the app parses, so Monitor works without the agent.
Done when: a sketch with BoardPilotProbe shows temperature, humidity, pressure and the potentiometer as live graphs.
```

### M10. Flash firmware, New project, Report, packaging

```
Implement Flash firmware (pick a .bin or build an Arduino sketch with arduino-cli, confirm, back up, flash, verify the board boots and prints), New project (choose parts, the app assigns safe pins avoiding flash, input-only and strapping pins, shows the result in 3D and generates a starter sketch per part), and Report (session summary with log, findings, fix, and a 3D snapshot, exported as Markdown and PDF). Package the app as a macOS .dmg with electron-builder.
Done when: I can go from an empty project to a flashed, working weather station, and export a report of a debug session.
```

## 6. Real-hardware test checklist

Break things on purpose and check the app finds each one:

- [ ] SDA and SCL crossed at the sensor
- [ ] Sensor VIN unplugged
- [ ] Sensor GND unplugged
- [ ] Charge-only USB cable
- [ ] Serial monitor open in another app (port busy)
- [ ] Wrong baud rate in your sketch (garbage on serial)
- [ ] A BMP280 sold as BME280 (ID 0x58)
- [ ] LED on an input-only pin (D34 to D39)
- [ ] Button on D12 held at reset (board fails to boot; recoverable)
- [ ] Sketch that crashes (null pointer) for the future crash analyzer

## 7. After phase 1 works

- Crash analyzer (decode the ESP32 backtrace to file and line)
- Logic analyzer support through sigrok
- ESP32-S3, then STM32 with an ST-Link
- Web portal: accounts, payments, licenses
- Windows build
