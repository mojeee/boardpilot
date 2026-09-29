import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard, PARTS } from '@shared/board';
import { PORTFOLIO, portfolioReadme, portfolioTemplate, serialMissing, stageCode, stagesFor } from '@shared/portfolio';
import { templateFits, templateScene } from '@shared/templates';
import { checkCode } from '@shared/codeCheck';
import { FlowRunner, type FlowState } from '@shared/flow';
import { FLOWS } from '@flows/index';
import { grant } from '../app/main/session/safety';
import { SCENARIOS } from '../app/main/sim/simWorld';
import { makeCtx, makeHub } from './helpers';

describe('portfolio projects', () => {
  for (const p of PORTFOLIO) {
    it(`${p.id}: every stage's reference code matches the wiring on every board it fits`, () => {
      const tpl = portfolioTemplate(p);
      for (const board of Object.values(BOARDS)) {
        if (templateFits(tpl, board)) continue;
        const scene = templateScene(tpl, board, PARTS);
        for (const s of stagesFor(p, board)) {
          const code = stageCode(p, s, board, scene);
          expect(code, `${board.id}/${s.id}`).not.toContain('not wired');
          expect(code).not.toMatch(/\{[A-Z_]+(:[A-Z_]+)?\}/);
          const errors = checkCode(code, scene, board, PARTS, { monitorBaud: 115200 }).filter((f) => f.severity === 'error');
          expect(errors, `${board.id}/${s.id}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
        }
      }
    });
  }

  it('offers the FreeRTOS stage only on ESP32 boards', () => {
    const p = PORTFOLIO[0];
    expect(stagesFor(p, getBoard('esp32-devkitc-30')).some((s) => s.id === 'rtos')).toBe(true);
    expect(stagesFor(p, getBoard('arduino-uno-r3')).some((s) => s.id === 'rtos')).toBe(false);
  });

  it('checks serial output for every expected text', () => {
    const check = { kind: 'serial' as const, expect: ['[task sensors]', '[task display]'], baud: 115200 };
    expect(serialMissing(check, ['[task sensors] T=22.1'])).toEqual(['[task display]']);
    expect(serialMissing(check, ['[task sensors] x', '[task display] y'])).toEqual([]);
  });

  it('writes a README with stages, pins and parts', () => {
    const p = PORTFOLIO[0];
    const board = getBoard('esp32-devkitc-30');
    const scene = templateScene(portfolioTemplate(p), board, PARTS);
    const md = portfolioReadme(p, board, scene, PARTS, { blink: { at: '2026-09-29T10:00:00Z', source: 'measured: lab-blink' } });
    expect(md).toContain('# Smart room monitor');
    expect(md).toContain('✅ **Blink the warning LED**');
    expect(md).toContain('| LED | Warm LED A | D25 (GPIO 25) |');
    expect(md).toContain('![Wiring diagram](wiring.svg)');
    expect(md).toContain('BME280');
  });
});

describe('room monitor end to end on the simulator', () => {
  const waitFor = (r: FlowRunner, pred: (s: FlowState) => boolean, ms = 20000) =>
    new Promise<FlowState>((resolve, reject) => {
      const tm = setTimeout(() => reject(new Error(JSON.stringify(r.snapshot))), ms);
      const un = r.subscribe((s) => {
        if (pred(s)) {
          clearTimeout(tm);
          queueMicrotask(() => un());
          resolve(s);
        }
      });
    });

  it('passes every checkpoint', async () => {
    const { hub, ready } = makeHub('room-monitor');
    await ready;
    const scenario = SCENARIOS.find((s) => s.id === 'room-monitor')!;
    const board = getBoard('esp32-devkitc-30');
    // The bench is the template's own scene on the ESP32.
    expect(scenario.scene.wires.map((w) => `${w.from.pin}-${w.to.part}.${w.to.pin}`)).toEqual(
      templateScene(portfolioTemplate(PORTFOLIO[0]), board, PARTS).wires.map((w) => `${w.from.pin}-${w.to.part}.${w.to.pin}`),
    );
    const { ctx } = makeCtx(hub, scenario.scene);
    const run = async (flow: string, act?: () => Promise<void>) => {
      ctx.data = {};
      const r = new FlowRunner(FLOWS[flow], ctx);
      void r.start();
      await waitFor(r, (s) => s.status === 'waiting' || s.status === 'done' || s.status === 'failed');
      if (r.currentStep?.id === 'agent') await r.answer({ kind: 'confirm', confirmed: true, token: grant('flash_agent') });
      if (act) await act.call(null);
      if (flow === 'lab-blink') {
        await waitFor(r, (s) => s.status === 'waiting' && r.currentStep?.id === 'allow');
        await r.answer({ kind: 'confirm', confirmed: true, token: grant('gpio_write', 6) });
        await waitFor(r, (s) => s.status === 'waiting' && r.currentStep?.id === 'see');
        await r.answer({ kind: 'option', optionId: 'yes', label: 'It blinked 3 times' });
      }
      if (flow === 'lab-button' || flow === 'lab-adc') {
        const step = flow === 'lab-button' ? 'press' : 'turn';
        await waitFor(r, (s) => s.status === 'waiting' && r.currentStep?.id === step);
        hub.simControl(flow === 'lab-button' ? 'pressButton' : 'turnKnob');
        await r.answer({ kind: 'done' });
      }
      return waitFor(r, (s) => s.status === 'done' || s.status === 'failed');
    };
    for (const flow of ['lab-blink', 'lab-button', 'lab-adc', 'lab-i2c']) expect((await run(flow)).result?.passed, flow).toBe(true);
    const scan = await hub.agent({ cmd: 'i2c_scan', sda: 21, scl: 22 });
    expect(scan.ok && scan.value.found.map((a) => a.toLowerCase())).toContain('0x3c');
    // Serial stages: the user's sketch is flashed back, then its output is checked.
    expect((await hub.flashUser(grant('flash_user'), '/simulated/room-monitor.ino.bin')).ok).toBe(true);
    const lines = await hub.captureSerial(115200, 1500);
    expect(lines.ok).toBe(true);
    for (const s of PORTFOLIO[0].stages)
      if (s.check.kind === 'serial') expect(serialMissing(s.check, lines.ok ? lines.value : []), s.id).toEqual([]);
  }, 90000);
});
