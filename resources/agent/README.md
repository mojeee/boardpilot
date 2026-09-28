# resources/agent

Prebuilt binaries of the BoardPilot diagnostic agent (`firmware/agent`). The app
ships this folder, so end users never need arduino-cli.

This folder is filled by:

```sh
npm run build:agent
```

which runs `scripts/build-agent.sh` and writes:

| File | Flash offset |
| --- | --- |
| `bootloader.bin` | `0x1000` |
| `partitions.bin` | `0x8000` |
| `boot_app0.bin` | `0xe000` |
| `agent.bin` | `0x10000` |
| `manifest.json` | name, version, chip and the list above |

The app flashes the parts listed in `manifest.json` with esptool, only after it
has backed up the board's flash and the user has confirmed.
