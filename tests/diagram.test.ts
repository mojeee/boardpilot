import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { sceneToDiagram } from '@shared/diagram';
import { checkWiring } from '@shared/wiring';
import { TEMPLATES, templateFits, templateScene } from '@shared/templates';

const cases = Object.values(BOARDS).flatMap((b) => TEMPLATES.filter((tpl) => !templateFits(tpl, b)).map((tpl) => [b.id, tpl.id] as const));

describe('wiring diagram', () => {
  it.each(cases)('%s with %s', (boardId, tplId) => {
    const board = getBoard(boardId);
    const scene = templateScene(TEMPLATES.find((x) => x.id === tplId)!, board, PARTS);
    const d = sceneToDiagram(scene, board, PARTS);

    // Every wire drawn exactly once, from its board pin to its part pin.
    expect(d.wires.map((w) => w.id).sort()).toEqual(scene.wires.map((w) => w.id).sort());
    // Each wire has its own vertical lane.
    const lanes = d.wires.map((w) => w.points[1][0]);
    expect(new Set(lanes).size).toBe(lanes.length);
    // Board pin rows never overlap, and part blocks never overlap each other or the board.
    const ys = d.board.pins.map((p) => p.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(22);
    for (let i = 1; i < d.parts.length; i++) expect(d.parts[i].y).toBeGreaterThanOrEqual(d.parts[i - 1].y + d.parts[i - 1].h);
    for (const p of d.parts) expect(p.x).toBeGreaterThan(Math.max(...lanes, d.board.x + d.board.w));
    // Everything fits inside the drawing.
    for (const b of [d.board, ...d.parts]) {
      expect(b.x + b.w).toBeLessThanOrEqual(d.width);
      expect(b.y + b.h).toBeLessThanOrEqual(d.height);
    }
    // Same scene, same drawing.
    expect(sceneToDiagram(scene, board, PARTS)).toEqual(d);
  });

  it('lists the board pins in their real header order', () => {
    const board = getBoard('esp32-devkitc-30');
    const scene = templateScene(TEMPLATES.find((x) => x.id === 'weather-station')!, board, PARTS);
    const labels = sceneToDiagram(scene, board, PARTS).board.pins.map((p) => p.id);
    // On this board D21 and D22 are neighbours in the same header row, with 3V3 and GND elsewhere.
    expect(Math.abs(labels.indexOf('D21') - labels.indexOf('D22'))).toBeLessThanOrEqual(2);
  });

  it('puts wiring findings on the diagram', () => {
    const board = getBoard('esp32-devkitc-30');
    const scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 60] as [number, number, number] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
        { id: 'w2', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
      ],
    };
    const d = sceneToDiagram(scene, board, PARTS, checkWiring(scene, board, PARTS));
    expect(d.marks.length).toBeGreaterThan(0);
    expect(d.marks.some((m) => m.targets.includes('wire:w1'))).toBe(true);
  });
});

describe('diagram SVG', () => {
  it('is a standalone SVG with every wire and block', async () => {
    const { diagramToSvg } = await import('@shared/diagram');
    const board = getBoard('rpi-pico');
    const scene = templateScene(TEMPLATES.find((x) => x.id === 'weather-station')!, board, PARTS);
    const d = sceneToDiagram(scene, board, PARTS);
    const svg = diagramToSvg(d);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.match(/<polyline/g)?.length).toBe(d.wires.length);
    expect(svg).toContain('Raspberry Pi Pico');
    expect(svg).not.toMatch(/var\(--/);
  });
});
