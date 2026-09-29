# Video 6 · "Embedded for software developers" Lesson 3 · C for embedded: bits and volatile

- **Series:** Embedded for software developers (Lesson 3)
- **Length:** about 10 minutes
- **On the desk:** Arduino Nano (clone with CH340 is fine), USB cable
- **App:** Learn → "C for embedded" (the register playground: "Pick a bit, then run one line of C")
- **Publish:** week 11

## Before recording

- [ ] Released build; version: `____`.
- [ ] **Real-board gate.** Upload the sketch in 5:10 to your Nano with the Arduino IDE and check
      that the on-board LED blinks. Record the real result. If your Nano's LED is on another pin
      (some clones differ), say so and change the bit.
- [ ] This lesson has no "Show on the 3D board" block. Don't claim one.

## Title options

1. C for embedded: set one bit without breaking the others
2. Bits, registers and volatile (for software developers)
3. The C you need for microcontrollers: uint8_t, |=, &= ~ and volatile

## Thumbnail concept

The register playground cropped to its row of bits, one bit lit green, and `REG |= (1 << 5);` in
large mono text. Text: **"ONE BIT"**. Tag: "LESSON 3".

## Script

### 0:00–0:15 · Hook

- **Shot:** DESK: the Nano's LED blinking. SCR: `PORTB ^= (1 << 5);`
- **On-screen text:** "One line. One bit. One LED."
- **Voice:** "This line blinks the LED on an Arduino Nano. No digitalWrite. Just one bit in one
  register. If you know C from anywhere else, this is the part that's different on a
  microcontroller. Let's go through it."

### 0:15–0:25 · Series line

- **Voice:** "Lesson three of Embedded for software developers, from the Learn screen in
  BoardPilot, an app I make."

### 0:25–1:50 · Exact-size types

- **Shot:** SCR: the lesson's first code block (`uint8_t`, `uint16_t`, `uint32_t`, `int16_t`).
- **On-screen text:** "Never a plain int for hardware"
- **Voice:** "Every register has an exact size, so embedded C uses types with the size in the name.
  uint8_t: 8 bits, 0 to 255, a byte from a sensor. uint16_t: an ADC reading. uint32_t: a hardware
  register on a 32-bit chip. int16_t: a temperature that can go negative. A plain int changes size
  from chip to chip: 16 bits on the Nano's AVR, 32 on the ESP32. Don't use it for hardware."

### 1:50–3:40 · A register is a row of switches

- **Shot:** SCR: the register playground. Pick bit 5 → "Set bit" → the bit turns on, and the widget
  says "Bit 5 is now 1. The other bits did not change." Then "Clear bit", "Flip bit", "Read bit".
- **On-screen text:** the four lines from the lesson table, one at a time
- **Voice:** "Each bit of a register controls one thing: a pin, a feature, a flag. The job is almost
  always to change one bit without touching the others. Set a bit: OR with a 1 shifted into place.
  Clear it: AND with the inverse. Flip it: XOR. Check it: AND, and see if the result is zero. Watch
  the other bits: they don't move. That's the whole point."

### 3:40–5:10 · Why not just assign?

- **Shot:** TXT card: `REG = (1 << 5);` with the other seven bits going to 0 in red.
- **Voice:** "What goes wrong if you just assign? REG equals 1 shifted by 5 sets bit 5, and clears
  every other bit. If bit 3 was running your UART, it isn't anymore. It's a very common register
  bug: a plain equals where an OR-equals belonged."

### 5:10–6:40 · On the real board

- **Shot:** SCR: the sketch below in the Arduino IDE. DESK: upload, the LED blinks. CU: the LED
  marked "L" next to the USB socket.
- **On-screen text:** "Nano: D13 = PB5 = bit 5 of port B"
- **Voice:** "On the Nano, the LED marked L is on pin D13. Inside the chip, that's port B, bit 5.
  DDRB decides which pins of port B are outputs: OR in bit 5. PORTB holds the output levels: XOR bit
  5 to flip it. Upload. It blinks. Same idea as digitalWrite, minus the layers in between."

```cpp
void setup() {
  DDRB |= (1 << 5);        // PB5 (D13) as output; other port B pins unchanged
}
void loop() {
  PORTB ^= (1 << 5);       // flip PB5: the "L" LED toggles
  delay(500);
}
```

### 6:40–8:30 · volatile

- **Shot:** SCR: the lesson's `volatile` code block, then the tip.
- **On-screen text:** "volatile = read the hardware every time"
- **Voice:** "One keyword you'll rarely need in app code, and always need here: volatile. The
  compiler removes reads it thinks are useless. In this loop we wait for a 'data ready' bit in a
  status register. Without volatile, the compiler may read it once, decide it never changes, and
  loop forever. The hardware changes that value behind the compiler's back. The same goes for
  variables shared with an interrupt. The lesson's tip describes the classic symptom: works in a
  debug build, hangs as soon as optimisation is on."

### 8:30–9:30 · Interview questions

- **Shot:** SCR: the three interview questions.
- **Voice:** "Three interview questions. How do you set, clear and toggle one bit without changing
  the others? What does volatile do, and when is it required? Why uint32_t instead of int for a
  register? Pause, answer out loud, then check with the lesson."

### 9:30–10:00 · End screen

- **Voice:** "Next lesson: GPIO, pins in and out, with an LED and a button on the 3D board and on
  the desk. And the next 'Why doesn't it work?' is garbage on the serial monitor."

## Claims and where they come from

| Claim | Source |
|---|---|
| Lesson text, types, table of bit operations, volatile example and tip, interview questions | `shared/lessons.ts` → `c-bits` |
| Register playground behaviour ("The other bits did not change") | `app/renderer/screens/LearnWidgets.tsx` → `RegisterPlayground` |
| `int` is 16 bits on AVR and 32 bits on ESP32 | avr-gcc and Xtensa/RISC-V GCC data models (AVR: 16-bit int; check the compiler docs before publishing and add the link) |
| Nano: D13 is PB5, drives the "L" LED; DDRB and PORTB registers | Arduino Nano schematic; ATmega328P datasheet, I/O Ports chapter (register description for port B) |

## Description

```
The C you need for microcontrollers: exact-size types, changing one bit without breaking the
others, and the one keyword that stops "works in debug, hangs in release". With a real Arduino Nano
blinking from a single register bit. Lesson 3 of "Embedded for software developers".

Chapters
0:00 One line, one bit, one LED
0:25 Exact-size types
1:50 A register is a row of switches
3:40 Why not just assign?
5:10 On a real Arduino Nano
6:40 volatile
8:30 Interview questions

Sources: ATmega328P datasheet, I/O Ports; Arduino Nano schematic.
Arduino Nano pinout: https://boardpilot.agentflowbind.com/boards/arduino-nano/
BoardPilot version: [x.y.z]

[standard footer from docs/youtube/format.md]
```

## Tags

`embedded c, bit manipulation, registers, volatile keyword, uint8_t, arduino nano, avr, port
manipulation, embedded interview questions, embedded for software developers`

## Pinned comment

"What's the worst bug a missing volatile or a plain '=' on a register ever gave you? Lesson 4 (GPIO)
is next."

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). Use the Italian lesson text in
`shared/i18n/it/lessons.ts` for the widget labels ("Set bit", "Clear bit"…) as they appear in the
Italian app. Code, register names and keywords (`volatile`, `uint8_t`, `DDRB`) stay as they are.
