import { describe, expect, it } from 'vitest';
import { FlowRunner, type FlowState } from '@shared/flow';
import { FLOWS } from '@flows/index';
import { grant } from '../app/main/session/safety';
import { SCENARIOS } from '../app/main/sim/simWorld';
import { makeCtx, makeHub } from './helpers';

function waitFor(r: FlowRunner, pred: (s: FlowState) => boolean, ms = 15000): Promise<FlowState> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout; state: ${JSON.stringify(r.snapshot)}`)), ms);
    const un = r.subscribe((s) => {
      if (pred(s)) {
        clearTimeout(t);
        queueMicrotask(() => un());
        resolve(s);
      }
    });
  });
}

async function runSensorFlow(scenario: string) {
  const { hub, ready } = makeHub(scenario);
  await ready;
  const scene = SCENARIOS.find((s) => s.id === scenario)!.scene;
  const { ctx, log } = makeCtx(hub, scene);
  const runner = new FlowRunner(FLOWS['debug-sensor-not-responding'], ctx);
  void runner.start();
  await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'symptom');
  await runner.answer({ kind: 'option', optionId: 'not-found', label: 'My code says the sensor is not found' });
  await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'agent');
  await runner.answer({ kind: 'confirm', confirmed: true, token: grant('flash_agent') });
  const end = await waitFor(runner, (s) => s.status === 'done' || s.status === 'failed');
  return { end, log, hub };
}

describe('debug-sensor-not-responding on the simulator', () => {
  it('finds SDA and SCL crossed, and says where', async () => {
    const { end, log, hub } = await runSensorFlow('weather-station-swapped');
    expect(end.status).toBe('done');
    expect(end.result?.title).toBe('SDA and SCL are crossed');
    expect(end.result?.confidence).toBe('measured');
    expect(end.result?.highlight).toEqual(expect.arrayContaining(['wire:w1', 'wire:w2', 'pin:D21', 'pin:D22']));
    expect(log.some((e) => e.source === 'measured: i2c_scan (swapped)')).toBe(true);
    // backup happened before the first write
    expect(hub.state.backups.length).toBe(1);
  }, 30000);

  it('confirms a healthy sensor and reads the ID', async () => {
    const { end } = await runSensorFlow('healthy');
    expect(end.result?.title).toBe('The sensor answers correctly');
    expect(end.result?.evidence.some((e) => e.text.includes('0x60'))).toBe(true);
  }, 30000);

  it('recognises a BMP280 sold as a BME280', async () => {
    const { end } = await runSensorFlow('bmp280-mixup');
    expect(end.result?.title).toBe('This is a different chip');
    expect(end.result?.cause).toContain('BMP280');
  }, 30000);

  it('labels "no power" as a suggestion, backed by measurements', async () => {
    const { end } = await runSensorFlow('sensor-unpowered');
    expect(end.result?.title).toBe('The sensor seems to have no power');
    expect(end.result?.confidence).toBe('suggestion');
    expect(end.result?.evidence.every((e) => e.confidence === 'measured')).toBe(true);
  }, 30000);
});

describe('safety', () => {
  it('refuses to install the agent without a confirmation token', async () => {
    const { hub, ready } = makeHub();
    await ready;
    const ports = await hub.listPorts();
    expect(ports.ok).toBe(true);
    await hub.identify('/dev/cu.usbserial-0001');
    const r = await hub.installAgent('made-up-token');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_confirmed');
  });

  it('refuses output writes through the read-only path, and tokens are single use', async () => {
    const { hub, ready } = makeHub();
    await ready;
    await hub.identify('/dev/cu.usbserial-0001');
    const tok = grant('flash_agent');
    expect((await hub.installAgent(tok)).ok).toBe(true);
    expect((await hub.installAgent(tok)).ok).toBe(false);
    const w = await hub.agent({ cmd: 'gpio_write', pin: 25, level: 1 });
    expect(w.ok).toBe(false);
    const w2 = await hub.agentWrite({ cmd: 'gpio_write', pin: 34, level: 1 }, grant('gpio_write'));
    expect(w2.ok).toBe(false);
    if (!w2.ok) expect(w2.error.code).toBe('agent_input_only');
  }, 20000);
});

describe('other flows on the simulator', () => {
  it('connect-identify reports the chip', async () => {
    const { hub, ready } = makeHub('healthy');
    await ready;
    const { ctx } = makeCtx(hub, SCENARIOS[1].scene);
    const runner = new FlowRunner(FLOWS['connect-identify'], ctx);
    void runner.start();
    const end = await waitFor(runner, (s) => s.status === 'done' || s.status === 'failed');
    expect(end.result?.title).toBe('ESP32-D0WD-V3 is connected');
  });

  it('connect-identify guides through no-port when nothing is plugged in', async () => {
    const { hub, ready } = makeHub('no-board');
    await ready;
    const { ctx } = makeCtx(hub, SCENARIOS[0].scene);
    const runner = new FlowRunner(FLOWS['connect-identify'], ctx);
    void runner.start();
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'no-port');
    await runner.answer({ kind: 'done' });
    const s = await waitFor(runner, (st) => st.status === 'failed');
    expect(runner.currentStep?.fallbacks?.length).toBeGreaterThan(0);
    expect(s.lastOutcome?.summary).toContain('Still no board');
  });

  it('garbage-on-serial finds the 9600 baud mismatch', async () => {
    const { hub, ready } = makeHub('garbage-serial');
    await ready;
    const { ctx } = makeCtx(hub, SCENARIOS[0].scene);
    const runner = new FlowRunner(FLOWS['debug-garbage-on-serial'], ctx);
    void runner.start();
    const end = await waitFor(runner, (s) => s.status === 'done' || s.status === 'failed', 30000);
    expect(end.result?.title).toBe('Your program talks at 9600 baud');
  }, 40000);

  it('keeps-resetting spots the brownout', async () => {
    const { hub, ready } = makeHub('keeps-resetting');
    await ready;
    const { ctx } = makeCtx(hub, SCENARIOS[0].scene);
    const runner = new FlowRunner(FLOWS['debug-keeps-resetting'], ctx);
    void runner.start();
    const end = await waitFor(runner, (s) => s.status === 'done' || s.status === 'failed', 20000);
    expect(end.result?.title).toBe('The power supply dips too low');
  }, 25000);
});

describe('flash-firmware pre-flight on the simulator', () => {
  async function flashWith(bytes: Uint8Array, name: string) {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const file = join(mkdtempSync(join(tmpdir(), 'bp-pre-')), name);
    writeFileSync(file, bytes);
    const { hub, ready } = makeHub('healthy');
    await ready;
    const scene = SCENARIOS.find((s) => s.id === 'healthy')!.scene;
    const { ctx, log } = makeCtx(hub, scene);
    const runner = new FlowRunner(FLOWS['flash-firmware'], ctx);
    void runner.start();
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'file');
    await runner.answer({ kind: 'input', input: 'firmware', value: file });
    const s = await waitFor(runner, (st) => runner.currentStep?.id !== 'preflight' || st.status !== 'running');
    return { s, runner, log, hub };
  }
  const espImage = (chip: number) => {
    const b = new Uint8Array(100_000);
    b[0] = 0xe9;
    b[3] = 0x2f;
    b[12] = chip;
    return b;
  };

  it('stops before writing a file built for another chip', async () => {
    const { runner, log, hub } = await flashWith(espImage(0x09), 'sketch.ino.bin');
    expect(runner.currentStep?.id).toBe('preflight');
    expect(log.some((e) => e.type === 'failed' && /ESP32-S3/.test(e.text))).toBe(true);
    expect(hub.state.backups.length).toBe(0);
  }, 30000);

  it('goes on to the confirmation for a matching file', async () => {
    const { runner } = await flashWith(espImage(0x00), 'sketch.ino.bin');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'confirm');
    expect(runner.currentStep?.id).toBe('confirm');
  }, 30000);
});

describe('lesson labs on the simulator', () => {
  async function startLab(flow: string, scenario: string) {
    const { hub, ready } = makeHub(scenario);
    await ready;
    const scene = SCENARIOS.find((s) => s.id === scenario)!.scene;
    const { ctx, log } = makeCtx(hub, scene);
    const runner = new FlowRunner(FLOWS[flow], ctx);
    void runner.start();
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'agent');
    await runner.answer({ kind: 'confirm', confirmed: true, token: grant('flash_agent') });
    return { hub, runner, log };
  }
  const end = (r: FlowRunner) => waitFor(r, (s) => s.status === 'done' || s.status === 'failed', 20000);

  it('blink: one confirmation allows the 6 writes, and the pin follows them', async () => {
    const { runner, log } = await startLab('lab-blink', 'healthy');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'allow');
    await runner.answer({ kind: 'confirm', confirmed: true, token: grant('gpio_write', 6) });
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'see');
    expect(log.some((e) => e.text.includes('D25 read back: 1 0 1 0 1 0'))).toBe(true);
    await runner.answer({ kind: 'option', optionId: 'yes', label: 'It blinked 3 times' });
    const s = await end(runner);
    expect(s.result).toMatchObject({ passed: true, confidence: 'measured' });
  }, 30000);

  it('blink: an LED on an input-only pin is refused, and the lab says where to move it', async () => {
    const { runner } = await startLab('lab-blink', 'lab-mistakes');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'allow');
    await runner.answer({ kind: 'confirm', confirmed: true, token: grant('gpio_write', 6) });
    const s = await end(runner);
    expect(s.result?.passed).toBe(false);
    expect(s.result?.title).toBe('The pin cannot drive the LED');
  }, 30000);

  it('blink: nothing is written without the confirmation', async () => {
    const { runner, log } = await startLab('lab-blink', 'healthy');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'allow');
    await runner.answer({ kind: 'confirm', confirmed: false });
    const s = await end(runner);
    expect(s.status).toBe('failed');
    expect(log.some((e) => e.text.includes('read back'))).toBe(false);
  }, 30000);

  it('button: 1 released, 0 while pressed', async () => {
    const { runner, hub } = await startLab('lab-button', 'healthy');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'press');
    hub.simControl('pressButton');
    await runner.answer({ kind: 'done' });
    const s = await end(runner);
    expect(s.result).toMatchObject({ passed: true, title: 'Your button works' });
  }, 30000);

  it('button: a floating pin is caught before the press', async () => {
    const { runner } = await startLab('lab-button', 'lab-mistakes');
    const s = await end(runner);
    expect(s.result?.passed).toBe(false);
    expect(s.result?.title).toMatch(/floats|reads 0/);
  }, 30000);

  it('adc: turning the knob covers the range', async () => {
    const { runner, hub } = await startLab('lab-adc', 'healthy');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'turn');
    hub.simControl('turnKnob');
    await runner.answer({ kind: 'done' });
    const s = await end(runner);
    expect(s.result?.passed).toBe(true);
  }, 30000);

  it('adc: a loose leg leaves the reading stuck', async () => {
    const { runner, hub } = await startLab('lab-adc', 'lab-mistakes');
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'turn');
    hub.simControl('turnKnob');
    await runner.answer({ kind: 'done' });
    const s = await end(runner);
    expect(s.result).toMatchObject({ passed: false, title: 'The reading did not change' });
  }, 30000);

  it('i2c: finds the sensor and explains its chip ID', async () => {
    const { runner } = await startLab('lab-i2c', 'healthy');
    const s = await end(runner);
    expect(s.result?.passed).toBe(true);
    expect(s.result?.cause).toContain('0x60');
  }, 30000);

  it('i2c: crossed wires are found with the swap test', async () => {
    const { runner } = await startLab('lab-i2c', 'weather-station-swapped');
    const s = await end(runner);
    expect(s.result).toMatchObject({ passed: false, title: 'SDA and SCL are crossed' });
  }, 30000);
});

describe('connect and identify on an empty project', () => {
  it('switches the project to the board that answered, and leaves a project with parts alone', async () => {
    const { adoptDetectedBoard } = await import('@flows/common');
    const { hub, ready } = makeHub('healthy');
    await ready;
    const empty = makeCtx(hub, { board: 'rpi-pico', parts: [], wires: [] });
    const ports = await hub.listPorts();
    empty.ctx.data.port = ports.ok ? ports.value[0].path : undefined;
    expect(await adoptDetectedBoard(empty.ctx, 'ESP32-D0WD-V3')).toBe(true);
    expect(empty.ctx.scene().board).toBe('esp32-devkitc-30');
    const withParts = makeCtx(hub, { board: 'rpi-pico', parts: [{ id: 'led1', partId: 'led-resistor', position: [0, 0, 0] }], wires: [] });
    expect(await adoptDetectedBoard(withParts.ctx, 'ESP32-D0WD-V3')).toBe(false);
    expect(withParts.ctx.scene().board).toBe('rpi-pico');
  });
});
