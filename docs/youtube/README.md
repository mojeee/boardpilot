# YouTube channel plan

Issue #23. Decisions taken on Sep 29, 2026: **voice and hands only** (no face), **one English
channel with Italian subtitles**, **1 long video every 2 weeks and 2 Shorts a week**.

| File | What it holds |
|---|---|
| [research.md](research.md) | The 10 channels, the patterns (R1 to R14), the gaps we can fill, and what is still to check in Chrome. It says clearly what was verified and what wasn't. |
| [format.md](format.md) | Positioning, the two series and Shorts, hooks, shots without a face, thumbnails, descriptions, the pre-publish checklist. Every rule points to research.md. |
| [recording-setup.md](recording-setup.md) | Low-budget kit and checklists for screen, desk, sound, light and editing. |
| [calendar.md](calendar.md) | Week 0 set-up and the first 8 weeks, day by day, plus the production rhythm. |
| [subtitles-it.md](subtitles-it.md) | Italian subtitle steps, style rules and the glossary taken from the Italian app. |
| [videos/](videos/) | The first 6 long videos, ready to record. |
| [shorts.md](shorts.md) | Scripts for the first 4 Shorts and 12 more ideas with their sources. |

## The first 6 videos

| # | Series | Title (first option) | Publish |
|---|---|---|---|
| 1 | Why doesn't it work? #1 | [My I2C sensor is not found (ESP32)](videos/01-i2c-sensor-not-found.md) | Week 1 |
| 2 | Embedded for software developers, Lesson 1 | [What is a microcontroller?](videos/02-lesson-what-is-a-microcontroller.md) | Week 3 |
| 3 | Why doesn't it work? #2 | [My BME280 has no humidity. It's not a BME280.](videos/03-bme280-no-humidity.md) | Week 5 |
| 4 | Embedded for software developers, Lesson 2 | [Hardware basics for software developers](videos/04-lesson-hardware-basics.md) | Week 7 |
| 5 | Why doesn't it work? #3 | [My ESP32 keeps restarting](videos/05-esp32-keeps-resetting.md) | Week 9 |
| 6 | Embedded for software developers, Lesson 3 | [C for embedded: bits and volatile](videos/06-lesson-c-for-embedded.md) | Week 11 |

Each video file has: title options, thumbnail concept, hook, full script with timing and shot list
(screen, desk, close-up; never a face), on-screen text, a table of every claim with its source in the
repo, the description with chapters and links, tags, a pinned comment and the Italian subtitle
notes.

## Honesty rules for every video

- Show only what the released app does. Features still under "Unreleased" in `CHANGELOG.md` wait for
  their release.
- Say "simulator" whenever the app runs in simulator mode. Real-board footage only after the flow has
  really run on that board (each script has a "real-board gate").
- The app is **source-available**, not open source. The parts data is CC BY 4.0 and the firmware is
  MIT.
- Say that you make the app, once, early in each video.

## What still needs you

- The channel name (default suggestion in [format.md](format.md#positioning)).
- The Chrome research pass in [research.md](research.md#3-to-fill-in-with-claude-in-chrome), then a
  re-read of format.md.
- The boards on the desk for the real-board parts (the list in `docs/roadmap-2026-10.md`).
- The price line in the description footer, once the "free public beta" change ships or not.

Publishing itself (YouTube Studio, with you clicking Publish) follows
[docs/launch/publishing.md](../launch/publishing.md).
