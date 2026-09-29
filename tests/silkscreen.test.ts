import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard, pinPositionMm } from '@shared/board';
import { silkscreenLayout } from '../app/renderer/three/silkscreenLayout';

describe('PCB silkscreen', () => {
  it('prints labels that stay on the board and never overlap', () => {
    for (const b of Object.values(BOARDS)) {
      const labels = silkscreenLayout(b);
      const rects = labels.map((l) => {
        const len = l.text.length * 0.6 * l.size;
        const [w, h] = l.vertical ? [l.size, len] : [len, l.size];
        return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
      });
      for (const r of rects) {
        expect(r.x0, b.id).toBeGreaterThanOrEqual(0);
        expect(r.y0, b.id).toBeGreaterThanOrEqual(0);
        expect(r.x1, b.id).toBeLessThanOrEqual(b.pcbMm.length);
        expect(r.y1, b.id).toBeLessThanOrEqual(b.pcbMm.width);
      }
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const c = rects[j];
          expect(a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1, `${b.id}: ${labels[i].text} / ${labels[j].text}`).toBe(false);
        }
    }
  });
  it('names every pin of the ESP32 DevKit and prints the board name', () => {
    const b = getBoard();
    const labels = silkscreenLayout(b);
    for (const p of b.pins) expect(labels.some((l) => l.text === p.label), p.label).toBe(true);
    expect(labels.some((l) => l.text.startsWith('ESP32 DevKit'))).toBe(true);
  });

  it('keeps mounting holes clear of every pin', () => {
    for (const b of Object.values(BOARDS)) {
      for (const [hx, hy, d] of b.holesMm ?? []) {
        for (const p of b.pins) {
          const [x, , z] = pinPositionMm(b, p);
          const dist = Math.hypot(x + b.pcbMm.length / 2 - hx, z + b.pcbMm.width / 2 - hy);
          expect(dist, `${b.id} hole at ${hx},${hy} vs ${p.id}`).toBeGreaterThan(d / 2 + 1);
        }
      }
    }
  });
});
