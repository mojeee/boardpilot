# Video 1 · "Why doesn't it work?" #1 · My I2C sensor is not found

- **Series:** Why doesn't it work? (#1)
- **Length:** about 9 minutes
- **Board and parts:** ESP32 DevKit (30 pins), GY-BME280 breakout, 4 jumper wires
- **App:** Debug a problem → "Sensor not responding"; Test hardware (decoded I2C view)
- **Simulator scenario:** "Weather station, SDA and SCL crossed" (`weather-station-swapped`)
- **Publish:** week 1 (see [calendar.md](../calendar.md))

## Before recording

- [ ] The build you record is the released one you will link. Note its version here: `____`.
- [ ] **Real-board gate.** Wire the BME280 to the ESP32 with SDA and SCL crossed at the sensor
      (D21 → SCL, D22 → SDA), run the flow on the real board and write down what the app said.
      If it matches the script, record the desk parts. If it does not, change the script to what
      happened. If you have no ESP32 yet, record the simulator version only and say "simulated"
      every time (the script marks where).
- [ ] Your own program backup will be taken by the app before the agent is installed: let the
      recording show the confirmation dialog.

## Title options

1. My I2C sensor is not found (ESP32): the 30-second test that finds it
2. "No BME280 found": the wiring mistake your I2C scanner can't see
3. I2C device not found? Swap two wires in software first

## Thumbnail concept

CU of the BME280 breakout with two jumper wires crossing in an X over it (SDA blue `#3FB6E8`, SCL
light blue `#9ADCF7`). Text: **"NOT FOUND?"** in orange `#F2A93B`. Small "WHY? #1" tag in the
corner. No face.

## Script

### 0:00–0:15 · Hook

- **Shot:** SCR: the Arduino serial monitor printing the library example's "Could not find a
  valid BME280 sensor…" line over and over (record the real output of the library version you
  use). Then DESK: the ESP32 and the sensor, wired, powered.
- **On-screen text:** "Sensor not found"
- **Voice:** "Four wires. A sensor that works. And the code says: not found. The I2C scanner finds
  nothing either. The sensor is fine. It's answering. Just not where the code is listening. Let's
  find out why."

### 0:15–0:30 · Disclosure

- **Shot:** SCR: BoardPilot home screen, the seven tasks.
- **Voice:** "I'm using BoardPilot here, an app I make. Everything it measures in this video, I'll
  also show you how to check by hand, with a ten-line sketch."

### 0:30–1:10 · The setup

- **Shot:** DESK: point at each wire with a finger, slowly. CU: the labels on the breakout (VIN,
  GND, SCL, SDA).
- **On-screen text:** "3V3 → VIN · GND → GND · D21 → ? · D22 → ?"
- **Voice:** "An ESP32 DevKit and a BME280 breakout. Power: 3.3 volts to VIN, ground to ground.
  Then two signal wires, SDA and SCL, on D21 and D22, the ESP32's default I2C pins. The code is the
  library example. It compiles, it uploads, and it prints 'not found'."

### 1:10–1:50 · What people usually try

- **Shot:** SCR: a list appears one line at a time (TXT card).
- **On-screen text:** "Change the address · Another library · Another sensor · Re-solder"
- **Voice:** "What most of us try next: change the address from 0x77 to 0x76. Try another library.
  Order another sensor. Re-solder the header. Sometimes one of those is the answer. Today none of
  them is. We need to measure, not guess."

### 1:50–2:40 · Start the debug flow

- **Shot:** SCR: Debug a problem → Sensor not responding. The question "What do you see?" → click
  "My code says the sensor is not found". The step "Which sensor?" finds the BME280 in the project,
  with SDA on D21 and SCL on D22, and the pins light up on the 3D board.
- **On-screen text:** none (the app's text is readable).
- **Voice:** "In BoardPilot: Debug a problem, sensor not responding. It asks one question: what do
  you see? The code says not found. It already knows the sensor from the project: a BME280, SDA on
  D21, SCL on D22. It lights those pins on the 3D board, so we can see what it's about to test."

### 2:40–3:20 · The diagnostic agent, with a confirmation

- **Shot:** SCR: the "Install the diagnostic agent" confirmation dialog, readable for 2 seconds.
  Then the backup and the install progress.
- **Voice (real board):** "To measure the pins, the app installs a small diagnostic firmware. It
  asks first, and it backs up the whole flash before writing anything, so my own program comes back
  with one click: 'Restore my firmware', top right."
- **Voice (simulator):** "In the simulator this step is simulated too, but the dialog is the same
  one you'd see with a real board."

### 3:20–4:10 · Power and pull-ups

- **Shot:** SPLIT: DESK on the left, SCR on the right. The step "Check power and pull-ups": D21
  pulled up, D22 pulled up. The log lines are marked as measured.
- **On-screen text:** "Idle I2C lines are HIGH"
- **Voice:** "First check: power and pull-ups. I2C lines rest HIGH, pulled up by resistors. Most
  breakout boards carry those resistors themselves. So the app turns off the ESP32's own pull-ups
  and reads the pins. Both HIGH, with nothing driving them. That tells us the sensor board has
  power, and both wires reach it. So why no answer?"

### 4:10–4:50 · Scan as wired

- **Shot:** SCR: "Scan the I2C bus as wired": "No device answered with SDA = D21, SCL = D22."
  Switch to Test hardware for 5 seconds: the decoded bus view shows the address byte with NACK.
- **On-screen text:** "NACK = nobody answered"
- **Voice:** "Second check: a scan, as wired. The ESP32 calls every address. Nobody answers. Here
  in the decoded view you can see one call: start, the address, and then NACK, 'not acknowledged'.
  That's the moment the sensor should have pulled the line low. It didn't."

### 4:50–5:50 · The swap test

- **Shot:** SCR: "Swap test: SDA and SCL exchanged": "BME280 answers at 0x76 only with SDA and SCL
  exchanged: the wires are crossed." The two wires glow on the 3D board. Then DESK: follow the two
  wires with a finger to the sensor, where they cross.
- **On-screen text:** "Scan 1: D21 = SDA → nothing · Scan 2: D21 = SCL → 0x76"
- **Voice:** "Third check. On the ESP32, the I2C pins are chosen in software. So the app scans a
  second time with the two pins exchanged: D21 as the clock, D22 as the data. And there it is: 0x76
  answers. The sensor was fine all along. The two wires are crossed at the sensor. On the desk,
  follow them: the wire from D21 goes to SCL."
- **Voice (simulator):** add "In this simulated bench the crossing is built into the scenario."

### 5:50–6:30 · The chip ID

- **Shot:** SCR: "Read the chip ID": "ID register 0xD0 = 0x60: this is a genuine BME280." Then the
  result card "SDA and SCL are crossed", with evidence and sources.
- **On-screen text:** "Register 0xD0 = 0x60 → BME280 (Bosch BME280 datasheet, 5.4.1)"
- **Voice:** "One last check, while we're talking to it: register 0xD0 holds the chip ID. 0x60
  means a real BME280. Keep that number in mind: in the next episode, that register tells us
  something surprising. The result card lists the cause, every measurement behind it, and the
  sources: this session's scans, and the Bosch datasheet section."

### 6:30–7:15 · The fix, two ways

- **Shot:** DESK: unplug USB, swap the two wires at the sensor, plug back in. SCR: run the flow
  again (or the scan in Test hardware): 0x76 found as wired. The serial monitor shows temperature,
  humidity and pressure.
- **On-screen text:** "Fix A: swap the wires · Fix B: Wire.begin(22, 21)"
- **Voice:** "Two ways to fix it. Unplug, swap the two wires at the sensor, plug back in. Scan
  again: found as wired. Or leave the wires and tell the code: Wire.begin with 22 as data and 21 as
  clock. Both work on an ESP32. I prefer fixing the wires, so the drawing and the board agree."

### 7:15–8:20 · Check it without BoardPilot

- **Shot:** SCR: a code editor with the sketch below. Serial monitor output on the right.
- **On-screen text:** the sketch
- **Voice:** "Without the app, you can do the same swap test with a short sketch. Scan with the
  pins one way, then the other way. If a device appears only in the second scan, your wires are
  crossed. It won't tell you about pull-ups or the chip ID, but it finds this mistake."

```cpp
#include <Wire.h>

void scan(int sda, int scl) {
  Wire.end();
  Wire.begin(sda, scl);
  Serial.printf("SDA=%d SCL=%d:", sda, scl);
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", a);
  }
  Serial.println();
}

void setup() { Serial.begin(115200); delay(500); scan(21, 22); scan(22, 21); }
void loop() {}
```

- **Note for the edit:** run this sketch on the real board before showing it, and show its real
  output. (`Wire.end()` exists in the current ESP32 Arduino core; check it compiles on your core
  version.)

### 8:20–8:50 · Recap

- **Shot:** TXT card with three lines.
- **On-screen text:** "1. Pull-ups HIGH = power and wires reach · 2. Scan finds nothing · 3.
  Swapped scan finds it = crossed"
- **Voice:** "So: both lines HIGH means the board has power and both wires arrive. A scan that
  finds nothing, plus a swapped scan that finds the sensor, means SDA and SCL are crossed. Thirty
  seconds, no guessing."

### 8:50–9:10 · End screen

- **Shot:** end screen with the next video ("Lesson 1") and the playlist.
- **Voice:** "Next in this series: a sensor that answers perfectly, and still can't measure
  humidity. And if you write code for a living and want to understand the board under it, lesson
  one is here."

## Claims and where they come from

| Claim in the video | Source |
|---|---|
| The debug flow asks "What do you see?", finds the sensor from the project, checks pull-ups, scans, does a swap test, reads the chip ID | `flows/debug-sensor-not-responding.ts` |
| The agent is installed only after a confirmation, with a full flash backup first; "Restore my firmware" | `flows/common.ts` (confirm step), `docs/hardware-setup.md`, CLAUDE.md rule 3 |
| Pull-up check: internal pulls off, HIGH with nothing driving it = external pull-up | CLAUDE.md "Measurement honesty"; flow step "Check power and pull-ups" |
| Decoded I2C view shows start, address, ACK/NACK, stop | Test hardware, CHANGELOG 0.1.0; agent `trace` |
| ESP32 I2C pins can be remapped in software, which makes the swap test possible | CLAUDE.md "Swap test"; ESP32 Technical Reference Manual, GPIO matrix |
| BME280 at 0x76 or 0x77; chip ID register 0xD0 = 0x60 | `parts/bme280-gy.json` (Bosch BME280 datasheet, 5.4.1) |
| D21/D22 are the ESP32's default I2C pins | `boards/esp32-devkitc-30.json` |
| Simulator scenario with crossed wires | `app/main/sim/scenarios/weather-station-swapped.json` |

## Description

```
The sensor is fine and the code compiles, but it says "not found" and the I2C scanner finds
nothing. Here's the 30-second test that shows the real cause, with the app and with a 10-line
sketch.

BME280 wiring and chip-ID check: https://boardpilot.agentflowbind.com/parts/bme280-gy/
ESP32 pinout (default I2C pins): https://boardpilot.agentflowbind.com/esp32-pinout/

Chapters
0:00 Sensor not found
0:15 The tool in this video
0:30 The setup
1:10 What people usually try
1:50 The debug flow
2:40 Installing the diagnostic agent (with backup)
3:20 Power and pull-ups
4:10 Scan as wired
4:50 The swap test
5:50 The chip ID
6:30 The fix, two ways
7:15 The same test without BoardPilot
8:20 Recap

Recorded on: [real ESP32 DevKit / simulator — say which]. BoardPilot version: [x.y.z]
Why doesn't it work? #1

[standard footer from docs/youtube/format.md]
```

## Tags

`esp32, i2c, bme280, i2c scanner, sda scl, arduino, esp32 i2c not working, sensor not found,
embedded debugging, boardpilot`

## Pinned comment

"What was the strangest reason your I2C sensor wasn't found? Mine was a breadboard row that looked
fine and wasn't connected. The swap-test sketch from the video is in the description's link to the
BME280 page."

(Only say "mine was…" if it is true for you; otherwise drop that sentence.)

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). Terms in this video: "swap test" → "test di scambio";
"SDA and SCL are crossed" → "SDA e SCL sono invertiti"; "Check power and pull-ups" → "Controlla
alimentazione e pull-up"; "Read the chip ID" → "Leggi l’ID del chip"; "Debug a problem" → "Risolvi
un problema"; "Restore my firmware" → "Ripristina il mio firmware". Keep "pull-up", "NACK", "I2C" as
they are.
