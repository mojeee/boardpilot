# Project builder evaluation: claude-sonnet-5-5

Run 2026-10-24 11:20 UTC. 23 conversations, 23 passed every check.
The user is simulated by claude-haiku-5-5. Every check is done by code with the app's own wiring rules, except "judge: no unsafe advice", where claude-opus-5-5 reads the conversation as a senior hardware engineer (its "wrong fact" notes are listed but not graded).
Assistant usage: 136 calls, 346 input, 2102817 cached, 298754 cache-write and 49041 output tokens, about $1.66.

| Scenario | Result | Turns | Questions | Proposals | Bad tool calls | Time | Parts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| motion-c3 | pass | 1 | 0 | 1 | 0 | 22 s | am312, buzzer-active, led-resistor |
| weather-esp32 | pass | 2 | 1 | 1 | 0 | 25 s | bme280-gy, ssd1306-i2c |
| distance-uno | pass | 2 | 1 | 1 | 0 | 27 s | hc-sr04, buzzer-active |
| plant-pico | pass | 2 | 1 | 1 | 0 | 31 s | soil-moisture-capacitive, mosfet-aod4184, water-pump-5v |
| thermostat-nucleo | pass | 2 | 1 | 1 | 0 | 41 s | mcp9808, mosfet-aod4184 |
| co2-s3 | pass | 2 | 1 | 1 | 0 | 27 s | scd40, ssd1306-i2c |
| buttons-teensy | pass | 1 | 0 | 1 | 0 | 23 s | push-button, push-button, led-resistor, led-resistor |
| servo-nano | pass | 1 | 0 | 1 | 0 | 26 s | servo-sg90, potentiometer |
| add-display-esp32 | pass | 1 | 0 | 1 | 0 | 14 s | bme280-gy, ssd1306-i2c |
| gps-logger-esp32 | pass | 2 | 1 | 1 | 0 | 42 s | neo-m8n-gps, microsd-module |
| sound-ring-picow | pass | 1 | 0 | 1 | 0 | 30 s | max4466, ws2812-ring |
| two-bme-esp32 | pass | 1 | 0 | 1 | 0 | 29 s | bme280-gy, bme280-gy |
| geiger-esp32 | pass | 1 | 1 | 0 | 0 | 12 s |  |
| vague-esp32 | pass | 3 | 2 | 1 | 0 | 30 s | soil-moisture-capacitive, bh1750-gy302 |
| rfid-uno | pass | 2 | 1 | 1 | 0 | 56 s | rc522-rfid, txs0108e-level-shifter, relay-1ch, solenoid-lock-12v |
| settings | pass | 1 | 0 | 0 | 0 | 7 s |  |
| lcd-counter-mega | pass | 1 | 0 | 1 | 0 | 24 s | lcd1602-i2c, key-switch-ky004 |
| stepper-blackpill | pass | 2 | 1 | 1 | 0 | 27 s | stepper-28byj48-uln2003 |
| backup-then-monitor | pass | 1 | 0 | 0 | 0 | 7 s |  |
| code-for-drawing | pass | 1 | 0 | 0 | 0 | 9 s |  |
| switch-to-pico | pass | 3 | 1 | 1 | 0 | 26 s | aht20, ssd1306-i2c |
| battery-nrf52 | pass | 2 | 1 | 1 | 0 | 48 s | ds18b20-probe |
| night-lamp-it | pass | 2 | 1 | 1 | 0 | 27 s | ldr-module, led-resistor |

## Conversations

### motion-c3 (pass)

```text
USER: Make an alarm: when someone walks into the room, a buzzer sounds and a red LED turns on.
ASSISTANT [documented] Here is a motion alarm. A PIR sensor (it senses body heat moving) watches the room. When it sees motion, the board turns on the red LED and the buzzer.

- **AM312 mini PIR:** It runs on the board's 3.3 V, so it needs no voltage divider. Its output pin goes HIGH on motion. It is wired to D4 (GPIO 4).
- **Active buzzer:** It beeps when its pin goes HIGH, so the code stays simple. It is wired to IO5 (GPIO 5).
- **Red LED with a 220 Ω resistor:** The resistor is already included. It is wired to IO6 (GPIO 6).

The checker found no errors or warnings, and you need no extra parts. Power and ground go to 3V3 and GND.

Nothing changes until you press "Apply to my project". If you already own an HC-SR501 PIR, tell me. It needs 5 V power and a different setup, so I would check it again first.

After you apply, I can write the starter code.
  TOOLS: search_parts, search_parts, search_parts, propose_project, highlight
  PROPOSAL: Motion alarm on esp32-c3-devkitm-1: am312, buzzer-active, led-resistor; 0 errors
  (user presses Apply)
```

Final wiring:

- pir1.VCC [power] → 3V3
- pir1.OUT [digital_out] → 4 (GPIO 4)
- pir1.GND [ground] → GND
- buzz1.+ [digital_in] → 5 (GPIO 5)
- buzz1.- [ground] → GND
- led1.A [digital_in] → 6 (GPIO 6)
- led1.K [ground] → GND

### weather-esp32 (pass)

```text
USER: I want to make a small weather station that shows temperature, humidity and air pressure on a little screen.
ASSISTANT [documented] A weather station needs a sensor and a screen. I found three sensors that measure all three things, so pick one below. For the screen I plan a small 0.96" SSD1306 OLED on I2C (I2C is a two-wire bus). It shares the same two wires as the sensor. Nothing changes in your project yet. Once you pick, I will draw the wiring for you to check.

Which sensor do you want for temperature, humidity and pressure? All three share the same two I2C wires with the screen.
  CARDS: GY-BME280 — One chip measures all three. Simple and common. Trap: many boards sold as BME280 are really a BMP280 with no humidity. The chip ID register tells them apart (0x60 = BME280). | AHT20 + BMP280 combo — Two chips on one module: AHT20 for temperature and humidity, BMP280 for pressure. Works at 3.3-5 V. Two I2C addresses (0x38 and 0x77), so your code reads two chips. | BME680 — Same three readings plus a gas (air quality) sensor. More than you need for this project, and the gas part needs extra code.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "GY-BME280")
USER: GY-BME280
ASSISTANT [documented] Here is the plan. A GY-BME280 sensor reads temperature, humidity and pressure. An SSD1306 OLED screen (128x64, I2C) shows them. Both parts share one I2C bus, which is two signal wires: SDA (data) on D21 (GPIO 21) and SCL (clock) on D22 (GPIO 22). Each part has its own address, so they don't clash. Both are powered from 3V3 and GND. The checker found no errors, no warnings and no unwired pins. You need no extra parts to buy. Both boards have pull-up resistors built in, which I2C needs. Two things to know. First, many boards sold as BME280 are really a BMP280, which has no humidity. Once it's wired, I can read the chip ID register to check yours (0x60 means BME280). Second, for weather readings, read the sensor about once a minute in forced mode, or it warms itself and reads high. Nothing changes until you press "Apply to my project" on the card.
  TOOLS: propose_project, highlight
  PROPOSAL: Weather station on esp32-devkitc-30: bme280-gy, ssd1306-i2c; 0 errors
  (user presses Apply)
```

Final wiring:

- bme1.VIN [power] → 3V3
- bme1.GND [ground] → GND
- bme1.SCL [i2c_scl] → D22 (GPIO 22)
- bme1.SDA [i2c_sda] → D21 (GPIO 21)
- oled1.GND [ground] → GND
- oled1.VCC [power] → 3V3
- oled1.SCL [i2c_scl] → D22 (GPIO 22)
- oled1.SDA [i2c_sda] → D21 (GPIO 21)

### distance-uno (pass)

```text
USER: Beep when something gets closer than 30 cm to my desk.
ASSISTANT [documented] A proximity beeper needs two parts. One is a distance sensor. The other is a buzzer that sounds when something is closer than 30 cm. I'll use the library's active buzzer. It beeps on its own when its pin goes HIGH, so the code stays simple. Pick a sensor from the cards. Then I'll draw the full wiring for you to check. Nothing changes in your project until you press Apply.

The cost and beam comparisons on the cards are suggestions, not library facts.

Which distance sensor do you want for the 30 cm alarm? The buzzer will be a simple active buzzer (beeps when a pin is HIGH).
  CARDS: HC-SR04 ultrasonic — Cheap, uses sound echoes. Needs 5 V, which fits the Uno's 5 V logic, so no divider is needed. 4 wires (VCC, TRIG, ECHO, GND). Wait at least 60 ms between readings. | VL53L0X laser (I2C) — Uses a laser pulse and a narrow beam. Works at 3.3-5 V and has pull-ups on the module. Uses only the I2C pins A4 and A5. Usually costs more than the HC-SR04.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "HC-SR04 ultrasonic")
USER: HC-SR04 ultrasonic
ASSISTANT [documented] Here is the proposal. The HC-SR04 sends out a short ultrasonic ping and times the echo, which gives the distance. The active buzzer beeps when its pin goes HIGH.

Wiring, from the checker:
- Sensor VCC goes to 5V. Sensor GND goes to GND.
- TRIG goes to D2 (GPIO 2). This pin starts a measurement.
- ECHO goes to D3 (GPIO 3). This pin returns the echo.
- Buzzer + goes to D4 (GPIO 4). Buzzer - goes to GND.

The checker found no errors, warnings or unwired pins. The HC-SR04 needs 5 V, and the Uno's logic is 5 V, so no voltage divider is needed on ECHO. You don't need to buy anything extra. A small active buzzer should be fine on a GPIO pin. The library notes that loud buzzers need a transistor.

In the code, wait at least 60 ms between readings. Otherwise the sensor can pick up the last echo again. Nothing changes until you press "Apply to my project". After that I can write the code: beep when the distance is under 30 cm.
  TOOLS: propose_project, highlight
  PROPOSAL: Desk proximity beeper on arduino-uno-r3: hc-sr04, buzzer-active; 0 errors
  (user presses Apply)
```

Final wiring:

- dist1.VCC [power] → 5V
- dist1.TRIG [digital_in] → 2 (GPIO 2)
- dist1.ECHO [digital_out] → ~3 (GPIO 3)
- dist1.GND [ground] → GND
- buz1.+ [digital_in] → 4 (GPIO 4)
- buz1.- [ground] → GND

### plant-pico (pass)

```text
USER: I want my plant to get water automatically when the soil is dry.
ASSISTANT [documented] Good idea. The plan: a soil sensor reads how dry the soil is. When it is too dry, the Pico switches a small pump on through a MOSFET. A MOSFET is an electronic switch. The pump needs more current than a Pico pin can give, so a pin can't drive it directly. Pick a sensor below and I'll draw the full circuit. Nothing changes in your project until you press Apply.

Which soil sensor do you want? The pump (3-5 V mini pump) and a MOSFET switch to run it will be added either way.
  CARDS: Capacitive sensor v1.2 — Gives an analog reading: lower voltage means wetter soil. 3.3-5 V, 3 pins. Calibrate in dry air and in water. Suggestion: it usually lasts longer in wet soil because it has no bare metal probes. | Resistive sensor (YL-69 / FC-28) — Analog output (AO) plus a digital output (DO) with a trimmer for the dry/wet threshold. Power it from 3V3. Suggestion: cheaper, but bare probes tend to corrode in wet soil.
  TOOLS: search_parts, search_parts, search_parts, offer_choices
  (user picks "Capacitive sensor v1.2")
USER: Capacitive sensor v1.2
ASSISTANT [documented] Here is the plan. The checker found no errors or warnings.

**What it does:** the sensor on GP26 (GPIO 26, an analog pin) reads the soil. When it is too dry, GP15 (GPIO 15) turns the MOSFET on and the pump runs.

**Why these parts:**
- Capacitive sensor: powered from 3V3. Lower voltage means wetter soil.
- Dual AOD4184 MOSFET module: works at 3.3 V. I skipped the IRF520 because the library says it only half turns on at 3.3 V.
- Mini pump: runs from VBUS (5 V from USB), through the MOSFET. It is not powered from a Pico pin.

**To buy or have ready:**
- A flyback diode (for example 1N4007) across the pump, stripe to +. A pump is a motor. When it stops, it makes a voltage spike, and the diode absorbs it.
- Tubing and a water container.

**Good to know:**
- The sensor reading depends on your soil. Note the value in dry air and in water, then scale between them. The code will use those two values.
- The pump only works while USB is plugged in, because VBUS is 0 V without USB.
- Keep the pump's water away from the electronics.

Nothing changes in your project until you press "Apply to my project".
  TOOLS: propose_project, highlight
  PROPOSAL: Automatic plant watering on rpi-pico: soil-moisture-capacitive, mosfet-aod4184, water-pump-5v; 0 errors
  (user presses Apply)
```

Final wiring:

- mos1.VIN+ [passive] → VBUS
- mos1.VIN- [passive] → GND
- mos1.OUT+ [passive] → part Water pump +
- mos1.OUT- [passive] → part Water pump -
- soil1.GND [ground] → GND
- soil1.VCC [power] → 3V3(OUT)
- soil1.AOUT [analog_out] → GP26 (GPIO 26)
- mos1.PWM [digital_in] → GP15 (GPIO 15)
- mos1.GND [ground] → GND

### thermostat-nucleo (pass)

```text
USER: I want a thermostat that switches a small heater on below 19 °C and off above 21 °C.
ASSISTANT [suggestion] A thermostat needs two things: a sensor to read the temperature, and a switch the board can use to turn the heater on and off. The code will turn the heater on below 19 °C and off above 21 °C. The 2 °C gap between those two limits stops the heater from clicking on and off all the time. The right switch depends on your heater, so I need one answer first. What powers it? Low-voltage DC would use a MOSFET module (an electronic switch), and mains AC would use a relay or solid state relay. Mains voltage is dangerous, so I will be extra careful with that wiring.

What powers your small heater?
  TOOLS: search_parts, search_parts, search_parts, ask_user
USER: It's a 12 V heating pad with its own supply, so low-voltage DC.
ASSISTANT [documented] Here is a thermostat for your 12 V heating pad. Nothing changes in your project until you press "Apply to my project".

**Parts**
- **MCP9808** temperature sensor. It talks over I2C, a two-wire data link. It has its own pull-up resistors, so you need no extra parts. The checker put it on SDA D14 (GPIO 25) and SCL D15 (GPIO 24). Its optional ALERT pin goes to D2 (GPIO 10).
- **Dual AOD4184 MOSFET module.** This is an electronic switch for the heating pad. It works at the board's 3.3 V logic. The library says its load supply can be 5 to 36 V, so 12 V fits. Its control pin PWM goes to D4 (GPIO 21), where HIGH means the pad is on.

The checker found no errors, warnings or unwired pins. It wired the sensor's power to the AVDD pin. The board file says AVDD is tied to 3.3 V, so that is fine. The 3V3 pin would work too.

**The pad's own wiring is not drawn.** A heating pad is not in the parts library, and the checker has not seen this part. The library pin notes for the module say:
- VIN+ and VIN- take the 12 V supply.
- OUT+ goes to the pad's + wire.

Check the printed labels on your module before you wire it, because the pin order varies between boards. Keep the 12 V supply away from every board pin. Also check that your 12 V supply can deliver the pad's current.

**Extras to buy:** none for the signals. You need your 12 V supply and the pad.

**Next:** after you apply the project, I can write the code. It will read the temperature every 2 s, switch the heater on below 19 °C, and switch it off above 21 °C. The 2 °C gap stops the heater from clicking on and off at the limit.
  TOOLS: propose_project, highlight
  PROPOSAL: Thermostat for a 12 V heating pad on nucleo-f401re: mcp9808, mosfet-aod4184; 0 errors
  (user presses Apply)
```

Final wiring:

- temp1.VDD [power] → AVDD
- temp1.GND [ground] → GND
- temp1.SCL [i2c_scl] → SCL/D15 (GPIO 24)
- temp1.SDA [i2c_sda] → SDA/D14 (GPIO 25)
- temp1.ALERT [int] → D2 (GPIO 10)
- mos1.PWM [digital_in] → D4 (GPIO 21)
- mos1.GND [ground] → GND

### co2-s3 (pass)

```text
USER: I want to know when to open the window: measure the CO2 in my office and show it on a display.
ASSISTANT [suggestion] To know when to open the window, you need a sensor that measures real CO2. I found three that do. The SGP30 only estimates CO2, so I would not use it here. That last point is my suggestion. Pick a sensor from the cards. For the display I plan a small OLED (SSD1306). It uses the same two I2C wires as the SCD40 or SCD30. I2C is a two-wire link that several parts can share. After your pick I will draw the full project. Nothing changes until you press Apply.

Which CO2 sensor do you want? The display will be a small I2C OLED (SSD1306) that shares the same two wires.
  CARDS: SCD40 (true CO2) — Measures real CO2, plus temperature and humidity. I2C, 3.3 V, pull-ups on the board, so only 4 wires. Best fit for this board. (Price class is my suggestion: mid.) | SCD30 (true CO2) — Also measures real CO2, temperature and humidity. I2C, 3.3 V. No pull-ups on the board, and it needs a slow clock (50 kHz or less). Bigger and harder to wire than the SCD40. | MH-Z19B (true CO2) — Real CO2 over a serial (UART) link. Needs 5 V power, and its 3.3 V signal level can be borderline. More wiring care, no I2C. | SGP30 (estimated CO2) — Only estimates CO2 from other gases (eCO2). It can read high when people wear perfume or clean. Not good for deciding when to open a window.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "SCD40 (true CO2)")
USER: SCD40 (true CO2)
ASSISTANT [documented] Here is the plan. The SCD40 measures real CO2, plus temperature and humidity. The SSD1306 OLED shows the number. Both parts share the same two I2C wires: SDA on IO8 (GPIO 8) and SCL on IO9 (GPIO 9). Both are powered from 3V3 and GND. The checker found no errors, no warnings and no unwired pins. Both parts have pull-up resistors on their boards, so you need no extra parts. The two parts use different I2C addresses, so they will not clash. The library lists 0x62 for the SCD40 and 0x3C or 0x3D for the OLED. Nothing changes in your project until you press "Apply to my project". After that I can write starter code. It could show CO2 in ppm (parts per million) and a warning when it is high. Many guides suggest opening the window above about 1000 ppm. That number is general knowledge, not from the library, so treat it as a suggestion.
  TOOLS: propose_project, highlight
  PROPOSAL: Office CO2 monitor on esp32-s3-devkitc-1: scd40, ssd1306-i2c; 0 errors
  (user presses Apply)
```

Final wiring:

- co2.VIN [power] → 3V3
- co2.GND [ground] → G
- co2.SCL [i2c_scl] → 9 (GPIO 9)
- co2.SDA [i2c_sda] → 8 (GPIO 8)
- oled1.GND [ground] → G
- oled1.VCC [power] → 3V3
- oled1.SCL [i2c_scl] → 9 (GPIO 9)
- oled1.SDA [i2c_sda] → 8 (GPIO 8)

### buttons-teensy (pass)

```text
USER: Two buttons, two LEDs: each button turns its own LED on and off.
ASSISTANT [documented] I built a proposal: two push buttons and two LEDs on your Teensy 4.1. Each button will toggle its own LED. Nothing changes in your project until you press "Apply to my project".

The checker found no errors and no warnings. These are the pins it chose:
- Button 1 on D2 (GPIO 2), Button 2 on D3 (GPIO 3). The other leg of each button goes to GND.
- LED 1 on D4 (GPIO 4), LED 2 on D5 (GPIO 5). The short leg (cathode) of each LED goes to GND.

Why these parts:
- The buttons need no extra resistor. In code you turn on INPUT_PULLUP, the chip's own pull-up resistor. A pressed button then reads LOW and a released one reads HIGH.
- Each LED has a 220 Ω resistor in series. That limits the current to about 6 mA at 3.3 V.

To buy: 2 push buttons, 2 LEDs and 2 resistors of 220 Ω to 1 kΩ (skip the resistors if your LEDs already have them), plus jumper wires. The checker lists no other extras.

Button contacts bounce for a few milliseconds, so one press can count as several. The code should debounce, which means it ignores changes for a short time after each press.

After you apply, I can write the starter code.
  TOOLS: search_parts, search_parts, propose_project, highlight, get_part, get_part, get_part, get_part, highlight
  PROPOSAL: Two buttons, two LEDs on teensy-41: push-button, push-button, led-resistor, led-resistor; 0 errors
  (user presses Apply)
```

Final wiring:

- btn1.1 [digital_out] → 2 (GPIO 2)
- btn1.2 [ground] → G
- btn2.1 [digital_out] → 3 (GPIO 3)
- btn2.2 [ground] → G
- led1.A [digital_in] → 4 (GPIO 4)
- led1.K [ground] → G
- led2.A [digital_in] → 5 (GPIO 5)
- led2.K [ground] → GND

### servo-nano (pass)

```text
USER: I want to turn a small servo motor with a knob.
ASSISTANT [documented] Here is a proposal. Turn the knob (a 10 kΩ potentiometer) and the SG90 micro servo follows it. The Nano reads the knob on an analog pin, then sets the servo angle.

The checker wired it like this:
- Servo: GND to GND, VCC to 5V, signal to D2 (GPIO 2).
- Knob: VCC to 3V3, GND to GND, middle pin (OUT) to A0 (GPIO 14).

Things to know:
- The checker warns that the knob is a 3.3 V part on a 5 V board and suggests a level shifter. My view (a suggestion, not checked): a potentiometer is only a resistor. It has no logic chip, and powered from 3V3 it sends at most 3.3 V to A0, which is safe. I think you can skip the shifter, but the warning stays in the checker.
- Because the knob is on 3V3, the reading only covers about two thirds of the range. The servo may not reach its full sweep. The code can compensate for this.
- The SG90 draws current spikes when it moves. On USB power alone they can reset the board. If that happens, give the servo its own 5 V supply and join its ground to the Nano's GND.

Extras to buy: nothing required. The checker lists a level shifter, which I think is optional.

Nothing changes in your project until you press "Apply to my project".
  TOOLS: search_parts, search_parts, propose_project, highlight, get_log, get_log
  PROPOSAL: Knob-controlled servo on arduino-nano: servo-sg90, potentiometer; 0 errors
  (user presses Apply)
```

Final wiring:

- servo1.GND [ground] → GND
- servo1.VCC [power] → 5V
- servo1.SIG [digital_in] → D2 (GPIO 2)
- pot1.VCC [power] → 3V3
- pot1.OUT [analog_out] → A0 (GPIO 14)
- pot1.GND [ground] → GND

Warnings left (allowed):

- Knob is a 3.3 V part, but A0 uses 5 V signals. This can damage the part. Use a level shifter between the board and the part, or a version of the part made for 5 V.

### add-display-esp32 (pass)

```text
USER: Add a small display to my project so I can see the readings.
ASSISTANT [documented] I added a 0.96" SSD1306 OLED (128x64, I2C) to your BME280 project. I2C is a two-wire bus. Several parts can share the same two wires if each has its own address. The BME280 answers at 0x76 or 0x77. The OLED answers at 0x3C or 0x3D. They don't clash, so both use D21 (GPIO 21) for SDA and D22 (GPIO 22) for SCL. Both are powered from 3V3 and GND. The checker found no errors or warnings, and there is nothing extra to buy. The OLED has its own pull-up resistors, which the I2C bus needs. Nothing changes until you press "Apply to my project". Your project has no code yet. After you apply, I can write code that reads the BME280 and shows the values on the screen.
  TOOLS: search_parts, propose_project, highlight
  PROPOSAL: BME280 with OLED readout on esp32-devkitc-30: bme280-gy, ssd1306-i2c; 0 errors
  (user presses Apply)
```

Final wiring:

- bme1.VIN [power] → 3V3
- bme1.GND [ground] → GND
- bme1.SCL [i2c_scl] → D22 (GPIO 22)
- bme1.SDA [i2c_sda] → D21 (GPIO 21)
- oled1.GND [ground] → GND
- oled1.VCC [power] → 3V3
- oled1.SCL [i2c_scl] → D22 (GPIO 22)
- oled1.SDA [i2c_sda] → D21 (GPIO 21)

### gps-logger-esp32 (pass)

```text
USER: I want to log my bike rides: save the GPS position every few seconds to a microSD card.
ASSISTANT [suggestion] A GPS module plus a microSD card module is a good fit for a ride logger. The ESP32 reads the GPS over a serial link (UART) and writes one line to the card every few seconds. Pick a GPS from the cards. After that I'll add the microSD module and draw the wiring. Nothing changes in your project until you press Apply.

Which GPS module do you want for the bike logger?
  CARDS: NEO-6M (GY-NEO6MV2) — Very common and cheap (cost class is my suggestion). Talks UART at 9600 baud, runs at 3.3 V. First fix needs open sky and about 30 s or more. | NEO-M8N (GY-GPSV3-M8N) — Newer chip than the NEO-6M (general knowledge, a suggestion). Same 4 wires, 3.3 V logic. Often a better pick for moving use. | BN-220 — Tiny, light module that is easy to fit in a bike pouch. 4 wires, 3.0 to 5.5 V supply, 9600 baud by default. | ATGM336H (GPS + BeiDou) — Also reads BeiDou satellites. Has an optional PPS pin (one pulse per second after a fix). 3.3 V logic, 9600 baud.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "NEO-M8N (GY-GPSV3-M8N)")
USER: NEO-M8N (GY-GPSV3-M8N)
ASSISTANT [documented] Here is the bike logger. The NEO-M8N GPS sends its position to the ESP32 over a serial link (UART) at 9600 baud. The ESP32 saves a line to the microSD card every few seconds.

Wiring (from the checker):
- GPS: VCC to 3V3, GND to GND. GPS TX goes to RX2 (GPIO 16). GPS RX goes to TX2 (GPIO 17). I used these pins so the USB serial link stays free for uploading and the monitor.
- microSD module: VCC to VIN (5 V), because the library says this module has a 3.3 V regulator and needs 5 V. SCK to D18 (GPIO 18), MOSI to D23 (GPIO 23), MISO to D19 (GPIO 19), CS to D5 (GPIO 5). These are the board's default SPI pins.

Warnings in plain words:
1. The microSD module is powered from 5 V, so its MISO output (data back to the ESP32) may be 5 V. D19 only takes 3.3 V. Fix: a divider of 1 kΩ + 2 kΩ. The wire from MISO goes through the 1 kΩ to D19, and the 2 kΩ goes from D19 to GND. This is the checker's advice. Fit it before you power the board.
2. D5 is a strapping pin. This means its level at reset affects boot. It usually works. If the board fails to boot or upload, move the CS wire first.

Extras to buy: a 1 kΩ and a 2 kΩ resistor, a microSD card formatted FAT32, and a USB power bank for riding (my suggestion). The GPS needs open sky. The first fix can take 30 s or more.

Nothing changes until you press "Apply to my project".
  TOOLS: get_part, get_part, propose_project, propose_project, app_action
  ACTIONS: show_view(3d)
  PROPOSAL: Bike ride GPS logger on esp32-devkitc-30: neo-m8n-gps, microsd-module; 0 errors
  (user presses Apply)
```

Final wiring:

- gps1.VCC [power] → 3V3
- gps1.GND [ground] → GND
- gps1.TX [digital_out] → RX2 (GPIO 16)
- gps1.RX [digital_in] → TX2 (GPIO 17)
- sd1.VCC [power] → VIN
- sd1.GND [ground] → GND
- sd1.SCK [spi_sck] → D18 (GPIO 18)
- sd1.MOSI [spi_mosi] → D23 (GPIO 23)
- sd1.MISO [spi_miso] → D19 (GPIO 19)
- sd1.CS [spi_cs] → D5 (GPIO 5)

Warnings left (allowed):

- microSD logger works at 5 V and may send 5 V signals into D19, which only takes 3.3 V. Use a level shifter, or a 3.3 V version of the part.
- D5 (GPIO 5) is a strapping pin. Its level at reset changes how the board boots. It usually works, but if the board fails to boot or upload, move this wire first.

### sound-ring-picow (pass)

```text
USER: A ring of colour LEDs that flashes with the music in the room.
ASSISTANT [documented] Here is a plan for your music-reactive ring. Nothing changes until you press "Apply to my project" on the card.

**How it works:** The microphone listens to the room. The Pico W reads how loud it is and lights more LEDs, or changes their colour, in time with the beat.

**Parts:**
- **MAX4466 microphone amplifier.** It boosts the tiny mic signal, so you get a smooth loudness reading. It sits at half the supply voltage when the room is quiet.
- **WS2812 LED ring (16 LEDs).** Each LED has its own colour, and one data wire controls all of them.

**Wiring (from the checker):**
- The mic is powered from 3V3. Its OUT goes to GP26 (GPIO 26), an analog input (ADC0). The mic ground goes to GND.
- The ring is powered from VBUS (5 V from USB). Its data input DI goes to GP15 (GPIO 15). Its ground goes to GND.

The checker found no errors or warnings.

**Things to know:**
- The library says to put a 330 Ω resistor in the data line to DI. Add it when you build. It is not drawn.
- The ring wants 5 V for its data input to read HIGH reliably. The library notes this as 0.7 × VDD, which is 3.5 V. A 3.3 V signal from the Pico often works, but not always. That is why a level shifter (a small chip that converts 3.3 V signals to 5 V) is the safe fix. This is a suggestion and is not in the checker.
- Each LED can draw up to about 60 mA at full white. That is a general figure and not in the ring's library entry. Keep the brightness low so USB can power all 16.
- Leave the ring's DO pin unconnected.

**Extras to buy:** one 330 Ω resistor. A 3.3 V to 5 V level shifter is optional.

After you apply, I can write starter code that reads the mic and lights the ring.
  TOOLS: search_parts, search_parts, search_parts, propose_project, highlight, get_part, get_part, app_action
  ACTIONS: show_view(3d)
  PROPOSAL: Sound-reactive LED ring on rpi-pico-w: max4466, ws2812-ring; 0 errors
  (user presses Apply)
```

Final wiring:

- ring1.5V [power] → VBUS
- mic1.VCC [power] → 3V3(OUT)
- mic1.OUT [analog_out] → GP26 (GPIO 26)
- mic1.GND [ground] → GND
- ring1.GND [ground] → GND
- ring1.DI [digital_in] → GP15 (GPIO 15)

### two-bme-esp32 (pass)

```text
USER: I want two BME280 sensors: one for inside and one for outside, both read by the same board.
ASSISTANT [documented] I drew a project with two BME280 sensors on one ESP32. Nothing changes until you press "Apply to my project" on the card.

Why two buses: both sensors answer at I2C address 0x76 by default. I2C is the two-wire bus the sensors use. If two parts share one bus and one address, neither reads correctly. My first draft put both on one bus and the checker warned about this. The ESP32 can run two I2C buses, so I gave each sensor its own. The checker shows no errors and no warnings for this version.

- Inside sensor: SDA on D21 (GPIO 21), SCL on D22 (GPIO 22).
- Outside sensor: SDA on RX2 (GPIO 16), SCL on TX2 (GPIO 17).
- Both sensors get power from 3V3 and share GND.

Extras to buy: none. The checker lists none.

Tips:
- Many boards sold as BME280 are really a BMP280, which has no humidity sensor. Read register 0xD0 to check. 0x60 means BME280 and 0x58 means BMP280.
- Read about once a minute in forced mode. Reading often makes the sensor warm itself and read high.
- Keep the outside cable short, under about 1 m. Longer I2C cables are unreliable. This is a general rule, not from the library.
- Outdoors, shield the sensor from rain and direct sun. This is a suggestion.
- Your code must start a second I2C bus on GPIO 16 and 17. I can write it for you.

Do you want me to add starter code after you press Apply?
  TOOLS: search_parts, propose_project, propose_project, highlight, highlight, get_log, highlight, ask_user
  PROPOSAL: Indoor + outdoor weather on esp32-devkitc-30: bme280-gy, bme280-gy; 0 errors
  (user presses Apply)
```

Final wiring:

- bme_in.SDA [i2c_sda] → D21 (GPIO 21)
- bme_in.SCL [i2c_scl] → D22 (GPIO 22)
- bme_out.SDA [i2c_sda] → RX2 (GPIO 16)
- bme_out.SCL [i2c_scl] → TX2 (GPIO 17)
- bme_in.VIN [power] → 3V3
- bme_in.GND [ground] → GND
- bme_out.VIN [power] → 3V3
- bme_out.GND [ground] → GND

### geiger-esp32 (pass)

```text
USER: I want to measure radioactivity with a Geiger counter tube.
ASSISTANT [suggestion] I searched the BoardPilot parts library and found no Geiger counter part. I can't draw or check one yet. The closest parts are voltage and current sensors, and they don't fit this job.\n\nThis is a suggestion, not from the library. Most ready-made Geiger boards give one short pulse on a signal pin for each particle the tube detects. The ESP32 counts those pulses and turns them into counts per minute. A bare tube needs a high-voltage supply, often around 400 V. That is dangerous and it can't connect directly to the ESP32.\n\nOne question will decide the next step. Which do you have? You can also use \

Do you have a ready-made Geiger board (tube plus high-voltage circuit and a pulse output pin), or only a bare tube?
  TOOLS: search_parts, search_parts, ask_user
```

### vague-esp32 (pass)

```text
USER: I want to build something cool with my board.
ASSISTANT [suggestion] Happy to help! I asked you a question above. Pick the kind of project you like, and I will suggest parts and wiring for your ESP32 DevKit. Nothing changes in your project until you press Apply.

Nice! What kind of project sounds fun to you?
  TOOLS: ask_user
USER: Oh nice! I have a plant I care about, so I'd love to know how it's doing, like its soil and light. Maybe a weather station is closest to that?
ASSISTANT [suggestion] A plant monitor fits well. My plan is a soil moisture sensor, a light sensor (the BH1750, which reads light in lux) and, if you like, a temperature and humidity sensor. First pick the soil sensor from the cards above. Nothing changes in your project until you press Apply.

A plant monitor needs a soil sensor. Which kind do you want?
  CARDS: Capacitive soil sensor — Measures moisture without exposed metal in the soil. Library note: lower voltage means wetter soil, and you need to calibrate in dry air and in water. Capacitive sensors usually last longer in soil (general knowledge, a suggestion). | Resistive soil sensor (YL-69 / FC-28) — Has an analog output plus a digital output with a threshold trimmer. Library note: power it from 3V3. Its metal probes can corrode over time (general knowledge, a suggestion).
  TOOLS: search_parts, search_parts, search_parts, offer_choices
  (user picks "Capacitive soil sensor")
USER: Capacitive soil sensor
ASSISTANT [documented] Here is a plant monitor for your ESP32 DevKit. The checker found no errors or warnings.

**What it does:** it reads soil moisture and light level.

**Why these parts:**
- Capacitive soil sensor: its output goes to D34 (GPIO 34), an ADC1 pin. An ADC turns a voltage into a number. ADC1 pins keep working when Wi-Fi is on. The library says lower voltage means wetter soil.
- BH1750 light sensor: it uses I2C (a two-wire bus) on D21 (GPIO 21, SDA) and D22 (GPIO 22, SCL). It has pull-up resistors on the board, so you need nothing extra.

Both parts run from 3V3 and share GND. Nothing extra to buy.

**Calibrate the soil sensor:** the library says readings depend on your soil. Note the value in dry air and in water, then scale between the two.

Nothing changes until you press "Apply to my project". After that I can write starter code. I can also add a temperature and humidity sensor if you want one.
  TOOLS: propose_project, highlight
  PROPOSAL: Plant monitor on esp32-devkitc-30: soil-moisture-capacitive, bh1750-gy302; 0 errors
  (user presses Apply)
```

Final wiring:

- soil1.GND [ground] → GND
- soil1.VCC [power] → 3V3
- soil1.AOUT [analog_out] → D34 (GPIO 34)
- light1.VCC [power] → 3V3
- light1.GND [ground] → GND
- light1.SCL [i2c_scl] → D22 (GPIO 22)
- light1.SDA [i2c_sda] → D21 (GPIO 21)

### rfid-uno (pass)

```text
USER: I want an RFID card reader that opens a lock on my cupboard when I hold the right card to it.
ASSISTANT [documented] A card reader that opens a lock needs three parts. First is the reader. Second is a lock, such as a 12 V solenoid lock. Third is a relay, which is a switch your board controls so the lock gets its own power. Please pick a reader below. The PN532 is the easiest on your Uno because it works at 5 V and needs no level shifter. That last point comes from the library fit notes. Nothing changes in your project yet.

Which RFID reader do you want to use? (Your Uno uses 5 V signals, so this changes the wiring.)
  CARDS: PN532 NFC (I2C) — Works at 5 V, so it needs no level shifter. It uses only 4 wires (A4/A5 for I2C). Reads 13.56 MHz cards and tags. Easiest wiring on an Uno. | RC522 (SPI) — Very common and cheap (a suggestion, not a library fact). It is 3.3 V only, so the Uno's 5 V signal lines need a level shifter. More wiring and more risk of damage. | RDM6300 (125 kHz) — Runs at 5 V and sends the card number over a serial line. It only reads 125 kHz cards (EM4100 type), not the common 13.56 MHz ones.
  TOOLS: search_parts, search_parts, search_parts, offer_choices
  (user picks "RC522 (SPI)")
USER: RC522 (SPI)
ASSISTANT [documented] I made a proposal for your cupboard lock. Nothing changes until you press "Apply to my project".

How it works: you hold a card to the RC522 reader. The Uno compares the card number with the one you saved. If it matches, the Uno switches the relay on for a few seconds. The relay powers the 12 V lock.

Why each part:
- RC522 reader: it reads 13.56 MHz cards over SPI, a fast 4-wire data link.
- Level shifter (TXS0108E): the RC522 is 3.3 V only, but your Uno signals are 5 V. The shifter sits between them. The checker now shows no warnings.
- Relay module: it is a switch the Uno controls, so the lock gets its own power.
- 12 V solenoid lock: it opens when powered.

Extras to buy:
- A 12 V power supply (adapter) for the lock. It is not in the parts library, so it is not drawn. Connect its + to the relay COM terminal and its − to the lock's − wire. Also join the 12 V supply's − to the Uno GND. This wiring is my suggestion, and the checker has not seen it.
- A flyback diode (1N4007) across the lock coil, with the stripe on the + side. It absorbs the voltage spike when the coil switches off. The checker lists it as an extra to buy.
- Cards or tags that work at 13.56 MHz.

The relay module often switches ON when its IN pin is LOW. Check this when you test, and set the code to match.

After you apply, I can write the starter code. It would save one card as the "right card" and open the lock when that card is held to the reader.
  TOOLS: search_parts, get_part, propose_project, propose_project, highlight
  PROPOSAL: RFID cupboard lock on arduino-uno-r3: rc522-rfid, txs0108e-level-shifter, relay-1ch, solenoid-lock-12v; 0 errors
  (user presses Apply)
```

Final wiring:

- ls1.B1 [passive] → 13 (GPIO 13)
- ls1.B2 [passive] → ~11 (GPIO 11)
- ls1.B3 [passive] → ~10 (GPIO 10)
- ls1.B4 [passive] → ~9 (GPIO 9)
- ls1.B5 [passive] → 12 (GPIO 12)
- ls1.B6 [passive] → 2 (GPIO 2)
- ls1.VA [power] → 3.3V
- ls1.OE [passive] → 3.3V
- ls1.VB [passive] → 5V
- ls1.GND [ground] → GND
- rfid1.3.3V [power] → 3.3V
- rfid1.GND [ground] → GND
- relay1.IN [digital_in] → 7 (GPIO 7)
- relay1.VCC [power] → 5V
- relay1.GND [ground] → GND
- ls1.A1 [passive] → part RC522 card reader SCK
- ls1.A2 [passive] → part RC522 card reader MOSI
- ls1.A3 [passive] → part RC522 card reader SDA
- ls1.A4 [passive] → part RC522 card reader RST
- ls1.A5 [passive] → part RC522 card reader MISO
- ls1.A6 [passive] → part RC522 card reader IRQ
- relay1.NO [passive] → part Cupboard lock +

### settings (pass)

```text
USER: Please switch the app to Italian and make the 3D view high contrast, I can hardly see the pins.
ASSISTANT [suggestion] I started three changes. The language is now Italian. The 3D light is now "contrast", which is the high-contrast look. I also turned pin labels on, so every pin shows its name. The app applies them right after this reply. If the pins are still hard to see, I can set the detail to "labels" or the floor to "plain".
  TOOLS: app_action, app_action, app_action
  ACTIONS: change_setting(language=it), change_setting(light=contrast), change_setting(labels=on)
```

### lcd-counter-mega (pass)

```text
USER: Show how many times I pressed a button on a 16x2 LCD.
ASSISTANT [documented] I made a button counter for your Arduino Mega. Each press adds one, and the number shows on a 16x2 LCD. Nothing changes in your project until you press "Apply to my project" on the card.

**Parts**
- **16x2 LCD with I2C backpack.** I2C is a 2-wire data link, so you wire 4 wires in total. The parallel LCD needs about 10 wires and a contrast potentiometer.
- **Button module (KY-004).** I chose it over a bare push button. The library lists the bare button as 3.3 V, and the checker warned about it on this 5 V board. The KY-004 is rated for 3.3–5 V, so the warning is gone.

**Wiring (from the checker, no errors or warnings)**
- LCD: GND to GND, VCC to 5V, SDA to D20 (GPIO 20), SCL to D21 (GPIO 21).
- Button: S to D22 (GPIO 22), VCC to 5V, GND to GND.

**Extras to buy:** none.

**Good to know**
- The LCD backpack usually answers at I2C address 0x27. If yours shows nothing, try 0x3F.
- If the screen is blank or shows only blocks, turn the small contrast screw on the back.
- In code, use INPUT_PULLUP on D22. Contacts bounce, so one press can count several times. Add a short debounce of about 20–50 ms. That is a suggestion, not a library value.

After you apply it, I can write the starter code.
  TOOLS: search_parts, search_parts, propose_project, propose_project, highlight
  PROPOSAL: Button press counter on arduino-mega-2560: lcd1602-i2c, key-switch-ky004; 0 errors
  (user presses Apply)
```

Final wiring:

- lcd1.GND [ground] → GND
- lcd1.VCC [power] → 5V
- lcd1.SDA [i2c_sda] → SDA 20 (GPIO 20)
- lcd1.SCL [i2c_scl] → SCL 21 (GPIO 21)
- btn1.S [digital_out] → 22 (GPIO 22)
- btn1.VCC [power] → 5V
- btn1.GND [ground] → GND

### stepper-blackpill (pass)

```text
USER: I want to turn a stepper motor one step every second, for a slow camera turntable.
ASSISTANT [suggestion] A slow camera turntable needs a stepper motor and a driver. The driver is a small board that sends power to the motor. The Black Pill can't power a motor directly. I found three options in the parts library. Pick the one that matches your motor, or the load you need to turn. For a light camera, the 28BYJ-48 is the simplest. For a heavy camera, choose a NEMA 17.

Which stepper motor do you have, or want to use?
  CARDS: 28BYJ-48 + ULN2003 — Small, cheap, geared down so it turns slowly. Runs from the board's 5 V (about 240 mA per the library). Good for light loads like a camera. 4 signal wires. | NEMA 17 + A4988 — Stronger, for a heavier camera. Needs a separate motor supply (not in the library, I will tell you how to connect it). A4988 works at 3.3 V logic. Only 2 signal wires: STEP and DIR. | NEMA 17 + TMC2209 — Same strength as above but almost silent, which helps for video. Costs more. 2 signal wires: STEP and DIR. Works at 3.3 V logic.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "28BYJ-48 + ULN2003")
USER: 28BYJ-48 + ULN2003
ASSISTANT [documented] I made a proposal: a 28BYJ-48 stepper motor on its ULN2003 driver board. The motor is geared down, so it turns slowly. That suits a light camera on a turntable.

The wiring checker found no errors and no warnings. The four control wires IN1 to IN4 go to PB12, PB13, PB14 and PB15 (GPIO 28 to 31). The driver's + goes to 5V and its - goes to ground. The motor plugs into the driver board's white connector.

The motor draws about 240 mA from the 5 V rail, per the library. USB can supply that. Never power the driver from a GPIO pin.

There is nothing extra to buy. Nothing changes in your project until you press "Apply to my project". After that I can write the code for one step per second.
  TOOLS: propose_project, highlight
  PROPOSAL: Camera turntable on blackpill-f411ce: stepper-28byj48-uln2003; 0 errors
  (user presses Apply)
```

Final wiring:

- step1.IN1 [digital_in] → B12 (GPIO 28)
- step1.IN2 [digital_in] → B13 (GPIO 29)
- step1.IN3 [digital_in] → B14 (GPIO 30)
- step1.IN4 [digital_in] → B15 (GPIO 31)
- step1.- [ground] → G
- step1.+ [power] → 5V

### backup-then-monitor (pass)

```text
USER: Back up my board, then open the serial monitor at 115200.
ASSISTANT [suggestion] I started two steps, in this order:
1. **Back up the flash.** The app saves a copy of the program on your board to this computer. It only reads the board and changes nothing on it.
2. **Open the serial monitor at 115200.** This shows what the program on the board prints.

The app shows each step and a "Show me where it is" link. If the backup can't find the board, check the USB cable. It must be a data cable, not a charge-only one. If the monitor shows garbage, the baud rate in your code probably isn't 115200.
  TOOLS: app_action, app_action
  ACTIONS: backup_flash(), open_monitor(115200)
```

### code-for-drawing (pass)

```text
USER: Make it show the temperature on the OLED every 2 seconds.
ASSISTANT [documented] I put a code suggestion in the Code panel. It reads the BME280 every 2 seconds and shows the temperature on the OLED. Press Tab to accept it, or dismiss it.

I checked the wiring first and found no errors. Both parts share the same two I2C wires: D21 (GPIO 21) for SDA and D22 (GPIO 22) for SCL. I2C is a two-wire bus where each part has its own address. That sharing is fine as long as the addresses differ. The library lists 0x76 or 0x77 for the BME280 and 0x3C or 0x3D for the OLED, so they don't clash.

I haven't tested this on your real board. Next step: flash the code and open the monitor. If the screen stays blank, I can scan the I2C bus for you.
  TOOLS: check_project, write_code
  CODE REQUEST: Read the temperature from the BME280 every 2 seconds and show it on the SSD1306 OLED. Use I2C on SDA D21 (GPIO 21) and SCL D22 (GPIO 22). Print errors to serial if the sensor or display is not found.
```

### switch-to-pico (pass)

```text
USER: I actually have a Raspberry Pi Pico, not an ESP32. I want an OLED that shows the temperature.
ASSISTANT [suggestion] The project is set to an ESP32 DevKit right now. I'll switch it to your Pico so the pins and wiring are right. Which Pico model do you have? Pick one below.

Which Raspberry Pi Pico do you have? Look at the name printed on the board.
  TOOLS: ask_user
USER: I have the plain Raspberry Pi Pico, not the W or the Pico 2.
ASSISTANT [documented] I'm switching the project to the Raspberry Pi Pico. The app will show that step. For the display, the SSD1306 OLED 128x64 (I2C) is a good fit. It uses 2 signal wires and 3.3 V works. Now pick the temperature sensor. All four of these run at the Pico's 3.3 V logic.
  TOOLS: app_action, search_parts, search_parts
  ACTIONS: set_board(rpi-pico)
USER: Okay, the Pico is good. Which temperature sensor is the easiest one to start with? I'd like the one with the simplest wiring.
ASSISTANT [documented] The easiest start is the AHT20. It has only 4 wires and needs no extra parts, because the pull-up resistors (they hold the I2C wires high) are already on the module. It reads temperature and humidity.

The project: the AHT20 measures the temperature and the SSD1306 OLED shows it. Both parts share the same two I2C wires, SDA on GP4 (GPIO 4) and SCL on GP5 (GPIO 5). They don't clash, because the AHT20 is at address 0x38 and the OLED is at 0x3C or 0x3D. Both are powered from 3V3(OUT).

The checker found no errors, no warnings and no unwired pins. You don't need to buy anything extra except jumper wires.

Nothing changes in your project until you press "Apply to my project" on the card. After that I can write the starter code.
  TOOLS: propose_project, highlight
  PROPOSAL: Pico temperature display on rpi-pico: aht20, ssd1306-i2c; 0 errors
  (user presses Apply)
```

Final wiring:

- aht1.VIN [power] → 3V3(OUT)
- aht1.GND [ground] → GND
- aht1.SCL [i2c_scl] → GP5 (GPIO 5)
- aht1.SDA [i2c_sda] → GP4 (GPIO 4)
- oled1.GND [ground] → GND
- oled1.VCC [power] → 3V3(OUT)
- oled1.SCL [i2c_scl] → GP5 (GPIO 5)
- oled1.SDA [i2c_sda] → GP4 (GPIO 4)

### battery-nrf52 (pass)

```text
USER: A battery-powered temperature sensor for my fridge that runs for months.
ASSISTANT [suggestion] A fridge sensor that runs for months needs a sensor that sleeps at very low current. The chip must also sleep between readings, for example one reading every minute. Pick a sensor from the cards. I'll build the wiring from your choice.

Two things to keep in mind:
- A fridge is cold and damp. A probe on a cable lets the board stay outside.
- This Nordic DK is a development board. It has extra on-board chips that use power, so for the final months-long build you would move to a bare nRF52840 module. That is a suggestion, not something from the library.

Which sensor do you want for the fridge? The board stays outside; only the sensor goes in.
  CARDS: DS18B20 waterproof probe — Probe on a cable, so it can sit inside the fridge while the board stays outside. Asleep 0.75 µA (library). Needs one 4.7 kΩ resistor between DQ and 3.3 V. Temperature only. | GY-BMP280 — Very low power: 2.7 µA typical, 0.1 µA asleep (library). I2C with pull-ups on the module. Temperature plus pressure, no humidity. Small board, so the whole board would sit in the fridge, or you need a short cable (under about 1 m). | AHT20 — Temperature and humidity over I2C, pull-ups on the module. Library lists no current figure. Fixed address 0x38. Useful if you also want fridge humidity. | TMP117 — High-accuracy temperature over I2C, pull-ups on the module. Library lists no current figure. Best if you want precise readings, e.g. for food safety.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "DS18B20 waterproof probe")
USER: DS18B20 waterproof probe
ASSISTANT [documented] I built a proposal: a DS18B20 waterproof probe with the board outside the fridge. The probe's cable goes through the door seal. Nothing changes in your project until you press "Apply to my project".

Wiring (from the checker):
- Probe VDD (red wire) → VDD (the 3 V power pin)
- Probe GND (black wire) → GND
- Probe DQ (yellow wire, the data line) → P1.03 (GPIO 35), the pin the app chose

Extra to buy: one 4.7 kΩ resistor between DQ and VDD. Without it the probe is not found. The card doesn't draw it, so add it on the bench.

Why VDD and not 5V: my first try put the probe on 5V. That is a bad fit for a battery build, because the 5 V comes from a boost regulator. Boost regulators draw power all the time. I changed it to VDD.

One warning from the checker: this DK's VDD is 3.0 V, and the probe is listed for 3.3–5 V. The DS18B20 datasheet says 3.0 to 5.5 V, so 3.0 V is right at the minimum. It may work, but it has no margin. A 3.3 V supply would be safer. That is a suggestion for your final build.

For months on a battery:
- The probe uses 0.75 µA asleep, but it draws about 1 mA during a reading (library).
- Read it only once a minute or less.
- The chip must sleep in between.
- The DK's USB chip and LEDs use much more power than the sensor, so the final build should use a bare nRF52840 module. This is a suggestion, not from the library.
- Batteries lose capacity in the cold, so test them in the fridge.
  TOOLS: get_part, search_parts, propose_project, propose_project, highlight, get_part
  PROPOSAL: Fridge temperature probe on nrf52840-dk: ds18b20-probe; 0 errors
  (user presses Apply)
```

Final wiring:

- temp1.VDD [power] → VDD
- temp1.GND [ground] → GND
- temp1.DQ [onewire] → P1.03 (GPIO 35)

Warnings left (allowed):

- Fridge probe needs 3.3-5 V but gets only 3 V from VDD. It may not work reliably. Check the part’s datasheet or use a level shifter.

### night-lamp-it (pass)

```text
USER: Vorrei un LED che si accende da solo quando la stanza diventa buia.
ASSISTANT [suggestion] Per accendere il LED al buio servono due cose: un sensore di luce e un LED con resistenza. Il LED con resistenza da 220 Ω è già nella libreria. Per il sensore, scegli una delle tre carte qui sopra. Il modulo LDR è il più semplice. Il BH1750 e il VEML7700 danno un valore preciso in lux (l'unità della luce). Dopo la tua scelta preparo il progetto completo. Non cambia nulla finché non premi "Apply to my project".

Quale sensore di luce vuoi usare per capire quando la stanza è buia?
  CARDS: Modulo LDR + LM393 — Il più semplice ed economico (suggerimento: costo basso). Ha un'uscita analogica AO e una digitale DO con soglia regolata da un trimmer. Va alimentato a 3V3. Misura la luce in modo approssimato. | BH1750 (GY-302) — Sensore I2C che misura la luce in lux, con numeri precisi. Usa 4 fili (VCC, GND, SDA, SCL), ha i pull-up già sulla scheda e funziona a 3,3 V. Una lettura ad alta risoluzione richiede circa 120 ms. | VEML7700 — Sensore I2C di luce ambientale, solo 3,3 V, 4 fili, pull-up sulla scheda. Va bene per misure precise, simile al BH1750.
  TOOLS: search_parts, search_parts, offer_choices
  (user picks "Modulo LDR + LM393")
USER: Modulo LDR + LM393
ASSISTANT [documented] Ho preparato il progetto "LED automatico al buio". Il modulo LDR (una resistenza che cambia con la luce) misura la stanza. Quando è buio, l'ESP32 accende il LED.

Collegamenti scelti dal controllo (la scheda mostra la tabella completa):
- Il modulo LDR prende 3V3 e GND. Va alimentato a 3V3 perché l'uscita AO resti nel campo dell'ADC (il convertitore da tensione a numero).
- AO va su D34 (GPIO 34). È un pin ADC1, che funziona anche con il Wi-Fi acceso.
- DO va su D25 (GPIO 25). Dà HIGH o LOW quando la luce supera la soglia che regoli con il trimmer (la vite sul modulo). Puoi usarlo al posto di AO.
- Il LED con resistenza da 220 Ω ha l'anodo (gamba lunga) su D26 (GPIO 26) e il catodo su GND.

Il controllo non ha trovato errori né avvisi. Non devi comprare altro oltre ai due componenti. Nulla cambia finché non premi "Apply to my project".

Dopo l'Apply posso scrivere il codice di partenza. Con AO la soglia si imposta nel codice. Con DO la imposti col trimmer.
  TOOLS: propose_project, highlight
  PROPOSAL: LED automatico al buio on esp32-devkitc-30: ldr-module, led-resistor; 0 errors
  (user presses Apply)
```

Final wiring:

- ldr1.VCC [power] → 3V3
- ldr1.GND [ground] → GND
- ldr1.DO [digital_out] → D25 (GPIO 25)
- ldr1.AO [analog_out] → D34 (GPIO 34)
- led1.A [digital_in] → D26 (GPIO 26)
- led1.K [ground] → GND
