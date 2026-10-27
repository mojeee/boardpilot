# BoardPilot for AI agents (MCP)

AI coding agents write and debug firmware, but they cannot see the hardware: they guess registers and cannot know how the board is wired. BoardPilot runs a local [Model Context Protocol](https://modelcontextprotocol.io) server, so Claude Code, Cursor, Claude Desktop or any MCP client can use real measurements from the board on your desk.

Example: in Claude Code, "my BME280 returns zeros" → the agent calls `check_wiring` and `i2c_scan` through BoardPilot, sees the sensor answer only with SDA and SCL exchanged, and fixes the pin defines in the code it is writing.

## Turn it on

In BoardPilot: **AI settings → AI agents (MCP)** → switch it on. It is off by default. The panel shows the exact command for your computer.

### Claude Code

Copy the line from the settings panel, for example on macOS:

```bash
claude mcp add boardpilot -- /Applications/BoardPilot.app/Contents/MacOS/BoardPilot --mcp-stdio
```

On Windows the path is usually `%LOCALAPPDATA%\Programs\BoardPilot\BoardPilot.exe` (for example `C:\Users\<you>\AppData\Local\Programs\BoardPilot\BoardPilot.exe`).

### Cursor and Claude Desktop

Add a stdio server to the client's MCP configuration (`~/.cursor/mcp.json`, or Claude Desktop → Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "boardpilot": {
      "command": "/Applications/BoardPilot.app/Contents/MacOS/BoardPilot",
      "args": ["--mcp-stdio"]
    }
  }
}
```

## How it works

- **With the app open** (switch on): the app listens on `127.0.0.1` only, with a random token that changes every time the app starts, stored in the app's data folder where only your user can read it. `BoardPilot --mcp-stdio` (what the client starts) connects to it. Write requests appear in the app as the usual confirmation dialog.
- **With the app closed**: the same command runs BoardPilot without a window (for scripts, CI and hardware-in-the-loop tests). Every write is refused, because nobody is there to confirm it.
- Every call shows up in the app's session log and in the report, with the source "MCP: <client name>".

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list_ports`, `identify_board` | USB ports and the chip on a port (chip, flash, MAC, USB bridge) | no |
| `list_boards`, `get_board` | Board definitions: every pin with GPIO number, functions and flags, default buses, sources | no |
| `get_part`, `search_parts` | The open parts library: pins, voltage, I2C addresses, chip-ID register, gotchas, sources | no |
| `get_scene` | The project open in BoardPilot: board, parts, wires | no |
| `check_wiring` | The wiring rules on the project (or a scene you pass) | no |
| `check_code` | Compares an Arduino sketch with the project's wiring (pins, I2C, ADC, baud) | no |
| `read_pins`, `pullup_check`, `i2c_scan`, `i2c_read`, `adc_read` | Live measurements through the diagnostic agent, with decoded I2C traces | no |
| `read_serial` | A few seconds of the user's own firmware output | no |
| `get_log` | The session log | no |
| `edit_project` | Changes the project: add, remove or rename parts, add or remove wires, assign safe pins, write the code (`set_code`). Checked against the board and part files first; the wiring check runs on the result | the project only, after the user clicks **Apply** in the assistant panel (⌘Z undoes it) |
| `run_app_action` | Runs one of the app's own actions, the same list as the in-app assistant: connect and identify, back up, open the monitor, stream pins, debug a problem, test hardware, run the simulation, suggest code, export PDF… The app shows each step and the agent gets them back | only the ones that write, and only after the user's click in their confirmation dialog |
| `request_flash` | Asks the user to install the diagnostic agent (flash backed up first) | only after the user's click |
| `request_gpio_write` | Asks the user to drive a pin HIGH or LOW | only after the user's click |

Resources: `boardpilot://boards/<id>` and `boardpilot://parts/<id>` (JSON).

Every result has the same shape:

```json
{ "value": …, "confidence": "measured" | "documented", "source": "diagnostic agent: i2c_scan", "timestamp": "…", "boardId": "esp32-devkitc-30" }
```

`measured` comes from the board; `documented` from board and part files or the rules. In simulator mode every result also has `"simulated": true`: the ports, chips and readings come from the simulated bench, not real hardware. Nothing is estimated in the MCP layer, and a voltage is only ever reported when the ADC measured it. Errors use `{ code, humanMessage, hint }`.

## Safety

- Localhost only, with a session token; requests from web pages (with an `Origin` header) are refused.
- No access to your files beyond the board and part data, and no API keys are exposed.
- Nothing is written to the board without a click in BoardPilot. Headless, nothing is written at all.
- The project changes only when the user clicks Apply on the agent's change list. App actions that change the project (assign pins, change the board) are refused over MCP: the agent uses `edit_project` instead.
