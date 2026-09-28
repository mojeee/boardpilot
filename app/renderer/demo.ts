// Scripted demos for screenshots and manual testing (#demo=… in the URL). Simulator mode only:
// the scripted confirmations here stand in for a user clicking Confirm on a simulated board.

import { useApp, useLive, useScene } from './state/store';
import { agent, startStream } from './state/hw';
import { useWizard } from './wizard/session';
import { openTask } from './components/TaskRail';
import { addPart } from './state/sceneActions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean, ms = 20000) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await sleep(100);
}

async function connectAndInstall() {
  const ports = await window.bp.hw.listPorts();
  if (!ports.ok || !ports.value[0]) return;
  await window.bp.hw.identify(ports.value[0].path);
  const token = await window.bp.safety.grant('flash_agent');
  await window.bp.hw.installAgent(token);
}

export async function runDemo(name: string, scenario: string | null) {
  if (useApp.getState().conn.mode !== 'sim') return;
  if (scenario) {
    await window.bp.sim.load(scenario);
    useScene.getState().setScene(await window.bp.sim.scene());
  }
  if (name === 'debug') {
    useApp.getState().setScreen('debug');
    useWizard.getState().start('debug-sensor-not-responding');
    const w = () => useWizard.getState();
    await until(() => w().state?.status === 'waiting' && w().runner?.currentStep?.id === 'symptom');
    w().answer({ kind: 'option', optionId: 'not-found', label: 'My code says the sensor is not found' });
    await until(() => w().state?.status === 'waiting' && w().runner?.currentStep?.id === 'agent');
    const token = await window.bp.safety.grant('flash_agent');
    w().answer({ kind: 'confirm', confirmed: true, token });
  } else if (name === 'connect') {
    openTask('connect');
  } else if (name === 'test') {
    await connectAndInstall();
    openTask('test');
    await sleep(300);
    await agent({ cmd: 'i2c_scan', sda: 22, scl: 21, hz: 100000 });
    await agent({ cmd: 'i2c_read', sda: 22, scl: 21, addr: '0x76', reg: '0xD0', len: 1 });
  } else if (name === 'monitor') {
    const ports = await window.bp.hw.listPorts();
    if (ports.ok && ports.value[0]) await window.bp.hw.identify(ports.value[0].path);
    openTask('monitor');
    await window.bp.hw.openSerial(115200);
  } else if (name === 'live') {
    await connectAndInstall();
    openTask('connect');
    await startStream(20);
    useScene.getState().preset('home');
  } else if (name === 'library') {
    openTask('connect');
    useScene.getState().set({ libOpen: true });
    const a = addPart('mpu6050');
    if (a) {
      useScene.getState().select(`part:${a}`);
    }
  } else if (name === 'import') {
    openTask('newProject');
    const r = await window.bp.parts.importFromUrl('https://www.adafruit.com/product/3317');
    const { usePartEditor } = await import('./components/PartEditor');
    if (r.ok) usePartEditor.getState().open({ draft: r.value.draft, notes: r.value.notes, fromImport: true, usedAi: r.value.usedAi });
    else usePartEditor.getState().open({ draft: null, notes: [r.error.humanMessage], fromImport: true });
  } else if (name === 'project') {
    useScene.getState().setScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
    openTask('newProject');
    ['bme280-gy', 'led-resistor', 'potentiometer', 'push-button'].forEach((p) => addPart(p));
  }
  void useLive;
}
