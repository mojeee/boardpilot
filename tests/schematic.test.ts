import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { assignPins } from '@shared/assign';
import { boxesOverlap, itemBox, primBox, sceneToSchematic, schematicToSvg, type Box, type Pt, type SchItem, type Schematic } from '@shared/schematic';
import { checkWiring } from '@shared/wiring';
import { TEMPLATES, templateFits, templateScene } from '@shared/templates';
import type { BoardDef, Scene } from '@shared/types';

const texts = (it: SchItem) => it.prims.filter((p) => p.k === 'text').map((p) => ({ p, box: primBox(p) }));
const segments = (it: SchItem): [Pt, Pt][] => it.prims.flatMap((p) => (p.k === 'line' ? p.pts.slice(1).map((q, i) => [p.pts[i], q] as [Pt, Pt]) : []));
/** Does an axis-aligned segment pass through the inside of a box (touching the edge is fine)? */
const segInBox = ([a, b]: [Pt, Pt], box: Box) =>
  Math.max(a[0], b[0]) > box.x0 && Math.min(a[0], b[0]) < box.x1 && Math.max(a[1], b[1]) > box.y0 && Math.min(a[1], b[1]) < box.y1;
const segsMeet = ([a, b]: [Pt, Pt], [c, d]: [Pt, Pt]) => {
  const r1 = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
  const r2 = { x0: Math.min(c[0], d[0]), x1: Math.max(c[0], d[0]), y0: Math.min(c[1], d[1]), y1: Math.max(c[1], d[1]) };
  return r1.x0 <= r2.x1 && r2.x0 <= r1.x1 && r1.y0 <= r2.y1 && r2.y0 <= r1.y1;
};

/** The layout rules every schematic must keep. */
function checkLayout(s: Schematic, scene: Scene) {
  const solid = s.items.filter((i) => i.kind !== 'wire');
  const wires = s.items.filter((i) => i.kind === 'wire');
  const boxes = new Map(s.items.map((i) => [i, itemBox(i)]));
  const where = (i: SchItem) => `${i.kind} ${i.id}`;

  // Symbols, rails, grounds and labels never overlap each other.
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) expect(boxesOverlap(boxes.get(solid[i])!, boxes.get(solid[j])!), `${where(solid[i])} / ${where(solid[j])}`).toBe(false);

  // No two pieces of text overlap, and no text sits on another symbol.
  const allTexts = s.items.flatMap((i) => texts(i).map((x) => ({ ...x, item: i })));
  for (let i = 0; i < allTexts.length; i++)
    for (let j = i + 1; j < allTexts.length; j++)
      expect(boxesOverlap(allTexts[i].box, allTexts[j].box), `"${allTexts[i].p.k === 'text' && allTexts[i].p.text}" / "${allTexts[j].p.k === 'text' && allTexts[j].p.text}"`).toBe(false);
  for (const tx of allTexts) for (const it of solid) if (it !== tx.item) expect(boxesOverlap(tx.box, boxes.get(it)!), `text in ${where(tx.item)} on ${where(it)}`).toBe(false);

  // Wires of different nets never meet; wires never run through a symbol or over text.
  for (let i = 0; i < wires.length; i++)
    for (let j = i + 1; j < wires.length; j++) {
      if (wires[i].net === wires[j].net) continue;
      for (const a of segments(wires[i])) for (const b of segments(wires[j])) expect(segsMeet(a, b), `${where(wires[i])} meets ${where(wires[j])}`).toBe(false);
    }
  for (const w of wires) {
    for (const seg of segments(w)) {
      for (const it of solid) expect(segInBox(seg, boxes.get(it)!), `${where(w)} through ${where(it)}`).toBe(false);
      for (const tx of allTexts) if (tx.item !== w) expect(segInBox(seg, tx.box), `${where(w)} over text in ${where(tx.item)}`).toBe(false);
    }
  }

  // Everything fits inside the drawing.
  for (const b of boxes.values()) {
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(s.width);
    expect(b.y1).toBeLessThanOrEqual(s.height);
  }

  // Every wire of the scene is in exactly one net, and every net is drawn.
  const inNets = s.nets.flatMap((n) => n.wires).sort();
  expect(inNets).toEqual(scene.wires.map((w) => w.id).sort());
  for (const n of s.nets.filter((x) => x.drawn === 'wire')) expect(wires.some((w) => w.net === n.name)).toBe(true);
  for (const n of s.nets.filter((x) => x.drawn === 'label')) expect(s.items.filter((i) => i.kind === 'label' && i.net === n.name).length).toBeGreaterThanOrEqual(2);
  for (const n of s.nets.filter((x) => x.kind === 'power')) expect(s.items.some((i) => i.kind === 'power' && i.net === n.name)).toBe(true);
}

const cases = Object.values(BOARDS).flatMap((b) => TEMPLATES.filter((tpl) => !templateFits(tpl, b)).map((tpl) => [b.id, tpl.id] as const));

/** Many parts wired by the automatic pin assignment: every symbol kind on one board. */
function kitchenSink(board: BoardDef): Scene {
  const ids = ['led-resistor', 'push-button', 'potentiometer', 'bme280-gy', 'ssd1306-i2c', 'reed-switch', 'dht22', 'relay-1ch'];
  const scene: Scene = { board: board.id, parts: ids.map((partId, i) => ({ id: `p${i}`, partId, position: [i * 20, 0, 60] })), wires: [] };
  return assignPins(scene, board, PARTS).scene;
}

describe('schematic layout', () => {
  it.each(cases)('%s with %s', (boardId, tplId) => {
    const board = getBoard(boardId);
    const scene = templateScene(TEMPLATES.find((x) => x.id === tplId)!, board, PARTS);
    const s = sceneToSchematic(scene, board, PARTS, checkWiring(scene, board, PARTS));
    checkLayout(s, scene);
    // Same scene, same drawing.
    expect(sceneToSchematic(scene, board, PARTS, checkWiring(scene, board, PARTS))).toEqual(s);
  });

  it.each(Object.keys(BOARDS))('%s with one of every symbol', (boardId) => {
    const board = getBoard(boardId);
    const scene = kitchenSink(board);
    const s = sceneToSchematic(scene, board, PARTS, checkWiring(scene, board, PARTS));
    checkLayout(s, scene);
  });

  it('draws nothing but an empty board for an empty scene', () => {
    const board = getBoard('esp32-devkitc-30');
    const s = sceneToSchematic({ board: board.id, parts: [], wires: [] }, board, PARTS);
    expect(s.items.map((i) => i.kind)).toEqual(['board']);
  });
});

describe('schematic structure', () => {
  const esp = getBoard('esp32-devkitc-30');
  const tpl = (id: string) => TEMPLATES.find((x) => x.id === id)!;

  it('shows only the board pins in use, with name and GPIO number, power on top and ground below', () => {
    const scene = templateScene(tpl('weather-station'), esp, PARTS);
    const s = sceneToSchematic(scene, esp, PARTS);
    const board = s.items.find((i) => i.kind === 'board')!;
    const words = texts(board).map((x) => (x.p.k === 'text' ? x.p.text : ''));
    expect(words).toEqual(expect.arrayContaining(['D21', '21', 'D22', '22', '3V3', 'GND']));
    expect(words).not.toContain('D25');
    // One rail symbol on the board's 3V3 pin and one on each part's supply; a ground symbol per ground pin.
    expect(s.items.filter((i) => i.kind === 'power' && i.net === '+3.3V').length).toBe(3);
    expect(s.items.filter((i) => i.kind === 'ground').length).toBe(4);
    // The shared I2C bus: named nets SDA and SCL.
    expect(s.nets.filter((n) => n.kind === 'signal').map((n) => n.name).sort()).toEqual(['SCL', 'SDA']);
    // Rails sit above the board block, grounds below it.
    const bb = itemBox(board);
    for (const r of s.items.filter((i) => i.kind === 'power' && i.target?.startsWith('pin:'))) expect(itemBox(r).y1).toBeLessThanOrEqual(bb.y0);
    for (const g of s.items.filter((i) => i.kind === 'ground' && i.target?.startsWith('pin:'))) expect(itemBox(g).y0).toBeGreaterThanOrEqual(bb.y1);
  });

  it('draws the LED with its resistor and the push button as symbols, wired straight to their pins', () => {
    const scene = templateScene(tpl('blink-button'), esp, PARTS);
    const s = sceneToSchematic(scene, esp, PARTS);
    const led = s.items.find((i) => i.target === 'part:led1')!;
    expect(led.prims.some((p) => p.k === 'line' && p.closed)).toBe(true); // the diode triangle
    expect(texts(led).some((x) => x.p.k === 'text' && x.p.text === '220 Ω')).toBe(true);
    const btn = s.items.find((i) => i.target === 'part:btn1')!;
    expect(btn.prims.filter((p) => p.k === 'circle').length).toBe(2); // two contacts
    expect(s.nets.filter((n) => n.kind === 'signal').every((n) => n.drawn === 'wire')).toBe(true);
    for (const w of s.items.filter((i) => i.kind === 'wire')) expect(w.target).toMatch(/^wire:/);
  });

  it('draws a potentiometer with its supply and ground symbols and the wiper from the left', () => {
    const scene = assignPins({ board: esp.id, parts: [{ id: 'pot1', partId: 'potentiometer', position: [0, 0, 60] }], wires: [] }, esp, PARTS).scene;
    const s = sceneToSchematic(scene, esp, PARTS);
    const pot = s.items.find((i) => i.target === 'part:pot1')!;
    expect(pot.prims.some((p) => p.k === 'line' && p.closed && p.fill)).toBe(true); // wiper arrow
    expect(s.items.filter((i) => i.kind === 'power').length).toBe(2);
    expect(s.items.filter((i) => i.kind === 'ground').length).toBe(2);
    expect(s.nets.find((n) => n.kind === 'signal')?.drawn).toBe('wire');
  });

  it('uses net labels instead of crossing wires', () => {
    const scene = templateScene(tpl('weather-station'), esp, PARTS);
    const s = sceneToSchematic(scene, esp, PARTS);
    // Two parts on SDA and SCL: the wires would cross, so the bus is labelled at every pin.
    for (const name of ['SDA', 'SCL']) {
      expect(s.nets.find((n) => n.name === name)?.drawn).toBe('label');
      expect(s.items.filter((i) => i.kind === 'label' && i.net === name).length).toBe(3);
    }
  });

  it('draws the extra parts the rules ask for, dashed and marked as suggested', () => {
    const pico = getBoard('rpi-pico');
    const scene = templateScene(tpl('distance-meter'), pico, PARTS);
    const s = sceneToSchematic(scene, pico, PARTS);
    const sug = s.items.find((i) => i.kind === 'suggested')!;
    expect(sug).toBeTruthy();
    expect(texts(sug).map((x) => (x.p.k === 'text' ? x.p.text : ''))).toEqual(expect.arrayContaining(['Suggested, not in your drawing', '1 kΩ', '2 kΩ']));
    // Every line and box of a suggestion is dashed: it is not in the drawing.
    expect(sug.prims.filter((p) => (p.k === 'line' || p.k === 'rect') && p.stroke === '#C9BEFF').every((p) => (p.k === 'line' || p.k === 'rect') && p.dash)).toBe(true);
    // The suggestion sits below the drawing, never among the parts.
    const rest = s.items.filter((i) => i !== sug).map(itemBox);
    expect(itemBox(sug).y0).toBeGreaterThan(Math.max(...rest.map((b) => b.y1)));
    // The same project on a 5 V Uno needs nothing.
    const uno = getBoard('arduino-uno-r3');
    expect(sceneToSchematic(templateScene(tpl('distance-meter'), uno, PARTS), uno, PARTS).items.some((i) => i.kind === 'suggested')).toBe(false);
  });

  it('suggests I2C pull-ups on the named SDA and SCL nets when no part has them', () => {
    const noPullups = Object.values(PARTS).find((p) => p.bus === 'i2c' && !p.pullupsOnBoard && p.pins.some((x) => x.role === 'i2c_sda'))!;
    const scene = assignPins({ board: esp.id, parts: [{ id: 'x1', partId: noPullups.id, position: [0, 0, 60] }], wires: [] }, esp, PARTS).scene;
    const s = sceneToSchematic(scene, esp, PARTS);
    const sug = s.items.find((i) => i.kind === 'suggested')!;
    const words = texts(sug).map((x) => (x.p.k === 'text' ? x.p.text : ''));
    expect(words.filter((w) => w === '4.7 kΩ').length).toBe(2);
    expect(words).toEqual(expect.arrayContaining(['SDA', 'SCL']));
    // The drawing names those nets too, so the labels can be matched.
    const named = s.items.filter((i) => i.kind !== 'suggested').flatMap((i) => texts(i).map((x) => (x.p.k === 'text' ? x.p.text : '')));
    expect(named).toEqual(expect.arrayContaining(['SDA', 'SCL']));
  });

  it('puts wiring findings on the wire or pin they are about', () => {
    const scene: Scene = {
      board: esp.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 60] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
        { id: 'w2', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
      ],
    };
    const findings = checkWiring(scene, esp, PARTS);
    const s = sceneToSchematic(scene, esp, PARTS, findings);
    expect(s.marks.length).toBeGreaterThan(0);
    expect(s.marks.some((m) => m.targets.includes('wire:w1'))).toBe(true);
    checkLayout(s, scene);
  });
});

describe('schematic SVG', () => {
  it('is a standalone SVG with the design colours inlined', () => {
    const board = getBoard('rpi-pico');
    const scene = templateScene(TEMPLATES.find((x) => x.id === 'distance-meter')!, board, PARTS);
    const s = sceneToSchematic(scene, board, PARTS, checkWiring(scene, board, PARTS));
    const svg = schematicToSvg(s);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('Raspberry Pi Pico');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).not.toMatch(/var\(--/);
    expect(svg).not.toContain('data-target');
    // The in-app view adds click targets and marks the selected one.
    const live = schematicToSvg(s, { interactive: true, hot: (tg) => tg === 'part:sonar1' });
    expect(live).toContain('data-target="part:sonar1" class="hot"');
    expect(live).toContain('data-mark="0"');
  });
});
