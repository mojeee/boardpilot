import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard, pinPositionMm, rectToMm } from '@shared/board';
import { chipPackage, passivesFor, tracesFor } from '@shared/boardDetail';

describe('3D board detail (generated from the board files)', () => {
  it('knows the packages of the common chips', () => {
    const find = (id: string, label: RegExp) => {
      const b = getBoard(id);
      const c = b.components.find((x) => label.test(x.label ?? ''));
      if (!c) throw new Error(`${id}: no ${label}`);
      return chipPackage(c, b);
    };
    expect(find('esp32-devkitc-30', /AMS1117/)).toBe('sot223');
    expect(find('arduino-uno-r3', /ATmega328P/)).toBe('dip');
    expect(find('arduino-nano', /ATmega328P/)).toBe('lqfp');
    expect(find('nucleo-f401re', /STM32F401RET6/)).toBe('lqfp');
    expect(find('blackpill-f411ce', /STM32F411CEU6/)).toBe('qfn');
    expect(find('rpi-pico', /RP2040/)).toBe('qfn');
    expect(find('esp32-devkitc-30', /ESP32-WROOM/)).toBe('module');
  });

  for (const board of Object.values(BOARDS)) {
    it(`${board.id}: small parts stay on the PCB, clear of the components and the pins`, () => {
      const { length: L, width: W } = board.pcbMm;
      const rects = board.components.map((c) => rectToMm(board, c.rect));
      const pins = board.pins.map((p) => pinPositionMm(board, p));
      for (const p of passivesFor(board)) {
        const hw = (p.rot ? p.d : p.w) / 2;
        const hd = (p.rot ? p.w : p.d) / 2;
        expect(Math.abs(p.x) + hw).toBeLessThan(L / 2);
        expect(Math.abs(p.z) + hd).toBeLessThan(W / 2);
        for (const r of rects) expect(Math.abs(p.x - r.cx) < r.w / 2 + hw && Math.abs(p.z - r.cz) < r.h / 2 + hd).toBe(false);
        for (const [x, , z] of pins) expect(Math.abs(p.x - x) < 1.6 + hw && Math.abs(p.z - z) < 1.6 + hd).toBe(false);
      }
      for (const tr of tracesFor(board)) for (const [x, z] of tr.points) expect(Math.abs(x) < L / 2 && Math.abs(z) < W / 2).toBe(true);
    });
  }

  it('puts a resistor next to LEDs and capacitors next to chips on a typical board', () => {
    const list = passivesFor(getBoard('esp32-devkitc-30'));
    expect(list.some((p) => p.kind === 'res')).toBe(true);
    expect(list.some((p) => p.kind === 'cap')).toBe(true);
    expect(tracesFor(getBoard('esp32-devkitc-30')).length).toBeGreaterThan(2);
  });
});
