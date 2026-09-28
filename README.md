# BoardPilot

**See inside your ESP32.** BoardPilot is a macOS app that guides you through embedded work on a real board. Every pin, wire and bus transaction is visible in 3D, and every answer shows where it came from. English and Italian.

Website: **https://boardpilot.agentflowbind.com** · Download: [Apple Silicon](https://github.com/mojeee/boardpilot/releases/latest/download/BoardPilot-mac-arm64.dmg) · [Intel](https://github.com/mojeee/boardpilot/releases/latest/download/BoardPilot-mac-x64.dmg)

![BoardPilot finds crossed SDA and SCL wires](site/img/debug.jpg)

## What it does

- **Live 3D board** generated from the datasheet: click any pin for its functions, warnings and live level.
- **Debug wizard** that measures: pull-ups, I2C scan, the SDA/SCL swap test, chip ID; the result says what is wrong and where.
- **Test hardware**: I2C address grid, bus diagram, decoded bus view, GPIO and ADC tests.
- **Monitor**: serial console, live plots colored by pin, CSV recording, memory.
- **Parts library**: add, move, rotate and remove parts in 3D. Paste a product link and BoardPilot drafts the part and its 3D model for you to check.
- **Wiring checks** as you build: flash pins, input-only pins, strapping pins, voltage, crossed buses, missing ground.
- **Safe by default**: read-only unless you confirm; full flash backup before the first write; one-click restore.
- **Optional AI assistant** (your own Anthropic API key) that only states what it measured and cites sources.
- **Simulator mode**: the whole app works without hardware.

## License

BoardPilot is **source-available** under the [BoardPilot License](LICENSE.md): read, study, modify and build it; free for 30 days, then a license key is needed. The `firmware/` folder (diagnostic agent and BoardPilotProbe library) is [MIT](firmware/LICENSE).

## Develop

```bash
npm install
npm run dev        # the app, in simulator mode
npm test           # typecheck with npm run typecheck
npm run build:agent   # rebuild the ESP32 agent (needs arduino-cli + esp32 core)
npm run dist:mac   # .dmg files in dist/
```

- Real board: `brew install esptool arduino-cli`, then switch to *Real board* in the ⚙ menu (or `BOARDPILOT_MODE=real npm run dev`).
- AI: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.
- Releases: push a tag like `v0.2.0`; GitHub Actions builds both .dmg files and publishes the release. The website (folder `site/`) deploys on every push through Cloudflare Pages.
- License keys (maintainer only): `node scripts/make-license.mjs --name "Full Name" --plan personal`. The signing key lives in `~/.boardpilot/license-private.pem` and never enters the repo.

See `CLAUDE.md` for architecture and product rules, `BUILD_PLAN.md` for milestones.
