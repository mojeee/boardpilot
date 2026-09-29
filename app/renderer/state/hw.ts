// Renderer-side hardware helpers: the FlowHardware adapter over IPC, event wiring, and the
// "ask first, then write" helpers that every write in the UI goes through.

import type { FlowHardware } from '@shared/flow';
import type { AgentReplyMap, AgentRequest, Result, TargetRef } from '@shared/types';
import { canBackupFlash, getBoard, pinByGpio, pinById, PARTS } from '@shared/board';
import { currentBoard, useApp, useConfirm, useLive, useLog, useScene, log } from './store';
import { t } from '@shared/i18n';

const bp = () => window.bp;

export async function agent<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): Promise<Result<AgentReplyMap[K]>> {
  return (await bp().hw.agent(req)) as Result<AgentReplyMap[K]>;
}

export const flowHardware: FlowHardware = {
  listPorts: () => bp().hw.listPorts(),
  identify: (port) => bp().hw.identify(port),
  state: () => useApp.getState().conn,
  agentReady: () => !!useApp.getState().conn.agent,
  installAgent: (token) => bp().hw.installAgent(token),
  agent: (req) => agent(req),
  captureSerial: (baud, ms) => bp().hw.captureSerial(baud, ms),
  flashUser: (token, path) => bp().hw.flashUser(token, path),
  preflight: (path) => bp().hw.preflight(path),
};

let wired = false;

/** Subscribe once to main-process events. */
export async function wireEvents() {
  if (wired || !window.bp) return;
  wired = true;
  const api = bp();
  // An AI agent asked over MCP to write to the board: the same dialog as always, and the answer
  // goes back to the agent. Nothing is written without the click.
  api.on.mcpWrite(async (ask) => {
    let ok = false;
    if (ask.req.kind === 'flash_agent') ok = await confirmInstallAgent(t('{client} (an AI agent) asks to install the diagnostic agent: {reason}', { client: ask.client, reason: ask.req.reason }));
    else if (ask.req.kind === 'gpio_write' && ask.req.pin !== undefined)
      ok = await confirmGpioWrite(ask.req.pin, ask.req.level ?? 1, t('{client} (an AI agent) asks: {reason}', { client: ask.client, reason: ask.req.reason }));
    await api.mcp.writeResult(ask.id, ok ? 'approved' : 'refused');
  });
  api.on.state((conn) => useApp.getState().set({ conn }));
  api.on.progress((progress) => useApp.getState().set({ progress }));
  api.on.log((e) => useLog.getState().add(e.type, e.text, { target: e.target, source: e.source }));
  api.on.live((f) => useLive.getState().pushFrame(f));
  api.on.trace((tr) => {
    useLive.getState().pushTrace(tr);
    const board = currentBoard();
    const sda = pinByGpio(board, tr.sda);
    const scl = pinByGpio(board, tr.scl);
    const steps = tr.trace
      .map((s) => (s.t === 'addr' ? `addr ${s.v}${s.rw === 'r' ? ' R' : ' W'} ${s.ack ? 'ACK' : 'NACK'}` : s.t === 'data' ? `${s.v} ${s.ack ? 'ACK' : 'NACK'}` : s.t.toUpperCase()))
      .join(' · ');
    if (sda && scl)
      log('info', tr.cmd === 'i2c_scan' ? t('I2C scan on {sda}/{scl}: {steps}', { sda: sda.label, scl: scl.label, steps }) : t('I2C read on {sda}/{scl}: {steps}', { sda: sda.label, scl: scl.label, steps }), { target: `pin:${sda.id}`, source: `measured: ${tr.cmd} trace` });
  });
  api.on.serial((lines) => useLive.getState().pushSerial(lines));
  api.on.probe((p) => useLive.getState().pushProbe(p));

  const [conn, ai, scenarios] = await Promise.all([api.hw.state(), api.ai.status(), api.sim.scenarios()]);
  useApp.getState().set({ conn, ai, scenarios });
  if (conn.mode === 'sim') useScene.getState().openScene(await api.sim.scene());

  // The project's board drives the hardware layer (chip tool, pin rules, simulated bench).
  const sync = async (boardId: string) => {
    if (useApp.getState().conn.board === boardId) return;
    const r = await api.hw.setBoard(boardId);
    if (r.ok) useApp.getState().set({ conn: r.value, scenarios: await api.sim.scenarios() });
  };
  await sync(useScene.getState().scene.board);
  useScene.subscribe((s, prev) => {
    if (s.scene.board !== prev.scene.board) void sync(s.scene.board);
  });
}

/* ---------------- confirmed writes ---------------- */

export async function confirmInstallAgent(reason?: string): Promise<boolean> {
  const token = await useConfirm.getState().ask({
    kind: 'flash_agent',
    title: t('Install the diagnostic agent?'),
    body: reason ?? t('The app needs a small helper program on the board to see the pins. It replaces your program for now.'),
    details: canBackupFlash(currentBoard())
      ? [
          t('First, a full copy of the program on your board is saved on this computer.'),
          t('Then the diagnostic agent is written to the board.'),
          t('“Restore my firmware” puts your program back with one click.'),
        ]
      : [
          t('This board cannot read its program back, so no backup is possible. Your current program will be replaced.'),
          t('Then the diagnostic agent is written to the board.'),
        ],
    confirmLabel: t('Back up and install'),
  });
  if (!token) {
    log('action', t('You cancelled. Nothing was written.'));
    return false;
  }
  const r = await bp().hw.installAgent(token);
  if (!r.ok) {
    log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
    return false;
  }
  return true;
}

export async function confirmGpioWrite(gpio: number, level: 0 | 1, reason?: string): Promise<boolean> {
  const board = currentBoard();
  const pin = pinByGpio(board, gpio);
  const name = pin ? `${pin.label} (GPIO ${gpio})` : `GPIO ${gpio}`;
  const token = await useConfirm.getState().ask({
    kind: 'gpio_write',
    title: level ? t('Drive {pin} HIGH?', { pin: name }) : t('Drive {pin} LOW?', { pin: name }),
    body: reason ?? t('The board will output {volts} on {pin}.', { volts: level ? `${board.logicVolt} V` : '0 V', pin: name }),
    details: [
      t('Only do this if nothing connected to this pin drives it too (that could short two outputs).'),
      t('The agent refuses input-only and flash pins.'),
    ],
    confirmLabel: level ? t('Set HIGH') : t('Set LOW'),
  });
  if (!token) return false;
  const r = await bp().hw.agentWrite({ cmd: 'gpio_write', pin: gpio, level }, token);
  if (!r.ok) {
    log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`, { target: pin ? (`pin:${pin.id}` as TargetRef) : undefined });
    return false;
  }
  log('action', level ? t('{pin} set HIGH.', { pin: name }) : t('{pin} set LOW.', { pin: name }), { target: pin ? (`pin:${pin.id}` as TargetRef) : undefined, source: 'agent gpio_write' });
  return true;
}

export async function confirmPwm(gpio: number, duty: number, hz = 5000): Promise<boolean> {
  const pin = pinByGpio(currentBoard(), gpio);
  const token = await useConfirm.getState().ask({
    kind: 'gpio_write',
    title: t('Run PWM on {pin}?', { pin: pin?.label ?? `GPIO ${gpio}` }),
    body: t('The board will switch the pin on and off {hz} times a second, on {duty}% of the time. An LED looks {duty}% bright.', { hz, duty }),
    details: [t('Only do this if nothing else drives this pin.')],
    confirmLabel: t('Start PWM'),
  });
  if (!token) return false;
  const r = await bp().hw.agentWrite({ cmd: 'pwm', pin: gpio, duty, hz }, token);
  if (!r.ok) log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
  return r.ok;
}

export async function confirmRestore(): Promise<void> {
  const conn = useApp.getState().conn;
  const b = conn.backups[0];
  if (!b) {
    log('warning', t('There is no backup for this board yet. A backup is made automatically before the first write.'));
    return;
  }
  const token = await useConfirm.getState().ask({
    kind: 'restore',
    title: t('Restore your firmware?'),
    body: t('This writes the backup from {date} back to the board.', { date: new Date(b.createdAt).toLocaleString() }),
    details: [t('The diagnostic agent is removed.'), t('Your program runs again after the board restarts.')],
    confirmLabel: t('Restore'),
  });
  if (!token) return;
  const r = await bp().hw.restore(b.id, token);
  if (!r.ok) log('failed', `${t(r.error.humanMessage)} ${t(r.error.hint)}`);
}

/** Start streaming the pins used in the scene (plus ADC pins read once to put them in ADC mode). */
export async function startStream(hz = 20) {
  const scene = useScene.getState().scene;
  const board = getBoard(scene.board);
  const gpios = new Set<number>();
  for (const w of scene.wires) {
    const pid = w.from.part === 'board' ? w.from.pin : w.to.part === 'board' ? w.to.pin : null;
    const p = pid ? board.pins.find((x) => x.id === pid) : undefined;
    if (p?.gpio !== null && p?.gpio !== undefined && p.kind === 'gpio' && !p.flags.includes('uart0')) gpios.add(p.gpio);
  }
  if (!gpios.size) {
    const r = board.rules;
    for (const id of [r.i2c.sda, r.i2c.scl, r.safeIo[0], r.adcPins[0]]) {
      const g = id ? pinById(board, id)?.gpio : null;
      if (g !== null && g !== undefined) gpios.add(g);
    }
  }
  for (const w of scene.wires) {
    const partEnd = w.from.part === 'board' ? w.to : w.from;
    const inst = scene.parts.find((p) => p.id === partEnd.part);
    const role = inst ? PARTS_ROLE(inst.partId, partEnd.pin) : undefined;
    const pid = w.from.part === 'board' ? w.from.pin : w.to.pin;
    const g = board.pins.find((x) => x.id === pid)?.gpio;
    if (role === 'analog_out' && g) await agent({ cmd: 'adc', pin: g });
  }
  return agent({ cmd: 'stream', pins: [...gpios], hz });
}

function PARTS_ROLE(partId: string, pin: string) {
  return PARTS[partId]?.pins.find((p) => p.name === pin)?.role;
}
