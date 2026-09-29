# Video 5 · "Why doesn't it work?" #3 · My ESP32 keeps restarting

- **Series:** Why doesn't it work? (#3)
- **Length:** about 8 minutes
- **Board:** ESP32 DevKit, a long thin USB cable and a short good one, a 470 µF electrolytic
  capacitor (optional)
- **App:** Debug a problem → "Board keeps resetting" (read-only: it only listens to serial)
- **Simulator scenario:** "Keeps resetting" (`keeps-resetting`: Wi-Fi start draws too much current,
  the brownout detector resets the board)
- **Publish:** week 9 (after the first 8 weeks; see [calendar.md](../calendar.md))

## Before recording

- [ ] Released build; version: `____`.
- [ ] **Real-board gate.** A brownout is hard to cause on purpose, and you should not stress the
      board to get one. Try once with a Wi-Fi sketch on a long, thin USB cable or a weak USB port.
      If the board really resets and the app reports it, record that. If not, record the
      simulator version and say "simulated" each time. Do not fake a brownout in editing.
- [ ] This flow reads only; nothing is written to the board. The agent must **not** be on the board
      (the flow checks this and tells you to restore your firmware first).

## Title options

1. My ESP32 keeps restarting: read the reason it prints
2. ESP32 reboot loop? The boot message tells you why
3. "Brownout detector was triggered": what it means and 3 fixes

## Thumbnail concept

SCR crop of the serial monitor with the line "Brownout detector was triggered" large, and a CU of
the USB cable plugged into the ESP32. Text: **"REBOOT LOOP"**. Tag: "WHY? #3".

## Script

### 0:00–0:15 · Hook

- **Shot:** SCR: serial monitor scrolling the ESP32 boot banner again and again ("ets Jun 8 2016…",
  "rst:0xc…", "Starting Wi-Fi…"). DESK: the ESP32's power LED, the board on the mat.
- **On-screen text:** "Restarting every few seconds"
- **Voice:** "The code uploads. It starts. It prints 'Starting Wi-Fi'. And then it starts again.
  And again. The board is telling you why, in a line most people scroll past. Let's find out why."

### 0:15–0:25 · Disclosure

- **Voice:** "I'm using BoardPilot, an app I make. This check only reads the serial port, and I'll
  show you how to do it by eye too."

### 0:25–1:20 · What people usually try

- **On-screen text:** "Re-flash · Another board · Remove the Wi-Fi code · Blame the library"
- **Voice:** "Usual first moves: flash it again, try another board, comment out the Wi-Fi code and
  see it 'fixed'. That last one is a clue, by the way. But guessing takes an evening. Reading takes
  six seconds."

### 1:20–3:00 · The flow

- **Shot:** SCR: Debug a problem → Board keeps resetting. "Check your program is on the board":
  "Your own program is running." Then "Listen to the serial output (6 s)" with its note "This only
  reads", and the result: "The board restarted N time(s) in 6 s."
- **Voice:** "Debug a problem, board keeps resetting. First, the app checks that your own program
  is on the board, not its diagnostic agent. Then it listens: six seconds on the serial port at
  115200, the speed the ESP32 uses for its boot messages. It only reads. It counts the restarts:
  every boot starts with a line that begins 'rst:', the reset reason."

### 3:00–4:30 · The result

- **Shot:** SCR: result card "The power supply dips too low". Evidence lines: the reset reasons with
  their meaning, and "'Brownout detector was triggered' was printed", marked measured. Sources: ESP-IDF
  Programming Guide (Brownout detector), ESP32 Series Datasheet (Power supply). The 3V3 and GND pins
  highlighted in 3D.
- **On-screen text:** "Brownout = supply voltage dropped too low"
- **Voice:** "And the answer: the power supply dips too low. The evidence is a line the chip
  printed itself: 'Brownout detector was triggered'. When Wi-Fi starts, the current jumps. If the
  cable, the USB port or the board's regulator can't keep up, the 3.3-volt supply sags, and the chip
  restarts to protect itself. That's why removing the Wi-Fi code seemed to fix it. The 3.3-volt and
  ground pins light up on the board: that's where the problem lives."

### 4:30–5:20 · Other reasons it can show

- **Shot:** TXT card with the reset reasons the flow knows.
- **On-screen text:** "SW_CPU_RESET: software restart, often after a crash · TG0WDT / TG1WDT:
  watchdog · RTCWDT_BROWN_OUT_RESET: brownout · DEEPSLEEP_RESET: waking up (normal)"
- **Voice:** "Not every loop is power. If the app sees a crash message, it says your program
  crashes. If it sees a watchdog reset, some code blocked for too long, often a loop waiting forever
  for a sensor. And waking from deep sleep is a normal reset. The line after 'rst:' tells you which
  one."

### 5:20–6:30 · The fixes

- **Shot:** DESK: swap the long thin cable for a short one. Optional: the capacitor between 3V3 and
  GND on the breadboard, polarity visible (minus to GND). SCR: run the flow again: "No restart seen".
- **On-screen text:** "1. Short, thick USB cable or a powered hub · 2. Remove parts on 3V3 to test ·
  3. 470 µF between 3V3 and GND"
- **Voice:** "The app suggests three fixes. A shorter, thicker USB cable, or a powered hub. Remove
  the parts powered from the 3.3-volt pin, to see if it stops. And a large capacitor, 470
  microfarads, between 3.3 volts and ground near the board, to cover the short current peak. Mind the
  capacitor's polarity: the minus stripe goes to ground. Run it again: no restart seen."
- **Voice (simulator branch):** "The simulator can't swap a cable, so I switch it to the healthy
  scenario to show what a fixed board looks like. On a real board, this is where you change the
  cable." (Load "healthy" from the ⚙ menu on camera, so the switch is visible.)

### 6:30–7:20 · Check it without BoardPilot

- **Shot:** SCR: Arduino serial monitor at 115200, scrolling to the "Brownout detector was
  triggered" line and the "rst:" line after it.
- **Voice:** "Without the app: open any serial monitor at 115200. Look for 'Brownout detector was
  triggered', and look at the 'rst:' line of the next boot. Don't trust the rst line alone: after a
  brownout it can say a software reset, because the chip restarts itself. The brownout line is the
  clue."
- **Note for the edit:** only keep the "can say a software reset" sentence if your real board shows
  it (the simulator prints `rst:0xc (SW_CPU_RESET)` after the brownout line). If your board shows
  `RTCWDT_BROWN_OUT_RESET`, say that instead.

### 7:20–7:45 · Recap

- **On-screen text:** "Read the line before the restart · Brownout = power · Watchdog = blocked code
  · Crash = your program"
- **Voice:** "A board that restarts is not a mystery. It prints why, every time. Read the line before
  the restart, and the rst line after it."

### 7:45–8:00 · End screen

- **Voice:** "Next 'Why doesn't it work?' is garbage on the serial monitor. Before that, lesson
  three: C for embedded, bits and volatile."

## Claims and where they come from

| Claim | Source |
|---|---|
| The flow checks your program is on the board, listens 6 s at 115200, counts "rst:" lines, reads only | `flows/debug-keeps-resetting.ts` |
| Reset reasons and their meanings (SW_CPU_RESET, TG0WDT/TG1WDT, RTCWDT_RTC_RESET, DEEPSLEEP_RESET, RTCWDT_BROWN_OUT_RESET) | `flows/debug-keeps-resetting.ts` (`RESET_REASONS`) |
| Result "The power supply dips too low", evidence marked measured, three next steps, sources | same file, brownout branch |
| Simulated output: boot banner with `rst:0xc (SW_CPU_RESET)`, "Starting Wi-Fi…", "Brownout detector was triggered" | `app/main/sim/simWorld.ts` (`resetting` mode), `app/main/sim/scenarios/keeps-resetting.json` |

## Description

```
An ESP32 that restarts every few seconds usually tells you why, in a line most people scroll past.
Here's how to read it, what "Brownout detector was triggered" means, and three fixes.

ESP32 pinout (3V3 and GND pins): https://boardpilot.agentflowbind.com/esp32-pinout/

Chapters
0:00 Restarting every few seconds
0:25 What people usually try
1:20 Listening to the board
3:00 The result: brownout
4:30 Other reset reasons
5:20 Three fixes
6:30 The same check by eye
7:20 Recap

Sources: ESP-IDF Programming Guide, Brownout detector and Watchdogs; ESP32 Series Datasheet,
Power supply.
Recorded on: [real ESP32 / simulator — say which]. BoardPilot version: [x.y.z]
Why doesn't it work? #3

[standard footer from docs/youtube/format.md]
```

## Tags

`esp32 keeps restarting, esp32 reboot loop, brownout detector was triggered, esp32 brownout, esp32
wifi reset, esp32 watchdog, rst:0xc, esp32 power supply, arduino esp32, boardpilot`

## Pinned comment

"What fixed your reboot loop: the cable, a capacitor, or something else entirely? If it was a
watchdog, what was the code waiting for?"

## Italian subtitles

Follow [subtitles-it.md](../subtitles-it.md). Terms: "Debug: board keeps resetting" → "Debug: la
scheda continua a riavviarsi"; "The power supply dips too low" → "L’alimentazione scende troppo".
Keep "brownout", "watchdog", "rst:", "SW_CPU_RESET" in English (they are what the board prints); add
the Italian meaning once in the subtitle ("brownout: calo di tensione").
