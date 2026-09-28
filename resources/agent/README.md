# resources/agent

Prebuilt images of the BoardPilot diagnostic agent (`firmware/agent`), one folder
per board. The app ships this folder, so end users never need arduino-cli.

This folder is filled by:

```sh
npm run build:agent                  # every board in boards/*.json
npm run build:agent -- rpi-pico      # only some boards
```

which runs `scripts/build-agent.sh` (`scripts/build-agent.mjs`) and writes:

```
resources/agent/
  index.json                 agent version, core versions, every board built (fqbn, format, memory use)
  <boardId>/
    manifest.json            { name, ver, board, fqbn, format, parts: [{ offset, file }], chip? }
    agent.bin | agent.uf2 | agent.hex   (+ bootloader.bin, partitions.bin, boot_app0.bin on ESP32 chips)
```

Offsets in `parts`:

| Board type | Parts |
| --- | --- |
| ESP32 | `bootloader.bin` 0x1000, `partitions.bin` 0x8000, `boot_app0.bin` 0xe000, `agent.bin` 0x10000 |
| ESP32-S3, ESP32-C3 | same, but `bootloader.bin` at 0x0 |
| RP2040 / RP2350 (`uf2`), AVR, Teensy, nRF52 (`hex`) | one file at 0x0 (addresses are inside the file) |
| STM32 (`bin`) | `agent.bin` at 0x08000000 |

The app writes these parts with the board's flasher, only after it has backed up
the board's flash (where the board allows it) and the user has confirmed.
