# Hardware setup

Target board today: **ESP32 DevKit V1, 30 pins (ESP32-WROOM-32)**. More boards are data files in [`boards/`](../boards/).

## 1. Cable and driver

- Use a USB cable that carries **data** (many cables only charge).
- Look at the small chip near the USB socket:
  - **CP2102/CP2104**: Silicon Labs CP210x driver (recent macOS works without it; Windows: “CP210x Universal Windows Driver”).
  - **CH340/CH9102**: WCH CH34x driver (macOS: allow it in System Settings → Privacy & Security; Windows: “CH341SER”).
- The port appears as `/dev/cu.usbserial-…` (Mac) or `COM3`… (Windows).

## 2. esptool

BoardPilot uses Espressif's `esptool` to identify, back up and flash the chip.

- **Mac**: `brew install esptool` (or `pip3 install esptool`).
- **Windows**: install Python from python.org (tick *Add python.exe to PATH*), then `py -m pip install esptool`.

If the app was built with a bundled esptool (see below), you do not need Python or pip: BoardPilot uses its own copy first and only falls back to the one on your PATH.

### Locked chips

Before it backs up, installs the agent, flashes or restores, BoardPilot asks the chip for its security state (`esptool get-security-info`). If **secure boot**, **flash encryption** or **secure download mode** is on, it stops with a plain message and changes nothing. Older chips that cannot answer the question are treated as "unknown" and continue as before.

### Flash size and restore

The backup is as big as the flash the chip reports; the app never assumes 4 MB (if it cannot read the size it refuses). Restore checks that the backup file still has the size recorded when it was made and that it fits the connected chip, before it writes anything.

### Bundling esptool (maintainers)

`npm run build:esptool` (`scripts/build-esptool.mjs`) builds a single-file esptool with PyInstaller into `resources/esptool/mac/` or `resources/esptool/win/`. Run it on the OS you are packaging for; PyInstaller cannot cross-compile, and the macOS binary must match the architectures of the .dmg (use a universal2 Python, or build once per architecture). `package.json` copies the folder into the installer as `esptool/<os>/`, and `findEsptool()` prefers it. The release workflow builds it when the repository variable `BUNDLE_ESPTOOL` is `true`. The folder is empty in git: until someone runs the build and tries it on a real board, installers fall back to the esptool on the PATH.

Then in BoardPilot: ⚙ → **Real board**, and run **Connect and identify**. If the board does not answer, hold **BOOT**, tap **EN**, release **BOOT**, and try again.

## 3. The diagnostic agent

To see live pins and run bus tests, BoardPilot installs a small firmware, the **diagnostic agent** ([`firmware/agent`](../firmware/agent), MIT). Before the first write it **backs up the whole flash** to your computer and asks for confirmation. **Restore my firmware** (top bar) puts your program back.

The agent refuses dangerous operations by itself: flash pins GPIO 6–11, outputs on input-only GPIO 34–39, the USB serial pins.

## 4. Stream your own values (optional)

Include the MIT-licensed [BoardPilotProbe](../firmware/probe) library in your sketch to plot named values, heap and stack in **Monitor**:

```cpp
#include <BoardPilotProbe.h>
BoardPilotProbe probe(Serial);
void setup() { Serial.begin(115200); probe.begin(100); }
void loop() { probe.value("pot", analogReadMilliVolts(34), 34); probe.loop(); }
```
