// Display Studio: the font, the panel facts, the renderer, the checks, and the generated sketch.
// The native test builds the real Adafruit GFX library on this computer with the generated drawing
// code and compares every pixel with the app's renderer (skipped when the library or a C++ compiler
// is not installed). Set BP_DISPLAY_COMPILE=1 to also compile the sketches for real boards with
// arduino-cli (slow).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { buildProposal } from '@shared/projectBuilder';
import { FONT_5X7, glyphCode, glyphPixel } from '@shared/displayFont';
import { checkSpec, normalizeSpec, panelOf, rgb565, type DisplaySpec, type PanelInfo } from '@shared/displaySpec';
import { DisplaySim, Framebuffer } from '@shared/displayRender';
import { generateDisplayCode } from '@shared/displayCode';
import { testPatternSpec } from '@shared/displayExamples';
import type { Scene } from '@shared/types';

const panel = (id: string) => {
  const p = panelOf(PARTS[id]);
  if (!p) throw new Error(`${id} is not a pixel display`);
  return p;
};

/** A scene with the display wired by the safe-pin rules on a board. */
function sceneWith(partId: string, boardId: string): Scene {
  const r = buildProposal({ title: 't', summary: '', board: boardId, keepExisting: false, parts: [{ id: 'disp1', partId, label: 'Display', why: '' }], wires: [], links: [] }, { board: boardId, parts: [], wires: [] }, PARTS);
  if (!r.ok) throw new Error(r.errors.join(' '));
  return r.proposal.scene;
}

describe('font and panels', () => {
  it('has 96 glyphs of 5 columns, with the degree sign at 127', () => {
    expect(FONT_5X7.length).toBe(96 * 5);
    expect(glyphCode('°')).toBe(127);
    expect(glyphCode('é')).toBe(63);
    // "A": columns 7E 11 11 11 7E → the top row has pixels in columns 1-3 only.
    expect([0, 1, 2, 3, 4].map((c) => glyphPixel(65, c, 0))).toEqual([false, true, true, true, false]);
  });

  it('reads the panel from the part', () => {
    expect(panel('ssd1306-i2c')).toMatchObject({ widthPx: 128, heightPx: 64, color: 'mono', controller: 'SSD1306' });
    expect(panel('st7789-240')).toMatchObject({ widthPx: 240, heightPx: 240, color: 'rgb565', controller: 'ST7789' });
    expect(panel('gc9a01-round')).toMatchObject({ round: true, controller: 'GC9A01' });
    expect(panelOf(PARTS['lcd1602-i2c'])).toBeNull();
  });
});

describe('renderer', () => {
  const p = panel('st7789-240');
  it('draws Adafruit-style circles symmetric and lines end to end', () => {
    const fb = new Framebuffer(p, 0);
    fb.fillCircle(50, 50, 10, 1);
    for (let d = -10; d <= 10; d++) expect(fb.px[50 * fb.w + 50 + d]).toBe(fb.px[50 * fb.w + 50 - d]);
    expect(fb.px[(50 - 10) * fb.w + 50]).toBe(1);
    fb.line(0, 0, 9, 3, 7);
    expect(fb.px[0]).toBe(7);
    expect(fb.px[3 * fb.w + 9]).toBe(7);
  });

  it('keeps colour panels in RGB565 and mono panels in one bit', () => {
    const spec = normalizeSpec({ screens: [{ id: 'a', background: '#FF8040', elements: [] }] });
    const color = new Framebuffer(p, 0);
    new DisplaySim(spec, p).frame(color, 0);
    expect(color.px[0]).toBe(rgb565([255, 128, 64]));
    const mono = new Framebuffer(panel('ssd1306-i2c'), 0);
    new DisplaySim(spec, panel('ssd1306-i2c')).frame(mono, 0);
    expect(mono.px[0]).toBe(1);
  });

  it('changes screens exactly on time and on conditions', () => {
    const spec = testPatternSpec('disp1', p);
    const sim = new DisplaySim(spec, p);
    sim.advance(2999);
    expect(sim.state.screen).toBe('bars');
    sim.advance(3000);
    expect(sim.state).toEqual({ screen: 'checker', enteredAt: 3000 });
    // Jumping ahead walks every timed step at its own time.
    sim.advance(18_500);
    expect(sim.state).toEqual({ screen: 'dashboard', enteredAt: 18_000 });
  });

  it('finds what goes wrong in a spec', () => {
    const bad = normalizeSpec({
      start: 'nope',
      screens: [{ id: 'a', elements: [{ type: 'text', x: 120, y: 0, text: 'This line is far too long for a small screen', size: 2 }, { type: 'bar', x: 0, y: 0, w: 50, h: 8, value: 'ghost' }] }],
      transitions: [{ from: 'a', to: 'b' }],
    });
    const msgs = checkSpec(bad, panel('ssd1306-i2c')).map((x) => `${x.severity}: ${x.message}`);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('nope'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('ghost'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('“b”'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warning') && m.includes('goes past'))).toBe(true);
    expect(checkSpec(testPatternSpec('disp1', p), p).filter((x) => x.severity === 'error')).toEqual([]);
    expect(checkSpec(testPatternSpec('disp1', panel('ssd1306-i2c')), panel('ssd1306-i2c')).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('normalises loose input: defaults, clamps, one-way pattern speed', () => {
    const s = normalizeSpec({ screens: [{ elements: [{ type: 'pattern', kind: 'checker', speed: -40, size: 0 }, { type: 'unknown' }] }], vars: [{ name: '1st value' }] });
    expect(s.screens[0].id).toBe('screen1');
    expect(s.screens[0].elements).toHaveLength(1);
    expect(s.screens[0].elements[0]).toMatchObject({ speed: 40, size: 1 });
    expect(s.vars[0].name).toBe('_1st_value');
  });
});

describe('generated sketch', () => {
  it('drives an ST7789 on an ESP32 through a RAM frame, on the wired SPI pins', () => {
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const r = generateDisplayCode(testPatternSpec('disp1', panel('st7789-240')), panel('st7789-240'), PARTS['st7789-240'], scene, getBoard('esp32-devkitc-30'));
    expect(r.code).toContain('Adafruit_ST7789 tft(-1, ');
    expect(r.code).toContain('SPI_MODE3');
    expect(r.code).toContain('GFXcanvas16 gfx(240, 240)');
    expect(r.code).toContain('SPI.begin(18, -1, 23)');
    expect(r.notes).toEqual([]);
  });

  it('drives an SSD1306 on an Uno and says when a controller has no generator', () => {
    const scene = sceneWith('ssd1306-i2c', 'arduino-uno-r3');
    const r = generateDisplayCode(testPatternSpec('disp1', panel('ssd1306-i2c')), panel('ssd1306-i2c'), PARTS['ssd1306-i2c'], scene, getBoard('arduino-uno-r3'));
    expect(r.code).toContain('Adafruit_SSD1306 tft(128, 64, &Wire, -1)');
    expect(r.code).toContain('tft.display()');
    const epd = Object.values(PARTS).find((d) => panelOf(d)?.color === 'epaper')!;
    const none = generateDisplayCode(testPatternSpec('disp1', panelOf(epd)!), panelOf(epd)!, epd, scene, getBoard('arduino-uno-r3'));
    expect(none.code).toBe('');
    expect(none.notes[0]).toMatch(/cannot write its code yet/);
  });
});

/* ---------------- native pixel test: the sketch's drawing vs the app's renderer ---------------- */

const GFX = join(homedir(), 'Documents/Arduino/libraries/Adafruit_GFX_Library');
const CXX = ['clang++', 'g++'].find((c) => spawnSync(c, ['--version']).status === 0);
const STUB = join(__dirname, 'native/arduino-stub');

function nativeFrames(spec: DisplaySpec, p: PanelInfo, times: number[]): number[][] {
  const dir = mkdtempSync(join(tmpdir(), 'bp-display-'));
  const board = getBoard('esp32-devkitc-30');
  const { code } = generateDisplayCode(spec, p, PARTS['st7789-240'], { board: board.id, parts: [], wires: [] }, board, { host: true });
  const mono = p.color !== 'rgb565';
  const main = [
    '#include "Arduino.h"',
    code,
    'int main(int argc, char **argv) {',
    '  for (int a = 1; a < argc; a++) {',
    '    unsigned long ms = strtoul(argv[a], 0, 10);',
    '    changeScreens(ms); readValues(ms); drawScreen(ms);',
    `    for (int y = 0; y < gfx.height(); y++) for (int x = 0; x < gfx.width(); x++) printf("%x,", ${mono ? 'gfx.getPixel(x, y) ? 1 : 0' : 'gfx.getBuffer()[y * gfx.width() + x]'});`,
    '    printf("\\n");',
    '  }',
    '}',
  ].join('\n');
  writeFileSync(join(dir, 'main.cpp'), main);
  const exe = join(dir, 'frames');
  execFileSync(CXX!, ['-std=c++17', '-O1', '-w', '-DARDUINO=100', `-I${STUB}`, `-I${GFX}`, join(GFX, 'Adafruit_GFX.cpp'), join(dir, 'main.cpp'), '-o', exe], { stdio: 'pipe' });
  const out = execFileSync(exe, times.map(String), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.trim().split('\n').map((l) => l.split(',').filter(Boolean).map((h) => parseInt(h, 16)));
}

describe.skipIf(!CXX || !existsSync(join(GFX, 'Adafruit_GFX.cpp')))('the sketch draws the same pixels as the preview (Adafruit GFX built natively)', () => {
  // A moment on every test-pattern screen, the dashboard with the blinking warning on and off.
  const times = [0, 1234, 3000, 4567, 6100, 8000, 9100, 11_000, 13_300, 15_900, 18_000, 19_250, 22_222, 24_400, 26_000];
  for (const id of ['st7789-240', 'ssd1306-i2c', 'gc9a01-round', 'st7735-tft-18']) {
    it(`${id}: every pixel of ${times.length} frames`, () => {
      const p = panel(id);
      for (const rotation of [0, 1]) {
        const spec = { ...testPatternSpec('disp1', p), rotation };
        const native = nativeFrames(spec, p, times);
        const sim = new DisplaySim(spec, p);
        times.forEach((ms, i) => {
          const fb = new Framebuffer(p, rotation);
          sim.frame(fb, ms);
          const diff = [...fb.px].findIndex((v, k) => v !== native[i][k]);
          expect(diff, `${id} rotation ${rotation} at ${ms} ms: first different pixel ${diff} (x ${diff % fb.w}, y ${Math.floor(diff / fb.w)})`).toBe(-1);
        });
      }
    }, 120_000);
  }
});

/* ---------------- optional: compile for real boards ---------------- */

describe.skipIf(process.env.BP_DISPLAY_COMPILE !== '1')('compiles for real boards (arduino-cli)', () => {
  const cases: [string, string, string][] = [
    ['st7789-240', 'esp32-devkitc-30', 'esp32:esp32:esp32'],
    ['ssd1306-i2c', 'arduino-uno-r3', 'arduino:avr:uno'],
    ['ili9341-tft-28', 'rpi-pico', 'rp2040:rp2040:rpipico'],
    ['gc9a01-round', 'esp32-s3-devkitc-1', 'esp32:esp32:esp32s3'],
  ];
  for (const [part, boardId, fqbn] of cases) {
    it(`${part} on ${boardId}`, () => {
      const p = panel(part);
      const scene = sceneWith(part, boardId);
      const { code } = generateDisplayCode(testPatternSpec('disp1', p), p, PARTS[part], scene, getBoard(boardId));
      const dir = join(mkdtempSync(join(tmpdir(), 'bp-sketch-')), 'display_test');
      execFileSync('mkdir', ['-p', dir]);
      writeFileSync(join(dir, 'display_test.ino'), code);
      const r = spawnSync('arduino-cli', ['compile', '--fqbn', fqbn, dir], { encoding: 'utf8' });
      expect(r.status, r.stderr.slice(-3000) + r.stdout.slice(-2000)).toBe(0);
    }, 600_000);
  }
});

/* ---------------- the assistant's display tools ---------------- */

describe('assistant tools: get_display and design_display', () => {
  it('gives the panel facts, checks a design and keeps it for the chat card', async () => {
    const { runTool } = await import('../app/main/ai/tools');
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const turn = { highlight: [], calls: [] } as Parameters<typeof runTool>[4];
    const facts = JSON.parse((await runTool('get_display', { part: 'disp1' }, {} as never, [], turn, { scene })).content);
    expect(facts).toMatchObject({ widthPx: 240, heightPx: 240, controller: 'ST7789', codeGenerator: expect.stringMatching(/^yes/) });

    const bad = await runTool('design_display', { title: 'x', part: 'disp1', rotation: 0, vars: [], screens: [{ id: 'a', elements: [{ type: 'bar', x: 0, y: 0, w: 10, h: 5, value: 'ghost' }] }], start: 'a', transitions: [] }, {} as never, [], turn, { scene });
    expect(JSON.parse(bad.content).errors[0]).toMatch(/ghost/);

    const good = await runTool('design_display', { ...testPatternSpec('disp1', panel('st7789-240')) }, {} as never, [], turn, { scene });
    expect(JSON.parse(good.content).errors).toEqual([]);
    expect(turn.display?.spec.screens).toHaveLength(7);

    const missing = await runTool('get_display', { part: 'nope' }, {} as never, [], turn, { scene });
    expect(missing.isError).toBe(true);
    expect(missing.content).toContain('disp1 (ST7789');
  });
});
