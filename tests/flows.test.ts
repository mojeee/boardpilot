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
