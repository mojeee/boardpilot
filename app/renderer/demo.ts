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
  // Any demo: &stage=desk|plain picks the floor style, &cam=top|side|module|home a camera preset
  // (used for screenshots and social images).
  const hp = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const stage = hp.get('stage');
  if (stage === 'desk' || stage === 'plain') useScene.getState().setStage(stage);
  // &clean=1 hides the viewport overlays (toolbar, legend, badges) for social images.
  if (hp.get('clean')) document.body.classList.add('snapshot-clean');
  const cam = hp.get('cam');
  try {
    await runNamedDemo(name, scenario);
  } finally {
    if (cam === 'top' || cam === 'side' || cam === 'module' || cam === 'home') useScene.getState().preset(cam);
  }
}

async function runNamedDemo(name: string, scenario: string | null) {
  if (scenario) {
    await window.bp.sim.load(scenario);
    useScene.getState().openScene(await window.bp.sim.scene());
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
    const url = new URLSearchParams(location.hash.replace(/^#\/?/, '')).get('url') ?? 'https://www.adafruit.com/product/3317';
    const r = await window.bp.parts.importFromUrl(url);
    const { usePartEditor } = await import('./components/PartEditor');
    if (r.ok) usePartEditor.getState().open({ draft: r.value.draft, notes: r.value.notes, fromImport: true, usedAi: r.value.usedAi });
    else usePartEditor.getState().open({ draft: null, notes: [r.error.humanMessage], fromImport: true });
  } else if (name === 'aisettings') {
    const { openAiSettings } = await import('./components/AiSettings');
    openAiSettings();
  } else if (name === 'board') {
    // #demo=board&board=rpi-pico[&view=2d][&agent=1]: the weather-station bench on any board.
    const params = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
    const id = params.get('board') ?? 'rpi-pico';
    useScene.getState().openScene({ board: id, parts: [], wires: [] });
    await until(() => useApp.getState().conn.board === id);
    const list = await window.bp.sim.scenarios();
    const sc = list.find((x) => x.id.endsWith('weather-station-swapped')) ?? list[0];
    if (sc) {
      await window.bp.sim.load(sc.id);
      useScene.getState().openScene(await window.bp.sim.scene());
    }
    openTask('connect');
    if (params.get('view') === '2d') useScene.getState().set({ view: '2d' });
    if (params.get('agent')) {
      await connectAndInstall();
      await startStream(20);
    }
  } else if (name === 'boards') {
    const { openBoardPicker } = await import('./components/BoardPicker');
    openBoardPicker();
  } else if (name === 'code') {
    // #demo=code: the weather station with a sketch that has SDA/SCL reversed and the LED on the wrong pin.
    openTask('newProject');
    const { loadSketch } = await import('./components/CodeCheck');
    const led = useScene.getState().scene.wires.find((w) => w.to.part.startsWith('led') || w.from.part.startsWith('led'));
    const ledPin = led ? (led.from.part === 'board' ? led.from.pin : led.to.pin).replace(/^D/, '') : '25';
    loadSketch(
      'weather_station.ino',
      [
        '#include <Wire.h>',
        '#include <Adafruit_BME280.h>',
        '',
        `#define LED_PIN ${Number(ledPin) + 1}`,
        'Adafruit_BME280 bme;',
        '',
        'void setup() {',
        '  Serial.begin(9600);',
        '  Wire.begin(22, 21);',
        '  pinMode(LED_PIN, OUTPUT);',
        '  bme.begin(0x76);',
        '}',
        '',
        'void loop() {',
        '  digitalWrite(LED_PIN, !digitalRead(LED_PIN));',
        '  Serial.println(bme.readTemperature());',
        '  delay(1000);',
        '}',
      ].join('\n'),
    );
  } else if (name === 'project') {
    useScene.getState().openScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
    openTask('newProject');
    ['bme280-gy', 'led-resistor', 'potentiometer', 'push-button'].forEach((p) => addPart(p));
  }
  void useLive;
}
