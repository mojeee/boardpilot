# Video 3 · "Why doesn't it work?" #2 · My BME280 has no humidity

- **Series:** Why doesn't it work? (#2)
- **Length:** about 8 minutes
- **Board and parts:** ESP32 DevKit, a module sold as "GY-BME280"
- **App:** New project (add the part: the "gotcha" appears in the log); Debug a problem → "Sensor
  not responding" → "Read the chip ID"
- **Simulator scenario:** "BMP280 sold as BME280" (`bmp280-mixup`)
- **Publish:** week 5

## Before recording

- [ ] Released build; version: `____`.
- [ ] **Real-board gate.** Run the flow on your "BME280" module. Write down the chip ID the app
      reads.
  - If it reads **0x58**: you have the real case. Record the desk parts with it.
  - If it reads **0x60**: your module is a genuine BME280. Record the mix-up in the simulator and
    say so ("simulated"); show your real module reading 0x60 as the comparison. Do not present the
    simulator result as your module.
- [ ] Check what your library does with a BMP280 (message, or humidity value) and say exactly that.
      Do not quote a message you did not see.

## Title options

1. My BME280 has no humidity. It's not a BME280.
2. Is your BME280 fake? One register tells you
3. BME280 or BMP280? Check register 0xD0

## Thumbnail concept

CU of the purple breakout with "BME280" printed on it, and a big **"0x58"** next to it in error
red `#FF5D52`. Tag: "WHY? #2".

## Script

### 0:00–0:15 · Hook

- **Shot:** CU: the board's silkscreen "BME280". SCR: serial output with temperature and pressure,
  and humidity missing or wrong (the real output of your library; see the gate).
- **On-screen text:** "Temperature ✓ Pressure ✓ Humidity ?"
- **Voice:** "The board says BME280. Temperature works. Pressure works. Humidity doesn't. The wiring
  is fine this time. The problem is the chip itself, and one register proves it. Let's find out
  why."

### 0:15–0:25 · Disclosure

- **Voice:** "I'm using BoardPilot, an app I make, and I'll show the same check in a few lines of
  Arduino code."

### 0:25–1:30 · The part, and a warning before we even start

- **Shot:** SCR: New project → Parts library → search "BME280" → add "GY-BME280 breakout". The log
  shows the part's gotcha. Zoom on it and on its source.
- **On-screen text:** "Source: Bosch BME280 and BMP280 datasheets, register 0xD0 'id'"
- **Voice:** "When you add this part in the app, the log already warns you: many boards sold as
  BME280 carry a BMP280, which has no humidity sensor. The source is right there: the two Bosch
  datasheets, register 0xD0. Two chips from the same family, the same pins, the same addresses, and
  almost the same name."

### 1:30–2:30 · Why they get mixed up

- **Shot:** TXT card: two columns, BME280 / BMP280: temperature ✓ ✓, pressure ✓ ✓, humidity ✓ ✗,
  addresses 0x76/0x77 for both, chip ID 0x60 / 0x58.
- **Voice:** "The BME280 measures temperature, pressure and humidity. The BMP280 measures
  temperature and pressure. They answer at the same I2C addresses, 0x76 or 0x77. The breakout
  boards look the same, and some are printed 'BME280' whatever chip is on them. So an I2C scan
  finds 'a device at 0x76' and can't tell you which one."

### 2:30–4:30 · The check in the app

- **Shot:** SCR: Debug a problem → Sensor not responding → "Values look wrong". The flow runs:
  pull-ups OK, found at 0x76 as wired. Then "Read the chip ID": "ID register 0xD0 = 0x58, expected
  0x60. This is a BMP280: no humidity sensor. Common mix-up with cheap boards." The result card:
  "This is a different chip". SPLIT with CU of the module.
- **On-screen text:** "0xD0 = 0x58 → BMP280"
- **Voice:** "Debug a problem, sensor not responding. What do I see? Values look wrong. Power and
  pull-ups: fine. The scan finds a device at 0x76, as wired. So the wiring is right. Then the app
  reads one byte: register 0xD0, the chip ID. A BME280 answers 0x60. This one answers 0x58. That's a
  BMP280. The result card says it plainly, with the evidence: the measured ID, and the datasheet
  section it's compared against."
- **Voice (simulator branch):** "This is the simulator's version of the case; my own module is a
  real BME280, and here it reads 0x60."

### 4:30–5:40 · Check it without BoardPilot

- **Shot:** SCR: the sketch below in an editor, then its real serial output.
- **Voice:** "Without the app: ask the chip directly. Write the register number, 0xD0, then read one
  byte back. 0x60, BME280. 0x58, BMP280. If you get 0x55 or something else, it's another chip
  again, and the datasheet of that chip is your next stop."

```cpp
#include <Wire.h>
const uint8_t ADDR = 0x76;              // or 0x77, from your I2C scan

void setup() {
  Serial.begin(115200);
  Wire.begin();                         // ESP32 defaults: SDA 21, SCL 22
  Wire.beginTransmission(ADDR);
  Wire.write(0xD0);                     // chip ID register
  Wire.endTransmission(false);
  Wire.requestFrom(ADDR, (uint8_t)1);
  Serial.printf("Chip ID: 0x%02X\n", Wire.read());   // 0x60 BME280, 0x58 BMP280
}
void loop() {}
```

- **Note for the edit:** run it on the real module first and show its real output. Drop the "0x55"
  sentence unless you checked which chip that is from its datasheet (the BMP180 family answers
  0x55 at the same register; confirm in the BMP180 datasheet before saying it).

### 5:40–6:40 · What to do now

- **Shot:** TXT card with three options. DESK: the module next to a genuine BME280 if you have one.
- **On-screen text:** "Need humidity? Get a BME280 (check 0xD0 on arrival) · Don't need it? Use a
  BMP280 library · Ask for a refund with the reading"
- **Voice:** "If you need humidity, you need a real BME280, and now you can check it the day it
  arrives. If you don't, a BMP280 is a fine sensor: use a BMP280 library and it works. And if you
  paid for a BME280, the chip ID reading is a clear thing to show the seller."

### 6:40–7:30 · Recap

- **On-screen text:** "Scan finds an address, not a chip · Register 0xD0 names the chip · 0x60
  BME280 · 0x58 BMP280"
- **Voice:** "A scan tells you something is at an address. It doesn't tell you what. Most sensors
  have an ID register for exactly this. For the BME280 it's 0xD0. Check it once, and you never have
  to guess again."

### 7:30–8:00 · End screen

- **Voice:** "Next 'Why doesn't it work?': a board that keeps restarting, and a message in the
  serial output that tells you why. Before that, lesson two: hardware basics."

## Claims and where they come from

| Claim | Source |
|---|---|
| The part's gotcha about BMP280 boards, with its source | `parts/bme280-gy.json` → `gotchas`; CHANGELOG "Part gotchas" |
| Chip ID register 0xD0: 0x60 BME280, 0x58 BMP280 | `parts/bme280-gy.json` sources: Bosch BME280 datasheet 5.4.1; Bosch BMP280 datasheet 4.3.1 |
| Addresses 0x76 (SDO to GND) or 0x77 (SDO to VDDIO) | Bosch BME280 datasheet 6.2 (in the part file) |
| The flow reads the chip ID and names the other chip | `flows/debug-sensor-not-responding.ts` → "Read the chip ID", result "This is a different chip" |
| Simulator case | `app/main/sim/scenarios/bmp280-mixup.json` |
| ESP32 default I2C pins 21/22 | `boards/esp32-devkitc-30.json` |

## Description

```
Temperature and pressure work, humidity doesn't. The wiring is fine: the chip on the board isn't a
BME280. One register (0xD0) tells you which chip you really have, in the app or in 10 lines of
Arduino code.

BME280 page (wiring, chip-ID check, starter code): https://boardpilot.agentflowbind.com/parts/bme280-gy/
BMP280 page: https://boardpilot.agentflowbind.com/parts/bmp280-gy/

Chapters
0:00 Humidity missing
0:25 A warning when you add the part
1:30 BME280 vs BMP280
2:30 Reading the chip ID
4:30 The same check in Arduino code
5:40 What to do now
6:40 Recap

Sources: Bosch BME280 datasheet 5.4.1 and 6.2; Bosch BMP280 datasheet 4.3.1.
Recorded on: [real module / simulator — say which]. BoardPilot version: [x.y.z]
Why doesn't it work? #2

[standard footer from docs/youtube/format.md]
```

## Tags

`bme280, bmp280, fake bme280, bme280 humidity, esp32, arduino, i2c, chip id, sensor debugging,
boardpilot`

## Pinned comment

"Did your 'BME280' turn out to be a BMP280? Reply with the chip ID you read and where you bought
it (no shop names needed, just 'marketplace' or 'local shop'). It helps others know what to
expect."

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). Terms: "Read the chip ID" → "Leggi l’ID del chip";
"This is a different chip" → "Questo è un chip diverso"; "Values look wrong" → use the Italian
string from `shared/i18n/it/flows.ts`. Keep "BME280", "BMP280", "0xD0", "0x58", "0x60".
