<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <img src="docs/logo-light.svg" alt="BoardPilot" width="360">
  </picture>
</p>

<p align="center"><b>See inside your board.</b> A desktop app that finds wiring mistakes, decodes I2C and shows every pin, wire and bus transaction on a live 3D board: ESP32, Raspberry Pi Pico, Arduino, STM32, nRF52 and Teensy.<br>English and Italian · macOS and Windows · works without hardware in simulator mode.</p>

<p align="center">
  <a href="https://github.com/mojeee/boardpilot/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/mojeee/boardpilot?label=download&color=5CCB8F"></a>
  <a href="https://github.com/mojeee/boardpilot/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/mojeee/boardpilot/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://boardpilot.agentflowbind.com/parts/"><img alt="Parts library" src="https://img.shields.io/badge/parts%20library-380%2B-3FB6E8"></a>
  <a href="parts/LICENSE"><img alt="Parts data CC BY 4.0" src="https://img.shields.io/badge/parts%20data-CC%20BY%204.0-C9BEFF"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-8A96A3">
  <img alt="Languages" src="https://img.shields.io/badge/lang-EN%20%7C%20IT-F2A93B">
</p>

<p align="center">
  <a href="https://boardpilot.agentflowbind.com"><b>Website</b></a> ·
  <a href="https://github.com/mojeee/boardpilot/releases/latest/download/BoardPilot-mac-arm64.dmg">Mac (Apple Silicon)</a> ·
  <a href="https://github.com/mojeee/boardpilot/releases/latest/download/BoardPilot-mac-x64.dmg">Mac (Intel)</a> ·
  <a href="https://github.com/mojeee/boardpilot/releases/latest/download/BoardPilot-win-x64.exe">Windows</a> ·
  <a href="https://boardpilot.agentflowbind.com/parts/"><b>Parts library</b></a> ·
  <a href="https://boardpilot.agentflowbind.com/boards/">Board pinouts</a> ·
  <a href="docs/README.md">Docs</a>
</p>

![BoardPilot finds SDA and SCL crossed on a BME280 connected to an ESP32: the crossed wire is highlighted on the 3D workbench, with the measurements that prove it](docs/img/debug.jpg)

<p align="center"><sub>If BoardPilot helped you find a wiring mistake, a ⭐ helps other makers find it too.</sub></p>

## Why BoardPilot

Most "my sensor does not work" problems are wiring: SDA and SCL swapped, a missing ground, a 5 V module on a 3.3 V pin, an LED on an input-only GPIO, a strapping pin that stops the board from booting. BoardPilot **measures** the real pins through a small diagnostic firmware, **shows** the result on a 3D model of your board, and **explains** the cause in plain words, with the evidence and the datasheet section behind every claim.

- **Look before asking.** It detects the board, chip, flash and USB bridge by itself, and asks only for what it cannot see.
- **Safe by default.** Read-only unless you confirm; your firmware is backed up before the first write and comes back with one click.
- **Honest AI.** The optional assistant only states what it measured, labels guesses as suggestions and cites sources.

## Supported boards

| Family | Boards | Flashing |
|---|---|---|
| ESP32 | ESP32 DevKit (30 pins), ESP32-S3-DevKitC-1, ESP32-C3-DevKitM-1 | esptool |
| Raspberry Pi | Pico, Pico W (RP2040), Pico 2 (RP2350) | picotool / UF2 |
| Arduino (AVR) | Uno R3, Nano, Mega 2560 | avrdude |
| STM32 | NUCLEO-F401RE, Black Pill F411CE | STM32CubeProgrammer, stlink or dfu-util |
| Nordic | nRF52840 DK | nrfjprog |
| Teensy | Teensy 4.1 | Teensy Loader |

Boards are data files in [`boards/`](boards/) (pins with positions, flags and sources, default buses, toolchain, USB ids); validate them with `node scripts/check-boards.mjs`. Pinout pages: <https://boardpilot.agentflowbind.com/boards/>.

## Features

| | |
|---|---|
| ![Debug wizard](docs/img/debug.jpg) **Debug wizard** Pull-ups, I2C scan, SDA/SCL swap test, chip ID (tells a BMP280 from a BME280), brownout and baud-rate detection. | ![Test hardware](docs/img/test.jpg) **Test hardware** I2C address grid, bus diagram, bit-level decoded transactions, GPIO and ADC tests. |
| ![Monitor](docs/img/monitor.jpg) **Monitor** Serial console, live plots colored by pin, CSV recording, heap and stack. | ![Parts library](docs/img/library.jpg) **Parts library** Add, move, rotate and wire parts in 3D; wiring rules flag mistakes as you build. |

Also: connect and identify (esptool v4/v5), safe flashing with automatic backup, new-project pin assignment with a starter sketch, reports as Markdown and PDF, English and Italian UI, 30-day free trial.

## The open parts library

**380+ sensors, displays, drivers, radios and modules**, each with its pins and roles, supply voltage, I2C addresses, chip-ID register, 3D shape and sources. The data is **free to reuse under [CC BY 4.0](parts/LICENSE)**:

- Browse it: <https://boardpilot.agentflowbind.com/parts/> (one page per part with the ESP32 wiring and starter code)
- Download it: <https://boardpilot.agentflowbind.com/parts.json>
- Source files: [`parts/`](parts/)
- Missing a part? [Request it](https://github.com/mojeee/boardpilot/issues/new?template=new-part.yml) or open a pull request (see [docs/parts-library.md](docs/parts-library.md)).

In the app you can also paste a product link: BoardPilot recognises the chip, reads the board size, measures the board color from the product photo and drafts the part with a 3D model, for you to check before saving.

![Import a part from a link](docs/img/import.jpg)

## AI assistant

Optional. It works out of the box with a **free demo** (an older Gemini model through BoardPilot's rate-limited test relay; for testing only, don't send private data), or with **your own key** for Claude, GPT or Gemini, stored encrypted on your computer. See [docs/ai.md](docs/ai.md).

## Install

Download from the [latest release](https://github.com/mojeee/boardpilot/releases/latest). Early builds are not code-signed yet: on Mac right-click the app → Open; on Windows click *More info → Run anyway*. For real boards install esptool (see [docs/hardware-setup.md](docs/hardware-setup.md)); simulator mode needs nothing.

## Contribute in 30 minutes

No big code changes needed to help:

- **Add a board**: one JSON file and its sources. Guide: [Add your board in 30 minutes](docs/add-a-board.md). Or [request a board](https://github.com/mojeee/boardpilot/issues/new?template=new-board.yml).
- **Add a part** to the open library: see [docs/parts-library.md](docs/parts-library.md), or [request a part](https://github.com/mojeee/boardpilot/issues/new?template=new-part.yml).
- **Translate**: every UI string is in `shared/i18n/it/*.ts`; a new language is a new folder next to it.
- Look for issues labelled [good first issue](https://github.com/mojeee/boardpilot/labels/good%20first%20issue).

## Develop

```bash
npm install
npm run dev          # the app, in simulator mode
npm test             # 2000+ tests (Vitest); npm run typecheck
npm run build:agent  # rebuild the ESP32 diagnostic agent (arduino-cli + esp32 core)
npm run dist:mac     # .dmg files in dist/
npm run dist:win     # Windows installer in dist/
npm run build:site   # regenerate the website and the parts pages
node scripts/screenshots.mjs  # retake the README and website screenshots (after npm run build)
```

Architecture, product rules and conventions: [CLAUDE.md](CLAUDE.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## License

| What | License |
|---|---|
| The app (this repository, except below) | [BoardPilot License](LICENSE.md): source-available, free 30-day trial, then a license key |
| `parts/` (parts library data) | [CC BY 4.0](parts/LICENSE) |
| `firmware/` (diagnostic agent, BoardPilotProbe library) | [MIT](firmware/LICENSE) |

Made in Italy by [Mojtaba Amini](https://github.com/mojeee).
