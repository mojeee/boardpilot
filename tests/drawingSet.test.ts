import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { TEMPLATES, templateCode, templateScene } from '@shared/templates';
import { checkWiring } from '@shared/wiring';
import { checkCode } from '@shared/codeCheck';
import { buildDrawingSet, paperColor, toPaper, type DrawingSetOptions } from '@shared/drawingSet';
import { sceneToSchematic, schematicToSvg } from '@shared/schematic';
import type { LogEntry } from '@shared/types';

const board = getBoard('esp32-devkitc-30');
const tpl = TEMPLATES.find((x) => x.id === 'weather-station')!;
const built = templateScene(tpl, board, PARTS);
const scene = { ...built, sketch: { name: 'weather_station.ino', text: templateCode(tpl, board, built) } };
const opts: DrawingSetOptions = { paper: 'A3', symbols: 'iec', sheets: ['schematic', 'wiring', 'bom', 'checks', 'code'], project: 'Weather station', drawnBy: 'Mojtaba', date: '2026-09-29', revision: 'B' };
const log: LogEntry[] = [
  { id: 1, t: Date.UTC(2026, 8, 29, 10, 0, 0), type: 'found', text: 'Chip ID 0x60 at 0x76', source: 'measured: i2c_read 0xD0' },
  { id: 2, t: Date.UTC(2026, 8, 29, 10, 0, 1), type: 'info', text: 'Project opened' },
];
const input = { scene, board, parts: PARTS, findings: checkWiring(scene, board, PARTS), codeFindings: checkCode(scene.sketch.text, scene, board, PARTS), log, version: '0.7.0' };

describe('Export PDF: the drawing set', () => {
  it('has the schematic, wiring and pin map, parts list, checks and the code', () => {
    const set = buildDrawingSet(input, opts);
    expect(set.sheets.slice(0, 4)).toEqual(['Schematic', 'Wiring diagram and pin map', 'Bill of materials', 'Checks, power budget and measurements']);
    expect(set.sheets[4]).toMatch(/^Code listing · weather_station\.ino/);
    expect((set.html.match(/class="sheet"/g) ?? []).length).toBe(set.sheets.length);
  });

  it('prints on the chosen paper, landscape, with a title block on every sheet', () => {
    const set = buildDrawingSet(input, opts);
    expect(set.html).toContain('@page { size: A3 landscape; margin: 0; }');
    expect(set.html).toContain('width: 420mm; height: 297mm');
    const n = set.sheets.length;
    for (let i = 1; i <= n; i++) expect(set.html).toContain(`${i} of ${n}`);
    expect(set.html).toContain('Weather station');
    expect(set.html).toContain('Mojtaba');
    expect(set.html).toContain('2026-09-29');
    expect(set.html).toContain('>B<');
    expect(set.html).toContain('BoardPilot 0.7.0');
  });

  it('lists the sources in the notes and the measurements from this session only', () => {
    const set = buildDrawingSet(input, opts);
    expect(set.html).toContain('ESP32 Series Datasheet');
    expect(set.html).toContain('Chip ID 0x60 at 0x76');
    expect(set.html).not.toContain('Project opened');
  });

  it('includes only the sheets asked for', () => {
    const set = buildDrawingSet(input, { ...opts, sheets: ['bom', 'schematic'] });
    expect(set.sheets).toEqual(['Schematic', 'Bill of materials']);
  });

  it('draws resistors as IEC rectangles or ANSI zigzags', () => {
    const led = { board: board.id, parts: [{ id: 'led1', partId: 'led-resistor', position: [0, 0, 0] as [number, number, number] }], wires: [{ id: 'w1', from: { part: 'board', pin: 'D25' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' }] };
    const ansi = sceneToSchematic(led, board, PARTS, [], { symbols: 'ansi' });
    const iec = sceneToSchematic(led, board, PARTS, [], { symbols: 'iec' });
    const rects = (s: typeof ansi) => s.items.flatMap((i) => i.prims).filter((p) => p.k === 'rect' && p.w === 10).length;
    expect(rects(ansi)).toBe(0);
    expect(rects(iec)).toBe(1);
    // the default is unchanged by an IEC call
    expect(rects(sceneToSchematic(led, board, PARTS))).toBe(0);
  });

  it('turns the dark screen drawing into one for white paper', () => {
    expect(paperColor('#12171D')).toBe('#ffffff');
    expect(paperColor('#E9EDF1')).not.toBe('#E9EDF1');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(paperColor('#E9EDF1').slice(i, i + 2), 16));
    expect(r + g + b).toBeLessThan(200); // light text becomes dark
    const svg = toPaper(schematicToSvg(sceneToSchematic(scene, board, PARTS)));
    expect(svg).toContain('width="100%" height="100%"');
    expect(svg).not.toMatch(/fill="#12171D"/i);
  });

  it('splits a long code listing over several sheets', () => {
    const long = { ...scene, sketch: { name: 'big.ino', text: Array.from({ length: 300 }, (_, i) => `// line ${i}`).join('\n') } };
    const set = buildDrawingSet({ ...input, scene: long }, { ...opts, paper: 'A4', sheets: ['code'] });
    expect(set.sheets.length).toBe(3);
    expect(set.sheets[2]).toMatch(/\(3\)$/);
  });
});
