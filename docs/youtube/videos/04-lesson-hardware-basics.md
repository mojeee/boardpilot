# Video 4 · "Embedded for software developers" Lesson 2 · Hardware basics

- **Series:** Embedded for software developers (Lesson 2)
- **Length:** about 11 minutes
- **On the desk:** Raspberry Pi Pico, breadboard, a red LED, resistors (150 Ω, 330 Ω, 1 kΩ,
  2 kΩ or 2.2 kΩ), a multimeter if you have one
- **App:** Learn → "Hardware basics for software developers" (calculators: LED resistor, voltage
  divider, I2C pull-up; "Show on the 3D board" with an LED on the Pico's GP15). New project with an
  HC-SR04 on the ESP32 for the 5 V check and the shopping list.
- **Publish:** week 7

## Before recording

- [ ] Released build with the lesson, the three calculators and the shopping list (CHANGELOG
      "Unreleased" today; wait for the release).
- [ ] Set each calculator to the values in the script and **read the numbers from the screen**.
      The numbers in the script are the arithmetic the calculators use; if the screen shows
      something else, the screen wins and the script changes.
- [ ] Desk: light the LED on the Pico with a plain blink sketch (Arduino IDE or MicroPython).
      This video does not use the diagnostic agent on the Pico.
- [ ] If you measure with a multimeter, show the meter and say the reading as it is.

## Title options

1. Hardware basics for software developers: V = I × R, and how not to burn a pin
2. Why an LED needs a resistor (for programmers)
3. 5 V vs 3.3 V, pull-ups and dividers: the hardware you skipped

## Thumbnail concept

DESK: a red LED lit on a breadboard next to the Pico, a resistor large in the foreground. Text:
**"V = I × R"**. Tag: "LESSON 2".

## Script

### 0:00–0:15 · Hook

- **Shot:** DESK: the LED on the Pico, lit. Then the same LED with no resistor in a still photo
  (do not actually do this; a TXT card with "no resistor → too much current" is enough).
- **On-screen text:** "Code can be undone. A burnt pin can't."
- **Voice:** "You can undo code. You can't undo a burnt pin. Three numbers explain almost every
  hardware mistake a beginner makes: voltage, current and resistance. Ten minutes, and you'll know
  how big a resistor must be, and why a 5-volt sensor can hurt a 3.3-volt board."

### 0:15–0:25 · Series line

- **Voice:** "Lesson two of Embedded for software developers, following the Learn screen in
  BoardPilot, an app I make."

### 0:25–1:45 · Voltage, current, resistance

- **Shot:** SCR: the lesson's table (quantity, what it is, unit, water picture).
- **On-screen text:** "Voltage = pressure · Current = flow · Resistance = narrow pipe"
- **Voice:** "Voltage is the push that moves electrons: think water pressure. Current is how much
  flows, litres per second; in our world, milliamps. Resistance is how hard it is to flow: a narrow
  pipe. Ohm's law ties them together: V equals I times R. Know two, get the third. And power, the
  heat, is V times I."

### 1:45–4:00 · An LED always needs a resistor

- **Shot:** SCR: the LED resistor calculator. Set red, 3.3 V, 10 mA. Then 5 V. Then blue at 3.3 V.
- **On-screen text:** "(3.3 − 2.0) V / 10 mA = 130 Ω → buy 150 Ω → 8.7 mA"
- **Voice:** "An LED drops an almost fixed voltage: about 2 volts for red, about 3 for blue and
  white. Whatever is left must be taken by a resistor, or the current rises until something dies.
  Here's the calculator. A red LED on a 3.3-volt pin at 10 milliamps: 3.3 minus 2 is 1.3 volts, over
  10 milliamps, 130 ohms. You can't buy 130, so it picks the next standard value up, 150 ohms, and
  shows the real current: 8.7 milliamps. The heat in the resistor: about 11 milliwatts, nothing.
  Same LED on 5 volts: 330 ohms. Now watch a blue LED on 3.3 volts: only 0.2 volts left for the
  resistor. It works, but small differences between LEDs change the current a lot. That's why blue
  LEDs look dim or uneven on 3.3 volts."
- **Note:** say the numbers the screen shows (see "Before recording").

### 4:00–4:50 · On the 3D board, and on the desk

- **Shot:** SCR: "Show on the 3D board": the Pico with the LED on GP15 and its resistor. SPLIT with
  DESK: the same circuit on the breadboard, lit.
- **Voice:** "Here it is on a Pico in 3D: GP15, through the resistor, into the LED, back to ground.
  And the real one. A GPIO pin gives a few milliamps comfortably. Motors, relays, LED strips and
  servos need a transistor or a driver and their own supply, with the grounds connected."

### 4:50–6:20 · Pull-ups

- **Shot:** SCR: the pull-up widget. Set 3.3 V, 100 pF, standard mode, then fast mode.
- **On-screen text:** "Floating input = random values"
- **Voice:** "An input connected to nothing floats: it reads random values. A pull-up resistor to
  3.3 volts makes it read HIGH until a button pulls it to ground. Chips have weak internal
  pull-ups. I2C needs real ones, because the line must rise fast enough. The calculator uses the
  NXP I2C specification. At 3.3 volts the lowest allowed value is about 970 ohms: below that, chips
  can't pull the line low. The highest depends on speed and wire capacitance: at 100 picofarads,
  about 11.8 kilohms at 100 kilohertz, but only about 3.5 kilohms at 400. That's why a slow bus
  works with the module's pull-ups, and the same wiring fails at fast mode."

### 6:20–7:40 · Voltage dividers

- **Shot:** SCR: the divider calculator: 5 V in, R1 1 kΩ, R2 2 kΩ. Then "R2 for 3.3 V out".
- **On-screen text:** "5 V × 2k / (1k + 2k) = 3.33 V"
- **Voice:** "Two resistors in series split a voltage in the ratio of their values. Five volts in,
  1 kilohm on top, 2 kilohms below: 3.33 volts out. That's how you read a 5-volt signal on a 3.3-volt
  pin, one direction only. For I2C, which goes both ways, you need a level shifter instead."

### 7:40–9:10 · 5 V and 3.3 V do not mix: let the app check

- **Shot:** SCR: New project on the ESP32. Add an HC-SR04. The log shows its gotcha (ECHO is 5 V on
  a 3.3 V board). Wire ECHO to a pin: the wiring rule warning appears on the pin in 3D. Open the
  shopping list: the 1 kΩ + 2 kΩ divider is listed with its reason.
- **On-screen text:** "ESP32, Pico, STM32, nRF52: 3.3 V pins"
- **Voice:** "The ESP32, the Pico, the STM32 and the nRF52 take at most 3.3 volts on their pins. A
  few STM32 pins tolerate 5, and the board file says which. Here's a classic: the HC-SR04 distance
  sensor. Its echo pin outputs 5 volts. Add it in the app and the log warns you straight away. Wire
  it to a pin and the wiring checker marks it. And the shopping list adds the divider you need: 1
  kilohm and 2 kilohms, with the reason written next to it. Always connect the grounds, too: a
  voltage only means something against a shared ground."

### 9:10–10:00 · Reading a datasheet's first page

- **Shot:** SCR: the lesson's schematic and datasheet list.
- **Voice:** "Last: reading a datasheet. On the first page, find three things: the supply voltage
  range, the interface, and the I2C address. Then find 'Absolute maximum ratings'. Never go beyond
  those, not even for a moment."

### 10:00–10:40 · Interview questions and the power-on check

- **Shot:** SCR: the interview questions, then the lesson's last tip.
- **On-screen text:** "Before power on: no power-to-GND wire · no 5 V on 3.3 V pins · grounds
  connected"
- **Voice:** "Interview questions: why does an LED need a series resistor, and how do you pick it?
  What happens with a floating input? How do you connect a 5-volt output to a 3.3-volt chip? And
  before you power any new circuit: no wire from power to ground, no 5 volts on 3.3-volt pins,
  grounds connected. One minute. It saves boards."

### 10:40–11:00 · End screen

- **Voice:** "Next lesson: C for embedded, bits and volatile. And the next 'Why doesn't it work?'
  is a board that keeps restarting."

## Claims and where they come from

| Claim | Source |
|---|---|
| Lesson text, tips, interview questions | `shared/lessons.ts` → `hardware-basics` |
| LED calculator: Vf 2.0 V red, 3.1 V blue/white; next E12 value up; real current; heat | `app/renderer/screens/LearnWidgets.tsx` (`LED_COLORS`), `shared/electronics.ts` (`ledResistor`, `e12Above`) |
| I2C pull-up range: Rp(min) = (VDD − 0.4 V) / 3 mA; Rp(max) = tr / (0.8473 × Cb); tr 1000 ns (100 kHz), 300 ns (400 kHz) | `shared/electronics.ts`, citing NXP UM10204 I2C-bus specification, table 10 |
| Divider output Vout = Vin × R2 / (R1 + R2) | `shared/electronics.ts` (`divider`) |
| HC-SR04 ECHO is 5 V on 3.3 V boards (gotcha); wiring rule on 5 V into 3.3 V pins; shopping list adds a 1 kΩ + 2 kΩ divider | CHANGELOG "Part gotchas", 0.5.0 "5 V / 3.3 V logic levels", "Shopping list" |
| "Show on the 3D board" with an LED on GP15 of a Pico | `shared/lessons.ts` board block |

## Description

```
Voltage, current and resistance for people who write code: why an LED needs a resistor, what a
pull-up really does, how a divider makes 5 V safe for a 3.3 V pin, and the one-minute check before
you power anything. Lesson 2 of "Embedded for software developers".

Chapters
0:00 A burnt pin can't be undone
0:25 Voltage, current, resistance
1:45 Why an LED needs a resistor
4:00 On the 3D board and on the desk
4:50 Pull-ups (and I2C speed)
6:20 Voltage dividers
7:40 5 V and 3.3 V: let the app check
9:10 A datasheet's first page
10:00 Interview questions

Sources: NXP UM10204 I2C-bus specification (rise times, table 10).
Raspberry Pi Pico pinout: https://boardpilot.agentflowbind.com/boards/rpi-pico/
HC-SR04 page: https://boardpilot.agentflowbind.com/parts/hc-sr04/
BoardPilot version: [x.y.z]

[standard footer from docs/youtube/format.md]
```

## Tags

`ohms law, led resistor, pull up resistor, voltage divider, 5v to 3.3v, level shifter, i2c pull
up, raspberry pi pico, esp32, electronics for programmers`

## Pinned comment

"Which one caught you first: the missing LED resistor, the floating input, or 5 V on a 3.3 V pin?
The calculators from this video are in the Learn screen, lesson 2."

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). Use the Italian lesson text in
`shared/i18n/it/lessons.ts` for the calculator labels and tips. Numbers: Italian uses a decimal
comma in running text ("3,3 V", "8,7 mA"); keep the dot inside code and formulas shown on screen.
