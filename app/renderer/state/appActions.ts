// Runs the app's actions (shared/actions.ts) for the assistant and the ⌘K box: each run is a card
// in the assistant panel with its steps as they happen, and "Show me where it is" points at the
// button the user would click. Writes to the board go through the same confirmation dialogs as a
// click would; backups and reads need none.

import { APP_ACTIONS, actionById, type AppActionId } from '@shared/actions';
import type { McpActionAnswer } from '@shared/api';
import { BOARDS, PARTS, boardList, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { TEMPLATES } from '@shared/templates';
import { t } from '@shared/i18n';
import { log, useAi, useApp, useScene, type ActionStep, type ChatItem } from './store';
import { confirmInstallAgent, confirmRestore, startStream } from './hw';
import { useLayout } from './layout';
import { openNewProject, useProjects } from './projects';
import { useTemplate } from './templateRun';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Point at the place in the UI where an action lives: the element pulses for a moment. */
export function showWhere(where: string) {
  const el = document.querySelector<HTMLElement>(`[data-where="${where}"]`) ?? document.querySelector<HTMLElement>(`[data-where^="${where.split(':')[0]}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  el.classList.remove('where-pulse');
  void el.offsetWidth;
  el.classList.add('where-pulse');
  setTimeout(() => el.classList.remove('where-pulse'), 2600);
  return true;
}

const stopped = new Set<number>();
export const stopAction = (id: number) => {
  stopped.add(id);
  useAi.getState().patch(id, (x) => (x.role === 'action' && x.state === 'running' ? { ...x, state: 'stopped', steps: x.steps.map((s) => (s.status === 'run' ? { ...s, status: 'skip' } : s)) } : x));
};

class Stop extends Error {}

/** One running action: add and finish steps on its card. */
class Run {
  constructor(readonly id: number) {}
  private patch(fn: (steps: ActionStep[]) => ActionStep[], state?: 'done' | 'failed') {
    useAi.getState().patch(this.id, (x) => (x.role === 'action' ? { ...x, steps: fn(x.steps), state: state ?? x.state } : x));
  }
  check() {
    if (stopped.has(this.id)) throw new Stop();
  }
  step(text: string) {
    this.check();
    this.patch((s) => [...s, { text, status: 'run' }]);
  }
  /** Finish the running step (optionally with a new text). */
  ok(text?: string) {
    this.patch((s) => s.map((x, i) => (i === s.length - 1 && x.status === 'run' ? { text: text ?? x.text, status: 'ok' } : x)));
  }
  fail(text: string): never {
    this.patch((s) => [...s.filter((x) => x.status !== 'run'), { text, status: 'fail' }], 'failed');
    throw new Stop();
  }
  done(text?: string) {
    this.patch((s) => (text ? [...s.map((x) => (x.status === 'run' ? { ...x, status: 'ok' as const } : x)), { text, status: 'ok' as const }] : s.map((x) => (x.status === 'run' ? { ...x, status: 'ok' as const } : x))), 'done');
  }
}

/** Make sure the board is found and identified (only reads). */
async function ensureBoard(run: Run) {
  const conn = useApp.getState().conn;
  if (conn.chip && conn.port) return;
  run.step(t('Looking for the board on USB'));
  const ports = await window.bp.hw.listPorts();
  if (!ports.ok) run.fail(`${t(ports.error.humanMessage)} ${t(ports.error.hint)}`);
  const board = useApp.getState().conn.board;
  const port = ports.value.find((p) => p.boardIds?.includes(board)) ?? ports.value.find((p) => p.likelyBoard) ?? (ports.value.length === 1 ? ports.value[0] : undefined);
  if (!port) run.fail(t('No board on USB. Plug it in with a data cable, or open Connect to pick the port.'));
  run.ok(t('Picked the port {port}', { port: port.path }));
  run.step(t('Reading the chip (only reads)'));
  const id = await window.bp.hw.identify(port.path);
  if (!id.ok) run.fail(`${t(id.error.humanMessage)} ${t(id.error.hint)}`);
  run.ok(t('Board: {chip}', { chip: id.value.chip }));
}

const SCREEN: Record<string, Parameters<ReturnType<typeof useApp.getState>['setScreen']>[0]> = {
  project: 'newProject',
  newproject: 'newProject',
  connect: 'connect',
  flash: 'flash',
  debug: 'debug',
  monitor: 'monitor',
  test: 'test',
  report: 'report',
  learn: 'learn',
  home: 'home',
};

async function openTaskLazy(screen: Parameters<ReturnType<typeof useApp.getState>['setScreen']>[0]) {
  const { openTask } = await import('../components/TaskRail');
  if (screen === 'home' || screen === 'learn') useApp.getState().setScreen(screen);
  else openTask(screen);
}

async function execute(run: Run, id: AppActionId, arg: string) {
  const a = arg.trim();
  switch (id) {
    case 'open_screen': {
      const s = SCREEN[a.toLowerCase().replace(/[^a-z]/g, '')];
      if (!s) run.fail(t('There is no screen called “{name}”.', { name: a }));
      await openTaskLazy(s);
      return run.done(t('Opened {screen}', { screen: a }));
    }
    case 'connect_board': {
      await openTaskLazy('connect');
      run.step(t('Opened Connect: the app looks for the board'));
      for (let i = 0; i < 100 && !useApp.getState().conn.chip; i++) {
        run.check();
        await sleep(200);
      }
      const c = useApp.getState().conn;
      if (!c.chip) run.fail(t('No board answered yet. Follow the steps on the right.'));
      return run.done(t('Found {chip} on {port}', { chip: c.chip.chip, port: c.port ?? '' }));
    }
    case 'backup_flash': {
      await ensureBoard(run);
      const c = useApp.getState().conn;
      run.step(t('Reading {size} of flash (only reads)', { size: c.chip?.flashSize ?? '' }));
      const r = await window.bp.hw.backup();
      if (!r.ok) run.fail(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      run.ok();
      return run.done(t('Backup saved ({mb} MB). “Restore my firmware” puts it back.', { mb: (r.value.sizeBytes / 1024 / 1024).toFixed(1) }));
    }
    case 'restore_firmware': {
      if (!useApp.getState().conn.backups.length) run.fail(t('There is no backup for this board yet.'));
      run.step(t('Asking you to confirm the restore'));
      await confirmRestore();
      return run.done();
    }
    case 'install_agent': {
      await ensureBoard(run);
      if (useApp.getState().conn.agent) return run.done(t('The diagnostic agent is already running.'));
      run.step(t('Asking you to confirm: backup, then the agent'));
      const ok = await confirmInstallAgent();
      if (!ok) run.fail(t('Not installed: nothing was written.'));
      return run.done(t('Diagnostic agent running.'));
    }
    case 'flash_firmware': {
      await openTaskLazy('flash');
      return run.done(t('Opened Flash: pick your firmware file on the right. The app checks it, backs up the board and asks before writing.'));
    }
    case 'open_monitor': {
      await ensureBoard(run);
      await openTaskLazy('monitor');
      const baud = Number(a) > 0 ? Number(a) : 115200;
      run.step(t('Opening the serial port at {baud} baud', { baud }));
      const r = await window.bp.hw.openSerial(baud);
      if (!r.ok) run.fail(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return run.done(t('Monitor open.'));
    }
    case 'stream_pins': {
      await ensureBoard(run);
      if (!useApp.getState().conn.agent) run.fail(t('Live pins need the diagnostic agent. Ask me to install it, or use Test.'));
      run.step(t('Streaming the pins in the drawing'));
      const r = await startStream(20);
      if (!r.ok) run.fail(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return run.done();
    }
    case 'debug_problem': {
      const { useWizard } = await import('../wizard/session');
      useApp.getState().setScreen('debug');
      if (/^debug-/.test(a)) useWizard.getState().start(a);
      return run.done(a ? t('Started the check “{flow}”.', { flow: a }) : t('Opened Debug: pick what is wrong.'));
    }
    case 'test_hardware':
      await openTaskLazy('test');
      return run.done(t('Opened Test.'));
    case 'new_project':
      openNewProject(a === 'blank' || a === 'port' || a === 'template' ? a : null);
      return run.done(t('Opened New project.'));
    case 'open_template': {
      const tpl = TEMPLATES.find((x) => x.id === a) ?? TEMPLATES.find((x) => t(x.name).toLowerCase().includes(a.toLowerCase()) && a);
      if (!tpl) run.fail(t('No template called “{name}”.', { name: a }));
      useProjects.getState().add({ board: useScene.getState().scene.board, parts: [], wires: [] }, t(tpl.name));
      useTemplate.getState().open(tpl.id);
      return run.done(t('Built “{name}” in a new tab.', { name: t(tpl.name) }));
    }
    case 'run_simulation': {
      if (!useTemplate.getState().tpl) run.fail(t('The simulator runs template projects. Open a template first.'));
      useTemplate.getState().play();
      useLayout.getState().showBottom('log');
      const { useRunView } = await import('../components/TemplatePanel');
      useRunView.getState().set('story');
      return run.done(t('Running (simulated). The story is in the Log panel.'));
    }
    case 'assign_pins': {
      const scene = useScene.getState().scene;
      if (!scene.parts.length) run.fail(t('The project has no parts yet.'));
      const r = assignPins(scene, getBoard(scene.board), PARTS);
      useScene.getState().setScene(r.scene, true);
      for (const n of r.notes) log('action', t('Pin assigned: {note}', { note: n }), { source: 'pin rules (safe pins)' });
      return run.done(r.notes.length ? t('{n} pins assigned. ⌘Z undoes it.', { n: r.notes.length }) : t('Every part pin is already wired.'));
    }
    case 'suggest_code': {
      const { suggestCode } = await import('../components/codeSuggest');
      useLayout.getState().showBottom('code');
      run.step(t('Writing a suggestion for the Code panel'));
      await suggestCode(a || undefined);
      return run.done(t('The suggestion is in the Code panel: Tab accepts, Esc dismisses.'));
    }
    case 'show_code':
      useLayout.getState().showBottom('code');
      return run.done();
    case 'show_log':
      useLayout.getState().showBottom('log');
      return run.done();
    case 'show_view': {
      const v = a.toLowerCase();
      if (v.startsWith('sch')) {
        useScene.getState().set({ view: 'diagram' });
        (await import('../three/DiagramView')).setDiagramMode('schematic');
      } else if (v === '2d' || v.includes('pinout')) useScene.getState().set({ view: '2d' });
      else if (v.startsWith('dia') || v.startsWith('wir')) {
        useScene.getState().set({ view: 'diagram' });
        (await import('../three/DiagramView')).setDiagramMode('wiring');
      } else useScene.getState().set({ view: '3d' });
      if (useApp.getState().screen !== 'newProject') useApp.getState().setScreen('newProject');
      return run.done();
    }
    case 'set_board': {
      const b = BOARDS[a] ?? boardList().find((x) => a && x.name.toLowerCase().includes(a.toLowerCase()));
      if (!b) {
        (await import('../components/BoardPicker')).openBoardPicker();
        return run.done(t('Opened the board list.'));
      }
      (await import('./sceneActions')).changeBoard(b.id);
      return run.done(t('The project now uses the {board}.', { board: b.name }));
    }
    case 'export_pdf': {
      const { openExport } = await import('../components/ExportDialog');
      openExport();
      return run.done(t('Opened Export PDF.'));
    }
    case 'create_report':
      await openTaskLazy('report');
      return run.done(t('Opened Report.'));
    case 'ai_settings':
      (await import('../components/AiSettings')).openAiSettings();
      return run.done();
  }
}

/** Run an app action and show it as a card in the assistant panel. */
export async function runAction(id: string, arg = '', from: 'ai' | 'box' = 'ai'): Promise<boolean> {
  return (await runActionWithSteps(id, arg, from)).ok;
}

/** Run an app action for an MCP agent; the answer lists the steps the card showed. */
export async function runActionForAgent(id: string, arg: string, client: string): Promise<McpActionAnswer> {
  const def = actionById(id);
  if (!def) return { status: 'failed', steps: [], error: `unknown action ${id}` };
  // Project changes from an outside agent go through edit_project, which the user applies.
  if (def.editsProject) return { status: 'refused', steps: [], error: 'this action changes the project: use edit_project (assign_pins), or ask the user to do it in the app' };
  log('action', t('{client} (an AI agent) runs: {action}', { client, action: t(def.label) }), { source: `MCP: ${client}` });
  const r = await runActionWithSteps(id, arg, 'mcp');
  const status = r.state === 'failed' ? 'failed' : r.state === 'stopped' ? 'stopped' : r.ok ? 'done' : 'failed';
  return { status, steps: r.steps.map((s) => `${s.status === 'fail' ? 'failed: ' : s.status === 'skip' ? 'skipped: ' : ''}${s.text}`) };
}

async function runActionWithSteps(id: string, arg: string, from: 'ai' | 'box' | 'mcp'): Promise<{ ok: boolean; steps: ActionStep[]; state?: string }> {
  const def = actionById(id);
  if (!def) return { ok: false, steps: [] };
  useLayout.getState().toggleRight(true);
  if (useApp.getState().screen === 'newProject') useLayout.getState().setRightTab('assistant');
  const itemId = useAi.getState().push({
    role: 'action',
    actionId: def.id,
    arg,
    title: t(def.label),
    steps: [],
    state: 'running',
    where: def.where,
    readOnly: !def.writes,
  });
  const run = new Run(itemId);
  if (from !== 'mcp') log('action', from === 'ai' ? t('The assistant runs: {action}', { action: t(def.label) }) : t('Running: {action}', { action: t(def.label) }), { source: 'app action' });
  let ok = false;
  try {
    await execute(run, def.id, arg);
    ok = true;
  } catch (e) {
    if (!(e instanceof Stop)) {
      try {
        run.fail(e instanceof Error ? e.message : String(e));
      } catch {
        /* run.fail always throws Stop after marking the card */
      }
    }
  } finally {
    stopped.delete(itemId);
    useAi.getState().patch(itemId, (x: ChatItem) => (x.role === 'action' && x.state === 'running' ? { ...x, state: 'done' } : x));
  }
  const item = useAi.getState().items.find((x) => x.id === itemId);
  return item?.role === 'action' ? { ok, steps: item.steps, state: item.state } : { ok, steps: [] };
}

export { APP_ACTIONS };
