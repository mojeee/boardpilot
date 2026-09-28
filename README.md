# BoardPilot

Desktop app (macOS first) that guides you through embedded work on an ESP32 DevKit, with a live 3D view of the board. See `CLAUDE.md` for the product rules and architecture, `BUILD_PLAN.md` for the milestones.

## Run it

```bash
npm install
npm run dev        # opens the app in simulator mode (no hardware needed)
npm test           # 41 tests
npm run build      # production build into out/
npm run dist:mac   # .dmg via electron-builder
```

- **Simulator:** the ⚙ menu in the top bar switches between simulator and real board, loads scenarios (crossed SDA/SCL, BMP280 mix-up, unpowered sensor, no board, port busy, brownout, wrong baud) and has bench actions ("Fix the wiring", "Turn the knob").
- **Real board:** needs `pip3 install esptool`. Start in real mode with `BOARDPILOT_MODE=real npm run dev`, or switch in the ⚙ menu. Tests that look at pins need the diagnostic agent: build it once with `npm run build:agent` (needs `arduino-cli` and the `esp32:esp32` core, see BUILD_PLAN.md).
- **AI assistant:** copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. Everything else works without it.
- **Screenshots for checking:** `BP_SNAPSHOT=/tmp/x.png BP_SNAPSHOT_HASH='#demo=debug' npx electron .` (after `npm run build`) captures the window and quits. Demos: `debug`, `test`, `monitor`, `live`, `project` (simulator only).
