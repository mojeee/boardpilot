# Motion clips for social posts

Short muted clips (10 to 15 seconds) recorded from the **real app** in simulator mode, with captions, highlight rings and arrows drawn on top. Nothing is mocked up: the board, the wizard, the log and the lessons are the app itself, driven by the same `#demo=` links as the screenshots. Anything the simulated board produced carries a **Simulator** label on screen; Learn widgets carry **Lesson**.

## Render

```sh
npm run motion                                  # build, then every clip in every format
npm run motion -- found-it pwm                  # some clips
npm run motion -- --format 9x16                 # one format (or 16x9,1x1)
npm run motion -- --fps 10 honest-ai            # quick preview at a lower frame rate
npm run motion -- --keep-frames                 # keep the PNG frames after encoding
```

`npm run motion` builds the app first; `node scripts/render-motion.mjs …` renders an existing build. On Linux without a display the script runs Electron under `xvfb-run` with software WebGL, like the screenshot script.

**Same result every time.** Each render starts from a fresh app profile (new trial, no saved project, English UI). The app sets itself up in real time, then a virtual clock ([`motion/clock.js`](../motion/clock.js)) takes over: timers, animation frames (three.js, the overlay camera) and CSS animations move exactly one video frame per capture. A slow machine renders slower, not choppier. Live data from the simulated board still arrives in real time, so on a very slow machine the live pin values can look faster than they are.

**ffmpeg** is used as a system tool when it is installed (it is not an npm dependency): it turns the frames into MP4 (H.264, `yuv420p`, no audio track) and GIF (15 fps, half size). Without ffmpeg you get the PNG frames and the script prints the commands to run later. Install it with `brew install ffmpeg` (macOS), `winget install ffmpeg` (Windows) or `apt install ffmpeg` (Linux). By hand, for one clip:

```sh
ffmpeg -y -framerate 30 -i motion/out/found-it/9x16/frames/frame-%05d.png -an -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart motion/out/found-it/found-it-9x16.mp4
```

## Output

Everything goes to `motion/out/` (git-ignored; not `out/`, which electron-builder packages into the app):

| File | What it is |
|---|---|
| `motion/out/<clip>/<clip>-<format>.mp4` | The clip: H.264, 30 fps, muted. |
| `motion/out/<clip>/<clip>-<format>.gif` | The same clip as a looping GIF, 15 fps, half size. |
| `motion/out/<clip>/<clip>.en.srt`, `<clip>.it.srt` | Caption files. The captions are burned in, in English; upload the Italian file as subtitles. |
| `motion/out/<clip>/<format>/frames/` | PNG frames (kept without ffmpeg, or with `--keep-frames`). |

## Formats

| Format | Size | Where | Layout |
|---|---|---|---|
| `16x9` | 1920 × 1080 | YouTube, X, LinkedIn | The app fills the frame; the caption is a lower third. |
| `1x1` | 1080 × 1080 | Instagram and LinkedIn feed | Caption band on top, the app below. |
| `9x16` | 1080 × 1920 | YouTube Shorts, Reels, TikTok | Tall caption band on top, the app below at a narrower window size. |

The page is captured at twice the CSS size (device pixel ratio 2), so the app stays sharp. The app keeps its desktop layout and a "camera" (a CSS transform) frames the part that matters, moving between steps.

Rules from the issue, checked by `tests/motion.test.ts`: at most 6 words per caption (8 on screen with the brand name and the tag), captions at least 48 px tall in the video, colours only from `tokens.css`, fonts IBM Plex.

## The clips

| Clip | Title | Message | Opens |
|---|---|---|---|
| `found-it` | Found it | The swap test finds crossed SDA and SCL wires; the rings flash on the sensor's SDA and SCL, then the evidence card slides in. | `#demo=debug`, crossed-wires scenario |
| `honest-ai` | Honest AI | Every finding carries its source: the **Measured** badge, `measured: pullup_check` on D21/D22, the log's source column, suggestions labelled as such. | `#demo=debug` |
| `thirteen-boards` | 13 boards | All 13 boards, each generated in 3D from its data file, with its name. | `#demo=board&bare=1` |
| `parts-library` | 380+ parts | Parts from the built-in library drop onto the bench. | `#demo=board` |
| `register-bits` | Register bits | The Learn lesson on bits: each button runs one line of C (typed on screen) and the register changes. | `#screen=learn&lesson=c-bits` |
| `pwm` | PWM | The duty cycle grows: the wave widens, the LED brightens, the motor speeds up. | `#screen=learn&lesson=essentials` |
| `i2c-decode` | I2C decoded | One register read decoded bit by bit: start, address, ACK, register, restart, data, stop. | `#demo=test`, crossed-wires scenario |
| `no-hardware` | Works without hardware | The Simulator chip, the Simulator / Real board switch and the scenarios: every task runs without a board. | `#demo=live` |

The **Honest AI** clip shows the source badges on the wizard result and the log, not a reply from a language model: a model reply needs a key and the network and is different every time, and the clip must never show an answer the app did not give. The post texts for each clip are in [launch/motion-posts.md](launch/motion-posts.md).

## Adding or changing a clip

Clips are data in [`motion/clips.json`](../motion/clips.json) (types in `shared/motion.ts`):

- `hash`: the app link to open (`#demo=…`, `#screen=…`); `ready`: a CSS selector that exists once the demo reached its state; `settle`: extra seconds to wait.
- `setup`: steps run before recording (for example the first camera framing). `steps`: the timeline, each with `at` in seconds.
- Step types: `caption` (English on screen, Italian for the subtitles), `uncaption`, `ring` and `arrow` (a selector, optional `text` to pick the element containing it, a `tone` from the tokens), `clear`, `camera` (frame a selector or `all`; `fill` makes it cover the frame), `click`, `slide` (a range input), `pan` (scroll a wide panel), `hide` / `reveal` / `type` (wipe an element in), `scroll`, `board` (also shows its name), `part` (drops a library part, the 3D camera pulls back), `view` (camera preset), `focus` (3D targets like `wire:w1`), `mode`.
- `tag`: `Simulator` for anything the simulated board produced, `Lesson` for a Learn widget. `post`: the post text in English and Italian.

The overlay code is in `app/renderer/motion/` and loads only when the capture window opens with `motion=1`; the capture itself is `app/main/motion.ts`, active only with `BP_MOTION` set. Neither is shown in normal use.
