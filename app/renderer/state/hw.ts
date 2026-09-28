// Renderer-side hardware helpers: the FlowHardware adapter over IPC, event wiring, and the
// "ask first, then write" helpers that every write in the UI goes through.

import type { FlowHardware } from '@shared/flow';
import type { AgentReplyMap, AgentRequest, Result, TargetRef } from '@shared/types';
import { getBoard, pinByGpio, PARTS } from '@shared/board';
import { useApp, useConfirm, useLive, useLog, useScene, log } from './store';

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
};

let wired = false;

/** Subscribe once to main-process events. */
export async function wireEvents() {
  if (wired || !window.bp) return;
  wired = true;
  const api = bp();
  api.on.state((conn) => useApp.getState().set({ conn }));
  api.on.progress((progress) => useApp.getState().set({ progress }));
  api.on.log((e) => useLog.getState().add(e.type, e.text, { target: e.target, source: e.source }));
  api.on.live((f) => useLive.getState().pushFrame(f));
  api.on.trace((t) => {
    useLive.getState().pushTrace(t);
    const board = getBoard();
    const sda = pinByGpio(board, t.sda);
    const scl = pinByGpio(board, t.scl);
    const steps = t.trace
      .map((s) => (s.t === 'addr' ? `addr ${s.v}${s.rw === 'r' ? ' R' : ' W'} ${s.ack ? 'ACK' : 'NACK'}` : s.t === 'data' ? `${s.v} ${s.ack ? 'ACK' : 'NACK'}` : s.t.toUpperCase()))
      .join(' · ');
    if (sda && scl) log('info', `I2C ${t.cmd === 'i2c_scan' ? 'scan' : 'read'} on ${sda.label}/${scl.label}: ${steps}`, { target: `pin:${sda.id}`, source: `measured: ${t.cmd} trace` });
  });
  api.on.serial((lines) => useLive.getState().pushSerial(lines));
  api.on.probe((p) => useLive.getState().pushProbe(p));

  const [conn, ai, scenarios] = await Promise.all([api.hw.state(), api.ai.status(), api.sim.scenarios()]);
  useApp.getState().set({ conn, ai, scenarios });
  if (conn.mode === 'sim') useScene.getState().setScene(await api.sim.scene());
}

/* ---------------- confirmed writes ---------------- */

export async function confirmInstallAgent(reason?: string): Promise<boolean> {
  const token = await useConfirm.getState().ask({
    kind: 'flash_agent',
    title: 'Install the diagnostic agent?',
    body: reason ?? 'The app needs a small helper program on the board to see the pins. It replaces your program for now.',
    details: [
      'First, a full copy of the program on your board is saved on this Mac.',
      'Then the diagnostic agent is written to the board.',
      '“Restore my firmware” puts your program back with one click.',
    ],
    confirmLabel: 'Back up and install',
  });
  if (!token) {
    log('action', 'You cancelled. Nothing was written.');
    return false;
  }
  const r = await bp().hw.installAgent(token);
  if (!r.ok) {
    log('failed', `${r.error.humanMessage} ${r.error.hint}`);
    return false;
  }
  return true;
}

export async function confirmGpioWrite(gpio: number, level: 0 | 1, reason?: string): Promise<boolean> {
  const pin = pinByGpio(getBoard(), gpio);
  const name = pin ? `${pin.label} (GPIO ${gpio})` : `GPIO ${gpio}`;
  const token = await useConfirm.getState().ask({
    kind: 'gpio_write',
    title: `Drive ${name} ${level ? 'HIGH' : 'LOW'}?`,
    body: reason ?? `The board will output ${level ? '3.3 V' : '0 V'} on ${name}.`,
    details: [
      'Only do this if nothing connected to this pin drives it too (that could short two outputs).',
      'The agent refuses input-only and flash pins.',
    ],
    confirmLabel: `Set ${level ? 'HIGH' : 'LOW'}`,
  });
  if (!token) return false;
  const r = await bp().hw.agentWrite({ cmd: 'gpio_write', pin: gpio, level }, token);
  if (!r.ok) {
    log('failed', `${r.error.humanMessage} ${r.error.hint}`, { target: pin ? (`pin:${pin.id}` as TargetRef) : undefined });
    return false;
  }
  log('action', `${name} set ${level ? 'HIGH' : 'LOW'}.`, { target: pin ? (`pin:${pin.id}` as TargetRef) : undefined, source: 'agent gpio_write' });
  return true;
}

export async function confirmPwm(gpio: number, duty: number, hz = 5000): Promise<boolean> {
  const pin = pinByGpio(getBoard(), gpio);
  const token = await useConfirm.getState().ask({
    kind: 'gpio_write',
    title: `Run PWM on ${pin?.label ?? `GPIO ${gpio}`}?`,
    body: `The board will switch the pin on and off ${hz} times a second, on ${duty}% of the time. An LED looks ${duty}% bright.`,
    details: ['Only do this if nothing else drives this pin.'],
    confirmLabel: 'Start PWM',
  });
  if (!token) return false;
  const r = await bp().hw.agentWrite({ cmd: 'pwm', pin: gpio, duty, hz }, token);
  if (!r.ok) log('failed', `${r.error.humanMessage} ${r.error.hint}`);
  return r.ok;
}

export async function confirmRestore(): Promise<void> {
  const conn = useApp.getState().conn;
  const b = conn.backups[0];
  if (!b) {
    log('warning', 'There is no backup for this board yet. A backup is made automatically before the first write.');
    return;
  }
  const token = await useConfirm.getState().ask({
    kind: 'restore',
    title: 'Restore your firmware?',
    body: `This writes the backup from ${new Date(b.createdAt).toLocaleString()} back to the board.`,
    details: ['The diagnostic agent is removed.', 'Your program runs again after the board restarts.'],
    confirmLabel: 'Restore',
  });
  if (!token) return;
  const r = await bp().hw.restore(b.id, token);
  if (!r.ok) log('failed', `${r.error.humanMessage} ${r.error.hint}`);
}

/** Start streaming the pins used in the scene (plus ADC pins read once to put them in ADC mode). */
export async function startStream(hz = 20) {
  const scene = useScene.getState().scene;
  const board = getBoard(scene.board);
  const gpios = new Set<number>();
  for (const w of scene.wires) {
    const pid = w.from.part === 'board' ? w.from.pin : w.to.part === 'board' ? w.to.pin : null;
    const p = pid ? board.pins.find((x) => x.id === pid) : undefined;
    if (p?.gpio !== null && p?.gpio !== undefined && p.gpio !== 1 && p.gpio !== 3) gpios.add(p.gpio);
  }
  if (!gpios.size) [21, 22, 25, 34].forEach((g) => gpios.add(g));
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
