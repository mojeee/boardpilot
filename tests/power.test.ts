import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { estimatePower, fmtDuration, powerRows } from '@shared/power';
import { validatePartDef } from '@shared/partSchema';
import type { Scene } from '@shared/types';

const scene = (board: string, partIds: string[]): Scene => ({ board, parts: partIds.map((p, i) => ({ id: `p${i}`, partId: p, position: [i * 30, 0, 50] })), wires: [] });

describe('power budget', () => {
  it('adds datasheet currents and lists parts without data as unknown', () => {
    const board = getBoard('esp32-devkitc-30');
    const est = estimatePower(powerRows(scene(board.id, ['bme280-gy', 'hc-sr04', 'ssd1306-i2c']), board, PARTS), { awakeMs: 1000, periodS: 0, batteryMah: 2000 });
    expect(est.awakeMa).toBeCloseTo(40 + 0.0036 + 15, 4);
    expect(est.unknown.map((r) => r.name)).toEqual([expect.stringMatching(/SSD1306|OLED/i)]);
    expect(est.hours).toBeCloseTo(2000 / est.averageMa, 6);
  });

  it('averages over a duty cycle, using sleep currents', () => {
    const board = getBoard('esp32-devkitc-30');
    // Awake 100 ms every 60 s: 1/600 of the time at 40 mA, the rest at 10 µA (+ the sensor's sleep 0.1 µA).
    const est = estimatePower(powerRows(scene(board.id, ['bme280-gy']), board, PARTS), { awakeMs: 100, periodS: 60, batteryMah: 2000 });
    const on = 100 / 60000;
    expect(est.averageMa).toBeCloseTo((40 + 0.0036) * on + (0.01 + 0.0001) * (1 - on), 6);
    expect(est.biggest[0].row.kind).toBe('board');
    // About 0.077 mA average: close to 3 years on 2000 mAh for the chip alone (the board note warns that a DevKit draws more).
    expect(fmtDuration(est.hours)).toEqual({ n: 3, unit: 'years' });
  });

  it('keeps an always-on part at its awake current when it has no sleep figure', () => {
    const board = getBoard('rpi-pico');
    const est = estimatePower(powerRows(scene(board.id, ['soil-moisture-capacitive']), board, PARTS), { awakeMs: 100, periodS: 60, batteryMah: 1000 });
    expect(est.sleepMa).toBeCloseTo(0.8 + 5, 6);
  });

  it('marks the board as unknown when its file has no power data', () => {
    const board = getBoard('arduino-uno-r3');
    const est = estimatePower(powerRows(scene(board.id, []), board, PARTS), { awakeMs: 1, periodS: 0, batteryMah: 1000 });
    expect(est.unknown[0].kind).toBe('board');
    expect(est.hours).toBe(Infinity);
  });

  it('has sourced, sane figures in every part that carries them, and keeps them for user parts', () => {
    const withData = Object.values(PARTS).filter((p) => p.current);
    expect(withData.length).toBeGreaterThanOrEqual(12);
    for (const p of withData) {
      expect(p.current!.source.title, p.id).toBeTruthy();
      expect(p.current!.typMa, p.id).toBeGreaterThanOrEqual(0);
      if (p.current!.sleepMa !== undefined) expect(p.current!.sleepMa, p.id).toBeLessThanOrEqual(p.current!.typMa);
    }
    const r = validatePartDef({ ...PARTS['dht22'], id: 'my-dht' });
    expect(r.ok && r.value.current?.typMa).toBe(PARTS['dht22'].current!.typMa);
  });
});
