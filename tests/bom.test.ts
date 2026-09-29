import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { billOfMaterials, bomToCsv, bomToMarkdown } from '@shared/bom';
import { TEMPLATES, templateScene } from '@shared/templates';
import type { Scene } from '@shared/types';

const tpl = (id: string) => TEMPLATES.find((x) => x.id === id)!;

describe('bill of materials', () => {
  it('lists the board, its cable, the parts and the wiring', () => {
    const board = getBoard('esp32-devkitc-30');
    const rows = billOfMaterials(templateScene(tpl('weather-station'), board, PARTS), board, PARTS);
    expect(rows[0]).toMatchObject({ kind: 'board', item: board.name, qty: 1 });
    expect(rows[1].item).toMatch(/micro-USB cable/);
    expect(rows.filter((r) => r.kind === 'part').map((r) => r.item)).toEqual(expect.arrayContaining([PARTS['bme280-gy'].name, PARTS['ssd1306-i2c'].name]));
    expect(rows.find((r) => r.kind === 'wiring' && /Jumper/.test(r.item))?.qty).toBeGreaterThan(4);
  });

  it('adds a divider for 5 V outputs into 3.3 V pins, with the reason', () => {
    const board = getBoard('rpi-pico');
    const rows = billOfMaterials(templateScene(tpl('distance-meter'), board, PARTS), board, PARTS);
    const div = rows.find((r) => /divider/.test(r.item));
    expect(div?.detail).toMatch(/ECHO/);
    expect(div?.why).toBeTruthy();
  });

  it('needs no divider for the same project on a 5 V Uno', () => {
    const board = getBoard('arduino-uno-r3');
    const rows = billOfMaterials(templateScene(tpl('distance-meter'), board, PARTS), board, PARTS);
    expect(rows.some((r) => /divider|shifter/.test(r.item))).toBe(false);
  });

  it('adds the 1-Wire pull-up a DS18B20 probe needs, and groups identical parts', () => {
    const board = getBoard('esp32-devkitc-30');
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 't1', partId: 'ds18b20-probe', position: [-40, 0, 60] },
        { id: 't2', partId: 'ds18b20-probe', position: [40, 0, 60] },
      ],
      wires: [{ id: 'w1', from: { part: 'board', pin: 'D4' }, to: { part: 't1', pin: PARTS['ds18b20-probe'].pins.find((p) => p.role === 'onewire')!.name }, color: '#fff' }],
    };
    const rows = billOfMaterials(scene, board, PARTS);
    expect(rows.find((r) => r.kind === 'part')?.qty).toBe(2);
    expect(rows.some((r) => r.kind === 'extra' && /4.7 kΩ/.test(r.item))).toBe(true);
  });

  it('exports CSV and Markdown with every row', () => {
    const board = getBoard('esp32-devkitc-30');
    const rows = billOfMaterials(templateScene(tpl('plant-watering'), board, PARTS), board, PARTS);
    expect(bomToCsv(rows).trim().split('\n')).toHaveLength(rows.length + 1);
    expect(bomToMarkdown(rows).split('\n')).toHaveLength(rows.length + 2);
  });
});
