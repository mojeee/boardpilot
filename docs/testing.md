# Testing BoardPilot

Three layers, all in simulator mode, so no board is needed:

| What | Command | Where |
|---|---|---|
| Unit tests (logic: wiring and code checks, flows, parsers, board files, drawing set, Read from port against the simulated bench…) | `npm test` | `tests/*.test.ts` (Vitest) |
| Type checks | `npm run typecheck` | the three `tsconfig.*.json` |
| End-to-end tests of the built app, one per scenario | `npm run test:e2e` | `e2e/*.e2e.ts` (Playwright + Electron) |

## End-to-end tests

`npm run test:e2e` builds the app, then starts it once per test with a fresh profile
(`BP_PROFILE`), the simulator (`BOARDPILOT_MODE=sim`) and no network AI (`BOARDPILOT_DEMO_AI_URL=off`).
Files the app saves go to a temporary folder without a dialog (`BP_SAVE_DIR`). On Linux without a
display the script runs under `xvfb-run` with software WebGL. Extra arguments go to Playwright:

```sh
npm run test:e2e                      # build, then every scenario
npm run test:e2e -- --no-build -g PDF # one scenario, without rebuilding
```

Scenarios (`e2e/scenarios.e2e.ts`):

- the project page: 3D view, assistant, Code and Log, project tab; panels collapse and come back
- connect and identify
- new project: Blank, Template (run in the simulator, running line, story in the Log), Read from
  port (agent after the confirmation, chip ID, crossed wires, banner), Describe it (without the AI)
- flash firmware with the backup first
- each debug flow on its simulator scenario (sensor not responding, board not detected, keeps
  resetting, garbage on serial)
- monitor, test hardware (I2C scan), report
- export PDF (a real PDF on A3, four sheets)
- ⌘K runs "back up my board" without the AI, and "Show me where it is"
- the AI does an app action: a fake free-demo relay answers with an `app_action` tool call, the app
  backs up the board step by step

Failures keep a screenshot and a Playwright trace in `out/e2e-results/`; the HTML report is in
`out/e2e-report/`.

## Screenshots

The README and website pictures come from the real app in simulator mode:

```sh
npm run build && node scripts/screenshots.mjs          # docs/img/*.jpg and site/img/*.jpg
node scripts/screenshots.mjs boards                    # 3D view of every board (social images)
npx electron scripts/render-social.cjs boards          # then the social cards
npm run build:web && npx electron scripts/demo-posters.cjs   # "Try it live" posters (site/img/demo)
```

On Linux without a display, prefix the Electron commands with `xvfb-run -a` and add `--no-sandbox`; for
the posters give Xvfb a bigger screen (`xvfb-run -a -s "-screen 0 2560x1600x24"`), otherwise the 2× window
does not fit and the script stops.

## Drive-through before the release (Sep 29, workspace redesign)

Claude drove the built app in simulator mode through every scenario above (Playwright, plus the
screenshot runs, each picture checked by eye): the screen, the 3D view and the log after every
action. 18 of 18 scenarios pass. What the drive-through found:

| What | Status |
|---|---|
| Flash firmware in the simulator stopped at the pre-flight check ("the file could not be read"): the simulator's sample firmware has no file on disk. Older than the redesign. | Fixed: the check is simulated and labelled so; a real path is still read. Unit and end-to-end tests. |
| "I noticed" cards from one project tab showed up in the others. | Fixed: a notice belongs to the tab it is about. |
| At 1600 px the "Ask AI or find anything" box overlapped the board chip once a board was connected. | Fixed: it shortens to "Ask AI or find…", then to ✦ ⌘K. |
| With a long sketch on a board with many pins (NUCLEO-F401RE) the free demo AI request came within 1 KB of its 48 KB limit. | Fixed: for the free demo only, the code in the context is cut to its first 60 lines when needed. Tested. |
| Home and Learn had the Code/Log panel under them, halving the lesson. | Fixed: those two pages have no bottom panel. |
| Browser demo (1200 × 750): an ESP32 strapping-pin "I noticed" card on a Raspberry Pi Pico. The demo loads the ESP32 bench and switches board within the second the notice waits. | Fixed: a waiting notice is dropped when the checks no longer find it, and a card already shown turns into "The checks no longer find this". Unit test (`tests/notices.test.ts`). |
| Narrow 3D view (browser demo, laptop screens): the Light switch sat on top of "Draw wire" and "Parts"; the colour legend ran into the keyboard hint; in Italian the ⌘K box was cut. | Fixed: Light and Detail are part of the toolbar and wrap under it; the hint hides below 840 px; the box shows ✦ alone when squeezed. |
| The "Try it live" posters came out 1200 × 960 with a 600 px layout under Xvfb: its default screen is too small for a 2× window. | Fixed: the script stops on a wrong size, and the doc gives the Xvfb screen to use. |
| "Board not detected" in the no-board scenario never reaches a result card. | As designed: no board ever appears, so the flow ends on the driver step with "Explain what went wrong" and "Check again" (no dead end). The test checks exactly that. |
| Detail → Labels at the overview zoom: chip tags can cover pin tags. | Open, cosmetic: Labels is meant for a closer camera (Module view). |
| The "Import from a link" screenshot could not be retaken here: the product site answers 403 to this machine. | Open: the picture keeps the previous layout; retake it with `node scripts/screenshots.mjs import` on a normal connection. |
| Real AI answers (Claude, GPT, Gemini, the free demo relay) | Not driven here (no keys, no relay access): the AI scenario uses a fake relay that answers with a real `app_action` tool call. Try "back up my board" and "add a BME280 and an OLED" with a real key before the release. |
| Real boards | Not tested (none on this machine): see the week-4 hardware plan in the roadmap. |
