# Video 2 · "Embedded for software developers" Lesson 1 · What is a microcontroller?

- **Series:** Embedded for software developers (Lesson 1)
- **Length:** about 10 minutes
- **Boards on the desk:** ESP32 DevKit and WeAct Black Pill (STM32F411), for close-ups only
- **App:** Learn → "What is a microcontroller?" (widgets "Inside a microcontroller" and "Memory
  map of an STM32"; "Show on the 3D board" with the NUCLEO-F401RE's PA5)
- **Publish:** week 3

## Before recording

- [ ] Recorded from the released build that contains the Learn screen and "Show on the 3D board"
      (both are in `CHANGELOG.md`; check they are in a release, not only "Unreleased").
- [ ] You don't have a NUCLEO-F401RE. The 3D view shows it; the voice says so. Nothing in this
      video claims the code line was run on a real board.
- [ ] The "Explain it more simply" and "Quiz me" buttons need a working AI (your key, or the free
      demo relay once its key is set). Show them only if they answer at recording time, and read
      the answer on screen as "the AI's answer", not as a fact from us.

## Title options

1. What is a microcontroller? (for software developers)
2. A whole computer in one chip: microcontrollers for programmers
3. Why your code never returns from main() on a microcontroller

## Thumbnail concept

CU of the ESP32 module and the Black Pill side by side, and next to them the memory map widget
cropped to the three rows (0x0800 0000, 0x2000 0000, 0x4000 0000). Text: **"ONE CHIP"**. Tag:
"LESSON 1".

## Script

### 0:00–0:15 · Hook

- **Shot:** CU: the ESP32 module, then the Black Pill's chip. SCR: the line
  `*(volatile uint32_t *)0x40020014 = (1 << 5);` appears.
- **On-screen text:** "A variable and an LED are the same thing"
- **Voice:** "If you write code for a living, here's the idea that makes embedded click: on a
  microcontroller, setting a variable and switching on an LED are the same operation. You write a
  number to an address. Let's see why."

### 0:15–0:30 · Disclosure and the series

- **Shot:** SCR: the Learn screen with the lesson list.
- **Voice:** "This series follows the lessons in BoardPilot's Learn screen, an app I make. The
  lessons are short, and each one ends with the interview questions for that topic."

### 0:30–1:30 · An embedded system

- **Shot:** SCR: the lesson's first paragraph. DESK: slowly move from the ESP32 to the Black Pill.
- **Voice:** "An embedded system is a small computer built into a device to do one job. A
  thermostat. A washing machine. The brakes of a car. Its heart is a microcontroller: one chip that
  holds a whole computer. These two are microcontrollers: an ESP32 and an STM32 on a Black Pill
  board."

### 1:30–2:50 · Inside the chip

- **Shot:** SCR: the "Inside a microcontroller" widget, full screen. Zoom slowly on CPU core,
  Flash, RAM, Timers, Peripherals.
- **On-screen text:** "Read inputs → decide in code → drive outputs"
- **Voice:** "Inside: a CPU core that runs your code. Flash that stores the program. RAM for live
  variables. Timers for precise timing. And the peripherals, the part that makes it embedded: GPIO,
  ADC, UART, I2C, SPI. Inputs come in on the left, a temperature sensor, a button. Outputs go out on
  the right, an LED, a motor. Every device follows the same loop: read the inputs, decide in code,
  drive the outputs."

### 2:50–4:00 · Microcontroller or microprocessor?

- **Shot:** SCR: the comparison table in the lesson. Highlight one row at a time.
- **Voice:** "How is this different from the processor in your laptop? A microcontroller has the
  CPU, the memory and the peripherals on one chip; a microprocessor is mostly the CPU. Memory:
  kilobytes here, gigabytes there. Software: your C code, or a small real-time OS, against a full
  operating system like Linux. And it starts in microseconds, not seconds. A Raspberry Pi board is
  on the microprocessor side. The Pico is a microcontroller."

### 4:00–5:40 · Everything is an address

- **Shot:** SCR: the "Memory map of an STM32" widget. Point to each row.
- **On-screen text:** "0x0800 0000 Flash · 0x2000 0000 RAM · 0x4000 0000 Peripherals"
- **Voice:** "Now the important part. The CPU sees flash, RAM and the hardware as one long list of
  numbered addresses. On an STM32, your compiled program lives at 0x0800 0000. Variables and the
  stack at 0x2000 0000. And from 0x4000 0000: the peripherals. GPIO, UART, timers. Writing a 1 to
  the right bit in that area turns an LED on. Other chips put these areas at other addresses. The
  ESP32's map is different, but the idea is the same."

### 5:40–7:00 · The line of code, on the 3D board

- **Shot:** SCR: the code block, then click "Show on the 3D board": the split view with the
  NUCLEO-F401RE and pin PA5 (D13) highlighted.
- **On-screen text:** "GPIOA output register · bit 5 = PA5"
- **Voice:** "Here are both in code. int counter: the compiler picks an address in RAM for you. The
  second line writes directly to an address in the peripheral area: 0x40020014, the output register
  of port A on this chip. Bit 5 is pin PA5. Click 'Show on the 3D board', and the app opens a
  NUCLEO-F401RE with that pin lit. On this board, PA5 is wired to the green LED. I don't have this
  board on my desk, so this one stays in 3D. And a warning: this single line is not the whole
  story. The port's clock must be on and the pin must be set as an output first. That's lesson four."

### 7:00–8:20 · What happens at power on

- **Shot:** SCR: the ordered list, one item at a time. TXT card: "reset → vector table → startup
  code → main() → never returns".
- **Voice:** "What happens when you power it on? One: the CPU reads the vector table at the start
  of flash: where the stack begins and where the startup code is. Two: the startup code copies the
  initial values of your variables into RAM and sets the clock. Three: your main runs. And it never
  returns. There's no operating system to return to. That's why every Arduino sketch has a loop that
  runs forever."

### 8:20–9:30 · Interview questions (recap)

- **Shot:** SCR: the lesson's interview questions. Pause 3 seconds on each.
- **On-screen text:** the three questions
- **Voice:** "The lesson ends with three interview questions. What is the difference between a
  microcontroller and a microprocessor? Where do the code and the variables live? What happens
  between reset and main? Pause here and answer them out loud. If you can, you've got this lesson."
- **Optional (only if the AI answers at recording time):** click "Quiz me", show the question,
  and say: "The Quiz me button asks the AI assistant for a question. That's the AI, not me."

### 9:30–10:00 · End screen

- **Voice:** "Next lesson: hardware basics for software developers. Ohm's law, why an LED needs a
  resistor, and how not to burn a pin. And if you have a sensor that just won't show up, the first
  'Why doesn't it work?' is here."

## Claims and where they come from

| Claim | Source |
|---|---|
| Lesson text, table, memory map, code, power-on steps, interview questions | `shared/lessons.ts` → `what-is-mcu` |
| "Show on the 3D board" opens a split view with the NUCLEO-F401RE's PA5 | CHANGELOG "Unreleased" (issue #6); lesson block `board: 'nucleo-f401re', pins: ['D13']` |
| STM32 memory regions (flash 0x0800 0000, SRAM 0x2000 0000, peripherals 0x4000 0000); GPIOA ODR at 0x4002 0014 | STM32F401 reference manual RM0368, memory map and GPIO registers (check the section numbers before publishing and put them in the description) |
| PA5 drives the green user LED on the NUCLEO-F401RE | ST user manual UM1724 (Nucleo-64 boards), LEDs section |
| "Quiz me" and "Explain it more simply" ask the assistant | `app/renderer/screens/Learn.tsx` |

## Description

```
The one idea that makes embedded click for programmers: on a microcontroller, a variable and an
LED are both just an address. Lesson 1 of "Embedded for software developers".

Chapters
0:00 A variable and an LED
0:15 About this series
0:30 What an embedded system is
1:30 Inside a microcontroller
2:50 Microcontroller or microprocessor?
4:00 Everything is an address
5:40 The line of code, on the 3D board
7:00 What happens at power on
8:20 Interview questions

Sources: STM32F401 reference manual (RM0368), memory map and GPIO sections; NUCLEO-64 user
manual (UM1724), LEDs.
BoardPilot version: [x.y.z] · The NUCLEO board is shown in 3D only.

[standard footer from docs/youtube/format.md]
```

## Tags

`microcontroller, embedded systems, embedded for beginners, stm32, esp32, memory map, registers,
software developer, embedded interview questions, boardpilot`

## Pinned comment

"Software developers: what was the first embedded idea that surprised you? For me it was that
main() never returns. Lesson 2 (hardware basics) is next in two weeks."

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). The lesson already has an Italian version in
`shared/i18n/it/lessons.ts`: use its wording for the lesson title, table headers and interview
questions, so the subtitles match what an Italian viewer sees in the app. "Show on the 3D board" →
"Mostra sulla scheda 3D".
