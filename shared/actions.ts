// The app's actions, in one list: the assistant runs them for the user (the app_action tool),
// the "Ask AI or find anything" box (⌘K) finds them by name, and each one knows where it lives in
// the UI ("Show me where it is"). Actions that write to the board only open the usual
// confirmation dialog; nothing here writes by itself.

export type AppActionId =
  | 'open_screen'
  | 'connect_board'
  | 'backup_flash'
  | 'restore_firmware'
  | 'install_agent'
  | 'flash_firmware'
  | 'open_monitor'
  | 'stream_pins'
  | 'debug_problem'
  | 'test_hardware'
  | 'new_project'
  | 'open_template'
  | 'run_simulation'
  | 'assign_pins'
  | 'suggest_code'
  | 'show_code'
  | 'show_log'
  | 'show_view'
  | 'set_board'
  | 'export_pdf'
  | 'create_report'
  | 'ai_settings';

export interface AppActionDef {
  id: AppActionId;
  /** short name in the ⌘K list and in the assistant's action card */
  label: string;
  /** one plain sentence: what it does */
  hint: string;
  /** extra words people use for it (English and Italian) */
  keywords: string[];
  /** what the single argument is, if the action takes one */
  arg?: string;
  /** does it (possibly) write to the board? Then the confirmation dialog always comes first. */
  writes?: boolean;
  /** only reads the board */
  readsBoard?: boolean;
  /** changes the open project; an MCP agent needs the user's Apply first (the in-app assistant was asked directly) */
  editsProject?: boolean;
  /** where it is in the UI: a data-where value (menu items, buttons) for "Show me where it is" */
  where: string;
}

export const APP_ACTIONS: AppActionDef[] = [
  { id: 'open_screen', label: 'Open a screen', hint: 'Open Project, Connect, Flash, Debug, Monitor, Test, Report, Learn or Home.', keywords: ['go to', 'open', 'apri', 'vai'], arg: 'screen: project, connect, flash, debug, monitor, test, report, learn, home', where: 'menu' },
  { id: 'connect_board', label: 'Connect and identify the board', hint: 'Find the board on USB and read its chip. Only reads.', keywords: ['connect', 'identify', 'detect', 'usb', 'port', 'collega', 'identifica', 'porta'], readsBoard: true, where: 'menu:connect' },
  { id: 'backup_flash', label: 'Back up my board', hint: 'Save a copy of the program on the board to this computer. Only reads.', keywords: ['backup', 'back up', 'save firmware', 'copy', 'copia', 'salva'], readsBoard: true, where: 'menu:flash' },
  { id: 'restore_firmware', label: 'Restore my firmware', hint: 'Write the last backup back to the board (asks first).', keywords: ['restore', 'undo flash', 'ripristina'], writes: true, where: 'top:restore' },
  { id: 'install_agent', label: 'Install the diagnostic agent', hint: 'Back up the board, then install the helper that shows live pins (asks first).', keywords: ['agent', 'diagnostic', 'agente'], writes: true, where: 'menu:test' },
  { id: 'flash_firmware', label: 'Flash firmware', hint: 'Write a program to the board: pre-flight check, backup, confirmation.', keywords: ['flash', 'upload', 'write', 'program', 'carica', 'scrivi'], writes: true, where: 'menu:flash' },
  { id: 'open_monitor', label: 'Open the serial monitor', hint: 'Show what the program on the board prints.', keywords: ['serial', 'monitor', 'console', 'print', 'seriale'], arg: 'baud rate, e.g. 115200 (optional)', readsBoard: true, where: 'menu:monitor' },
  { id: 'stream_pins', label: 'Show live pins', hint: 'Stream the pins in the drawing to the 3D view and the plots (needs the agent).', keywords: ['live', 'stream', 'pins', 'plot', 'dal vivo'], readsBoard: true, where: 'menu:monitor' },
  { id: 'debug_problem', label: 'Debug a problem', hint: 'Start a guided check for a problem.', keywords: ['debug', 'problem', 'not working', 'sensor not found', 'problema', 'non funziona'], arg: 'flow: debug-sensor-not-responding, debug-board-not-detected, debug-keeps-resetting, debug-garbage-on-serial (optional)', where: 'menu:debug' },
  { id: 'test_hardware', label: 'Test hardware', hint: 'Check pins and buses, see decoded I2C.', keywords: ['test', 'i2c scan', 'scan', 'bus', 'prova'], readsBoard: true, where: 'menu:test' },
  { id: 'new_project', label: 'New project', hint: 'Open a new project: blank, read from port or template.', keywords: ['new', 'project', 'nuovo', 'progetto', 'blank', 'template'], arg: 'mode: blank, port, template (optional)', where: 'tabs:new' },
  { id: 'open_template', label: 'Start from a template', hint: 'Build a template project on this board.', keywords: ['template', 'example', 'blink', 'weather', 'modello', 'esempio'], arg: 'template id', where: 'tabs:new' },
  { id: 'run_simulation', label: 'Run in simulator', hint: 'Run the template project step by step without hardware.', keywords: ['run', 'simulate', 'simulator', 'play', 'esegui', 'simula'], where: 'code:run' },
  { id: 'assign_pins', label: 'Assign safe pins', hint: 'Wire every part to pins that are safe on this board.', keywords: ['wire', 'wiring', 'pins', 'assign', 'collega', 'pin'], editsProject: true, where: 'right:tools' },
  { id: 'suggest_code', label: 'Suggest code', hint: 'Code for the parts and pins in the drawing.', keywords: ['code', 'sketch', 'write code', 'codice'], arg: 'what the code should do (optional)', where: 'code:suggest' },
  { id: 'show_code', label: 'Show the code', hint: 'Open the Code panel.', keywords: ['code', 'editor', 'sketch', 'codice'], where: 'bottom:code' },
  { id: 'show_log', label: 'Show the log', hint: 'Open the session log.', keywords: ['log', 'history', 'registro'], where: 'bottom:log' },
  { id: 'show_view', label: 'Change the view', hint: '3D board, 2D pinout, wiring diagram or schematic.', keywords: ['3d', 'pinout', 'diagram', 'schematic', 'schema', 'view', 'vista'], arg: 'view: 3d, 2d, diagram, schematic', where: 'view:toolbar' },
  { id: 'set_board', label: 'Change the board', hint: 'Pick the board of the project.', keywords: ['board', 'esp32', 'pico', 'arduino', 'stm32', 'scheda'], arg: 'board id (optional: opens the list)', editsProject: true, where: 'top:board' },
  { id: 'export_pdf', label: 'Export PDF', hint: 'The electrical design as a drawing set: schematic, wiring, parts list, checks.', keywords: ['pdf', 'export', 'drawing', 'schematic', 'print', 'esporta', 'stampa'], where: 'top:export' },
  { id: 'create_report', label: 'Create a report', hint: 'A summary of this session to share.', keywords: ['report', 'summary', 'share', 'rapporto'], where: 'menu:report' },
  { id: 'ai_settings', label: 'AI settings', hint: 'Pick the AI provider and add your key.', keywords: ['ai', 'key', 'claude', 'gpt', 'gemini', 'chiave'], where: 'top:ai' },
];

export const ACTION_IDS = APP_ACTIONS.map((a) => a.id);

export const actionById = (id: string) => APP_ACTIONS.find((a) => a.id === id);

/**
 * Actions matching a search, best first: every word of the query must appear in the label, hint or
 * keywords (label matches rank higher). Labels and hints are compared in the UI language too.
 */
export function searchActions(query: string, tr: (s: string) => string = (s) => s): AppActionDef[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return APP_ACTIONS.slice(0, 8);
  const scored = APP_ACTIONS.map((a) => {
    const label = `${a.label} ${tr(a.label)}`.toLowerCase();
    const rest = `${a.hint} ${tr(a.hint)} ${a.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (label.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else return { a, score: -1 };
    }
    return { a, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

const STOP = new Set(['my', 'the', 'a', 'an', 'to', 'it', 'please', 'il', 'la', 'lo', 'le', 'i', 'mio', 'mia', 'per', 'favore', 'di', 'del', 'della', 'on', 'of']);

/** The one action a short phrase most likely means ("back up my board"), or null when unsure. */
export function bestAction(phrase: string, tr: (s: string) => string = (s) => s): AppActionDef | null {
  const words = phrase
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return null;
  let best: { a: AppActionDef; score: number } | null = null;
  for (const a of APP_ACTIONS) {
    const label = `${a.label} ${tr(a.label)}`.toLowerCase();
    const rest = `${a.hint} ${tr(a.hint)} ${a.keywords.join(' ')}`.toLowerCase();
    const score = words.reduce((n, w) => n + (label.includes(w) ? 3 : rest.includes(w) ? 1 : 0), 0) / words.length;
    if (!best || score > best.score) best = { a, score };
  }
  return best && best.score >= 1.5 ? best.a : null;
}

/** "flash my code, then open the monitor" → the actions in order (only when every part matches one). */
export function actionChain(text: string, tr: (s: string) => string = (s) => s): AppActionDef[] | null {
  const parts = text.split(/,?\s*(?:and then|then|after that|e poi|poi|dopo)\s+/i).filter((p) => p.trim());
  if (parts.length < 2) return null;
  const chain = parts.map((p) => bestAction(p, tr));
  return chain.every((a): a is AppActionDef => a !== null) ? chain : null;
}
