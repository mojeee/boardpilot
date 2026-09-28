import { describe, expect, it } from 'vitest';
import { getBoard, pinPositionMm } from '@shared/board';

describe('board definition', () => {
  const b = getBoard();
  it('has 30 pins, 15 per row, unique ids and indexes', () => {
    expect(b.pins).toHaveLength(30);
    for (const row of ['front', 'back'] as const) {
      const r = b.pins.filter((p) => p.row === row);
      expect(r).toHaveLength(15);
      expect(new Set(r.map((p) => p.index)).size).toBe(15);
    }
    expect(new Set(b.pins.map((p) => p.id)).size).toBe(30);
  });
  it('matches the pin facts the rules rely on', () => {
    for (const g of [34, 35, 36, 39]) expect(b.pins.find((p) => p.gpio === g)?.flags).toContain('input_only');
    for (const g of [2, 5, 12, 15]) expect(b.pins.find((p) => p.gpio === g)?.flags).toContain('strapping');
    expect(b.pins.some((p) => p.gpio !== null && p.gpio >= 6 && p.gpio <= 11)).toBe(false);
    expect(b.pins.find((p) => p.id === 'D21')).toMatchObject({ row: 'front', index: 4 });
    expect(b.pins.find((p) => p.id === 'D34')).toMatchObject({ row: 'back', index: 3 });
  });
  it('places pins inside the PCB outline', () => {
    for (const p of b.pins) {
      const [x, , z] = pinPositionMm(b, p);
      expect(Math.abs(x)).toBeLessThan(b.pcbMm.length / 2);
      expect(Math.abs(z)).toBeLessThan(b.pcbMm.width / 2);
    }
  });
});
