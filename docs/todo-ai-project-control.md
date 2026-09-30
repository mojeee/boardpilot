# To do: the chat and MCP can do everything in the app

Goal (from the user): the in-app assistant chat **and** any MCP agent can do everything the app does: run the project, analyse the port, change things on the board, add parts, diagnose, write and check code. The same safety rules apply: board writes only after the confirmation dialog, project changes only after Apply.

Branch: `claude/ai-project-control`. Written 2026-09-30.

## Done on this branch

- `shared/sceneEdit.ts`: one module for project changes, used by both the chat and MCP. Changes are `add_part`, `remove_part`, `rename_part`, `add_wire`, `remove_wire`, `assign_pins` and `set_code`. Every change is checked against the board and part files, applied to a copy of the project, and the wiring rules run on the result (including which findings are new). Tests: `tests/sceneEdit.test.ts`.
- **MCP `edit_project`** (`app/main/mcp/tools.ts`): checks the changes first, so the agent gets a plain error for a wrong pin or part id, then asks the window (`evt:mcpSceneEdit` → `mcp:sceneEditResult`, 3 min timeout). Refused when headless. Tests are in `tests/mcp.test.ts`.
- **MCP `run_app_action`**: runs any action from `shared/actions.ts` in the window (`evt:mcpAction` → `mcp:actionResult`, 10 min timeout) and returns the steps the card showed. Actions marked `editsProject` (`assign_pins`, `set_board`) are refused over MCP; the agent uses `edit_project` instead.
- **Chat `edit_project` tool** (`app/main/ai/tools.ts`, prompt line in `app/main/ai/prompt.ts`): the reply carries `sceneEdit`, and the assistant panel shows the change list with Apply / Not now (`EditCard` in `app/renderer/components/AssistantPanel.tsx`). Apply is one undo step (`commitProjectEdit` in `app/renderer/state/sceneActions.ts`).
- Italian text for every new string (`shared/i18n/it/app.ts`), docs (`docs/mcp.md`), changelog.
- Checked: `npm run typecheck` is clean, `npm test` passes.

## Still to do

1. **Test it in the real app** (not tested yet): `npm run dev`, turn MCP on, then from Claude Code:
   - `edit_project` adding an LED on D26 → the card shows in the assistant panel → Apply → the part and wire show in 3D, and ⌘Z undoes it.
   - Not now → the agent gets "refused". Waiting over 3 minutes → the card says it timed out.
   - `run_app_action connect_board`, `run_simulation` (on a template), `suggest_code`, `install_agent` (the confirmation dialog must open).
   - In the chat: "add a second LED on D27" → the model calls `edit_project` → the card shows.
2. **Chat tools missing next to MCP.** Add `list_ports`, `identify_board` and `check_code` to the chat (`TOOLS` and `runTool` in `app/main/ai/tools.ts`). `runTool` already gets the scene, so `check_code` can use `scene.sketch`. `get_board` and `search_parts` are optional. Add them to `tests/assistant-actions.test.ts`.
3. **`set_code` and undo.** `keepSketch` in `app/renderer/state/store.ts` keeps the code out of the drawing's undo, so ⌘Z does not bring the old code back after a `set_code`. Either make `set_code` a Code-panel suggestion (`replace: true`, accepted with Tab, which the editor's own undo covers), or keep the old code in the log. Until then the card's "⌘Z undoes it" is wrong for code changes.
4. **Change the board over MCP.** `set_board` is refused for MCP (`editsProject`). Add a `set_board` change to `sceneEdit` by moving the pure part of `changeBoard` (in `sceneActions.ts`) into `shared/`, so it gets the same Apply card.
5. **Apply card for project actions over MCP** (optional): instead of refusing `editsProject` actions, show them on the same Apply card (`McpEditCard` with an action instead of changes).
6. **"Run the project" on real hardware**: right now `run_app_action flash_firmware` only opens the Flash screen, where the user picks a file. Add a way to build the project's sketch and flash it (build → pre-flight → backup → confirmation), usable from the chat and MCP. This needs arduino-cli on the user's computer or a build service: decide which first (CLAUDE.md: ask before adding a dependency).
7. **Measurement tools in the chat vs MCP**: `read_serial` is in MCP only; add it to the chat.
8. **Clean up**: `runAction` in `app/renderer/state/appActions.ts` used to let `run.fail` throw out of its `catch`. That is now caught; check that the ⌘K box and the chat still show failed actions correctly.
9. Screenshot of the Apply card for `docs/mcp.md` and the site.
