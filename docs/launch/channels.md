# Channel playbooks

One section per site: what it is good for, its self-promotion rules in short, what to check on the
day, and a draft. Every draft is different on purpose (no cross-posting the same text). Fill the
brackets from the fact sheet in [publishing.md](publishing.md#fact-sheet-check-before-every-post).

**About the rules summaries.** They come from general knowledge and a web search on Sep 29, 2026
(sources linked where I had them). Communities change their rules. The summary here is only a
starting point: on the day, Claude reads the live rules (publishing.md, step A4) and those win.

Placeholders used below: `[VERSION]`, `[PRICE LINE]`, `[REAL-HARDWARE LINE]`, `[CLIP]` (a 20 to 30
second screen clip from the real app, from issue #22 or cut from YouTube video 1), `[LINK]`.

---

## Hacker News (Show HN)

**Good for:** developers, including those who never touched a microcontroller. Honest technical detail
does well; marketing language does badly.

**Rules in short:** Show HN is for something people can try; landing pages, sign-up pages and blog
posts are not Show HN. Don't solicit upvotes or comments, and don't ask friends to vote. Be around to
answer. Sources: [HN FAQ](https://news.ycombinator.com/newsfaq.html), summary of the Show HN rules in
[this guide](https://syften.com/blog/hacker-news-marketing/) and the
[guidelines discussion](https://news.ycombinator.com/item?id=29542665). Check
<https://news.ycombinator.com/showhn.html> on the day.

**On the day:** post on a weekday morning US east coast time (general knowledge, not measured). Keep
the whole day free for comments. Expect questions on the licence and on Electron: answer plainly.

**Title (max 80 characters):**

```
Show HN: BoardPilot – see your microcontroller's pins, wires and I2C traffic in 3D
```

**Text:**

```
Hi HN, I'm Mojtaba. I built BoardPilot, a desktop app (macOS and Windows) for the moment a sensor
"isn't found" and you don't know whether it's the wiring, the code or the part.

It flashes a small diagnostic firmware to the board (after a full flash backup and a confirmation;
your program comes back with one click), then measures: which lines have pull-ups, what answers on
the I2C bus, and what answers when SDA and SCL are swapped in software. If the sensor only answers
swapped, the wires are crossed. It reads the chip ID too, which tells a BME280 from a BMP280 sold
as one. Every result shows on a 3D model of the board and says where it comes from: this session's
measurement or a datasheet section.

Other parts: a wiring checker that runs as you draw, a check of an Arduino sketch against the
drawing (Wire.begin(22, 21) when SDA is on 21, pinMode(34, OUTPUT) on an input-only ESP32 pin),
a flash pre-flight check, and a local MCP server so coding agents can use the same measurements
(off by default; writes still need a click in the app).

13 boards (ESP32, RP2040/RP2350, AVR, STM32, nRF52, Teensy) are data files with sources. A simulator
runs the whole app without hardware, so you can try it without a board.

Honest status: [REAL-HARDWARE LINE]. Builds aren't code-signed yet.

Licence: the app is source-available, not open source (free to read, build and change; [PRICE
LINE]). The 380+ part definitions are CC BY 4.0 and the firmware is MIT.

Code: https://github.com/mojeee/boardpilot
Download and docs: https://boardpilot.agentflowbind.com

I'd like to hear where it gets things wrong, and which checks you'd want next.
```

---

## Reddit (general)

**Rules in short:** Reddit's content policy forbids spam and vote manipulation, and says to post
authentic content in communities you take part in. The common "90/10" guideline (most of your activity
should not be about your own things) is a community norm, not a formal rule; each subreddit sets its
own rules, and some only allow self-promotion in a weekly thread. Always say you made it. Sources:
summary in [redship.io](https://redship.io/blog/reddit-self-promotion-rules) quoting Reddit's content
policy.

**Before posting anywhere on Reddit:** use your own account with a real history. If your account has
little activity in that subreddit, take part in threads there for a couple of weeks first (answer
questions where you actually know the answer, without mentioning the app). Read the sidebar, the rules
and any pinned posts on the day.

### r/esp32

**Angle:** the ESP32-specific trick: I2C pins can be remapped, so a swapped scan finds crossed wires.

**Title:**

```
I made a tool that finds crossed SDA/SCL on the ESP32 by scanning the bus twice (once swapped)
```

**Text (text post with [CLIP]):**

```
Disclosure: I make this app (BoardPilot).

A pattern I kept seeing in "sensor not found" threads: the sensor is fine, the wires are crossed.
On the ESP32 you can check that without touching anything, because the I2C pins are set in
software:

1. Turn off the internal pull-ups and read SDA and SCL. HIGH with nothing driving them = the module's
   pull-ups are there, so it has power and both wires arrive.
2. Scan as wired. Nothing?
3. Scan again with Wire.begin(scl, sda). If the device answers only now, the wires are crossed.
4. Read the ID register (0xD0 on a BME280: 0x60 real, 0x58 = BMP280).

You can do 2 and 3 with a 10-line sketch (in the comments). BoardPilot does all four, shows them on a
3D model of the board and keeps the evidence and datasheet sources in a report.

[REAL-HARDWARE LINE]. macOS and Windows; there's a simulator if you want to try it without a board.
Source-available; [PRICE LINE].

https://github.com/mojeee/boardpilot

What other "it's not the code" ESP32 problems would be worth checking automatically?
```

**First comment (post it yourself right after):** the swap-test sketch from
[docs/youtube/videos/01-i2c-sensor-not-found.md](../youtube/videos/01-i2c-sensor-not-found.md).

### r/arduino

**Angle:** beginners and the code-vs-drawing check, plus 5 V vs 3.3 V on Uno and Nano.

**Title:**

```
Checking an Arduino sketch against the wiring before uploading: what mistakes should it catch?
```

**Text:**

```
Disclosure: I make BoardPilot, the app in the clip.

I've been working on a check that reads an Arduino sketch and compares it with the wiring you've
drawn: pin numbers, Wire.begin() pins, analogRead on a pin with no ADC, Serial.begin() at a
different speed than the monitor, an LED wired to one pin while the code drives another. On the Uno
and Nano it also flags 3.3 V parts on 5 V signals, and the shopping list adds the level shifter or
divider you'd need.

[CLIP]

It's labelled as a check of the drawing, not a measurement: it can't see your real wires. (The app
can measure real pins with a small diagnostic firmware; [REAL-HARDWARE LINE].)

What wiring or code mistakes do you see most often from beginners here? I'd like to add the common
ones.

macOS/Windows, simulator included. Source-available, [PRICE LINE]: https://github.com/mojeee/boardpilot
```

### r/raspberrypipico

**Angle:** Pico, Pico W and Pico 2 as data files, pinout pages, the pin planner.

**Title:**

```
Pin planner for the Pico / Pico W / Pico 2: say what you need, get pins with reasons
```

**Text:**

```
Disclosure: I made this (BoardPilot).

You list what the project needs (I2C, SPI devices, UARTs, analog inputs, PWM, plain inputs and
outputs, Wi-Fi on or off) and it picks Pico pins from the board file only, with the reason for each:
default buses, a UART that isn't the USB one, ADC-capable pins, and pins already wired are left
alone. When something doesn't fit, it says what to do instead. "Copy #defines" gives you the code
names.

The pinout pages it uses are on the web too: https://boardpilot.agentflowbind.com/boards/rpi-pico/

Honest status for the Pico: [REAL-HARDWARE LINE — for the Pico specifically]. The planner and the
wiring checks work from the board data and don't need the board.

If you spot a pin fact that's wrong in the Pico board file, I'd really like to know (each fact has a
source in boards/rpi-pico.sources.md).
```

### r/embedded

**Angle:** a technical discussion, not an announcement. Many embedded professionals there; tool posts
are often unwelcome. **Only post if the live rules allow it.** If not, skip and just take part in
threads.

**Title:**

```
Detecting external I2C pull-ups and crossed SDA/SCL from the MCU side: is this approach sound?
```

**Text:**

```
Disclosure first: this is for a tool I make (BoardPilot), but I'm mostly after critique of the
method.

To tell "no pull-ups" from "no device" from "crossed lines" without a logic analyser, the firmware:

- disables internal pull-ups and pull-downs on SDA and SCL and reads the level. HIGH with nothing
  driving it → an external pull-up is present. We only report the digital level; we never claim a
  voltage the ADC didn't measure.
- scans as wired, then with the pins swapped (easy on the ESP32's GPIO matrix; on AVR, RP2040, STM32
  and nRF52 we use a bit-banged I2C so any pin pair works, with clock stretching).
- reads a known ID register to confirm the part.

Known weak spots I'm aware of: a line held low by a stuck device looks like "no pull-up"; very weak
pull-ups with long wires can read LOW; bit-banged timing is not a real peripheral's timing.

What would you add or distrust? [REAL-HARDWARE LINE]

https://github.com/mojeee/boardpilot (source-available; agent firmware MIT)
```

**Before posting:** check each technical sentence against `firmware/agent` (clock stretching, pin
handling) and remove anything the code does not do.

---

## Hackaday tips line

**Good for:** a write-up on hackaday.com if an editor finds the hack interesting. It's the idea that
counts, not the product.

**Rules in short:** send tips by the form or email; it's fine to tip your own project; the description
must be complete even if the project isn't polished; tips are hit-or-miss. Sources:
[How best to get your project on Hackaday](https://hackaday.com/2021/04/27/how-best-to-get-your-project-on-hackaday/),
[Submit a tip](https://hackaday.com/submit-a-tip/). Tip once; don't resend.

**Draft (form fields):**

- **Subject:** Finding crossed I2C wires by scanning twice, once with SDA and SCL swapped in software
- **Link:** the dev.to article (below) if it's out, otherwise the GitHub repo
- **Text:**

```
Hi, I'm the maker of this, so take it as a self-tip.

Most "I2C sensor not found" problems I've seen were wiring, and one mistake is invisible to a normal
scanner: SDA and SCL crossed. On the ESP32 the I2C pins are set in software, so a firmware can scan
once as wired and once with the two pins exchanged; if the device answers only the second time, the
wires are crossed. Before that it checks for external pull-ups by turning off the internal ones and
reading the lines (HIGH with nothing driving them means pull-ups, so the module has power and both
wires arrive). Then it reads the chip ID, which catches BMP280s sold as BME280s (0x58 instead of
0x60 in register 0xD0).

It's part of BoardPilot, a desktop app that shows the result on a 3D model of the board; the
diagnostic firmware is MIT-licensed and does the same on RP2040, AVR, STM32 and nRF52 with a
bit-banged I2C. [REAL-HARDWARE LINE]

Write-up: [LINK]
Code: https://github.com/mojeee/boardpilot (firmware in firmware/agent)
Mojtaba Amini
```

---

## Hackster.io

**Good for:** a lasting project page that makers find by search.

**Rules in short:** Hackster is for projects: a story, the things used, steps and code. A pure product
ad does badly. Check the current community guidelines on the day.

**Draft structure:**

- **Title:** Find crossed SDA/SCL and fake BME280s on an ESP32 in 30 seconds
- **Things used:** ESP32 DevKit, GY-BME280 breakout, 4 jumper wires; software: BoardPilot (with the
  disclosure line), Arduino IDE.
- **Story:** the problem ("sensor not found"), the four checks (pull-ups, scan, swap scan, chip ID),
  why each works, with the Bosch datasheet sections; the 10-line swap-test sketch for people who don't
  want the app; the 3D view as screenshots; what it can't detect.
- **Code:** the swap-test sketch and the chip-ID sketch from
  [docs/youtube/videos/](../youtube/videos/) (MIT, yours).
- **Disclosure line at the top:** "I make BoardPilot, the app used in this project."
- **Real-hardware rule:** publish only with photos of the real ESP32 and BME280 on your desk and the
  results you actually got.

---

## dev.to

**Good for:** software developers; a technical article with code travels further than an announcement.

**Rules in short:** articles must be useful on their own; promotional posts without substance are
discouraged; tag honestly. Check the current terms on the day.

**Title:** How we detect crossed I2C wires with a swap test

**Tags:** `embedded`, `esp32`, `arduino`, `electronics`

**Outline:**

1. The bug: a working sensor that no scanner finds. (Short story, no product yet.)
2. How I2C idles: open-drain lines, pull-ups, ACK and NACK, with a decoded trace screenshot.
3. Check 1: detecting external pull-ups from the MCU (disable internal pulls, read the level) and
   its limits.
4. Check 2 and 3: the scan and the swap scan; why it works on the ESP32 (GPIO matrix), and the
   bit-banged approach on other chips.
5. Check 4: the ID register, and the BMP280 mix-up.
6. The 10-line sketch you can use today.
7. Where this lives: the diagnostic firmware (MIT) in BoardPilot, with the disclosure and
   `[REAL-HARDWARE LINE]`.
8. What it can't tell you.

**Opening paragraph:**

```
You wired four jumper wires from an ESP32 to a BME280. The code compiles, the library says "could
not find a valid sensor", and an I2C scanner finds nothing. The sensor is fine. It's answering, just
not on the pins the code is listening on. Here's how to prove that in about 30 seconds, from the
microcontroller itself, with no logic analyser.
```

---

## LinkedIn

**Good for:** your network, recruiters (career track), companies. Personal and specific beats
announcement style.

**Rules in short:** no automation of posting or messaging (LinkedIn's user agreement forbids bots);
tag people only if they're involved; a few relevant hashtags.

**Draft:**

```
For the last months I've been building BoardPilot: a desktop app that measures what's really
happening on a microcontroller board and shows it on a 3D model.

The problem it started from: "my sensor is not found". Most of the time it's the wiring, and one
mistake is invisible to a normal I2C scanner: SDA and SCL crossed. On an ESP32 the pins are set in
software, so the app scans twice, once swapped. If the sensor answers only the second time, you know.

A few things I learned building it:
• Honesty is a feature. Every result says where it comes from: a measurement from this session or a
  datasheet section. Guesses are labelled as suggestions.
• Hardware facts need sources. The 13 boards are data files, and every pin fact has one.
• Read-only by default. Nothing is written to a board without a click, and the flash is backed up
  first.

[REAL-HARDWARE LINE]. macOS and Windows, with a simulator if you have no board.
[LINK]

#embedded #esp32 #electronics
```

---

## X

**Good for:** short clips, the maker community, people who share tools.

**Rules in short:** no automated posting; no mass replies or mentions; disclose if you're promoting
your own product.

**Draft (2 posts, with [CLIP] on the first):**

```
1/ Your I2C sensor isn't dead. Scan once as wired, once with SDA and SCL swapped in software. If it
only answers swapped, your wires are crossed. [CLIP]

2/ I built this check (and a 3D view of every pin and I2C transaction) into BoardPilot, a desktop
app for ESP32, Pico, Arduino, STM32, nRF52 and Teensy. Source-available, simulator included.
https://github.com/mojeee/boardpilot
```

---

## Arduino Forum

**Good for:** Arduino users of every level; long life in search.

**Rules in short:** the forum has a showcase-type category for finished projects; advertising outside
it is not welcome. Read the forum's guidelines and the category's pinned post on the day; check
whether a source-available app with a paid plan later is acceptable there.

**Draft (English):**

```
Title: Free tool to check an Arduino sketch against your wiring (Uno, Nano, Mega and others)

Hi all, I make BoardPilot (disclosure). One part of it may be useful here even without buying
anything: it compares a sketch with the wiring you draw, and says when they disagree (LED on D13 in
the drawing, code driving D12; Serial.begin(9600) while the monitor is at 115200; a 3.3 V sensor on
the Uno's 5 V pins). It's a check of the drawing, not of your real wires.

[CLIP]

[PRICE LINE]. macOS and Windows. The part data behind it (380+ parts) is free to reuse under
CC BY 4.0: https://boardpilot.agentflowbind.com/parts/

Which mistakes should it catch that it doesn't? I read every reply.
```

**Italian section of the forum (separate post, a different week, only if its rules allow it):**

```
Titolo: Uno strumento per confrontare lo sketch con i collegamenti (Uno, Nano, ESP32, Pico…)

Ciao a tutti, sono Mojtaba e sviluppo BoardPilot (lo dico subito). Legge uno sketch Arduino e lo
confronta con i collegamenti disegnati: segnala per esempio Wire.begin(22, 21) quando SDA è sul 21,
pinMode(34, OUTPUT) su un pin dell'ESP32 che è solo ingresso, o Serial.begin(9600) con il monitor a
115200. È un controllo del disegno, non dei fili reali.

L'app è anche in italiano, per macOS e Windows, con un simulatore per provarla senza scheda.
[PRICE LINE in italiano]

Quali errori vedete più spesso nei progetti dei principianti? Mi piacerebbe aggiungerli.
```

(Have the Italian text read once by a native speaker before posting.)

---

## ESP32 forum and Raspberry Pi forums

**Good for:** specific technical audiences (esp32.com, forums.raspberrypi.com).

**Rules in short:** both are support forums first; many forums don't allow product posts outside a
specific section. On the day, find the section for projects or announcements and its rules. **If
there is none, skip:** answer questions in threads where the app's knowledge helps, without a link
unless someone asks.

**Draft (only where allowed):** a short version of the r/esp32 text (ESP32 forum) or the
r/raspberrypipico text (Raspberry Pi forums), rewritten in your own words; not the same text.

---

## Discord servers

**Good for:** conversations with people who are building right now.

**Rules in short:** only servers you already take part in; only in a channel meant for showing
projects (#showcase, #projects); read the server rules; never DM members about the app.

**Draft:**

```
I've been building a desktop app that shows an MCU board's pins, wires and I2C traffic in 3D, and
finds crossed SDA/SCL with a swapped scan. Disclosure: it's mine. Would love blunt feedback from
people who debug this stuff: [LINK] (simulator included, no board needed)
```

---

## Product Hunt

**Good for:** a one-day spike of general tech visitors. Optional: the audience is less embedded.

**Rules in short:** don't ask for upvotes (in posts, emails or DMs); the maker's first comment explains
the product. Check the current launch guidelines on the day.

**Draft:**

- **Name:** BoardPilot
- **Tagline (max 60):** See inside your board: pins, wires and I2C in 3D
- **Description (max 260):** A desktop app that finds wiring mistakes on ESP32, Pico, Arduino,
  STM32, nRF52 and Teensy boards: I2C scans, crossed SDA/SCL detection, chip-ID checks, all shown on a
  live 3D board with the source of every result. Simulator included.
- **Maker's first comment:** a shorter version of the Show HN text, with the licence and
  `[REAL-HARDWARE LINE]`.

---

## MCP directories

**Good for:** people using AI coding agents (Claude Code, Cursor, Claude Desktop).

**Where:** the official MCP Registry, the community list "awesome-mcp-servers" on GitHub, and
directory sites that accept submissions. **Check on the day** that each one still exists and accepts a
server that needs a desktop app running (BoardPilot's server is not an npm or Python package; it is
`BoardPilot --mcp-stdio`). If a directory only accepts packages or hosted servers, skip it and note
why.

**Listing text:**

```
BoardPilot — lets an AI coding agent use real measurements from the microcontroller board on your
desk: identify the chip, read pins, scan I2C with decoded traces, read the ADC, compare a sketch with
the wiring, check the wiring rules, and read the board's serial output. Every result says whether it
was measured or documented, with its source. Writes (flashing the diagnostic firmware, driving a pin)
only happen after a click in the app's confirmation dialog. Localhost only with a per-session token,
off by default. macOS and Windows. Setup: https://github.com/mojeee/boardpilot/blob/main/docs/mcp.md
```

---

## Awesome lists

**Where:** awesome-esp32, awesome-embedded-systems, awesome-arduino, awesome-raspberry-pi,
awesome-electronics (from the roadmap). Each has a `CONTRIBUTING.md`.

**Rules in short:** many awesome lists accept only open-source projects, or ask that the author not
add their own project. Read `CONTRIBUTING.md` first. If the app doesn't qualify, the **parts library
data (CC BY 4.0)** or the **diagnostic firmware (MIT)** may; submit that instead, or skip.

**Entry (adapt to each list's format):**

```
- [BoardPilot](https://github.com/mojeee/boardpilot) - Desktop app that finds wiring mistakes and shows pins, wires and I2C traffic on a 3D board (source-available; parts data CC BY 4.0).
```

Claude prepares the edit and the pull request text in your fork; you open the pull request.

---

## YouTube

See [docs/youtube/](../youtube/README.md) and [publishing.md → B](publishing.md#b-youtube-studio-per-video).
Rules: say you make the app in the video; no "like and subscribe" begging; real footage only.
