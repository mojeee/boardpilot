# Recording setup (voice and hands, low budget)

Issue #23, part 4. Prices are rough estimates from general knowledge (Sep 2026), not quotes.
Buy only what is missing; a recent phone already covers the camera.

## What to have

| Item | What to look for | Rough price |
|---|---|---|
| Phone as the desk camera | Any phone from the last 4 to 5 years that records 4K or 1080p at 30 fps | already owned |
| Overhead phone arm | A desk clamp arm or a small overhead stand that holds the phone flat, facing down, about 40 to 60 cm above the mat | €20–35 |
| Clip-on macro lens (optional) | For chip markings and pin labels (CU shots) | €10–20 |
| Microphone | A USB dynamic mic, or a wired clip-on (lavalier) mic into the computer. Dynamic mics pick up less room noise | €25–60 |
| Light | Two small LED panels with adjustable brightness, or one desk lamp plus daylight. Same colour temperature for both (about 5000 K) | €20–40 |
| Mat | The anti-static mat from the hardware list, plain colour, no clutter in frame | already planned |
| Boards and parts | The set in `docs/roadmap-2026-10.md` → "Proof on real hardware" (ESP32, Pico, Nano, Black Pill, GY-BME280, starter kit, data cables) | about €26–38 |
| Software | OBS Studio (screen and mic), DaVinci Resolve (editing, free version), both free | €0 |

**Total new spend:** about €75–155, plus the boards already planned.

## Screen recording (SCR)

- [ ] Record the **released build** you will link in the description (not `npm run dev`), unless
      the video is about building from source.
- [ ] Window size 1920×1080 (or 2560×1440 on a large screen), app in **English**
      (top bar → EN / IT).
- [ ] Close other apps; turn on "Do not disturb" (no notifications in the recording).
- [ ] In simulator mode, the top bar shows **Simulator**. Keep it visible in every simulator shot.
- [ ] Load the scenario from the ⚙ menu **before** pressing record, so the recording starts at
      the symptom.
- [ ] Click at a calm pace; pause 1 second on each result so it can be read.
- [ ] Record each flow twice: once at normal speed, once slower for close zooms in editing.
- [ ] 3D view: "Desk" stage for good looks; "Plain" when the 3D view must be read clearly (pin
      names, wires).
- [ ] The app's scripted demos (`#demo=…` in `app/renderer/demo.ts`, as used by
      `scripts/screenshots.mjs`) are fine for B-roll, because they are the real app in simulator
      mode. For the main story, record real clicks.

## Desk shots (DESK and CU)

- [ ] Phone flat, facing straight down, the mat filling the frame. Lock focus and exposure (long
      press on most phone camera apps).
- [ ] 1080p or 4K at 30 fps, landscape for long videos. For Shorts record a separate vertical take
      or leave room around the board to crop 9:16.
- [ ] Clean hands, sleeves up, no watch or ring that reflects light.
- [ ] Before touching wires: say what you are about to do. Unplug USB before rewiring.
- [ ] One CU shot of every module you name (the printing on the chip, the label on the board).
- [ ] Clap once in front of the camera at the start of each take: it lines up desk video and
      mic audio in editing.

## Sound

- [ ] Record the voice separately from the video, reading the script, in a quiet room with soft
      things around (curtains, a sofa). Record 10 seconds of silence first for noise removal.
- [ ] Keep the mic 10 to 15 cm from your mouth, a little to the side.
- [ ] Aim for peaks around −12 dB; no clipping.
- [ ] Your own voice only. No AI voice, and no music under the voice. If you add music later,
      only tracks with a clear licence for YouTube (for example the YouTube Audio Library).

## Light

- [ ] Two lights at 45° left and right of the mat, a little above, so the hands do not throw hard
      shadows on the board.
- [ ] No window light mixed with lamps in the same shot (the colour shifts).
- [ ] Check reflections on the ESP32's metal shield and on the mat before recording.

## Editing checklist

- [ ] Cut breathing pauses and false starts; keep the pace calm.
- [ ] On-screen text only for what the script lists under "On-screen text".
- [ ] "Simulator" or "Real board" label in a corner of every app shot (the app's own chip is enough
      if it is readable after scaling).
- [ ] Export 1080p (or 1440p), H.264, stereo AAC.
- [ ] Export the timed English captions (see [subtitles-it.md](subtitles-it.md)).
