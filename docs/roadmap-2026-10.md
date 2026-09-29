# October 2026 plan

Three product steps this month, plus a personal career track that runs alongside:

1. **Make BoardPilot look as good as it works** (weeks 1 and 2): a real workbench scene, detailed
   boards and parts.
2. **Get it seen** (weeks 3 and 4): SEO, a GitHub repo that earns stars, and a launch once the
   visuals are ready, so first impressions are good.
3. **Help users make fewer mistakes** (spread over the month, the top items before the launch):
   code vs wiring checks, electrical checks, live wiring verification.
4. **Template projects that show what is happening when they run** (core in week 3, more in
   November): ready-made projects built on any board, and a live run view on the 3D board with a
   plain-language story of each step.
- **Career track:** CV for embedded jobs, real-hardware proof, small projects that fill the usual
  gaps, job applications.

October is full. If time runs short, the order to keep is: week 1 graphics, the code vs wiring
checker, the pre-flight button, the part gotchas, the first 5 templates with the live run view in
the simulator, real-hardware tests, the "before launch" list, launch. Everything else moves to the backlog at the end of this file, prioritised by what users
ask for after the launch.

Starting point: v0.5.0 (13 boards, diagnostic agent for every board, a pinout page per board).
Every week ends the usual way: app runs with `npm run dev`, tests pass, simulator works, a
CHANGELOG entry, one commit.

---

## Step 1 · Graphics

### Week 1 · Oct 1 to 9 · 3D quick wins and the workbench (release 0.6.0)

No new dependencies: everything comes from three.js and drei, which the app already uses.

Done on Sep 29 (rebuilt and committed; the earlier uncommitted attempt was not in the repo):

- [x] Studio lighting built in code (works offline), shinier metal on shields, pins and USB.
- [x] Soft contact shadow under the board and parts; darker floor that fades out (no visible
      edge), quieter grid.
- [x] Camera frames the board and all parts when a scene opens, when the board changes and on
      "Overview", tight enough that the board fills a good part of the view (tested for all 13
      boards).
- [x] Pin names printed on the PCB like real silkscreen, plus the board name. Floating tags only
      for pins in use, hovered, selected, highlighted or with a warning. The print is readable
      from the "Module" view and when zoomed in; tags carry the names at the default zoom.
- [x] Jumper-wire look: thinner cables, plug housings at both ends, parallel wires fan out,
      other wires fade while one is selected.

Still to do:

- [x] **Workbench scene** (your idea): a wooden desk under the board, a blue or green anti-static
      mat with its grid where the board sits, and shelves in the background with parts bins,
      labelled drawers, component reels, a spool of wire, spare boards and a soldering station.
      - All built in code from simple shapes and generated textures (wood grain, mat grid, bin
        labels), so it works offline and adds no download.
      - The background stays soft and slightly darker (fog, lower light) so the board and your
        wiring stay the focus.
      - A "Desk / Plain" switch in the 3D toolbar; the choice is remembered. Plain is the default
        on slow computers.
      - Optional later: the shelf shows parts from your current project and library, so clicking a
        bin adds that part to the desk.
- [x] Rounded PCB corners and mounting holes (`holesMm` in the board files, sourced from the
      mechanical drawings): Uno, Mega and the three Picos so far. The other boards need their
      drawings checked before holes are added.

### Week 2 · Oct 12 to 16 · Detailed boards and parts

- **Boards:**
  - chips with legs by package (QFN, LQFP, SOIC), crystal cans, rounded USB connectors (micro, C, B)
  - shielded modules with a laser-etched label
  - buttons with caps, LEDs that light up when the pin is driven
  - gold pads, via dots and a few copper traces for a realistic top
- **Parts:**
  - LED dome that glows with the live pin level; potentiometer with a round knob that turns with
    the live ADC value; button cap that presses when the input goes LOW
  - OLED with a lit screen; breakout boards with a real chip and a pin header; DHT grid, relay can,
    servo horn, sensor windows
- Instanced pins and headers so the 99-pin Nucleo and the 85-pin Mega stay smooth.
- **Decision for you:** realistic 3D model files (GLB) for the five most popular boards. Pins
  would stay generated and clickable. These need licensed or self-made models.
- **Decision for you:** a soft glow (bloom) on live pins and LEDs. It needs
  `@react-three/postprocessing`, a new dependency of about 60 KB. Yes or no?

---

## Step 2 · Get it seen

The goal is more visitors, downloads and GitHub stars, earned honestly: no bought stars and no
spam posts (both break GitHub and community rules and backfire). Posting on your accounts is
yours to do; I draft everything.

### Week 3 · Oct 19 to 23 · SEO and a repo that earns stars

**The GitHub repo**

- A README hero: a short GIF or video of the 3D workbench finding crossed SDA/SCL wires, then a
  one-line pitch, the download buttons and a "Star if it helped you" line.
- [x] A new social preview image (website and GitHub) with the 3D workbench and "13 boards".
- Topics tuned for search on GitHub: esp32, arduino, raspberry-pi-pico, stm32, nrf52, teensy,
  pinout, embedded, electronics, i2c, 3d, electron.
- A "good first issue" list that is easy to join: add a board (one JSON file plus sources), add a
  part, translate into a new language. [x] The guide "Add your board in 30 minutes"
  (`docs/add-a-board.md`), a "Request a board" form and a README section are done; the issues
  themselves still need to be opened.
- GitHub Discussions switched on (questions, show your setup). Release notes with screenshots.
- Submit to curated lists where it fits their rules: awesome-esp32, awesome-embedded-systems,
  awesome-arduino, awesome-raspberry-pi, awesome-electronics.

**The website (SEO)** (started Sep 28, done ahead of week 3)

- [x] **Per-board pages:** questions and answers on every board page (which pins are I2C, which to
      avoid, 5 V tolerance, analog pins, how to upload), with FAQ structured data.
- [x] **Part-on-board wiring pages:** 30 parts × 12 boards per language (360 in English, 360 in
      Italian), each with the wiring, the voltage checks that matter on that board, Arduino test
      code (library examples where needed) and HowTo + FAQ structured data. The nRF52840 DK shows no
      code on purpose: its core numbers pins differently from the chip names, and nothing is guessed.
- [x] **Comparison pages:** 12 pairs ("ESP32 DevKit vs Raspberry Pi Pico", "Arduino Uno vs Nano"…).
- [x] Links between parts, boards, guides and comparisons.
- [x] A social image per board (used by its pinout page, wiring guides and comparisons).
- **Free web tools, which earn links naturally:**
  - an online pinout explorer (click a pin, see what it can do)
  - an online wiring checker that runs the same rules as the app
  - an embeddable pinout widget other sites can add, with a link back
- Bing Webmaster Tools next to Google Search Console. Keep checking page speed.
- Cloudflare Web Analytics (privacy-friendly, no cookies) to see what works.

### Week 4 · Oct 26 to 30 · Polish, real hardware, launch (release 0.7.0)

- **App UI polish:**
  - a calmer top bar (board and connection on the left, the rest in one compact group)
  - a Home screen with coloured task icons and a live mini board
  - a one-line demo-AI notice you can dismiss
  - severity bars in the log
- **Real hardware:** test the agent on real boards: Pico, Uno, Nano, Nucleo, ESP32-S3 first. This
  needs the boards on your desk. Fix what the bench finds.
- **Playwright smoke test** of the app (open it, pick a board, run the debug demo, screenshot).
- **Launch, once 0.7.0 is out.** I draft the posts, you publish them:
  - Show HN; Reddit r/esp32, r/arduino, r/raspberrypipico, r/embedded (each has its own
    self-promotion rules)
  - a Hackster.io project write-up, a tip to Hackaday, Product Hunt
  - a dev.to article ("How we detect crossed I2C wires with a swap test")
  - a 30-second demo video for YouTube Shorts and LinkedIn
- **After launch:** answer every issue and comment in the first week. That is what turns
  visitors into stars.

---

## Step 3 · Help users make fewer mistakes

Most beginner embedded bugs are one of four kinds. Each item says which week it fits in.

### A. Code does not match the wiring (the most common cause)

- [x] **Code vs wiring checker** (week 2, top priority; done Sep 29, in New project). Read the user's sketch and compare it
      with the 3D scene. Catches:
      - `Wire.begin(22, 21)` while the scene has SDA on 21
      - `pinMode(34, OUTPUT)` on an input-only pin
      - `analogRead` on an ADC2 pin while Wi-Fi is on
      - the LED wired to D13 while the code toggles D12
      - `Serial.begin(9600)` while the monitor listens at 115200

      Findings appear on the pin and the line of code, like wiring findings, and are labelled as
      checks of the drawing, not measurements.
- [ ] **Crash decoder** (week 3). Turns an ESP32 "Guru Meditation" backtrace into the file and line
      where it crashed (uses the user's build file).
- [ ] **Explain-the-error mode** (week 3). Paste a compiler or upload error and get the cause and
      the fix in plain words (AI, labelled as a suggestion, with the rule or doc it relies on).

### B. Wiring mistakes the drawing does not show

- [ ] **Live wiring verification** (week 4, together with the real-hardware tests). For each wire,
      the agent checks that the real connection matches the drawing and shows a green tick per
      wire. This extends today's I2C pull-up check to every pin, reading only unless the user
      confirms a test signal.
- [ ] **Step-by-step breadboard guide** (November). A 2D breadboard view with exact holes ("red wire
      from 3V3 to row 12"), each step verified live before the next.
- [ ] **Photo check** (November). A photo of the bench compared with the drawing by the AI, always
      shown as a suggestion to confirm.

### C. Electrical mistakes

- [x] **I2C address conflict rule** (week 1, small). Two parts on the same address on one bus,
      for example two BME280s at 0x76; the hint says how to change the address (SDO pin).
- [ ] **Power budget** (week 2). Adds up each part's current against what the board can supply
      (ESP32 DevKit 3V3 about 600 mA, Uno 3.3 V pin 50 mA) and warns before brown-outs. Needs a
      `currentMa` field in the parts library, with sources.
- [ ] **Pull-up calculator** (week 2). Several modules each carrying their own pull-ups make the
      total too strong; the app shows the combined value and whether it is within the I2C spec.
- [ ] **"Before you power on" checklist** (week 2). Shared ground, no 5 V on 3.3 V pins, no power
      shorted to ground: checked from the drawing, ticked by the user.

### D. Process mistakes

- [x] **Flash pre-flight check** (week 1; done Sep 29, a step in Flash firmware). Before writing: image format and size fit the board's
      flash, the image targets the right chip, the partition table is compatible.
- [ ] **Project templates with good habits** (week 3): non-blocking loops instead of `delay()`,
      a watchdog, error handling, all explained in comments.

### E. AI-assisted checks (pre-flight and beyond)

Every item is marked **rule** (deterministic, always right when it fires) or **AI** (shown as a
suggestion with its source, as the honesty rules require). Two are in October; the rest go to November.

**October**

- [ ] **Pre-flight button** (week 3, before the launch). One click before uploading runs everything
      and shows red **blockers** (upload stays disabled until fixed or confirmed) and **warnings**:
      - compile the sketch in the app with arduino-cli for the selected board; compile errors
        explained in plain words
      - memory check from the compiler's size report (rule), for example "RAM 81% used on the
        Uno: it may crash when the stack grows"
      - the code vs wiring checker, library addresses, power budget, I2C conflicts (rules)
      - AI code review for common embedded bugs:
        - `delay()` or `Serial` inside an interrupt
        - missing `volatile` on variables shared with an interrupt
        - `millis()` overflow maths
        - heap fragmentation from `String`
        - no watchdog
        - I2C read results never checked
- [x] **Part "gotchas" database** (week 2, rule, every entry sourced; done Sep 29 for 27 parts, 44 entries). Known traps for each part,
      shown the moment the part is added. For example:
      - DHT22 needs 2 s between reads
      - HC-SR04 echo is 5 V: dangerous on a 3.3 V board
      - SSD1306 can be at 0x3C or 0x3D
      - a servo on USB power resets the board
      - WS2812 LEDs need a resistor, a capacitor and often a level shifter
      - motors and relays need a flyback diode and their own supply

      Starts with the 50 most used parts; a `gotchas` field in the part schema.

**November**

- [ ] **Library vs board address check** (rule). The module is at 0x76 but the library default is
      0x77 (Adafruit BME280), a silent failure. Needs the default address of the common libraries
      in the parts data.
- [ ] **Project-aware checklist** (AI plus rules), generated from what is in the scene:
      - motors: separate supply, shared ground, diode
      - long I2C wires: lower the bus speed
      - batteries: brown-out and deep-sleep notes
- [ ] **"Known good" snapshot and "What changed since it worked?"** (rule, measured). Save pin
      states, the I2C scan, typical readings and free memory while the project works. Later,
      compare live readings with it, for example "the sensor at 0x76 no longer answers, D25 is
      stuck LOW, free memory is down 40 KB".
- [ ] **Anomaly watch** (rule; AI only explains). Expected ranges per part. Alerts on:
      - stuck or constant values, sudden jumps, noise, I2C dropouts
      - free memory slowly going down (an early memory-leak warning)
- [ ] **Serial log analyser** (rule plus AI). Spots reset loops, brown-outs, watchdog resets and
      stack overflows in the output, and explains them.
- [ ] **Automatic test plan** (AI proposes, the agent measures). For the current project: check each
      sensor's chip ID, blink each LED (after the user confirms), ask the user to turn the knob and
      watch it change. Results are shown as measurements.
- [ ] **Guided "rubber duck" debugging** (AI). Asks the next useful question instead of giving
      the answer, and shows the evidence at each step. For learners.
- [ ] **Personal mistake memory** (rule). "Last time on this project, SDA and SCL were crossed:
      check that first." Stored locally, only about the user's own sessions.
- [ ] **AI-written code is checked before it is shown.** Code suggested by the assistant goes through
      the same wiring, address and memory checks; if it fails, the assistant fixes it or says so.
- [ ] **Datasheet-grounded answers.** When the user uploads a datasheet, answers cite the page and
      table. Numbers not found in the datasheet are marked as not verified.

---

## Step 4 · Template projects that show what is happening when they run

Added Sep 28. The idea: a beginner picks a ready-made project, the app builds it on their board
(parts, wires, code), and when it runs, every step is visible, on the 3D board and in plain words.
Week 3 has room for the core because the website SEO work was finished early; the rest goes to
November.

### A. Template projects

- [x] **Template files** (`templates/<id>.json`, same idea as boards and parts; guide in `docs/templates.md`), each with:
      - the parts, a difficulty level and time needed
      - what you will learn
      - the code, written per chip family (reusing the website guide generator)
      - the "story" markers described below
      - a behaviour model for the simulator
      - sources
- [x] **Works on every board:** the wiring is generated from the board's rules (default buses, safe
      pins, the right supply pin), and the wiring checker runs on it. A template that needs Wi-Fi
      only offers Wi-Fi boards (ESP32 family, Pico W).
- [~] **"Start from a template" in New project.** *Done: pick → scene and code for the board → run in the simulator. Still to do: the wire-by-wire build guide checked live, and pre-flight → flash from the template.* Pick a template → the board is detected → the
      scene appears in 3D with its wires → a step-by-step build guide, one wire at a time (checked
      live when the agent is on the board) → pre-flight → backup and confirmation → flash → run.
- [x] **First templates (week 3; done Sep 29):**
      1. Blink and button (first steps)
      2. Weather station: BME280 + OLED
      3. Distance meter: HC-SR04 + TM1637
      4. Motion alarm: PIR + buzzer
      5. Plant watering: soil sensor + relay/pump
- [ ] **More templates (November):**
      - Smart night light: LDR + PWM LED
      - Servo pointer with a knob
      - RFID door lock: RC522 + servo
      - SD card data logger
      - Wi-Fi web dashboard (ESP32 and Pico W)
      - MQTT sensor (ESP32 and Pico W)
- [ ] **Each template on the website too:** a page per template and board, with a "Open in
      BoardPilot" button. This adds to the SEO work.

### B. Live run view: show what is happening

- [x] **"Story" markers in the code**, extending the BoardPilotProbe library:
      - `probe.step("Read the soil sensor")` for each step
      - `probe.state("WATERING")` for the current mode
      - `probe.event("Pump on for 3 s")` for things that happen

      Values and pin changes are sent too. Templates come with these markers already written; the
      user can add them to their own code.
- [~] **On the 3D board:** *Done: pins, LED glow, wire pulses, values and display text above parts. Still to do: servo turning, relay click, OLED screen texture, PIR detection effect.*
      - pins light up when they change, and wires pulse when data goes through them
      - parts react: the LED glows, the servo turns, the relay clicks, the OLED shows the same text
        as the real one, the PIR shows a detection
      - live values float above the parts
- [x] **Story log in plain words**, for example: "10:02:01 Soil moisture 32% (below 40%) → pump ON
      (D25 HIGH) for 3 s". Each line can be clicked to focus the pin, wire or part.
- [x] **Code view with the running step highlighted**, driven by the `probe.step` markers, so the
      user sees which part of the code is running now.
- [ ] **Plots** of the values, coloured like the pins they come from (reusing Monitor).
- [x] **Simulator run:** each template has a behaviour model that runs the same steps without
      hardware, with pause, step-by-step and speed controls. Everything it shows is labelled
      "simulated"; on a real board the same view shows what the probe measured, labelled
      "measured".
- [ ] **"Why did that happen?"** Ask the assistant about any story line; it answers from the log
      and the code, with sources, as the honesty rules require.
- [ ] **The app's own work is narrated the same way:** flashing shows each stage (backup → erase →
      write → verify → restart) with progress on the 3D USB cable, and the debug flows show each
      check as it runs.

---

## Before launch (must be done by the end of week 4)

- [ ] **Free public beta: nobody is forced to buy.** *Decided on Sep 28: no price for now; the
      goal is users and feedback. The business model is decided later.*
      - **When the 30 days end, the app keeps working** (decided Sep 28). Today it locks with a full-screen message;
        instead it shows a clear notice that the trial period has ended. The notice says
        BoardPilot is free during the beta and asks for feedback, and it can be closed. It comes
        back at most once a week.
      - **Keep the trial and license-key code** (dates, keys, checks), so a paid model can be switched
        on later with a setting, not a rewrite. When that happens, people are told well in advance.
      - **Update the license text** (`LICENSE.md`): today it says a key is needed after 30 days.
        Change it to "free to use during the public beta; the terms may change for future versions",
        so the legal text matches what the app does.
      - **Website and README:** the Pricing section becomes "Free during the beta", with a
        feedback link instead of "Coming soon".
- [ ] **Feedback built in**, since feedback is the goal:
      - a "Send feedback" button in the app (top bar menu and on every result card) that opens a
        short form: what you tried, what happened, optional session report (the user sees it before
        it is posted)
      - where it goes: **GitHub only** (decided Sep 28). The button opens a prefilled GitHub issue or
        Discussion; it is public, so it also shows the repo is alive
      - a one-question prompt after a flow finishes ("Did this find your problem? Yes / No / Partly")
      - the answers feed the backlog order
- [ ] **Privacy policy and terms on the website** (required in the EU). They must cover the free
      demo AI (users' questions go to Google through our relay), the AI keys stored on the
      computer, and the opt-in stats below. English and Italian.
- [ ] **Linux version.** An AppImage and a .deb from the release pipeline, plus the serial-port
      permission step (the `dialout` group, udev rules for Pico, ST-LINK, J-Link and Teensy)
      explained in plain words.
- [ ] **Contributor agreement (CLA).** A CLA bot on pull requests, so contributions to a
      source-available, paid app can be licensed and sold. Parts and board data stay CC BY 4.0
      and firmware stays MIT.
- [ ] **Agent image integrity.** A SHA-256 fingerprint of every bundled firmware image in its
      manifest, checked before flashing. If the fingerprint does not match, the app stops and says
      why.
- [ ] **Opt-in crash reports and usage stats.** Anonymous and off by default, asked once on first
      start, with the list of what is sent. Covers boards used, flows started and finished, and
      errors. No project data, no AI text.

---

## Career track (personal, alongside the product work)

### CV

- [ ] One-page CV in English and Italian (Italian version with the GDPR consent line):
      - a header with GitHub, the website and a 30 to 60 second demo video
      - a two-line summary
      - skills grouped the way recruiters search (languages, microcontrollers, protocols, tools)
      - BoardPilot written as facts (5 chip families, 13 boards, firmware that fits the ATmega328P's
        2 KB of RAM, the I2C swap test, 6 flashing toolchains with backups, 2,100+ tests, CI releases)
      - an honest Italian language level
- [ ] Be able to explain every BoardPilot bullet in depth: the swap test, the bit-banged I2C and
      clock stretching, pull-up detection, why avrdude restores skip the bootloader area. Study
      any part of the code that is not fully yours yet.
- [ ] Demo video recorded once the week 1 graphics are in.

### Proof on real hardware

No boards on the desk yet (Sep 28). The cheapest set that covers four chip families, bought by
week 3 so it arrives for the week 4 tests. Prices are rough estimates: AliExpress is cheapest but
takes 2 to 3 weeks; Amazon.it costs more and arrives in 1 to 2 days.

| Item | Covers | AliExpress | Amazon.it |
|---|---|---|---|
| ESP32 DevKit 30-pin (CP2102 or CH340) | ESP32, the main board | €4–6 | €8–10 |
| Raspberry Pi Pico (the official one; H version has headers) | RP2040, UF2 flashing | €4–5 | €5–8 |
| Arduino Nano clone with CH340 | AVR, avrdude | €3–4 | €6–8 |
| WeAct Black Pill STM32F411 | STM32, USB DFU flashing | €4–6 | €8–12 |
| GY-BME280 module (cheap ones are often a BMP280, which tests our chip-ID check) | I2C tests | €3–4 | €5–7 |
| Breadboard, jumper wires, LEDs, resistors, buttons, a potentiometer (starter kit) | the demo bench | €5–8 | €10–15 |
| Data USB cables (micro-USB and USB-C; check they carry data) | everything | €3–5 | €5–8 |
| **Total** | | **about €26–38** | **about €47–68** |

Optional later: an ST-LINK V2 clone (about €3) for SWD debugging of the Black Pill, and a cheap
USB logic analyser (about €8) for the logic-analyser item in the backlog.

- [ ] Order the set (by Oct 16 from AliExpress, or during week 3 from Amazon.it).
- [ ] Run the agent and the debug flows on each board in week 4, and write the results in
      `docs/hardware-setup.md`. Only then write "tested on real hardware" on the CV and the
      website.

### Small projects that fill the usual gaps (1 to 2 weeks each; pick two for October)

- [ ] Bare-metal STM32: your own I2C or SPI driver using registers and DMA (no Arduino).
- [ ] FreeRTOS sensor node: separate tasks, queues, a watchdog.
- [ ] CAN bus between two boards (automotive and industrial jobs ask for it).
- [ ] ESP32 battery sensor with deep sleep and over-the-air updates.
- [ ] Unit tests for a firmware driver with Unity/Ceedling.
- [ ] Debug with SWD and GDB breakpoints, a logic analyser and an oscilloscope, and write down how.

Each can feed back into BoardPilot (CAN, RTOS monitoring), which strengthens the story.

### Applications

- [ ] Job alerts on LinkedIn, it.indeed.com and embedded.jobs for C/C++, STM32, ESP32, FreeRTOS
      and embedded Linux.
- [ ] Apply to consultancies first (Teoresi, Capgemini, TXT, AGAP2), then product companies.
- [ ] Optional middle path: industrial companies that value C/C++ plus Modbus/CAN (drive, sensor
      and machine makers).

---

## Later (evaluated, parked)

- **PLC mode.** Feasible in tiers:
  1. Arduino-style PLCs (Opta, Controllino, ESP32 PLCs) with 24 V wiring rules
  2. a Modbus scanner and monitor
  3. read-only links to Siemens/Rockwell PLCs
  4. IEC 61131-3 programming (licensing question with OpenPLC)

  Never write to industrial PLCs. Revisit after the launch if users ask for it.

## Your issues (added Sep 29), in the order I will do them

The Learn screen (PR #4) is merged. Your 14 issues are ordered by value for users and by how little
they depend on open decisions. Where an issue asks for a decision, my default is written next to it;
say so if you want it the other way.

| # | Issue | Size | Decision needed (my default) | Status |
|---|---|---|---|---|
| 5 | Wiring diagram and schematic from the project | L | Wiring view first; lives as a viewport tab and in the report | [~] wiring view done; schematic next |
| 18 | Bill of materials and shopping list export | S | none | [x] |
| 9 | Peripheral and pin planner | M | Suggests and highlights the pins (no "Apply": the plan comes before any part exists) | [x] |
| 15 | Hardware basics lesson + LED / divider / pull-up calculators | M | none | [x] |
| 21 | BoardPilot as an MCP server for AI agents | L | Needs your OK: `@modelcontextprotocol/sdk` dependency, transport (stdio launcher or local HTTP), headless mode | [ ] |
| 6 | Lessons: "Show on the 3D board" buttons | M | Split view (lesson left, 3D right) | [ ] |
| 13 | Power budget and battery life (merges step 3 C "Power budget") | M | Yes to sourced current fields in parts; unknown parts listed as unknown | [ ] |
| 10 | Clock-aware calculators with code (timer, PWM, UART, ADC) | M | Add a sourced `clocks` section to board files | [ ] |
| 14 | Register map viewer, decoded live | M | BME280, MPU6050, SSD1306 first | [ ] |
| 7 | Hands-on labs inside lessons, checked live | L | All boards with the agent; simulator scenarios for each | [ ] |
| 8 | Timing view (logic-analyser style) | L | Current stream rate first, labelled "sampled"; fast capture later | [ ] |
| 16 | Guided portfolio projects with checkpoints (builds on the templates) | L | Finished reference code, with hints shown first | [ ] |
| 12 | State machine designer → C code and tests | L | A tool in New project | [ ] |
| 11 | Starter firmware for STM32 HAL, ESP-IDF, Pico SDK | L | Pico SDK first; compile check as a nightly CI job | [ ] |
| 17 | AI interview coach | M | Answers stored only on this computer, deletable, 90 days | [ ] |

## Last step · Try it in the browser (your request, Sep 29)

The website shows the real app, running, instead of screenshots: visitors click pins, drag parts,
draw wires and run the debug demo on a simulated board, with no install.

- [ ] **Web demo build** of the renderer with the simulator in the page (the simulator already
      implements the same driver interface as the real board, so no hardware and no server are
      needed). Main-process features that need the computer (serial ports, esptool, files, saved
      keys) are replaced by the simulator or hidden, with a "Download the app" prompt where they
      would be.
- [ ] Embedded on the home page and on every board page (that board, preloaded), lazy-loaded so
      the pages stay fast; a static screenshot until the visitor clicks "Try it live".
- [ ] AI in the demo goes through the existing free demo relay only.
- [ ] Sharper screenshots meanwhile: captured at 2× pixel density.

This is also the first half of the "Web version using WebSerial" backlog item: the same build
later talks to real boards through Chrome's WebSerial.

## Backlog (November and December, ordered by what users ask for)

### Growth

- [ ] **Web version using WebSerial.** Chrome can talk to USB boards directly, so the 3D view,
      wiring checker and flashing could run in the browser with no install. It reuses the
      renderer. *Strategic decision for you:* it is the biggest reach multiplier, and a large piece
      of work.
- [ ] **Shareable projects:** "Share my wiring" makes a read-only 3D link on the website, for
      forum posts asking for help. Free traffic and backlinks.
- [ ] **Guided lessons** (blink, button, I2C sensor, PWM) in the simulator, for schools and courses.
      Each lesson is also a web page.
- [ ] **More languages:** Spanish, German, French, Chinese. The translation system exists, so it is
      mostly translating. Each language opens a new search market.

### Pro features

- [ ] **Import from KiCad or Fritzing:** read the schematic's connections and build the 3D scene
      automatically.
- [ ] **VS Code / PlatformIO companion:** read `platformio.ini`, show the board and wiring, run the
      pre-flight from the editor.
- [ ] **Logic analyser support** via sigrok (cheap USB analysers), with captures next to the agent's
      I2C trace.
- [ ] **Offline AI** through a local model (Ollama), for schools and privacy-minded users. Fits the
      existing provider list.

### Quality

- [ ] **Small real-hardware test rack:** a Raspberry Pi with a few boards attached that tests the
      agent automatically before every release.
- [ ] **Backup management:** a screen with disk use and clean-up for flash backups.
- [ ] **Accessibility:** pin roles shown with shapes or patterns as well as colour (colour-blind
      users); keyboard navigation of the 3D view, the log and the wizard.

## Open items that need you

- The `GEMINI_API_KEY` secret in Cloudflare Pages, so the free demo AI answers.
- Code signing (Apple Developer ID, Windows certificate), so installs show no warnings. This costs
  money.
- Reference images in `/design` if you have a look in mind for the workbench.
- The decisions above: realistic GLB board models, the bloom dependency, and whether to build
  the web version.
- Pricing: decided "free public beta for now"; the model is to be decided after the launch
  feedback.
- License sales: not for now. The app stays free during the beta.
