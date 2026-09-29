# Getting started

## Install

Download the installer for your system from the [latest release](https://github.com/mojeee/boardpilot/releases/latest):

| System | File |
|---|---|
| Mac with Apple Silicon (M1–M4) | `BoardPilot-mac-arm64.dmg` |
| Mac with Intel | `BoardPilot-mac-x64.dmg` |
| Windows 10/11 | `BoardPilot-win-x64.exe` |

Early builds are not code-signed. Mac: right-click BoardPilot in Applications → **Open**. Windows: **More info → Run anyway**.

## First run: simulator mode

BoardPilot starts in **simulator mode**, with a virtual ESP32 and a weather station on the bench (BME280, LED, knob, button). Nothing is written to any real board. Open the ⚙ menu (top right) to:

- load a scenario: crossed SDA/SCL, a BMP280 sold as BME280, unpowered sensor, no board, port busy, brownout resets, wrong baud rate;
- use bench actions: *Fix the wiring*, *Turn the knob*;
- switch to **Real board**.

## The seven tasks

1. **Connect and identify**: finds the USB port, reads chip, flash size, MAC and USB bridge.
2. **New project**: add parts from the library, let BoardPilot pick safe pins, get a starter sketch (Arduino) or a vendor SDK project (Pico SDK, ESP-IDF or STM32 HAL, depending on the board).
3. **Flash firmware**: writes a `.bin`, after a full backup of the flash.
4. **Debug a problem**: sensor not responding, board not detected, keeps resetting, garbage on serial.
5. **Monitor**: serial console, live plots, CSV recording, memory.
6. **Test hardware**: I2C scan grid, decoded bus, pin checks, GPIO and ADC tests.
7. **Report**: session summary with evidence and a 3D snapshot, as Markdown and PDF.

## 3D workspace

- Click a pin, wire or part for details. Drag parts to move them.
- Keys: **R** rotate, **Delete** remove, **⌘/Ctrl D** duplicate, arrows nudge, **W** wire mode, **⌘/Ctrl Z** undo.
- **Parts** opens the library; the folder and disk buttons open and save projects.

## Language

Top bar → **EN / IT**. Reports and AI answers follow the chosen language.
