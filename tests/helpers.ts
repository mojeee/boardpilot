import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FlowContext, FlowHardware } from '@shared/flow';
import type { LogEntry, Scene } from '@shared/types';
import { getBoard, PARTS } from '@shared/board';
import { HardwareHub } from '../app/main/hardware/hub';

export function makeHub(scenario = 'weather-station-swapped') {
  const dir = mkdtempSync(join(tmpdir(), 'bp-test-'));
  const hub = new HardwareHub(dir, join(dir, 'agent'), 'sim');
  return { hub, ready: hub.loadScenario(scenario) };
}

export function hwFor(hub: HardwareHub): FlowHardware {
  return {
    listPorts: () => hub.listPorts(),
    identify: (p) => hub.identify(p),
    state: () => hub.state,
    agentReady: () => !!hub.state.agent,
    installAgent: (t) => hub.installAgent(t),
    agentWrite: (req, t) => hub.agentWrite(req, t),
    agent: (req) => hub.agent(req),
    captureSerial: (b, ms) => hub.captureSerial(b, ms),
    flashUser: (t, f) => hub.flashUser(t, f),
    preflight: (f) => hub.preflight(f),
  };
}

export function makeCtx(hub: HardwareHub, scene: Scene) {
  const log: LogEntry[] = [];
  let current = scene;
  const ctx: FlowContext = {
    hw: hwFor(hub),
    board: getBoard(scene.board),
    parts: PARTS,
    scene: () => current,
    updateScene: (fn) => {
      current = fn(current);
    },
    answers: {},
    data: {},
    log: (type, text, opts) => log.push({ id: log.length, t: Date.now(), type, text, ...opts }),
    highlight: () => {},
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return { ctx, log };
}
