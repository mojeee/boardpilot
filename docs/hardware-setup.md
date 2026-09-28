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
