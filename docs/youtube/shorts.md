# Shorts

Format and reasons: [format.md → Shorts](format.md#3-shorts-vertical-30-to-50-seconds).
Vertical 1080×1920, 30 to 50 seconds, one fact, one visual, voice and hands only.

**How to make the vertical picture:** record the app at 2560×1440 and crop a 9:16 area around the
part that matters (the 3D board, the result card, the log line). Desk shots: record a vertical take
with the phone upright. Text on screen must be readable on a phone: at least 60 px high in the
final 1080×1920 frame.

Every Short ends with the related long video linked (YouTube's "related video" field) and says
"Simulator" on screen when the app runs in simulator mode.

---

## Short 1 · Your I2C sensor isn't dead. The wires are crossed.

- **Week:** 1 (with video 1). **Length:** about 35 s. **Cut from:** video 1 (swap test segment),
  plus a vertical DESK take.
- **Related video:** Video 1.

| Time | Shot | On-screen text | Voice |
|---|---|---|---|
| 0–3 s | SCR: "No device answered with SDA = D21, SCL = D22." | "Scan: nothing" | "Your I2C scanner finds nothing?" |
| 3–12 s | SCR: the swap test result, the two wires glowing on the 3D board | "Swap SDA and SCL in software" | "On an ESP32 you can swap SDA and SCL in software. Scan again the other way round." |
| 12–20 s | SCR: "BME280 answers at 0x76 only with SDA and SCL exchanged" | "Found at 0x76 → crossed" | "If it answers only when swapped, your wires are crossed. The sensor was fine." |
| 20–30 s | DESK vertical: fingers swap the two wires at the sensor | "Swap them back" | "Swap them at the sensor, and it's found." |
| 30–35 s | TXT | "Full test: 30 s, no guessing" | "The whole check, and a sketch to do it yourself, is in the full video." |

**Title:** "I2C sensor not found? Try this before buying a new one"
**Description:** "Scan once as wired, once with SDA and SCL swapped in software. Full video and the
sketch: [link to video 1]. #esp32 #i2c #arduino"
**Italian subtitles:** "test di scambio", "SDA e SCL sono invertiti".
**Claims:** the swap test and its message: `flows/debug-sensor-not-responding.ts`.

---

## Short 2 · GPIO 34 can't light an LED

- **Week:** 1. **Length:** about 40 s. **Recorded for the Short** (simulator is fine; say so).
- **Related video:** none on Nov 3 (it goes out before video 1); add video 1 as the related video
  once it is published, and Lesson 4 (GPIO) when that exists.

| Time | Shot | On-screen text | Voice |
|---|---|---|---|
| 0–3 s | SCR: New project, ESP32, an LED wired to D34 | "LED on GPIO 34" | "Why won't this LED light up?" |
| 3–12 s | SCR: the wiring warning on pin D34 in 3D, zoom on the log line | "Input-only pin" | "Because GPIO 34 on an ESP32 is input only. So are 35, and VP and VN, which are GPIO 36 and 39. They can read, they can't drive." |
| 12–25 s | SCR: "Check my code against the drawing" with `pinMode(34, OUTPUT);` → the finding on that line, pin highlighted | "pinMode(34, OUTPUT) → flagged" | "The code check catches it too: pinMode 34 output, on an input-only pin. And they have no internal pull-ups either." |
| 25–35 s | SCR: move the wire to D25, warning gone | "Use D25" | "Move the LED to a normal output pin, like 25, and it works." |
| 35–40 s | TXT | "Source: ESP32 datasheet, GPIO" | "Input-only pins: great for sensors, useless for LEDs." |

**Title:** "Why this ESP32 pin will never light your LED"
**Description:** "GPIO 34, 35, 36 and 39 on the ESP32 are input only, with no internal pull-ups.
ESP32 pinout with every pin's limits: https://boardpilot.agentflowbind.com/esp32-pinout/ #esp32"
**Before recording:** check the exact warning text the app shows and read that, not the table above.
(On the 30-pin DevKit the input-only pins on the header are D34, D35, VP = GPIO 36 and VN = GPIO 39,
per `boards/esp32-devkitc-30.json`.)
**Claims:** input-only pins and no pull-ups: CLAUDE.md pin facts and the board file flags; the code
check on `pinMode(34, OUTPUT)`: CHANGELOG "Code vs wiring checker".

---

## Short 3 · Your BME280 might be a BMP280

- **Week:** 2. **Length:** about 35 s. **Recorded for the Short**; later reused in video 3.
- **Related video:** Video 1 until video 3 is out, then video 3.

| Time | Shot | On-screen text | Voice |
|---|---|---|---|
| 0–3 s | CU: "BME280" printed on the breakout | "Is it really a BME280?" | "This says BME280." |
| 3–12 s | SCR: "Read the chip ID": "ID register 0xD0 = 0x58, expected 0x60." | "0xD0 = 0x58" | "Ask the chip: register 0xD0. A BME280 answers 0x60. This one says 0x58." |
| 12–22 s | SCR: result "This is a different chip" | "BMP280: no humidity" | "0x58 is a BMP280. Same pins, same address, no humidity sensor." |
| 22–35 s | TXT | "0x60 BME280 · 0x58 BMP280 (Bosch datasheets)" | "Humidity always zero? Check register 0xD0 before you blame your code." |

**Real-board rule:** if your own module reads 0x60, record the app in simulator mode (scenario
"BMP280 sold as BME280"), show "Simulator" on screen, and don't point at your module while saying
0x58.
**Title:** "Humidity always zero? Your BME280 might not be one"
**Description:** "Register 0xD0: 0x60 = BME280, 0x58 = BMP280. BME280 page with the check:
https://boardpilot.agentflowbind.com/parts/bme280-gy/ #bme280 #arduino #esp32"
**Claims:** `parts/bme280-gy.json` (idCheck and sources).

---

## Short 4 · Garbage on the serial monitor? It's the speed.

- **Week:** 2. **Length:** about 40 s. **Recorded for the Short** (simulator scenario "Wrong baud
  rate", `garbage-serial`).
- **Related video:** Video 1 (until "Why doesn't it work?" on serial garbage exists).

| Time | Shot | On-screen text | Voice |
|---|---|---|---|
| 0–3 s | SCR: serial monitor full of unreadable characters | "Garbage?" | "Your board prints garbage?" |
| 3–15 s | SCR: Debug a problem → Garbage on serial: the app tries the common speeds, one log line per speed with "% readable" | "Trying each speed" | "The app listens at each common speed and counts how much is readable." |
| 15–25 s | SCR: result "Your program talks at 9600 baud" | "9600 ≠ 115200" | "Readable at 9600, garbage at 115200. The program and the monitor must use the same speed." |
| 25–35 s | SCR: the code check flags `Serial.begin(9600)` against the monitor's 115200 | "Serial.begin(9600)" | "The code check spots it too: Serial.begin 9600, monitor at 115200." |
| 35–40 s | TXT | "Same number on both sides" | "Change one of them. Same number on both sides." |

**Title:** "Serial monitor shows garbage? Check this number"
**Description:** "Unreadable serial output is almost always a speed mismatch between Serial.begin()
and the monitor. #arduino #esp32 #serial"
**Before recording:** run the flow and read its real result text and percentages; don't use
invented numbers.
**Claims:** `flows/debug-garbage-on-serial.ts`; CHANGELOG "Code vs wiring checker" (`Serial.begin`
at a different speed than the monitor).

---

## Next Shorts (ideas, weeks 3 to 8)

Each one is a single fact the app already shows, with its source. Script them the same way, two
weeks ahead of publishing.

| # | Idea | What is on screen | Source in the repo |
|---|---|---|---|
| 5 | "GPIO 12 HIGH at boot: the board won't start" | A pull-up on D12 in the weather-station scenario; the strapping-pin warning | CLAUDE.md pin facts; wiring rules |
| 6 | "ADC2 stops working when Wi-Fi is on" | Code check: `analogRead` on an ADC2 pin in a sketch with Wi-Fi | CHANGELOG "Code vs wiring checker" |
| 7 | "Your HC-SR04 sends 5 V into a 3.3 V pin" | Add HC-SR04 on the ESP32: gotcha in the log, shopping list adds 1 kΩ + 2 kΩ | `parts/hc-sr04.json` gotchas; CHANGELOG "Shopping list" |
| 8 | "150 Ω, not 130: picking an LED resistor" | LED calculator | `shared/electronics.ts` |
| 9 | "Same pull-up, 100 kHz fine, 400 kHz broken" | Pull-up calculator, two speeds | `shared/electronics.ts` (NXP UM10204) |
| 10 | "Two BME280s on one bus? Same address." | Address conflict warning with the hint | CHANGELOG "New wiring rule: two I2C parts…" |
| 11 | "Your SSD1306 says 0x78. Your code wants 0x3C." | Part gotcha in the log | CHANGELOG "Part gotchas" |
| 12 | "Before any write: a full backup" | Confirmation dialog, backup progress, "Restore my firmware" | CLAUDE.md rule 3; `docs/hardware-setup.md` |
| 13 | "Let the app pick your pins" | Pin planner: I2C + analog + Wi-Fi on → ADC1 pins, reasons | CHANGELOG "Pin planner" |
| 14 | "Watch a plant-watering program think" | Template "Plant watering" in the live run view, story log | CHANGELOG "Template projects", "Live run view" |
| 15 | "main() never returns" | Lesson 1 power-on steps | `shared/lessons.ts` |
| 16 | "Your AI coding agent can read the real pins" | MCP: an agent calls `i2c_scan` through BoardPilot; the call appears in the session log as "MCP: …" | `docs/mcp.md` (record only after you have run it end to end yourself) |

When the motion graphics from issue #22 are done, add them here as extra Shorts; they follow the same
rules (real app, labelled simulated where it is).
