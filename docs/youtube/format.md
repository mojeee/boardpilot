# Channel format

Issue #23, part 2. Every recommendation points to a finding in [research.md](research.md)
(R1…R14). Several findings are still marked "to check"; when the Chrome pass changes a finding,
change the recommendation that points to it.

## Decisions already taken (Sep 29, 2026)

- **Voice and hands only.** No face on camera, ever. Evidence that this can work: R3.
- **One English channel with Italian subtitles.** Not two channels. Evidence: R13.
- **Rhythm:** 1 long video every 2 weeks and 2 Shorts a week, kept for 6 months. Evidence: R14.

## Positioning

**One line:** "Why embedded things don't work, and how to see it. For people who can code."

- **Who it is for:** software developers and hobbyists who can write code and are stuck on the
  hardware side: a sensor that is not found, a board that resets, a pin that does nothing.
  (Gaps 1 and 2 in research.md, R10, R12.)
- **What it promises:** each video finds one real cause, shows the evidence, and says where the
  fact comes from (a measurement, a datasheet section). (Gap 5, R4.)
- **What it is not:** not a product ad channel, not unboxings, not news. BoardPilot is the tool we
  use on screen, and we say so plainly (R9).
- **Channel name:** suggested default **"BoardPilot"**, with "Made by Mojtaba Amini" in the
  About text and every description. Alternative: your own name, if you want the channel to
  support the career track too. Decide before the banner is made.

## The three formats

### 1. "Why doesn't it work?" (long, 7 to 10 minutes)

One real wiring or firmware bug per video, solved with BoardPilot, then explained so the viewer
can find it without the app too.

- **Structure:** the symptom (0:00) → what people usually try (short) → the check that finds it,
  in the app and on the desk → why it happens (datasheet or rule, with the source on screen) →
  the fix → how to check it without BoardPilot → recap.
- **Why:** the tested-claim pattern (R4), a problem in the title (R5), fast hook (R7), length
  for one problem (R8).
- **Titles:** the symptom in the viewer's words, then the board. "My I2C sensor is not found
  (ESP32)". No clickbait we cannot back up (R5).
- **Numbering:** "Why doesn't it work? #1" in the video, in the playlist and at the end of the
  description, not at the start of the title (the start of the title is for search words). (R1)

### 2. "Embedded for software developers" (long, 9 to 12 minutes)

The 11 lessons of the Learn screen (the issue said 10; "Hardware basics" was added as lesson 2),
one per video, using the lesson's widgets, the "Show on the 3D board" split view and a real board
on the desk where we have one.

- **Structure:** a question a developer would ask (0:00) → the idea in code terms → the lesson
  widget on screen → the pin or register on the 3D board and on the real board → one common
  mistake → the lesson's interview questions as a recap.
- **Why:** series by level (R10), a larger audience of developers (R12), numbered lessons build a
  habit (R1).
- **Titles:** the topic plus "for software developers". "What is a microcontroller? (for
  software developers)".
- **Numbering:** "Lesson 1", "Lesson 2"… in the video and the playlist.

### 3. Shorts (vertical, 30 to 50 seconds)

Two a week. Each Short is one fact with one visual: a pin, a register value, a wire. Cut from the
long videos (the best 30 seconds, re-framed vertically) or recorded on purpose from the app.
When the motion graphics from issue #22 exist, Shorts can use them too.

- **Structure:** the claim in the first second (on-screen text) → the proof (app or desk) → one
  line on what to do → "full video" link to the related long video.
- **Why:** hook first (R7), one object on screen (R6).
- Shorts can be up to 3 minutes on YouTube now; we keep them short on purpose.

## Hook (first 15 seconds), every long video

Evidence: R7 (to be confirmed in the Chrome pass).

1. **0 to 5 s:** the symptom on screen: the error message, the silent serial monitor, the LED that
   does not light. No logo, no music intro.
2. **5 to 12 s:** one sentence that says what the video will find, and a hint of the answer
   ("it answered, just not where the code was looking").
3. **12 to 15 s:** our short fixed line (our own, not borrowed): "Let's find out why." Then
   straight into the video.

The disclosure comes right after the hook, one sentence: "I'm using BoardPilot, an app I make.
Everything it measures here, I'll also show you how to check by hand." (R9)

## How hardware appears on screen (no face)

Evidence: R3, R6.

| Code | Shot | Used for |
|---|---|---|
| **SCR** | Screen recording of the app, 1920×1080 or 2560×1440, cursor visible | Every flow, lesson, 3D view |
| **DESK** | Phone overhead, looking straight down at the mat, hands in frame | Wiring, swapping wires, pressing buttons |
| **CU** | Close-up of the board or module (phone close, or a clip-on macro lens) | Chip markings, pin labels, the "BME280" printed on a BMP280 board |
| **SPLIT** | DESK or CU on one side, SCR on the other | The real wire and the 3D wire at the same time |
| **TXT** | A plain text card in the app's colours (IBM Plex, dark background) | Rules, formulas, the recap |

Rules:

- **Simulator or real, always said** (our own rule, not from the research: CLAUDE.md product rule 4,
  honest sources). If a result comes from simulator mode, the corner of the
  screen says "Simulator" (the app shows it too) and the voice says so. Never cut simulator
  results next to real-board footage so that they look measured.
- **Real-board shots only after running it for real.** Before recording a real-board segment,
  run the flow on the board. If the result is not what the script says, change the script, not
  the footage.
- Pin and wire colours in overlays use the app's pin role colours (SDA `#3FB6E8`, SCL `#9ADCF7`,
  power `#FF6B5E`, ground `#8A96A3`) so the desk and the 3D view match.

## Thumbnails (no face)

Evidence: R6 (to be confirmed in the Chrome pass).

- One object, large: the real board or module (CU shot) or the 3D board from the app.
- 0 to 4 words, big, in IBM Plex Sans Bold. The words add to the title, they do not repeat it.
- One accent colour from the design tokens (warning orange `#F2A93B`, error red `#FF5D52`, SDA
  blue `#3FB6E8`) on the dark background `#161B21`.
- A series mark in one corner (small "WHY?" tag or "LESSON 3" tag) so the series are
  recognisable (R1).
- Made from our own footage and our own app. No stock images of other people's products.

## Descriptions

Evidence: R2, R9.

Every description has, in this order:

1. Two sentences: what the video finds, in plain words.
2. The written companion: the matching page on our website (parts page, pinout page, wiring
   guide) or a doc in the repo.
3. **Chapters** (first one at 0:00, at least three, each at least 10 seconds long).
4. The standard footer:

```
BoardPilot is an app I make (Mojtaba Amini). It's for macOS and Windows and works without
hardware in simulator mode.
Download: https://github.com/mojeee/boardpilot/releases/latest
Website: https://boardpilot.agentflowbind.com
Source code (source-available): https://github.com/mojeee/boardpilot
[PRICE LINE — check before publishing: "Free during the public beta." only if that change has
shipped; otherwise "Free 30-day trial."]
Parts library data: CC BY 4.0. Diagnostic firmware: MIT.
Sottotitoli in italiano disponibili.
```

Never write "open source" for the app: it is source-available (see `LICENSE.md`).

## Pinned comment

Evidence: none yet; this is general practice. Add "pinned comment: yes/no, what kind" to the Chrome
pass in research.md part 3 and keep or drop this based on what the channels do.

One per video, from the channel account: a question that asks for the viewer's own case ("What
was the strangest reason your sensor wasn't found?") plus one useful link. Never ask for likes,
subscriptions or votes in the pinned comment.

## End screen

Evidence: none yet (general practice, to check in the same Chrome pass).

Last 10 to 15 seconds: the next video in the same series and the other series' latest video. The
voice says why the next one is worth watching, in one sentence. No "smash the like button".

## What each video must pass before publishing

- [ ] Recorded from a released build (the version is in the description). If a feature is only in
      "Unreleased" in `CHANGELOG.md`, the video waits for the release that ships it.
- [ ] Every claim in the script is in the claims table of the video file, with its source.
- [ ] Simulator results are labelled as simulated, on screen and in the voice.
- [ ] Nothing that writes to a board is shown without the confirmation dialog on screen.
- [ ] Italian subtitles uploaded and read through once (see [subtitles-it.md](subtitles-it.md)).
- [ ] Description footer with the correct price line.

## Where things are

- Research: [research.md](research.md)
- Recording setup: [recording-setup.md](recording-setup.md)
- First 8 weeks: [calendar.md](calendar.md)
- Italian subtitles: [subtitles-it.md](subtitles-it.md)
- First 6 videos: [videos/](videos/)
- First 4 Shorts and the next ideas: [shorts.md](shorts.md)
